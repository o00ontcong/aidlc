/**
 * State machine for a pipeline run.
 *
 * Pure functions over {@link RunState}: each transition takes the current
 * state + a pipeline definition and returns the next state. The store
 * persists; nothing here touches the filesystem (except gate-check, which
 * is a read-only `existsSync` against produced artifacts).
 *
 * Phase 1 implements:
 *   - start: scaffold a fresh RunState from a pipeline + context map
 *   - markStepDone: validate the current step's `produces` exist; transition
 *     to awaiting_review (if human_review) or auto-approve + advance
 *   - approve: human accepts current awaiting_review step → advance
 *   - reject: human rejects current awaiting_review step → step rejected
 *     (in-place) OR cascade to an upstream step with intermediate steps
 *     reset to pending
 *   - rerun: user retries a rejected step → revision++, back to awaiting_work
 *
 * Phase 2 will layer in: requires gate-check on advance, hooks (before/after
 * step), automatic worker dispatch.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { PipelineConfig } from '../schema/WorkspaceSchema';
import { normalizeStep, stepDagId } from '../schema/WorkspaceSchema';
import type {
  RunState,
  StepRecord,
  StepStatus,
  AutoReviewVerdict,
  StepHistoryEntry,
  CanvasReviewRecord,
} from './RunState';
import { activeEpicsDir, resolveArtifactPath } from './RunState';
import type { ReviewBundle } from './ArtifactReview';
import { checkBundleCurrent } from './ArtifactReview';
import { snapshotPipeline } from './PipelineSnapshot';
import { resolveEpicUserNote } from '../change/epicUserNote';
import { userNoteCoverageIssues } from '../change/composeRequirementWithUserNote';
import { CofofoFoundationService } from '../cofofo/FoundationService';
import { DiscoverContextPublisher, hasPublishedDiscoverContext, type DiscoverContextRef } from '../discover/DiscoverContextPublisher';
import { persistCofofoBugReportArtifact } from '../cofofo/bugReport';
import { requireAcceptedEvidence } from '../cofofo/EvidenceLedger';
import { ProjectRulesSchema, StackProfileSchema } from '../cofofo/contracts';
import {
  validatePlanRuleReferences,
  validateProjectRules,
} from '../cofofo/RuleEngine';
import { validateStackProfile } from '../cofofo/StackDetector';

export class PipelineRunError extends Error {
  constructor(message: string, public readonly missing?: string[]) {
    super(message);
    this.name = 'PipelineRunError';
  }
}

/**
 * Create a fresh run for the given pipeline + context. Caller persists
 * the result via {@link RunStateStore.save}.
 *
 * Throws if the pipeline has zero steps (caught by Zod, but we double-
 * check so a misconfigured runtime doesn't produce an invalid run).
 */
export function startRun(args: {
  runId: string;
  pipeline: PipelineConfig;
  context: Record<string, string>;
  /** Required for pipelines that pin a CoFoFo foundation. */
  workspaceRoot?: string;
  /** Optional explicit ref supplied by a Discover handoff. The pack on disk remains authoritative. */
  discoverContext?: DiscoverContextRef;
}): RunState {
  const { runId, pipeline, context } = args;
  if (pipeline.steps.length === 0) {
    throw new PipelineRunError(`Pipeline "${pipeline.id}" has no steps`);
  }
  const now = new Date().toISOString();
  let cofofoFoundation;
  let discoverContext: DiscoverContextRef | undefined;
  if (pipeline.foundation) {
    if (!args.workspaceRoot) {
      throw new PipelineRunError(`Pipeline "${pipeline.id}" requires a CoFoFo foundation; startRun needs workspaceRoot.`);
    }
    try {
      cofofoFoundation = new CofofoFoundationService(args.workspaceRoot).requireReady();
    } catch (error) {
      const issues = error instanceof Error && 'issues' in error
        ? (error as Error & { issues?: string[] }).issues
        : undefined;
      throw new PipelineRunError(error instanceof Error ? error.message : String(error), issues);
    }
    if (cofofoFoundation.manifestPath !== pipeline.foundation.manifest) {
      throw new PipelineRunError(
        `Pipeline foundation manifest "${pipeline.foundation.manifest}" does not match the active CoFoFo manifest "${cofofoFoundation.manifestPath}".`,
      );
    }
  }
  if (pipeline.discover_context) {
    if (!args.workspaceRoot) {
      throw new PipelineRunError(`Pipeline "${pipeline.id}" requires Discover Context; startRun needs workspaceRoot.`);
    }
    const packPath = context.context_pack;
    const publisher = new DiscoverContextPublisher(args.workspaceRoot);
    const inspection = publisher.inspect();
    if (!hasPublishedDiscoverContext(inspection)) {
      throw new PipelineRunError(`Pipeline "${pipeline.id}" requires a published Discover Context. ${inspection.nextAction}`, inspection.issues.map((issue) => issue.message));
    }
    if (!packPath) {
      throw new PipelineRunError(`Pipeline "${pipeline.id}" requires a task-specific Discover context pack. Create the task from Discover or import it into a published Discover phase.`);
    }
    const pack = publisher.loadContextPack(packPath);
    if (!pack) {
      throw new PipelineRunError(`Discover context pack "${packPath}" is missing or unsafe.`);
    }
    if (pack.contextRef.contextHash !== inspection.context.contextHash || pack.contextRef.discoverRevision !== inspection.context.discoverRevision) {
      throw new PipelineRunError('Discover context pack is not based on the current published context. Publish or recreate the task slice.');
    }
    if (args.discoverContext && args.discoverContext.packHash !== pack.contextRef.packHash) {
      throw new PipelineRunError('The supplied Discover context ref does not match the task context pack.');
    }
    discoverContext = pack.contextRef;
  }

  // DAG roots: every step without a `depends_on` opens up at start time.
  // Pipelines without any depends_on declarations fall back to the legacy
  // sequential behavior (only step 0 starts) so existing workspace.yamls
  // keep their old semantics.
  const usesDag = pipeline.steps.some((s) => normalizeStep(s).depends_on.length > 0);
  const steps: StepRecord[] = pipeline.steps.map((s, idx) => {
    const norm = normalizeStep(s);
    const isRoot = usesDag ? norm.depends_on.length === 0 : idx === 0;
    return {
      stepIdx: idx,
      agent: norm.agent,
      revision: 1,
      status: isRoot ? 'awaiting_work' : 'pending',
      startedAt: isRoot ? now : undefined,
      artifactsProduced: [],
    };
  });

  // currentStepIdx tracks the UI's primary focus. For DAG runs we point it
  // at the first open step; the UI lets the user switch focus across active
  // steps but every gate operation passes an explicit stepIdx anyway.
  const firstOpen = steps.findIndex((s) => s.status === 'awaiting_work');
  return {
    schemaVersion: 1,
    runId,
    pipelineId: pipeline.id,
    pipelineSnapshot: snapshotPipeline(pipeline, now),
    cofofoFoundation,
    discoverContext,
    context: { ...context },
    startedAt: now,
    updatedAt: now,
    currentStepIdx: firstOpen >= 0 ? firstOpen : 0,
    status: 'running',
    steps,
  };
}

/** Explain why a delivery run can no longer use its pinned foundation. */
export function cofofoFoundationIssues(args: {
  state: RunState;
  pipeline: PipelineConfig;
  workspaceRoot: string;
}): string[] {
  if (!args.pipeline.foundation) return [];
  if (!args.state.cofofoFoundation) return ['run has no pinned CoFoFo foundation snapshot'];
  const inspection = new CofofoFoundationService(args.workspaceRoot).inspect();
  if (inspection.status !== 'ready' || !inspection.snapshot) {
    return inspection.issues.length ? inspection.issues : [`foundation status is ${inspection.status}`];
  }
  const pinned = args.state.cofofoFoundation;
  const issues: string[] = [];
  if (inspection.snapshot.revision !== pinned.revision) issues.push(`foundation revision changed from ${pinned.revision} to ${inspection.snapshot.revision}`);
  if (inspection.snapshot.manifestHash !== pinned.manifestHash) issues.push('foundation manifest content changed');
  if (inspection.snapshot.manifestPath !== pinned.manifestPath) issues.push('foundation manifest path changed');
  return issues;
}

/**
 * Report context drift without silently changing the task. Delivery runs pin
 * `state.discoverContext`; callers surface this as Stale and offer an explicit
 * rebase rather than blocking the pinned run against a moving latest pointer.
 */
export function discoverContextIssues(args: {
  state: RunState;
  pipeline: PipelineConfig;
  workspaceRoot: string;
}): string[] {
  if (!args.pipeline.discover_context) { return []; }
  const pinned = args.state.discoverContext;
  if (!pinned) { return ['run has no pinned Discover context ref']; }
  const inspection = new DiscoverContextPublisher(args.workspaceRoot).inspect();
  if (!inspection.context) {
    return [`Discover Context is ${inspection.status}`];
  }
  if (inspection.context.discoverRevision !== pinned.discoverRevision) {
    return [`Discover revision changed from ${pinned.discoverRevision} to ${inspection.context.discoverRevision}`];
  }
  if (inspection.context.contextHash !== pinned.contextHash) {
    return ['Discover context manifest content changed'];
  }
  return [];
}

function foundationRecovery(issue: string): 'rebase' | 'prepare' {
  // A changed *ready* foundation is recoverable by replaying a delivery run.
  // Missing/invalid Foundation artifacts are not: rebase would immediately
  // throw because there is no trusted context to pin.
  return /foundation (?:revision changed|manifest content changed|manifest path changed)/i.test(issue)
    ? 'rebase'
    : 'prepare';
}

/**
 * Detect legacy runs whose frozen recipe snapshot predates the fix that keeps
 * Canvas/evidence policy during assembly. Such a snapshot is unsafe to resume:
 * it describes a different workflow from the live source pipeline.
 */
export function lostCofofoGateSnapshotIssues(args: {
  state: RunState;
  sourcePipeline?: PipelineConfig;
}): string[] {
  const snapshot = args.state.pipelineSnapshot?.pipeline;
  const source = args.sourcePipeline;
  if (!snapshot || !source) return [];
  if (snapshot.foundation?.mode !== 'cofofo' && source.foundation?.mode !== 'cofofo') return [];

  const snapshotById = new Map(snapshot.steps.map((step) => [stepDagId(step), normalizeStep(step)]));
  const issues: string[] = [];
  for (const sourceStep of source.steps) {
    const id = stepDagId(sourceStep);
    const frozen = snapshotById.get(id);
    if (!frozen) continue;
    const current = normalizeStep(sourceStep);
    if (current.review && !frozen.review) {
      issues.push(`step "${id}" lost its Canvas review gate in this run snapshot`);
    }
    if (current.evidence && !frozen.evidence) {
      issues.push(`step "${id}" lost its ${current.evidence.stage.toUpperCase()} evidence gate in this run snapshot`);
    }
  }
  return issues;
}

/**
 * True when `resolvedPath` is a `produces` path of some step in the pipeline
 * that a human explicitly skipped (a `kind: 'skip'` entry in that step's
 * history). A skipped step never writes its declared artifacts, so any
 * downstream step whose `requires` points at that path would otherwise stay
 * permanently blocked — this lets the gate-checks below treat it as waived
 * instead.
 */
function isWaivedBySkip(
  resolvedPath: string,
  state: RunState,
  pipeline: PipelineConfig,
  epicsDir: string,
): boolean {
  for (let i = 0; i < pipeline.steps.length; i++) {
    const stepConfig = pipeline.steps[i];
    if (!stepConfig) { continue; }
    const producesResolved = normalizeStep(stepConfig).produces.map((p) =>
      resolveArtifactPath(p, state.context, epicsDir),
    );
    if (!producesResolved.includes(resolvedPath)) { continue; }
    if (state.steps[i]?.history?.some((h) => h.kind === 'skip')) { return true; }
  }
  return false;
}

/**
 * Soft gate-check for a step's `requires`. Returns `{ ok: true }` when all
 * required upstream artifacts exist on disk, `{ ok: false, missing: [...] }`
 * otherwise. Used by the extension UI to surface a warning *before* the user
 * starts work on a step (e.g. show a banner / disable the "Mark step done"
 * button) — orthogonal to the hard-block at markStepDone time.
 *
 * Pure read-only — does not mutate state, does not throw.
 */
/** A step recorded as approved whose Canvas gate was never actually closed. */
export interface CanvasApprovalIssue {
  stepIdx: number;
  agent: string;
  reason:
    /** Approved with no verdict record at all — the signature of a direct write. */
    | 'missing-verdict'
    /** A verdict exists but it was not an approval. */
    | 'not-approved';
  detail: string;
}

/**
 * Find approvals that no Canvas gate can account for.
 *
 * `approveStep` refuses Canvas-gated steps, so every legitimate approval of one
 * carries a `canvasReview` record. A step marked `approved` without one was not
 * approved through the runner — it was written into run state directly. That is
 * the shape of the remaining provider-managed bypass: the provider-managed task
 * command tells an agent to treat `human_review: true` as its own approval and
 * continue, and an agent that edits the state file rather than calling the
 * runner leaves exactly this trace.
 *
 * **Pass the run's own pipeline**, from `pipelineForRun` — not the workspace's
 * current one. A step approved legitimately *before* its preset gained a
 * `review` policy carries no `canvasReview` and is not forged; the run's
 * immutable snapshot is what stops that from reading as an issue.
 *
 * Pure and read-only: it reports, callers decide. Detection cannot undo a forged
 * write, but it can stop the run being carried forward on one.
 */
export function auditCanvasApprovals(
  state: RunState,
  pipeline: PipelineConfig,
): CanvasApprovalIssue[] {
  const issues: CanvasApprovalIssue[] = [];

  for (const step of state.steps) {
    if (step.status !== 'approved') { continue; }
    const config = pipeline.steps[step.stepIdx];
    if (!config || !normalizeStep(config).review) { continue; }

    const record = step.canvasReview;
    if (!record) {
      issues.push({
        stepIdx: step.stepIdx,
        agent: step.agent,
        reason: 'missing-verdict',
        detail:
          `step "${step.agent}" is approved but declares a Canvas gate and carries no verdict — `
          + 'it was not approved through the runner',
      });
      continue;
    }
    if (record.verdict !== 'approve') {
      issues.push({
        stepIdx: step.stepIdx,
        agent: step.agent,
        reason: 'not-approved',
        detail: `step "${step.agent}" is approved but its recorded verdict is "${record.verdict}"`,
      });
    }
  }

  return issues;
}

export function canStartStep(args: {
  state: RunState;
  pipeline: PipelineConfig;
  workspaceRoot: string;
  /** Defaults to the current step. */
  stepIdx?: number;
  /** Current source definition, used to reject legacy snapshots that lost gates. */
  sourcePipeline?: PipelineConfig;
}): { ok: true } | { ok: false; missing: string[] } {
  const { state, pipeline, workspaceRoot } = args;
  const idx = args.stepIdx ?? state.currentStepIdx;
  const stepConfig = pipeline.steps[idx];
  if (!stepConfig) {
    return { ok: false, missing: [`(no step at index ${idx})`] };
  }
  const norm = normalizeStep(stepConfig);
  const epicsDir = activeEpicsDir(workspaceRoot);
  const missing: string[] = [];
  for (const issue of lostCofofoGateSnapshotIssues({ state, sourcePipeline: args.sourcePipeline })) {
    missing.push(`(unsafe CoFoFo snapshot) ${issue}; start a new CoFoFo run — this snapshot predates a workflow gate upgrade`);
  }
  for (const issue of cofofoFoundationIssues({ state, pipeline, workspaceRoot })) {
    missing.push(foundationRecovery(issue) === 'rebase'
      ? `(stale CoFoFo foundation) ${issue}; run \`aidlc cofofo rebase ${state.runId}\``
      : `(invalid CoFoFo foundation) ${issue}; run \`aidlc cofofo prepare --route refresh-context\``);
  }
  for (const rel of norm.requires.map((p) => resolveArtifactPath(p, state.context, epicsDir))) {
    const abs = path.isAbsolute(rel) ? rel : path.join(workspaceRoot, rel);
    if (!fs.existsSync(abs) && !isWaivedBySkip(rel, state, pipeline, epicsDir)) { missing.push(rel); }
  }

  // Refuse to build on an approval no gate can account for. A forged write is
  // already on disk by the time we see it and cannot be undone here — but the
  // run must not be carried further on it, which is the part that still matters.
  for (const issue of auditCanvasApprovals(state, pipeline)) {
    missing.push(`(unapproved Canvas gate) ${issue.detail}`);
  }

  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

/**
 * User clicked "Mark step done". Validate the current step's `requires` AND
 * `produces` paths exist relative to workspaceRoot. On success, transition to:
 *
 *   - `awaiting_auto_review` when `auto_review: true`  (validator pending)
 *   - `awaiting_review`      when `human_review: true` and no auto-review
 *   - `approved` + advance   when neither gate is configured
 *
 * Throws PipelineRunError with `missing` populated when artifacts aren't
 * found — caller surfaces this in the UI so the user can fix and retry.
 */
export function markStepDone(args: {
  state: RunState;
  pipeline: PipelineConfig;
  workspaceRoot: string;
  /** Step to mark done. Defaults to `state.currentStepIdx` for back-compat. */
  stepIdx?: number;
  /** Current source definition, used to reject legacy snapshots that lost gates. */
  sourcePipeline?: PipelineConfig;
}): RunState {
  const { state, pipeline, workspaceRoot } = args;
  const idx = args.stepIdx ?? state.currentStepIdx;
  const step = state.steps[idx];
  if (!step) {
    throw new PipelineRunError(`No step at index ${idx}`);
  }
  // Idempotency: a duplicate mark-done for a step already moved past
  // awaiting_work in this revision (CI retry, dashboard double-click, exec
  // reloading state) is a safe no-op — return current state untouched, no
  // double history-append, no double advance. `rejected` needs rerun (which
  // bumps revision) and `pending` is not yet startable, so both still error.
  if (
    step.status === 'awaiting_auto_review' ||
    step.status === 'awaiting_review' ||
    step.status === 'approved'
  ) {
    return clone(state);
  }
  if (step.status !== 'awaiting_work') {
    throw new PipelineRunError(
      `Cannot mark step "${step.agent}" done: status is "${step.status}", expected "awaiting_work"`,
    );
  }

  const stepConfig = pipeline.steps[idx];
  if (!stepConfig) {
    throw new PipelineRunError(`Pipeline mismatch — index ${idx} not in pipeline.steps`);
  }
  const norm = normalizeStep(stepConfig);
  const epicsDir = activeEpicsDir(workspaceRoot);

  const lostGateIssues = lostCofofoGateSnapshotIssues({ state, sourcePipeline: args.sourcePipeline });
  if (lostGateIssues.length) {
    throw new PipelineRunError(
      `Run "${state.runId}" uses an unsafe CoFoFo pipeline snapshot that lost required gates. Start a new run.`,
      lostGateIssues,
    );
  }

  const foundationIssues = cofofoFoundationIssues({ state, pipeline, workspaceRoot });
  if (foundationIssues.length) {
    throw new PipelineRunError(
      `Step "${step.agent}" is blocked because its CoFoFo foundation is stale.`,
      foundationIssues.map((issue) => foundationRecovery(issue) === 'rebase'
        ? `${issue}; run aidlc cofofo rebase ${state.runId}`
        : `${issue}; run aidlc cofofo prepare --route refresh-context`),
    );
  }

  // Hard gate-check on requires (separate from the soft check at start time).
  const resolvedRequires = norm.requires.map((p) => resolveArtifactPath(p, state.context, epicsDir));
  const missingRequires: string[] = [];
  for (const rel of resolvedRequires) {
    const abs = path.isAbsolute(rel) ? rel : path.join(workspaceRoot, rel);
    if (!fs.existsSync(abs) && !isWaivedBySkip(rel, state, pipeline, epicsDir)) { missingRequires.push(rel); }
  }
  if (missingRequires.length > 0) {
    throw new PipelineRunError(
      `Step "${step.agent}" is blocked — required upstream artifacts are missing.`,
      missingRequires,
    );
  }

  // Validate produces — each path resolved with run context, then existsSync.
  const resolvedProduces = norm.produces.map((p) => resolveArtifactPath(p, state.context, epicsDir));
  const missing: string[] = [];
  for (const rel of resolvedProduces) {
    const abs = path.isAbsolute(rel) ? rel : path.join(workspaceRoot, rel);
    if (!fs.existsSync(abs)) { missing.push(rel); }
  }
  if (missing.length > 0) {
    throw new PipelineRunError(
      `Step "${step.agent}" has not produced its expected artifacts.`,
      missing,
    );
  }

  // Content assertions — each marker must appear in at least one produced file.
  // Catches "file exists but empty / missing a required section" without a JS validator.
  if (norm.produces_contains.length > 0) {
    const haystack = resolvedProduces
      .map((rel) => {
        const abs = path.isAbsolute(rel) ? rel : path.join(workspaceRoot, rel);
        try {
          return fs.readFileSync(abs, 'utf8');
        } catch {
          return '';
        }
      })
      .join('\n');
    const missingMarkers = norm.produces_contains.filter((marker) => !haystack.includes(marker));
    if (missingMarkers.length > 0) {
      throw new PipelineRunError(
        `Step "${step.agent}" produced its files but they are missing required content.`,
        missingMarkers,
      );
    }
  }

  const requirementRel = resolvedProduces.find((rel) => /REQUIREMENT\.md$/i.test(rel));
  if (requirementRel) {
    const abs = path.isAbsolute(requirementRel)
      ? requirementRel
      : path.join(workspaceRoot, requirementRel);
    let requirementText = '';
    try {
      requirementText = fs.readFileSync(abs, 'utf8');
    } catch {
      requirementText = '';
    }
    const epicDir = path.join(workspaceRoot, epicsDir, state.runId);
    const userNote = resolveEpicUserNote(epicDir);
    if (userNote) {
      const noteIssues = userNoteCoverageIssues(requirementText, userNote);
      if (noteIssues.length > 0) {
        throw new PipelineRunError(
          `Step "${step.agent}" wrote REQUIREMENT.md but skipped the user's note (USER-NOTE.md / inputs.user_note). Fold every screen, Figma URL, and API instruction from the note into REQUIREMENT.md.`,
          noteIssues,
        );
      }
    }
  }

  if (norm.evidence) {
    try {
      requireAcceptedEvidence(workspaceRoot, state.runId, norm.evidence.stage, state.steps[idx]!.revision);
    } catch (error) {
      throw new PipelineRunError(
        `Step "${step.agent}" is blocked — accepted ${norm.evidence.stage.toUpperCase()} machine evidence is missing or invalid.`,
        [error instanceof Error ? error.message : String(error)],
      );
    }
  }

  const phase = norm.name ?? norm.agent;
  if (
    phase === 'scan-stack'
    || phase === 'define-rules'
    || phase === 'select-ecc-catalog'
    || phase === 'install-ecc-assets'
    || phase === 'publish-context'
  ) {
    try {
      const profile = StackProfileSchema.parse(JSON.parse(
        fs.readFileSync(path.join(workspaceRoot, 'docs/project/foundation/STACK-PROFILE.json'), 'utf8'),
      ));
      const issues = validateStackProfile(workspaceRoot, profile);
      if (issues.length) {
        throw new PipelineRunError(
          'scan-stack is closed; CoFoFo does not guess a bundle.',
          issues,
        );
      }
    } catch (error) {
      if (error instanceof PipelineRunError) throw error;
      throw new PipelineRunError(
        `Step "${step.agent}" could not validate stack detection.`,
        [error instanceof Error ? error.message : String(error)],
      );
    }
  }

  // CoFoFo's process rules are enforced by core rather than trusted to the
  // provider's Markdown. Planning must cite the canonical blocking rules;
  // production/refactor/verify boundaries re-run structural policy; memory is
  // bounded, secret-screened, and remains explicitly unreviewed.
  if (pipeline.foundation?.mode === 'cofofo') {
    try {
      if (phase === 'create-plan') {
        const rules = ProjectRulesSchema.parse(JSON.parse(
          fs.readFileSync(path.join(workspaceRoot, 'docs/project/foundation/PROJECT-RULES.json'), 'utf8'),
        ));
        const planPath = resolvedProduces.find((item) => /TASK-PLAN\.md$/i.test(item)) ?? resolvedProduces[0];
        const plan = planPath
          ? fs.readFileSync(path.isAbsolute(planPath) ? planPath : path.join(workspaceRoot, planPath), 'utf8')
          : '';
        const issues = validatePlanRuleReferences(rules, plan);
        if (issues.length) throw new PipelineRunError('Task plan does not bind its scope to the active project rules.', issues);
      }
      if (phase === 'implement' || phase === 'test') {
        const rules = ProjectRulesSchema.parse(JSON.parse(
          fs.readFileSync(path.join(workspaceRoot, 'docs/project/foundation/PROJECT-RULES.json'), 'utf8'),
        ));
        const profile = StackProfileSchema.parse(JSON.parse(
          fs.readFileSync(path.join(workspaceRoot, 'docs/project/foundation/STACK-PROFILE.json'), 'utf8'),
        ));
        const issues = validateProjectRules({ workspaceRoot, rules, profile })
          .filter((issue) => issue.severity === 'block')
          .map((issue) => `${issue.ruleId} · ${issue.path}: ${issue.message}`);
        if (issues.length) throw new PipelineRunError('Project rules reject the current implementation.', issues);
      }
    } catch (error) {
      if (error instanceof PipelineRunError) throw error;
      throw new PipelineRunError(
        `Step "${step.agent}" could not validate its CoFoFo policy contract.`,
        [error instanceof Error ? error.message : String(error)],
      );
    }
  }

  const next = clone(state);
  const nextStep = next.steps[idx];
  nextStep.artifactsProduced = resolvedProduces;
  // A migrated step stops being "New" as soon as the user submits work for
  // it, even when it still has an auto/human review gate ahead.
  nextStep.isNew = undefined;
  // Clear any prior verdict so the new run gets a fresh one.
  nextStep.autoReviewVerdict = undefined;

  if (norm.auto_review) {
    nextStep.status = 'awaiting_auto_review';
    next.status = 'running';
    return next;
  }

  if (norm.human_review) {
    nextStep.status = 'awaiting_review';
    next.status = 'running';
    return next;
  }

  // Neither gate — auto-approve + advance.
  return advance(next, idx, pipeline);
}

/**
 * User clicked "Skip step" — only allowed when the step config sets
 * `skippable: true` (e.g. `resolve-bugs`, for the "no bugs reported" case).
 * Unlike {@link markStepDone}, this performs NO `produces`/`requires`/
 * content-marker validation: the whole point is to let a human declare
 * "there is no work here" without fabricating a placeholder artifact.
 *
 * The step still advances through the normal `advance()` path (so it ends up
 * `approved`, same as any other completed step) — the only trace of the skip
 * is a `kind: 'skip'` history entry, which downstream `requires` checks
 * recognize via {@link isWaivedBySkip}.
 */
export function skipStep(args: {
  state: RunState;
  pipeline: PipelineConfig;
  /** Step to skip. Defaults to `state.currentStepIdx` for back-compat. */
  stepIdx?: number;
  /** Optional human-supplied reason (e.g. "no bugs reported"). */
  reason?: string;
}): RunState {
  const { state, pipeline, reason } = args;
  const idx = args.stepIdx ?? state.currentStepIdx;
  const step = state.steps[idx];
  if (!step) {
    throw new PipelineRunError(`No step at index ${idx}`);
  }
  // Idempotency: mirrors markStepDone — a duplicate skip for a step already
  // moved past awaiting_work in this revision is a safe no-op.
  if (
    step.status === 'awaiting_auto_review' ||
    step.status === 'awaiting_review' ||
    step.status === 'approved'
  ) {
    return clone(state);
  }
  if (step.status !== 'awaiting_work') {
    throw new PipelineRunError(
      `Cannot skip step "${step.agent}": status is "${step.status}", expected "awaiting_work"`,
    );
  }

  const stepConfig = pipeline.steps[idx];
  if (!stepConfig) {
    throw new PipelineRunError(`Pipeline mismatch — index ${idx} not in pipeline.steps`);
  }
  const norm = normalizeStep(stepConfig);
  if (!norm.skippable) {
    throw new PipelineRunError(`Step "${step.agent}" is not skippable`);
  }

  const next = clone(state);
  const nextStep = next.steps[idx];
  nextStep.artifactsProduced = [];
  nextStep.isNew = undefined;
  nextStep.autoReviewVerdict = undefined;
  nextStep.history = pushHistory(nextStep.history, {
    kind: 'skip',
    at: new Date().toISOString(),
    revision: nextStep.revision,
    reason,
  });

  return advance(next, idx, pipeline);
}

/**
 * Apply an auto-reviewer verdict to the current `awaiting_auto_review` step.
 *
 *   - decision: 'pass' + step has `human_review: true`  → `awaiting_review`
 *   - decision: 'pass' + no human gate                  → approve + advance
 *   - decision: 'reject'                                → `rejected` + reason
 *
 * The verdict is also stored on the step record so the human reviewer (and
 * the rerun flow) can see why the validator failed.
 */
export function submitAutoReviewVerdict(args: {
  state: RunState;
  pipeline: PipelineConfig;
  verdict: AutoReviewVerdict;
  /** Step the verdict applies to. Defaults to `state.currentStepIdx`. */
  stepIdx?: number;
}): RunState {
  const { state, pipeline, verdict } = args;
  const idx = args.stepIdx ?? state.currentStepIdx;
  const step = state.steps[idx];
  if (!step) {
    throw new PipelineRunError(`No step at index ${idx}`);
  }
  if (step.status !== 'awaiting_auto_review') {
    throw new PipelineRunError(
      `Cannot submit auto-review verdict for step "${step.agent}": status is "${step.status}", expected "awaiting_auto_review"`,
    );
  }

  const stepConfig = pipeline.steps[idx];
  if (!stepConfig) {
    throw new PipelineRunError(`Pipeline mismatch — index ${idx} not in pipeline.steps`);
  }
  const norm = normalizeStep(stepConfig);

  const next = clone(state);
  const nextStep = next.steps[idx];
  nextStep.autoReviewVerdict = verdict;
  nextStep.history = pushHistory(nextStep.history, {
    kind: 'auto_review',
    at: verdict.at,
    revision: nextStep.revision,
    decision: verdict.decision,
    reason: verdict.reason,
    runner: verdict.runner,
  });

  if (verdict.decision === 'reject') {
    nextStep.status = 'rejected';
    nextStep.rejectReason = verdict.reason;
    nextStep.history = pushHistory(nextStep.history, {
      kind: 'reject',
      at: verdict.at,
      revision: nextStep.revision,
      reason: verdict.reason,
      sentBackToIdx: idx,
    });
    next.status = 'running';
    return next;
  }

  // pass
  if (norm.human_review) {
    nextStep.status = 'awaiting_review';
    next.status = 'running';
    return next;
  }

  return advance(next, idx, pipeline);
}

/** Human approved the awaiting_review step → advance to next. */
export function approveStep(args: {
  state: RunState;
  pipeline: PipelineConfig;
  /** Step to approve. Defaults to `state.currentStepIdx`. */
  stepIdx?: number;
}): RunState {
  const { state, pipeline } = args;
  const idx = args.stepIdx ?? state.currentStepIdx;
  const step = state.steps[idx];
  if (!step) {
    throw new PipelineRunError(`No step at index ${idx}`);
  }
  if (step.status !== 'awaiting_review') {
    throw new PipelineRunError(
      `Cannot approve step "${step.agent}": status is "${step.status}", expected "awaiting_review"`,
    );
  }
  // Fail-closed chokepoint. Every path that advances a human gate without a
  // content-bound verdict funnels through here — the CLI approve actions, the
  // extension approve command, `--auto-approve` (execEngine's autoApproveStep)
  // and aggregate deferral (execEngine's deferReviewStep). Refusing
  // Canvas-gated steps in this one place closes all of them, so such a gate
  // cannot advance by anything other than {@link applyArtifactReviewVerdict}.
  if (canvasPolicy(pipeline, idx)) {
    throw new PipelineRunError(
      `Cannot plain-approve step "${step.agent}": it declares a Canvas review gate. ` +
        'Use applyArtifactReviewVerdict() — a Canvas gate is closed by a human verdict bound to the ' +
        'reviewed content, not by a generic approval.',
    );
  }
  return advance(clone(state), idx, pipeline);
}

/** The step's Canvas review policy, or `undefined` for a legacy human gate. */
function canvasPolicy(
  pipeline: PipelineConfig,
  idx: number,
): { mode: 'canvas'; artifacts: string[] } | undefined {
  const config = pipeline.steps[idx];
  return config ? normalizeStep(config).review : undefined;
}

/** A human's decision at a Canvas gate, as handed to the runner. */
export interface CanvasVerdict {
  verdict: 'approve' | 'request_changes';
  /** Who decided. Refused when empty — an approval must name its author. */
  reviewer: string;
  /** What to change. Required for `request_changes`. */
  feedback?: string;
  /** Defaults to now. */
  at?: string;
}

/** Read the single phase named by ROOT-CAUSE.md's required Resume From section. */
function resumeFromRootCause(args: {
  workspaceRoot: string;
  bundle: ReviewBundle;
  pipeline: PipelineConfig;
}): number {
  const rootCause = args.bundle.artifacts.find((artifact) => /ROOT-CAUSE\.md$/i.test(artifact.path));
  if (!rootCause) throw new PipelineRunError('Diagnose Canvas gate does not include ROOT-CAUSE.md.');
  const absolute = path.isAbsolute(rootCause.path)
    ? rootCause.path
    : path.join(args.workspaceRoot, rootCause.path);
  let content: string;
  try { content = fs.readFileSync(absolute, 'utf8'); }
  catch { throw new PipelineRunError('ROOT-CAUSE.md cannot be read to validate Resume From.'); }
  const matches = [...content.matchAll(/^##\s+Resume From\s*\n(?:\s*\n)*([^\r\n]+)\s*$/gim)];
  if (matches.length !== 1) {
    throw new PipelineRunError('ROOT-CAUSE.md must contain exactly one non-empty `## Resume From` phase name.');
  }
  const phase = matches[0]![1]!.trim().replace(/^`|`$/g, '');
  const index = args.pipeline.steps.findIndex((step) => stepDagId(step) === phase);
  if (index < 0) {
    throw new PipelineRunError(`ROOT-CAUSE.md names unknown resume phase "${phase}".`);
  }
  return index;
}

/**
 * Apply a human's Canvas verdict — the only way a Canvas-gated step advances.
 *
 * `approve` is deliberately the strict path: the bundle must belong to this
 * exact gate (run, step, step revision) *and* every reviewed file must still
 * hash to what it hashed when it was shown. An approval recorded against
 * drifted content approves something the human never saw, so that throws
 * rather than advancing.
 *
 * `request_changes` is looser on purpose — asking for changes to content that
 * has already moved on is harmless — but it does require feedback, and it
 * delegates to {@link rejectStep} so the reopen and downstream-reset semantics
 * live in exactly one place.
 */
export function applyArtifactReviewVerdict(args: {
  workspaceRoot: string;
  state: RunState;
  pipeline: PipelineConfig;
  /** Step being decided. Defaults to `state.currentStepIdx`. */
  stepIdx?: number;
  /** The bundle that was presented to the human. */
  bundle: ReviewBundle;
  verdict: CanvasVerdict;
}): RunState {
  const { workspaceRoot, state, pipeline, bundle, verdict } = args;
  const idx = args.stepIdx ?? state.currentStepIdx;
  const step = state.steps[idx];
  if (!step) {
    throw new PipelineRunError(`No step at index ${idx}`);
  }

  if (!canvasPolicy(pipeline, idx)) {
    throw new PipelineRunError(
      `Step "${step.agent}" does not declare a Canvas review gate — use approveStep() / rejectStep().`,
    );
  }
  if (step.status !== 'awaiting_review') {
    throw new PipelineRunError(
      `Cannot apply a Canvas verdict to step "${step.agent}": status is "${step.status}", ` +
        'expected "awaiting_review". A verdict that already landed cannot be replayed.',
    );
  }

  const reviewer = verdict.reviewer.trim();
  if (!reviewer) {
    throw new PipelineRunError(
      `Canvas verdict for step "${step.agent}" carries no reviewer identity — an approval must name the human who gave it.`,
    );
  }

  // The bundle has to be the one built for *this* gate. One from another run,
  // another step, or a superseded revision describes content that was reviewed
  // in a different context.
  const mismatches: string[] = [];
  if (bundle.runId !== state.runId) {
    mismatches.push(`run "${bundle.runId}" != "${state.runId}"`);
  }
  if (bundle.stepIdx !== idx) {
    mismatches.push(`step ${bundle.stepIdx} != ${idx}`);
  }
  if (bundle.stepRevision !== step.revision) {
    mismatches.push(`step revision ${bundle.stepRevision} != ${step.revision}`);
  }
  if (mismatches.length > 0) {
    throw new PipelineRunError(
      `Canvas verdict for step "${step.agent}" was issued against a different gate (${mismatches.join('; ')}).`,
    );
  }

  const at = verdict.at ?? new Date().toISOString();
  const record: CanvasReviewRecord = {
    verdict: verdict.verdict,
    reviewer,
    at,
    bundleHash: bundle.bundleHash,
    reviewRevision: bundle.reviewRevision,
  };

  if (verdict.verdict === 'request_changes') {
    const feedback = verdict.feedback?.trim();
    if (!feedback) {
      throw new PipelineRunError(
        `A Canvas "request_changes" verdict for step "${step.agent}" must carry feedback saying what to change.`,
      );
    }
    const next = rejectStep({ state, reason: feedback, pipeline, stepIdx: idx });
    next.steps[idx] = {
      ...next.steps[idx],
      canvasReview: { ...record, feedback },
      history: pushHistory(next.steps[idx].history, {
        kind: 'canvas_verdict',
        at,
        revision: step.revision,
        verdict: 'request_changes',
        reviewer,
        bundleHash: bundle.bundleHash,
      }),
    };
    return next;
  }

  const stale = checkBundleCurrent(workspaceRoot, bundle);
  if (stale.length > 0) {
    throw new PipelineRunError(
      `Canvas approval for step "${step.agent}" is stale — reviewed content changed after it was shown: ` +
        stale.map((s) => `${s.path} (${s.reason})`).join(', '),
      stale.map((s) => s.path),
    );
  }

  let next = advance(clone(state), idx, pipeline);
  next.steps[idx] = {
    ...next.steps[idx],
    canvasReview: record,
    reviewDisposition: 'human-approved',
    history: pushHistory(next.steps[idx].history, {
      kind: 'canvas_verdict',
      at,
      revision: step.revision,
      verdict: 'approve',
      reviewer,
      bundleHash: bundle.bundleHash,
    }),
  };
  if ((normalizeStep(pipeline.steps[idx]!).name ?? step.agent) === 'diagnose') {
    const resumeIdx = resumeFromRootCause({ workspaceRoot, bundle, pipeline });
    // A diagnosis can send work back to a preceding phase. Use the normal
    // reset primitive so revisions, evidence invalidation, and history stay
    // consistent. A current/downstream phase naturally follows the approved
    // diagnosis without skipping any prerequisite work.
    if (resumeIdx < idx) {
      next = requestStepUpdate({
        state: next,
        pipeline,
        stepIdx: resumeIdx,
        feedback: `ROOT-CAUSE.md approved: resume from ${stepDagId(pipeline.steps[resumeIdx]!)}.`,
      });
    }
  }
  return next;
}

/**
 * Human rejected the awaiting_review step.
 *
 * Two modes:
 *   - In-place (default, `targetIdx` omitted or === currentStepIdx): the
 *     current step transitions to `rejected`. The user clicks Rerun to bump
 *     revision and try again on the same step.
 *   - Cascade upstream (`targetIdx < currentStepIdx`): the work needs to go
 *     back to an earlier step (e.g. PRD missing a requirement caught at
 *     review time). The target step is reset to `awaiting_work` with
 *     revision++, intermediate steps + the rejected current step are reset
 *     to `pending` and lose their artifacts/verdicts. The reject reason is
 *     copied into the target step's `feedback` so the user has context when
 *     they redo upstream work. `currentStepIdx` rewinds to the target.
 */
export function rejectStep(args: {
  state: RunState;
  reason?: string;
  targetIdx?: number;
  /** Step being rejected. Defaults to `state.currentStepIdx`. */
  stepIdx?: number;
  /**
   * Pipeline definition. When supplied and the pipeline uses `depends_on`,
   * cascade-reject resets only the *transitive descendants* of the target
   * step (DAG semantics) instead of the contiguous index range — index
   * positions in a DAG don't reflect dependency order.
   */
  pipeline?: PipelineConfig;
}): RunState {
  const { state, reason, targetIdx, pipeline } = args;
  const idx = args.stepIdx ?? state.currentStepIdx;
  const step = state.steps[idx];
  if (!step) {
    throw new PipelineRunError(`No step at index ${idx}`);
  }
  if (step.status !== 'awaiting_review') {
    throw new PipelineRunError(
      `Cannot reject step "${step.agent}": status is "${step.status}", expected "awaiting_review"`,
    );
  }

  const now = new Date().toISOString();
  const isCascade = typeof targetIdx === 'number' && targetIdx >= 0 && targetIdx < idx;
  if (isCascade) {
    const next = clone(state);
    const blame = `Rejected at step ${idx + 1} (${step.agent})${reason ? `: ${reason}` : ''}`;
    const rejectedHistory = pushHistory(next.steps[idx].history, {
      kind: 'reject',
      at: now,
      revision: next.steps[idx].revision,
      reason,
      sentBackToIdx: targetIdx as number,
    });

    // Choose between sequential index-range and DAG transitive-descendants
    // reset based on whether the pipeline declares any depends_on edges.
    const usesDag = pipeline
      ? pipeline.steps.map(normalizeStep).some((s) => s.depends_on.length > 0)
      : false;
    const targetIdxN = targetIdx as number;
    const resetIndices = usesDag && pipeline
      ? collectDagResetSet(pipeline, state, targetIdxN, idx)
      : sequentialRange(targetIdxN, idx);

    for (const i of resetIndices) {
      const s = next.steps[i];
      if (i === targetIdxN) {
        // Target step: bump revision + reset to awaiting_work. Record the
        // cascade-rerun on its own history.
        const newRev = s.revision + 1;
        next.steps[i] = {
          ...s,
          status: 'awaiting_work',
          revision: newRev,
          feedback: blame,
          rejectReason: undefined,
          autoReviewVerdict: undefined,
          canvasReview: undefined,
          reviewDisposition: undefined,
          reviewBundleRevision: undefined,
          artifactsProduced: [],
          finishedAt: undefined,
          startedAt: now,
          history: pushHistory(s.history, {
            kind: 'rerun',
            at: now,
            revision: newRev,
            feedback: blame,
          }),
        };
      } else if (i === idx) {
        // The rejected step keeps its full history + the new reject entry,
        // even though we're about to reset its working fields.
        next.steps[i] = {
          ...s,
          revision: s.revision + 1,
          status: 'pending',
          rejectReason: undefined,
          autoReviewVerdict: undefined,
          canvasReview: undefined,
          reviewDisposition: undefined,
          reviewBundleRevision: undefined,
          artifactsProduced: [],
          startedAt: undefined,
          finishedAt: undefined,
          history: rejectedHistory,
        };
      } else {
        // Intermediate step (target < i < idx). Reset to pending, history
        // preserved as-is — these steps weren't directly involved in this
        // rejection.
        next.steps[i] = {
          ...s,
          revision: s.revision + 1,
          status: 'pending',
          rejectReason: undefined,
          autoReviewVerdict: undefined,
          canvasReview: undefined,
          reviewDisposition: undefined,
          reviewBundleRevision: undefined,
          artifactsProduced: [],
          startedAt: undefined,
          finishedAt: undefined,
        };
      }
    }
    next.currentStepIdx = targetIdx as number;
    next.status = 'running';
    return next;
  }

  const next = clone(state);
  next.steps[idx] = {
    ...step,
    status: 'rejected',
    rejectReason: reason ?? '',
    history: pushHistory(step.history, {
      kind: 'reject',
      at: now,
      revision: step.revision,
      reason,
      sentBackToIdx: idx,
    }),
  };
  next.status = 'running';
  return next;
}

/**
 * User wants to retry a rejected step (presumably after re-reading
 * `feedback`). Resets the step to awaiting_work and bumps revision.
 * Optional `feedback` is stored on the step record so the user can keep
 * track of what they're addressing this time.
 */
export function rerunStep(args: {
  state: RunState;
  feedback?: string;
  /** Step to rerun. Defaults to `state.currentStepIdx`. */
  stepIdx?: number;
}): RunState {
  const { state, feedback } = args;
  const idx = args.stepIdx ?? state.currentStepIdx;
  const step = state.steps[idx];
  if (!step) {
    throw new PipelineRunError(`No step at index ${idx}`);
  }
  if (step.status !== 'rejected') {
    throw new PipelineRunError(
      `Cannot rerun step "${step.agent}": status is "${step.status}", expected "rejected"`,
    );
  }
  const now = new Date().toISOString();
  const next = clone(state);
  const newRev = step.revision + 1;
  const carriedFeedback = feedback ?? step.feedback;
  next.steps[idx] = {
    ...step,
    status: 'awaiting_work',
    revision: newRev,
    feedback: carriedFeedback,
    rejectReason: undefined,
    reviewDisposition: undefined,
    reviewBundleRevision: undefined,
    canvasReview: undefined,
    artifactsProduced: [],
    startedAt: now,
    history: pushHistory(step.history, {
      kind: 'rerun',
      at: now,
      revision: newRev,
      feedback: carriedFeedback,
    }),
  };
  next.status = 'running';
  return next;
}

/**
 * Mandatory CoFoFo rebase: pin the active Foundation and replay every phase.
 * Previous history remains for audit, but no prior artifact approval is
 * treated as current under a new policy revision.
 */
export function rebaseRunToCurrentFoundation(args: {
  state: RunState;
  pipeline: PipelineConfig;
  workspaceRoot: string;
}): RunState {
  if (!args.pipeline.foundation) throw new PipelineRunError(`Pipeline "${args.pipeline.id}" has no CoFoFo foundation gate.`);
  const current = new CofofoFoundationService(args.workspaceRoot).requireReady();
  const previous = args.state.cofofoFoundation ?? {
    revision: 0,
    manifestPath: '(legacy-unbound)',
    manifestHash: `sha256:${'0'.repeat(64)}`,
    capturedAt: args.state.startedAt,
  };
  if (
    current.revision === previous.revision
    && current.manifestHash === previous.manifestHash
  ) {
    return clone(args.state);
  }
  const now = new Date().toISOString();
  const next = clone(args.state);
  const previouslyApprovedSteps = next.steps.filter((step) => step.status === 'approved').map((step) => step.stepIdx);
  next.foundationRebases = [
    ...(next.foundationRebases ?? []),
    { at: now, from: previous, to: current, previouslyApprovedSteps },
  ];
  next.cofofoFoundation = current;
  const usesDag = args.pipeline.steps.some((step) => normalizeStep(step).depends_on.length > 0);
  for (let index = 0; index < next.steps.length; index += 1) {
    const record = next.steps[index]!;
    const root = usesDag ? normalizeStep(args.pipeline.steps[index]!).depends_on.length === 0 : index === 0;
    next.steps[index] = {
      ...record,
      revision: record.revision + 1,
      status: root ? 'awaiting_work' : 'pending',
      startedAt: root ? now : undefined,
      finishedAt: undefined,
      artifactsProduced: [],
      autoReviewVerdict: undefined,
      canvasReview: undefined,
      reviewDisposition: undefined,
      reviewBundleRevision: undefined,
      rejectReason: undefined,
      lastFailureId: undefined,
    };
  }
  next.currentStepIdx = Math.max(0, next.steps.findIndex((step) => step.status === 'awaiting_work'));
  next.status = 'running';
  return next;
}

/**
 * Explicitly rebase a delivery run to the latest READY Discover revision.
 * This is deliberately destructive to completed step approvals in the same
 * way as the legacy Foundation rebase: their evidence was reviewed against a
 * different task context. The old state remains in step history and the
 * append-only `discoverContextRebases` audit trail.
 */
export function rebaseRunToCurrentDiscoverContext(args: {
  state: RunState;
  pipeline: PipelineConfig;
  workspaceRoot: string;
}): RunState {
  if (!args.pipeline.discover_context) {
    throw new PipelineRunError(`Pipeline "${args.pipeline.id}" has no Discover Context gate.`);
  }
  const previous = args.state.discoverContext;
  if (!previous) {
    throw new PipelineRunError('Run has no pinned Discover context ref. Start a new task from Discover.');
  }
  const publisher = new DiscoverContextPublisher(args.workspaceRoot);
  const pack = publisher.createContextPack({
    taskKind: args.pipeline.id === 'cofofo-bugfix' ? 'bugfix' : 'feature',
    phaseId: previous.phaseId,
    bugScopeId: previous.bugScopeId,
  });
  const current = pack.contextRef;
  if (current.packHash === previous.packHash) { return clone(args.state); }
  const now = new Date().toISOString();
  const next = clone(args.state);
  const previouslyApprovedSteps = next.steps.filter((step) => step.status === 'approved').map((step) => step.stepIdx);
  next.discoverContextRebases = [
    ...(next.discoverContextRebases ?? []),
    { at: now, from: previous, to: current, previouslyApprovedSteps },
  ];
  next.discoverContext = current;
  next.context.context_pack = publisher.contextPackPath(current.packHash);
  const usesDag = args.pipeline.steps.some((step) => normalizeStep(step).depends_on.length > 0);
  for (let index = 0; index < next.steps.length; index += 1) {
    const record = next.steps[index]!;
    const root = usesDag ? normalizeStep(args.pipeline.steps[index]!).depends_on.length === 0 : index === 0;
    next.steps[index] = {
      ...record,
      revision: record.revision + 1,
      status: root ? 'awaiting_work' : 'pending',
      startedAt: root ? now : undefined,
      finishedAt: undefined,
      artifactsProduced: [],
      autoReviewVerdict: undefined,
      canvasReview: undefined,
      reviewDisposition: undefined,
      reviewBundleRevision: undefined,
      rejectReason: undefined,
      lastFailureId: undefined,
    };
  }
  next.currentStepIdx = Math.max(0, next.steps.findIndex((step) => step.status === 'awaiting_work'));
  next.status = 'running';
  return next;
}

/** Fields that change what the agent must produce or what Canvas reviews. */
function stepGateFingerprint(step: PipelineConfig['steps'][number]): string {
  const n = normalizeStep(step);
  return JSON.stringify({
    agent: n.agent,
    name: n.name ?? null,
    produces: n.produces,
    produces_contains: n.produces_contains,
    requires: n.requires,
    review: n.review ?? null,
    evidence: n.evidence ?? null,
  });
}

function clearedStepRecord(record: StepRecord, agent: string, now: string, status: StepStatus): StepRecord {
  return {
    ...record,
    agent,
    revision: record.revision + 1,
    status,
    startedAt: status === 'awaiting_work' ? now : undefined,
    finishedAt: undefined,
    artifactsProduced: [],
    autoReviewVerdict: undefined,
    canvasReview: undefined,
    reviewDisposition: undefined,
    reviewBundleRevision: undefined,
    rejectReason: undefined,
    lastFailureId: undefined,
  };
}

/**
 * Refresh an in-flight run onto the live pipeline definition.
 *
 * Snapshots exist so a random preset tweak cannot silently change a run, but
 * a contract change (analyze now gates on REQUIREMENT.md) must take
 * effect when the user re-runs the epic — otherwise they keep gating on
 * the old files forever.
 *
 * Approved steps whose gate fingerprint is unchanged stay approved. The first
 * changed step and everything after it rewind to awaiting_work / pending.
 */
export function rebaseRunPipelineSnapshot(args: {
  state: RunState;
  sourcePipeline: PipelineConfig;
}): RunState {
  if (args.sourcePipeline.id !== args.state.pipelineId) {
    return clone(args.state);
  }
  const nextSnapshot = snapshotPipeline(args.sourcePipeline);
  if (args.state.pipelineSnapshot?.hash === nextSnapshot.hash) {
    return clone(args.state);
  }

  const now = new Date().toISOString();
  const next = clone(args.state);
  const oldSteps = args.state.pipelineSnapshot?.pipeline.steps ?? [];
  const sourceSteps = args.sourcePipeline.steps;

  let firstDirty = sourceSteps.length;
  for (let i = 0; i < sourceSteps.length; i++) {
    const oldStep = oldSteps[i];
    if (!oldStep || stepGateFingerprint(oldStep) !== stepGateFingerprint(sourceSteps[i]!)) {
      firstDirty = i;
      break;
    }
  }

  const usesDag = sourceSteps.some((step) => normalizeStep(step).depends_on.length > 0);
  const dagId = (i: number): string => {
    const n = normalizeStep(sourceSteps[i]!);
    return n.name ?? n.agent;
  };
  const keptApprovedIds = new Set(
    next.steps
      .filter((record) => record.stepIdx < firstDirty && record.status === 'approved')
      .map((record) => dagId(record.stepIdx)),
  );
  const sequentialPredecessorApproved = firstDirty === 0
    || next.steps[firstDirty - 1]?.status === 'approved';

  const records: StepRecord[] = sourceSteps.map((step, idx) => {
    const agent = normalizeStep(step).agent;
    const existing = next.steps[idx];
    if (idx < firstDirty && existing) {
      return { ...existing, stepIdx: idx, agent };
    }
    const deps = normalizeStep(step).depends_on;
    const open = usesDag
      ? deps.every((dep) => keptApprovedIds.has(dep))
      : idx === firstDirty && sequentialPredecessorApproved;
    if (!existing) {
      return {
        stepIdx: idx,
        agent,
        revision: 1,
        status: open ? 'awaiting_work' : 'pending',
        startedAt: open ? now : undefined,
        artifactsProduced: [],
        isNew: true,
      };
    }
    return clearedStepRecord(existing, agent, now, open ? 'awaiting_work' : 'pending');
  });

  next.pipelineSnapshot = nextSnapshot;
  next.steps = records;
  const firstOpen = records.findIndex(
    (step) => step.status === 'awaiting_work' || step.status === 'awaiting_review' || step.status === 'awaiting_auto_review',
  );
  next.currentStepIdx = firstOpen >= 0 ? firstOpen : 0;
  next.status = records.every((step) => step.status === 'approved') ? 'completed' : 'running';
  next.updatedAt = now;
  return next;
}

/**
 * Record a user-submitted bug report on `resolve-bugs` (or any step the
 * caller points at). Unlike reject/rerun, this is the primary input for the
 * phase: the user can file round 1 while the step is `awaiting_work`, and
 * later rounds while it is `awaiting_review`, without going through Reject.
 *
 * Each report is appended to `history` so previously filed bugs stay visible
 * in the UI and in `state.json` for the agent. The latest report is also
 * stored as `feedback`. A report filed during review or after a rejection
 * reopens the step as `awaiting_work` so the agent must produce a fresh
 * `BUG-FIX-LOG.md` before the human can approve.
 */
export function recordBugReport(args: {
  state: RunState;
  report: string;
  /** Step receiving the report. Defaults to `state.currentStepIdx`. */
  stepIdx?: number;
  /** When set with `pipeline`, mirrors the report to BUG-REPORT.md for diagnose. */
  workspaceRoot?: string;
  pipeline?: PipelineConfig;
}): RunState {
  const report = args.report.trim();
  if (!report) {
    throw new PipelineRunError('Bug report is empty');
  }
  const idx = args.stepIdx ?? args.state.currentStepIdx;
  const step = args.state.steps[idx];
  if (!step) {
    throw new PipelineRunError(`No step at index ${idx}`);
  }
  if (
    step.status !== 'awaiting_work'
    && step.status !== 'awaiting_review'
    && step.status !== 'rejected'
  ) {
    throw new PipelineRunError(
      `Cannot record a bug report for step "${step.agent}": status is "${step.status}"`,
    );
  }

  const now = new Date().toISOString();
  const next = clone(args.state);
  const reopen = step.status === 'awaiting_review' || step.status === 'rejected';
  const newRev = step.status === 'rejected' ? step.revision + 1 : step.revision;
  next.steps[idx] = {
    ...step,
    status: reopen ? 'awaiting_work' : step.status,
    revision: newRev,
    feedback: report,
    rejectReason: undefined,
    finishedAt: reopen ? undefined : step.finishedAt,
    startedAt: step.startedAt ?? now,
    history: pushHistory(step.history, {
      kind: 'bug_report',
      at: now,
      revision: newRev,
      report,
    }),
  };
  next.currentStepIdx = idx;
  next.status = 'running';
  if (args.workspaceRoot && args.pipeline) {
    persistCofofoBugReportArtifact({
      workspaceRoot: args.workspaceRoot,
      state: next,
      pipeline: args.pipeline,
      report,
    });
  }
  return next;
}

/**
 * Request an update on a previously-approved step. Triggered by the user
 * outside the awaiting_review flow when requirements change after the step
 * was approved (or after the run already moved past it). Behaves like a
 * cascade reject but is callable from any current state:
 *
 *   - The targeted step rewinds to `awaiting_work` with revision++ and the
 *     supplied feedback carried forward (so the next agent run sees what
 *     changed).
 *   - All steps downstream of the target up to the current step (or end of
 *     pipeline if the run already completed) are reset to `pending`,
 *     losing their artifactsProduced / verdicts. Their history is
 *     preserved — UI can show "previously done, awaiting update".
 *   - currentStepIdx rewinds to the target step.
 *   - The whole run flips to `running` if it was completed.
 *
 * History on the target step records both a `rerun` entry (since revision
 * bumps) for symmetry with the regular rerun flow, so the audit trail
 * answers the question "why did this step get redone?".
 */
export function requestStepUpdate(args: {
  state: RunState;
  pipeline: PipelineConfig;
  stepIdx: number;
  feedback?: string;
}): RunState {
  const { state, pipeline, stepIdx, feedback } = args;
  if (state.status === 'completed' && pipeline.foundation?.mode === 'cofofo') {
    throw new PipelineRunError(
      'Completed CoFoFo delivery runs are immutable. Use “Báo lỗi” to create a clean cofofo-bugfix run with fresh evidence.',
    );
  }
  if (
    !Number.isInteger(stepIdx) ||
    stepIdx < 0 ||
    stepIdx >= state.steps.length
  ) {
    throw new PipelineRunError(`Invalid stepIdx ${stepIdx}`);
  }
  const target = state.steps[stepIdx];
  if (target.status !== 'approved') {
    throw new PipelineRunError(
      `Cannot request update on step "${target.agent}": status is "${target.status}", expected "approved"`,
    );
  }

  const now = new Date().toISOString();
  const next = clone(state);

  const normalized = pipeline.steps.map(normalizeStep);
  const usesDag = normalized.some((s) => s.depends_on.length > 0);
  // For DAG pipelines, walk only transitive descendants. For sequential,
  // fall back to the legacy "everything from stepIdx through upper" range so
  // existing workspace.yamls keep their old semantics.
  const upper = state.status === 'completed'
    ? pipeline.steps.length - 1
    : state.currentStepIdx;
  const indices = usesDag
    ? collectDagResetSet(pipeline, state, stepIdx, upper)
    : sequentialRange(stepIdx, upper);

  for (const i of indices) {
    const s = next.steps[i];
    if (i === stepIdx) {
      const newRev = s.revision + 1;
      next.steps[i] = {
        ...s,
        status: 'awaiting_work',
        revision: newRev,
        feedback: feedback ?? s.feedback,
        rejectReason: undefined,
        autoReviewVerdict: undefined,
        canvasReview: undefined,
        reviewDisposition: undefined,
        reviewBundleRevision: undefined,
        artifactsProduced: [],
        finishedAt: undefined,
        startedAt: now,
        history: pushHistory(s.history, {
          kind: 'rerun',
          at: now,
          revision: newRev,
          feedback: feedback ?? s.feedback,
        }),
      };
    } else {
      // Downstream step — reset to pending, KEEP history so the UI can
      // distinguish "previously done, awaiting update" from "never reached".
      next.steps[i] = {
        ...s,
        revision: s.revision + 1,
        status: 'pending',
        rejectReason: undefined,
        autoReviewVerdict: undefined,
        canvasReview: undefined,
        reviewDisposition: undefined,
        reviewBundleRevision: undefined,
        artifactsProduced: [],
        startedAt: undefined,
        finishedAt: undefined,
      };
    }
  }
  next.currentStepIdx = stepIdx;
  next.status = 'running';
  return next;
}

/**
 * Mark the given step approved, then open every now-unblocked dependent
 * step.
 *
 * For pipelines that don't use `depends_on`, this preserves the legacy
 * sequential behavior: approving step N opens step N+1. For DAG pipelines,
 * approving a step unblocks every pending step whose `depends_on` agents
 * are all approved — multiple may open at once.
 *
 * The run transitions to `completed` only when every step is approved.
 */
function advance(next: RunState, idx: number, pipeline: PipelineConfig): RunState {
  const finishedAt = new Date().toISOString();
  const approved = next.steps[idx];
  next.steps[idx] = {
    ...approved,
    isNew: undefined,
    status: 'approved',
    finishedAt,
    history: pushHistory(approved.history, {
      kind: 'approve',
      at: finishedAt,
      revision: approved.revision,
    }),
  };

  const normalized = pipeline.steps.map(normalizeStep);
  const usesDag = normalized.some((s) => s.depends_on.length > 0);

  if (!usesDag) {
    // Legacy sequential pipeline: open the immediately-following step.
    const nextIdx = idx + 1;
    if (nextIdx >= pipeline.steps.length) {
      next.status = 'completed';
      return next;
    }
    next.currentStepIdx = nextIdx;
    next.steps[nextIdx] = {
      ...next.steps[nextIdx],
      status: 'awaiting_work',
      startedAt: finishedAt,
    };
    next.status = 'running';
    return next;
  }

  // DAG: open every pending step whose deps are now all approved.
  // Match deps against the step's `name` (phase id) when present and fall
  // back to `agent` (persona id) — this lets multiple steps sharing a
  // persona stay distinct in the dependency graph (e.g. `test-plan` ⤴
  // from `plan`, `test-cases` ⤴ from `test-plan`, both backed by the
  // `aidlc-qa` persona).
  const dagId = (i: number): string => normalized[i].name ?? normalized[i].agent;
  const approvedDagIds = new Set(
    next.steps
      .filter((s) => s.status === 'approved')
      .map((s) => dagId(s.stepIdx)),
  );
  let openedAny = false;
  for (let i = 0; i < normalized.length; i++) {
    const sStep = next.steps[i];
    if (sStep.status !== 'pending') { continue; }
    const deps = normalized[i].depends_on;
    if (deps.length === 0) { continue; }
    const ready = deps.every((dep) => approvedDagIds.has(dep));
    if (!ready) { continue; }
    next.steps[i] = {
      ...sStep,
      status: 'awaiting_work',
      startedAt: finishedAt,
    };
    openedAny = true;
    if (next.currentStepIdx === idx) { next.currentStepIdx = i; }
  }

  const allApproved = next.steps.every((s) => s.status === 'approved');
  if (allApproved) {
    next.status = 'completed';
    return next;
  }

  // If we didn't open any new step but other steps are still active
  // elsewhere (e.g. a parallel sibling), the run keeps running. Focus the
  // primary cursor on the first remaining active step so the UI surfaces
  // something actionable.
  if (!openedAny) {
    const stillActive = next.steps.findIndex(
      (s) => s.status === 'awaiting_work' || s.status === 'awaiting_auto_review' || s.status === 'awaiting_review',
    );
    if (stillActive >= 0) { next.currentStepIdx = stillActive; }
  }
  next.status = 'running';
  return next;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Inclusive numeric range `[from, to]`. Returns [] when `from > to`. */
function sequentialRange(from: number, to: number): number[] {
  if (from > to) { return []; }
  const out: number[] = [];
  for (let i = from; i <= to; i++) { out.push(i); }
  return out;
}

/**
 * Compute the set of step indices to reset on a DAG cascade rewind.
 *
 * Includes the target step itself and every step that transitively depends
 * (via `depends_on`) on the target — those need to be redone once the
 * target's output changes. The rejected step (`fromIdx`, if different from
 * target) is always included so its state is cleared too. Indices are
 * returned in ascending order so the caller can iterate left-to-right.
 */
function collectDagResetSet(
  pipeline: PipelineConfig,
  state: RunState,
  targetIdx: number,
  fromIdx: number,
): number[] {
  const normalized = pipeline.steps.map(normalizeStep);
  // Match deps by step `name` (phase id) when available; persona-id
  // (`agent`) is the fallback for legacy pipelines where steps didn't
  // carry a separate name.
  const idxByDagId = new Map<string, number>();
  normalized.forEach((s, i) => { idxByDagId.set(s.name ?? s.agent, i); });

  const toReset = new Set<number>([targetIdx, fromIdx]);
  // Iteratively expand: a step is in the reset set if any of its deps is in
  // the set. Loop until fixed point — at most O(steps²) which is fine for
  // typical workflows (<20 steps).
  let changed = true;
  while (changed) {
    changed = false;
    normalized.forEach((s, i) => {
      if (toReset.has(i)) { return; }
      // Only consider steps that actually ran; pending ones don't need reset.
      if (state.steps[i]?.status === 'pending') { return; }
      const depsHit = s.depends_on.some((dep) => {
        const di = idxByDagId.get(dep);
        return di !== undefined && toReset.has(di);
      });
      if (depsHit) { toReset.add(i); changed = true; }
    });
  }
  return Array.from(toReset).sort((a, b) => a - b);
}

function pushHistory(
  existing: StepHistoryEntry[] | undefined,
  entry: StepHistoryEntry,
): StepHistoryEntry[] {
  return existing ? [...existing, entry] : [entry];
}
