import {
  nowIso,
  type ModelDescriptor,
  type ModelExecutionRequest,
  type ModelExecutionResult,
  type ModelProvider,
  type ModelRequirement,
  type ProviderDiagnostic,
  type ResolvedModel,
} from '../contracts';
import { bestModelCandidate, capabilityReason, defaultTierReason } from './modelResolution';

/** Deterministic in-memory provider for core, CLI, and extension tests. */
export class FakeModelProvider implements ModelProvider {
  readonly executed: ModelExecutionRequest[] = [];

  constructor(
    readonly id: string,
    private readonly models: ModelDescriptor[],
    private readonly options: {
      modelVersions?: Record<string, string>;
      diagnostics?: ProviderDiagnostic[];
      result?: ModelExecutionResult;
      now?: () => string;
    } = {},
  ) {}

  async discoverModels(): Promise<ModelDescriptor[]> {
    return this.models.map((model) => ({ ...model, tiers: [...model.tiers] }));
  }

  async resolve(request: ModelRequirement): Promise<ResolvedModel> {
    const candidate = bestModelCandidate(this.models, request);
    if (!candidate) throw new Error(`Fake provider ${this.id} cannot satisfy ${request.tier}.`);
    return {
      provider: this.id,
      modelId: candidate.descriptor.modelId,
      modelVersion: this.options.modelVersions?.[candidate.descriptor.modelId],
      tier: request.tier,
      resolvedAt: (this.options.now ?? nowIso)(),
      reason: [candidate.reason, capabilityReason(request), defaultTierReason(request.tier)].filter(Boolean).join(' '),
    };
  }

  async execute(request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    if (request.resolvedModel.provider !== this.id) {
      throw new Error(`Fake provider ${this.id} cannot execute ${request.resolvedModel.provider} model.`);
    }
    this.executed.push(request);
    return this.options.result ?? { content: `fake:${request.prompt}`, stopReason: 'end_turn' };
  }

  async validateConfiguration(): Promise<ProviderDiagnostic[]> {
    return this.options.diagnostics ?? [{ provider: this.id, ok: true, message: 'Fake provider is ready.' }];
  }
}
