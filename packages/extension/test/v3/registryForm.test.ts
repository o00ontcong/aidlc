import { describe, expect, it } from 'vitest';
import { isRegistryId, pipelineFormChecks } from '../../src/webview/v3/registryForm';

describe('Builder V3 registry form guards', () => {
  it('accepts kebab-case ids only', () => {
    expect(isRegistryId('release-review')).toBe(true);
    expect(isRegistryId('Release_Review')).toBe(false);
  });

  it('requires a non-empty pipeline with a human review before enabling save', () => {
    expect(pipelineFormChecks([])).toEqual({ hasSteps: false, hasHumanReview: false });
    expect(pipelineFormChecks([{ humanReview: false }])).toEqual({ hasSteps: true, hasHumanReview: false });
    expect(pipelineFormChecks([{ humanReview: true }])).toEqual({ hasSteps: true, hasHumanReview: true });
  });
});
