import { describe, expect, it } from 'vitest';

import { AstGraphCapabilityAdapter } from '../../src/v3/capabilities/astGraph/AstGraphCapabilityAdapter';
import { AnnotationCapabilityAdapter } from '../../src/v3/capabilities/annotation/AnnotationCapabilityAdapter';

describe('v3 contextual capability adapters', () => {
  it('does not open AST graph while policy disables it', async () => {
    let opened = false;
    const adapter = new AstGraphCapabilityAdapter(() => false, { openReport: async () => { opened = true; } });
    expect(await adapter.open()).toBe(false);
    expect(opened).toBe(false);
  });

  it('turns annotation feedback into a structured review payload without a second state machine', async () => {
    let opened = false;
    const adapter = new AnnotationCapabilityAdapter(() => true, { openArtifact: async () => { opened = true; } });
    expect(await adapter.open({ epicId: 'EPIC-2', artifactPath: 'docs/PLAN.md' })).toBe(true);
    expect(opened).toBe(true);
    expect(adapter.toReviewFeedback('plan', '  Request a risk section  ')).toEqual({ artifactId: 'plan', feedback: 'Request a risk section' });
    expect(adapter.toReviewFeedback('plan', '   ')).toBeUndefined();
  });
});
