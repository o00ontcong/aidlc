import { describe, expect, it } from 'vitest';

import type { SubtaskDraft } from '@aidlc/core';

import {
  humanizeStepId,
  issueBrowseUrl,
  selectableDrafts,
  stepsFromPipelineConfig,
  type RawPipelineStep,
} from '../src/v2/jiraSubtaskLogic';

const draft = (over: Partial<SubtaskDraft> = {}): SubtaskDraft => ({
  domain: 'Backend',
  summary: '[Backend] Do the thing',
  sections: [],
  descriptionMd: '',
  labels: [],
  fromSteps: [],
  selected: true,
  blockedBy: [],
  ...over,
});

describe('humanizeStepId', () => {
  it('title-cases a dashed id', () => {
    expect(humanizeStepId('generate-test-cases')).toBe('Generate Test Cases');
  });

  it('handles underscores too', () => {
    expect(humanizeStepId('unit_test')).toBe('Unit Test');
  });

  it('leaves a single word capitalized', () => {
    expect(humanizeStepId('implement')).toBe('Implement');
  });

  it('tolerates repeated and trailing separators', () => {
    expect(humanizeStepId('test--plan-')).toBe('Test Plan');
  });

  it('returns empty for an empty id', () => {
    expect(humanizeStepId('')).toBe('');
  });
});

describe('stepsFromPipelineConfig', () => {
  it('reads object-form steps', () => {
    const { steps } = stepsFromPipelineConfig([
      { name: 'plan', produces_contains: ['## Acceptance'] },
      { name: 'implement' },
    ]);
    expect(steps).toEqual([
      { id: 'plan', name: 'Plan', producesContains: ['## Acceptance'] },
      { id: 'implement', name: 'Implement', producesContains: [] },
    ]);
  });

  it('reads string-form steps', () => {
    expect(stepsFromPipelineConfig(['implement']).steps[0].id).toBe('implement');
  });

  it('strips the aidlc- agent prefix so template fromSteps can match', () => {
    // A pipeline references agents (aidlc-developer); the template names phases.
    // Without stripping, no step matches and every checklist comes out empty.
    expect(stepsFromPipelineConfig(['aidlc-developer']).steps[0].id).toBe('developer');
  });

  it('prefers name over agent when both are present', () => {
    expect(stepsFromPipelineConfig([{ name: 'implement', agent: 'aidlc-developer' }]).steps[0].id)
      .toBe('implement');
  });

  it('collects human_review steps as review gates', () => {
    const { reviewGateStepIds } = stepsFromPipelineConfig([
      { name: 'plan', human_review: true },
      { name: 'implement' },
      { name: 'execute-test', human_review: true },
    ]);
    expect(reviewGateStepIds).toEqual(['plan', 'execute-test']);
  });

  it('does not treat a falsy human_review as a gate', () => {
    expect(stepsFromPipelineConfig([{ name: 'plan', human_review: false }]).reviewGateStepIds)
      .toEqual([]);
  });

  it('deduplicates a repeated agent — the checklist should not repeat', () => {
    const { steps } = stepsFromPipelineConfig(['implement', 'implement']);
    expect(steps).toHaveLength(1);
  });

  it('skips a step with no usable id', () => {
    expect(stepsFromPipelineConfig([{}, { name: '  ' }, 'plan']).steps.map((s) => s.id))
      .toEqual(['plan']);
  });

  it('ignores a non-array produces_contains', () => {
    const raw = [{ name: 'plan', produces_contains: 'oops' }] as unknown as RawPipelineStep[];
    expect(stepsFromPipelineConfig(raw).steps[0].producesContains).toEqual([]);
  });

  it('tolerates an empty or missing step list', () => {
    expect(stepsFromPipelineConfig([])).toEqual({ steps: [], reviewGateStepIds: [] });
    expect(stepsFromPipelineConfig(undefined as unknown as RawPipelineStep[]).steps).toEqual([]);
  });

  it('tolerates a null entry', () => {
    const raw = [null, 'plan'] as unknown as RawPipelineStep[];
    expect(stepsFromPipelineConfig(raw).steps.map((s) => s.id)).toEqual(['plan']);
  });
});

describe('selectableDrafts', () => {
  it('keeps a ticked, creatable draft', () => {
    expect(selectableDrafts([draft()], ['Backend'])).toHaveLength(1);
  });

  it('drops a domain that was not ticked', () => {
    expect(selectableDrafts([draft()], ['Testing'])).toEqual([]);
  });

  it('matches domains case- and whitespace-insensitively', () => {
    expect(selectableDrafts([draft()], [' backend '])).toHaveLength(1);
  });

  it('refuses a draft already on Jira, even if ticked — that would duplicate', () => {
    expect(selectableDrafts([draft({ existingKey: 'ACME-4855' })], ['Backend'])).toEqual([]);
  });

  it('refuses a blocked draft, even if ticked — Jira would reject the payload', () => {
    expect(selectableDrafts([draft({ blockedBy: ['Reviewer bắt buộc'] })], ['Backend'])).toEqual([]);
  });

  it('does not trust draft.selected — only the domains the caller sent', () => {
    // The webview says what the user ticked; `selected` is only the planner's
    // suggestion, and the two disagree as soon as the user unticks anything.
    expect(selectableDrafts([draft({ selected: false })], ['Backend'])).toHaveLength(1);
    expect(selectableDrafts([draft({ selected: true })], [])).toEqual([]);
  });

  it('filters a mixed list down to the creatable ticked ones', () => {
    const drafts = [
      draft({ domain: 'Documentation' }),
      draft({ domain: 'Backend', existingKey: 'ACME-1' }),
      draft({ domain: 'Testing', blockedBy: ['x'] }),
      draft({ domain: 'Code review' }),
    ];
    expect(selectableDrafts(drafts, ['Documentation', 'Backend', 'Testing', 'Code review'])
      .map((d) => d.domain)).toEqual(['Documentation', 'Code review']);
  });
});

describe('issueBrowseUrl', () => {
  it('builds a URL from a bare site', () => {
    expect(issueBrowseUrl('acme.atlassian.net', 'ACME-1'))
      .toBe('https://acme.atlassian.net/browse/ACME-1');
  });

  it('accepts a site that already has a scheme', () => {
    expect(issueBrowseUrl('https://acme.atlassian.net', 'ACME-1'))
      .toBe('https://acme.atlassian.net/browse/ACME-1');
  });

  it('does not double the slash', () => {
    expect(issueBrowseUrl('https://acme.atlassian.net/', 'ACME-1'))
      .toBe('https://acme.atlassian.net/browse/ACME-1');
  });

  it('returns empty when either half is missing', () => {
    expect(issueBrowseUrl('', 'ACME-1')).toBe('');
    expect(issueBrowseUrl('acme.atlassian.net', '  ')).toBe('');
  });
});
