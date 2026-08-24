import { describe, expect, it } from 'vitest';

import { JiraApiError, type JiraTicket } from '@aidlc/core';

import {
  buildSprintState,
  buildTicketBrief,
  countTickets,
  describeSprintError,
  groupTickets,
  isCacheFresh,
  isJiraConfigured,
  linkTicketsToEpics,
  missingJiraSettings,
  remedyFor,
  sprintCacheKey,
  type EpicLinkSource,
  type JiraSettings,
  type SprintCache,
} from '../src/v2/jiraSprintLogic';

const settings = (over: Partial<JiraSettings> = {}): JiraSettings => ({
  site: 'silvertiger.atlassian.net',
  email: 'cong@silvertiger.ae',
  projectKey: 'ACME',
  boardId: 3,
  jql: '',
  refreshMinutes: 10,
  requestTimeoutSeconds: 20,
  transitionsEnabled: false,
  subtasksEnabled: false,
  transitionMapping: { taskCreated: 'In Progress', review: 'In Review', runCompleted: '', runFailed: '' },
  transitionConfirm: true,
  ...over,
});

const ticket = (over: Partial<JiraTicket> = {}): JiraTicket => ({
  key: 'ACME-4830',
  id: '10042',
  type: 'Story',
  typeKind: 'story',
  summary: 'Add SSO logout redirect',
  descriptionMd: '',
  acceptanceCriteria: [],
  status: 'To Do',
  statusCategory: 'todo',
  assigneeAccountId: 'acc-me',
  assigneeName: 'Cong',
  isMine: true,
  points: 3,
  priority: 'P2',
  labels: [],
  parentKey: '',
  parentSummary: '',
  existingSubtasks: [],
  isSubtask: false,
  url: 'https://silvertiger.atlassian.net/browse/ACME-4830',
  updatedAt: '',
  ...over,
});

const epic = (over: Partial<EpicLinkSource> = {}): EpicLinkSource => ({
  id: 'EPIC-012',
  inputs: { jira: 'ACME-4830' },
  status: 'in_progress',
  currentStep: 3,
  stepCount: 7,
  ...over,
});

describe('missingJiraSettings', () => {
  it('reports nothing when site, email and token are present', () => {
    expect(missingJiraSettings(settings(), true)).toEqual([]);
    expect(isJiraConfigured(settings(), true)).toBe(true);
  });

  it('reports the token when it is absent', () => {
    expect(missingJiraSettings(settings(), false)).toEqual(['API token']);
  });

  it('reports every missing piece, in setup order', () => {
    expect(missingJiraSettings(settings({ site: '', email: '  ' }), false))
      .toEqual(['Jira site', 'email', 'API token']);
  });

  it('does not treat a board as required — the JQL path needs none', () => {
    expect(missingJiraSettings(settings({ boardId: 0 }), true)).toEqual([]);
  });
});

describe('sprintCacheKey', () => {
  it('is stable for the same query', () => {
    expect(sprintCacheKey(settings(), 'mine', 24)).toBe(sprintCacheKey(settings(), 'mine', 24));
  });

  it('changes with the scope', () => {
    expect(sprintCacheKey(settings(), 'mine', 24)).not.toBe(sprintCacheKey(settings(), 'team', 24));
  });

  it('changes with the sprint', () => {
    expect(sprintCacheKey(settings(), 'mine', 24)).not.toBe(sprintCacheKey(settings(), 'mine', 25));
  });

  it('changes with the board', () => {
    expect(sprintCacheKey(settings({ boardId: 3 }), 'mine'))
      .not.toBe(sprintCacheKey(settings({ boardId: 4 }), 'mine'));
  });

  it('changes with a JQL override', () => {
    expect(sprintCacheKey(settings(), 'mine'))
      .not.toBe(sprintCacheKey(settings({ jql: 'labels = hotfix' }), 'mine'));
  });

  it('changes with the site, so another site cannot show these tickets', () => {
    expect(sprintCacheKey(settings(), 'mine'))
      .not.toBe(sprintCacheKey(settings({ site: 'other.atlassian.net' }), 'mine'));
  });

  it('ignores case and surrounding whitespace', () => {
    expect(sprintCacheKey(settings({ site: ' SilverTiger.atlassian.net ' }), 'mine'))
      .toBe(sprintCacheKey(settings(), 'mine'));
  });

  it('does not change with refresh or timeout settings — they do not affect results', () => {
    expect(sprintCacheKey(settings({ refreshMinutes: 60, requestTimeoutSeconds: 5 }), 'mine'))
      .toBe(sprintCacheKey(settings(), 'mine'));
  });
});

describe('isCacheFresh', () => {
  const now = 1_700_000_000_000;

  it('is fresh inside the window', () => {
    expect(isCacheFresh({ savedAt: now - 60_000 }, now, 10)).toBe(true);
  });

  it('is stale past the window', () => {
    expect(isCacheFresh({ savedAt: now - 11 * 60_000 }, now, 10)).toBe(false);
  });

  it('never expires when auto-refresh is off', () => {
    expect(isCacheFresh({ savedAt: now - 999 * 60_000 }, now, 0)).toBe(true);
  });

  it('treats a future timestamp as stale, not fresh forever', () => {
    expect(isCacheFresh({ savedAt: now + 60_000 }, now, 10)).toBe(false);
  });
});

describe('linkTicketsToEpics', () => {
  it('links a ticket to the epic whose inputs.jira matches', () => {
    const [linked] = linkTicketsToEpics([ticket()], [epic()]);
    expect(linked.linkedEpicId).toBe('EPIC-012');
    expect(linked.linkedEpicProgress).toBe('step 4/7');
  });

  it('leaves an unlinked ticket alone', () => {
    const [linked] = linkTicketsToEpics([ticket()], [epic({ inputs: { jira: 'ACME-9999' } })]);
    expect(linked.linkedEpicId).toBeUndefined();
  });

  it('matches case-insensitively — the wizard accepts lowercase keys', () => {
    const [linked] = linkTicketsToEpics([ticket()], [epic({ inputs: { jira: 'acme-4830' } })]);
    expect(linked.linkedEpicId).toBe('EPIC-012');
  });

  it('ignores an epic with no jira input', () => {
    const [linked] = linkTicketsToEpics([ticket()], [epic({ inputs: { files: 'src/**' } })]);
    expect(linked.linkedEpicId).toBeUndefined();
  });

  it('says xong for a finished epic', () => {
    const [linked] = linkTicketsToEpics([ticket()], [epic({ status: 'done' })]);
    expect(linked.linkedEpicProgress).toBe('xong');
  });

  it('says lỗi for a failed epic', () => {
    const [linked] = linkTicketsToEpics([ticket()], [epic({ status: 'failed' })]);
    expect(linked.linkedEpicProgress).toBe('lỗi');
  });

  it('clamps a step index past the end', () => {
    const [linked] = linkTicketsToEpics([ticket()], [epic({ currentStep: 99, stepCount: 7 })]);
    expect(linked.linkedEpicProgress).toBe('step 7/7');
  });

  it('falls back to the status when the pipeline has no steps', () => {
    const [linked] = linkTicketsToEpics([ticket()], [epic({ stepCount: 0, status: 'pending' })]);
    expect(linked.linkedEpicProgress).toBe('pending');
  });

  it('resolves a duplicate claim deterministically, last id winning', () => {
    const epics = [epic({ id: 'EPIC-002' }), epic({ id: 'EPIC-001' })];
    expect(linkTicketsToEpics([ticket()], epics)[0].linkedEpicId).toBe('EPIC-002');
    // Reversed input, same answer.
    expect(linkTicketsToEpics([ticket()], [...epics].reverse())[0].linkedEpicId).toBe('EPIC-002');
  });

  it('does not mutate the input tickets', () => {
    const original = ticket();
    linkTicketsToEpics([original], [epic()]);
    expect('linkedEpicId' in original).toBe(false);
  });
});

describe('groupTickets', () => {
  it('buckets by status category, not status name', () => {
    const groups = groupTickets([
      { ...ticket({ key: 'A-1', status: 'Ready for QA', statusCategory: 'inprogress' }) },
      { ...ticket({ key: 'A-2', status: 'Đang review', statusCategory: 'inprogress' }) },
      { ...ticket({ key: 'A-3', statusCategory: 'todo' }) },
      { ...ticket({ key: 'A-4', statusCategory: 'done' }) },
    ]);
    expect(groups.in_progress.map((t) => t.key)).toEqual(['A-1', 'A-2']);
    expect(groups.todo.map((t) => t.key)).toEqual(['A-3']);
    expect(groups.closing.map((t) => t.key)).toEqual(['A-4']);
  });

  it('preserves the incoming order inside a group', () => {
    const groups = groupTickets([
      { ...ticket({ key: 'A-2' }) },
      { ...ticket({ key: 'A-1' }) },
    ]);
    expect(groups.todo.map((t) => t.key)).toEqual(['A-2', 'A-1']);
  });

  it('returns empty groups for no tickets', () => {
    expect(groupTickets([])).toEqual({ in_progress: [], todo: [], closing: [] });
  });
});

describe('countTickets', () => {
  it('counts totals, per status and unlinked', () => {
    const counts = countTickets([
      { ...ticket({ key: 'A-1', status: 'To Do' }) },
      { ...ticket({ key: 'A-2', status: 'To Do' }), linkedEpicId: 'EPIC-1' },
      { ...ticket({ key: 'A-3', status: 'In Progress' }) },
    ]);
    expect(counts.all).toBe(3);
    expect(counts.unlinked).toBe(2);
    expect(counts.byStatus).toEqual([
      { status: 'To Do', count: 2 },
      { status: 'In Progress', count: 1 },
    ]);
  });

  it('labels a blank status rather than dropping it', () => {
    expect(countTickets([{ ...ticket({ status: '' }) }]).byStatus).toEqual([{ status: '—', count: 1 }]);
  });
});

describe('describeSprintError', () => {
  it('passes a JiraApiError kind and message through', () => {
    const err = new JiraApiError('Jira trả 401 — token sai.', 'auth', 401);
    expect(describeSprintError(err)).toEqual({ errorKind: 'auth', errorMessage: 'Jira trả 401 — token sai.' });
  });

  it('reports an unexpected error as unknown rather than guessing', () => {
    expect(describeSprintError(new TypeError('boom')))
      .toEqual({ errorKind: 'unknown', errorMessage: 'boom' });
  });

  it('stringifies a non-Error throw', () => {
    expect(describeSprintError('nope').errorMessage).toBe('nope');
  });
});

describe('remedyFor', () => {
  it('points an auth failure at the token, not at permissions', () => {
    expect(remedyFor('auth')).toMatch(/token/i);
  });

  it('distinguishes forbidden from auth', () => {
    expect(remedyFor('forbidden')).toMatch(/quyền/);
    expect(remedyFor('forbidden')).not.toBe(remedyFor('auth'));
  });

  it('has advice for every kind', () => {
    for (const kind of ['auth', 'forbidden', 'not_found', 'rate_limited', 'timeout', 'network', 'bad_request', 'unknown'] as const) {
      expect(remedyFor(kind).length, kind).toBeGreaterThan(0);
    }
  });
});

describe('buildTicketBrief', () => {
  it('uses the description on its own when there are no criteria', () => {
    expect(buildTicketBrief(ticket({ descriptionMd: 'Fix the redirect.' })))
      .toBe('Fix the redirect.');
  });

  it('appends criteria under a heading', () => {
    const brief = buildTicketBrief(ticket({
      descriptionMd: 'Fix the redirect.',
      acceptanceCriteria: ['Lands on /goodbye', 'Cookie cleared'],
    }));
    expect(brief).toBe(
      'Fix the redirect.\n\nAcceptance criteria:\n- Lands on /goodbye\n- Cookie cleared',
    );
  });

  it('does not duplicate criteria the description already lists', () => {
    const brief = buildTicketBrief(ticket({
      descriptionMd: 'Context.\n\n### Acceptance Criteria\n- Lands on /goodbye',
      acceptanceCriteria: ['Lands on /goodbye'],
    }));
    expect(brief.match(/Lands on \/goodbye/g)).toHaveLength(1);
  });

  it('appends when only some criteria appear inline — partial is not duplicated enough', () => {
    const brief = buildTicketBrief(ticket({
      descriptionMd: 'Mentions Lands on /goodbye somewhere.',
      acceptanceCriteria: ['Lands on /goodbye', 'Cookie cleared'],
    }));
    expect(brief).toContain('Acceptance criteria:');
  });

  it('falls back to the summary when the ticket has nothing else', () => {
    expect(buildTicketBrief(ticket({ descriptionMd: '', acceptanceCriteria: [] })))
      .toBe('Add SSO logout redirect');
  });

  it('returns criteria alone when there is no description', () => {
    expect(buildTicketBrief(ticket({ descriptionMd: '', acceptanceCriteria: ['One'] })))
      .toBe('Acceptance criteria:\n- One');
  });

  it('returns empty for a ticket with no text at all', () => {
    expect(buildTicketBrief(ticket({ summary: '', descriptionMd: '', acceptanceCriteria: [] })))
      .toBe('');
  });
});

describe('buildSprintState', () => {
  // Four minutes after the cache below was written — inside the 10-minute
  // refresh window, which is the ordinary state of the tab.
  const NOW = Date.UTC(2026, 7, 22, 9, 4, 0);
  const base = {
    settings: settings(),
    hasToken: true,
    scope: 'mine' as const,
    epics: [epic()],
    nowMs: NOW,
  };

  const cache = (over: Partial<SprintCache> = {}): SprintCache => ({
    key: 'k',
    savedAt: Date.UTC(2026, 7, 22, 9, 0, 0),
    scope: 'mine',
    boards: [{ id: 3, name: 'ACME Web' }],
    sprints: [],
    tickets: [ticket()],
    ...over,
  });

  it('is unconfigured before credentials exist, and says what is missing', () => {
    const state = buildSprintState({ ...base, hasToken: false });
    expect(state.status).toBe('unconfigured');
    expect(state.missing).toEqual(['API token']);
    expect(state.tickets).toEqual([]);
  });

  it('reports unconfigured even when a fetch result is present — order matters', () => {
    // No point reporting a stale success when the user has no token now.
    const state = buildSprintState({
      ...base,
      hasToken: false,
      fetched: { boards: [], sprints: [], tickets: [ticket()], syncedAt: 'now' },
    });
    expect(state.status).toBe('unconfigured');
  });

  it('prefers a live fetch over the cache', () => {
    const state = buildSprintState({
      ...base,
      cache: cache({ tickets: [ticket({ key: 'OLD-1' })] }),
      fetched: {
        boards: [], sprints: [], tickets: [ticket({ key: 'NEW-1' })], syncedAt: '2026-08-22T10:00:00.000Z',
      },
    });
    expect(state.status).toBe('ready');
    expect(state.tickets.map((t) => t.key)).toEqual(['NEW-1']);
    expect(state.fromCache).toBe(false);
    expect(state.stale).toBe(false);
    expect(state.lastSyncedAt).toBe('2026-08-22T10:00:00.000Z');
  });

  it('links epics into fetched tickets', () => {
    const state = buildSprintState({
      ...base,
      fetched: { boards: [], sprints: [], tickets: [ticket()], syncedAt: 'now' },
    });
    expect(state.tickets[0].linkedEpicId).toBe('EPIC-012');
  });

  it('serves the cache as ready, flagged fromCache, with its own timestamp', () => {
    const state = buildSprintState({ ...base, cache: cache() });
    expect(state.status).toBe('ready');
    expect(state.fromCache).toBe(true);
    expect(state.lastSyncedAt).toBe('2026-08-22T09:00:00.000Z');
    expect(state.boards).toEqual([{ id: 3, name: 'ACME Web' }]);
  });

  // The bug this guards: `fromCache` used to imply `stale`, so reopening the tab
  // inside the refresh window served the cache and disabled "Start task in
  // AIDLC" — for data the service had just decided was fresh enough to reuse.
  it('does not call a cache inside the refresh window stale', () => {
    const state = buildSprintState({ ...base, cache: cache() });
    expect(state.fromCache).toBe(true);
    expect(state.stale).toBe(false);
  });

  it('calls a cache past the refresh window stale', () => {
    const state = buildSprintState({
      ...base,
      cache: cache(),
      nowMs: Date.UTC(2026, 7, 22, 9, 30, 0),
    });
    expect(state.status).toBe('ready');
    expect(state.fromCache).toBe(true);
    expect(state.stale).toBe(true);
  });

  it('never expires the cache when auto-refresh is off', () => {
    // refreshMinutes <= 0 hands freshness to the user; the actions stay live
    // until they refresh by hand, rather than dying on a hidden timer.
    const state = buildSprintState({
      ...base,
      settings: settings({ refreshMinutes: 0 }),
      cache: cache(),
      nowMs: Date.UTC(2026, 7, 23, 9, 0, 0),
    });
    expect(state.stale).toBe(false);
  });

  it('treats a cache saved in the future as stale', () => {
    const state = buildSprintState({
      ...base,
      cache: cache({ savedAt: Date.UTC(2026, 7, 22, 10, 0, 0) }),
    });
    expect(state.stale).toBe(true);
  });

  it('loads when configured with nothing cached yet', () => {
    const state = buildSprintState({ ...base, cache: null });
    expect(state.status).toBe('loading');
    expect(state.tickets).toEqual([]);
  });

  it('keeps showing cached tickets during a refresh', () => {
    const state = buildSprintState({ ...base, cache: cache(), loading: true });
    expect(state.status).toBe('loading');
    expect(state.tickets).toHaveLength(1);
    expect(state.fromCache).toBe(true);
    expect(state.stale).toBe(false);
  });

  it('shows cached tickets alongside an error, flagged as cached', () => {
    const state = buildSprintState({
      ...base,
      cache: cache(),
      error: { errorKind: 'auth', errorMessage: '401' },
    });
    expect(state.status).toBe('error');
    expect(state.errorKind).toBe('auth');
    expect(state.tickets).toHaveLength(1);
    expect(state.fromCache).toBe(true);
    // A fetch we could not complete makes even a young cache unverified.
    expect(state.stale).toBe(true);
  });

  it('errors with no tickets when there is no cache to fall back on', () => {
    const state = buildSprintState({
      ...base,
      cache: null,
      error: { errorKind: 'timeout', errorMessage: 'slow' },
    });
    expect(state.status).toBe('error');
    expect(state.tickets).toEqual([]);
  });

  it('mirrors the transition mapping so the panel renders without a round trip', () => {
    const state = buildSprintState({
      ...base,
      settings: settings({
        transitionMapping: { taskCreated: 'Doing', review: 'QA', runCompleted: 'Done', runFailed: '' },
        transitionConfirm: false,
      }),
      cache: cache(),
    });
    expect(state.transitionMapping).toEqual({
      taskCreated: 'Doing', review: 'QA', runCompleted: 'Done', runFailed: '',
    });
    expect(state.transitionConfirm).toBe(false);
  });

  it('carries the mapping through the unconfigured branch too', () => {
    // The panel is reachable before Jira is connected; it must not render blanks.
    const state = buildSprintState({ ...base, hasToken: false });
    expect(state.transitionMapping.taskCreated).toBe('In Progress');
  });

  it('mirrors the write-toggle settings so the UI can gate its buttons', () => {
    const state = buildSprintState({
      ...base,
      settings: settings({ transitionsEnabled: true, subtasksEnabled: true }),
      cache: cache(),
    });
    expect(state.transitionsEnabled).toBe(true);
    expect(state.subtasksEnabled).toBe(true);
  });

  it('carries the scope through every branch', () => {
    for (const input of [
      { ...base, hasToken: false },
      { ...base, cache: cache() },
      { ...base, cache: null },
      { ...base, error: { errorKind: 'auth' as const, errorMessage: 'x' } },
    ]) {
      expect(buildSprintState({ ...input, scope: 'team' }).scope).toBe('team');
    }
  });

  it('never carries the API token into the state sent to the webview', () => {
    // The token is the credential, and it is structurally impossible for it to
    // land here: JiraSettings has no token field at all — the service reads it
    // separately from SecretStorage and passes only `hasToken: boolean`.
    const state = buildSprintState({ ...base, cache: cache() });
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain('token');
    expect(Object.keys(settings())).not.toContain('apiToken');
  });

  it('does carry site and email — the connect dialog prefills from them', () => {
    // Not a leak: both are ordinary settings, already visible in the Settings
    // UI and committed to settings.json. Withholding them would only mean the
    // user retypes their own site every time they fix a token.
    const state = buildSprintState({ ...base, cache: cache() });
    expect(state.connect).toEqual({
      site: 'silvertiger.atlassian.net',
      email: 'cong@silvertiger.ae',
    });
  });

  it('offers the connect prefill even before anything is configured', () => {
    const state = buildSprintState({ ...base, hasToken: false, settings: settings({ email: '' }) });
    expect(state.status).toBe('unconfigured');
    expect(state.connect.site).toBe('silvertiger.atlassian.net');
    expect(state.connect.email).toBe('');
  });
});
