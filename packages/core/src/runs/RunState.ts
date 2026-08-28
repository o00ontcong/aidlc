/**
 * Persistent state for an in-flight pipeline run.
 *
 * One run = one execution of one pipeline against one "subject" (typically an
 * epic key like `EPIC-2100`, but the runner is agnostic — `runId` is just a
 * filesystem-safe identifier). State files live at
 * `<workspace>/.aidlc/runs/<runId>.json` and act as the single source of
 * truth for what step the user is on, which steps passed/failed, and what
 * feedback the human supplied on rejected steps.
 *
 * The state machine is intentionally simple in phase 1:
 *
 *   awaiting_work  → user runs the slash command externally, comes back to
 *                    "Mark step done"
 *   awaiting_review → step produced its artifacts; pause for human approve
 *                     / reject
 *   approved       → step passed; runner advances currentStepIdx
 *   rejected       → step rejected by human; user can rerun (revision++)
 *
 * Phase 2 will add: gate-check on `requires` paths, hooks (before/after
 * step), reject-to-upstream cascade, automatic worker dispatch via the
 * runner registry.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { WORKSPACE_DIR, WORKSPACE_FILENAME } from '../loader/WorkspaceLoader';

export type StepStatus =
  | 'pending'                // not yet reached
  | 'awaiting_work'          // current step, user is doing the work externally
  | 'awaiting_auto_review'   // produces validated, auto-reviewer pending (auto_review=true)
  | 'awaiting_review'        // auto-review passed (or skipped), paused for human approve/reject
  | 'approved'               // human approved (or auto-approved when human_review=false)
  | 'rejected';              // human or auto-reviewer rejected; can rerun

export type RunStatus =
  | 'running'           // a step is awaiting_work or awaiting_review
  | 'completed'         // all steps approved
  | 'failed';           // produces validation failed and not recoverable

export interface StepRecord {
  /** Index into pipeline.steps[]. */
  stepIdx: number;
  /** Agent id for this step (resolved from pipeline.steps[stepIdx]). */
  agent: string;
  /** Bumps each time the user reruns this step after a rejection. Starts at 1. */
  revision: number;
  status: StepStatus;
  /**
   * Set when this step was introduced while migrating an existing run to a
   * newer pipeline definition. The runner still uses the normal pending /
   * awaiting_work states; this flag lets clients present the step as "New"
   * until work on it is submitted.
   */
  isNew?: boolean;
  /** ISO timestamp when this step first transitioned to awaiting_work. */
  startedAt?: string;
  /** ISO timestamp when this step transitioned to approved. */
  finishedAt?: string;
  /**
   * Resolved produces paths (placeholders substituted from run context).
   * Filled in when the step transitions to awaiting_review or approved.
   */
  artifactsProduced: string[];
  /**
   * LLM cost (USD) of the most recent runner execution for this step, when the
   * runner reported it. Summed across steps by the `run exec` budget guard.
   */
  costUsd?: number;
  /** Optional human feedback supplied at rerun time. Carried forward. */
  feedback?: string;
  /** Reason supplied with the most recent rejection. Cleared on rerun. */
  rejectReason?: string;
  /**
   * Verdict from the most recent auto-reviewer run for this step. Persists
   * across the human gate so the human reviewer can see what the validator
   * said. Cleared on rerun.
   */
  autoReviewVerdict?: AutoReviewVerdict;
  /**
   * Append-only timeline of significant state transitions for this step.
   * Survives reruns (each rerun adds an entry) so the user can review what
   * happened, when, why — even after the run completes. Optional for
   * backward compat with state files written before this field existed.
   */
  history?: StepHistoryEntry[];
  /** How a configured human gate was disposed. Omitted for legacy states. */
  /**
   * Outcome of this step's Canvas gate, when its config declares `review`.
   * Bound to the content the human actually saw — written only by
   * `applyArtifactReviewVerdict`.
   */
  canvasReview?: CanvasReviewRecord;
  reviewDisposition?: 'human-approved' | 'deferred-to-aggregate';
  /** Aggregate review bundle revision that owns the deferred decision. */
  reviewBundleRevision?: number;
  /** Most recent retryable execution failure for this step, if unresolved. */
  lastFailureId?: string;
}

/** Durable, redacted pointer to one append-only execution failure log. */
export interface ExecutionFailureRef {
  id: string;
  at: string;
  code: string;
  summary: string;
  logPath: string;
  retryable: boolean;
  recoveryCommands: string[];
  stepIdx?: number;
  agent?: string;
}

/**
 * One entry in a step's append-only history. The discriminated `kind` tells
 * the UI which fields to expect; `at` and `revision` are always present.
 */
export type StepHistoryEntry =
  | {
      kind: 'reject';
      at: string;
      revision: number;
      /** Reason supplied by the human (free-form, optional). */
      reason?: string;
      /**
       * Step index the rejection sent the work back to. Equals the rejected
       * step's idx for an in-place rerun; lower idx for a cascade.
       */
      sentBackToIdx: number;
    }
  | {
      kind: 'rerun';
      at: string;
      /** Revision the step is now on after the rerun bump. */
      revision: number;
      /** Optional feedback the user kept on the step at rerun time. */
      feedback?: string;
    }
  | {
      /** User-submitted bug report for the `resolve-bugs` phase. */
      kind: 'bug_report';
      at: string;
      revision: number;
      /** Free-form report (current / expected / reproduction). */
      report: string;
    }
  | {
      kind: 'auto_review';
      at: string;
      revision: number;
      decision: 'pass' | 'reject';
      reason: string;
      runner: string;
    }
  | {
      kind: 'approve';
      at: string;
      revision: number;
    }
  | {
      /**
       * A human skipped this step from `awaiting_work` instead of producing
       * its artifacts (only allowed when the step config sets `skippable`).
       * The step still advances via the normal approve path right after this
       * entry is recorded — see `skipStep` in PipelineRunner.
       */
      kind: 'skip';
      at: string;
      revision: number;
      /** Optional human-supplied reason (e.g. "no bugs reported"). */
      reason?: string;
    }
  | {
      /**
       * A human closed (or reopened) a Canvas gate. Recorded alongside the
       * ordinary `approve`/`reject` entry that carried out the transition, so
       * the audit trail shows both *what* moved and *what content* was signed
       * off on.
       */
      kind: 'canvas_verdict';
      at: string;
      revision: number;
      verdict: 'approve' | 'request_changes';
      reviewer: string;
      /** Content digest the verdict was bound to. */
      bundleHash: string;
    }
  | {
      /** Human review was intentionally deferred to a delivery-level bundle. */
      kind: 'aggregate_defer';
      at: string;
      revision: number;
      reviewBundleRevision: number;
    }
  | {
      /**
       * A round of the /annotate-artifact review loop that edited the .md.
       * Sourced from the artifacts folder's `.annotation-history.json` and
       * merged into the owning step's history at read time (never written to
       * the run-state machine).
       */
      kind: 'annotate';
      at: string;
      revision: number;
      /** Who made the edit — git user (name <email>) or hostname fallback. */
      author?: string;
      /** The human's annotation note(s) for this round. */
      note?: string;
      /** What the agent changed in the .md in response. */
      summary?: string;
    };

/**
 * A human's decision at a Canvas gate, bound to the content they reviewed.
 *
 * `bundleHash` is what makes the record meaningful: it pins the verdict to the
 * exact bytes that were on screen, so an artifact edited after approval is
 * detectable rather than silently carried forward. `reviewRevision` separates
 * successive rounds on the same step revision — each `request_changes` opens
 * the next one.
 *
 * Note on the reviewer field: core can require that a verdict *carries* an
 * identity and refuse an empty one, but it cannot by itself prove the identity
 * belongs to a human. That guarantee comes from the review transport, not from
 * this record.
 */
export interface CanvasReviewRecord {
  verdict: 'approve' | 'request_changes';
  /** Who decided — git identity or equivalent. Never empty. */
  reviewer: string;
  at: string;
  /** `bundleHash` of the bundle this verdict was issued against. */
  bundleHash: string;
  /** Which review round on the step's current revision. */
  reviewRevision: number;
  /** What to change. Required for `request_changes`. */
  feedback?: string;
}

/**
 * Outcome of an auto-reviewer (validator script) run for a step. Produced
 * by the AutoReviewer module and applied to RunState via
 * `submitAutoReviewVerdict`.
 */
export interface AutoReviewVerdict {
  decision: 'pass' | 'reject';
  /** Human-readable rationale (failed checks, summary, etc.). */
  reason: string;
  /** ISO timestamp the verdict was produced. */
  at: string;
  /** Identifier of the runner that produced the verdict — usually the resolved script path. */
  runner: string;
}

export interface RunState {
  schemaVersion: 1;
  /** Unique within the workspace; used as the .json filename. */
  runId: string;
  /** Pipeline id this run is executing. Must exist in workspace.yaml. */
  pipelineId: string;
  /**
   * Immutable copy of the pipeline used by this run, so a preset upgrade
   * cannot change an in-flight run's steps.
   * Optional because state files written by earlier versions remain valid.
   */
  pipelineSnapshot?: import('./PipelineSnapshot').PipelineSnapshot;
  /**
   * Free-form context map used for placeholder substitution in artifact
   * paths. Convention: `epic` → epic key, but any key can be used.
   */
  context: Record<string, string>;
  startedAt: string;
  updatedAt: string;
  /** Index of the step currently being worked / reviewed / rejected. */
  currentStepIdx: number;
  status: RunStatus;
  /** One entry per pipeline step, length === pipeline.steps.length. */
  steps: StepRecord[];
  /** Unresolved failure. Cleared after the same step succeeds on resume. */
  lastFailure?: ExecutionFailureRef;
  /** Append-only failure references retained after recovery for audit. */
  failureHistory?: ExecutionFailureRef[];
}

/**
 * Substitute `{key}` placeholders in an artifact path with values from the
 * run's context map. Unknown placeholders are left intact so the missing
 * key shows up in the produces validation error rather than silently
 * resolving to empty string.
 */
export function resolvePath(template: string, context: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_-]+)\}/g, (match, key) => {
    const value = context[key];
    return typeof value === 'string' && value.length > 0 ? value : match;
  });
}

/** The conventional epics root every built-in phase's `produces`/`requires` bakes in. */
export const DEFAULT_EPICS_DIR = 'docs/epics';

/**
 * Built-in phases (`presets/builtinWorkflows.ts`) bake the conventional
 * `docs/epics` prefix into their `produces`/`requires` templates and into the
 * agent's write instructions. A workspace can point its active epics
 * directory (`state.root`) elsewhere via the `aidlc.workspace.epicsDirectory`
 * setting — when it does, that baked prefix no longer matches where
 * `EpicScaffold.epicsRoot` actually scaffolds the epic, so both the agent's
 * instructions and the gate-check must be rewritten to the active directory
 * instead of trusting the literal template.
 */
export function rewriteEpicsRootPrefix(template: string, epicsDir: string): string {
  if (!epicsDir || epicsDir === DEFAULT_EPICS_DIR) { return template; }
  if (template === DEFAULT_EPICS_DIR) { return epicsDir; }
  if (template.startsWith(`${DEFAULT_EPICS_DIR}/`)) {
    return epicsDir + template.slice(DEFAULT_EPICS_DIR.length);
  }
  return template;
}

/**
 * Combines {@link rewriteEpicsRootPrefix} + {@link resolvePath}: rewrite a
 * `produces`/`requires` template to the workspace's active epics directory,
 * then substitute `{key}` placeholders from the run context. Use this
 * instead of calling `resolvePath` directly on a step's `produces`/`requires`
 * — plain `resolvePath` doesn't know about the active epics directory and
 * will resolve against whatever root happens to be baked in the template.
 */
export function resolveArtifactPath(
  template: string,
  context: Record<string, string>,
  epicsDir: string = DEFAULT_EPICS_DIR,
): string {
  return resolvePath(rewriteEpicsRootPrefix(template, epicsDir), context);
}

/**
 * Active `state.root` for a workspace, read directly (not via
 * `WorkspaceLoader`, which throws on any schema problem unrelated to this one
 * field) so a produces/requires gate-check never fails for reasons unrelated
 * to the epics directory itself.
 */
export function activeEpicsDir(workspaceRoot: string): string {
  try {
    const raw = fs.readFileSync(path.join(workspaceRoot, WORKSPACE_DIR, WORKSPACE_FILENAME), 'utf8');
    const doc = yaml.load(raw) as { state?: { root?: unknown } } | null | undefined;
    const root = doc?.state?.root;
    return typeof root === 'string' && root.trim() ? root : DEFAULT_EPICS_DIR;
  } catch {
    return DEFAULT_EPICS_DIR;
  }
}
