import {
  DEFAULT_CAPABILITIES,
  type Capability,
  type CapabilityHealthStatus,
  type CapabilityProvider,
  type CapabilityRequirement,
} from '../contracts';

/** Project-local enable/disable overrides; missing values use each descriptor's default. */
export type CapabilityPolicy = Readonly<Record<string, boolean>>;

export class CapabilityNotFoundError extends Error {
  constructor(readonly capabilityId: string) {
    super(`Capability "${capabilityId}" is not registered.`);
    this.name = 'CapabilityNotFoundError';
  }
}

export class CapabilityAlreadyRegisteredError extends Error {
  constructor(readonly capabilityId: string) {
    super(`Capability "${capabilityId}" is already registered.`);
    this.name = 'CapabilityAlreadyRegisteredError';
  }
}

/** Framework-neutral provider for descriptors that are bundled but need no VS Code runtime dependency. */
export class DescriptorCapabilityProvider implements CapabilityProvider {
  constructor(
    private readonly capability: Capability,
    private readonly available: boolean = capability.category === 'bundled',
    private readonly message?: string,
  ) {}

  get id(): string {
    return this.capability.id;
  }

  describe(): Capability {
    return { ...this.capability };
  }

  async isEnabled(): Promise<boolean> {
    return this.capability.enabledByDefault;
  }

  async healthCheck(): Promise<CapabilityHealthStatus> {
    return {
      capabilityId: this.id,
      enabled: this.capability.enabledByDefault,
      healthy: this.available,
      message: this.message ?? (this.available ? 'Bundled capability is available.' : 'Optional capability is not installed.'),
    };
  }
}

export interface CapabilityRequirementResult {
  statuses: CapabilityHealthStatus[];
  /** Required capabilities that are disabled, unhealthy, or unregistered. */
  unavailable: CapabilityRequirement[];
}

/**
 * Runtime-neutral capability policy and health registry. It imports no VS Code
 * APIs; the extension may supply providers, while CLI/core tests can use the
 * same surface with plain descriptors.
 */
export class CapabilityRegistry {
  private readonly providers = new Map<string, CapabilityProvider>();
  private policy: Record<string, boolean>;

  constructor(policy: CapabilityPolicy = {}, includeDefaults = true) {
    this.policy = { ...policy };
    if (includeDefaults) {
      for (const descriptor of DEFAULT_CAPABILITIES) {
        this.register(new DescriptorCapabilityProvider(descriptor));
      }
    }
  }

  register(provider: CapabilityProvider, options: { replace?: boolean } = {}): void {
    if (this.providers.has(provider.id) && !options.replace) throw new CapabilityAlreadyRegisteredError(provider.id);
    this.providers.set(provider.id, provider);
  }

  unregister(capabilityId: string): void {
    this.providers.delete(capabilityId);
  }

  list(): Capability[] {
    return [...this.providers.values()]
      .map((provider) => provider.describe())
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  get(capabilityId: string): CapabilityProvider {
    const provider = this.providers.get(capabilityId);
    if (!provider) throw new CapabilityNotFoundError(capabilityId);
    return provider;
  }

  isEnabled(capabilityId: string): boolean {
    const capability = this.get(capabilityId).describe();
    return this.policy[capabilityId] ?? capability.enabledByDefault;
  }

  setEnabled(capabilityId: string, enabled: boolean): void {
    this.get(capabilityId);
    this.policy[capabilityId] = enabled;
  }

  getPolicy(): CapabilityPolicy {
    return { ...this.policy };
  }

  async health(capabilityId: string): Promise<CapabilityHealthStatus> {
    const provider = this.get(capabilityId);
    if (!this.isEnabled(capabilityId)) {
      return { capabilityId, enabled: false, healthy: false, message: 'Disabled by project capability policy.' };
    }
    const reported = await provider.healthCheck();
    return {
      ...reported,
      capabilityId,
      enabled: true,
      healthy: reported.healthy,
    };
  }

  async healthAll(): Promise<CapabilityHealthStatus[]> {
    return Promise.all(this.list().map((capability) => this.health(capability.id)));
  }

  /** Surface used by project intelligence/workflow compilation before an action is scheduled. */
  async resolveRequirements(requirements: readonly CapabilityRequirement[]): Promise<CapabilityRequirementResult> {
    const statuses: CapabilityHealthStatus[] = [];
    const unavailable: CapabilityRequirement[] = [];
    for (const requirement of requirements) {
      try {
        const status = await this.health(requirement.capabilityId);
        statuses.push(status);
        if (!requirement.optional && (!status.enabled || !status.healthy)) unavailable.push(requirement);
      } catch (error) {
        statuses.push({
          capabilityId: requirement.capabilityId,
          enabled: false,
          healthy: false,
          message: error instanceof Error ? error.message : String(error),
        });
        if (!requirement.optional) unavailable.push(requirement);
      }
    }
    return { statuses, unavailable };
  }
}
