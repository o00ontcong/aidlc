/**
 * The only place in the Jira integration that touches the network.
 *
 * Everything above it (JQL building, issue parsing, transition selection,
 * subtask planning) is pure and unit-tested; this file concentrates the parts
 * that can only be got right by being careful:
 *
 *   - **One error vocabulary.** HTTP status → {@link JiraErrorKind} happens here
 *     and nowhere else, so no call site re-derives "is this my token, my
 *     permissions, or the network".
 *   - **429 with `Retry-After`.** Jira Cloud rate-limits on request *cost*, so a
 *     board sync can trip it even at low request counts. We honour the header
 *     for a bounded number of retries, then surface `rate_limited` rather than
 *     spinning.
 *   - **Pagination.** The Agile API pages with `startAt`/`isLast`; the newer
 *     JQL search pages with an opaque `nextPageToken`. Callers get complete
 *     arrays and never see either scheme.
 *
 * `fetch` and `sleep` are injectable so tests exercise all of this without a
 * network or real delays. Node 20 supplies global `fetch`, so there is no new
 * dependency.
 */

import type {
  JiraErrorKind,
  JiraSelf,
  RawJiraBoard,
  RawJiraField,
  RawJiraIssue,
  RawJiraSprint,
  RawJiraTransition,
} from './JiraTypes';
import type { CreateMetaField, CreateMetaIssueType } from './createMeta';

export interface JiraCredentials {
  /** `acme.atlassian.net`, with or without scheme. */
  site: string;
  email: string;
  apiToken: string;
}

export type FetchLike = (url: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface JiraClientOptions {
  credentials: JiraCredentials;
  /** Per-request budget. Default 20s, matching `aidlc.jira.requestTimeoutSeconds`. */
  timeoutMs?: number;
  /** Retries on 429 only. Default 2 — enough for a burst, short of a hang. */
  maxRetries?: number;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

export class JiraApiError extends Error {
  constructor(
    message: string,
    public readonly kind: JiraErrorKind,
    public readonly status?: number,
    /** `errorMessages` / `errors` from the Jira body, when it sent any. */
    public readonly jiraMessages: string[] = [],
  ) {
    super(message);
    this.name = 'JiraApiError';
  }
}

/** Result of one bulk-create element, mapped back to the caller's index. */
export interface BulkCreateOutcome {
  index: number;
  key?: string;
  id?: string;
  /** Present when this element failed; the rest of the batch may still exist. */
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 2;
/** Cap on a `Retry-After` we are willing to honour before giving up. */
const MAX_RETRY_AFTER_MS = 30_000;
/** Jira's own ceiling for `maxResults` on the endpoints we use. */
const PAGE_SIZE = 100;
/** Jira rejects a bulk create over 50 elements. */
export const BULK_CREATE_LIMIT = 50;

/**
 * Normalize a site into an origin: accepts `acme.atlassian.net`,
 * `https://acme.atlassian.net`, or either with a trailing slash or path.
 *
 * Returns '' for anything that is not a real host. The hostname check matters:
 * `new URL()` happily turns the fragment `http://` into the origin
 * `https://http`, which would then fail later as a DNS or 404 error and send the
 * user hunting for a permissions problem they do not have. Better to reject it
 * at the point where we can still say "that is not a site".
 */
export function normalizeSite(site: string): string {
  const trimmed = site.trim().replace(/\/+$/, '');
  if (!trimmed) { return ''; }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    // A dotted host, or localhost for a proxy / test rig. Anything else is a
    // typo, not a site.
    const host = url.hostname;
    if (host !== 'localhost' && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) { return ''; }
    return url.origin;
  } catch {
    return '';
  }
}

export class JiraClient {
  readonly baseUrl: string;

  private readonly authHeader: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: JiraClientOptions) {
    const { credentials } = options;
    this.baseUrl = normalizeSite(credentials.site);
    if (!this.baseUrl) {
      throw new JiraApiError(
        `Jira site không hợp lệ: "${credentials.site}". Ví dụ đúng: acme.atlassian.net`,
        'bad_request',
      );
    }
    // Basic auth with email + API token is the supported scheme for Jira Cloud.
    this.authHeader = `Basic ${Buffer.from(`${credentials.email}:${credentials.apiToken}`, 'utf8').toString('base64')}`;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
    this.fetchImpl = options.fetchImpl ?? globalFetch as FetchLike;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => { setTimeout(resolve, ms); }));
    if (typeof this.fetchImpl !== 'function') {
      throw new JiraApiError('Không có fetch khả dụng (cần Node 20+ hoặc truyền fetchImpl).', 'network');
    }
  }

  // ─── endpoints ────────────────────────────────────────────────────────────

  /** Authenticated account. Cheapest call that proves the credentials work. */
  async myself(): Promise<JiraSelf> {
    const raw = await this.request<{ accountId?: string; displayName?: string; emailAddress?: string }>(
      'GET', '/rest/api/3/myself',
    );
    return {
      accountId: (raw.accountId ?? '').trim(),
      displayName: (raw.displayName ?? '').trim(),
      emailAddress: (raw.emailAddress ?? '').trim(),
    };
  }

  /** All fields, so the caller can resolve the story-points custom field. */
  async fields(): Promise<RawJiraField[]> {
    const raw = await this.request<RawJiraField[]>('GET', '/rest/api/3/field');
    return Array.isArray(raw) ? raw : [];
  }

  /** Scrum boards, optionally narrowed to a project. */
  async boards(projectKey?: string): Promise<RawJiraBoard[]> {
    const query = new URLSearchParams({ type: 'scrum', maxResults: String(PAGE_SIZE) });
    if (projectKey?.trim()) { query.set('projectKeyOrId', projectKey.trim()); }
    return this.pageAgile<RawJiraBoard>(`/rest/agile/1.0/board?${query}`);
  }

  /** Sprints on a board. `states` maps to the API's comma-separated `state`. */
  async sprints(boardId: number, states: string[] = ['active', 'future']): Promise<RawJiraSprint[]> {
    const query = new URLSearchParams({ state: states.join(','), maxResults: String(PAGE_SIZE) });
    return this.pageAgile<RawJiraSprint>(`/rest/agile/1.0/board/${boardId}/sprint?${query}`);
  }

  /**
   * Issues in one sprint. `jql` narrows the sprint's contents further (for
   * example to the current user) without a second round trip.
   */
  async sprintIssues(sprintId: number, fields: string, jql?: string): Promise<RawJiraIssue[]> {
    const query = new URLSearchParams({ fields, maxResults: String(PAGE_SIZE) });
    if (jql?.trim()) { query.set('jql', jql.trim()); }
    return this.pageAgile<RawJiraIssue>(`/rest/agile/1.0/sprint/${sprintId}/issue?${query}`, 'issues');
  }

  /**
   * Search by JQL — the board-independent path, used when we could not resolve
   * a board. Uses `POST /rest/api/3/search/jql`; the older `GET
   * /rest/api/3/search` is deprecated and pages differently.
   */
  async searchJql(jql: string, fields: string): Promise<RawJiraIssue[]> {
    const out: RawJiraIssue[] = [];
    let nextPageToken: string | undefined;
    // Bounded so a server that always returns a token cannot loop forever.
    for (let page = 0; page < 50; page += 1) {
      const body: Record<string, unknown> = {
        jql,
        maxResults: PAGE_SIZE,
        fields: fields.split(',').filter(Boolean),
      };
      if (nextPageToken) { body.nextPageToken = nextPageToken; }
      const raw = await this.request<{ issues?: RawJiraIssue[]; nextPageToken?: string; isLast?: boolean }>(
        'POST', '/rest/api/3/search/jql', body,
      );
      out.push(...(Array.isArray(raw.issues) ? raw.issues : []));
      if (raw.isLast === true || !raw.nextPageToken) { break; }
      nextPageToken = raw.nextPageToken;
    }
    return out;
  }

  /** One issue, for refreshing a single ticket after a write. */
  async issue(key: string, fields: string): Promise<RawJiraIssue> {
    return this.request<RawJiraIssue>(
      'GET', `/rest/api/3/issue/${encodeURIComponent(key)}?fields=${encodeURIComponent(fields)}`,
    );
  }

  /** Transitions available for THIS issue right now — never cache these. */
  async transitions(key: string): Promise<RawJiraTransition[]> {
    const raw = await this.request<{ transitions?: RawJiraTransition[] }>(
      'GET', `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,
    );
    return Array.isArray(raw.transitions) ? raw.transitions : [];
  }

  /** Perform a transition. Jira answers 204 with no body. */
  async transitionIssue(key: string, transitionId: string): Promise<void> {
    await this.request<void>(
      'POST', `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,
      { transition: { id: transitionId } },
    );
  }

  /** Issue types + field metadata for a project, including what is required. */
  async createMetaIssueTypes(projectKey: string): Promise<CreateMetaIssueType[]> {
    const raw = await this.request<{ issueTypes?: CreateMetaIssueType[] }>(
      'GET', `/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`,
    );
    return Array.isArray(raw.issueTypes) ? raw.issueTypes : [];
  }

  /** Field metadata for one issue type of a project. */
  async createMetaFields(
    projectKey: string,
    issueTypeId: string,
  ): Promise<Record<string, CreateMetaField>> {
    const raw = await this.request<{ fields?: CreateMetaField[] }>(
      'GET',
      `/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}`
      + `/issuetypes/${encodeURIComponent(issueTypeId)}?maxResults=200`,
    );
    // This endpoint returns an array; the rest of the code wants it keyed by id.
    const byId: Record<string, CreateMetaField> = {};
    for (const field of Array.isArray(raw.fields) ? raw.fields : []) {
      const id = String(field.fieldId ?? '').trim();
      if (id) { byId[id] = field; }
    }
    return byId;
  }

  /**
   * Create several issues in one call.
   *
   * Bulk create is **partially successful** by design: Jira answers with an
   * `issues` array and an `errors` array, the latter carrying
   * `failedElementNumber`. We map both back onto the caller's indices so the UI
   * can say "3 created, 1 failed because X" and the ledger can record exactly
   * what exists. Reporting one aggregate error here would make a retry create
   * duplicates.
   */
  async createIssuesBulk(payloads: ReadonlyArray<Record<string, unknown>>): Promise<BulkCreateOutcome[]> {
    if (payloads.length === 0) { return []; }
    if (payloads.length > BULK_CREATE_LIMIT) {
      throw new JiraApiError(
        `Bulk create tối đa ${BULK_CREATE_LIMIT} issue một lần (đang gửi ${payloads.length}).`,
        'bad_request',
      );
    }

    const raw = await this.request<{
      issues?: Array<{ id?: string; key?: string }>;
      errors?: Array<{
        failedElementNumber?: number;
        status?: number;
        elementErrors?: { errorMessages?: string[]; errors?: Record<string, string> };
      }>;
    }>('POST', '/rest/api/3/issue/bulk', { issueUpdates: payloads.map((fields) => ({ fields })) });

    const failures = new Map<number, string>();
    for (const err of Array.isArray(raw.errors) ? raw.errors : []) {
      const index = Number(err?.failedElementNumber);
      if (!Number.isFinite(index)) { continue; }
      failures.set(index, describeJiraErrors(err.elementErrors) || `Jira trả lỗi ${err.status ?? ''}`.trim());
    }

    // Jira returns created issues in submission order, skipping failed ones.
    const created = Array.isArray(raw.issues) ? raw.issues : [];
    let createdCursor = 0;
    return payloads.map((_, index) => {
      const error = failures.get(index);
      if (error) { return { index, error }; }
      const made = created[createdCursor++];
      return made
        ? { index, key: (made.key ?? '').trim(), id: (made.id ?? '').trim() }
        : { index, error: 'Jira không báo lỗi nhưng cũng không trả issue nào cho mục này.' };
    });
  }

  // ─── plumbing ─────────────────────────────────────────────────────────────

  /**
   * Page an Agile API list. These endpoints use `startAt` + `isLast`, and some
   * omit `isLast` entirely — hence also stopping when a page comes back short.
   */
  private async pageAgile<T>(pathWithQuery: string, key = 'values'): Promise<T[]> {
    const out: T[] = [];
    for (let startAt = 0, page = 0; page < 50; page += 1) {
      const separator = pathWithQuery.includes('?') ? '&' : '?';
      const raw = await this.request<Record<string, unknown>>(
        'GET', `${pathWithQuery}${separator}startAt=${startAt}`,
      );
      const values = raw[key];
      const batch = Array.isArray(values) ? (values as T[]) : [];
      out.push(...batch);
      const isLast = raw.isLast === true;
      if (isLast || batch.length === 0 || batch.length < PAGE_SIZE) { break; }
      startAt += batch.length;
    }
    return out;
  }

  /** One HTTP round trip, with timeout, 429 retry and error mapping. */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let lastRateLimit: JiraApiError | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => { controller.abort(); }, this.timeoutMs);
      let response: Awaited<ReturnType<FetchLike>>;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: {
            Authorization: this.authHeader,
            Accept: 'application/json',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        throw describeTransportError(err, this.timeoutMs);
      }
      clearTimeout(timer);

      if (response.ok) {
        const text = await response.text();
        if (!text.trim()) { return undefined as T; }  // 204, e.g. a transition
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new JiraApiError('Jira trả về nội dung không phải JSON.', 'unknown', response.status);
        }
      }

      if (response.status === 429 && attempt < this.maxRetries) {
        const waitMs = retryAfterMs(response.headers.get('Retry-After'), attempt);
        lastRateLimit = new JiraApiError(
          'Jira đang giới hạn tốc độ (429).', 'rate_limited', 429,
        );
        await this.sleep(waitMs);
        continue;
      }

      throw await describeHttpError(response);
    }

    // Retries exhausted on 429.
    throw lastRateLimit ?? new JiraApiError('Jira đang giới hạn tốc độ (429).', 'rate_limited', 429);
  }
}

/**
 * `Retry-After` is seconds or an HTTP date. Fall back to exponential backoff
 * when it is absent or unparseable, and cap it — a header asking for ten
 * minutes should surface as an error, not a hang.
 */
export function retryAfterMs(header: string | null, attempt: number): number {
  const fallback = Math.min(MAX_RETRY_AFTER_MS, 1_000 * 2 ** attempt);
  if (!header) { return fallback; }
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_AFTER_MS, seconds * 1_000);
  }
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, date - Date.now()));
  }
  return fallback;
}

/** Map an HTTP failure onto our vocabulary, keeping Jira's own message. */
async function describeHttpError(response: {
  status: number;
  text(): Promise<string>;
}): Promise<JiraApiError> {
  let messages: string[] = [];
  try {
    const text = await response.text();
    if (text.trim()) {
      const parsed = JSON.parse(text) as { errorMessages?: string[]; errors?: Record<string, string> };
      messages = collectJiraMessages(parsed);
    }
  } catch {
    // A non-JSON error body (an HTML proxy page) tells us nothing useful.
  }
  const detail = messages.length > 0 ? ` ${messages.join(' ')}` : '';

  switch (response.status) {
    case 401:
      return new JiraApiError(
        `Jira trả 401 — API token sai, hết hạn hoặc đã bị thu hồi.${detail}`,
        'auth', 401, messages,
      );
    case 403:
      return new JiraApiError(
        `Jira trả 403 — account đăng nhập được nhưng không có quyền cho thao tác này.${detail}`,
        'forbidden', 403, messages,
      );
    case 404:
      return new JiraApiError(
        `Jira trả 404 — board / sprint / issue không tồn tại hoặc không thấy được.${detail}`,
        'not_found', 404, messages,
      );
    case 429:
      return new JiraApiError(`Jira đang giới hạn tốc độ (429).${detail}`, 'rate_limited', 429, messages);
    case 400:
    case 422:
      return new JiraApiError(
        `Jira từ chối payload (${response.status}).${detail}`,
        'bad_request', response.status, messages,
      );
    default:
      return new JiraApiError(
        `Jira trả ${response.status}.${detail}`,
        response.status >= 500 ? 'network' : 'unknown',
        response.status,
        messages,
      );
  }
}

function describeTransportError(err: unknown, timeoutMs: number): JiraApiError {
  const name = (err as { name?: unknown })?.name;
  if (name === 'AbortError' || name === 'TimeoutError') {
    return new JiraApiError(
      `Jira không trả lời trong ${Math.round(timeoutMs / 1000)}s.`, 'timeout',
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return new JiraApiError(`Không kết nối được tới Jira: ${message}`, 'network');
}

function collectJiraMessages(body: {
  errorMessages?: string[];
  errors?: Record<string, string>;
} | undefined): string[] {
  const out: string[] = [];
  for (const message of body?.errorMessages ?? []) {
    if (typeof message === 'string' && message.trim()) { out.push(message.trim()); }
  }
  for (const [field, message] of Object.entries(body?.errors ?? {})) {
    if (typeof message === 'string' && message.trim()) { out.push(`${field}: ${message.trim()}`); }
  }
  return out;
}

/** Flatten one bulk-create element's errors into a sentence. */
export function describeJiraErrors(body: {
  errorMessages?: string[];
  errors?: Record<string, string>;
} | undefined): string {
  return collectJiraMessages(body).join(' ');
}
