import { describe, expect, it } from 'vitest';
import {
  applyDefaultProvider,
  applyProvider,
  isRunStepDisabled,
  mapModelForProvider,
  MOCK_PROVIDER_CONFIG,
  runStepButtonLabel,
} from '../src/webview/lib/providers';

describe('providers (UI step 1)', () => {
  it('maps canonical model for cursor default', () => {
    let cfg = applyProvider(MOCK_PROVIDER_CONFIG, 'cursor');
    cfg = applyDefaultProvider(cfg, 'cursor');
    expect(mapModelForProvider('claude-opus-4', 'cursor', cfg.modelMappings)).toBe('claude-opus-4-8');
  });

  it('maps canonical model for OpenCode default', () => {
    let cfg = applyProvider(MOCK_PROVIDER_CONFIG, 'opencode');
    cfg = applyDefaultProvider(cfg, 'opencode');
    expect(mapModelForProvider('claude-opus-5', 'opencode', cfg.modelMappings)).toBe('opencode/big-pickle');
  });

  it('apply is one-way — cannot un-apply', () => {
    let cfg = MOCK_PROVIDER_CONFIG;
    cfg = applyProvider(cfg, 'cursor');
    expect(cfg.providers.find((p) => p.id === 'cursor')?.enabled).toBe(true);
    cfg = applyProvider(cfg, 'cursor');
    expect(cfg.providers.filter((p) => p.id === 'cursor' && p.enabled)).toHaveLength(1);
  });

  it('builds run button label from active provider', () => {
    let cfg = applyProvider(MOCK_PROVIDER_CONFIG, 'cursor');
    cfg = applyDefaultProvider(cfg, 'cursor');
    expect(runStepButtonLabel(cfg, 'default')).toBe('Run with Cursor Agent');
    expect(runStepButtonLabel(cfg, 'again')).toBe('Run again with Cursor Agent');
  });

  it('disables run when default provider CLI is missing', () => {
    expect(isRunStepDisabled(MOCK_PROVIDER_CONFIG)).toBe(false);
    const cfg = applyDefaultProvider(MOCK_PROVIDER_CONFIG, 'codex');
    expect(isRunStepDisabled(cfg)).toBe(true);
  });

  it('can set default without Apply (enabled=false in UI state)', () => {
    const cfg = applyDefaultProvider(MOCK_PROVIDER_CONFIG, 'cursor');
    expect(cfg.defaultProvider).toBe('cursor');
    expect(cfg.providers.find((p) => p.id === 'cursor')?.enabled).toBe(false);
    expect(cfg.providers.find((p) => p.id === 'cursor')?.isDefault).toBe(true);
  });
});
