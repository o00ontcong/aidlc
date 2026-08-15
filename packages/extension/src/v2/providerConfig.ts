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
    isDefault: boolean;
    diagnostic: { ok: boolean; message: string };
  }>;
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
