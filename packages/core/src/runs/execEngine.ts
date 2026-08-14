/**
 * aidlc-autopilot: unattended pipeline execution engine.
 *
 * The loop that drives a run to completion by spawning the agent runner for
 * each `awaiting_work` step, marking it done, running auto-review, and
 * auto-advancing — pausing at human-review / rejection / budget ceilings.
 *
 * Ported out of the CLI (`aidlc run exec`) so BOTH the CLI and the VS Code
 * extension can drive a run with their own presentation. All I/O — the claude
 * stream, decorative logging, progress — flows through {@link ExecHooks}, so
 * this module stays pure (no chalk, no console, no process.exit) and unit-
 * testable. The CLI maps the hooks back to its chalk output; the extension
 * maps them to a progress panel.
 */

import { WorkspaceLoader } from '../loader/WorkspaceLoader';
import { RunStateStore } from './RunStateStore';
import {
  markStepDone,
  approveStep,
  submitAutoReviewVerdict,
  PipelineRunError,
} from './PipelineRunner';
import { runAutoReview } from './AutoReviewer';
import { checkBudget } from './budget';
import { mirrorRunStateToEpic } from './EpicScaffold';
import { recordExecutionFailure, type RecordExecutionFailureInput } from './ExecutionFailureLog';
import type { ExecutionFailureRef, RunState } from './RunState';
import { normalizeStep, type PipelineConfig, type AgentConfig } from '../schema/WorkspaceSchema';
import type { RunnerResult } from '../runner/types';
import { pipelineForRun } from './PipelineSnapshot';

type StepExecutionResult =
  | { success: true }
  | { success: false; failure?: ExecutionFailureRef };

const MAX_STREAM_CAPTURE = 64 * 1024;

function appendCapture(current: string, chunk: string): string {
  return current.length >= MAX_STREAM_CAPTURE
    ? current
    : `${current}${chunk}`.slice(0, MAX_STREAM_CAPTURE);
}

/**
 * Best-effort mirror of a just-saved run into its epic's `state.json` (the
 * Epics UI reads that file, not the run state). Never lets a mirroring
 * hiccup (e.g. workspace.yaml transiently invalid) abort real execution —
 * this is a display side-channel, not part of the state machine.
 */
function mirrorEpicBestEffort(root: string, state: RunState): void {
  try {
    mirrorRunStateToEpic(root, state, WorkspaceLoader.load(root).config);
  } catch { /* cosmetic sync only — never fail the run over this */ }
}

/**
 * Why the loop stopped. Callers map this to an exit code (CLI) or a final
 * status message (extension). `completed` / `until` are clean stops; the rest
 * are gates a human must clear.
 */
export type ExecOutcome =
  | { kind: 'completed' }
  | { kind: 'until' }
  | { kind: 'dry_run' }
  | { kind: 'awaiting_review' }
  | { kind: 'rejected' }
  | { kind: 'budget_pause' }
  | { kind: 'error'; failure?: ExecutionFailureRef };

/** Options controlling one exec loop. Mirrors the CLI's `run exec` flags. */
export interface ExecOptions {
  /** Stop after this step index completes; -1 (default) = run to the end. */
  untilIdx?: number;
  /** Auto-approve human_review steps instead of pausing at them. */
  autoApprove?: boolean;
  /** Advance human gates while recording that review is deferred to one delivery bundle. */
  aggregateReview?: boolean;
  /** Revision of the aggregate bundle receiving deferred reviews. */
  reviewBundleRevision?: number;
  /** Override the user message sent to claude (default: context pairs). */
  message?: string;
  /** Preview the current step's prompt without spawning claude, then stop. */
  dryRun?: boolean;
}

/**
 * Presentation callbacks. All optional — a caller implements only what it
 * renders. The engine calls these instead of writing to a console, so the
 * same loop backs the CLI (chalk) and the extension (panel).
 */
export interface ExecHooks {
  /** Live claude stdout stream. */
  onOutput?(chunk: string): void;
  /** Live claude stderr stream. */
  onErrorOutput?(chunk: string): void;
  /** Run reached `completed` — every step approved. */
  onRunCompleted?(): void;
  /** Terminal failure (run failed / disappeared / unexpected step status). */
  onRunFailed?(reason: string): void;
  /** A step is about to execute. */
  onStepStart?(e: {
    stepIdx: number; agent: string; revision: number;
    skills: string[]; model?: string; context?: string;
  }): void;
  /** A step finished `markStepDone` and transitioned. */
  onStepResult?(e: {
    stepIdx: number; agent: string; status: string; costUsd?: number;
  }): void;
  /** The runner exited non-zero, or `markStepDone` rejected the artifacts. */
  onStepFailed?(e: {
    stepIdx: number; agent: string; missing?: string[]; message?: string;
    failure?: ExecutionFailureRef;
  }): void;
  /** Loop paused at a human_review gate. */
  onAwaitingReview?(e: { agent: string; runId: string }): void;
  /** Loop paused because the current step was rejected. */
  onRejected?(e: { agent: string; runId: string }): void;
  /** Auto-review validator is about to run. */
  onAutoReviewStart?(e: { agent: string }): void;
  /** Auto-review verdict landed. */
  onAutoReviewResult?(e: {
    agent: string; decision: 'pass' | 'reject'; reason: string; runId: string;
  }): void;
  /** A human_review step was auto-approved (--auto-approve). */
  onAutoApproved?(e: { agent: string }): void;
  /** A per-step human gate was deferred to the aggregate delivery review. */
  onReviewDeferred?(e: { agent: string; reviewBundleRevision: number }): void;
  /** Budget verdict after a step ran. */
  onBudget?(e: {
    spent: number; limit: number; ok: boolean;
    exceeded?: 'step' | 'total'; onExceed?: string; runId: string;
  }): void;
  /** Stopped at the --until boundary. */
  onUntilStop?(e: { untilIdx: number }): void;
  /** Dry-run: assembled prompt preview (no claude spawned). */
  onDryRunPreview?(e: {
    skills: string; skillText: string; userMessage: string;
    env: Record<string, string>;
  }): void;
}

/** Load the pipeline backing a run, or null if the workspace/pipeline is gone. */
function loadPipelineForRun(root: string, state: RunState): PipelineConfig | null {
  try {
    const ws = WorkspaceLoader.load(root);
    return pipelineForRun(state, ws.config.pipelines.find((p) => p.id === state.pipelineId));
  } catch {
    return null;
  }
}

/**
 * Run the exec loop for `runId` until it completes or hits a gate. Pure over
 * I/O — everything observable goes through `hooks`; the return value is the
 * reason it stopped.
 */
export async function runExecLoop(
  root: string,
  runId: string,
  opts: ExecOptions,
  hooks: ExecHooks = {},
): Promise<ExecOutcome> {
  const untilIdx = opts.untilIdx ?? -1;

  const initialState = RunStateStore.load(root, runId);
  if (!initialState) {
    hooks.onRunFailed?.(`Run "${runId}" not found.`);
    return { kind: 'error' };
  }

  // Cost ceiling resolved once — only the autopilot loop enforces it (manual
  // mark-done is never gated).
  const initialPipeline = loadPipelineForRun(root, initialState);
  if (!initialPipeline) {
    const summary = `Pipeline "${initialState.pipelineId}" not found in workspace.yaml.`;
    const failure = recordExecutionFailure(root, initialState, { code: 'runner.pipeline_missing', summary });
    hooks.onRunFailed?.(summary);
    return { kind: 'error', failure };
  }
  const budget = initialPipeline.budget;

  while (true) {
    // Reload fresh state each iteration so concurrent edits (extension, other
    // CLI) are picked up.
    const state = RunStateStore.load(root, runId);
    if (!state) {
      hooks.onRunFailed?.(`Run "${runId}" disappeared.`);
      return { kind: 'error' };
    }

    if (state.status === 'completed') {
      hooks.onRunCompleted?.();
      return { kind: 'completed' };
    }
    if (state.status === 'failed') {
      hooks.onRunFailed?.('Run failed.');
      return { kind: 'error', failure: state.lastFailure };
    }

    // Stop only after the requested step has passed every configured gate.
    // The old post-run check could return while the target was merely
    // awaiting auto-review, or execute the following step before noticing
    // that the boundary had already been crossed.
    if (untilIdx >= 0 && state.steps[untilIdx]?.status === 'approved') {
      hooks.onUntilStop?.({ untilIdx });
      return { kind: 'until' };
    }

    const step = state.steps[state.currentStepIdx];

    // Auto-review gate: run the step's auto_review_runner validator headlessly.
    if (step.status === 'awaiting_auto_review') {
      const result = await runAutoReviewStep(root, runId, hooks);
      if (!result.success) { return { kind: 'error', failure: result.failure }; }
      continue;
    }

    // Human review — pause unless auto-approving.
    if (step.status === 'awaiting_review') {
      if (opts.aggregateReview) {
        await deferReviewStep(root, state, opts.reviewBundleRevision ?? 1, hooks);
        continue;
      }
      if (opts.autoApprove) {
        await autoApproveStep(root, state, hooks);
        continue;
      }
      hooks.onAwaitingReview?.({ agent: step.agent, runId });
      return { kind: 'awaiting_review' };
    }

    if (step.status === 'rejected') {
      hooks.onRejected?.({ agent: step.agent, runId });
      return { kind: 'rejected' };
    }

    if (step.status !== 'awaiting_work') {
      const summary = `Unexpected step status "${step.status}" — cannot exec.`;
      const failure = recordExecutionFailure(root, state, {
        code: 'runner.invalid_step_status', summary, stepIdx: state.currentStepIdx, agent: step.agent,
      });
      hooks.onRunFailed?.(summary);
      return { kind: 'error', failure };
    }

    // Execute the current step.
    const result = await execStep(root, state, runId, opts, hooks);
    if (!result.success) { return { kind: 'error', failure: result.failure }; }

    // Dry-run previews a single step's prompt and never advances.
    if (opts.dryRun) { return { kind: 'dry_run' }; }

    // Budget guard — sum per-step cost from the just-saved state.
    if (budget) {
      const after = RunStateStore.load(root, runId);
      const stepCosts = after ? after.steps.map((s) => s.costUsd) : [];
      const lastStepCost = after?.steps[state.currentStepIdx]?.costUsd;
      const verdict = checkBudget({ stepCosts, budget, lastStepCost });
      if (!verdict.ok) {
        hooks.onBudget?.({
          spent: verdict.spent, limit: verdict.limit, ok: false,
          exceeded: verdict.exceeded, onExceed: budget.on_exceed, runId,
        });
        if (budget.on_exceed === 'fail') {
          const failed = RunStateStore.load(root, runId) ?? state;
          const failure = recordExecutionFailure(root, failed, {
            code: 'runner.budget_exceeded',
            summary: `Run budget exceeded (${verdict.spent} > ${verdict.limit}).`,
            stepIdx: state.currentStepIdx,
            agent: state.steps[state.currentStepIdx]?.agent,
            retryable: false,
            recoveryCommands: [],
          });
          return { kind: 'error', failure };
        }
        return { kind: 'budget_pause' };
      }
      hooks.onBudget?.({ spent: verdict.spent, limit: budget.max_usd, ok: true, runId });
    }

  }
}

/** Skill text for an agent — concatenated when it declares multiple skills. */
function loadAgentSkills(
  ws: ReturnType<typeof WorkspaceLoader.load>,
  agent: AgentConfig,
  stepSkillIds?: string[],
): string {
  return (stepSkillIds ?? agent.skills).map((id) => ws.skills.load(id)).join('\n\n---\n\n');
}

/** Execute one `awaiting_work` step: spawn the runner, then mark it done. */
async function execStep(
  root: string,
  state: RunState,
  runId: string,
  opts: ExecOptions,
  hooks: ExecHooks,
): Promise<StepExecutionResult> {
  const stepIdx = state.currentStepIdx;
  const stepRec = state.steps[stepIdx];
  const agentId = stepRec.agent;
  const fail = (input: RecordExecutionFailureInput): StepExecutionResult => {
    const latest = RunStateStore.load(root, runId) ?? state;
    const failure = recordExecutionFailure(root, latest, {
      stepIdx,
      agent: agentId,
      ...input,
    });
    hooks.onStepFailed?.({
      stepIdx,
      agent: agentId,
      missing: input.missing,
      message: input.summary,
      failure,
    });
    return { success: false, failure };
  };

  let ws;
  try {
    ws = WorkspaceLoader.load(root);
  } catch (err) {
    return fail({ code: 'runner.workspace_invalid', summary: `Failed to load workspace: ${errMsg(err)}` });
  }

  const pipeline = pipelineForRun(state, ws.config.pipelines.find((p) => p.id === state.pipelineId));
  if (!pipeline) {
    return fail({ code: 'runner.pipeline_missing', summary: `Pipeline "${state.pipelineId}" not found in workspace.yaml.` });
  }

  const agent = ws.config.agents.find((a) => a.id === agentId);
  if (!agent) {
    return fail({ code: 'runner.agent_missing', summary: `Agent "${agentId}" not found in workspace.yaml.` });
  }

  const rawStep = pipeline.steps[stepIdx];
  if (!rawStep) {
    return fail({ code: 'runner.step_missing', summary: `Step ${stepIdx} is missing from pipeline "${state.pipelineId}".` });
  }
  const step = normalizeStep(rawStep);
  const model = step.model ?? agent.model;
  const skills = step.skills ?? agent.skills;

  let skillText: string;
  try {
    skillText = loadAgentSkills(ws, agent, step.skills);
  } catch (err) {
    return fail({ code: 'runner.skill_load_failed', summary: `Failed to load skills for agent "${agentId}": ${errMsg(err)}` });
  }

  const env = ws.envResolver.resolveLayered(ws.config.environment ?? {}, agent.env ?? {});

  // claude --print always needs a non-empty prompt: explicit message → context
  // pairs → agent name fallback.
  const contextStr = Object.entries(state.context).map(([k, v]) => `${k}=${v}`).join(' ');
  const userMessage = opts.message ?? (contextStr || `Execute step: ${agentId}`);

  if (opts.dryRun) {
    hooks.onDryRunPreview?.({
      skills: skills.join(', '),
      skillText,
      userMessage,
      env,
    });
    return { success: true };
  }

  hooks.onStepStart?.({
    stepIdx, agent: agentId, revision: stepRec.revision,
    skills, model, context: userMessage,
  });

  const runner = ws.runners.resolve(agent);
  let stdout = '';
  let stderr = '';
  let result: RunnerResult;
  try {
    result = await runner.run({
      skill: skillText,
      model,
      env,
      args: userMessage ? [userMessage] : [],
      workspaceRoot: root,
      onOutput: (chunk) => {
        stdout = appendCapture(stdout, chunk);
        hooks.onOutput?.(chunk);
      },
      onError: (chunk) => {
        stderr = appendCapture(stderr, chunk);
        hooks.onErrorOutput?.(chunk);
      },
      claude: null,
    });
  } catch (error) {
    return fail({
      summary: `Step "${agentId}" runner threw: ${errMsg(error)}`,
      detail: errMsg(error),
      stdout,
      stderr,
    });
  }

  if (!result.success) {
    return fail({
      summary: `Step "${agentId}" failed${typeof result.exitCode === 'number' ? ` with exit code ${result.exitCode}` : ' (non-zero exit)'}.`,
      detail: result.output,
      stdout: [stdout, result.output].filter(Boolean).join('\n'),
      stderr,
      exitCode: result.exitCode,
    });
  }

  // markStepDone validates produces paths, then transitions.
  let next: RunState;
  try {
    const freshState = RunStateStore.load(root, runId)!;
    // Record cost before the transition so the budget guard can sum it and it
    // survives the reload-each-iteration loop.
    if (typeof result.costUsd === 'number') {
      freshState.steps[stepIdx].costUsd = result.costUsd;
    }
    next = markStepDone({ state: freshState, pipeline, workspaceRoot: root });
  } catch (err) {
    if (err instanceof PipelineRunError && err.missing?.length) {
      return fail({ summary: err.message, missing: err.missing, stdout, stderr });
    }
    return fail({ summary: errMsg(err), stdout, stderr });
  }

  next.lastFailure = undefined;
  next.steps[stepIdx].lastFailureId = undefined;

  RunStateStore.save(root, next);
  mirrorEpicBestEffort(root, next);

  const doneStep = next.steps[stepIdx];
  hooks.onStepResult?.({
    stepIdx, agent: agentId, status: doneStep.status, costUsd: result.costUsd,
  });
  return { success: true };
}

/** Run the auto-review validator for the current step and submit its verdict. */
async function runAutoReviewStep(root: string, runId: string, hooks: ExecHooks): Promise<StepExecutionResult> {
  const state = RunStateStore.load(root, runId);
  if (!state) {
    hooks.onRunFailed?.(`Run "${runId}" disappeared.`);
    return { success: false };
  }
  const step = state.steps[state.currentStepIdx];
  const fail = (input: RecordExecutionFailureInput): StepExecutionResult => {
    const latest = RunStateStore.load(root, runId) ?? state;
    const failure = recordExecutionFailure(root, latest, {
      stepIdx: state.currentStepIdx,
      agent: step.agent,
      ...input,
    });
    hooks.onStepFailed?.({
      stepIdx: state.currentStepIdx,
      agent: step.agent,
      missing: input.missing,
      message: input.summary,
      failure,
    });
    return { success: false, failure };
  };
  const pipeline = loadPipelineForRun(root, state);
  if (!pipeline) {
    return fail({ code: 'runner.pipeline_missing', summary: `Pipeline "${state.pipelineId}" not found in workspace.yaml.` });
  }
  hooks.onAutoReviewStart?.({ agent: step.agent });

  let verdict;
  try {
    verdict = await runAutoReview({ workspaceRoot: root, state, pipeline });
  } catch (err) {
    // Config-level failure (missing/unloadable runner). Validator errors are
    // already converted to a reject verdict inside runAutoReview.
    return fail({ code: 'runner.auto_review_failed', summary: `Auto-review could not run: ${errMsg(err)}` });
  }

  let next: RunState;
  try {
    next = submitAutoReviewVerdict({ state, pipeline, verdict });
  } catch (err) {
    return fail({ code: 'runner.auto_review_transition_failed', summary: errMsg(err) });
  }

  next.lastFailure = undefined;
  next.steps[state.currentStepIdx].lastFailureId = undefined;
  RunStateStore.save(root, next);
  mirrorEpicBestEffort(root, next);
  hooks.onAutoReviewResult?.({
    agent: step.agent, decision: verdict.decision, reason: verdict.reason, runId,
  });
  return { success: true };
}

/** Auto-approve a human_review step (--auto-approve). */
async function autoApproveStep(root: string, state: RunState, hooks: ExecHooks): Promise<void> {
  const ws = WorkspaceLoader.load(root);
  const pipeline = pipelineForRun(state, ws.config.pipelines.find((p) => p.id === state.pipelineId));
  if (!pipeline) throw new Error(`Pipeline "${state.pipelineId}" not found.`);
  const next = approveStep({ state, pipeline });
  RunStateStore.save(root, next);
  mirrorEpicBestEffort(root, next);
  hooks.onAutoApproved?.({ agent: state.steps[state.currentStepIdx].agent });
}

async function deferReviewStep(
  root: string,
  state: RunState,
  reviewBundleRevision: number,
  hooks: ExecHooks,
): Promise<void> {
  const ws = WorkspaceLoader.load(root);
  const pipeline = pipelineForRun(state, ws.config.pipelines.find((p) => p.id === state.pipelineId));
  if (!pipeline) throw new Error(`Pipeline "${state.pipelineId}" not found.`);
  const stepIdx = state.currentStepIdx;
  const next = approveStep({ state, pipeline });
  const approved = next.steps[stepIdx];
  approved.reviewDisposition = 'deferred-to-aggregate';
  approved.reviewBundleRevision = reviewBundleRevision;
  const history = approved.history ?? [];
  const last = history[history.length - 1];
  if (last?.kind === 'approve') {
    history[history.length - 1] = {
      kind: 'aggregate_defer',
      at: last.at,
      revision: last.revision,
      reviewBundleRevision,
    };
  } else {
    history.push({
      kind: 'aggregate_defer',
      at: new Date().toISOString(),
      revision: approved.revision,
      reviewBundleRevision,
    });
  }
  approved.history = history;
  RunStateStore.save(root, next);
  mirrorEpicBestEffort(root, next);
  hooks.onReviewDeferred?.({ agent: state.steps[stepIdx].agent, reviewBundleRevision });
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
