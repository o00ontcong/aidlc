import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { writeFileAtomic } from '../epic';
import {
  BUILTIN_COMMAND_PROVIDER_IDS,
  BUNDLED_MODEL_MAPPINGS,
  BUILTIN_COMMAND_PROVIDERS,
  type BuiltinCommandProviderId,
} from '../providers/bundledModelMappings';

export interface ProviderEntry {
  enabled: boolean;
  cli?: string;
  /** Fallback model for commands that do not map to a workflow phase. */
  model?: string;
}

export interface CommandProviderConfigV2 {
  schemaVersion: 2;
  defaultProvider: string;
  providers: Record<string, ProviderEntry>;
  modelMappings: Record<string, Record<string, string>>;
}

export interface CommandProviderConfigV1 {
  schemaVersion: 1;
  defaultProvider: string;
}

export type CommandProviderConfig = CommandProviderConfigV2;

function defaultProviders(): Record<string, ProviderEntry> {
  const out: Record<string, ProviderEntry> = {};
  for (const id of BUILTIN_COMMAND_PROVIDER_IDS) {
    out[id] = {
      enabled: id === 'claude',
      cli: BUILTIN_COMMAND_PROVIDERS[id].cli,
      model: {
        claude: 'claude-sonnet-5',
        cursor: 'gpt-5.2',
        codex: 'gpt-5.2-codex',
        opencode: 'opencode/big-pickle',
      }[id],
    };
  }
  return out;
}

function mergeBundledMappings(
  stored?: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [canonical, defaults] of Object.entries(BUNDLED_MODEL_MAPPINGS)) {
    out[canonical] = { ...defaults, ...(stored?.[canonical] ?? {}) };
  }
  if (stored) {
    for (const [canonical, byProvider] of Object.entries(stored)) {
      if (!out[canonical]) { out[canonical] = { ...byProvider }; }
    }
  }
  return out;
}

const LEGACY_OPENCODE_MODELS = new Set([
  'openai/gpt-5.2',
  'openai/gpt-5.2-codex-mini',
]);

/**
 * Older AIDLC releases generated OpenCode mappings that assume an OpenAI
 * credential. Preserve explicit user selections, but upgrade generated v2
 * config that predates the per-provider `model` field to OpenCode's built-in
 * models so a fresh OpenCode install can run without an OpenAI login.
 */
function migrateLegacyOpenCodeMappings(
  raw: Partial<CommandProviderConfigV2>,
  modelMappings: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const explicitModel = raw.providers?.opencode?.model;
  if (typeof explicitModel === 'string' && explicitModel.trim()) { return modelMappings; }
  for (const [canonical, mappings] of Object.entries(modelMappings)) {
    if (!LEGACY_OPENCODE_MODELS.has(mappings.opencode ?? '')) { continue; }
    const bundled = BUNDLED_MODEL_MAPPINGS[canonical]?.opencode;
    if (bundled) { mappings.opencode = bundled; }
  }
  return modelMappings;
}

/** Durable provider preference; credentials remain provider-owned and are never stored here. */
export class ModelProviderConfigStore {
  constructor(private readonly workspaceRoot: string) {}

  file(): string {
    return path.join(this.workspaceRoot, '.aidlc', 'providers.yaml');
  }

  defaultConfig(): CommandProviderConfigV2 {
    return {
      schemaVersion: 2,
      defaultProvider: 'claude',
      providers: defaultProviders(),
      modelMappings: mergeBundledMappings(),
    };
  }

  load(): CommandProviderConfigV2 | null {
    if (!fs.existsSync(this.file())) { return null; }
    const raw = yaml.load(fs.readFileSync(this.file(), 'utf8')) as
      | Partial<CommandProviderConfigV2>
      | Partial<CommandProviderConfigV1>
      | null;
    if (!raw || typeof raw.defaultProvider !== 'string' || !raw.defaultProvider.trim()) {
      throw new Error(`Invalid provider config at ${this.file()}.`);
    }
    if (raw.schemaVersion === 1) {
      return this.migrateV1(raw as CommandProviderConfigV1);
    }
    if (raw.schemaVersion !== 2) {
      throw new Error(`Unsupported provider config schema at ${this.file()}.`);
    }
    return this.normalizeV2(raw as Partial<CommandProviderConfigV2>);
  }

  loadOrDefault(): CommandProviderConfigV2 {
    return this.load() ?? this.defaultConfig();
  }

  save(config: CommandProviderConfigV2): CommandProviderConfigV2 {
    const normalized = this.normalizeV2(config);
    if (!normalized.defaultProvider.trim()) {
      throw new Error('Default provider id must not be empty.');
    }
    writeFileAtomic(this.file(), yaml.dump(normalized, { noRefs: true }));
    return normalized;
  }

  /** Back-compat helper — set default provider id only. */
  saveDefaultProvider(defaultProvider: string): CommandProviderConfigV2 {
    const config = this.loadOrDefault();
    config.defaultProvider = defaultProvider;
    return this.save(config);
  }

  setDefaultProvider(providerId: string): CommandProviderConfigV2 {
    const config = this.loadOrDefault();
    if (!BUILTIN_COMMAND_PROVIDERS[providerId as BuiltinCommandProviderId]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    config.defaultProvider = providerId;
    return this.save(config);
  }

  /** Set the provider-wide fallback model used when a step mapping is unavailable. */
  setProviderModel(providerId: string, model: string): CommandProviderConfigV2 {
    if (!BUILTIN_COMMAND_PROVIDERS[providerId as BuiltinCommandProviderId]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    const trimmed = model.trim();
    if (!trimmed) { throw new Error('Default model must not be empty.'); }
    const config = this.loadOrDefault();
    const entry = config.providers[providerId] ?? {
      enabled: false,
      cli: BUILTIN_COMMAND_PROVIDERS[providerId as BuiltinCommandProviderId].cli,
    };
    entry.model = trimmed;
    config.providers[providerId] = entry;
    return this.save(config);
  }

  enableProvider(providerId: string): CommandProviderConfigV2 {
    const config = this.loadOrDefault();
    const entry = config.providers[providerId] ?? {
      enabled: false,
      cli: BUILTIN_COMMAND_PROVIDERS[providerId as BuiltinCommandProviderId]?.cli ?? providerId,
    };
    entry.enabled = true;
    config.providers[providerId] = entry;
    if (!config.defaultProvider || !config.providers[config.defaultProvider]?.enabled) {
      config.defaultProvider = providerId;
    }
    return this.save(config);
  }

  listEnabledProviderIds(config: CommandProviderConfigV2 = this.loadOrDefault()): string[] {
    return Object.entries(config.providers)
      .filter(([, entry]) => entry.enabled)
      .map(([id]) => id);
  }

  mapModel(
    canonicalModel: string,
    providerId: string,
    config: CommandProviderConfigV2 = this.loadOrDefault(),
  ): string {
    return config.modelMappings[canonicalModel]?.[providerId] ?? canonicalModel;
  }

  /** Resolve a mapped phase model or the provider's persisted fallback model. */
  modelFor(
    providerId: string,
    canonicalModel?: string,
    config: CommandProviderConfigV2 = this.loadOrDefault(),
  ): string | undefined {
    if (canonicalModel) { return this.mapModel(canonicalModel, providerId, config); }
    const model = config.providers[providerId]?.model;
    return model?.trim() || undefined;
  }

  cliFor(providerId: string, config: CommandProviderConfigV2 = this.loadOrDefault()): string {
    const override = config.providers[providerId]?.cli;
    if (override?.trim()) { return override.trim(); }
    return BUILTIN_COMMAND_PROVIDERS[providerId as BuiltinCommandProviderId]?.cli ?? providerId;
  }

  private migrateV1(v1: CommandProviderConfigV1): CommandProviderConfigV2 {
    return this.normalizeV2({
      schemaVersion: 2,
      defaultProvider: v1.defaultProvider,
      providers: defaultProviders(),
      modelMappings: mergeBundledMappings(),
    });
  }

  private normalizeV2(raw: Partial<CommandProviderConfigV2>): CommandProviderConfigV2 {
    const defaults = defaultProviders();
    const providers: Record<string, ProviderEntry> = { ...defaults };
    if (raw.providers && typeof raw.providers === 'object') {
      for (const [id, entry] of Object.entries(raw.providers)) {
        if (!entry || typeof entry !== 'object') { continue; }
        providers[id] = {
          enabled: entry.enabled === true,
          cli: typeof entry.cli === 'string' && entry.cli.trim()
            ? entry.cli.trim()
            : defaults[id]?.cli ?? id,
          model: typeof entry.model === 'string' && entry.model.trim()
            ? entry.model.trim()
            : defaults[id]?.model,
        };
      }
    }
    const defaultProvider = typeof raw.defaultProvider === 'string' && raw.defaultProvider.trim()
      ? raw.defaultProvider.trim()
      : 'claude';
    const resolvedDefault = BUILTIN_COMMAND_PROVIDERS[defaultProvider as BuiltinCommandProviderId]
      ? defaultProvider
      : 'claude';
    // Always keep at least claude applied so fresh workspaces have command files.
    if (!Object.values(providers).some((e) => e.enabled)) {
      providers.claude.enabled = true;
    }
    return {
      schemaVersion: 2,
      defaultProvider: resolvedDefault,
      providers,
      modelMappings: migrateLegacyOpenCodeMappings(raw, mergeBundledMappings(raw.modelMappings)),
    };
  }
}

/** @deprecated alias — same store, v2 schema. */
export type ModelProviderConfig = CommandProviderConfigV2;
