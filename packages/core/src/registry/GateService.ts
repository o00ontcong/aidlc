/**
 * GateService (IMPLEMENT.md §2 step 5) for registry pipelines. A thin,
 * named wrapper over {@link StepRunner} rather than a second state machine —
 * `StepRunner.completeStep` already puts a `humanReview` step into
 * `human-review` (which IS "đưa epic sang waiting-for-user": the epic can't
 * progress past this step until a human decides), and `reject` already
 * requires a non-empty reason. This class exists so the vocabulary in
 * IMPLEMENT.md (`request`/`approve`/`reject`) has a direct home, and so hard
 * gates are double-checked at the call site, not only at parse time.
 *
 * The actual "no mode may bypass a hard gate" guarantee is enforced one
 * layer down, at the schema (`PipelineStepSchema`'s `.refine` in
 * `contracts/registry.ts`): a hard-gated step without `humanReview: true`
 * fails to parse at all, so it can never reach a `Pipeline` a `PipelineStore`
 * would persist or a `StepRunner` would run.
 *
 * "project-sync chỉ chạy sau bằng chứng merge" (project-sync only runs after
 * merge evidence) is satisfied by pipeline *ordering*, not extra machinery:
 * `nextEligibleStep` never lets a later step run before an earlier
 * `merge_default_branch`-gated step is `done` — see `redraw-design.yaml`'s
 * `open-pr → await-merge → project-sync` ordering (IMPLEMENT.md §4).
 */

import { isHardGate, type ActorRef, type GateKind, type GatePreview, type Pipeline, type PipelineRun, type PipelineStep, type StageId } from '../contracts';
import { EpicService } from '../epic';
import { StepRunner, StepRunnerError } from './StepRunner';

export class GateService {
  constructor(private readonly runner: StepRunner, private readonly epics?: EpicService) {}

  /** Durable Epic-level gate request. `EpicService.transition` appends the matching audit event. */
  request(input: {
    epicId: string;
    gate: GateKind;
    preview: GatePreview;
    stageId: StageId;
    actionId?: string;
    actor: ActorRef;
  }) {
    if (!this.epics) throw new StepRunnerError('GateService.request requires an EpicService.');
    const epic = this.epics.require(input.epicId);
    if (epic.status === 'waiting-for-user' && epic.pendingGate?.preview.gate === input.gate) return epic;
    if (epic.status !== 'running') throw new StepRunnerError(`Epic "${epic.id}" must be running before requesting a gate.`);
    return this.epics.transition(epic.id, 'waiting-for-user', {
      actor: input.actor,
      command: 'gate.request',
      detail: `Awaiting user decision for ${input.gate}.`,
      pendingGate: {
        id: `${epic.id}-${input.gate}-${epic.revision + 1}`,
        stageId: input.stageId,
        actionId: input.actionId,
        preview: input.preview,
        requestedAt: new Date().toISOString(),
        requestedBy: input.actor,
      },
    });
  }

  private step(pipeline: Pipeline, stepId: string): PipelineStep {
    const step = pipeline.steps.find((s) => s.id === stepId);
    if (!step) throw new StepRunnerError(`Pipeline "${pipeline.id}" has no step "${stepId}".`);
    return step;
  }

  /** True once the step is sitting in `human-review`, awaiting a decision. */
  isAwaitingDecision(pipeline: Pipeline, run: PipelineRun, stepId: string): boolean {
    void pipeline;
    return run.steps.find((s) => s.id === stepId)?.status === 'human-review';
  }

  /** Whether this step's decision may ever be bypassed by an autonomy/mode setting — always `false` for a hard gate. */
  isBypassable(pipeline: Pipeline, stepId: string): boolean {
    const step = this.step(pipeline, stepId);
    return !(step.gate && isHardGate(step.gate));
  }

  approve(pipeline: Pipeline, run: PipelineRun, stepId: string, actor: Parameters<StepRunner['approve']>[3]): PipelineRun {
    return this.runner.approve(pipeline, run, stepId, actor);
  }

  /** Reject always requires a reason — enforced in `StepRunner.reject`, not re-implemented here. */
  reject(pipeline: Pipeline, run: PipelineRun, stepId: string, actor: Parameters<StepRunner['reject']>[3], reason: string): PipelineRun {
    return this.runner.reject(pipeline, run, stepId, actor, reason);
  }
}
