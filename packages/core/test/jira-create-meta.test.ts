import { describe, it, expect } from 'vitest';

import {
  missingRequiredFields,
  projectKeyFromIssueKey,
  resolveSubtaskIssueType,
  SUPPLIED_SUBTASK_FIELDS,
  type CreateMetaField,
} from '../src/integrations/jira/createMeta';

const ISSUE_TYPES = [
  { id: '10001', name: 'Story', subtask: false },
  { id: '10003', name: 'Sub-task', subtask: true },
];

describe('resolveSubtaskIssueType', () => {
  it('picks the type flagged subtask, not one matched by name', () => {
    const out = resolveSubtaskIssueType(ISSUE_TYPES);
    expect(out.issueType).toEqual({ id: '10003', name: 'Sub-task' });
  });

  it('works for a site that spells it Subtask', () => {
    const out = resolveSubtaskIssueType([{ id: '5', name: 'Subtask', subtask: true }]);
    expect(out.issueType?.name).toBe('Subtask');
  });

  it('works for a localized name, because it reads the flag', () => {
    const out = resolveSubtaskIssueType([{ id: '5', name: 'Nhiệm vụ con', subtask: true }]);
    expect(out.issueType?.id).toBe('5');
  });

  it('returns null when the project has no subtask type at all', () => {
    const out = resolveSubtaskIssueType([{ id: '1', name: 'Task', subtask: false }]);
    expect(out.issueType).toBeNull();
    expect(out.candidates).toEqual([]);
  });

  it('honours a configured name', () => {
    const types = [
      { id: '5', name: 'Sub-task', subtask: true },
      { id: '6', name: 'Bug Sub-task', subtask: true },
    ];
    expect(resolveSubtaskIssueType(types, 'Bug Sub-task').issueType?.id).toBe('6');
  });

  it('matches a configured name case-insensitively', () => {
    expect(resolveSubtaskIssueType(ISSUE_TYPES, 'sub-task').issueType?.id).toBe('10003');
  });

  it('reports a configured name that matches nothing instead of silently substituting', () => {
    const out = resolveSubtaskIssueType(ISSUE_TYPES, 'Chore');
    expect(out.issueType).toBeNull();
    expect(out.requestedNameMissing).toBe('Chore');
    expect(out.candidates).toHaveLength(1);
  });

  it('treats auto and empty as "pick for me"', () => {
    expect(resolveSubtaskIssueType(ISSUE_TYPES, 'auto').issueType?.id).toBe('10003');
    expect(resolveSubtaskIssueType(ISSUE_TYPES, '').issueType?.id).toBe('10003');
  });

  it('exposes every candidate so the UI can offer a choice', () => {
    const types = [
      { id: '5', name: 'Sub-task', subtask: true },
      { id: '6', name: 'Bug Sub-task', subtask: true },
    ];
    expect(resolveSubtaskIssueType(types).candidates).toHaveLength(2);
  });

  it('ignores a subtask type with no id', () => {
    expect(resolveSubtaskIssueType([{ name: 'Sub-task', subtask: true }]).issueType).toBeNull();
  });

  it('tolerates a non-array payload', () => {
    expect(resolveSubtaskIssueType(undefined as unknown as []).issueType).toBeNull();
  });
});

describe('missingRequiredFields', () => {
  const field = (over: Partial<CreateMetaField> = {}): CreateMetaField =>
    ({ required: true, hasDefaultValue: false, ...over });

  it('returns nothing when the payload covers every required field', () => {
    const fields = {
      summary: field({ fieldId: 'summary', name: 'Summary' }),
      description: field({ fieldId: 'description', name: 'Description' }),
    };
    expect(missingRequiredFields(fields, SUPPLIED_SUBTASK_FIELDS)).toEqual([]);
  });

  it('names a required custom field by its label, not its id', () => {
    const fields = {
      customfield_10020: field({ fieldId: 'customfield_10020', name: 'Reviewer' }),
    };
    expect(missingRequiredFields(fields, SUPPLIED_SUBTASK_FIELDS)).toEqual(['Reviewer']);
  });

  it('falls back to the field id when there is no label', () => {
    const fields = { customfield_1: field({ fieldId: 'customfield_1' }) };
    expect(missingRequiredFields(fields, SUPPLIED_SUBTASK_FIELDS)).toEqual(['customfield_1']);
  });

  it('uses the map key when fieldId is absent', () => {
    const fields = { customfield_2: field({ name: 'Team' }) };
    expect(missingRequiredFields(fields, SUPPLIED_SUBTASK_FIELDS)).toEqual(['Team']);
  });

  it('ignores an optional field', () => {
    const fields = { customfield_1: field({ required: false, name: 'Optional' }) };
    expect(missingRequiredFields(fields, SUPPLIED_SUBTASK_FIELDS)).toEqual([]);
  });

  it('ignores a required field Jira will default', () => {
    const fields = { customfield_1: field({ hasDefaultValue: true, name: 'Team' }) };
    expect(missingRequiredFields(fields, SUPPLIED_SUBTASK_FIELDS)).toEqual([]);
  });

  it('ignores project and issuetype, which the payload always carries', () => {
    const fields = {
      project: field({ fieldId: 'project', name: 'Project' }),
      issuetype: field({ fieldId: 'issuetype', name: 'Issue Type' }),
    };
    expect(missingRequiredFields(fields, [])).toEqual([]);
  });

  it('lists several missing fields', () => {
    const fields = {
      cf1: field({ fieldId: 'cf1', name: 'Reviewer' }),
      cf2: field({ fieldId: 'cf2', name: 'Sprint' }),
    };
    expect(missingRequiredFields(fields, SUPPLIED_SUBTASK_FIELDS).sort()).toEqual(['Reviewer', 'Sprint']);
  });

  it('returns nothing for undefined field metadata', () => {
    expect(missingRequiredFields(undefined, SUPPLIED_SUBTASK_FIELDS)).toEqual([]);
  });
});

describe('projectKeyFromIssueKey', () => {
  it('extracts the project part', () => {
    expect(projectKeyFromIssueKey('ACME-4830')).toBe('ACME');
  });

  it('handles digits inside the key', () => {
    expect(projectKeyFromIssueKey('AB2C-7')).toBe('AB2C');
  });

  it('uppercases a lowercase key', () => {
    expect(projectKeyFromIssueKey('acme-1')).toBe('ACME');
  });

  it('returns empty for something that is not an issue key', () => {
    expect(projectKeyFromIssueKey('not a key')).toBe('');
    expect(projectKeyFromIssueKey('4830')).toBe('');
    expect(projectKeyFromIssueKey('')).toBe('');
  });
});
