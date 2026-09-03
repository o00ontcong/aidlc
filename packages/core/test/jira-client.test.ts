import { describe, it, expect, vi } from 'vitest';

import {
  BULK_CREATE_LIMIT,
  JiraApiError,
  JiraClient,
  normalizeSite,
  retryAfterMs,
  type FetchLike,
} from '../src/integrations/jira/JiraClient';

/** One canned HTTP reply. */
interface Reply {
  status?: number;
  body?: unknown;
  /** Raw body, for testing non-JSON responses. */
  text?: string;
  headers?: Record<string, string>;
}

interface Call { url: string; method: string; body?: unknown }

/** Fetch stub that replays `replies` in order and records every call. */
function stubFetch(replies: Reply[]): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(init.body) : undefined,
    });
    const reply = replies[Math.min(i++, replies.length - 1)] ?? {};
    const status = reply.status ?? 200;
    const text = reply.text ?? (reply.body === undefined ? '' : JSON.stringify(reply.body));
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => reply.headers?.[name] ?? reply.headers?.[name.toLowerCase()] ?? null },
      text: async () => text,
    };
  };
  return { fetchImpl, calls };
}

const client = (replies: Reply[], over: Record<string, unknown> = {}) => {
  const { fetchImpl, calls } = stubFetch(replies);
  const c = new JiraClient({
    credentials: { site: 'acme.atlassian.net', email: 'me@acme.test', apiToken: 'tok' },
    fetchImpl,
    sleep: async () => {},
    ...over,
  });
  return { c, calls };
};

describe('normalizeSite', () => {
  it('accepts a bare host', () => {
    expect(normalizeSite('acme.atlassian.net')).toBe('https://acme.atlassian.net');
  });

  it('accepts a full URL and drops the path', () => {
    expect(normalizeSite('https://acme.atlassian.net/jira/boards')).toBe('https://acme.atlassian.net');
  });

  it('strips a trailing slash', () => {
    expect(normalizeSite('https://acme.atlassian.net/')).toBe('https://acme.atlassian.net');
  });

  it('returns empty for junk', () => {
    expect(normalizeSite('')).toBe('');
    expect(normalizeSite('   ')).toBe('');
  });

  it('rejects a scheme fragment instead of inventing the host "http"', () => {
    expect(normalizeSite('http://')).toBe('');
    expect(normalizeSite('https://')).toBe('');
  });

  it('rejects a bare word with no domain — that is a typo, not a site', () => {
    expect(normalizeSite('acme')).toBe('');
  });

  it('allows localhost for a proxy or test rig', () => {
    expect(normalizeSite('http://localhost:8080')).toBe('http://localhost:8080');
  });
});

describe('constructor', () => {
  it('rejects an unusable site with a readable message', () => {
    expect(() => new JiraClient({
      credentials: { site: '  ', email: 'a', apiToken: 'b' },
      fetchImpl: stubFetch([]).fetchImpl,
    })).toThrow(/site không hợp lệ/);
  });

  it('sends Basic auth built from email + token', async () => {
    const calls: Call[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, method: init?.method ?? 'GET' });
      expect(init?.headers?.Authorization)
        .toBe(`Basic ${Buffer.from('me@acme.test:tok', 'utf8').toString('base64')}`);
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => '{}' };
    };
    await new JiraClient({
      credentials: { site: 'acme.atlassian.net', email: 'me@acme.test', apiToken: 'tok' },
      fetchImpl,
    }).myself();
    expect(calls).toHaveLength(1);
  });
});

describe('myself', () => {
  it('normalizes the identity payload', async () => {
    const { c } = client([{ body: { accountId: ' acc-1 ', displayName: 'Cong', emailAddress: 'c@x' } }]);
    expect(await c.myself()).toEqual({ accountId: 'acc-1', displayName: 'Cong', emailAddress: 'c@x' });
  });

  it('hits /rest/api/3/myself', async () => {
    const { c, calls } = client([{ body: {} }]);
    await c.myself();
    expect(calls[0].url).toBe('https://acme.atlassian.net/rest/api/3/myself');
  });
});

describe('error mapping', () => {
  const kindFor = async (status: number, body?: unknown) => {
    const { c } = client([{ status, body }]);
    try {
      await c.myself();
      throw new Error('expected a throw');
    } catch (err) {
      return err as JiraApiError;
    }
  };

  it('maps 401 to auth and says the token is the problem', async () => {
    const err = await kindFor(401);
    expect(err.kind).toBe('auth');
    expect(err.message).toMatch(/token/i);
  });

  it('maps 403 to forbidden', async () => {
    expect((await kindFor(403)).kind).toBe('forbidden');
  });

  it('maps 404 to not_found', async () => {
    expect((await kindFor(404)).kind).toBe('not_found');
  });

  it('maps 400 to bad_request', async () => {
    expect((await kindFor(400)).kind).toBe('bad_request');
  });

  it('maps 422 to bad_request', async () => {
    expect((await kindFor(422)).kind).toBe('bad_request');
  });

  it('maps 5xx to network', async () => {
    expect((await kindFor(503)).kind).toBe('network');
  });

  it('keeps Jira errorMessages in the thrown error', async () => {
    const err = await kindFor(400, { errorMessages: ['Field is required.'] });
    expect(err.jiraMessages).toEqual(['Field is required.']);
    expect(err.message).toContain('Field is required.');
  });

  it('keeps per-field errors, prefixed by field', async () => {
    const err = await kindFor(400, { errors: { customfield_1: 'Reviewer is required.' } });
    expect(err.jiraMessages).toEqual(['customfield_1: Reviewer is required.']);
  });

  it('survives a non-JSON error body', async () => {
    const { c } = client([{ status: 502, text: '<html>gateway</html>' }]);
    await expect(c.myself()).rejects.toThrow(/502/);
  });

  it('maps an abort to timeout', async () => {
    const fetchImpl: FetchLike = async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    };
    const c = new JiraClient({
      credentials: { site: 'a.atlassian.net', email: 'e', apiToken: 't' },
      fetchImpl,
      timeoutMs: 5_000,
    });
    await expect(c.myself()).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('maps a transport failure to network', async () => {
    const fetchImpl: FetchLike = async () => { throw new Error('ENOTFOUND'); };
    const c = new JiraClient({
      credentials: { site: 'a.atlassian.net', email: 'e', apiToken: 't' },
      fetchImpl,
    });
    await expect(c.myself()).rejects.toMatchObject({ kind: 'network' });
  });

  it('rejects a 200 with a malformed JSON body', async () => {
    const { c } = client([{ text: '{not json' }]);
    await expect(c.myself()).rejects.toThrow(/không phải JSON/);
  });
});

describe('429 handling', () => {
  it('retries and succeeds', async () => {
    const { c, calls } = client([
      { status: 429, headers: { 'Retry-After': '0' } },
      { body: { accountId: 'acc-1' } },
    ]);
    expect((await c.myself()).accountId).toBe('acc-1');
    expect(calls).toHaveLength(2);
  });

  it('gives up as rate_limited after maxRetries', async () => {
    const { c, calls } = client([{ status: 429, headers: { 'Retry-After': '0' } }], { maxRetries: 2 });
    await expect(c.myself()).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(calls).toHaveLength(3); // initial + 2 retries
  });

  it('honours the Retry-After delay', async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl } = stubFetch([
      { status: 429, headers: { 'Retry-After': '3' } },
      { body: {} },
    ]);
    await new JiraClient({
      credentials: { site: 'a.atlassian.net', email: 'e', apiToken: 't' },
      fetchImpl,
      sleep,
    }).myself();
    expect(sleep).toHaveBeenCalledWith(3_000);
  });

  it('does not retry a 401', async () => {
    const { c, calls } = client([{ status: 401 }]);
    await expect(c.myself()).rejects.toMatchObject({ kind: 'auth' });
    expect(calls).toHaveLength(1);
  });
});

describe('retryAfterMs', () => {
  it('reads a seconds value', () => {
    expect(retryAfterMs('5', 0)).toBe(5_000);
  });

  it('backs off exponentially with no header', () => {
    expect(retryAfterMs(null, 0)).toBe(1_000);
    expect(retryAfterMs(null, 2)).toBe(4_000);
  });

  it('caps an absurd delay so we error instead of hanging', () => {
    expect(retryAfterMs('600', 0)).toBe(30_000);
  });

  it('reads an HTTP-date header', () => {
    const future = new Date(Date.now() + 4_000).toUTCString();
    expect(retryAfterMs(future, 0)).toBeGreaterThan(0);
    expect(retryAfterMs(future, 0)).toBeLessThanOrEqual(30_000);
  });

  it('falls back on an unparseable header', () => {
    expect(retryAfterMs('soon', 1)).toBe(2_000);
  });
});

describe('agile pagination', () => {
  it('stops on a short page', async () => {
    const { c, calls } = client([{ body: { values: [{ id: 1 }, { id: 2 }] } }]);
    expect(await c.boards()).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });

  it('stops when isLast is set', async () => {
    const { c, calls } = client([{ body: { values: [{ id: 1 }], isLast: true } }]);
    await c.boards();
    expect(calls).toHaveLength(1);
  });

  it('follows startAt across a full page', async () => {
    const full = { values: Array.from({ length: 100 }, (_, i) => ({ id: i })) };
    const { c, calls } = client([{ body: full }, { body: { values: [{ id: 100 }] } }]);
    expect(await c.boards()).toHaveLength(101);
    expect(calls[1].url).toContain('startAt=100');
  });

  it('narrows boards to a project when given a key', async () => {
    const { c, calls } = client([{ body: { values: [] } }]);
    await c.boards('ACME');
    expect(calls[0].url).toContain('projectKeyOrId=ACME');
    expect(calls[0].url).toContain('type=scrum');
  });

  it('reads sprint issues from the issues key', async () => {
    const { c, calls } = client([{ body: { issues: [{ key: 'ACME-1' }] } }]);
    expect(await c.sprintIssues(24, 'summary', 'assignee = currentUser()')).toHaveLength(1);
    expect(calls[0].url).toContain('/sprint/24/issue');
    expect(calls[0].url).toContain('jql=assignee');
  });

  it('omits the jql param when not given', async () => {
    const { c, calls } = client([{ body: { issues: [] } }]);
    await c.sprintIssues(24, 'summary');
    expect(calls[0].url).not.toContain('jql=');
  });

  it('requests active and future sprints by default', async () => {
    const { c, calls } = client([{ body: { values: [] } }]);
    await c.sprints(3);
    expect(calls[0].url).toContain('state=active%2Cfuture');
  });
});

describe('searchJql', () => {
  it('POSTs to the non-deprecated /search/jql endpoint', async () => {
    const { c, calls } = client([{ body: { issues: [{ key: 'ACME-1' }], isLast: true } }]);
    await c.searchJql('assignee = currentUser()', 'summary,status');
    expect(calls[0].url).toBe('https://acme.atlassian.net/rest/api/3/search/jql');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toMatchObject({ fields: ['summary', 'status'] });
  });

  it('follows nextPageToken', async () => {
    const { c, calls } = client([
      { body: { issues: [{ key: 'A-1' }], nextPageToken: 'tok2' } },
      { body: { issues: [{ key: 'A-2' }], isLast: true } },
    ]);
    expect(await c.searchJql('x', 'summary')).toHaveLength(2);
    expect((calls[1].body as { nextPageToken?: string }).nextPageToken).toBe('tok2');
  });

  it('stops when no token comes back', async () => {
    const { c, calls } = client([{ body: { issues: [{ key: 'A-1' }] } }]);
    await c.searchJql('x', 'summary');
    expect(calls).toHaveLength(1);
  });
});

describe('createMetaFields', () => {
  it('keys the field array by field id', async () => {
    const { c } = client([{
      body: { fields: [{ fieldId: 'summary', required: true }, { fieldId: 'customfield_1', required: false }] },
    }]);
    const fields = await c.createMetaFields('ACME', '10003');
    expect(Object.keys(fields).sort()).toEqual(['customfield_1', 'summary']);
  });

  it('skips a field with no id', async () => {
    const { c } = client([{ body: { fields: [{ required: true }] } }]);
    expect(await c.createMetaFields('ACME', '1')).toEqual({});
  });
});

describe('createIssuesBulk', () => {
  const payload = (n: number) => Array.from({ length: n }, (_, i) => ({ summary: `s${i}` }));

  it('returns nothing for an empty batch without calling Jira', async () => {
    const { c, calls } = client([]);
    expect(await c.createIssuesBulk([])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('refuses a batch over the Jira limit', async () => {
    const { c } = client([]);
    await expect(c.createIssuesBulk(payload(BULK_CREATE_LIMIT + 1)))
      .rejects.toThrow(new RegExp(String(BULK_CREATE_LIMIT)));
  });

  it('wraps each payload in issueUpdates.fields', async () => {
    const { c, calls } = client([{ body: { issues: [{ id: '1', key: 'A-1' }] } }]);
    await c.createIssuesBulk([{ summary: 'x' }]);
    expect(calls[0].body).toEqual({ issueUpdates: [{ fields: { summary: 'x' } }] });
  });

  it('maps created keys back to indices', async () => {
    const { c } = client([{ body: { issues: [{ id: '1', key: 'A-1' }, { id: '2', key: 'A-2' }] } }]);
    expect(await c.createIssuesBulk(payload(2))).toEqual([
      { index: 0, key: 'A-1', id: '1' },
      { index: 1, key: 'A-2', id: '2' },
    ]);
  });

  it('maps a partial failure onto the right index, keeping the successes', async () => {
    // Element 1 failed; Jira returns only the two successes, in order.
    const { c } = client([{
      body: {
        issues: [{ id: '1', key: 'A-1' }, { id: '3', key: 'A-3' }],
        errors: [{
          failedElementNumber: 1,
          status: 400,
          elementErrors: { errors: { customfield_9: 'Sprint is required.' } },
        }],
      },
    }]);
    const out = await c.createIssuesBulk(payload(3));
    expect(out[0]).toEqual({ index: 0, key: 'A-1', id: '1' });
    expect(out[1].error).toContain('Sprint is required.');
    expect(out[1].key).toBeUndefined();
    expect(out[2]).toEqual({ index: 2, key: 'A-3', id: '3' });
  });

  it('reports an element Jira neither created nor rejected', async () => {
    const { c } = client([{ body: { issues: [] } }]);
    const out = await c.createIssuesBulk(payload(1));
    expect(out[0].error).toMatch(/không trả issue/);
  });

  it('falls back to the status when an element error has no messages', async () => {
    const { c } = client([{
      body: { issues: [], errors: [{ failedElementNumber: 0, status: 403 }] },
    }]);
    expect((await c.createIssuesBulk(payload(1)))[0].error).toContain('403');
  });

  it('ignores an error entry with no element number', async () => {
    const { c } = client([{ body: { issues: [{ key: 'A-1' }], errors: [{ status: 400 }] } }]);
    expect((await c.createIssuesBulk(payload(1)))[0].key).toBe('A-1');
  });
});
