/**
 * Provider display helpers + bundled mock config for UI step 1 (harness / pre-host).
 */

import type { ModelMappings, ProviderConfig, ProviderInfo } from './types';

export const BUNDLED_MODEL_MAPPINGS: ModelMappings = {
  'claude-opus-5': {
    claude: 'claude-opus-5', cursor: 'claude-opus-4-8', codex: 'o3', opencode: 'opencode/big-pickle',
  },
  'claude-sonnet-5': {
    claude: 'claude-sonnet-5', cursor: 'gpt-5.2', codex: 'gpt-5.2-codex', opencode: 'opencode/big-pickle',
  },
  'claude-opus-4': {
    claude: 'claude-opus-4', cursor: 'claude-opus-4-8', codex: 'o3', opencode: 'opencode/big-pickle',
  },
  'claude-haiku-4-5-20251001': {
    claude: 'claude-haiku-4-5-20251001',
    cursor: 'gpt-5.2-fast',
    codex: 'gpt-5.2-codex-mini',
    opencode: 'opencode/deepseek-v4-flash-free',
  },
};

/** Mock diagnostics for harness: claude ok, cursor warn, codex missing. */
export const MOCK_PROVIDER_CONFIG: ProviderConfig = {
  defaultProvider: 'claude',
  modelMappings: BUNDLED_MODEL_MAPPINGS,
  providers: [
    {
      id: 'claude',
      displayName: 'Claude Code',
      enabled: true,
      cli: 'claude',
      isDefault: true,
      diagnostic: { ok: true, message: 'CLI ready · authenticated' },
    },
    {
      id: 'cursor',
      displayName: 'Cursor Agent',
      enabled: false,
      cli: 'agent',
      isDefault: false,
      diagnostic: { ok: false, message: 'Sign in required' },
    },
    {
      id: 'codex',
      displayName: 'OpenAI Codex',
      enabled: false,
      cli: 'codex',
      isDefault: false,
      diagnostic: { ok: false, message: 'Not on PATH' },
    },
    {
      id: 'opencode',
      displayName: 'OpenCode',
      enabled: false,
      cli: 'opencode',
      model: 'opencode/big-pickle',
      isDefault: false,
      diagnostic: { ok: false, message: 'Not on PATH' },
    },
  ],
};

export function providerById(config: ProviderConfig, id: string): ProviderInfo | undefined {
  return config.providers.find((p) => p.id === id);
}

export function defaultProviderInfo(config: ProviderConfig): ProviderInfo {
  return providerById(config, config.defaultProvider)
    ?? config.providers.find((p) => p.enabled)
    ?? config.providers[0];
}

export function mapModelForProvider(
  canonicalModel: string,
  providerId: string,
  mappings: ModelMappings = BUNDLED_MODEL_MAPPINGS,
): string {
  return mappings[canonicalModel]?.[providerId] ?? canonicalModel;
}

export type RunStepLabelVariant = 'default' | 'again' | 'feedback';

export function runStepDisabledHint(): string {
  return 'Configure agent provider in sidebar → Agent Provider';
}

export function isRunStepDisabled(config: ProviderConfig | undefined): boolean {
  const diagnostic = defaultProviderInfo(config ?? MOCK_PROVIDER_CONFIG).diagnostic;
  return !diagnostic.ok;
}

export function runStepButtonLabel(
  config: ProviderConfig | undefined,
  variant: RunStepLabelVariant = 'default',
): string {
  if (variant === 'feedback') { return 'Update with feedback'; }
  const name = config ? defaultProviderInfo(config).displayName : 'Claude Code';
  if (variant === 'again') { return `Run again with ${name}`; }
  return `Run with ${name}`;
}

export function providerStatusTone(diagnostic: ProviderInfo['diagnostic']): 'ok' | 'warn' | 'err' {
  if (diagnostic.ok) { return 'ok'; }
  const msg = diagnostic.message.toLowerCase();
  if (msg.includes('path') || msg.includes('not found') || msg.includes('missing')) { return 'err'; }
  return 'warn';
}

export function applyDefaultProvider(config: ProviderConfig, providerId: string): ProviderConfig {
  return {
    ...config,
    defaultProvider: providerId,
    providers: config.providers.map((p) => ({
      ...p,
      isDefault: p.id === providerId,
    })),
  };
}

export function applyProvider(config: ProviderConfig, providerId: string): ProviderConfig {
  const target = config.providers.find((p) => p.id === providerId);
  if (!target || target.enabled) { return config; }
  return {
    ...config,
    providers: config.providers.map((p) =>
      (p.id === providerId ? { ...p, enabled: true } : p)),
  };
}

/** @deprecated Use applyProvider — enable is one-way (Apply), never toggled off. */
export function applyProviderEnabled(
  config: ProviderConfig,
  providerId: string,
  enabled: boolean,
): ProviderConfig {
  if (!enabled) { return config; }
  return applyProvider(config, providerId);
}
