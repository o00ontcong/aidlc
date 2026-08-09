import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { ModelDescriptor, ModelExecutionResult } from '../src/contracts';
import {
  ClaudeCliProvider,
  FakeModelProvider,
  ModelProviderRegistry,
  ModelResolutionError,
  ModelSelectionLockStore,
  type ClaudeCliAdapter,
} from '../src/models';

function descriptor(provider: string, modelId: string, overrides: Partial<ModelDescriptor> = {}): ModelDescriptor {
  return {
    provider,
    modelId,
    tiers: ['balanced'],
    contextWindowTokens: 32_000,
    supportsTools: false,
    latencyClass: 'standard',
    costClass: 'medium',
    ...overrides,
  };
}

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-model-provider-'));
}

describe('ModelProviderRegistry', () => {
  it('resolves neutrally by tier, context, tools, latency, and cost rather than a provider-specific id', async () => {
    const registry = new ModelProviderRegistry();
    registry.register(new FakeModelProvider('alpha', [
      descriptor('alpha', 'alpha-balanced', { tiers: ['balanced'], contextWindowTokens: 64_000, supportsTools: true, latencyClass: 'fast', costClass: 'low' }),
    ]));
    registry.register(new FakeModelProvider('beta', [
      descriptor('beta', 'beta-deep', { tiers: ['deep'], contextWindowTokens: 200_000, supportsTools: true, latencyClass: 'standard', costClass: 'medium' }),
    ]));

    const resolved = await registry.resolve({
      tier: 'deep',
      minContextTokens: 100_000,
      requiresTools: true,
      latencyPreference: 'standard',
    });

    expect(resolved).toMatchObject({ provider: 'beta', modelId: 'beta-deep', tier: 'deep' });
    expect(resolved.reason).toContain('supports tools');
  });

  it('keeps provider selection explicit when requested and returns actionable diagnostics when no model fits', async () => {
    const registry = new ModelProviderRegistry();
    registry.register(new FakeModelProvider('alpha', [descriptor('alpha', 'alpha-fast', { tiers: ['fast'], supportsTools: false })]));
    registry.register(new FakeModelProvider('beta', [descriptor('beta', 'beta-fast', { tiers: ['fast'], supportsTools: true })]));

    await expect(registry.resolve({ tier: 'fast', requiresTools: true }, { providerId: 'alpha' }))
      .rejects.toBeInstanceOf(ModelResolutionError);
    const diagnostics = await registry.diagnose({ tier: 'fast', requiresTools: true }, { providerId: 'alpha' });
    expect(diagnostics.some((diagnostic) => diagnostic.ok === false && diagnostic.message.includes('tool support'))).toBe(true);

    const explicit = await registry.resolve({ tier: 'fast' }, { providerId: 'alpha' });
    expect(explicit.provider).toBe('alpha');
  });
});

describe('ClaudeCliProvider', () => {
  it('uses an injected Claude CLI adapter while keeping workflow requirements provider-neutral', async () => {
    const invocations: Array<{ modelId: string; prompt: string }> = [];
    const adapter: ClaudeCliAdapter = {
      async execute(invocation): Promise<ModelExecutionResult> {
        invocations.push(invocation);
        return { content: 'Claude response', stopReason: 'end_turn', usage: { inputTokens: 10, outputTokens: 5 } };
      },
      async validate() {
        return { available: true, authenticated: true, message: 'Claude CLI test adapter is ready.' };
      },
    };
    const provider = new ClaudeCliProvider({
      adapter,
      now: () => '2026-08-09T10:00:00.000Z',
      modelVersions: { 'claude-unit-deep': '2026.08' },
      models: [descriptor('ignored', 'claude-unit-deep', { tiers: ['deep', 'review'], contextWindowTokens: 200_000, supportsTools: true })],
    });

    const model = await provider.resolve({ tier: 'deep', requiresTools: true, capability: 'ast-graph' });
    const result = await provider.execute({ resolvedModel: model, prompt: 'Review this change', toolNames: ['ast-graph'] });

    expect(model).toMatchObject({ provider: 'claude', modelId: 'claude-unit-deep', modelVersion: '2026.08', tier: 'deep' });
    expect(model.reason).toContain('ast-graph');
    expect(invocations).toEqual([{ modelId: 'claude-unit-deep', prompt: 'Review this change', maxOutputTokens: undefined }]);
    expect(result.content).toBe('Claude response');
    expect(await provider.validateConfiguration()).toEqual([{ provider: 'claude', ok: true, code: undefined, message: 'Claude CLI test adapter is ready.' }]);
  });
});

describe('ModelSelectionLockStore', () => {
  it('persists the provider, model id, version, tier, and reason selected for a run', async () => {
    const root = tmpRoot();
    const provider = new FakeModelProvider('fake', [descriptor('fake', 'fake-review', { tiers: ['review'], supportsTools: true })], {
      modelVersions: { 'fake-review': '1.2.3' },
      now: () => '2026-08-09T10:00:00.000Z',
    });
    const selected = await provider.resolve({ tier: 'review', requiresTools: true });
    const lock = new ModelSelectionLockStore(root, () => '2026-08-09T10:01:00.000Z');
    lock.record('verify.review', selected);

    expect(lock.load()).toEqual({
      schemaVersion: 1,
      selections: { 'verify.review': selected },
      updatedAt: '2026-08-09T10:01:00.000Z',
    });
    expect(fs.readFileSync(lock.file(), 'utf8')).toContain('fake-review');
  });
});
