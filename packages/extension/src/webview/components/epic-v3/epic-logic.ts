/* Pure predicates lifted verbatim from EpicCard.tsx so the v3 screen makes the
 * same decisions the current screen makes. Semantics are unchanged — if these
 * ever diverge from EpicCard's copies, that is a bug.
 */

import type { EpicStepDetailFull, EpicSummary, EpicVisualizations, StepStatus, UiStatus } from '@/lib/types';

/** Prefer the as-built/proposed code flow; fall back to surfaces then feature tree. */
export function primaryFlowMermaid(graphs?: EpicVisualizations): string | undefined {
  return graphs?.flowMermaid || graphs?.surfacesMermaid || graphs?.impactMermaid;
}

export function isCodeHumanReviewStep(step: EpicStepDetailFull | null): boolean {
  if (!step?.stepHasHumanReview) return false;
  const name = (step.stepName ?? step.agent ?? '').toLowerCase();
  return (
    name.includes('implement')
    || name.includes('package-review')
    || name.includes('review-diff')
    || !!step.artifact?.toLowerCase().includes('review-diff')
    || !!step.artifacts?.some((artifact) => artifact.toLowerCase().includes('review-diff'))
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
