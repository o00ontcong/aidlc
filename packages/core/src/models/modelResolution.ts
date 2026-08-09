import type {
  ModelDescriptor,
  ModelRequirement,
  ModelTier,
} from '../contracts';

/** A candidate that satisfied every capability constraint in a model requirement. */
export interface ModelCandidate {
  descriptor: ModelDescriptor;
  score: number;
  reason: string;
}

export function descriptorSatisfiesRequirement(descriptor: ModelDescriptor, requirement: ModelRequirement): boolean {
  return descriptor.tiers.includes(requirement.tier)
    && (requirement.minContextTokens === undefined || descriptor.contextWindowTokens >= requirement.minContextTokens)
    && (!requirement.requiresTools || descriptor.supportsTools);
}

function preferenceScore<T extends string>(actual: T | undefined, requested: T | undefined, preferredOrder: readonly T[]): number {
  if (!requested) return actual ? preferredOrder.length - preferredOrder.indexOf(actual) : 0;
  return actual === requested ? 20 : 0;
}

/**
 * Pick a deterministic best descriptor. Context/tool eligibility is a hard
 * filter; latency and cost are soft preferences. Ties are resolved by provider
 * then model id, making the result stable across CLI and extension callers.
 */
export function rankModelCandidates(descriptors: readonly ModelDescriptor[], requirement: ModelRequirement): ModelCandidate[] {
  return descriptors
    .filter((descriptor) => descriptorSatisfiesRequirement(descriptor, requirement))
    .map((descriptor) => {
      const latency = preferenceScore(descriptor.latencyClass, requirement.latencyPreference, ['fast', 'standard', 'slow']);
      const cost = preferenceScore(descriptor.costClass, requirement.costPreference, ['low', 'medium', 'high']);
      const contextHeadroom = requirement.minContextTokens
        ? Math.min(5, Math.floor((descriptor.contextWindowTokens - requirement.minContextTokens) / 100_000))
        : 0;
      const reason = [
        `satisfies ${requirement.tier} tier`,
        requirement.requiresTools ? 'supports tools' : undefined,
        requirement.minContextTokens ? `${descriptor.contextWindowTokens} context tokens` : undefined,
        requirement.latencyPreference && descriptor.latencyClass === requirement.latencyPreference
          ? `matches ${requirement.latencyPreference} latency`
          : undefined,
        requirement.costPreference && descriptor.costClass === requirement.costPreference
          ? `matches ${requirement.costPreference} cost`
          : undefined,
      ].filter(Boolean).join('; ');
      return { descriptor, score: latency + cost + contextHeadroom, reason };
    })
    .sort((a, b) => b.score - a.score
      || a.descriptor.provider.localeCompare(b.descriptor.provider)
      || a.descriptor.modelId.localeCompare(b.descriptor.modelId));
}

export function bestModelCandidate(descriptors: readonly ModelDescriptor[], requirement: ModelRequirement): ModelCandidate | null {
  return rankModelCandidates(descriptors, requirement)[0] ?? null;
}

export function describeUnsatisfiedRequirement(requirement: ModelRequirement): string {
  const constraints = [
    `${requirement.tier} tier`,
    requirement.minContextTokens ? `at least ${requirement.minContextTokens} context tokens` : undefined,
    requirement.requiresTools ? 'tool support' : undefined,
    requirement.capability ? `capability ${requirement.capability}` : undefined,
  ].filter(Boolean);
  return `No registered model satisfies ${constraints.join(', ')}.`;
}

/** Included in selection-lock reasons where the contract's open capability name is relevant. */
export function capabilityReason(requirement: ModelRequirement): string | undefined {
  return requirement.capability ? `Requested for capability ${requirement.capability}.` : undefined;
}

export function defaultTierReason(tier: ModelTier): string {
  return `Resolved for the ${tier} model tier.`;
}
