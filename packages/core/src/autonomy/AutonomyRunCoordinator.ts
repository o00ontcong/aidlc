import {
  type Epic,
  type EpicId,
  type GateDecision,
  nowIso,
  parseGateDecision,
  type PendingGate,
  type StageId,
} from '../contracts';
import { EpicRevisionConflictError, EpicService } from '../epic';
import {
  AutonomyController,
  type GateEvaluation,
  type GateSubject,
  planRecovery,
  type RecoveryPlan,
} from './AutonomyController';

/** A stage/action boundary used by the core coordinator, independent of a UI. */
export interface GuardedActionInput {
  epicId: EpicId | string;
  stageId: StageId;
  actionId?: string;
  subject: GateSubject;
  expectedRevision?: number;
}

export interface GuardedActionResult {
  epic: Epic;
  evaluation: GateEvaluation;
  status: 'proceed' | 'waiting-for-approval';
  pendingGate?: PendingGate;
}

export interface ApprovalResult {
  epic: Epic;
  status: 'approved' | 'rejected' | 'pending';
}

/**
 * Connects pure safety evaluation to the one durable Epic state machine.
 * It deliberately does not mutate nested Action statuses: the workflow
 * execution engine owns those projections. This coordinator does persist the
 * user-visible wait/block/recovery lifecycle and matching audit events.
 */
export class AutonomyRunCoordinator {
  constructor(
    private readonly epics: EpicService,
    private readonly controller: AutonomyController = new AutonomyController(),
  ) {}

  guard(input: GuardedActionInput): GuardedActionResult {
    const current = this.epics.require(input.epicId);
    if (input.expectedRevision !== undefined && current.revision !== input.expectedRevision) {
      throw new EpicRevisionConflictError(current.id, input.expectedRevision, current.revision);
    }
    const mode = this.controller.effectiveMode(current.autonomy, input.stageId);
    const evaluation = this.controller.evaluate(current.autonomy, mode, input.subject);
    if (!evaluation.requiresApproval) return { epic: current, evaluation, status: 'proceed' };
    if (current.status !== 'running') throw new Error(`Cannot guard an action while Epic ${current.id} is ${current.status}; start or resume its run first.`);
    if (!evaluation.preview) throw new Error('A gated action requires a complete preview.');
    const pendingGate: PendingGate = {
      id: `${current.id}:gate:${current.revision + 1}`,
      stageId: input.stageId,
      actionId: input.actionId,
      preview: evaluation.preview,
      requestedAt: nowIso(),
      requestedBy: { kind: 'system', id: 'aidlc-autonomy' },
    };
    const waiting = this.epics.transition(current.id, 'waiting-for-user', {
      expectedRevision: current.revision,
      command: 'gate.request',
      detail: `${evaluation.gate ?? 'manual_confirmation'} approval required for ${input.stageId}${input.actionId ? `/${input.actionId}` : ''}: ${evaluation.reason}`,
      pendingGate,
      gateId: pendingGate.id,
      gatePreview: pendingGate.preview,
    });
    return { epic: waiting, evaluation, pendingGate, status: 'waiting-for-approval' };
  }

  decide(epicId: EpicId | string, evaluation: GateEvaluation, decision: GateDecision, expectedRevision?: number): ApprovalResult {
    const current = this.epics.require(epicId);
    const validated = parseGateDecision(decision);
    if (!current.pendingGate || current.status !== 'waiting-for-user') throw new Error(`Epic ${current.id} has no pending gate to decide.`);
    if (!evaluation.gate || validated.gate !== evaluation.gate || validated.gate !== current.pendingGate.preview.gate) throw new Error('Gate decision does not match the guarded action.');
    if (JSON.stringify(validated.preview) !== JSON.stringify(current.pendingGate.preview)) throw new Error('Gate decision preview does not match the durable pending gate.');
    if (validated.outcome === 'pending') return { epic: current, status: 'pending' };
    if (validated.outcome === 'approved') {
      if (!this.controller.canProceed(evaluation, validated)) throw new Error('Approval does not permit this action.');
      const resumed = current.status === 'waiting-for-user'
        ? this.epics.resume(current.id, { expectedRevision, command: 'gate.approve', detail: `${validated.gate} approved.`, pendingGate: null, gateId: current.pendingGate.id, gatePreview: current.pendingGate.preview, gateDecision: validated }).epic
        : current;
      return { epic: resumed, status: 'approved' };
    }
    const paused = current.status === 'waiting-for-user'
      ? this.epics.transition(current.id, 'paused', { expectedRevision, command: 'gate.reject', detail: validated.reason ?? `${validated.gate} rejected.`, pendingGate: null, gateId: current.pendingGate.id, gatePreview: current.pendingGate.preview, gateDecision: validated })
      : current;
    return { epic: paused, status: 'rejected' };
  }

  recover(
    epicId: EpicId | string,
    failure: 'validation-failure' | 'ambiguous-requirement' | 'execution-failure',
    attempt: number,
    expectedRevision?: number,
  ): { epic: Epic; plan: RecoveryPlan } {
    const current = this.epics.require(epicId);
    const plan = planRecovery(current.autonomy, failure, attempt);
    if (plan.retry) return { epic: current, plan };
    if (current.status === 'running') {
      return {
        epic: this.epics.transition(current.id, 'blocked', {
          expectedRevision,
          command: 'epic.recover',
          detail: plan.reason,
        }),
        plan,
      };
    }
    return { epic: current, plan };
  }
}
