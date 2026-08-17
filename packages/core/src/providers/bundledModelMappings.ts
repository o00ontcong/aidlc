/** Strongest OpenCode catalog model for unlimited-token agent/coding steps. */
export const OPENCODE_FLAGSHIP_MODEL = 'silvertiger/glm-5.3';

/**
 * Generated / previous-catalog OpenCode ids. Load upgrades these to
 * {@link OPENCODE_FLAGSHIP_MODEL} so pipeline steps pick up a provider
 * catalog refresh without a hand edit.
 */
export const SUPERSEDED_OPENCODE_MODELS = new Set([
  'openai/gpt-5.2',
  'openai/gpt-5.2-codex-mini',
  'opencode/big-pickle',
  'opencode/deepseek-v4-flash-free',
  'opencode/hy3-free',
  'opencode/laguna-s-2.1-free',
  'opencode/mimo-v2.5-free',
  'opencode/nemotron-3-ultra-free',
  'opencode/nemotron-3.5-lightning-free',
  'silvertiger/deepseek-v4-flash',
  'silvertiger/deepseek-v4-pro',
  'silvertiger/glm-5',
  'silvertiger/glm-5.1',
  'silvertiger/glm-5.2',
  'silvertiger_tech/glm-5',
]);

export function upgradeOpenCodeModelId(model: string | undefined): string | undefined {
  if (!model) { return model; }
  return SUPERSEDED_OPENCODE_MODELS.has(model) ? OPENCODE_FLAGSHIP_MODEL : model;
}

/** Bundled canonical Claude model id → provider-specific model id. */
export const BUNDLED_MODEL_MAPPINGS: Record<string, Record<string, string>> = {
  'claude-opus-5': {
    claude: 'claude-opus-5', cursor: 'claude-opus-4-8', codex: 'o3', opencode: OPENCODE_FLAGSHIP_MODEL,
  },
  'claude-sonnet-5': {
    claude: 'claude-sonnet-5', cursor: 'gpt-5.2', codex: 'gpt-5.2-codex', opencode: OPENCODE_FLAGSHIP_MODEL,
  },
  'claude-opus-4': {
    claude: 'claude-opus-4', cursor: 'claude-opus-4-8', codex: 'o3', opencode: OPENCODE_FLAGSHIP_MODEL,
  },
  'claude-haiku-4-5-20251001': {
    claude: 'claude-haiku-4-5-20251001',
    cursor: 'gpt-5.2-fast',
    codex: 'gpt-5.2-codex-mini',
    opencode: OPENCODE_FLAGSHIP_MODEL,
  },
};

export const BUILTIN_COMMAND_PROVIDER_IDS = ['claude', 'cursor', 'codex', 'opencode'] as const;
export type BuiltinCommandProviderId = (typeof BUILTIN_COMMAND_PROVIDER_IDS)[number];

export const BUILTIN_COMMAND_PROVIDERS: Record<
  BuiltinCommandProviderId,
  { displayName: string; cli: string }
> = {
  claude: { displayName: 'Claude Code', cli: 'claude' },
  cursor: { displayName: 'Cursor Agent', cli: 'agent' },
  codex: { displayName: 'OpenAI Codex', cli: 'codex' },
  opencode: { displayName: 'OpenCode', cli: 'opencode' },
};
