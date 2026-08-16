import { execFileSync } from 'child_process';

import {
  BUILTIN_COMMAND_PROVIDER_IDS,
  BUILTIN_COMMAND_PROVIDERS,
  ModelProviderConfigStore,
  listCommandProviderAdapters,
} from '@aidlc/core';

/** Mirrors webview `ProviderConfig` — kept in host to avoid webview imports. */
export interface ProviderConfigUi {
  defaultProvider: string;
  modelMappings: Record<string, Record<string, string>>;
  providers: Array<{
    id: string;
    displayName: string;
    enabled: boolean;
    cli: string;
    model?: string;
    /** Locally discoverable models for the provider, if its CLI supports it. */
    models?: string[];
    isDefault: boolean;
    diagnostic: { ok: boolean; message: string };
  }>;
}

const MODEL_CACHE_TTL_MS = 30_000;
const modelCache = new Map<string, { models: string[] | undefined; loadedAt: number }>();

function modelCacheKey(root: string, providerId: string, cli: string): string {
  return `${root}\u0000${providerId}\u0000${cli}`;
}

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/;
const ANSI_ESCAPE = /\u001B\[[0-?]*[ -/]*[@-~]/g;

/** Claude Code exposes stable model aliases, but no non-interactive model-list command. */
export const CLAUDE_CODE_MODEL_ALIASES = ['sonnet', 'opus', 'haiku', 'fable'] as const;

/** Parse newline-delimited ids, including `id - display name` output from Cursor. */
export function parseCliModelList(output: string): string[] {
  return [...new Set(output.split(/\r?\n/)
    .map((line) => line.replace(ANSI_ESCAPE, '').trim())
    .map((line) => line.match(/^([^\s]+)\s+-\s+/)?.[1] ?? line)
    .filter((model): model is string => MODEL_ID.test(model)))];
}

/** Parse the newline-delimited output of `opencode models`. */
export function parseOpenCodeModels(output: string): string[] {
  return parseCliModelList(output).filter((model) => model.includes('/'));
}

/** Extract model ids from Codex app-server's `model/list` JSON-RPC response. */
export function parseCodexModels(output: string): string[] {
  try {
    const payload = JSON.parse(output) as { data?: Array<{ model?: unknown; id?: unknown }> };
    return [...new Set((payload.data ?? [])
      .map((entry) => typeof entry.model === 'string' ? entry.model : entry.id)
      .filter((model): model is string => typeof model === 'string' && MODEL_ID.test(model)))];
  } catch {
    return [];
  }
}

// Codex has no `models` CLI subcommand. Its supported app-server protocol is
// the same catalog API used by the native client. This small bridge performs
// the mandatory initialize handshake before requesting `model/list`.
const CODEX_MODEL_LIST_BRIDGE = String.raw`
const { spawn } = require('node:child_process');
const cli = process.argv[1];
const child = spawn(cli, ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'ignore'] });
let buffer = '';
let completed = false;
const timeout = setTimeout(() => finish(''), 4000);
function finish(value) {
  if (completed) return;
  completed = true;
  clearTimeout(timeout);
  process.stdout.write(value);
  child.stdin.end();
  child.kill();
}
child.on('error', () => finish(''));
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString('utf8');
  for (;;) {
    const end = buffer.indexOf('\n');
    if (end < 0) break;
    const line = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    try {
      const message = JSON.parse(line);
      if (message.id === 1) {
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'model/list', params: {} }) + '\n');
      } else if (message.id === 2 && message.result) {
        finish(JSON.stringify(message.result));
      }
    } catch { /* Ignore app-server notifications and malformed output. */ }
  }
});
child.stdin.write(JSON.stringify({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { clientInfo: { name: 'aidlc', version: '1' } },
}) + '\n');
`;

function listCodexModels(cli: string, root: string): string[] | undefined {
  try {
    const output = execFileSync(process.execPath, ['-e', CODEX_MODEL_LIST_BRIDGE, cli], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    });
    const models = parseCodexModels(output);
    return models.length ? models : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Query each provider through its native catalog mechanism. Claude Code does
 * not offer a non-interactive catalog, so expose only its documented aliases.
 */
export function availableModelsForProvider(
  root: string,
  providerId: string,
  cli: string,
): string[] | undefined {
  const key = modelCacheKey(root, providerId, cli);
  const cached = modelCache.get(key);
  if (cached && Date.now() - cached.loadedAt < MODEL_CACHE_TTL_MS) { return cached.models; }
  let models: string[] | undefined;
  try {
    switch (providerId) {
      case 'claude':
        // Verify the configured command exists before offering aliases.
        execFileSync(cli, ['--version'], { cwd: root, encoding: 'utf8', timeout: 5_000 });
        models = [...CLAUDE_CODE_MODEL_ALIASES];
        break;
      case 'cursor':
        models = parseCliModelList(execFileSync(cli, ['models'], {
          cwd: root, encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024,
        }));
        break;
      case 'codex':
        models = listCodexModels(cli, root);
        break;
      case 'opencode':
        models = parseOpenCodeModels(execFileSync(cli, ['models'], {
          cwd: root, encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024,
        }));
        break;
    }
    if (!models?.length) { models = undefined; }
  } catch {
    models = undefined;
  }
  modelCache.set(key, { models, loadedAt: Date.now() });
  return models;
}

/** Force the next sidebar refresh to query the provider CLI again. */
export function invalidateAvailableModels(root: string, providerId?: string): void {
  for (const key of modelCache.keys()) {
    if (key.startsWith(`${root}\u0000`) && (!providerId || key.includes(`\u0000${providerId}\u0000`))) {
      modelCache.delete(key);
    }
  }
}

export function whichCli(binary: string): string | null {
  try {
    const out = execFileSync('which', [binary], { encoding: 'utf8' }).trim();
    return out || null;
  } catch {
    return null;
  }
}

export function diagnoseProviderCli(cli: string): { ok: boolean; message: string } {
  const found = whichCli(cli);
  if (!found) {
    return { ok: false, message: 'Not on PATH' };
  }
  return { ok: true, message: 'CLI ready' };
}

export function buildProviderConfigUi(root: string | undefined): ProviderConfigUi | undefined {
  if (!root) { return undefined; }
  const store = new ModelProviderConfigStore(root);
  const config = store.loadOrDefault();
  const adapters = listCommandProviderAdapters();
  const adapterById = new Map(adapters.map((a) => [a.id, a]));

  const providers = BUILTIN_COMMAND_PROVIDER_IDS.map((id) => {
    const adapter = adapterById.get(id);
    const entry = config.providers[id];
    const cli = store.cliFor(id, config);
    const model = store.modelFor(id, undefined, config);
    const displayName = adapter?.displayName ?? BUILTIN_COMMAND_PROVIDERS[id].displayName;
    const diagnostic = diagnoseProviderCli(cli);
    return {
      id,
      displayName,
      enabled: entry?.enabled === true,
      cli,
      model,
      models: availableModelsForProvider(root, id, cli),
      isDefault: config.defaultProvider === id,
      diagnostic,
    };
  });

  return {
    defaultProvider: config.defaultProvider,
    modelMappings: config.modelMappings,
    providers,
  };
}

export function getProviderConfigStore(root: string): ModelProviderConfigStore {
  return new ModelProviderConfigStore(root);
}
