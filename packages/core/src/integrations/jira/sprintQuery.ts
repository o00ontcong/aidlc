/**
 * Sprint queries and issue parsing — the read side of the Jira integration.
 *
 * Pure: builds JQL strings, picks the `fields` list, and turns raw API payloads
 * into {@link JiraTicket}. All network work lives in {@link ./JiraClient}, so
 * every awkward parsing case here is unit-testable against a canned payload.
 *
 * The recurring theme is that Jira's payload is *per-site*: story points hide
 * behind a custom field whose id differs everywhere, status names are
 * per-workflow, and any field can be absent when the caller lacks permission on
 * it. Nothing here may assume a field exists.
 */

import { adfToMarkdown, extractAcceptanceCriteria } from './adfToMarkdown';
import type {
  JiraBoard,
  JiraSprint,
  JiraStatusCategory,
  JiraTicket,
  JiraTypeKind,
  RawJiraBoard,
  RawJiraField,
  RawJiraIssue,
  RawJiraSprint,
} from './JiraTypes';

/** Whose tickets to list. */
export type SprintScope = 'mine' | 'team';

/**
 * Fields we always ask for. Requesting an explicit list (instead of `*all`)
 * keeps a 50-issue sprint payload in the tens of KB rather than megabytes, and
 * makes it obvious what the parser depends on.
 */
export const BASE_ISSUE_FIELDS = [
  'summary',
  'description',
  'status',
  'issuetype',
  'priority',
  'assignee',
  'labels',
  'parent',
  'subtasks',
  'updated',
] as const;

/** Field names Jira sites use for story points. Checked in this order. */
const POINTS_FIELD_NAMES = [
  'story points',
  'story point estimate',
  'story points estimate',
];

/**
 * The `fields` query value. The points field id is appended when known; when it
 * is not, points simply come back null rather than the request failing.
 */
export function issueFields(pointsFieldId?: string | null): string {
  const fields = [...BASE_ISSUE_FIELDS];
  if (pointsFieldId) { fields.push(pointsFieldId as (typeof BASE_ISSUE_FIELDS)[number]); }
  return fields.join(',');
}

/**
 * Find the story-points custom field for this site.
 *
 * Hardcoding `customfield_10016` is the classic bug here — it is only the
 * default on some Jira instances. Returns null when nothing matches, which
 * callers treat as "this site does not track points".
 */
export function resolvePointsFieldId(fields: readonly RawJiraField[]): string | null {
  for (const wanted of POINTS_FIELD_NAMES) {
    const match = fields.find((f) => (f.name ?? '').trim().toLowerCase() === wanted && f.id);
    if (match?.id) { return match.id; }
  }
  return null;
}

export interface BuildJqlOptions {
  scope: SprintScope;
  /** Restrict to one sprint. Omit to use every open sprint. */
  sprintId?: number;
  /** Restrict to a project — useful when the account sees many. */
  projectKey?: string;
  /**
   * User-supplied JQL. When set it wins outright: someone who writes JQL wants
   * their query, not ours with clauses bolted on.
   */
  override?: string;
}

/**
 * Build the sprint JQL.
 *
 * `sprint IN openSprints()` is the board-independent way to say "the sprint
 * that is running" — it needs no board id, so it also works on sites where we
 * could not resolve one.
 */
export function buildSprintJql(options: BuildJqlOptions): string {
  const override = options.override?.trim();
  if (override) { return override; }

  const clauses: string[] = [];
  if (options.scope === 'mine') { clauses.push('assignee = currentUser()'); }
  if (options.projectKey?.trim()) { clauses.push(`project = ${quoteJql(options.projectKey.trim())}`); }
  clauses.push(
    typeof options.sprintId === 'number' && Number.isFinite(options.sprintId)
      ? `sprint = ${options.sprintId}`
      : 'sprint IN openSprints()',
  );
  return `${clauses.join(' AND ')} ORDER BY status ASC, priority DESC`;
}

/**
 * Quote a JQL literal. Jira treats bare words as identifiers, so a project key
 * with a reserved word or a space needs quoting; embedded quotes are escaped.
 */
export function quoteJql(value: string): string {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(value)
    ? value
    : `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export interface ParseIssueContext {
  /** `https://site.atlassian.net`, no trailing slash — used to build `url`. */
  siteBaseUrl: string;
  /** The authenticated account, for `isMine`. */
  selfAccountId?: string;
  /** Resolved by {@link resolvePointsFieldId}. */
  pointsFieldId?: string | null;
}

/**
 * Normalize one issue. Returns null only when the payload has no key — an issue
 * we cannot address is useless, whereas every other missing field has a
 * sensible empty default.
 */
export function parseIssue(raw: RawJiraIssue, ctx: ParseIssueContext): JiraTicket | null {
  const key = (raw.key ?? '').trim();
  if (!key) { return null; }
  const fields = raw.fields ?? {};

  const descriptionMd = adfToMarkdown(fields.description ?? null);
  const typeName = (fields.issuetype?.name ?? '').trim();
  const isSubtask = fields.issuetype?.subtask === true;
  const assignee = fields.assignee ?? null;
  const assigneeAccountId = (assignee?.accountId ?? '').trim();

  return {
    key,
    id: (raw.id ?? '').trim(),
    type: typeName,
    typeKind: typeKindOf(typeName, isSubtask),
    summary: (fields.summary ?? '').trim(),
    descriptionMd,
    acceptanceCriteria: extractAcceptanceCriteria(descriptionMd),
    status: (fields.status?.name ?? '').trim(),
    statusCategory: statusCategoryOf(fields.status?.statusCategory?.key),
    assigneeAccountId,
    assigneeName: (assignee?.displayName ?? '').trim(),
    // No account id on either side means "unknown", never "mine".
    isMine: Boolean(assigneeAccountId && ctx.selfAccountId && assigneeAccountId === ctx.selfAccountId),
    points: parsePoints(fields, ctx.pointsFieldId),
    priority: (fields.priority?.name ?? '').trim(),
    labels: Array.isArray(fields.labels) ? fields.labels.filter((l): l is string => typeof l === 'string') : [],
    parentKey: (fields.parent?.key ?? '').trim(),
    parentSummary: (fields.parent?.fields?.summary ?? '').trim(),
    existingSubtasks: (Array.isArray(fields.subtasks) ? fields.subtasks : [])
      .map((sub) => ({
        key: (sub?.key ?? '').trim(),
        summary: (sub?.fields?.summary ?? '').trim(),
        status: (sub?.fields?.status?.name ?? '').trim(),
      }))
      .filter((sub) => sub.key),
    isSubtask,
    url: `${ctx.siteBaseUrl.replace(/\/+$/, '')}/browse/${key}`,
    updatedAt: (fields.updated ?? '').trim(),
  };
}

/** Parse a page of issues, dropping unusable entries. */
export function parseIssues(raw: readonly RawJiraIssue[], ctx: ParseIssueContext): JiraTicket[] {
  return (Array.isArray(raw) ? raw : [])
    .map((issue) => parseIssue(issue ?? {}, ctx))
    .filter((t): t is JiraTicket => t !== null);
}

/**
 * Story points. The custom field arrives as a number on most sites and a string
 * on some; a non-numeric or negative value is treated as absent rather than
 * shown as `NaN`.
 */
function parsePoints(
  fields: NonNullable<RawJiraIssue['fields']>,
  pointsFieldId?: string | null,
): number | null {
  if (!pointsFieldId) { return null; }
  const raw = fields[pointsFieldId];
  if (raw === null || raw === undefined || raw === '') { return null; }
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Map `statusCategory.key` to our bucket. Jira's own keys are `new`,
 * `indeterminate` and `done`; the *names* are localized and per-workflow, which
 * is exactly why we do not read them.
 */
export function statusCategoryOf(categoryKey: string | undefined): JiraStatusCategory {
  switch ((categoryKey ?? '').trim().toLowerCase()) {
    case 'done':
      return 'done';
    case 'indeterminate':
    case 'inprogress':
      return 'inprogress';
    default:
      return 'todo';
  }
}

/** Bucket an issue type for icon purposes only. */
export function typeKindOf(typeName: string, isSubtask: boolean): JiraTypeKind {
  if (isSubtask) { return 'subtask'; }
  const name = typeName.trim().toLowerCase();
  if (!name) { return 'other'; }
  if (name.includes('bug') || name.includes('defect')) { return 'bug'; }
  if (name.includes('story')) { return 'story'; }
  if (name.includes('spike') || name.includes('research')) { return 'spike'; }
  if (name.includes('task')) { return 'task'; }
  return 'other';
}

/** Normalize a sprint. Returns null without a usable id. */
export function parseSprint(raw: RawJiraSprint): JiraSprint | null {
  const id = Number(raw?.id);
  if (!Number.isFinite(id)) { return null; }
  const state = (raw.state ?? '').trim().toLowerCase();
  return {
    id,
    name: (raw.name ?? `Sprint ${id}`).trim(),
    state: state === 'active' || state === 'future' || state === 'closed' ? state : 'unknown',
    startDate: (raw.startDate ?? '').trim(),
    endDate: (raw.endDate ?? '').trim(),
  };
}

/** Normalize a board. Returns null without a usable id. */
export function parseBoard(raw: RawJiraBoard): JiraBoard | null {
  const id = Number(raw?.id);
  if (!Number.isFinite(id)) { return null; }
  return { id, name: (raw.name ?? `Board ${id}`).trim() };
}

/**
 * Pick the sprint to show: the single active one, else the earliest future one,
 * else nothing. A board can have several active sprints (parallel teams on one
 * board), and picking the lowest id keeps the choice stable across refreshes
 * rather than following whatever order the API returned.
 */
export function pickCurrentSprint(sprints: readonly JiraSprint[]): JiraSprint | null {
  const byId = (a: JiraSprint, b: JiraSprint) => a.id - b.id;
  const active = sprints.filter((s) => s.state === 'active').sort(byId);
  if (active.length > 0) { return active[0]; }
  const future = sprints.filter((s) => s.state === 'future').sort(byId);
  return future[0] ?? null;
}
