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

/** Parse the newline-delimited output of `opencode models`. */
export function parseOpenCodeModels(output: string): string[] {
  return [...new Set(output.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.:-]+$/.test(line)))];
}

/**
 * Query models only for provider CLIs with a stable, non-interactive listing
 * command. More providers can be added here without changing runner logic.
 */
export function availableModelsForProvider(
  root: string,
  providerId: string,
  cli: string,
): string[] | undefined {
  if (providerId !== 'opencode') { return undefined; }
  const key = modelCacheKey(root, providerId, cli);
  const cached = modelCache.get(key);
  if (cached && Date.now() - cached.loadedAt < MODEL_CACHE_TTL_MS) { return cached.models; }
  let models: string[] | undefined;
  try {
    models = parseOpenCodeModels(execFileSync(cli, ['models'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    }));
    if (!models.length) { models = undefined; }
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
