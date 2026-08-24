/**
 * Pure logic behind the Sprint view — no `vscode` import, so it is unit-tested
 * directly (same split as providerRunLogic / providerRunService).
 *
 * {@link ./jiraSprintService} owns the VS Code side: settings, SecretStorage,
 * the cache memento, and posting messages. Everything that decides *what* the
 * webview should show lives here.
 */

import {
  DEFAULT_TRANSITION_MAPPING,
  type JiraBoard,
  type JiraErrorKind,
  type JiraSprint,
  type JiraTicket,
  type TransitionMapping,
  JiraApiError,
} from '@aidlc/core';

/** Settings mirror of the `aidlc.jira.*` configuration block. */
export interface JiraSettings {
  site: string;
  email: string;
  projectKey: string;
  /** 0 = no board chosen; the JQL path is used instead. */
  boardId: number;
  jql: string;
  refreshMinutes: number;
  requestTimeoutSeconds: number;
  transitionsEnabled: boolean;
  subtasksEnabled: boolean;
  /** Event → wanted Jira status. Empty string = do nothing for that event. */
  transitionMapping: TransitionMapping;
  /** Ask before each write. A Done-category move always asks regardless. */
  transitionConfirm: boolean;
}

export type SprintScope = 'mine' | 'team';
export type SprintStatus = 'unconfigured' | 'loading' | 'ready' | 'error';

/** Ticket as the webview sees it: Jira fields plus our own linkage. */
export interface SprintTicket extends JiraTicket {
  /** AIDLC task built from this ticket, if any. */
  linkedEpicId?: string;
  /** `step 4/7` or `xong` — a glance at how far that task got. */
  linkedEpicProgress?: string;
}

export interface SprintState {
  status: SprintStatus;
  board?: JiraBoard;
  sprint?: JiraSprint;
  boards: JiraBoard[];
  sprints: JiraSprint[];
  tickets: SprintTicket[];
  scope: SprintScope;
  errorKind?: JiraErrorKind;
  errorMessage?: string;
  /** ISO timestamp of the last successful fetch. */
  lastSyncedAt?: string;
  /** True when `tickets` came from the cache rather than a live fetch. */
  fromCache?: boolean;
  /**
   * True when the tickets could not be re-verified — a failed fetch, or a cache
   * past its refresh window. The UI blocks writes and task creation on these.
   *
   * Deliberately not the same thing as {@link fromCache}: a cache the service
   * itself considers fresh enough to skip a fetch is not stale, or the primary
   * action would sit disabled for the whole refresh window after every reopen.
   */
  stale: boolean;
  transitionsEnabled: boolean;
  subtasksEnabled: boolean;
  /** Mirrored so the mapping panel can render without a second round trip. */
  transitionMapping: TransitionMapping;
  transitionConfirm: boolean;
  /** Human-readable reason the view is unconfigured. */
  missing?: string[];
  /** Non-secret values prefilled into the connect dialog. Never the token. */
  connect: { site: string; email: string };
}

/** What we persist between sessions. Deliberately no credentials. */
export interface SprintCache {
  /** Identity of the query this cache belongs to — see {@link sprintCacheKey}. */
  key: string;
  /** Epoch ms. */
  savedAt: number;
  scope: SprintScope;
  board?: JiraBoard;
  sprint?: JiraSprint;
  boards: JiraBoard[];
  sprints: JiraSprint[];
  tickets: JiraTicket[];
}

export const EMPTY_SPRINT_STATE: SprintState = {
  status: 'unconfigured',
  boards: [],
  sprints: [],
  tickets: [],
  scope: 'mine',
  stale: false,
  transitionsEnabled: false,
  subtasksEnabled: false,
  transitionMapping: DEFAULT_TRANSITION_MAPPING,
  transitionConfirm: true,
  connect: { site: '', email: '' },
};

/**
 * Which settings are still missing. Returned as user-facing labels because the
 * empty state lists them; an empty array means we can talk to Jira.
 *
 * The token is checked as a boolean — the service never passes the value here,
 * so a secret cannot leak into a message or a log line through this path.
 */
export function missingJiraSettings(settings: JiraSettings, hasToken: boolean): string[] {
  const missing: string[] = [];
  if (!settings.site.trim()) { missing.push('Jira site'); }
  if (!settings.email.trim()) { missing.push('email'); }
  if (!hasToken) { missing.push('API token'); }
  return missing;
}

export function isJiraConfigured(settings: JiraSettings, hasToken: boolean): boolean {
  return missingJiraSettings(settings, hasToken).length === 0;
}

/**
 * Cache identity. Anything that changes *which* tickets a fetch returns goes in
 * the key, so switching site, board, sprint, scope or JQL cannot show the
 * previous query's tickets while the new one loads.
 */
export function sprintCacheKey(
  settings: JiraSettings,
  scope: SprintScope,
  sprintId?: number,
): string {
  return [
    settings.site.trim().toLowerCase(),
    settings.email.trim().toLowerCase(),
    settings.projectKey.trim().toUpperCase(),
    String(settings.boardId || 0),
    settings.jql.trim(),
    scope,
    String(sprintId ?? 0),
  ].join('|');
}

/**
 * Is the cache still worth showing without a refetch?
 *
 * `refreshMinutes <= 0` disables auto-refresh, which means the cache never
 * expires on its own — the user refreshes by hand. A `savedAt` in the future
 * (clock change, restored backup) counts as stale rather than fresh forever.
 */
export function isCacheFresh(
  cache: Pick<SprintCache, 'savedAt'>,
  nowMs: number,
  refreshMinutes: number,
): boolean {
  if (cache.savedAt > nowMs) { return false; }
  if (refreshMinutes <= 0) { return true; }
  return nowMs - cache.savedAt < refreshMinutes * 60_000;
}

/** Just enough of an epic to render the link badge. */
export interface EpicLinkSource {
  id: string;
  inputs: Record<string, string>;
  status: string;
  /** 0-based index of the current step. */
  currentStep: number;
  stepCount: number;
}

/**
 * Attach `linkedEpicId` / `linkedEpicProgress` by joining on `inputs.jira`.
 *
 * This is the whole linkage mechanism: `scaffoldEpic` already persists capability
 * inputs to `docs/epics/<ID>/inputs.json`, and the webview state already carries
 * them, so no new store is needed. Matching is case-insensitive because a user
 * may type `acme-1` into the task wizard.
 *
 * When two epics claim the same ticket (a re-run under a new id), the later one
 * wins — sorted by id so the choice is stable rather than filesystem-order.
 */
export function linkTicketsToEpics(
  tickets: readonly JiraTicket[],
  epics: readonly EpicLinkSource[],
): SprintTicket[] {
  const byKey = new Map<string, EpicLinkSource>();
  for (const epic of [...epics].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = (epic.inputs?.jira ?? '').trim().toUpperCase();
    if (key) { byKey.set(key, epic); }
  }

  return tickets.map((ticket) => {
    const epic = byKey.get(ticket.key.trim().toUpperCase());
    if (!epic) { return { ...ticket }; }
    return {
      ...ticket,
      linkedEpicId: epic.id,
      linkedEpicProgress: describeEpicProgress(epic),
    };
  });
}

function describeEpicProgress(epic: EpicLinkSource): string {
  if (epic.status === 'done') { return 'xong'; }
  if (epic.status === 'failed') { return 'lỗi'; }
  if (epic.stepCount <= 0) { return epic.status; }
  // currentStep is 0-based; humans count from 1.
  const step = Math.min(epic.stepCount, Math.max(1, epic.currentStep + 1));
  return `step ${step}/${epic.stepCount}`;
}

/** The three buckets the Sprint list groups by, in display order. */
export type SprintGroup = 'in_progress' | 'todo' | 'closing';

export const SPRINT_GROUP_ORDER: SprintGroup[] = ['in_progress', 'todo', 'closing'];

/**
 * Group tickets for display.
 *
 * Grouping by `statusCategory` rather than status name is what makes this work
 * across projects with different workflows — "Ready for QA" and "Đang review"
 * both arrive as `inprogress`. Done tickets sit with in-review ones at the
 * bottom: both are things the user is no longer starting.
 */
export function groupTickets(tickets: readonly SprintTicket[]): Record<SprintGroup, SprintTicket[]> {
  const groups: Record<SprintGroup, SprintTicket[]> = { in_progress: [], todo: [], closing: [] };
  for (const ticket of tickets) {
    if (ticket.statusCategory === 'done') { groups.closing.push(ticket); continue; }
    if (ticket.statusCategory === 'inprogress') { groups.in_progress.push(ticket); continue; }
    groups.todo.push(ticket);
  }
  return groups;
}

/** Counts for the filter chips. */
export interface SprintCounts {
  all: number;
  byStatus: Array<{ status: string; count: number }>;
  /** Tickets with no AIDLC task yet — the most useful filter of the day. */
  unlinked: number;
}

export function countTickets(tickets: readonly SprintTicket[]): SprintCounts {
  const byStatus = new Map<string, number>();
  let unlinked = 0;
  for (const ticket of tickets) {
    const status = ticket.status || '—';
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
    if (!ticket.linkedEpicId) { unlinked += 1; }
  }
  return {
    all: tickets.length,
    // Insertion order follows the JQL ordering, which is status ASC.
    byStatus: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
    unlinked,
  };
}

/**
 * Turn any thrown value into an error kind plus a message worth showing.
 *
 * `JiraApiError` already carries a mapped kind and a Vietnamese message from
 * core, so it passes through. Anything else is unexpected and reported as
 * `unknown` rather than guessed at — a wrong diagnosis sends the user to the
 * wrong fix.
 */
export function describeSprintError(err: unknown): { errorKind: JiraErrorKind; errorMessage: string } {
  if (err instanceof JiraApiError) {
    return { errorKind: err.kind, errorMessage: err.message };
  }
  return {
    errorKind: 'unknown',
    errorMessage: err instanceof Error ? err.message : String(err),
  };
}

/**
 * Guidance for the error banner: what the user can actually do about this kind
 * of failure. The banner shows this next to the raw Jira message.
 */
export function remedyFor(kind: JiraErrorKind): string {
  switch (kind) {
    case 'auth':
      return 'Cập nhật API token (AIDLC: Connect Jira).';
    case 'forbidden':
      return 'Account thiếu quyền — kiểm tra quyền project trên Jira.';
    case 'not_found':
      return 'Kiểm tra lại board / sprint đã chọn trong settings.';
    case 'rate_limited':
      return 'Jira đang giới hạn tốc độ — thử lại sau một lúc.';
    case 'timeout':
    case 'network':
      return 'Kiểm tra mạng, rồi thử lại.';
    case 'bad_request':
      return 'JQL hoặc cấu hình sai — kiểm tra `aidlc.jira.jql`.';
    default:
      return 'Xem Output channel “AIDLC” để biết chi tiết.';
  }
}

/**
 * Compose the brief that prefills a new task's description.
 *
 * Acceptance criteria are appended under a heading only when the description did
 * not already contain them — otherwise a ticket that spells out its AC inline
 * would get them twice, and a duplicated requirement list is worse than none
 * for whatever agent reads this next.
 */
export function buildTicketBrief(ticket: JiraTicket): string {
  const parts: string[] = [];
  const description = ticket.descriptionMd.trim();
  if (description) { parts.push(description); }

  if (ticket.acceptanceCriteria.length > 0) {
    const alreadyListed = ticket.acceptanceCriteria.every(
      (criterion) => description.includes(criterion.trim()),
    );
    if (!alreadyListed) {
      parts.push(
        ['Acceptance criteria:', ...ticket.acceptanceCriteria.map((c) => `- ${c}`)].join('\n'),
      );
    }
  }

  // A ticket with neither description nor AC still deserves a usable brief.
  if (parts.length === 0 && ticket.summary.trim()) { parts.push(ticket.summary.trim()); }

  return parts.join('\n\n');
}

export interface BuildSprintStateInput {
  settings: JiraSettings;
  hasToken: boolean;
  scope: SprintScope;
  epics: readonly EpicLinkSource[];
  cache?: SprintCache | null;
  /** Epoch ms used to age the cache. Injected so tests get a fixed clock. */
  nowMs?: number;
  /** Set while a fetch is in flight and there is nothing cached to show. */
  loading?: boolean;
  error?: { errorKind: JiraErrorKind; errorMessage: string } | null;
  /** Live fetch result; when absent, the cache (if any) is used. */
  fetched?: {
    board?: JiraBoard;
    sprint?: JiraSprint;
    boards: JiraBoard[];
    sprints: JiraSprint[];
    tickets: JiraTicket[];
    syncedAt: string;
  } | null;
}

/**
 * Assemble the state the webview renders.
 *
 * The ordering of concerns is deliberate:
 *   1. not configured wins over everything — no point reporting a 401 when the
 *      user has not entered a token yet;
 *   2. a live result wins over the cache;
 *   3. an error still shows cached tickets, flagged `fromCache`, because stale
 *      tickets you can read beat an empty screen — but the UI blocks acting on
 *      them.
 *
 * `stale` is the flag the UI gates writes on, and it is narrower than
 * `fromCache`: only a failed fetch or a cache past its refresh window earns it.
 * Serving a cache the service itself just decided was fresh enough to skip a
 * fetch, then calling that cache untrustworthy, would disable the tab's primary
 * action for the whole refresh window every time the panel is reopened.
 */
export function buildSprintState(input: BuildSprintStateInput): SprintState {
  const { settings, hasToken, scope } = input;
  const base = {
    scope,
    transitionsEnabled: settings.transitionsEnabled,
    subtasksEnabled: settings.subtasksEnabled,
    transitionMapping: settings.transitionMapping,
    transitionConfirm: settings.transitionConfirm,
    connect: { site: settings.site, email: settings.email },
  };

  const missing = missingJiraSettings(settings, hasToken);
  if (missing.length > 0) {
    return { ...EMPTY_SPRINT_STATE, ...base, status: 'unconfigured', missing };
  }

  if (input.fetched) {
    const { fetched } = input;
    return {
      ...base,
      status: 'ready',
      board: fetched.board,
      sprint: fetched.sprint,
      boards: fetched.boards,
      sprints: fetched.sprints,
      tickets: linkTicketsToEpics(fetched.tickets, input.epics),
      lastSyncedAt: fetched.syncedAt,
      fromCache: false,
      stale: false,
    };
  }

  const cache = input.cache ?? null;
  const cached = cache
    ? {
      board: cache.board,
      sprint: cache.sprint,
      boards: cache.boards,
      sprints: cache.sprints,
      tickets: linkTicketsToEpics(cache.tickets, input.epics),
      lastSyncedAt: new Date(cache.savedAt).toISOString(),
      fromCache: true,
      stale: !isCacheFresh(cache, input.nowMs ?? Date.now(), settings.refreshMinutes),
    }
    : { boards: [], sprints: [], tickets: [] as SprintTicket[], stale: false };

  if (input.error) {
    return { ...base, ...cached, status: 'error', ...input.error, stale: true };
  }
  if (input.loading) {
    return { ...base, ...cached, status: 'loading' };
  }
  return { ...base, ...cached, status: cache ? 'ready' : 'loading' };
}
