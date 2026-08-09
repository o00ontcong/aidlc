import { describe, it, expect } from 'vitest';

import {
  ModelDescriptorSchema,
  ModelRequirementSchema,
  ResolvedModelSchema,
  MODEL_TIERS,
  type ModelProvider,
  type ModelDescriptor,
  type ModelRequirement,
  type ResolvedModel,
} from '../src/contracts/model';

describe('Model tier — exactly fast|balanced|deep|review (design doc §6.3)', () => {
  it('declares exactly the four documented tiers', () => {
    expect(MODEL_TIERS).toEqual(['fast', 'balanced', 'deep', 'review']);
  });
});

describe('ModelDescriptor / ModelRequirement / ResolvedModel — parse/serialize round-trip', () => {
  it('ModelDescriptor round-trips through JSON unchanged', () => {
    const original: ModelDescriptor = {
      provider: 'claude',
      modelId: 'claude-sonnet-5',
      tiers: ['balanced', 'deep'],
      contextWindowTokens: 200_000,
      supportsTools: true,
      latencyClass: 'standard',
      costClass: 'medium',
    };
    const parsed = ModelDescriptorSchema.parse(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });

  it('ModelRequirement round-trips through JSON unchanged', () => {
    const original: ModelRequirement = { tier: 'deep', requiresTools: true, capability: 'ios-architecture' };
    const parsed = ModelRequirementSchema.parse(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });

  it('ResolvedModel records provider + modelId + version + reason for audit/reproduce (design doc §6.3)', () => {
    const original: ResolvedModel = {
      provider: 'claude',
      modelId: 'claude-sonnet-5',
      modelVersion: '2026-01',
      tier: 'balanced',
      resolvedAt: '2026-08-09T10:00:00.000Z',
      reason: 'Default balanced-tier resolution for implementation work.',
    };
    const parsed = ResolvedModelSchema.parse(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });
});

describe('ResolvedModel / ModelDescriptor — backward compatibility (new optional field does not break an older payload)', () => {
  it('parses an older ResolvedModel payload missing modelVersion (optional)', () => {
    const legacy = {
      provider: 'claude',
      modelId: 'claude-sonnet-5',
      tier: 'balanced',
      resolvedAt: '2026-08-09T10:00:00.000Z',
      reason: 'legacy payload without modelVersion',
    };
    const parsed = ResolvedModelSchema.parse(legacy);
    expect(parsed.modelVersion).toBeUndefined();
  });

  it('parses an older ModelDescriptor payload missing latencyClass/costClass (both optional)', () => {
    const legacy = {
      provider: 'claude',
      modelId: 'claude-sonnet-5',
      tiers: ['balanced'],
      contextWindowTokens: 200_000,
      supportsTools: true,
    };
    const parsed = ModelDescriptorSchema.parse(legacy);
    expect(parsed.latencyClass).toBeUndefined();
    expect(parsed.costClass).toBeUndefined();
  });
});

describe('ModelProvider — provider-neutral contract (design doc §6.3: "khong phu thuoc Claude-specific model ID")', () => {
  it('provider/modelId are plain strings — a non-Claude fake satisfies the same interface', async () => {
    const fakeProvider: ModelProvider = {
      id: 'fake-provider',
      async discoverModels() {
        return [
          {
            provider: 'fake-provider',
            modelId: 'fake-model-1',
            tiers: ['fast', 'balanced'],
            contextWindowTokens: 32_000,
            supportsTools: false,
          },
        ];
      },
      async resolve(request: ModelRequirement): Promise<ResolvedModel> {
        return {
          provider: 'fake-provider',
          modelId: 'fake-model-1',
          tier: request.tier,
          resolvedAt: '2026-08-09T10:00:00.000Z',
          reason: 'Only model registered for this fake provider.',
        };
      },
      async execute() {
        return { content: 'ok', stopReason: 'end_turn' };
      },
      async validateConfiguration() {
        return [{ provider: 'fake-provider', ok: true, message: 'Fake provider always healthy.' }];
      },
    };

    const models = await fakeProvider.discoverModels();
    expect(models[0].provider).toBe('fake-provider');

    const resolved = await fakeProvider.resolve({ tier: 'fast' });
    expect(resolved.provider).toBe('fake-provider');
    expect(resolved.tier).toBe('fast');

    const diagnostics = await fakeProvider.validateConfiguration();
    expect(diagnostics[0].ok).toBe(true);
  });
});
