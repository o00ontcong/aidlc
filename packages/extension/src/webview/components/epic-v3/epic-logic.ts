/* Pure predicates lifted verbatim from EpicCard.tsx so the v3 screen makes the
 * same decisions the current screen makes. Semantics are unchanged — if these
 * ever diverge from EpicCard's copies, that is a bug.
 */

import type { EpicStepDetailFull, EpicSummary, EpicVisualizations, StepStatus, UiStatus } from '@/lib/types';

export function isFeaturePipeline(pipeline: string | null): boolean {
  if (!pipeline) return false;
  return pipeline === 'cohesive-feature' || pipeline.startsWith('cohesive-feature')
    || pipeline === 'feature-spike' || pipeline.startsWith('feature-spike')
    || pipeline === 'feature-implement' || pipeline.startsWith('feature-implement');
}

/** Cohesive project-context or feature epic — human surface is SUMMARY + one graph. */
export function isBriefingPipeline(pipeline: string | null): boolean {
  if (!pipeline) return false;
  return pipeline === 'project-context' || pipeline.startsWith('project-context') || isFeaturePipeline(pipeline);
}

/** Prefer the as-built/proposed code flow; fall back to surfaces then feature tree. */
export function primaryFlowMermaid(graphs?: EpicVisualizations): string | undefined {
  return graphs?.flowMermaid || graphs?.surfacesMermaid || graphs?.impactMermaid;
}

export function briefingSummary(epic: Pick<EpicSummary, 'title' | 'description' | 'alignment' | 'inputs'>): string {
  const blocks: string[] = [];
  const description = epic.description.trim();
  if (description) blocks.push(description);
  if (epic.alignment?.goals.length) {
    blocks.push(`Serves: ${epic.alignment.goals.join(', ')}`);
  }
  const scope = String(epic.inputs?.what_scope ?? '').trim();
  if (scope) blocks.push(`Phạm vi: ${scope}`);
  const constraints = String(epic.inputs?.feature_constraints ?? '').trim();
  if (constraints) blocks.push(`Ràng buộc: ${constraints}`);
  if (!blocks.length) blocks.push(epic.title);
  return blocks.join('\n\n');
}

export function isPackagePipeline(pipeline: string | null): boolean {
  if (!pipeline) return false;
  return pipeline === 'cohesive-work-package' || pipeline.includes('work-package');
}

export function isBugResolutionStep(step: EpicStepDetailFull | null): boolean {
  return (step?.stepName ?? step?.agent ?? '').trim().toLowerCase() === 'resolve-bugs';
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
