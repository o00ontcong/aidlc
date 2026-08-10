/**
 * Step runner + rerun/resume (IMPLEMENT.md §2 step 4) for a registry
 * `Pipeline` run against one Epic. Pure state machine over `PipelineRunStore`
 * (Step 1/4) — never spawns AI itself; the extension opens the terminal and
 * sends the slash command (Step 3), then calls back into this once the agent
 * reports the step done.
 *
 * A pipeline's `steps` array is its own dependency order (no separate
 * `dependsOn` field) — the "current" step is simply the first one not yet
 * `done`.
 */

import type { ActorRef, Pipeline, PipelineRun, PipelineStep, StepRun } from '../contracts';
import { nowIso } from '../contracts';
import { PipelineRunStore } from './PipelineRunStore';

export class StepRunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StepRunnerError';
  }
}

function stepDef(pipeline: Pipeline, stepId: string): PipelineStep {
  const step = pipeline.steps.find((s) => s.id === stepId);
  if (!step) throw new StepRunnerError(`Pipeline "${pipeline.id}" has no step "${stepId}".`);
  return step;
}

function stepRun(run: PipelineRun, stepId: string): StepRun {
  const step = run.steps.find((s) => s.id === stepId);
  if (!step) throw new StepRunnerError(`PipelineRun ${run.epicId}/${run.pipelineId} has no step "${stepId}".`);
  return step;
}

/** First step (in pipeline order) that is not `done` — the only step the runner considers "current". */
export function nextEligibleStep(pipeline: Pipeline, run: PipelineRun): StepRun | null {
  for (const def of pipeline.steps) {
    const step = run.steps.find((s) => s.id === def.id);
    if (step && step.status !== 'done') return step;
  }
  return null;
}

export class StepRunner {
  constructor(private readonly store: PipelineRunStore) {}

  /** Loads the run, creating (and persisting) the initial all-`awaiting-work` projection on first use. */
  ensureStarted(pipeline: Pipeline, epicId: string): PipelineRun {
    return this.store.load(epicId, pipeline.id) ?? this.store.start(pipeline, epicId, nowIso());
  }

  private replaceStep(run: PipelineRun, updated: StepRun): PipelineRun {
    return { ...run, steps: run.steps.map((s) => (s.id === updated.id ? updated : s)) };
  }

  private transition(
    pipeline: Pipeline,
    run: PipelineRun,
    stepId: string,
    to: StepRun['status'],
    actor: ActorRef,
    command: string,
    opts: { feedback?: string; bumpAttempt?: boolean; detail?: string } = {},
  ): PipelineRun {
    const current = stepRun(run, stepId);
    const at = nowIso();
    const updated: StepRun = {
      ...current,
      status: to,
      attempt: opts.bumpAttempt ? current.attempt + 1 : current.attempt,
      feedback: opts.feedback ?? (to === 'awaiting-work' ? current.feedback : undefined),
      startedAt: to === 'running' ? at : current.startedAt,
      finishedAt: to === 'done' || to === 'failed' ? at : current.finishedAt,
    };
    const next: PipelineRun = { ...this.replaceStep(run, updated), revision: run.revision + 1, updatedAt: at };
    this.store.save(next, run.revision);
    this.store.record(run.epicId, run.pipelineId, command, actor, {
      stepId,
      from: current.status,
      to,
      detail: opts.detail ?? opts.feedback,
    }, at);
    return next;
  }

  /**
   * Pipeline steps are strictly sequential.  Keeping this check in the
   * runner (rather than only in the UI) means a command invocation cannot
   * start a downstream step while an earlier review or hard gate is pending.
   */
  private assertCurrentStep(pipeline: Pipeline, run: PipelineRun, stepId: string): void {
    const current = nextEligibleStep(pipeline, run);
    if (!current || current.id !== stepId) {
      throw new StepRunnerError(
        current
          ? `Step "${stepId}" is not eligible; complete "${current.id}" first.`
          : `Pipeline "${pipeline.id}" is already complete.`,
      );
    }
  }

  /** `awaiting-work → running`. Only the current eligible step (or a step already `failed`, for a retry) may run. */
  runStep(pipeline: Pipeline, run: PipelineRun, stepId: string, actor: ActorRef): PipelineRun {
    const step = stepRun(run, stepId);
    this.assertCurrentStep(pipeline, run, stepId);
    if (step.status !== 'awaiting-work' && step.status !== 'failed') {
      throw new StepRunnerError(`Step "${stepId}" is "${step.status}", not runnable.`);
    }
    return this.transition(pipeline, run, stepId, 'running', actor, 'step.run');
  }

  /** The agent reports its work done. Routes to human-review > auto-review > done per the step's flags. */
  completeStep(pipeline: Pipeline, run: PipelineRun, stepId: string, actor: ActorRef): PipelineRun {
    const def = stepDef(pipeline, stepId);
    this.assertCurrentStep(pipeline, run, stepId);
    if (stepRun(run, stepId).status !== 'running') {
      throw new StepRunnerError(`Step "${stepId}" must be running before it can be completed.`);
    }
    const to = def.humanReview ? 'human-review' : def.autoReview ? 'auto-review' : 'done';
    return this.transition(pipeline, run, stepId, to, actor, 'step.complete');
  }

  /** Auto-review passed — advance to human-review (if any) or done. */
  passAutoReview(pipeline: Pipeline, run: PipelineRun, stepId: string, actor: ActorRef): PipelineRun {
    const def = stepDef(pipeline, stepId);
    this.assertCurrentStep(pipeline, run, stepId);
    if (stepRun(run, stepId).status !== 'auto-review') {
      throw new StepRunnerError(`Step "${stepId}" is not awaiting auto-review.`);
    }
    return this.transition(pipeline, run, stepId, def.humanReview ? 'human-review' : 'done', actor, 'step.autoReview.pass');
  }

  /** Auto-review failed — retry the same step (bumps attempt, carries feedback). */
  failAutoReview(pipeline: Pipeline, run: PipelineRun, stepId: string, actor: ActorRef, feedback: string): PipelineRun {
    this.assertCurrentStep(pipeline, run, stepId);
    if (stepRun(run, stepId).status !== 'auto-review') {
      throw new StepRunnerError(`Step "${stepId}" is not awaiting auto-review.`);
    }
    return this.transition(pipeline, run, stepId, 'awaiting-work', actor, 'step.autoReview.fail', { feedback, bumpAttempt: true });
  }

  /** Human approves — step is `done`. Downstream steps are already `awaiting-work` and become the next eligible step. */
  approve(pipeline: Pipeline, run: PipelineRun, stepId: string, actor: ActorRef): PipelineRun {
    this.assertCurrentStep(pipeline, run, stepId);
    if (stepRun(run, stepId).status !== 'human-review') {
      throw new StepRunnerError(`Step "${stepId}" is not awaiting human review.`);
    }
    return this.transition(pipeline, run, stepId, 'done', actor, 'gate.approve');
  }

  /**
   * Human rejects — this step becomes `failed`, then `onReject.rerun` (default:
   * itself) is set back to `awaiting-work` with the feedback attached. Never
   * touches an upstream step that's already `done` (IMPLEMENT.md §2 step 4:
   * "không chạy lại upstream đã approve").
   */
  reject(pipeline: Pipeline, run: PipelineRun, stepId: string, actor: ActorRef, feedback: string): PipelineRun {
    if (!feedback.trim()) throw new StepRunnerError('Reject requires a reason.');
    const def = stepDef(pipeline, stepId);
    this.assertCurrentStep(pipeline, run, stepId);
    if (stepRun(run, stepId).status !== 'human-review') {
      throw new StepRunnerError(`Step "${stepId}" is not awaiting human review.`);
    }
    const failed = this.transition(pipeline, run, stepId, 'failed', actor, 'gate.reject', { detail: feedback });
    const rerunTargetId = def.onReject?.rerun ?? stepId;
    return this.transition(pipeline, failed, rerunTargetId, 'awaiting-work', actor, 'gate.reject.rerun', {
      feedback: def.onReject?.withFeedback === false ? undefined : feedback,
      bumpAttempt: true,
    });
  }

  /**
   * Explicit rerun request (IMPLEMENT.md §2 step 4 `rerunStep`) — same run id,
   * new revision, does not delete any already-written artifact (core never
   * touches the filesystem outside `.aidlc/epics/**`).
   */
  rerunStep(pipeline: Pipeline, run: PipelineRun, stepId: string, actor: ActorRef, feedback?: string): PipelineRun {
    stepDef(pipeline, stepId); // validates the id exists
    return this.transition(pipeline, run, stepId, 'awaiting-work', actor, 'step.rerun', { feedback, bumpAttempt: true });
  }

  /**
   * IMPLEMENT.md §2 step 4 `resume` — recovers from a crash (replays the
   * event log) and reports the checkpoint to continue from. Never creates a
   * new run: this model persists exactly one `PipelineRun` per (epic,
   * pipeline), so "resume" is "what's the next eligible step" after recovery.
   */
  resume(pipeline: Pipeline, epicId: string): { run: PipelineRun; next: StepRun | null } {
    const rebuilt = this.store.rebuild(epicId, pipeline.id) ?? this.ensureStarted(pipeline, epicId);
    return { run: rebuilt, next: nextEligibleStep(pipeline, rebuilt) };
  }
}
