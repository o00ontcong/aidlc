/**
 * Jira Cloud shapes — raw wire types and the normalized types the rest of
 * AIDLC consumes.
 *
 * Two layers on purpose:
 *
 *   - `Raw*` mirrors what the REST API actually sends. Every field is optional
 *     because Jira's payload varies by site, project, permission and API
 *     version: a field the docs call required disappears when the caller lacks
 *     browse permission on it, and custom field ids differ per site. Parsers
 *     here must never assume a field exists.
 *   - {@link JiraTicket} and friends are ours. They are total (no optionals we
 *     can compute a default for), carry only what the UI and the subtask
 *     planner need, and are what the extension serializes into the webview.
 *
 * Nothing in this file does I/O — see {@link ./JiraClient}.
 */

// ─── raw wire shapes ────────────────────────────────────────────────────────

/** Atlassian Document Format node. Recursive, and deliberately loose. */
export interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
}

/** ADF document root (`description`, `comment.body`, …). */
export interface AdfDoc extends AdfNode {
  type?: 'doc';
  version?: number;
}

export interface RawJiraUser {
  accountId?: string;
  displayName?: string;
  emailAddress?: string;
}

export interface RawJiraStatus {
  name?: string;
  statusCategory?: { key?: string; name?: string };
}

export interface RawJiraIssueType {
  id?: string;
  name?: string;
  subtask?: boolean;
}

export interface RawJiraIssue {
  id?: string;
  key?: string;
  fields?: {
    summary?: string;
    /** ADF on API v3, a plain string on v2. Both shapes are handled. */
    description?: AdfDoc | string | null;
    status?: RawJiraStatus;
    issuetype?: RawJiraIssueType;
    priority?: { name?: string };
    assignee?: RawJiraUser | null;
    labels?: string[];
    parent?: { key?: string; fields?: { summary?: string } };
    subtasks?: RawJiraIssue[];
    updated?: string;
    /** Story points and other custom fields land here by id. */
    [customField: string]: unknown;
  };
}

export interface RawJiraSprint {
  id?: number;
  name?: string;
  state?: string;
  startDate?: string;
  endDate?: string;
  boardId?: number;
}

export interface RawJiraBoard {
  id?: number;
  name?: string;
  type?: string;
}

export interface RawJiraTransition {
  id?: string;
  name?: string;
  to?: RawJiraStatus;
}

export interface RawJiraField {
  id?: string;
  name?: string;
  custom?: boolean;
}

// ─── normalized shapes ──────────────────────────────────────────────────────

/**
 * Coarse status bucket. Jira's own `statusCategory.key` is the only reliable
 * signal here — status *names* are per-workflow ("Ready for QA", "Đang làm")
 * and cannot be pattern-matched across projects.
 */
export type JiraStatusCategory = 'todo' | 'inprogress' | 'done';

/** Issue-type bucket, used only to pick an icon. */
export type JiraTypeKind = 'story' | 'bug' | 'task' | 'spike' | 'subtask' | 'other';

export interface JiraSubtaskRef {
  key: string;
  summary: string;
  status: string;
}

export interface JiraTicket {
  key: string;
  id: string;
  /** Issue type name as Jira spells it on this site. */
  type: string;
  typeKind: JiraTypeKind;
  summary: string;
  /** ADF flattened to markdown — this text flows into the AIDLC task brief. */
  descriptionMd: string;
  /** Bullets parsed out of an "Acceptance Criteria" section, when present. */
  acceptanceCriteria: string[];
  status: string;
  statusCategory: JiraStatusCategory;
  assigneeAccountId: string;
  assigneeName: string;
  isMine: boolean;
  points: number | null;
  priority: string;
  labels: string[];
  parentKey: string;
  parentSummary: string;
  existingSubtasks: JiraSubtaskRef[];
  /** True when the ticket is itself a subtask — Jira forbids nesting. */
  isSubtask: boolean;
  url: string;
  updatedAt: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'future' | 'closed' | 'unknown';
  startDate: string;
  endDate: string;
}

export interface JiraBoard {
  id: number;
  name: string;
}

export interface JiraTransition {
  id: string;
  /** Transition name ("Start Progress"). Not the destination status. */
  name: string;
  /** Destination status name — what callers actually match on. */
  toStatus: string;
  toCategory: JiraStatusCategory;
}

/**
 * Why a Jira call failed, in the vocabulary the UI needs. Mapping HTTP status
 * to one of these in one place keeps every call site from re-deriving "is this
 * my token or my permissions or the network".
 */
export type JiraErrorKind =
  | 'auth'          // 401 — token wrong / expired / revoked
  | 'forbidden'     // 403 — authenticated but not allowed
  | 'not_found'     // 404 — board / sprint / issue gone or never existed
  | 'rate_limited'  // 429 — retries exhausted
  | 'bad_request'   // 400 / 422 — our payload, usually a missing required field
  | 'timeout'
  | 'network'
  | 'unknown';

/** Identity of the authenticated account — used to mark `isMine`. */
export interface JiraSelf {
  accountId: string;
  displayName: string;
  emailAddress: string;
}
