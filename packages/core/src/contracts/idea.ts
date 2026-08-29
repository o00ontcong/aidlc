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

/**
 * A person-owned intake record: one sentence in, an agent-assisted question
 * batch, then a routed handoff into exactly one of the six CoFoFo recipes (or
 * a clean close with no epic). Every field here answers a resume/undo/inbox
 * question from the audit — a missing field is a production bug, not a
 * missing bit of UI (docs/design/ideas-tab/ideas-tab-audit.canvas.tsx).
 */
export const IdeaSchema = z.object({
  schemaVersion: z.literal(1),
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
  assumptions: z.array(IdeaAssumptionSchema),
  inDelivery: IdeaInDeliverySchema.optional(),
  children: z.array(IdeaChildSchema),
  blockedReason: z.string().optional(),
  saveStatus: IdeaSaveStatusSchema,
  /** Unsaved local edits exist that a idea-switch would discard (M02). */
  dirty: z.boolean(),
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
    'prep_completed',
    'prep_failed',
    'self_answer_flagged',
    'answer_saved',
    'batch_submitted',
    'decided_rest',
    'route_failed',
    'route_generated',
    'route_confirmed',
    'scaffolded',
    'closed',
    'completed',
    'shelved',
    'reopened',
    'restarted',
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
