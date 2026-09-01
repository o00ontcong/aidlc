import { z } from 'zod';

import { ActorRefSchema, IsoTimestampSchema, parseContract } from './common';

/**
 * Idea is CoFoFo-only by design (see docs/design/ideas-tab/*.canvas.tsx): it
 * exists to feed exactly the six CoFoFo recipes, so its Foundation binding is
 * the CoFoFo Foundation (`docs/project/foundation/CONTEXT-MANIFEST.json`),
 * not the generic `ProjectFoundationService` Shape uses. This schema is kept
 * structurally compatible with `CofofoFoundationSnapshot`
 * (`../cofofo/contracts.ts`) without importing it — `contracts/` does not
 * depend on a subsystem — so a real snapshot from `CofofoFoundationService`
 * parses here unchanged.
 */
export const IdeaFoundationSnapshotSchema = z.object({
  revision: z.number().int().nonnegative(),
  manifestPath: z.string().min(1),
  manifestHash: z.string().min(1),
  capturedAt: IsoTimestampSchema,
});
export type IdeaFoundationSnapshot = z.infer<typeof IdeaFoundationSnapshotSchema>;

/**
 * Where one Idea sits in the intake funnel. UI reads this field and renders
 * the matching screen — it never infers position from other fields, and
 * reopening an Idea must never reset it to `captured`.
 *
 * `intent_drafted` has no dedicated screen: it is the brief instant between
 * the question batch finishing and routing starting, surfaced only as a
 * "preparing route" state on screen 1/2 if the UI catches it mid-flight.
 */
export const IDEA_CHECKPOINTS = [
  'captured',
  'preparing',
  'awaiting_human',
  'intent_drafted',
  'route_proposed',
  'in_delivery',
  'closed',
  'completed',
  'shelved',
] as const;
export const IdeaCheckpointSchema = z.enum(IDEA_CHECKPOINTS);
export type IdeaCheckpoint = z.infer<typeof IdeaCheckpointSchema>;

/** One option offered for a question, with the agent's pre-selected default. */
export const IdeaQuestionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  recommended: z.boolean(),
});
export type IdeaQuestionOption = z.infer<typeof IdeaQuestionOptionSchema>;

/**
 * A question that survived self-answering and impact filtering. `dependsOn`
 * lists question ids that must be answered first — the batcher only offers a
 * question once every id in `dependsOn` has an answer, so dependent
 * questions are asked in topological order across at most one supplementary
 * batch (see the flow graph's "gộp lô thay vì tuần tự" mechanism).
 */
export const IdeaQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  options: z.array(IdeaQuestionOptionSchema).min(2),
  /** Why this question is being asked, grounded in the seed sentence. */
  reason: z.string().min(1),
  highImpact: z.boolean(),
  dependsOn: z.array(z.string()),
});
export type IdeaQuestion = z.infer<typeof IdeaQuestionSchema>;

/**
 * A question the agent answered itself instead of asking the human, with the
 * file it read the answer from. `flagged` lets the human mark a wrong
 * self-answer (F02) — a flagged entry is excluded from the Idea's confirmed
 * facts and its question is offered to the human on the next prep pass.
 */
export const IdeaSelfAnsweredSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  source: z.string().min(1),
  flagged: z.boolean(),
});
export type IdeaSelfAnswered = z.infer<typeof IdeaSelfAnsweredSchema>;

export const IdeaPrepStatusSchema = z.enum(['idle', 'running', 'done', 'failed']);
export type IdeaPrepStatus = z.infer<typeof IdeaPrepStatusSchema>;

export const IdeaPrepSchema = z.object({
  status: IdeaPrepStatusSchema,
  jobId: z.string().optional(),
  selfAnswered: z.array(IdeaSelfAnsweredSchema),
  questions: z.array(IdeaQuestionSchema),
  error: z.string().optional(),
});
export type IdeaPrep = z.infer<typeof IdeaPrepSchema>;

/** One recipe slot in a proposed route, in run order. */
export const IdeaRouteStepSchema = z.object({
  recipeId: z.enum([
    'cofofo-bootstrap',
    'cofofo-refresh-context',
    'cofofo-update-rules',
    'cofofo-repin-bundle',
    'cofofo-feature',
    'cofofo-bugfix',
  ]),
  epicTitle: z.string().min(1),
  rationale: z.string().min(1),
  /** Present once this step's epic has been scaffolded. */
  epicId: z.string().optional(),
});
export type IdeaRouteStep = z.infer<typeof IdeaRouteStepSchema>;

/**
 * A labeled point the routing agent left undecided rather than blocking the
 * user for it. Reviewed once at the `requirement` Canvas gate alongside
 * OPTIONS.md — never a second review surface inside Ideas.
 */
export const IdeaAssumptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  source: z.enum(['agent', 'human']),
});
export type IdeaAssumption = z.infer<typeof IdeaAssumptionSchema>;

/**
 * The proposed route. `outcome: 'close'` means routing decided this is just
 * a question with no build needed — `steps` is then empty and `evidence`
 * carries the research write-up that becomes the Idea's own EVIDENCE.md.
 */
export const IdeaRouteDraftSchema = z.object({
  outcome: z.enum(['epics', 'close']),
  steps: z.array(IdeaRouteStepSchema),
  evidence: z.string().optional(),
});
export type IdeaRouteDraft = z.infer<typeof IdeaRouteDraftSchema>;

/** Where an Idea's confirmed route landed, once at least one epic exists. */
export const IdeaChildSchema = z.object({
  epicId: z.string().min(1),
  recipeId: IdeaRouteStepSchema.shape.recipeId,
  runStatus: z.string().min(1),
});
export type IdeaChild = z.infer<typeof IdeaChildSchema>;

export const IdeaInDeliverySchema = z.object({
  epicId: z.string().min(1),
  runId: z.string().min(1),
  stepRevision: z.number().int().nonnegative(),
  reviewRound: z.number().int().nonnegative().optional(),
});
export type IdeaInDelivery = z.infer<typeof IdeaInDeliverySchema>;

export const IdeaSaveStatusSchema = z.enum(['saved', 'saving', 'failed']);
export type IdeaSaveStatus = z.infer<typeof IdeaSaveStatusSchema>;

export const COFOFO_RECIPE_IDS = [
  'cofofo-bootstrap',
  'cofofo-refresh-context',
  'cofofo-update-rules',
  'cofofo-repin-bundle',
  'cofofo-feature',
  'cofofo-bugfix',
] as const;
export const CofofoRecipeIdSchema = z.enum(COFOFO_RECIPE_IDS);
export type CofofoRecipeId = z.infer<typeof CofofoRecipeIdSchema>;

/**
 * LEGACY — the human-owned "journal" funnel (spark → research → rewrite →
 * ready) that preceded the Understand/Research/Explore/Decide/Ready
 * workflow below. Superseded; kept only so `parseIdea` can still read an
 * `state.json` written before the 5-stage model existed. `migrateIdea`
 * (`../idea/migration.ts`) converts these into the new fields on load —
 * nothing writes `journalPhase`/`journal` going forward.
 */
export const IDEA_JOURNAL_PHASES = ['spark', 'research', 'rewrite', 'ready'] as const;
export const IdeaJournalPhaseSchema = z.enum(IDEA_JOURNAL_PHASES);
export type IdeaJournalPhase = z.infer<typeof IdeaJournalPhaseSchema>;

export const IdeaJournalSourceSchema = z.object({
  id: z.string().min(1),
  source: z.string(),
  type: z.string(),
  question: z.string(),
  read: z.boolean(),
});
export type IdeaJournalSource = z.infer<typeof IdeaJournalSourceSchema>;

export const IdeaJournalNoteSchema = z.object({
  id: z.string().min(1),
  at: IsoTimestampSchema,
  text: z.string(),
  origin: z.enum(['human', 'ai']),
});
export type IdeaJournalNote = z.infer<typeof IdeaJournalNoteSchema>;

export const IdeaJournalRewriteSchema = z.object({
  problem: z.string(),
  outcome: z.string(),
  appetite: z.string(),
  noGos: z.string(),
});
export type IdeaJournalRewrite = z.infer<typeof IdeaJournalRewriteSchema>;

export const IdeaJournalSchema = z.object({
  sources: z.array(IdeaJournalSourceSchema),
  notes: z.array(IdeaJournalNoteSchema),
  rewrite: IdeaJournalRewriteSchema,
  readyRecipeId: CofofoRecipeIdSchema.optional(),
  readyEpicTitle: z.string().optional(),
});
export type IdeaJournal = z.infer<typeof IdeaJournalSchema>;

/**
 * The research workflow stage — replaces {@link IdeaJournalPhase}. Drives
 * the Ideas tab UI directly (`IdeaWorkspaceDetail`'s `StageBar` reads this,
 * never infers it). `ready` is reached only via `IdeaService.markReady()`,
 * an explicit human action gated by the Decide stage's Definition of Done —
 * never set as a side effect of an AI-imported action
 * (see `agentActions.ts`'s `mark_ready`, which never writes this field).
 */
export const IDEA_STAGES = ['understand', 'research', 'explore', 'decide', 'ready'] as const;
export const IdeaStageSchema = z.enum(IDEA_STAGES);
export type IdeaStage = z.infer<typeof IdeaStageSchema>;

export const IdeaSourceSchema = IdeaJournalSourceSchema;
export type IdeaSource = z.infer<typeof IdeaSourceSchema>;

/**
 * A single research finding. `type` must never be inferred as `fact` by
 * anything AI-authored — only a human upgrading an `inference`/`assumption`
 * to `fact` (by editing it directly) should ever produce a `fact` finding.
 * See spec §5: "Do not present an AI assumption as verified fact."
 */
export const FindingTypeSchema = z.enum(['fact', 'assumption', 'inference']);
export type FindingType = z.infer<typeof FindingTypeSchema>;

export const FindingSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  type: FindingTypeSchema,
  sourceIds: z.array(z.string()),
  createdBy: z.enum(['user', 'ai']),
  createdAt: IsoTimestampSchema,
});
export type Finding = z.infer<typeof FindingSchema>;

export const ExistingSolutionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  createdBy: z.enum(['user', 'ai']),
  createdAt: IsoTimestampSchema,
});
export type ExistingSolution = z.infer<typeof ExistingSolutionSchema>;

/** Understand stage content — the real problem behind the original idea. */
export const IdeaUnderstandSchema = z.object({
  problem: z.string(),
  context: z.string(),
  users: z.array(z.string()),
  assumptions: z.array(z.string()),
  unknowns: z.array(z.string()),
});
export type IdeaUnderstand = z.infer<typeof IdeaUnderstandSchema>;

/** Research stage content — how the problem is solved today, and evidence collected. */
export const IdeaResearchSchema = z.object({
  findings: z.array(FindingSchema),
  sources: z.array(IdeaSourceSchema),
  existingSolutions: z.array(ExistingSolutionSchema),
  unknowns: z.array(z.string()),
});
export type IdeaResearch = z.infer<typeof IdeaResearchSchema>;

export const SolutionOptionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  risks: z.array(z.string()),
  tradeoffs: z.array(z.string()),
  validation: z.string().optional(),
});
export type SolutionOption = z.infer<typeof SolutionOptionSchema>;

/** Explore stage content — realistic solution options compared against each other. */
export const IdeaExploreSchema = z.object({
  options: z.array(SolutionOptionSchema),
  /** Idea-level validation ideas, distinct from a single option's own `validation`. */
  validations: z.array(z.string()),
});
export type IdeaExplore = z.infer<typeof IdeaExploreSchema>;

export const DECISION_STATUSES = ['go', 'no-go', 'later', 'more-research', 'change-direction'] as const;
export const DecisionStatusSchema = z.enum(DECISION_STATUSES);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

/** Decide stage content — the research turned into an explicit decision. */
export const IdeaDecisionSchema = z.object({
  status: DecisionStatusSchema.optional(),
  recommendation: z.string().optional(),
  finalIdea: z.string().optional(),
  scope: z.array(z.string()),
  outOfScope: z.array(z.string()),
  validation: z.string().optional(),
  successCriteria: z.array(z.string()),
  nextStep: z.string().optional(),
});
export type IdeaDecision = z.infer<typeof IdeaDecisionSchema>;

/**
 * The output of `/aidlc-idea-translate` (see `IdeaAgentCommand.ts`) — a
 * language-only rewrite of an idea's existing content, applied in place by
 * `IdeaService.applyTranslation()`. Every array here must have the SAME
 * length as the field it replaces (matched by index) except where the
 * current field carries its own `id` (findings/sources/existingSolutions/
 * options), which are matched by `id` instead so reordering can't silently
 * scramble data. Anything not a human-prose string (ids, `type`, `source`
 * paths, booleans) is deliberately absent from this shape — there is
 * nothing to translate there.
 */
export const IdeaTranslationSchema = z.object({
  language: z.enum(['en', 'vi']),
  understand: z.object({
    problem: z.string().optional(),
    context: z.string().optional(),
    users: z.array(z.string()).optional(),
    assumptions: z.array(z.string()).optional(),
    unknowns: z.array(z.string()).optional(),
  }).optional(),
  research: z.object({
    findings: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).optional(),
    sources: z.array(z.object({ id: z.string().min(1), question: z.string() })).optional(),
    existingSolutions: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).optional(),
    unknowns: z.array(z.string()).optional(),
  }).optional(),
  explore: z.object({
    options: z.array(z.object({
      id: z.string().min(1),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      pros: z.array(z.string()).optional(),
      cons: z.array(z.string()).optional(),
      risks: z.array(z.string()).optional(),
      tradeoffs: z.array(z.string()).optional(),
      validation: z.string().optional(),
    })).optional(),
    validations: z.array(z.string()).optional(),
  }).optional(),
  decision: z.object({
    recommendation: z.string().optional(),
    finalIdea: z.string().optional(),
    scope: z.array(z.string()).optional(),
    outOfScope: z.array(z.string()).optional(),
    validation: z.string().optional(),
    successCriteria: z.array(z.string()).optional(),
    nextStep: z.string().optional(),
  }).optional(),
});
export type IdeaTranslation = z.infer<typeof IdeaTranslationSchema>;
export function parseIdeaTranslation(raw: unknown): IdeaTranslation {
  return parseContract(IdeaTranslationSchema, raw, 'IdeaTranslation');
}

/**
 * A change an earlier stage needs re-checked because a stage ahead of it was
 * already advanced past when the earlier stage's data changed (spec §9 —
 * "Decision may need review because the Problem changed"). Cleared only by
 * the human re-running `advanceStage` through the flagged stage, never
 * automatically.
 */
export const IdeaNeedsReviewSchema = z.object({
  reason: z.string().min(1),
  since: IsoTimestampSchema,
});
export type IdeaNeedsReview = z.infer<typeof IdeaNeedsReviewSchema>;

/**
 * An AI-proposed change awaiting a human verdict (spec §24's "Represent
 * pending changes in a reusable way"). `payload` is intentionally loose
 * here — the discriminated `IdeaAgentAction` union it must satisfy lives in
 * `../idea/agentActions.ts`, validated at the point a proposal is imported,
 * not re-validated by this contract on every load. Declared on `Idea` now so
 * adding it later would not require a second schema migration.
 */
export const PendingIdeaActionSchema = z.object({
  id: z.string().min(1),
  stage: IdeaStageSchema,
  actionType: z.string().min(1),
  /** Human-readable "AI proposes: ..." line for the approval card. */
  summary: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  createdAt: IsoTimestampSchema,
});
export type PendingIdeaAction = z.infer<typeof PendingIdeaActionSchema>;

/**
 * A human Canvas verdict on the routing decision itself (`ROUTE.md` for an
 * epics outcome, `EVIDENCE.md` for a `close` outcome) — presence means
 * approved. Absent while `checkpoint === 'route_proposed'` means the gate is
 * still open, including for an idea persisted before this field existed
 * (F22): an old `route_proposed` idea with no `routeApproval` simply re-opens
 * the same gate rather than failing validation.
 */
export const IdeaRouteApprovalSchema = z.object({
  reviewer: z.string().min(1),
  at: IsoTimestampSchema,
  /** `bundleHash` of the `ReviewBundle` this verdict was issued against. */
  bundleHash: z.string().min(1),
});
export type IdeaRouteApproval = z.infer<typeof IdeaRouteApprovalSchema>;

/**
 * A person-owned intake record: one sentence in, an agent-assisted question
 * batch, then a routed handoff into exactly one of the six CoFoFo recipes (or
 * a clean close with no epic). Every field here answers a resume/undo/inbox
 * question from the audit — a missing field is a production bug, not a
 * missing bit of UI (docs/design/ideas-tab/ideas-tab-audit.canvas.tsx).
 */
export const IdeaSchema = z.object({
  /**
   * `1` — pre-5-stage records (`journalPhase`/`journal`, or older still).
   * `2` — Understand/Research/Explore/Decide/Ready records. `migrateIdea`
   * (`../idea/migration.ts`) is the ONLY place that bumps 1 → 2; it uses this
   * field, not field-presence sniffing, to decide whether migration already
   * ran — every new field below has a `.default()` purely so `parseIdea` can
   * still read a `schemaVersion: 1` file at all, not as a signal of migration
   * status.
   */
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  id: z.string().regex(/^IDEA-\d{3,}$/),
  checkpoint: IdeaCheckpointSchema,
  /** Bumped on every seed/answer/route edit — the optimistic-concurrency field. */
  ideaRevision: z.number().int().nonnegative(),
  seedSentence: z.string(),
  title: z.string(),
  outputLanguage: z.enum(['en', 'vi']),
  /** `null` when captured before a CoFoFo Foundation has ever published. */
  foundationHashAtCapture: IdeaFoundationSnapshotSchema.nullable(),
  answers: z.record(z.string(), z.string()),
  batchIndex: z.number().int().nonnegative(),
  batchSubmitted: z.boolean(),
  prep: IdeaPrepSchema,
  routeDraft: IdeaRouteDraftSchema.optional(),
  routeConfirmed: z.boolean(),
  /** Canvas verdict on the routing decision — see {@link IdeaRouteApprovalSchema}. */
  routeApproval: IdeaRouteApprovalSchema.optional(),
  assumptions: z.array(IdeaAssumptionSchema),
  inDelivery: IdeaInDeliverySchema.optional(),
  children: z.array(IdeaChildSchema),
  blockedReason: z.string().optional(),
  /** Checkpoint to resume at after shelve → reopen (audit M01). */
  shelvedFromCheckpoint: IdeaCheckpointSchema.optional(),
  saveStatus: IdeaSaveStatusSchema,
  /** Unsaved local edits exist that a idea-switch would discard (M02). */
  dirty: z.boolean(),
  /** LEGACY — human journal funnel position; superseded by `stage`. */
  journalPhase: IdeaJournalPhaseSchema.optional(),
  /** LEGACY — superseded by `understand`/`research`/`explore`/`decision`. */
  journal: IdeaJournalSchema.optional(),
  /** Understand → Research → Explore → Decide → Ready. See {@link IdeaStageSchema}. */
  stage: IdeaStageSchema.default('understand'),
  understand: IdeaUnderstandSchema.default({ problem: '', context: '', users: [], assumptions: [], unknowns: [] }),
  research: IdeaResearchSchema.default({ findings: [], sources: [], existingSolutions: [], unknowns: [] }),
  explore: IdeaExploreSchema.default({ options: [], validations: [] }),
  decision: IdeaDecisionSchema.default({ scope: [], outOfScope: [], successCriteria: [] }),
  /** Set once `stage` reaches `ready` and a CoFoFo recipe is chosen for scaffold. */
  readyRecipeId: CofofoRecipeIdSchema.optional(),
  readyEpicTitle: z.string().optional(),
  /** A stage ahead of the flagged one changed data it already relied on — see {@link IdeaNeedsReviewSchema}. */
  needsReview: IdeaNeedsReviewSchema.optional(),
  /** AI-proposed changes awaiting Accept/Edit/Reject — see {@link PendingIdeaActionSchema}. */
  pendingActions: z.array(PendingIdeaActionSchema).default([]),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
}).superRefine((idea, ctx) => {
  if (idea.checkpoint === 'route_proposed' && !idea.routeDraft) {
    ctx.addIssue({ code: 'custom', path: ['routeDraft'], message: 'route_proposed requires a routeDraft.' });
  }
  if (idea.checkpoint === 'in_delivery' && !idea.inDelivery) {
    ctx.addIssue({ code: 'custom', path: ['inDelivery'], message: 'in_delivery requires an inDelivery pointer.' });
  }
  // `routeConfirmed: true` while still at `route_proposed` is a real,
  // intentional transient state — the crash-safety checkpoint between
  // confirming a route and finishing the scaffold it commits to
  // (IdeaService.confirmRouteAndScaffold), mirroring ShapeService's
  // conversion-pending window. Not an invariant violation.
});
export type Idea = z.infer<typeof IdeaSchema>;

export const IdeaEventSchema = z.object({
  id: z.string().min(1),
  at: IsoTimestampSchema,
  type: z.enum([
    'created',
    'seed_edited',
    'prep_started',
    'prep_rerun',
    'prep_completed',
    'prep_failed',
    'prep_stopped',
    'self_answer_flagged',
    'answer_saved',
    'answers_reopened',
    'batch_submitted',
    'decided_rest',
    'route_failed',
    'route_stopped',
    'route_generated',
    'route_reviewed',
    'route_changes_requested',
    'route_confirmed',
    'scaffolded',
    'closed',
    'completed',
    'shelved',
    'reopened',
    'restarted',
    // LEGACY — superseded by the stage-based event types below; kept so
    // `events.ndjson` written before the 5-stage workflow still parses.
    'journal_saved',
    'journal_phase_advanced',
    'journal_note_appended',
    'journal_scaffolded',
    'understand_updated',
    'research_updated',
    'explore_updated',
    'decision_updated',
    'stage_advanced',
    'marked_ready',
    'ai_proposal_imported',
    'ai_action_accepted',
    'ai_action_rejected',
    'translated',
  ]),
  actor: ActorRefSchema,
  revision: z.number().int().nonnegative(),
  detail: z.string().optional(),
});
export type IdeaEvent = z.infer<typeof IdeaEventSchema>;

export function parseIdea(raw: unknown): Idea {
  return parseContract(IdeaSchema, raw, 'Idea');
}

export function parseIdeaEvent(raw: unknown): IdeaEvent {
  return parseContract(IdeaEventSchema, raw, 'IdeaEvent');
}
