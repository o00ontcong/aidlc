import { spawn } from 'child_process';

import {
  CORE_ERROR_CODES,
  nowIso,
  type ModelDescriptor,
  type ModelExecutionRequest,
  type ModelExecutionResult,
  type ModelProvider,
  type ModelRequirement,
  type ProviderDiagnostic,
  type ResolvedModel,
} from '../contracts';
import { buildClaudeSpawnEnv, hasClaudeLogin } from '../runner/claudeEnv';
import { bestModelCandidate, capabilityReason, defaultTierReason } from './modelResolution';

export interface ClaudeCliInvocation {
  modelId: string;
  prompt: string;
  maxOutputTokens?: number;
}

export interface ClaudeCliAdapter {
  execute(invocation: ClaudeCliInvocation): Promise<ModelExecutionResult>;
  validate(): Promise<{ available: boolean; authenticated: boolean; message: string }>;
}

/** Production adapter. The autonomy/gate engine, not this provider, owns mutation permissions. */
export class SpawnClaudeCliAdapter implements ClaudeCliAdapter {
  constructor(private readonly claudeBin = 'claude') {}

  async execute(invocation: ClaudeCliInvocation): Promise<ModelExecutionResult> {
    const args = ['--print', '--output-format', 'json', '--model', invocation.modelId, invocation.prompt];
    const result = await this.run(args);
    if (result.code !== 0) {
      return { content: result.stderr || result.stdout, stopReason: 'error' };
    }
    try {
      const payload = JSON.parse(result.stdout) as {
        result?: unknown;
        content?: unknown;
        total_cost_usd?: unknown;
        usage?: { input_tokens?: unknown; output_tokens?: unknown };
      };
      const content = typeof payload.result === 'string'
        ? payload.result
        : typeof payload.content === 'string'
          ? payload.content
          : result.stdout;
      const inputTokens = typeof payload.usage?.input_tokens === 'number' ? payload.usage.input_tokens : 0;
      const outputTokens = typeof payload.usage?.output_tokens === 'number' ? payload.usage.output_tokens : 0;
      const costUsd = typeof payload.total_cost_usd === 'number' ? payload.total_cost_usd : undefined;
      return { content, stopReason: 'end_turn', usage: { inputTokens, outputTokens, costUsd } };
    } catch {
      return { content: result.stdout, stopReason: 'end_turn' };
    }
  }

  async validate(): Promise<{ available: boolean; authenticated: boolean; message: string }> {
    const result = await this.run(['--version']);
    const available = result.code === 0;
    const authenticated = hasClaudeLogin() || Boolean(process.env.ANTHROPIC_API_KEY);
    return {
      available,
      authenticated,
      message: available ? 'Claude CLI is available.' : (result.stderr || 'Claude CLI is not available on PATH.'),
    };
  }

  private run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn(this.claudeBin, args, { env: buildClaudeSpawnEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
      proc.on('error', (error) => resolve({ code: 1, stdout, stderr: error.message }));
      proc.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    });
  }
}

export const DEFAULT_CLAUDE_MODELS: readonly ModelDescriptor[] = [
  { provider: 'claude', modelId: 'claude-haiku-5', tiers: ['fast'], contextWindowTokens: 200_000, supportsTools: true, latencyClass: 'fast', costClass: 'low' },
  { provider: 'claude', modelId: 'claude-sonnet-5', tiers: ['balanced', 'review'], contextWindowTokens: 200_000, supportsTools: true, latencyClass: 'standard', costClass: 'medium' },
  { provider: 'claude', modelId: 'claude-opus-5', tiers: ['deep', 'review'], contextWindowTokens: 200_000, supportsTools: true, latencyClass: 'slow', costClass: 'high' },
];

export interface ClaudeCliProviderOptions {
  adapter?: ClaudeCliAdapter;
  models?: ModelDescriptor[];
  modelVersions?: Record<string, string>;
  now?: () => string;
}

/** Claude is the bundled default provider, behind the provider-neutral contract. */
export class ClaudeCliProvider implements ModelProvider {
  readonly id = 'claude';
  private readonly adapter: ClaudeCliAdapter;
  private readonly models: ModelDescriptor[];
  private readonly modelVersions: Record<string, string>;
  private readonly clock: () => string;

  constructor(options: ClaudeCliProviderOptions = {}) {
    this.adapter = options.adapter ?? new SpawnClaudeCliAdapter();
    this.models = (options.models ?? [...DEFAULT_CLAUDE_MODELS]).map((model) => ({ ...model, provider: 'claude', tiers: [...model.tiers] }));
    this.modelVersions = options.modelVersions ?? {};
    this.clock = options.now ?? nowIso;
  }

  async discoverModels(): Promise<ModelDescriptor[]> {
    return this.models.map((model) => ({ ...model, tiers: [...model.tiers] }));
  }

  async resolve(request: ModelRequirement): Promise<ResolvedModel> {
    const candidate = bestModelCandidate(this.models, request);
    if (!candidate) throw new Error(`Claude has no model satisfying the requested ${request.tier} requirement.`);
    return {
      provider: this.id,
      modelId: candidate.descriptor.modelId,
      modelVersion: this.modelVersions[candidate.descriptor.modelId],
      tier: request.tier,
      resolvedAt: this.clock(),
      reason: [candidate.reason, capabilityReason(request), defaultTierReason(request.tier)].filter(Boolean).join(' '),
    };
  }

  async execute(request: ModelExecutionRequest): Promise<ModelExecutionResult> {
    if (request.resolvedModel.provider !== this.id) {
      throw new Error(`Claude provider cannot execute model from ${request.resolvedModel.provider}.`);
    }
    return this.adapter.execute({
      modelId: request.resolvedModel.modelId,
      prompt: request.prompt,
      maxOutputTokens: request.maxOutputTokens,
    });
  }

  async validateConfiguration(): Promise<ProviderDiagnostic[]> {
    const health = await this.adapter.validate();
    const diagnostics: ProviderDiagnostic[] = [{
      provider: this.id,
      ok: health.available,
      code: health.available ? undefined : CORE_ERROR_CODES.PROVIDER_UNAVAILABLE,
      message: health.message,
    }];
    if (health.available && !health.authenticated) {
      diagnostics.push({
        provider: this.id,
        ok: false,
        code: CORE_ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: 'Claude CLI is available but has no detected login or ANTHROPIC_API_KEY.',
      });
    }
    return diagnostics;
  }
}
