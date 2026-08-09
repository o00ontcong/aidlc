/**
 * Project Intelligence contracts (design doc §6.1, §6.2, §6.5; TODO W1D).
 *
 * "Facts va recommendation phai tach rieng. Facts co evidence path;
 * recommendation co confidence va reason." — facts are observed/derived
 * (evidence = where they came from); recommendations are inferential
 * (confidence + reason, on top of evidence that may itself point back at a
 * fact).
 */

import { z } from 'zod';
import { IsoTimestampSchema, parseContract } from './common';
import { ModelTierSchema } from './model';
import { StageIdSchema } from './stageId';
import { EpicProfileSchema } from './epic';

// ── Facts ──────────────────────────────────────────────────────────

export const EvidencePathSchema = z.object({
  /** Repo-relative path the fact was derived from, e.g. `package.json`, `src/App.swift`. */
  path: z.string().min(1),
  detail: z.string().optional(),
});
export type EvidencePath = z.infer<typeof EvidencePathSchema>;

export const ProjectFactSchema = z.object({
  /** e.g. `languages`, `frameworks`, `platforms`, `build_system`, `test_framework`, `ci`, `domain`, `risk`, `hotspot`, `capability` (design doc §6.1). Open vocabulary — the analyzer (W1D) owns the actual key list. */
  key: z.string().min(1),
  value: z.unknown(),
  evidence: z.array(EvidencePathSchema).default([]),
  /** Analyzer confidence in this observed or derived fact. */
  confidence: z.number().min(0).max(1).optional(),
});
export type ProjectFact = z.infer<typeof ProjectFactSchema>;

export const ProjectFactsSchema = z.object({
  schemaVersion: z.literal(1),
  /** Workspace-scoped identifier for the analyzed project (free-form — multi-project support is a later concern). */
  projectId: z.string().min(1),
  generatedAt: IsoTimestampSchema,
  /** Only changes via an explicit refresh command (design doc §0.3) — never bumped by a background drift/staleness check. */
  revision: z.number().int().nonnegative(),
  /** Git commit the facts were derived from, when known — supports staleness/drift detection without an implicit refresh. */
  sourceCommit: z.string().optional(),
  /** A setup-created project file is valid durable state but is not published analysis yet. Missing means published for backward compatibility. */
  analysisStatus: z.enum(['uninitialized', 'published']).optional(),
  facts: z.array(ProjectFactSchema).default([]),
});
export type ProjectFacts = z.infer<typeof ProjectFactsSchema>;

export function parseProjectFacts(raw: unknown): ProjectFacts {
  return parseContract(ProjectFactsSchema, raw, 'ProjectFacts');
}

// ── Recommendations ────────────────────────────────────────────────

/**
 * Evidence backing a recommendation — either a pointer to a
 * `ProjectFact.key`, a raw path, or both — plus the human-readable
 * justification tying it to the recommendation (design doc §6.4 example:
 * "de xuat `financial-decimal-safety` vi project xu ly gia/portfolio va
 * dang dung floating-point o domain layer").
 */
export const RecommendationEvidenceSchema = z.object({
  factKey: z.string().optional(),
  path: EvidencePathSchema.optional(),
  note: z.string().min(1),
});
export type RecommendationEvidence = z.infer<typeof RecommendationEvidenceSchema>;

export const StageRoleRecommendationSchema = z.object({
  stageId: StageIdSchema,
  /** Recommended agent role id, e.g. `senior-ios-developer` (design doc §6.4). */
  agent: z.string().min(1),
  skills: z.array(z.string()).default([]),
  modelTier: ModelTierSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  evidence: z.array(RecommendationEvidenceSchema).default([]),
});
export type StageRoleRecommendation = z.infer<typeof StageRoleRecommendationSchema>;

/**
 * Apply-recommendation lifecycle (design doc §6.5): generate proposal ->
 * user accepts/overrides -> accepted selection is written to a lock file.
 */
export const RECOMMENDATION_STATUSES = ['proposed', 'accepted', 'overridden', 'locked'] as const;
export const RecommendationStatusSchema = z.enum(RECOMMENDATION_STATUSES);
export type RecommendationStatus = z.infer<typeof RecommendationStatusSchema>;

export const ProjectRecommendationSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string().min(1),
  generatedAt: IsoTimestampSchema,
  workflowProfile: EpicProfileSchema,
  roles: z.array(StageRoleRecommendationSchema).default([]),
  status: RecommendationStatusSchema,
});
export type ProjectRecommendation = z.infer<typeof ProjectRecommendationSchema>;

export function parseProjectRecommendation(raw: unknown): ProjectRecommendation {
  return parseContract(ProjectRecommendationSchema, raw, 'ProjectRecommendation');
}
