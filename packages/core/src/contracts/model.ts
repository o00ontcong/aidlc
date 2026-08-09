/**
 * Model provider contract (design doc §6.3, TODO W1B).
 *
 * Claude is the default *implementation* chosen by the resolver — nothing
 * in this file names Claude or bakes in a concrete model id/type.
 * `provider`/`modelId` are plain strings supplied at runtime by whichever
 * `ModelProvider` implementation is installed; workflows/Epics only ever
 * request a {@link ModelTier}, never a specific model.
 */

import { z } from 'zod';
import { IsoTimestampSchema } from './common';
import { ErrorCodeSchema } from './errors';

// ── Model tier ─────────────────────────────────────────────────────

/**
 * `fast`: scan/format/deterministic transforms. `balanced`: normal
 * implementation work. `deep`: architecture, ambiguous planning, high-risk
 * changes. `review`: independent verification with separate context
 * (design doc §6.3).
 */
export const MODEL_TIERS = ['fast', 'balanced', 'deep', 'review'] as const;
export const ModelTierSchema = z.enum(MODEL_TIERS);
export type ModelTier = z.infer<typeof ModelTierSchema>;

// ── Descriptors / requirements / resolution ───────────────────────

export const ModelDescriptorSchema = z.object({
  /** Provider id this model belongs to, e.g. `claude`. Not a closed enum — providers are pluggable. */
  provider: z.string().min(1),
  /** Provider-specific model id, e.g. `claude-sonnet-5`. Opaque to workflow/Epic state. */
  modelId: z.string().min(1),
  /** Which tiers this model can satisfy. */
  tiers: z.array(ModelTierSchema).min(1),
  contextWindowTokens: z.number().int().positive(),
  supportsTools: z.boolean(),
  latencyClass: z.enum(['fast', 'standard', 'slow']).optional(),
  costClass: z.enum(['low', 'medium', 'high']).optional(),
});
export type ModelDescriptor = z.infer<typeof ModelDescriptorSchema>;

export const ModelRequirementSchema = z.object({
  tier: ModelTierSchema,
  minContextTokens: z.number().int().positive().optional(),
  requiresTools: z.boolean().optional(),
  latencyPreference: z.enum(['fast', 'standard', 'slow']).optional(),
  costPreference: z.enum(['low', 'medium', 'high']).optional(),
  /** Optional link to a `Capability.id` (see `capability.ts`) this requirement exists to satisfy. */
  capability: z.string().optional(),
});
export type ModelRequirement = z.infer<typeof ModelRequirementSchema>;

export const ResolvedModelSchema = z.object({
  provider: z.string().min(1),
  modelId: z.string().min(1),
  modelVersion: z.string().optional(),
  tier: ModelTierSchema,
  resolvedAt: IsoTimestampSchema,
  /** Why this model was chosen — written into the run lock for audit/reproduce (design doc §6.3). */
  reason: z.string().min(1),
});
export type ResolvedModel = z.infer<typeof ResolvedModelSchema>;

// ── Execution (minimal shape — W1B owns the full execution contract) ──

export const ModelExecutionRequestSchema = z.object({
  resolvedModel: ResolvedModelSchema,
  prompt: z.string(),
  toolNames: z.array(z.string()).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
});
export type ModelExecutionRequest = z.infer<typeof ModelExecutionRequestSchema>;

export const ModelExecutionResultSchema = z.object({
  content: z.string(),
  stopReason: z.enum(['end_turn', 'max_tokens', 'tool_use', 'error']),
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      costUsd: z.number().nonnegative().optional(),
    })
    .optional(),
});
export type ModelExecutionResult = z.infer<typeof ModelExecutionResultSchema>;

export const ProviderDiagnosticSchema = z.object({
  provider: z.string().min(1),
  ok: z.boolean(),
  message: z.string(),
  code: ErrorCodeSchema.optional(),
});
export type ProviderDiagnostic = z.infer<typeof ProviderDiagnosticSchema>;

// ── Provider interface (behavioral — not data; no zod schema) ─────

/**
 * Extension point for model execution (design doc §6.3, sketched there as a
 * TS interface — reproduced here verbatim as the frozen W0 contract). Claude
 * ships as the default provider by installing this interface separately in
 * a later wave (W1B); nothing here is Claude-specific.
 */
export interface ModelProvider {
  readonly id: string;
  discoverModels(): Promise<ModelDescriptor[]>;
  resolve(request: ModelRequirement): Promise<ResolvedModel>;
  execute(request: ModelExecutionRequest): Promise<ModelExecutionResult>;
  validateConfiguration(): Promise<ProviderDiagnostic[]>;
}
