/**
 * Pure helpers for subtask creation — no `vscode`, no filesystem.
 *
 * {@link ./jiraSubtaskService} handles the parts that need VS Code (settings,
 * client, file reads). The decisions that are easy to get subtly wrong live here
 * so they can be tested directly: which pipeline steps become checklist items,
 * which review steps count as gates, and which drafts a create call may touch.
 */

import type { PlannerStep, SubtaskDraft } from '@aidlc/core';

/** A pipeline step as `workspace.yaml` spells it — string or object form. */
export type RawPipelineStep =
  | string
  | {
    agent?: string;
    name?: string;
    human_review?: boolean;
    produces_contains?: string[];
  };

/**
 * `generate-test-cases` → `Generate Test Cases`.
 *
 * Checklist items are read by whoever picks up the subtask, so the raw step id
 * is not good enough. Both separators appear in practice (`test-plan`,
 * `unit_test`).
 */
export function humanizeStepId(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Read a pipeline's steps into planner input.
 *
 * The `aidlc-` prefix is stripped because a pipeline references agents
 * (`aidlc-developer`) while the template's `fromSteps` names phases
 * (`implement`); without stripping, no step would ever match and every checklist
 * would come out empty.
 *
 * Steps with `human_review` become review gates, which is what the template's
 * `reviewGates` pseudo-step resolves to.
 */
export function stepsFromPipelineConfig(rawSteps: readonly RawPipelineStep[]): {
  steps: PlannerStep[];
  reviewGateStepIds: string[];
} {
  const steps: PlannerStep[] = [];
  const reviewGateStepIds: string[] = [];

  for (const raw of rawSteps ?? []) {
    const step = typeof raw === 'string' ? { agent: raw } : (raw ?? {});
    const id = String(step.name ?? step.agent ?? '').trim().replace(/^aidlc-/, '');
    if (!id) { continue; }
    // A pipeline can legitimately repeat an agent; the checklist should not.
    if (steps.some((existing) => existing.id === id)) { continue; }
    steps.push({
      id,
      name: humanizeStepId(id),
      producesContains: Array.isArray(step.produces_contains) ? step.produces_contains : [],
    });
    if (step.human_review === true) { reviewGateStepIds.push(id); }
  }
  return { steps, reviewGateStepIds };
}

/**
 * The drafts a create call is allowed to act on.
 *
 * Guards three things at once, because the webview cannot be trusted to have
 * done so: the domain was actually ticked, it is not already on Jira, and it is
 * not blocked by a missing required field. A create that ignored any of these
 * would duplicate a subtask or hand Jira a payload it rejects.
 */
export function selectableDrafts(
  drafts: readonly SubtaskDraft[],
  wantedDomains: readonly string[],
): SubtaskDraft[] {
  const wanted = new Set(wantedDomains.map((domain) => domain.trim().toLowerCase()));
  return drafts.filter((draft) =>
    wanted.has(draft.domain.trim().toLowerCase())
    && !draft.existingKey
    && draft.blockedBy.length === 0);
}

/** Browse URL for an issue key, given a site in either bare or full form. */
export function issueBrowseUrl(site: string, issueKey: string): string {
  const trimmedSite = site.trim().replace(/\/+$/, '');
  const key = issueKey.trim();
  if (!trimmedSite || !key) { return ''; }
  const base = /^https?:\/\//i.test(trimmedSite) ? trimmedSite : `https://${trimmedSite}`;
  return `${base}/browse/${key}`;
}
