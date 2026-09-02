import { z } from 'zod';

import { IsoTimestampSchema, parseContract } from './common';

/**
 * Discover is deliberately thin on persisted state: the Markdown files under
 * `docsRoot` are the source of truth for every word the user or an agent
 * writes (see `docs/DISCOVER_TAB_PLAN.md` §0). Everything in this file is
 * *sidecar* metadata — where the pipeline is, what each doc hashed to last
 * time we looked, who authored an item, and what each agent run changed.
 * Deleting `.aidlc/discover/` loses undo and provenance; it never loses
 * content.
 */

export const DISCOVER_STEP_IDS = [
  'idea',
  'product',
  'requirements',
  'features',
  'usecases',
  'userflows',
  'datamodel',
  'architecture',
  'techdecisions',
  'structure',
  'plan',
  'skeleton',
] as const;
export const DiscoverStepIdSchema = z.enum(DISCOVER_STEP_IDS);
export type DiscoverStepId = z.infer<typeof DiscoverStepIdSchema>;

/**
 * Per-item metadata, keyed by `<relative doc path>#<ID>`. `hash` is of the
 * item's rendered text at the moment we recorded `origin`: when the file on
 * disk no longer hashes to this, the item was edited outside the app and
 * `origin` is re-read as `human` rather than trusted (plan §2.1 rule 6).
 */
export const DiscoverItemMetaSchema = z.object({
  origin: z.enum(['ai', 'human']),
  hash: z.string().min(1),
  pinned: z.boolean().default(false),
  flagged: z.boolean().default(false),
  updatedAt: IsoTimestampSchema,
});
export type DiscoverItemMeta = z.infer<typeof DiscoverItemMetaSchema>;

export const DiscoverDocMetaSchema = z.object({
  hash: z.string().min(1),
  updatedAt: IsoTimestampSchema,
  /** Run that last wrote this doc, when it was an agent rather than a person. */
  lastRunId: z.string().optional(),
});
export type DiscoverDocMeta = z.infer<typeof DiscoverDocMetaSchema>;

export const DiscoverRunDiffSchema = z.object({
  added: z.array(z.string()).default([]),
  updated: z.array(z.string()).default([]),
  removed: z.array(z.string()).default([]),
});
export type DiscoverRunDiff = z.infer<typeof DiscoverRunDiffSchema>;

/**
 * One agent invocation. `mode` records what the agent was asked to do, not
 * what it did: `fill` when the step's docs were empty, `refine` when they
 * already had content and existing ids had to survive.
 */
export const DiscoverRunSchema = z.object({
  id: z.string().min(1),
  step: DiscoverStepIdSchema,
  mode: z.enum(['fill', 'refine']),
  /**
   * `step` (default) touches one step's files, scoped by the guardrail check.
   * `scan` reconciles every step against the actual source code in one pass,
   * so the guardrail's allowed-files check widens to the whole blueprint.
   * `edit` wraps a person's direct field edit in the same run/diff/keep flow
   * an agent gets — also unscoped, since a person may edit whichever doc
   * they have open, not just one step's files.
   */
  kind: z.enum(['step', 'scan', 'edit']).default('step'),
  startedAt: IsoTimestampSchema,
  finishedAt: IsoTimestampSchema.optional(),
  note: z.string().optional(),
  diff: DiscoverRunDiffSchema.default({ added: [], updated: [], removed: [] }),
  /** Guardrail violations found after the run — see `validate.ts`. */
  guardrail: z.array(z.string()).default([]),
  /**
   * `running` while the agent may still be writing · `review` once its diff
   * has been computed and is waiting on the human · `kept`/`reverted` after
   * they decide. Only one run is ever past `running` and short of a verdict.
   */
  status: z.enum(['running', 'review', 'kept', 'reverted']).default('running'),
  /** False once the snapshot has been dropped, i.e. the run can no longer be reverted. */
  revertable: z.boolean().default(true),
});
export type DiscoverRun = z.infer<typeof DiscoverRunSchema>;

/**
 * The six CoFoFo recipes a Discover phase can be handed off to. Declared here
 * rather than imported from `../cofofo/contracts` because `contracts/` does
 * not depend on a subsystem; `WorkflowGenerator` is the list's source.
 */
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
 * One Implementation Plan phase that has been turned into an epic. Recorded so
 * the tab can show where a phase went and refuse to scaffold it twice — the
 * epic itself is the source of truth for its own progress.
 */
export const DiscoverHandoffSchema = z.object({
  phaseId: z.string().min(1),
  epicId: z.string().min(1),
  recipeId: CofofoRecipeIdSchema,
  title: z.string(),
  at: IsoTimestampSchema,
});
export type DiscoverHandoff = z.infer<typeof DiscoverHandoffSchema>;

export const DiscoverIndexSchema = z.object({
  schemaVersion: z.literal(1),
  /** One blueprint per workspace for now — see plan §7 assumption 2. */
  id: z.string().min(1),
  title: z.string(),
  seedSentence: z.string(),
  /** Where the generated docs live, relative to the workspace root. */
  docsRoot: z.string().min(1).default('docs'),
  outputLanguage: z.enum(['en', 'vi']).default('en'),
  currentStep: DiscoverStepIdSchema.default('idea'),
  /** Optimistic-concurrency counter — bumped on every write through the service. */
  revision: z.number().int().nonnegative().default(0),
  docs: z.record(z.string(), DiscoverDocMetaSchema).default({}),
  items: z.record(z.string(), DiscoverItemMetaSchema).default({}),
  runs: z.array(DiscoverRunSchema).default([]),
  /** Phases already handed off to an epic — see {@link DiscoverHandoffSchema}. */
  handoffs: z.array(DiscoverHandoffSchema).default([]),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});
export type DiscoverIndex = z.infer<typeof DiscoverIndexSchema>;

export function parseDiscoverIndex(raw: unknown): DiscoverIndex {
  return parseContract(DiscoverIndexSchema, raw, 'DiscoverIndex');
}
