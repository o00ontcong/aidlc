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

/** Cohesive project-context or feature epic — human surface is SUMMARY + AC + graphs. */
export function isBriefingPipeline(pipeline: string | null): boolean {
  if (!pipeline) return false;
  return isProjectContextPipeline(pipeline) || isFeaturePipeline(pipeline);
}

export function isProjectContextPipeline(pipeline: string | null | undefined): boolean {
  return !!pipeline && (pipeline === 'project-context' || pipeline.startsWith('project-context'));
}

/** Prefer the as-built/proposed code flow; fall back to surfaces then feature tree. */
export function primaryFlowMermaid(
  graphs?: EpicVisualizations,
  pipeline?: string | null,
): string | undefined {
  if (isProjectContextPipeline(pipeline)) {
    return graphs?.flowMermaid || graphs?.impactMermaid;
  }
  return graphs?.flowMermaid || graphs?.surfacesMermaid || graphs?.impactMermaid;
}

export type BriefingGraphTab = { id: string; label: string; src: string; title: string };

/**
 * Project-context owns architecture + two catalogs (code tree vs screen tree).
 * Surfaces is a feature-epic graph (FEATURE-SURFACES) — do not show it on context.
 */
export function briefingGraphTabs(
  graphs: EpicVisualizations | undefined,
  pipeline: string | null | undefined,
  always = false,
): BriefingGraphTab[] {
  const isContext = isProjectContextPipeline(pipeline);
  const tabs: BriefingGraphTab[] = [];
  if (always || graphs?.flowMermaid) {
    tabs.push({
      id: 'flow',
      label: isContext ? 'Kiến trúc' : 'Luồng',
      src: graphs?.flowMermaid ?? '',
      title: isContext ? 'Graph kiến trúc repo' : 'Luồng feature (đề xuất / as-built)',
    });
  }
  if (!isContext && (always || graphs?.surfacesMermaid)) {
    tabs.push({
      id: 'surfaces',
      label: 'Surfaces',
      src: graphs?.surfacesMermaid ?? '',
      title: 'Màn hình / API epic này chạm tới',
    });
  }
  if (always || graphs?.impactMermaid) {
    tabs.push({
      id: 'impact',
      label: isContext ? 'Cây code' : 'Cây feature',
      src: graphs?.impactMermaid ?? '',
      title: isContext ? 'Catalog feature theo cấu trúc code (module/package)' : 'Feature thêm / sửa / xoá',
    });
  }
  if (isContext && (always || graphs?.screensMermaid)) {
    tabs.push({
      id: 'screens',
      label: 'Cây màn hình',
      src: graphs?.screensMermaid ?? '',
      title: 'Catalog feature theo cấu trúc màn hình (tab/flow/sheet) — so với Cây code',
    });
  }
  return tabs;
}

export function briefingSummary(epic: Pick<EpicSummary, 'title' | 'description' | 'alignment' | 'inputs' | 'missionBriefing'>): string {
  const briefing = epic.missionBriefing;
  if (briefing?.summary || briefing?.acceptanceCriteria) {
    const blocks: string[] = [];
    if (briefing.summary) blocks.push(briefing.summary);
    if (briefing.acceptanceCriteria) {
      const ac = briefing.acceptanceCriteria.split('\n').slice(0, 12).join('\n').trim();
      blocks.push(`AC\n${ac}`);
    }
    return blocks.join('\n\n');
  }
  const blocks: string[] = [];
  const description = (epic.description ?? '').trim();
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
