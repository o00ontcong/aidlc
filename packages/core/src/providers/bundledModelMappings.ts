/** Bundled canonical Claude model id → provider-specific model id. */
export const BUNDLED_MODEL_MAPPINGS: Record<string, Record<string, string>> = {
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
