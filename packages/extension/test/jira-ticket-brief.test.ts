import { describe, expect, it } from 'vitest';

import { buildTicketBrief } from '../src/v2/jiraSprintLogic';
import type { JiraTicket } from '@aidlc/core';

function ticket(over: Partial<JiraTicket> = {}): JiraTicket {
  return {
    key: 'PASS-1087',
    id: '10087',
    type: 'Story',
    typeKind: 'story',
    summary: 'Setup recovery email',
    descriptionMd: 'Allow the user to add a recovery email.',
    acceptanceCriteria: ['User can save a recovery email'],
    status: 'To Do',
    statusCategory: 'todo',
    assigneeAccountId: 'acc',
    assigneeName: 'Me',
    isMine: true,
    points: 3,
    priority: 'Medium',
    labels: [],
    parentKey: '',
    parentSummary: '',
    existingSubtasks: [],
    isSubtask: false,
    url: 'https://acme.atlassian.net/browse/PASS-1087',
    updatedAt: '2026-09-06T00:00:00.000Z',
    ...over,
  };
}

describe('buildTicketBrief', () => {
  it('leads with the Jira key and browse URL so agents do not need MCP', () => {
    const brief = buildTicketBrief(ticket());
    expect(brief.startsWith('**Jira:** PASS-1087')).toBe(true);
    expect(brief).toContain('**URL:** https://acme.atlassian.net/browse/PASS-1087');
    expect(brief).toContain('Allow the user to add a recovery email.');
    expect(brief).toContain('User can save a recovery email');
  });

  it('still produces a usable brief when the ticket has only a summary', () => {
    const brief = buildTicketBrief(ticket({ descriptionMd: '', acceptanceCriteria: [] }));
    expect(brief).toContain('**Jira:** PASS-1087');
    expect(brief).toContain('Setup recovery email');
  });
});
