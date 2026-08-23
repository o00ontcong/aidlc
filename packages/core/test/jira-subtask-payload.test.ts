import { describe, it, expect } from 'vitest';

import type { RenderedSection } from '../src/integrations/jira/adfBuilder';
import {
  buildSubtaskPayload,
  normalizeLabels,
  PAYLOAD_FIELD_IDS,
} from '../src/integrations/jira/subtaskPayload';
import { SUPPLIED_SUBTASK_FIELDS } from '../src/integrations/jira/createMeta';

const SECTIONS: RenderedSection[] = [
  { heading: '🔧 Description', kind: 'prose', lines: ['Do the thing.'] },
  { heading: '📋 Checklist', kind: 'taskList', lines: ['Implement'] },
];

const input = (over = {}) => ({
  parentKey: 'ACME-4830',
  projectKey: 'ACME',
  issueTypeId: '10003',
  summary: '[Backend] Do the thing',
  sections: SECTIONS,
  labels: ['auth', 'aidlc'],
  assigneeAccountId: 'acc-me',
  ...over,
});

describe('buildSubtaskPayload', () => {
  it('builds the fields Jira expects', () => {
    const { fields } = buildSubtaskPayload(input());
    expect(fields.project).toEqual({ key: 'ACME' });
    expect(fields.parent).toEqual({ key: 'ACME-4830' });
    expect(fields.issuetype).toEqual({ id: '10003' });
    expect(fields.summary).toBe('[Backend] Do the thing');
    expect(fields.labels).toEqual(['auth', 'aidlc']);
  });

  it('sends description as ADF, not text', () => {
    const { fields } = buildSubtaskPayload(input());
    expect(fields.description.type).toBe('doc');
    expect(fields.description.version).toBe(1);
    expect(Array.isArray(fields.description.content)).toBe(true);
  });

  it('keeps the checklist as a real taskList node', () => {
    const { fields } = buildSubtaskPayload(input());
    expect((fields.description.content ?? []).some((n) => n.type === 'taskList')).toBe(true);
  });

  it('uses {id: accountId} for assignee — the Cloud shape', () => {
    expect(buildSubtaskPayload(input()).fields.assignee).toEqual({ id: 'acc-me' });
  });

  it('omits assignee entirely when unassigned, rather than sending null', () => {
    // Sending null asks Jira to CLEAR the field, which needs another permission.
    expect(buildSubtaskPayload(input({ assigneeAccountId: null })).fields.assignee).toBeUndefined();
    expect(buildSubtaskPayload(input({ assigneeAccountId: '  ' })).fields.assignee).toBeUndefined();
    expect('assignee' in buildSubtaskPayload(input({ assigneeAccountId: undefined })).fields).toBe(false);
  });

  it('uppercases and trims the keys', () => {
    const { fields } = buildSubtaskPayload(input({ parentKey: ' acme-1 ', projectKey: ' acme ' }));
    expect(fields.parent.key).toBe('ACME-1');
    expect(fields.project.key).toBe('ACME');
  });

  it('trims the summary', () => {
    expect(buildSubtaskPayload(input({ summary: '  x  ' })).fields.summary).toBe('x');
  });

  it('honours the separator flag', () => {
    const withRule = buildSubtaskPayload(input()).fields.description.content ?? [];
    const without = buildSubtaskPayload(input({ separator: false })).fields.description.content ?? [];
    expect(withRule.some((n) => n.type === 'rule')).toBe(true);
    expect(without.some((n) => n.type === 'rule')).toBe(false);
  });
});

describe('normalizeLabels', () => {
  it('replaces whitespace with dashes — Jira rejects spaces in labels', () => {
    expect(normalizeLabels(['needs review'])).toEqual(['needs-review']);
  });

  it('collapses runs of whitespace', () => {
    expect(normalizeLabels(['a   b'])).toEqual(['a-b']);
  });

  it('deduplicates, keeping first order', () => {
    expect(normalizeLabels(['b', 'a', 'b'])).toEqual(['b', 'a']);
  });

  it('drops empties rather than sending ""', () => {
    expect(normalizeLabels(['', '   ', 'ok'])).toEqual(['ok']);
  });

  it('tolerates non-string entries', () => {
    expect(normalizeLabels([null as unknown as string, 'ok'])).toEqual(['ok']);
  });
});

describe('field list agreement', () => {
  it('matches the list createMeta pre-flights against', () => {
    // These two drifting apart would make the "missing required field" check
    // silently wrong, so they are asserted equal rather than merely similar.
    expect([...PAYLOAD_FIELD_IDS].sort()).toEqual([...SUPPLIED_SUBTASK_FIELDS].sort());
  });
});
