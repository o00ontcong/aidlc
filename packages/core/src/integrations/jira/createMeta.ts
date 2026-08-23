/**
 * Read `createmeta` so we know what a project will accept before we post to it.
 *
 * Two site-specific facts we cannot hardcode:
 *
 *   1. **What a subtask is called.** `Sub-task`, `Subtask`, `Sub-Task` — and on a
 *      localized site, something else entirely. The reliable signal is the
 *      `subtask: true` flag on the issue type, not its name.
 *   2. **Which fields are mandatory.** Projects add required custom fields
 *      (Reviewer, Team, Sprint). Posting without one returns a 400 whose body
 *      names a field id, not a label — so we compare against createmeta up front
 *      and disable the draft with a readable field name instead.
 *
 * Pure; the caller fetches
 * `GET /rest/api/3/issue/createmeta/{projectIdOrKey}/issuetypes`.
 */

/** One issue type as createmeta describes it. */
export interface CreateMetaIssueType {
  id?: string;
  name?: string;
  subtask?: boolean;
  /** Present on the `/issuetypes/{id}` variant, keyed by field id. */
  fields?: Record<string, CreateMetaField>;
}

export interface CreateMetaField {
  /** Field id (`summary`, `customfield_10020`). */
  fieldId?: string;
  /** Human label, which is what an error message should say. */
  name?: string;
  required?: boolean;
  /** Jira supplies a value when the field has a default. */
  hasDefaultValue?: boolean;
  schema?: { type?: string; system?: string };
}

export interface SubtaskIssueTypeResult {
  /** Resolved type, or null when the project has no subtask type at all. */
  issueType: { id: string; name: string } | null;
  /** Every subtask-capable type, for a picker when there are several. */
  candidates: Array<{ id: string; name: string }>;
  /** Set when the configured name matched nothing, so the UI can say so. */
  requestedNameMissing?: string;
}

/**
 * Resolve the subtask issue type for a project.
 *
 * `configuredName` of `'auto'` or empty means "pick for me": with one candidate
 * that is unambiguous, and with several we still return the first so the flow
 * works, while exposing `candidates` so the UI can offer a choice. A configured
 * name that matches nothing is reported rather than silently ignored — falling
 * back would create issues of a type the user did not ask for.
 */
export function resolveSubtaskIssueType(
  issueTypes: readonly CreateMetaIssueType[],
  configuredName = 'auto',
): SubtaskIssueTypeResult {
  const candidates = (Array.isArray(issueTypes) ? issueTypes : [])
    .filter((t) => t?.subtask === true && (t.id ?? '').trim())
    .map((t) => ({ id: String(t.id).trim(), name: (t.name ?? '').trim() }));

  if (candidates.length === 0) { return { issueType: null, candidates: [] }; }

  const wanted = configuredName.trim().toLowerCase();
  if (!wanted || wanted === 'auto') {
    return { issueType: candidates[0], candidates };
  }

  const match = candidates.find((t) => t.name.toLowerCase() === wanted);
  if (match) { return { issueType: match, candidates }; }

  return { issueType: null, candidates, requestedNameMissing: configuredName.trim() };
}

/**
 * Fields the template cannot supply.
 *
 * `supplied` is the set of field ids our payload will carry (`summary`,
 * `description`, `parent`, `issuetype`, `project`, `labels`, `assignee`).
 * Anything required beyond that, without a Jira-side default, blocks the create.
 *
 * Returned as human labels, because the point is to tell a person which field to
 * add to the template.
 */
export function missingRequiredFields(
  fields: Record<string, CreateMetaField> | undefined,
  supplied: readonly string[],
): string[] {
  if (!fields) { return []; }
  const have = new Set(supplied.map((s) => s.trim()));
  const missing: string[] = [];

  for (const [id, field] of Object.entries(fields)) {
    if (!field?.required) { continue; }
    if (field.hasDefaultValue) { continue; }
    const fieldId = (field.fieldId ?? id).trim();
    if (have.has(fieldId)) { continue; }
    // `issuetype` and `project` are always in the payload even when a site
    // reports them as required fields without defaults.
    if (fieldId === 'issuetype' || fieldId === 'project') { continue; }
    missing.push((field.name ?? '').trim() || fieldId);
  }
  return missing;
}

/** Field ids a subtask payload built from the template always carries. */
export const SUPPLIED_SUBTASK_FIELDS = [
  'project',
  'parent',
  'issuetype',
  'summary',
  'description',
  'labels',
  'assignee',
] as const;

/**
 * Project key from an issue key (`ACME-4830` → `ACME`). Jira keys are
 * `<PROJECT>-<number>`, and the project part may contain digits after the first
 * letter. Returns '' when the input is not a Jira key.
 */
export function projectKeyFromIssueKey(issueKey: string): string {
  const match = issueKey.trim().match(/^([A-Za-z][A-Za-z0-9_]*)-\d+$/);
  return match ? match[1].toUpperCase() : '';
}
