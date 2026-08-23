/**
 * Turn a planned subtask into the JSON Jira's create API accepts.
 *
 * Kept beside the planner and the ADF builder because it is Jira domain
 * knowledge, not extension plumbing: which field ids exist, what shape `parent`
 * takes, and the fact that `description` must be ADF rather than text.
 *
 * The `fields` keys here are exactly the set {@link ./createMeta} checks against
 * `createmeta` — {@link SUPPLIED_SUBTASK_FIELDS}. Adding a field to the payload
 * without adding it there would make the pre-flight check wrong, so the two
 * lists are meant to be read together.
 */

import { buildSubtaskAdf, type RenderedSection } from './adfBuilder';
import type { AdfDoc } from './JiraTypes';

/** What the planner produced, reduced to what a payload needs. */
export interface SubtaskPayloadInput {
  /** Parent issue key. Jira rejects a subtask of a subtask. */
  parentKey: string;
  /** Project key. Derivable from `parentKey`, but passed explicitly. */
  projectKey: string;
  /** Resolved subtask issue type id — never a hardcoded name. */
  issueTypeId: string;
  summary: string;
  sections: RenderedSection[];
  labels: string[];
  /** Atlassian accountId, or null to leave the subtask unassigned. */
  assigneeAccountId?: string | null;
  /** Emit an ADF `rule` between sections (the template's `---`). */
  separator?: boolean;
}

export interface SubtaskPayload {
  fields: {
    project: { key: string };
    parent: { key: string };
    issuetype: { id: string };
    summary: string;
    description: AdfDoc;
    labels: string[];
    assignee?: { id: string };
  };
}

/**
 * Build one create payload.
 *
 * Two details Jira is strict about:
 *
 *   - **Labels may not contain spaces.** Jira rejects the whole request rather
 *     than sanitizing, so a label like `needs review` becomes `needs-review`
 *     here. Silently dropping it would lose information; failing the create over
 *     it would be worse.
 *   - **`assignee` is `{id: accountId}` on Cloud**, not `{name}` (that is
 *     Server) and not a bare string. Omitted entirely when unassigned — sending
 *     `null` asks Jira to clear the field, which needs a different permission.
 */
export function buildSubtaskPayload(input: SubtaskPayloadInput): SubtaskPayload {
  const fields: SubtaskPayload['fields'] = {
    project: { key: input.projectKey.trim().toUpperCase() },
    parent: { key: input.parentKey.trim().toUpperCase() },
    issuetype: { id: input.issueTypeId.trim() },
    summary: input.summary.trim(),
    description: buildSubtaskAdf(input.sections, { separator: input.separator !== false }),
    labels: normalizeLabels(input.labels),
  };
  const accountId = input.assigneeAccountId?.trim();
  if (accountId) { fields.assignee = { id: accountId }; }
  return { fields };
}

/**
 * Jira labels: no whitespace, deduplicated, order preserved. Empty results are
 * dropped rather than sent as `""`, which Jira also rejects.
 */
export function normalizeLabels(labels: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of labels) {
    const label = String(raw ?? '').trim().replace(/\s+/g, '-');
    if (label && !out.includes(label)) { out.push(label); }
  }
  return out;
}

/**
 * Field ids this payload carries — the pre-flight check in
 * {@link ./createMeta} compares a project's required fields against this list.
 * `assignee` is included even when omitted from a given payload: a project that
 * requires it is satisfied by our default of assigning to the current user.
 */
export const PAYLOAD_FIELD_IDS = [
  'project',
  'parent',
  'issuetype',
  'summary',
  'description',
  'labels',
  'assignee',
] as const;
