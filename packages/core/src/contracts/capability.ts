/**
 * Capability registry contracts (design doc §6.2, §10; TODO W1H).
 *
 * AST graph and artifact annotation are bundled by default (design doc
 * §0.5); Test Agent and observability are optional modules a project must
 * opt into. Neither category implies a competing state machine — capability
 * enable/disable is a policy flag the autonomy/workflow engines read, not a
 * new Epic-shaped concept.
 */

import { z } from 'zod';

// ── Capability ─────────────────────────────────────────────────────

export const CAPABILITY_CATEGORIES = ['bundled', 'optional'] as const;
export const CapabilityCategorySchema = z.enum(CAPABILITY_CATEGORIES);
export type CapabilityCategory = z.infer<typeof CapabilityCategorySchema>;

export const CapabilitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: CapabilityCategorySchema,
  description: z.string().optional(),
  /** Bundled capabilities default to enabled; optional capabilities default to disabled (design doc §0.5). */
  enabledByDefault: z.boolean(),
});
export type Capability = z.infer<typeof CapabilitySchema>;

export const CapabilityRequirementSchema = z.object({
  capabilityId: z.string().min(1),
  reason: z.string().optional(),
  /** When false (default), this is a hard prerequisite — the capability must be enabled/healthy for the requiring stage/action to proceed. */
  optional: z.boolean().default(false),
});
export type CapabilityRequirement = z.infer<typeof CapabilityRequirementSchema>;

export const CapabilityHealthStatusSchema = z.object({
  capabilityId: z.string().min(1),
  enabled: z.boolean(),
  healthy: z.boolean(),
  message: z.string().optional(),
});
export type CapabilityHealthStatus = z.infer<typeof CapabilityHealthStatusSchema>;

// ── CapabilityProvider (behavioral — not data; no zod schema) ─────

/** Registry-facing provider for one capability (TODO W1H). */
export interface CapabilityProvider {
  readonly id: string;
  describe(): Capability;
  isEnabled(): Promise<boolean>;
  healthCheck(): Promise<CapabilityHealthStatus>;
}

// ── Bundled vs optional defaults ───────────────────────────────────

/** Bundled by default (design doc §0.5 / §10) — always shipped; a project may disable them, but the registry never omits them. */
export const BUNDLED_CAPABILITY_IDS = ['ast-graph', 'artifact-annotation'] as const;

/** Optional modules (design doc §10) — absent/disabled unless a project opts in. */
export const OPTIONAL_CAPABILITY_IDS = ['test-agent', 'observability'] as const;

export const DEFAULT_CAPABILITIES: readonly Capability[] = Object.freeze([
  { id: 'ast-graph', name: 'AST graph', category: 'bundled', enabledByDefault: true },
  { id: 'artifact-annotation', name: 'Artifact annotation', category: 'bundled', enabledByDefault: true },
  { id: 'test-agent', name: 'Test Agent', category: 'optional', enabledByDefault: false },
  { id: 'observability', name: 'Observability / token analytics', category: 'optional', enabledByDefault: false },
]);
