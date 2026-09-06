/**
 * `Project Change` — the single identity that runs through Discover, Sprint
 * and Epic (Master Rule §0.1, implementation plan §6.1, locked appendix
 * §18.5). This file is the canonical schema; if code elsewhere disagrees,
 * the code must migrate to this contract, not the other way around (plan
 * §18 preamble).
 *
 * Scope note: this is the *first executable slice* only (plan §17) —
 * `ProjectChange`, `ChangeShape` (the optional Shape component, §D13) and
 * `ChangeProvenance` (the pinned link an Epic keeps back to its owning
 * Change, §6.5), plus the canonical content-hash for each. `ContextProposal`
 * (§18.2/§18.4) and the shared `ProjectChangeReadModel` (§7) are separate
 * files added later in M1/M4 — not part of this slice.
 */

import { z } from 'zod';

import { ActorRefSchema, IsoTimestampSchema, parseContract } from './common';
import { Sha256HexSchema, sha256Hex } from './hash';
import {
  ChangeIdSchema,
  ContextProposalIdSchema,
  ContextRevisionIdSchema,
  EpicIdSchema,
  ExternalRefIdSchema,
  ScopeAnalysisIdSchema,
} from './ids';

// ── ProjectChange enums ────────────────────────────────────────────

export const CHANGE_TYPES = ['feature', 'bug', 'maintenance', 'refactor', 'other'] as const;
export const ChangeTypeSchema = z.enum(CHANGE_TYPES);
export type ChangeType = z.infer<typeof ChangeTypeSchema>;

export const CHANGE_PRIORITIES = ['critical', 'high', 'medium', 'low', 'unset'] as const;
export const ChangePrioritySchema = z.enum(CHANGE_PRIORITIES);
export type ChangePriority = z.infer<typeof ChangePrioritySchema>;

/** Never a general `setStatus` field — every transition is a specific command (§D11, §8). */
export const CHANGE_DISPOSITIONS = ['active', 'shelved', 'cancelled', 'superseded'] as const;
export const ChangeDispositionSchema = z.enum(CHANGE_DISPOSITIONS);
export type ChangeDisposition = z.infer<typeof ChangeDispositionSchema>;

// ── ChangeRequirement ──────────────────────────────────────────────

/** Local, non-renumbered id so reordering/deleting one criterion never shifts another's identity (§18.5). */
export const ChangeAcceptanceCriterionSchema = z.object({
  id: z.string().regex(/^AC-\d{2,}$/, 'Must match AC-<NN>'),
  text: z.string().min(1),
});
export type ChangeAcceptanceCriterion = z.infer<typeof ChangeAcceptanceCriterionSchema>;

/**
 * Change is the canonical, editable source of the requirement before and
 * during delivery (§D12). `problem` may be blank only for a migrated record
 * that cannot know it (read model then warns `change.problem_missing`,
 * §18.5); `desiredOutcome` is always required.
 */
export const ChangeRequirementSchema = z.object({
  problem: z.string(),
  desiredOutcome: z.string().min(1),
  acceptanceCriteria: z.array(ChangeAcceptanceCriterionSchema).default([]),
  inScope: z.array(z.string().min(1)).default([]),
  outOfScope: z.array(z.string().min(1)).default([]),
  constraints: z.array(z.string().min(1)).default([]),
});
export type ChangeRequirement = z.infer<typeof ChangeRequirementSchema>;

// ── ChangeOrigin ───────────────────────────────────────────────────

export const CHANGE_ORIGIN_KINDS = ['user', 'external-ticket', 'scan-finding', 'epic-follow-up', 'migration'] as const;
export const ChangeOriginKindSchema = z.enum(CHANGE_ORIGIN_KINDS);
export type ChangeOriginKind = z.infer<typeof ChangeOriginKindSchema>;

export const CHANGE_ENTRY_POINTS = ['project', 'discover', 'sprint', 'epic', 'scan', 'migration'] as const;
export const ChangeEntryPointSchema = z.enum(CHANGE_ENTRY_POINTS);
export type ChangeEntryPoint = z.infer<typeof ChangeEntryPointSchema>;

export const ChangeOriginSchema = z.object({
  kind: ChangeOriginKindSchema,
  entryPoint: ChangeEntryPointSchema,
  actor: ActorRefSchema,
  sourceChangeId: ChangeIdSchema.optional(),
  sourceEpicId: EpicIdSchema.optional(),
  migrationSourceIds: z.array(z.string().min(1)).optional(),
});
export type ChangeOrigin = z.infer<typeof ChangeOriginSchema>;

// ── ExternalReference ──────────────────────────────────────────────

/**
 * Reference only — never a two-way sync (§D5). No sync token, no
 * write-back; `snapshot` is a one-time, user-confirmed copy captured at
 * `capturedAt`.
 */
export const EXTERNAL_REFERENCE_PROVIDERS = ['jira', 'github', 'linear', 'redmine', 'url', 'other'] as const;
export const ExternalReferenceProviderSchema = z.enum(EXTERNAL_REFERENCE_PROVIDERS);
export type ExternalReferenceProvider = z.infer<typeof ExternalReferenceProviderSchema>;

export const EXTERNAL_REFERENCE_AVAILABILITY = ['unknown', 'available', 'unavailable'] as const;
export const ExternalReferenceAvailabilitySchema = z.enum(EXTERNAL_REFERENCE_AVAILABILITY);
export type ExternalReferenceAvailability = z.infer<typeof ExternalReferenceAvailabilitySchema>;

export const ExternalReferenceSchema = z.object({
  id: ExternalRefIdSchema,
  provider: ExternalReferenceProviderSchema,
  key: z.string().min(1),
  url: z.string().min(1).optional(),
  capturedAt: IsoTimestampSchema,
  snapshot: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      priority: z.string().optional(),
      status: z.string().optional(),
    })
    .optional(),
  availability: ExternalReferenceAvailabilitySchema,
});
export type ExternalReference = z.infer<typeof ExternalReferenceSchema>;

// ── ChangeEpicLink ─────────────────────────────────────────────────

/** A Change has at most one Epic; `pending` is the crash-safe midpoint of the Start Epic saga (§D4, §9.2). */
export const ChangeEpicLinkPendingSchema = z.object({
  state: z.literal('pending'),
  commandId: z.string().min(1),
  epicId: EpicIdSchema,
  changeRevision: z.number().int().nonnegative(),
  changeContentHash: Sha256HexSchema,
  contextRevisionId: ContextRevisionIdSchema,
  contextRootHash: Sha256HexSchema,
  startedAt: IsoTimestampSchema,
});
export type ChangeEpicLinkPending = z.infer<typeof ChangeEpicLinkPendingSchema>;

export const ChangeEpicLinkLinkedSchema = z.object({
  state: z.literal('linked'),
  commandId: z.string().min(1),
  epicId: EpicIdSchema,
  changeRevision: z.number().int().nonnegative(),
  changeContentHash: Sha256HexSchema,
  changeSnapshotHash: Sha256HexSchema,
  contextRevisionId: ContextRevisionIdSchema,
  contextRootHash: Sha256HexSchema,
  linkedAt: IsoTimestampSchema,
});
export type ChangeEpicLinkLinked = z.infer<typeof ChangeEpicLinkLinkedSchema>;

export const ChangeEpicLinkSchema = z.discriminatedUnion('state', [ChangeEpicLinkPendingSchema, ChangeEpicLinkLinkedSchema]);
export type ChangeEpicLink = z.infer<typeof ChangeEpicLinkSchema>;

// ── ContextSyncFact ────────────────────────────────────────────────

/**
 * "delivery complete" and "context synchronized" are two separate facts
 * (§D7, §invariant 9) — a Change only reaches `done` once this is
 * `applied` or `not-required`.
 */
export const ContextSyncNotEvaluatedSchema = z.object({ status: z.literal('not-evaluated') });
export const ContextSyncPendingSchema = z.object({
  status: z.literal('pending'),
  epicId: EpicIdSchema,
  deliveryCompletedAt: IsoTimestampSchema,
});
export const ContextSyncProposedSchema = z.object({
  status: z.literal('proposed'),
  epicId: EpicIdSchema,
  proposalIds: z.array(ContextProposalIdSchema).min(1),
});
export const ContextSyncAppliedSchema = z.object({
  status: z.literal('applied'),
  epicId: EpicIdSchema,
  proposalIds: z.array(ContextProposalIdSchema).default([]),
  contextRevisionIds: z.array(ContextRevisionIdSchema).min(1),
  resolvedAt: IsoTimestampSchema,
  resolvedBy: ActorRefSchema,
});
export const ContextSyncNotRequiredSchema = z.object({
  status: z.literal('not-required'),
  epicId: EpicIdSchema,
  reason: z.string().min(1),
  resolvedAt: IsoTimestampSchema,
  resolvedBy: ActorRefSchema,
});
export const ContextSyncFactSchema = z.discriminatedUnion('status', [
  ContextSyncNotEvaluatedSchema,
  ContextSyncPendingSchema,
  ContextSyncProposedSchema,
  ContextSyncAppliedSchema,
  ContextSyncNotRequiredSchema,
]);
export type ContextSyncFact = z.infer<typeof ContextSyncFactSchema>;
export type ContextSyncStatus = ContextSyncFact['status'];

// ── ChangeRelations ────────────────────────────────────────────────

export const ChangeRelationsSchema = z.object({
  splitFrom: ChangeIdSchema.optional(),
  mergedFrom: z.array(ChangeIdSchema).default([]),
  relatesTo: z.array(ChangeIdSchema).default([]),
  supersededBy: ChangeIdSchema.optional(),
});
export type ChangeRelations = z.infer<typeof ChangeRelationsSchema>;

// ── ScopeAnalysis (advisory, immutable proposal) ──────────────────

/** Impact analysis is advisory, never an approval gate (§5, §D2, invariant 6) — there is no `confirmed` terminal state. */
export const SCOPE_ANALYSIS_CONFIDENCE = ['low', 'medium', 'high'] as const;
export const ScopeAnalysisConfidenceSchema = z.enum(SCOPE_ANALYSIS_CONFIDENCE);
export type ScopeAnalysisConfidence = z.infer<typeof ScopeAnalysisConfidenceSchema>;

/** Carried over from a migrated legacy `WorkItem.impact.status` (plan §18.8); never re-introduced as a new gate. */
export const LEGACY_IMPACT_STATUSES = ['not-analyzed', 'proposed', 'confirmed'] as const;
export const LegacyImpactStatusSchema = z.enum(LEGACY_IMPACT_STATUSES);
export type LegacyImpactStatus = z.infer<typeof LegacyImpactStatusSchema>;

export const ScopeAnalysisFileEvidenceSchema = z.object({
  path: z.string().min(1),
  contentHash: Sha256HexSchema.optional(),
  reason: z.string().min(1),
});
export const ScopeAnalysisSymbolEvidenceSchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1).optional(),
  reason: z.string().min(1),
});

export const ScopeAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  id: ScopeAnalysisIdSchema,
  changeId: ChangeIdSchema,
  supersedesAnalysisId: ScopeAnalysisIdSchema.optional(),
  analyzedAgainst: z.object({
    changeRevision: z.number().int().nonnegative(),
    changeContentHash: Sha256HexSchema,
    contextRevisionId: ContextRevisionIdSchema,
    contextRootHash: Sha256HexSchema,
    sourceSnapshotHash: Sha256HexSchema,
  }),
  contextEntityKeys: z.array(z.string().min(1)).default([]),
  files: z.array(ScopeAnalysisFileEvidenceSchema).default([]),
  symbols: z.array(ScopeAnalysisSymbolEvidenceSchema).default([]),
  dependencies: z.array(z.string().min(1)).default([]),
  risks: z.array(z.string().min(1)).default([]),
  unknowns: z.array(z.string().min(1)).default([]),
  confidence: ScopeAnalysisConfidenceSchema,
  legacyImpactStatus: LegacyImpactStatusSchema.optional(),
  producedBy: ActorRefSchema,
  createdAt: IsoTimestampSchema,
});
export type ScopeAnalysis = z.infer<typeof ScopeAnalysisSchema>;

export function parseScopeAnalysis(raw: unknown): ScopeAnalysis {
  return parseContract(ScopeAnalysisSchema, raw, 'ScopeAnalysis');
}

/**
 * The human decision recorded when a user does not simply accept an
 * analysis (§18.5, §12.2) — always one of five concrete next actions, never
 * a dead-end `Reject`.
 */
export const SCOPE_ANALYSIS_REVIEW_OUTCOMES = ['feedback-recorded', 'used-for-exploration', 'bypassed-for-delivery'] as const;
export const ScopeAnalysisReviewOutcomeSchema = z.enum(SCOPE_ANALYSIS_REVIEW_OUTCOMES);
export type ScopeAnalysisReviewOutcome = z.infer<typeof ScopeAnalysisReviewOutcomeSchema>;

export const ScopeAnalysisReviewSchema = z.object({
  // Kept as a plain string (not `ScopeAnalysisIdSchema`) to match §18.5's
  // `analysisId: string` literally, since that appendix is the reconciled
  // schema and this file must not invent a stricter type it didn't specify.
  analysisId: z.string().min(1),
  outcome: ScopeAnalysisReviewOutcomeSchema,
  feedback: z.string().optional(),
  reason: z.string().optional(),
  at: IsoTimestampSchema,
  actor: ActorRefSchema.refine((actor) => actor.kind === 'user', 'Scope analysis review must be recorded by a human user'),
});
export type ScopeAnalysisReview = z.infer<typeof ScopeAnalysisReviewSchema>;

// ── ProjectChange ──────────────────────────────────────────────────

const ProjectChangeShapeRefSchema = z.object({
  revision: z.number().int().nonnegative(),
  contentHash: Sha256HexSchema,
});

const ProjectChangeFieldsSchema = z.object({
  schemaVersion: z.literal(1),
  id: ChangeIdSchema,
  revision: z.number().int().nonnegative(),
  contentHash: Sha256HexSchema,
  title: z.string().min(1),
  type: ChangeTypeSchema,
  priority: ChangePrioritySchema,
  disposition: ChangeDispositionSchema,
  requirement: ChangeRequirementSchema,
  origin: ChangeOriginSchema,
  externalRefs: z.array(ExternalReferenceSchema).default([]),
  latestScopeAnalysisId: ScopeAnalysisIdSchema.optional(),
  scopeReview: ScopeAnalysisReviewSchema.optional(),
  shapeRef: ProjectChangeShapeRefSchema.optional(),
  epicLink: ChangeEpicLinkSchema.optional(),
  contextSync: ContextSyncFactSchema,
  relations: ChangeRelationsSchema,
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

/** The exact shape hashed by {@link computeChangeContentHash} — every field except `contentHash` itself. */
export type ProjectChangeDraft = Omit<z.infer<typeof ProjectChangeFieldsSchema>, 'contentHash'>;

/**
 * SHA-256 of the canonical JSON of every field except `contentHash` (§6.1).
 * `externalRefs` and the two id-set relations are "set-like" — their order
 * carries no meaning — so they are sorted before hashing; every other array
 * (acceptance criteria, in/out of scope, constraints, ...) is a user-ordered
 * list and keeps the order given to it.
 */
export function computeChangeContentHash(draft: ProjectChangeDraft): string {
  // Defensive, not just type-level: a caller that builds `draft` by spreading
  // a full `ProjectChange` (which has `contentHash`) into an object literal —
  // e.g. `{ ...current, updatedAt: now }` — keeps that stale `contentHash` as
  // a real runtime property even though `ProjectChangeDraft`'s type says it
  // shouldn't be there (TS's excess-property check does not fire once a
  // spread is involved). Stripping it here, unconditionally, is what makes
  // the hash actually exclude it rather than merely claiming to.
  const { contentHash: _ignored, ...rest } = draft as ProjectChangeDraft & { contentHash?: unknown };
  const normalized = {
    ...rest,
    externalRefs: [...rest.externalRefs].sort((a, b) => a.id.localeCompare(b.id)),
    relations: {
      ...rest.relations,
      mergedFrom: [...rest.relations.mergedFrom].sort(),
      relatesTo: [...rest.relations.relatesTo].sort(),
    },
  };
  return sha256Hex(normalized);
}

/**
 * The narrower hash a Shape pins as `basedOnChange.contentHash` (§6.2) —
 * deliberately *not* `computeChangeContentHash`. `shapeRef` is itself a
 * field on `ProjectChange`, so every Shape write bumps `change.contentHash`
 * as a matter of course; comparing against the *whole* hash would make a
 * Shape look stale the instant it is created (chicken-and-egg on its own
 * pointer). This hash covers exactly the fields a Shape's decision is
 * actually based on — title/type/priority/requirement — so it only changes
 * when one of *those* changes, which is the real "did the ask change under
 * me" question (plan §D13, §D10 "fail closed": still whole-field, not
 * semantic-diffed per acceptance-criterion, but scoped to the right slice).
 */
export function computeChangeRequirementSliceHash(change: Pick<ProjectChange, 'title' | 'type' | 'priority' | 'requirement'>): string {
  return sha256Hex({ title: change.title, type: change.type, priority: change.priority, requirement: change.requirement });
}

export const ProjectChangeSchema = ProjectChangeFieldsSchema.superRefine((change, ctx) => {
  const seenExternalRefIds = new Set<string>();
  for (const ref of change.externalRefs) {
    if (seenExternalRefIds.has(ref.id)) {
      ctx.addIssue({ code: 'custom', path: ['externalRefs'], message: `Duplicate external reference id ${ref.id}.` });
    }
    seenExternalRefIds.add(ref.id);
  }

  const relatedIds = [change.relations.splitFrom, change.relations.supersededBy, ...change.relations.mergedFrom, ...change.relations.relatesTo];
  if (relatedIds.some((relatedId) => relatedId === change.id)) {
    ctx.addIssue({ code: 'custom', path: ['relations'], message: 'A Change cannot relate to itself.' });
  }

  // `supersededBy` is a single successor — a perfect fit for merge (many
  // sources -> one target), but a split has one source -> many children, so
  // it cannot set a single `supersededBy`. It records its children in
  // `relatesTo` instead (each child then points back via `splitFrom`). A
  // superseded Change must therefore show *some* successor trail, via
  // either field — never neither.
  if (change.disposition === 'superseded' && !change.relations.supersededBy && change.relations.relatesTo.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['relations'],
      message: 'A superseded Change must record relations.supersededBy (merge) or relations.relatesTo (split) so its successor(s) stay traceable.',
    });
  }
  if (change.disposition !== 'superseded' && change.relations.supersededBy) {
    ctx.addIssue({ code: 'custom', path: ['relations', 'supersededBy'], message: 'Only a superseded Change may set relations.supersededBy.' });
  }

  const { contentHash, ...draft } = change;
  const expectedHash = computeChangeContentHash(draft);
  if (expectedHash !== contentHash) {
    ctx.addIssue({ code: 'custom', path: ['contentHash'], message: `contentHash does not match canonical content (expected ${expectedHash}).` });
  }
});
export type ProjectChange = z.infer<typeof ProjectChangeSchema>;

export function parseProjectChange(raw: unknown): ProjectChange {
  return parseContract(ProjectChangeSchema, raw, 'ProjectChange');
}

// ── ChangeShape (component of Change, no top-level id/lifecycle — §D13) ──

export const CHANGE_SHAPE_STATUSES = ['exploring', 'ready', 'accepted'] as const;
export const ChangeShapeStatusSchema = z.enum(CHANGE_SHAPE_STATUSES);
export type ChangeShapeStatus = z.infer<typeof ChangeShapeStatusSchema>;

export const ChangeShapeOptionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  tradeoffs: z.array(z.string().min(1)).default([]),
});
export type ChangeShapeOption = z.infer<typeof ChangeShapeOptionSchema>;

const ChangeShapeFieldsSchema = z.object({
  schemaVersion: z.literal(1),
  changeId: ChangeIdSchema,
  revision: z.number().int().nonnegative(),
  contentHash: Sha256HexSchema,
  status: ChangeShapeStatusSchema,
  appetite: z.string().optional(),
  constraints: z.array(z.string().min(1)).default([]),
  options: z.array(ChangeShapeOptionSchema).default([]),
  selectedOptionId: z.string().min(1).optional(),
  rationale: z.string().optional(),
  risks: z.array(z.string().min(1)).default([]),
  noGos: z.array(z.string().min(1)).default([]),
  openQuestions: z.array(z.string().min(1)).default([]),
  architectureImpact: z.array(z.string().min(1)).default([]),
  /**
   * `revision` is the Change revision this Shape was (re)based on, for
   * display/audit only. `contentHash` is `computeChangeRequirementSliceHash`
   * of that Change at that point — NOT `ProjectChange.contentHash` — see
   * that function's doc for why the whole-record hash cannot be used here.
   */
  basedOnChange: ProjectChangeShapeRefSchema,
  acceptedBy: ActorRefSchema.optional(),
  acceptedAt: IsoTimestampSchema.optional(),
});

export type ChangeShapeDraft = Omit<z.infer<typeof ChangeShapeFieldsSchema>, 'contentHash'>;

/** SHA-256 of every field except `contentHash`; every array here is a user-ordered list, so none is sorted before hashing. */
export function computeChangeShapeContentHash(draft: ChangeShapeDraft): string {
  // Same defensive strip as computeChangeContentHash — see that function's comment.
  const { contentHash: _ignored, ...rest } = draft as ChangeShapeDraft & { contentHash?: unknown };
  return sha256Hex(rest);
}

export const ChangeShapeSchema = ChangeShapeFieldsSchema.superRefine((shape, ctx) => {
  if (shape.selectedOptionId && !shape.options.some((option) => option.id === shape.selectedOptionId)) {
    ctx.addIssue({ code: 'custom', path: ['selectedOptionId'], message: `selectedOptionId "${shape.selectedOptionId}" is not one of options.` });
  }
  if (shape.status === 'accepted' && (!shape.acceptedBy || !shape.acceptedAt)) {
    ctx.addIssue({ code: 'custom', path: ['status'], message: 'An accepted Shape must record acceptedBy and acceptedAt.' });
  }
  if (shape.acceptedBy && shape.acceptedBy.kind !== 'user') {
    ctx.addIssue({ code: 'custom', path: ['acceptedBy'], message: 'Only a human user may accept a Shape.' });
  }

  const { contentHash, ...draft } = shape;
  const expectedHash = computeChangeShapeContentHash(draft);
  if (expectedHash !== contentHash) {
    ctx.addIssue({ code: 'custom', path: ['contentHash'], message: `contentHash does not match canonical content (expected ${expectedHash}).` });
  }
});
export type ChangeShape = z.infer<typeof ChangeShapeSchema>;

export function parseChangeShape(raw: unknown): ChangeShape {
  return parseContract(ChangeShapeSchema, raw, 'ChangeShape');
}

// ── ChangeProvenance (pinned by an Epic back to its owning Change, §6.5) ──

/**
 * No `schemaVersion` of its own: like `ActorRef`/`EvidenceRef` (see
 * `common.ts` doc comment), it is always embedded inside a versioned root —
 * here, the future `EpicV2.sourceChange` (§18.3) — and evolves implicitly
 * with that root's version. Not wired into the Epic contract in this slice
 * (§17 first executable slice explicitly defers that to M3).
 */
export const ChangeProvenanceSchema = z.object({
  changeId: ChangeIdSchema,
  changeRevision: z.number().int().nonnegative(),
  changeContentHash: Sha256HexSchema,
  changeSnapshotHash: Sha256HexSchema,
  contextRevision: ContextRevisionIdSchema,
  contextRootHash: Sha256HexSchema,
});
export type ChangeProvenance = z.infer<typeof ChangeProvenanceSchema>;

export function parseChangeProvenance(raw: unknown): ChangeProvenance {
  return parseContract(ChangeProvenanceSchema, raw, 'ChangeProvenance');
}
