import {
  effectiveAutonomyMode,
  isGateBypassableInMode,
  isHardGate,
  resolveGatePolicy,
  type AutonomyMode,
  type AutonomyPolicy,
  type GateDecision,
  GateDecisionSchema,
  type GateKind,
  type GatePreview,
  type RecoveryAction,
  type StageId,
} from '../contracts';

export const EXTERNAL_COMMUNICATION_KINDS = [
  'pull-request', 'issue', 'comment', 'email-chat', 'release-announcement', 'publish-package',
] as const;
export type ExternalCommunicationKind = (typeof EXTERNAL_COMMUNICATION_KINDS)[number];
export type ActionRisk = 'low' | 'medium' | 'high' | 'critical';

export interface GateSubject {
  mutation?: boolean;
  destructive?: boolean;
  mergeDefaultBranch?: boolean;
  externalCommunication?: ExternalCommunicationKind;
  gate?: GateKind;
  risk?: ActionRisk;
  destination?: string;
  contentSummary: string;
  mutationScope?: string[];
}

export interface GateEvaluation {
  mode: AutonomyMode;
  gate?: GateKind;
  hard: boolean;
  requiresApproval: boolean;
  preview?: GatePreview;
  reason: string;
}

export function gateForSubject(subject: GateSubject): GateKind | undefined {
  if (subject.externalCommunication) return 'external_communication';
  if (subject.destructive) return 'destructive_changes';
  if (subject.mergeDefaultBranch) return 'merge_default_branch';
  return subject.gate;
}

/** Evaluates safety gates without doing mutation or provider-specific work. */
export class AutonomyController {
  effectiveMode(policy: AutonomyPolicy, stage: StageId): AutonomyMode {
    return effectiveAutonomyMode(policy, stage);
  }

  evaluate(policy: AutonomyPolicy, mode: AutonomyMode, subject: GateSubject): GateEvaluation {
    const gate = gateForSubject(subject);
    if (!gate) {
      const manualConfirmation = subject.mutation === true && (mode === 'guide' || mode === 'assist');
      const manualGate = manualConfirmation ? 'manual_confirmation' : undefined;
      return {
        mode,
        gate: manualGate,
        hard: false,
        requiresApproval: manualConfirmation,
        preview: manualConfirmation ? {
          gate: manualGate!,
          destination: subject.destination,
          contentSummary: subject.contentSummary,
          mutationScope: subject.mutationScope ?? [],
        } : undefined,
        reason: manualConfirmation ? `${mode} mode requires human confirmation before mutation.` : 'No gate applies.',
      };
    }
    const resolved = resolveGatePolicy(policy, gate);
    const riskGate = resolved.enforcement === 'risk-based' && ['high', 'critical'].includes(subject.risk ?? 'medium');
    const manualConfirmation = subject.mutation === true && (mode === 'guide' || mode === 'assist');
    const requiresApproval = resolved.hard || resolved.enforcement === 'always' || riskGate || manualConfirmation || !isGateBypassableInMode(policy, gate, mode);
    const preview: GatePreview = {
      gate,
      destination: subject.destination,
      contentSummary: subject.contentSummary,
      mutationScope: subject.mutationScope ?? [],
    };
    return {
      mode,
      gate,
      hard: resolved.hard || isHardGate(gate),
      requiresApproval,
      preview,
      reason: resolved.hard
        ? `${gate} is a hard gate and cannot be bypassed.`
        : requiresApproval
          ? `${gate} requires approval under the current mode, policy, or risk.`
          : `${gate} may proceed automatically under the current policy.`,
    };
  }

  canProceed(evaluation: GateEvaluation, decision?: GateDecision): boolean {
    if (!evaluation.requiresApproval) return true;
    const parsed = GateDecisionSchema.safeParse(decision);
    return parsed.success
      && parsed.data.outcome === 'approved'
      && parsed.data.gate === evaluation.gate
      && JSON.stringify(parsed.data.preview) === JSON.stringify(evaluation.preview);
  }
}

export interface RecoveryPlan {
  attempt: number;
  retry: boolean;
  actions: RecoveryAction[];
  reason: string;
}

/** Deterministic retry/escalation policy; run state owns the actual attempt counter. */
export function planRecovery(
  policy: AutonomyPolicy,
  failure: 'validation-failure' | 'ambiguous-requirement' | 'execution-failure',
  attempt: number,
): RecoveryPlan {
  const exhausted = attempt >= policy.recovery.maxAttempts;
  if (exhausted) return {
    attempt,
    retry: false,
    reason: `Recovery attempts exhausted (${policy.recovery.maxAttempts}).`,
    actions: [{ kind: 'escalate', label: 'Escalate to human', description: 'Review evidence and choose the next action.', command: 'epic.explain' }],
  };
  if (failure === 'ambiguous-requirement' || (failure === 'validation-failure' && policy.recovery.onValidationFailure === 'ask')) {
    return {
      attempt,
      retry: false,
      reason: 'Human clarification is required before continuing.',
      actions: [{ kind: 'ask-user', label: 'Ask for clarification', command: 'epic.resume' }],
    };
  }
  if (failure === 'validation-failure' && policy.recovery.onValidationFailure === 'stop') {
    return { attempt, retry: false, reason: 'Validation policy is stop.', actions: [{ kind: 'escalate', label: 'Escalate to human', command: 'epic.explain' }] };
  }
  return {
    attempt,
    retry: true,
    reason: `Retry ${attempt + 1} of ${policy.recovery.maxAttempts} after repair.`,
    actions: [{ kind: 'apply-fix', label: 'Repair and retry', command: 'epic.resume' }],
  };
}
