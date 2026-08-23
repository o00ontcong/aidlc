/**
 * Read Confluence pages with the same Atlassian credentials as Jira.
 *
 * Only reads, and only one page at a time: the single job is fetching the
 * subtask-template page so {@link ../confluence/templateImporter} can turn it
 * into YAML. There is no write path here on purpose — a wiki page is a team
 * document, not something a tool should edit behind their back.
 *
 * The API token is the same one Jira uses; Confluence access depends on the
 * account having it, which shows up as a 403 rather than needing separate setup.
 */

import { JiraApiError, normalizeSite, type FetchLike, type JiraCredentials } from '../jira/JiraClient';

export interface ConfluencePage {
  id: string;
  title: string;
  /** Storage format (XHTML) — what the importer parses. */
  body: string;
  /** Page version, so a re-import can report what changed. */
  version: number;
}

export interface ConfluenceClientOptions {
  credentials: JiraCredentials;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export class ConfluenceClient {
  readonly baseUrl: string;

  private readonly authHeader: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: ConfluenceClientOptions) {
    this.baseUrl = normalizeSite(options.credentials.site);
    if (!this.baseUrl) {
      throw new JiraApiError(
        `Atlassian site không hợp lệ: "${options.credentials.site}".`,
        'bad_request',
      );
    }
    this.authHeader = `Basic ${Buffer.from(
      `${options.credentials.email}:${options.credentials.apiToken}`, 'utf8',
    ).toString('base64')}`;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
    this.fetchImpl = options.fetchImpl ?? globalFetch as FetchLike;
    if (typeof this.fetchImpl !== 'function') {
      throw new JiraApiError('Không có fetch khả dụng (cần Node 20+ hoặc truyền fetchImpl).', 'network');
    }
  }

  /**
   * Fetch one page in storage format. `body-format=storage` returns XHTML,
   * which is easier to walk for structure (headings, lists, code macros) than
   * the ADF variant — and structure is all the importer wants.
   */
  async page(pageId: string): Promise<ConfluencePage> {
    const url = `${this.baseUrl}/wiki/api/v2/pages/${encodeURIComponent(pageId)}?body-format=storage`;
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); }, this.timeoutMs);
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: this.authHeader, Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const name = (err as { name?: unknown })?.name;
      if (name === 'AbortError' || name === 'TimeoutError') {
        throw new JiraApiError(
          `Confluence không trả lời trong ${Math.round(this.timeoutMs / 1000)}s.`, 'timeout',
        );
      }
      throw new JiraApiError(
        `Không kết nối được tới Confluence: ${err instanceof Error ? err.message : String(err)}`,
        'network',
      );
    }
    clearTimeout(timer);

    if (!response.ok) { throw describeConfluenceError(response.status); }

    const text = await response.text();
    let parsed: {
      id?: unknown;
      title?: unknown;
      body?: { storage?: { value?: unknown } };
      version?: { number?: unknown };
    };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new JiraApiError('Confluence trả về nội dung không phải JSON.', 'unknown', response.status);
    }

    const body = typeof parsed.body?.storage?.value === 'string' ? parsed.body.storage.value : '';
    if (!body.trim()) {
      throw new JiraApiError(
        'Trang Confluence không có nội dung storage — có thể là trang trống hoặc account thiếu quyền đọc body.',
        'forbidden',
      );
    }
    return {
      id: String(parsed.id ?? pageId),
      title: typeof parsed.title === 'string' ? parsed.title : '',
      body,
      version: Number(parsed.version?.number) || 0,
    };
  }
}

function describeConfluenceError(status: number): JiraApiError {
  switch (status) {
    case 401:
      return new JiraApiError('Confluence trả 401 — API token sai hoặc đã bị thu hồi.', 'auth', 401);
    case 403:
      return new JiraApiError(
        'Confluence trả 403 — token hợp lệ nhưng account không có quyền đọc trang này '
        + '(quyền Confluence tách khỏi Jira).',
        'forbidden', 403,
      );
    case 404:
      return new JiraApiError(
        'Confluence trả 404 — page id không tồn tại, hoặc trang nằm ở space khác.', 'not_found', 404,
      );
    default:
      return new JiraApiError(
        `Confluence trả ${status}.`, status >= 500 ? 'network' : 'unknown', status,
      );
  }
}

/**
 * Pull the numeric page id out of a Confluence URL.
 *
 * Handles the two shapes Atlassian produces:
 *   /wiki/spaces/STT/pages/19791882/Sub-task
 *   /pages/viewpage.action?pageId=19791882
 *
 * A bare numeric string is accepted as already being an id, so a user can paste
 * either. Returns '' when there is no id to find.
 */
export function parseConfluencePageId(urlOrId: string): string {
  const raw = urlOrId.trim();
  if (!raw) { return ''; }
  if (/^\d+$/.test(raw)) { return raw; }
  const inPath = raw.match(/\/pages\/(\d+)/);
  if (inPath) { return inPath[1]; }
  const inQuery = raw.match(/[?&]pageId=(\d+)/);
  if (inQuery) { return inQuery[1]; }
  return '';
}
