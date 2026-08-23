import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';

import { renderSubtaskMarkdown } from '../src/integrations/jira/adfBuilder';
import type { JiraTicket } from '../src/integrations/jira/JiraTypes';
import { planSubtasks, type PlannerStep, type SubtaskDraft } from '../src/integrations/jira/subtaskPlanner';
import { loadSubtaskTemplate } from '../src/integrations/jira/subtaskTemplate';

/** Tests run against the shipped template, so they also guard the real config. */
const TEMPLATE = loadSubtaskTemplate(
  fs.readFileSync(path.resolve(__dirname, '../templates/jira/subtask-template.yaml'), 'utf8'),
);

/** The built-in aidlc-workflow phases, in order. */
const ALL_STEPS: PlannerStep[] = [
  { id: 'plan', name: 'Plan', producesContains: ['## Acceptance'] },
  { id: 'prototype', name: 'Prototype' },
  { id: 'design', name: 'Design' },
  { id: 'test-plan', name: 'Test Plan', producesContains: ['## Test Scope'] },
  { id: 'implement', name: 'Implement' },
  { id: 'generate-test-cases', name: 'Generate Test Cases' },
  { id: 'execute-test', name: 'Execute Test' },
];

const ticket = (over: Partial<JiraTicket> = {}): JiraTicket => ({
  key: 'ACME-4830',
  id: '10042',
  type: 'Story',
  typeKind: 'story',
  summary: 'Add SSO logout redirect to /goodbye',
  descriptionMd: 'After IdP logout the user lands on a blank login page.',
  acceptanceCriteria: ['Lands on /goodbye in one redirect', 'Session cookie cleared first'],
  status: 'To Do',
  statusCategory: 'todo',
  assigneeAccountId: 'acc-1',
  assigneeName: 'Cong',
  isMine: true,
  points: 3,
  priority: 'P2',
  labels: [],
  parentKey: 'ACME-4700',
  parentSummary: 'Auth hardening',
  existingSubtasks: [],
  isSubtask: false,
  url: 'https://silvertiger.atlassian.net/browse/ACME-4830',
  updatedAt: '2026-08-22T09:00:00.000Z',
  ...over,
});

const plan = (over: Partial<JiraTicket> = {}, extra = {}) =>
  planSubtasks({ template: TEMPLATE, ticket: ticket(over), steps: ALL_STEPS, ...extra });

const domains = (drafts: SubtaskDraft[]) => drafts.map((d) => d.domain);
const byDomain = (drafts: SubtaskDraft[], domain: string) => drafts.find((d) => d.domain === domain)!;

describe('planSubtasks — which domains get suggested', () => {
  it('always proposes Documentation, Testing and Code review', () => {
    const d = domains(plan());
    expect(d).toContain('Documentation');
    expect(d).toContain('Testing');
    expect(d).toContain('Code review');
  });

  it('treats an unlabelled ticket as Backend work via the orNoneOf fallback', () => {
    expect(domains(plan())).toContain('Backend');
    expect(domains(plan())).not.toContain('Frontend');
  });

  it('proposes Frontend and stands Backend down on a pure-UI ticket', () => {
    const d = domains(plan({ labels: ['frontend'] }));
    expect(d).toContain('Frontend');
    expect(d).not.toContain('Backend');
  });

  it('proposes both when the ticket is labelled both', () => {
    const d = domains(plan({ labels: ['frontend', 'backend'] }));
    expect(d).toContain('Frontend');
    expect(d).toContain('Backend');
  });

  it('matches labels case-insensitively', () => {
    expect(domains(plan({ labels: ['FrontEnd'] }))).toContain('Frontend');
  });

  it('only proposes Infra when the ticket says so', () => {
    expect(domains(plan())).not.toContain('Infra');
    expect(domains(plan({ labels: ['terraform'] }))).toContain('Infra');
  });

  it('leaves Infra unticked even when proposed', () => {
    expect(byDomain(plan({ labels: ['terraform'] }), 'Infra').selected).toBe(false);
  });

  it('ticks the default domains', () => {
    for (const domain of ['Documentation', 'Backend', 'Testing', 'Code review']) {
      expect(byDomain(plan(), domain).selected, domain).toBe(true);
    }
  });
});

describe('planSubtasks — rendering', () => {
  it('prefixes every summary with its domain', () => {
    for (const draft of plan()) {
      expect(draft.summary.startsWith(`[${draft.domain}] `), draft.summary).toBe(true);
    }
  });

  it('renders the five template sections in order', () => {
    const draft = byDomain(plan(), 'Backend');
    expect(draft.sections.map((s) => s.heading)).toEqual([
      '🔧 Description', '✅ Completion Criteria', '📋 Checklist', '🔗 Parent Task', '🏷️ Labels',
    ]);
  });

  it('fills Description from the ticket description', () => {
    const section = byDomain(plan(), 'Backend').sections[0];
    expect(section.lines.join('\n')).toContain('blank login page');
  });

  it('fills Completion Criteria from the ticket acceptance criteria', () => {
    const section = byDomain(plan(), 'Backend').sections[1];
    expect(section.lines).toEqual([
      'Lands on /goodbye in one redirect',
      'Session cookie cleared first',
    ]);
  });

  it('falls back to step produces_contains when the ticket has no acceptance criteria', () => {
    const draft = byDomain(plan({ acceptanceCriteria: [] }), 'Testing');
    expect(draft.sections[1].lines).toContain('## Test Scope');
  });

  it('fills the Checklist from the step names of that domain only', () => {
    const testing = byDomain(plan(), 'Testing').sections[2];
    expect(testing.lines).toEqual(['Test Plan', 'Generate Test Cases', 'Execute Test']);
    const docs = byDomain(plan(), 'Documentation').sections[2];
    expect(docs.lines).toEqual(['Plan', 'Design']);
  });

  it('drops checklist entries for steps the chosen recipe does not run', () => {
    const bugfix: PlannerStep[] = [
      { id: 'implement', name: 'Implement' },
      { id: 'execute-test', name: 'Execute Test' },
    ];
    const drafts = planSubtasks({ template: TEMPLATE, ticket: ticket(), steps: bugfix });
    expect(byDomain(drafts, 'Testing').sections[2].lines).toEqual(['Execute Test']);
    expect(byDomain(drafts, 'Backend').sections[2].lines).toEqual(['Implement']);
  });

  it('points Parent Task at the ticket key', () => {
    expect(byDomain(plan(), 'Backend').sections[3].lines).toEqual(['ACME-4830']);
  });

  it('merges ticket labels with the template labels, one line each', () => {
    const draft = byDomain(plan({ labels: ['auth', 'backend'] }), 'Backend');
    expect(draft.sections[4].lines).toEqual(['auth', 'backend', 'aidlc']);
    expect(draft.labels).toEqual(['auth', 'backend', 'aidlc']);
  });

  it('resolves reviewGates to the pipeline review steps', () => {
    const drafts = plan({}, { reviewGateStepIds: ['design', 'execute-test'] });
    expect(byDomain(drafts, 'Code review').fromSteps).toEqual(['design', 'execute-test']);
  });

  it('leaves the Code review checklist empty when the pipeline has no gates', () => {
    expect(byDomain(plan(), 'Code review').sections[2].lines).toEqual([]);
  });

  it('keeps the preview identical to what the payload will say', () => {
    for (const draft of plan()) {
      expect(draft.descriptionMd).toBe(renderSubtaskMarkdown(draft.sections, { separator: true }));
    }
  });

  it('prefers the AIDLC task title over the ticket summary once a task exists', () => {
    const drafts = plan({}, { task: { id: 'ACME-4830', title: 'Renamed by the dev' } });
    expect(byDomain(drafts, 'Backend').summary).toBe('[Backend] Renamed by the dev');
  });
});

describe('planSubtasks — dedupe', () => {
  it('marks a domain already in our ledger as created and unticks it', () => {
    const draft = byDomain(plan({}, { ledger: [{ domain: 'Backend', key: 'ACME-4855' }] }), 'Backend');
    expect(draft.existingKey).toBe('ACME-4855');
    expect(draft.selected).toBe(false);
  });

  it('matches the ledger domain case-insensitively', () => {
    const draft = byDomain(plan({}, { ledger: [{ domain: 'backend', key: 'ACME-9' }] }), 'Backend');
    expect(draft.existingKey).toBe('ACME-9');
  });

  it('detects a subtask a teammate created by hand from its [Domain] prefix', () => {
    const drafts = plan({
      existingSubtasks: [{ key: 'ACME-4900', summary: '[Testing] existing work', status: 'To Do' }],
    });
    const draft = byDomain(drafts, 'Testing');
    expect(draft.existingKey).toBe('ACME-4900');
    expect(draft.selected).toBe(false);
  });

  it('ignores an unrelated existing subtask', () => {
    const drafts = plan({
      existingSubtasks: [{ key: 'ACME-4901', summary: 'Random cleanup', status: 'To Do' }],
    });
    expect(byDomain(drafts, 'Testing').existingKey).toBeUndefined();
  });

  it('still lists a created domain so the panel can show its key', () => {
    expect(domains(plan({}, { ledger: [{ domain: 'Backend', key: 'ACME-4855' }] }))).toContain('Backend');
  });
});

describe('planSubtasks — blocking before Jira sees the payload', () => {
  it('blocks every draft on a project-required field the template cannot fill', () => {
    const drafts = plan({}, { missingRequiredFields: ['Reviewer', 'Sprint'] });
    for (const draft of drafts) {
      expect(draft.blockedBy.join(' ')).toContain('Reviewer');
      expect(draft.blockedBy.join(' ')).toContain('Sprint');
      expect(draft.selected).toBe(false);
    }
  });

  it('blocks a draft whose required section resolved to nothing', () => {
    const drafts = plan({ descriptionMd: '', acceptanceCriteria: [] });
    const draft = byDomain(drafts, 'Documentation');
    expect(draft.blockedBy.some((r) => r.includes('Description'))).toBe(true);
    expect(draft.selected).toBe(false);
  });

  it('does not block on an empty optional section', () => {
    // Code review has no review gates here, so its Checklist is empty — and
    // Checklist is optional in the template.
    expect(byDomain(plan(), 'Code review').blockedBy).toEqual([]);
  });

  it('leaves blockedBy empty on the happy path', () => {
    for (const draft of plan()) {
      expect(draft.blockedBy, draft.domain).toEqual([]);
    }
  });
});
