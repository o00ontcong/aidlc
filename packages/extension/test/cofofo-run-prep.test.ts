import { describe, expect, it } from 'vitest';

import { USER_NOTE_PRIORITY_RULE } from '@aidlc/core';

import { extraFeedbackForDeliveryStep } from '../src/v2/cofofoRunPrep';

describe('extraFeedbackForDeliveryStep', () => {
  it('tells analyze to write REQUIREMENT.md headings', () => {
    const text = extraFeedbackForDeliveryStep({
      epicsDir: 'docs/epics',
      runId: 'EPIC-1007',
      pipelineId: 'cofofo-feature',
      phaseName: 'analyze',
      producesContains: ['## 4. Screens (New / Update)'],
    });
    expect(text).toContain('This analyze step must write docs/epics/EPIC-1007/artifacts/REQUIREMENT.md');
    expect(text).toContain('## 4. Screens (New / Update)');
    expect(text).not.toContain('## RED / GREEN Contract');
  });

  it('does not tell create-plan to rewrite REQUIREMENT.md', () => {
    const text = extraFeedbackForDeliveryStep({
      epicsDir: 'docs/epics',
      runId: 'EPIC-1007',
      pipelineId: 'cofofo-feature',
      phaseName: 'create-plan',
      producesContains: ['## RED / GREEN Contract'],
    });
    expect(text).toContain('This create-plan must include these exact headings');
    expect(text).toContain('## RED / GREEN Contract');
    expect(text).not.toContain('This analyze step');
    expect(text).not.toContain('REQUIREMENT.md');
  });

  it('folds the user note into the requirement only on analyze', () => {
    const analyze = extraFeedbackForDeliveryStep({
      epicsDir: 'docs/epics',
      runId: 'EPIC-1007',
      userNote: 'Use the Figma recovery-email screen.',
      pipelineId: 'cofofo-feature',
      phaseName: 'analyze',
    });
    expect(analyze).toContain(USER_NOTE_PRIORITY_RULE);
    expect(analyze).toContain('Fold every distinctive line');

    const plan = extraFeedbackForDeliveryStep({
      epicsDir: 'docs/epics',
      runId: 'EPIC-1007',
      userNote: 'Use the Figma recovery-email screen.',
      pipelineId: 'cofofo-feature',
      phaseName: 'create-plan',
      producesContains: ['## RED / GREEN Contract'],
    });
    expect(plan).toContain(USER_NOTE_PRIORITY_RULE);
    expect(plan).not.toContain('Fold every distinctive line');
  });
});
