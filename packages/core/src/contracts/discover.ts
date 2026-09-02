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

/**
 * One repository whose source code a blueprint describes.
 *
 * Declared by the user, never inferred at run time: a meta-repo's children are
 * separate git repos with separate stacks, and guessing which of them a given
 * blueprint is about is exactly how a scan ends up describing the wrong
 * product (or the AI scaffolding it found lying around).
 */
export const DiscoverSourceRepoSchema = z.object({
  /** Path relative to the workspace root. `.` is the workspace itself. */
  path: z.string().min(1),
  /**
   * What this repo is, in the user's own words — `backend`, `frontend`,
   * `mobile`, `infra`, … Free text on purpose: it is a label the scan uses to
   * keep one repo's findings distinguishable from another's, not an enum the
   * app branches on.
   */
  kind: z.string().min(1),
  /** Display name. Defaults to the folder name when absent. */
  name: z.string().optional(),
});
export type DiscoverSourceRepo = z.infer<typeof DiscoverSourceRepoSchema>;

/**
 * Which code on disk this blueprint is the record of.
 *
 * Absent until the user declares it (the first scan asks). Once declared it is
 * reused by every later scan — the layout of a repo tree does not change
 * often, and re-asking every run would be noise.
 */
export const DiscoverScopeSchema = z.object({
  /**
   * `single` — one repo that holds its own source, the ordinary case.
   * `parent` — a meta-repo: little or no source of its own, the product lives
   *   in the child repos listed in `repos`.
   * `child`  — one child of a parent repo that owns the product-level docs;
   *   `parentPath` points at it so a scan can read those docs as input
   *   instead of contradicting them.
   */
  layout: z.enum(['single', 'parent', 'child']),
  /** Where the parent lives, relative to the workspace root. `child` only. */
  parentPath: z.string().optional(),
  repos: z.array(DiscoverSourceRepoSchema).default([]),
  /** Extra paths never read as source, on top of the built-in exclude list. */
  excludes: z.array(z.string()).default([]),
  declaredAt: IsoTimestampSchema,
});
export type DiscoverScope = z.infer<typeof DiscoverScopeSchema>;

export const DiscoverIndexSchema = z.object({
  schemaVersion: z.literal(1),
  /** One blueprint per workspace for now — see plan §7 assumption 2. */
  id: z.string().min(1),
  title: z.string(),
  seedSentence: z.string(),
  /** Where the generated docs live, relative to the workspace root. */
  docsRoot: z.string().min(1).default('docs'),
  outputLanguage: z.enum(['en', 'vi']).default('en'),
  /**
   * Which repos on disk this blueprint describes — see
   * {@link DiscoverScopeSchema}. Absent on a blueprint created before the
   * repo layout was ever declared; a scan asks for it rather than guessing.
   */
  scope: DiscoverScopeSchema.optional(),
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
