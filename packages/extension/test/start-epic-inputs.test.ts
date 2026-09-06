import { describe, expect, it } from 'vitest';

import {
  collectStartEpicInputs,
  parseJiraIssueKey,
  resolveJiraTicketKey,
} from '../src/shared/startEpicInputs';

describe('parseJiraIssueKey', () => {
  it('accepts a bare issue key', () => {
    expect(parseJiraIssueKey('pass-1087')).toBe('PASS-1087');
  });

  it('extracts the key from a browse URL', () => {
    expect(parseJiraIssueKey('https://acme.atlassian.net/browse/PASS-1087')).toBe('PASS-1087');
  });

  it('rejects an AIDLC lifecycle id', () => {
    expect(parseJiraIssueKey('EPIC-1007')).toBe('');
    expect(parseJiraIssueKey('epic-1007')).toBe('');
  });

  it('rejects empty or non-key text', () => {
    expect(parseJiraIssueKey('')).toBe('');
    expect(parseJiraIssueKey('  ')).toBe('');
    expect(parseJiraIssueKey('Setup recovery email')).toBe('');
  });
});

describe('resolveJiraTicketKey', () => {
  it('prefers inputs.jira over the epic id', () => {
    expect(resolveJiraTicketKey({
      inputs: { jira: 'PASS-1087' },
      epicId: 'EPIC-1007',
    })).toBe('PASS-1087');
  });

  it('recovers the ticket from a Sprint-prefilled task id before it is rewritten to EPIC-N', () => {
    expect(resolveJiraTicketKey({ epicId: 'PASS-1087' })).toBe('PASS-1087');
  });

  it('does not treat EPIC-N as a Jira ticket', () => {
    expect(resolveJiraTicketKey({ epicId: 'EPIC-1007' })).toBe('');
  });
});

describe('collectStartEpicInputs', () => {
  it('keeps a prefilled jira input even when the pipeline declared no jira capability', () => {
    expect(collectStartEpicInputs({ jira: 'PASS-1087', files: ' src/** ' })).toEqual({
      jira: 'PASS-1087',
      files: 'src/**',
    });
  });

  it('infers jira from the original Sprint task id', () => {
    expect(collectStartEpicInputs({}, { epicId: 'PASS-1087' })).toEqual({ jira: 'PASS-1087' });
  });

  it('drops blank values', () => {
    expect(collectStartEpicInputs({ jira: '  ', figma: '' })).toEqual({});
  });
});
