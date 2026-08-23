import { describe, it, expect } from 'vitest';

import {
  buildSprintJql,
  issueFields,
  parseBoard,
  parseIssue,
  parseIssues,
  parseSprint,
  pickCurrentSprint,
  quoteJql,
  resolvePointsFieldId,
  statusCategoryOf,
  typeKindOf,
} from '../src/integrations/jira/sprintQuery';
import type { JiraSprint, RawJiraIssue } from '../src/integrations/jira/JiraTypes';

const CTX = {
  siteBaseUrl: 'https://silvertiger.atlassian.net',
  selfAccountId: 'acc-me',
  pointsFieldId: 'customfield_10016',
};

const issue = (fields: Record<string, unknown> = {}, over: Partial<RawJiraIssue> = {}): RawJiraIssue => ({
  id: '10042',
  key: 'ACME-4830',
  fields: {
    summary: 'Add SSO logout redirect',
    status: { name: 'To Do', statusCategory: { key: 'new' } },
    issuetype: { id: '10001', name: 'Story', subtask: false },
    ...fields,
  },
  ...over,
});

describe('buildSprintJql', () => {
  it('scopes to the current user and open sprints by default', () => {
    expect(buildSprintJql({ scope: 'mine' })).toBe(
      'assignee = currentUser() AND sprint IN openSprints() ORDER BY status ASC, priority DESC',
    );
  });

  it('drops the assignee clause for team scope', () => {
    expect(buildSprintJql({ scope: 'team' })).not.toContain('assignee');
  });

  it('pins one sprint when given an id', () => {
    expect(buildSprintJql({ scope: 'mine', sprintId: 24 })).toContain('sprint = 24');
  });

  it('ignores a non-finite sprint id and falls back to open sprints', () => {
    expect(buildSprintJql({ scope: 'mine', sprintId: Number.NaN })).toContain('openSprints()');
  });

  it('adds a project clause when given a key', () => {
    expect(buildSprintJql({ scope: 'mine', projectKey: 'ACME' })).toContain('project = ACME');
  });

  it('lets an explicit override win outright', () => {
    expect(buildSprintJql({ scope: 'mine', sprintId: 24, override: 'labels = hotfix' }))
      .toBe('labels = hotfix');
  });

  it('ignores a whitespace-only override', () => {
    expect(buildSprintJql({ scope: 'mine', override: '   ' })).toContain('currentUser()');
  });
});

describe('quoteJql', () => {
  it('leaves a plain identifier bare', () => {
    expect(quoteJql('ACME')).toBe('ACME');
  });

  it('quotes a value with a space', () => {
    expect(quoteJql('My Project')).toBe('"My Project"');
  });

  it('escapes embedded quotes and backslashes', () => {
    expect(quoteJql('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  it('quotes a value starting with a digit', () => {
    expect(quoteJql('2024PROJ')).toBe('"2024PROJ"');
  });
});

describe('issueFields', () => {
  it('requests an explicit field list, not *all', () => {
    const fields = issueFields();
    expect(fields).toContain('summary');
    expect(fields).toContain('subtasks');
    expect(fields).not.toContain('*all');
  });

  it('appends the points field when known', () => {
    expect(issueFields('customfield_10016')).toContain('customfield_10016');
  });

  it('omits it when unknown', () => {
    expect(issueFields(null)).not.toContain('customfield');
  });
});

describe('resolvePointsFieldId', () => {
  it('finds Story Points', () => {
    expect(resolvePointsFieldId([
      { id: 'customfield_1', name: 'Sprint' },
      { id: 'customfield_10016', name: 'Story Points' },
    ])).toBe('customfield_10016');
  });

  it('finds the "Story point estimate" spelling', () => {
    expect(resolvePointsFieldId([{ id: 'customfield_10020', name: 'Story point estimate' }]))
      .toBe('customfield_10020');
  });

  it('matches case- and whitespace-insensitively', () => {
    expect(resolvePointsFieldId([{ id: 'cf_9', name: '  STORY POINTS ' }])).toBe('cf_9');
  });

  it('returns null when the site tracks no points — not a hardcoded id', () => {
    expect(resolvePointsFieldId([{ id: 'customfield_1', name: 'Team' }])).toBeNull();
  });

  it('returns null for an empty field list', () => {
    expect(resolvePointsFieldId([])).toBeNull();
  });
});

describe('parseIssue', () => {
  it('normalizes a full issue', () => {
    const t = parseIssue(issue({
      description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body' }] }] },
      priority: { name: 'P2' },
      labels: ['auth', 'frontend'],
      assignee: { accountId: 'acc-me', displayName: 'Cong' },
      parent: { key: 'ACME-4700', fields: { summary: 'Auth hardening' } },
      updated: '2026-08-22T09:00:00.000Z',
      customfield_10016: 3,
    }), CTX)!;

    expect(t.key).toBe('ACME-4830');
    expect(t.summary).toBe('Add SSO logout redirect');
    expect(t.descriptionMd).toBe('body');
    expect(t.status).toBe('To Do');
    expect(t.statusCategory).toBe('todo');
    expect(t.priority).toBe('P2');
    expect(t.labels).toEqual(['auth', 'frontend']);
    expect(t.assigneeName).toBe('Cong');
    expect(t.isMine).toBe(true);
    expect(t.points).toBe(3);
    expect(t.parentKey).toBe('ACME-4700');
    expect(t.parentSummary).toBe('Auth hardening');
    expect(t.url).toBe('https://silvertiger.atlassian.net/browse/ACME-4830');
  });

  it('returns null without a key — an unaddressable issue is useless', () => {
    expect(parseIssue({ id: '1', fields: { summary: 'x' } }, CTX)).toBeNull();
  });

  it('handles a null description', () => {
    const t = parseIssue(issue({ description: null }), CTX)!;
    expect(t.descriptionMd).toBe('');
    expect(t.acceptanceCriteria).toEqual([]);
  });

  it('handles a plain-string description (API v2 shape)', () => {
    expect(parseIssue(issue({ description: 'plain text' }), CTX)!.descriptionMd).toBe('plain text');
  });

  it('extracts acceptance criteria out of the description', () => {
    const t = parseIssue(issue({
      description: 'Context.\n\n### Acceptance Criteria\n- one\n- two',
    }), CTX)!;
    expect(t.acceptanceCriteria).toEqual(['one', 'two']);
  });

  it('handles an unassigned issue', () => {
    const t = parseIssue(issue({ assignee: null }), CTX)!;
    expect(t.assigneeName).toBe('');
    expect(t.isMine).toBe(false);
  });

  it('is not mine when the account ids differ', () => {
    expect(parseIssue(issue({ assignee: { accountId: 'other' } }), CTX)!.isMine).toBe(false);
  });

  it('is not mine when our own account id is unknown', () => {
    const t = parseIssue(issue({ assignee: { accountId: 'acc-me' } }), { ...CTX, selfAccountId: undefined })!;
    expect(t.isMine).toBe(false);
  });

  it('reads points from a string value', () => {
    expect(parseIssue(issue({ customfield_10016: '5' }), CTX)!.points).toBe(5);
  });

  it('treats a non-numeric points value as absent rather than NaN', () => {
    expect(parseIssue(issue({ customfield_10016: 'none' }), CTX)!.points).toBeNull();
  });

  it('treats an empty-string points value as absent', () => {
    expect(parseIssue(issue({ customfield_10016: '' }), CTX)!.points).toBeNull();
  });

  it('has null points when no points field was resolved', () => {
    const t = parseIssue(issue({ customfield_10016: 3 }), { ...CTX, pointsFieldId: null })!;
    expect(t.points).toBeNull();
  });

  it('survives a fields object stripped by permissions', () => {
    const t = parseIssue({ key: 'ACME-1', fields: {} }, CTX)!;
    expect(t.summary).toBe('');
    expect(t.status).toBe('');
    expect(t.statusCategory).toBe('todo');
    expect(t.labels).toEqual([]);
    expect(t.existingSubtasks).toEqual([]);
  });

  it('survives a missing fields object entirely', () => {
    expect(parseIssue({ key: 'ACME-1' }, CTX)!.summary).toBe('');
  });

  it('filters non-string labels', () => {
    const t = parseIssue(issue({ labels: ['ok', 42, null] as unknown as string[] }), CTX)!;
    expect(t.labels).toEqual(['ok']);
  });

  it('collects existing subtasks and drops keyless ones', () => {
    const t = parseIssue(issue({
      subtasks: [
        { key: 'ACME-4855', fields: { summary: '[Backend] work', status: { name: 'To Do' } } },
        { fields: { summary: 'no key' } },
      ],
    }), CTX)!;
    expect(t.existingSubtasks).toEqual([
      { key: 'ACME-4855', summary: '[Backend] work', status: 'To Do' },
    ]);
  });

  it('flags a subtask so the UI can refuse to nest', () => {
    const t = parseIssue(issue({ issuetype: { id: '5', name: 'Sub-task', subtask: true } }), CTX)!;
    expect(t.isSubtask).toBe(true);
    expect(t.typeKind).toBe('subtask');
  });

  it('does not double a slash in the browse URL', () => {
    const t = parseIssue(issue(), { ...CTX, siteBaseUrl: 'https://x.atlassian.net/' })!;
    expect(t.url).toBe('https://x.atlassian.net/browse/ACME-4830');
  });
});

describe('parseIssues', () => {
  it('drops unusable entries instead of failing the page', () => {
    expect(parseIssues([issue(), { id: 'no-key' }], CTX)).toHaveLength(1);
  });

  it('tolerates a non-array payload', () => {
    expect(parseIssues(undefined as unknown as RawJiraIssue[], CTX)).toEqual([]);
  });
});

describe('statusCategoryOf', () => {
  it('maps Jira category keys, not localized names', () => {
    expect(statusCategoryOf('new')).toBe('todo');
    expect(statusCategoryOf('indeterminate')).toBe('inprogress');
    expect(statusCategoryOf('done')).toBe('done');
  });

  it('defaults an unknown or missing key to todo', () => {
    expect(statusCategoryOf(undefined)).toBe('todo');
    expect(statusCategoryOf('weird')).toBe('todo');
  });
});

describe('typeKindOf', () => {
  it('buckets the common types', () => {
    expect(typeKindOf('Story', false)).toBe('story');
    expect(typeKindOf('Bug', false)).toBe('bug');
    expect(typeKindOf('Task', false)).toBe('task');
    expect(typeKindOf('Spike', false)).toBe('spike');
  });

  it('prefers subtask over the name', () => {
    expect(typeKindOf('Story', true)).toBe('subtask');
  });

  it('falls back to other for an unknown or empty name', () => {
    expect(typeKindOf('Epic', false)).toBe('other');
    expect(typeKindOf('', false)).toBe('other');
  });
});

describe('parseSprint / parseBoard', () => {
  it('normalizes a sprint', () => {
    expect(parseSprint({ id: 24, name: 'Sprint 24', state: 'ACTIVE', startDate: 'a', endDate: 'b' }))
      .toEqual({ id: 24, name: 'Sprint 24', state: 'active', startDate: 'a', endDate: 'b' });
  });

  it('marks an unrecognized state unknown', () => {
    expect(parseSprint({ id: 1, state: 'paused' })!.state).toBe('unknown');
  });

  it('names an unnamed sprint after its id', () => {
    expect(parseSprint({ id: 7 })!.name).toBe('Sprint 7');
  });

  it('returns null without an id', () => {
    expect(parseSprint({ name: 'orphan' })).toBeNull();
    expect(parseBoard({ name: 'orphan' })).toBeNull();
  });

  it('normalizes a board', () => {
    expect(parseBoard({ id: 3, name: 'ACME Web' })).toEqual({ id: 3, name: 'ACME Web' });
  });
});

describe('pickCurrentSprint', () => {
  const s = (id: number, state: JiraSprint['state']): JiraSprint =>
    ({ id, name: `S${id}`, state, startDate: '', endDate: '' });

  it('prefers the active sprint', () => {
    expect(pickCurrentSprint([s(2, 'future'), s(1, 'active')])!.id).toBe(1);
  });

  it('picks the lowest id when a board runs parallel active sprints, for stability', () => {
    expect(pickCurrentSprint([s(9, 'active'), s(4, 'active')])!.id).toBe(4);
  });

  it('falls back to the earliest future sprint', () => {
    expect(pickCurrentSprint([s(8, 'future'), s(5, 'future')])!.id).toBe(5);
  });

  it('ignores closed sprints', () => {
    expect(pickCurrentSprint([s(1, 'closed')])).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(pickCurrentSprint([])).toBeNull();
  });
});
