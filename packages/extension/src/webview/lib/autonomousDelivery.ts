import type { AutonomousDeliverySummary } from './types';

export interface AutonomousPipelineLike {
  id: string;
  steps: unknown[];
}

export type AutonomousDeliveryActionId =
  | 'resume'
  | 'claude-login'
  | 'doctor'
  | 'open-log'
  | 'resolve-validators'
  | 'open-review'
  | 'add-review-task'
  | 'rework'
  | 'edit-context'
  | 'complete-after-merge';

const EXECUTION_STATUSES = new Set<AutonomousDeliverySummary['status']>([
  'pending',
  'project-context',
  'feature-contract',
  'integrating',
  'failed',
]);

/**
 * Return only actions that are meaningful for the delivery's durable state.
 * The host validates the id and state again before mutating anything.
 */
export function autonomousDeliveryActions(
  delivery: AutonomousDeliverySummary,
): AutonomousDeliveryActionId[] {
  const actions: AutonomousDeliveryActionId[] = [];
  const failureCode = delivery.latestFailure?.current ? delivery.latestFailure.code : '';
  const errorEvidence = `${failureCode}\n${delivery.lastError ?? ''}`;
  const postMergeRecovery = delivery.status === 'project-sync'
    || delivery.lastEventKind === 'post-merge-blocked';

  if (/authentication_required/i.test(errorEvidence)) actions.push('claude-login');
  if (/^runner\.|claude|login|auth/i.test(errorEvidence)) actions.push('doctor');
  if (/validator|aidlc-new|reconciliation/i.test(errorEvidence)) actions.push('resolve-validators');
  if (delivery.latestFailure) actions.push('open-log');

  if (EXECUTION_STATUSES.has(delivery.status) || (delivery.status === 'blocked' && !postMergeRecovery)) {
    actions.push('resume');
  }

  if (['awaiting-aggregate-review', 'awaiting-merge', 'completed'].includes(delivery.status)) {
    actions.push('open-review');
  }
  if (delivery.status === 'awaiting-aggregate-review') {
    actions.push('add-review-task');
    if (delivery.openReviewTasks > 0) actions.push('rework');
    if (delivery.projectContextRunId) actions.push('edit-context');
    actions.push('complete-after-merge');
  } else if (delivery.status === 'awaiting-merge' || postMergeRecovery) {
    actions.push('complete-after-merge');
  }

  return [...new Set(actions)];
}

export const REQUIRED_AUTONOMOUS_PIPELINES = [
  { id: 'project-context', steps: 8 },
  { id: 'cohesive-feature', steps: 14 },
] as const;

export function autonomousDeliveryReadiness(pipelines: AutonomousPipelineLike[]): {
  ready: boolean;
  missingOrOutdated: string[];
} {
  const missingOrOutdated = REQUIRED_AUTONOMOUS_PIPELINES.flatMap((required) => {
    const pipeline = pipelines.find((item) => item.id === required.id);
    if (!pipeline) return [`${required.id} (missing)`];
    if (pipeline.steps.length < required.steps) {
      return [`${required.id} (${pipeline.steps.length}/${required.steps} steps)`];
    }
    return [];
  });
  return { ready: missingOrOutdated.length === 0, missingOrOutdated };
}
