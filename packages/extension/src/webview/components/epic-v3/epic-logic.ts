/* Pure predicates lifted verbatim from EpicCard.tsx so the v3 screen makes the
 * same decisions the current screen makes. Semantics are unchanged — if these
 * ever diverge from EpicCard's copies, that is a bug.
 */

import type { EpicStepDetailFull, StepStatus, UiStatus } from '@/lib/types';

export function isFeaturePipeline(pipeline: string | null): boolean {
  if (!pipeline) return false;
  return pipeline === 'cohesive-feature' || pipeline.startsWith('cohesive-feature');
}

export function isPackagePipeline(pipeline: string | null): boolean {
  if (!pipeline) return false;
  return pipeline === 'cohesive-work-package' || pipeline.includes('work-package');
}

export function isCodeHumanReviewStep(step: EpicStepDetailFull | null): boolean {
  if (!step?.stepHasHumanReview) return false;
  const name = (step.stepName ?? step.agent ?? '').toLowerCase();
  return (
    name.includes('implement')
    || name.includes('package-review')
    || name.includes('review-diff')
    || !!step.artifact?.toLowerCase().includes('review-diff')
  );
}

/** EpicCard.runStatusUi — null means "no run controls for this step". */
export function runStatusUi(status: StepStatus | null): UiStatus | null {
  if (!status || status === 'pending' || status === 'approved') { return null; }
  if (status === 'awaiting_work') { return 'awaiting_work'; }
  if (status === 'awaiting_auto_review' || status === 'awaiting_review') { return 'awaiting_review'; }
  if (status === 'rejected') { return 'rejected'; }
  return null;
}
