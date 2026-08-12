import {
  CORE_ERROR_CODES,
  type ModelDescriptor,
  type ModelProvider,
  type ModelRequirement,
  type ProviderDiagnostic,
  type ResolvedModel,
} from '../contracts';
import { bestModelCandidate, describeUnsatisfiedRequirement, rankModelCandidates } from './modelResolution';
import { ClaudeCliProvider, type ClaudeCliProviderOptions } from './ClaudeCliProvider';

export class ModelProviderNotFoundError extends Error {
  readonly code = CORE_ERROR_CODES.PROVIDER_UNAVAILABLE;
  constructor(readonly providerId: string) {
    super(`Model provider "${providerId}" is not registered.`);
    this.name = 'ModelProviderNotFoundError';
  }
}

export class ModelProviderAlreadyRegisteredError extends Error {
  constructor(readonly providerId: string) {
    super(`Model provider "${providerId}" is already registered.`);
    this.name = 'ModelProviderAlreadyRegisteredError';
  }
}

export class ModelResolutionError extends Error {
  readonly code = CORE_ERROR_CODES.PROVIDER_UNAVAILABLE;
  constructor(message: string, readonly diagnostics: ProviderDiagnostic[] = []) {
    super(message);
    this.name = 'ModelResolutionError';
  }
}

export interface ResolveModelOptions {
  /** Restrict resolution to a named provider; otherwise all registered providers compete neutrally. */
  providerId?: string;
}

/**
 * Registry and neutral selection layer. Workflow/Epic callers submit only a
 * `ModelRequirement`; this class ranks provider descriptors before delegating
 * final resolution to the selected provider.
 */
export class ModelProviderRegistry {
  private readonly providers = new Map<string, ModelProvider>();
  private defaultProviderId?: string;

  register(provider: ModelProvider, options: { default?: boolean } = {}): void {
    if (this.providers.has(provider.id)) throw new ModelProviderAlreadyRegisteredError(provider.id);
    this.providers.set(provider.id, provider);
    if (options.default || !this.defaultProviderId) this.defaultProviderId = provider.id;
  }

  unregister(providerId: string): void {
    this.providers.delete(providerId);
    if (this.defaultProviderId === providerId) this.defaultProviderId = this.providers.keys().next().value;
  }

  get(providerId: string): ModelProvider {
    const provider = this.providers.get(providerId);
    if (!provider) throw new ModelProviderNotFoundError(providerId);
    return provider;
  }

  list(): ModelProvider[] {
    return [...this.providers.values()];
  }

  getDefault(): ModelProvider {
    if (!this.defaultProviderId) throw new ModelResolutionError('No model provider is registered.');
    return this.get(this.defaultProviderId);
  }

  setDefault(providerId: string): void {
    this.get(providerId);
    this.defaultProviderId = providerId;
  }

  async resolve(requirement: ModelRequirement, options: ResolveModelOptions = {}): Promise<ResolvedModel> {
    const providers = options.providerId ? [this.get(options.providerId)] : this.list();
    if (!providers.length) throw new ModelResolutionError('No model provider is registered.');

    const discovered = await Promise.all(providers.map(async (provider) => ({
      provider,
      descriptors: await provider.discoverModels(),
    })));
    const rankedProviders = discovered
      .map(({ provider, descriptors }) => ({ provider, candidate: bestModelCandidate(descriptors, requirement) }))
      .filter((entry): entry is { provider: ModelProvider; candidate: NonNullable<ReturnType<typeof bestModelCandidate>> } => entry.candidate !== null)
      .sort((a, b) => b.candidate.score - a.candidate.score || a.provider.id.localeCompare(b.provider.id));

    if (!rankedProviders.length) {
      throw new ModelResolutionError(describeUnsatisfiedRequirement(requirement), await this.diagnose(requirement, options));
    }

    const diagnostics: ProviderDiagnostic[] = [];
    for (const { provider } of rankedProviders) {
      try {
        const resolved = await provider.resolve(requirement);
        const descriptors = discovered.find((entry) => entry.provider === provider)?.descriptors ?? [];
        const valid = rankModelCandidates(descriptors.filter((model) => model.modelId === resolved.modelId), requirement).length > 0;
        if (resolved.provider === provider.id && valid) return resolved;
        diagnostics.push({
          provider: provider.id,
          ok: false,
          code: CORE_ERROR_CODES.PROVIDER_UNAVAILABLE,
          message: 'Provider resolved a model that does not satisfy the requested tier, context, or tool constraints.',
        });
      } catch (error) {
        diagnostics.push({
          provider: provider.id,
          ok: false,
          code: CORE_ERROR_CODES.PROVIDER_UNAVAILABLE,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    throw new ModelResolutionError(describeUnsatisfiedRequirement(requirement), diagnostics);
  }

  async diagnose(requirement?: ModelRequirement, options: ResolveModelOptions = {}): Promise<ProviderDiagnostic[]> {
    const providers = options.providerId ? [this.get(options.providerId)] : this.list();
    const diagnostics: ProviderDiagnostic[] = [];
    for (const provider of providers) {
      try {
        diagnostics.push(...await provider.validateConfiguration());
        if (requirement) {
          const candidate = bestModelCandidate(await provider.discoverModels(), requirement);
          if (!candidate) {
            diagnostics.push({
              provider: provider.id,
              ok: false,
              code: CORE_ERROR_CODES.PROVIDER_UNAVAILABLE,
              message: describeUnsatisfiedRequirement(requirement),
            });
          }
        }
      } catch (error) {
        diagnostics.push({
          provider: provider.id,
          ok: false,
          code: CORE_ERROR_CODES.PROVIDER_UNAVAILABLE,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return diagnostics;
  }
}

/**
 * Create the product default registry.  Claude is deliberately installed via
 * the same registry contract as every other provider, so callers can replace
 * it or add a competing provider without changing workflow code.
 */
export function createDefaultModelProviderRegistry(options: ClaudeCliProviderOptions = {}): ModelProviderRegistry {
  const registry = new ModelProviderRegistry();
  registry.register(new ClaudeCliProvider(options), { default: true });
  return registry;
}
