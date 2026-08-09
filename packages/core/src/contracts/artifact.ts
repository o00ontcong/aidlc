/**
 * Artifact lifecycle and commit policy (design doc §7.2; TODO W1F).
 *
 * Product decision (§0.2): "Chi artifact duoc artifact policy chon moi duoc
 * commit; run state, cache va artifact trung gian khong tu dong vao Git."
 * The schema's defaults (`persist: 'runtime'`, `commit: false`) encode
 * exactly that — an artifact type must opt in to being committed.
 */

import { z } from 'zod';
import { parseContract } from './common';

// ── ArtifactLifecycle ──────────────────────────────────────────────

export const ARTIFACT_PERSISTENCE = ['runtime', 'project'] as const;
export const ArtifactPersistenceSchema = z.enum(ARTIFACT_PERSISTENCE);
export type ArtifactPersistence = z.infer<typeof ArtifactPersistenceSchema>;

export const ArtifactLifecycleSchema = z.object({
  persist: ArtifactPersistenceSchema,
  commit: z.boolean(),
});
export type ArtifactLifecycle = z.infer<typeof ArtifactLifecycleSchema>;

// ── ArtifactPolicy (root, durable — .aidlc/artifacts.yaml) ────────

export const ArtifactTypeConfigSchema = z.object({
  /** Template path, supports `{epic}`/`{id}`-style placeholders (design doc §7.2, e.g. `docs/epics/{epic}/SPEC.md`). */
  path: z.string().min(1),
  /** Falls back to `ArtifactPolicy.defaults.persist` when omitted. */
  persist: ArtifactPersistenceSchema.optional(),
  /** Falls back to `ArtifactPolicy.defaults.commit` when omitted. */
  commit: z.boolean().optional(),
});
export type ArtifactTypeConfig = z.infer<typeof ArtifactTypeConfigSchema>;

export const ArtifactPolicySchema = z.object({
  schemaVersion: z.literal(1),
  defaults: ArtifactLifecycleSchema,
  /** Keyed by artifact type name (`specification`, `architecture-decision`, `execution-plan`, `review-log`, ...) — open vocabulary, packs add their own types (TODO W2C). */
  types: z.record(z.string(), ArtifactTypeConfigSchema).default({}),
});
export type ArtifactPolicy = z.infer<typeof ArtifactPolicySchema>;

export function parseArtifactPolicy(raw: unknown): ArtifactPolicy {
  return parseContract(ArtifactPolicySchema, raw, 'ArtifactPolicy');
}

/** A fully-resolved artifact descriptor — `type` + `path` + `persist`/`commit` with `defaults` fallbacks already applied. */
export interface ArtifactDescriptor {
  type: string;
  path: string;
  persist: ArtifactPersistence;
  commit: boolean;
}

/** Resolve `type`'s descriptor against `policy`, applying `defaults` fallbacks. Returns `undefined` for an unknown type — callers decide whether that's fatal. */
export function resolveArtifactDescriptor(policy: ArtifactPolicy, type: string): ArtifactDescriptor | undefined {
  const cfg = policy.types[type];
  if (!cfg) return undefined;
  return {
    type,
    path: cfg.path,
    persist: cfg.persist ?? policy.defaults.persist,
    commit: cfg.commit ?? policy.defaults.commit,
  };
}

/** Artifact types eligible for a commit preview — i.e. resolved `commit === true` (design doc §0.2 / §7.2: only policy-selected artifacts are ever committed). */
export function commitEligibleArtifactTypes(policy: ArtifactPolicy): string[] {
  return Object.keys(policy.types).filter((type) => resolveArtifactDescriptor(policy, type)?.commit === true);
}

/** The default artifact policy for a brand-new project: nothing commits until a type explicitly opts in. */
export function createDefaultArtifactPolicy(): ArtifactPolicy {
  return { schemaVersion: 1, defaults: { persist: 'runtime', commit: false }, types: {} };
}
