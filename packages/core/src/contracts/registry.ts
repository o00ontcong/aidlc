/**
 * Skill / Agent / Pipeline registry contracts (IMPLEMENT.md §1 "Data model").
 *
 * These are the reusable building blocks a Pipeline is assembled from —
 * distinct from `Epic`/`EpicRun` (one running instance of a pipeline against
 * one epic). An id here is a plain kebab-case slug (`figma-to-ui`,
 * `design-recreator`, `redraw-design`), not an `EPIC-*` id — these entities
 * are authored once and referenced by many epics, not spawned per-epic.
 */

import { z } from 'zod';
import { parseContract } from './common';
import { GateKindSchema, isHardGate } from './autonomy';

// ── RegistryId ─────────────────────────────────────────────────────

export const REGISTRY_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export const RegistryIdSchema = z
  .string()
  .regex(REGISTRY_ID_PATTERN, 'Must be a kebab-case id, e.g. "design-recreator"');
export type RegistryId = z.infer<typeof RegistryIdSchema>;

// ── Skill ──────────────────────────────────────────────────────────

/** IMPLEMENT.md §1: `bundled` ships with the extension, `design` is authored by a preset (e.g. Redraw Design), `custom` is user-authored. */
export const SKILL_SOURCES = ['bundled', 'design', 'custom'] as const;
export const SkillSourceSchema = z.enum(SKILL_SOURCES);
export type SkillSource = z.infer<typeof SkillSourceSchema>;

export const SkillSchema = z.object({
  id: RegistryIdSchema,
  source: SkillSourceSchema,
  description: z.string().min(1),
  /** Markdown body — the skill's instructions, everything after the frontmatter. */
  body: z.string(),
});
export type Skill = z.infer<typeof SkillSchema>;

export function parseSkill(raw: unknown): Skill {
  return parseContract(SkillSchema, raw, 'Skill');
}

// ── Agent ──────────────────────────────────────────────────────────

export const AGENT_TIERS = ['fast', 'balanced', 'deep', 'review'] as const;
export const AgentTierSchema = z.enum(AGENT_TIERS);
export type AgentTier = z.infer<typeof AgentTierSchema>;

export const AGENT_CAPABILITIES = ['figma', 'files', 'github', 'web'] as const;
export const AgentCapabilitySchema = z.enum(AGENT_CAPABILITIES);
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

export const AgentSchema = z.object({
  id: RegistryIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  model: z.string().min(1),
  tier: AgentTierSchema.default('balanced'),
  skills: z.array(RegistryIdSchema).default([]),
  capabilities: z.array(AgentCapabilitySchema).default([]),
});
export type Agent = z.infer<typeof AgentSchema>;

export function parseAgent(raw: unknown): Agent {
  return parseContract(AgentSchema, raw, 'Agent');
}

// ── Pipeline ───────────────────────────────────────────────────────

export const OnRejectSchema = z.object({
  rerun: RegistryIdSchema,
  withFeedback: z.boolean().default(true),
});
export type OnReject = z.infer<typeof OnRejectSchema>;

export const PipelineStepSchema = z
  .object({
    id: RegistryIdSchema,
    /** Absent only for a pure gate step (e.g. `human-review`) that runs no agent itself. */
    agent: RegistryIdSchema.optional(),
    skills: z.array(RegistryIdSchema).default([]),
    outputs: z.array(z.string()).default([]),
    autoReview: z.boolean().default(false),
    humanReview: z.boolean().default(false),
    onReject: OnRejectSchema.optional(),
    /**
     * Which {@link isHardGate}/`autonomy.ts` gate this step performs, if any
     * (`merge_default_branch`, `external_communication`,
     * `destructive_changes`, or a project-defined gate id). IMPLEMENT.md §2
     * step 5: "Hard/human gate không mode nào vượt được" — enforced right
     * here at the schema level (see the `.refine` below), not left to a
     * runtime check that a misconfigured pipeline could skip.
     */
    gate: GateKindSchema.optional(),
  })
  .refine((step) => !step.gate || !isHardGate(step.gate) || step.humanReview, {
    message: 'A step on a hard gate (destructive_changes/merge_default_branch/external_communication) must have humanReview: true — no mode may bypass it.',
    path: ['humanReview'],
  });
export type PipelineStep = z.infer<typeof PipelineStepSchema>;

/** IMPLEMENT.md §1: `bundled` ships with the extension, `project` is a versioned copy checked into `.aidlc/pipelines`, `user` is authored ad hoc for one epic. */
export const PIPELINE_SOURCES = ['bundled', 'project', 'user'] as const;
export const PipelineSourceSchema = z.enum(PIPELINE_SOURCES);
export type PipelineSource = z.infer<typeof PipelineSourceSchema>;

export const PipelineSchema = z.object({
  id: RegistryIdSchema,
  source: PipelineSourceSchema,
  version: z.string().min(1),
  steps: z.array(PipelineStepSchema).min(1),
});
export type Pipeline = z.infer<typeof PipelineSchema>;

export function parsePipeline(raw: unknown): Pipeline {
  return parseContract(PipelineSchema, raw, 'Pipeline');
}

// ── validate() error taxonomy (IMPLEMENT.md §2, step 2) ───────────

export const REGISTRY_ISSUE_KINDS = [
  'duplicate-id',
  'missing-skill',
  'missing-agent',
  'no-human-review-step',
] as const;
export const RegistryIssueKindSchema = z.enum(REGISTRY_ISSUE_KINDS);
export type RegistryIssueKind = z.infer<typeof RegistryIssueKindSchema>;

export interface RegistryIssue {
  kind: RegistryIssueKind;
  /** `pipeline:<id>`, `agent:<id>`, or `skill:<id>` — the entity the issue was found on. */
  entity: string;
  /** For `missing-skill`/`missing-agent`/`duplicate-id`, the referenced id that's missing/duplicated. */
  ref?: string;
  /** For step-level issues, the offending step id within the pipeline. */
  stepId?: string;
  message: string;
}

// ── PipelineRun (IMPLEMENT.md §1 StepState, §2 step 4) ─────────────

/**
 * One epic's progress through one registry `Pipeline`. Deliberately separate
 * from `Epic`/`EpicRun`/`Stage`/`Action` (`epic.ts`/`run.ts`/`stage.ts`) —
 * those model the fixed 5-phase SDLC (`understand`/`plan`/`build`/`verify`/
 * `ship`) compiled from a `WorkflowPack`; a registry `Pipeline` has arbitrary
 * author-defined step ids (e.g. `design-analyzer`), so it gets its own small
 * projection rather than being forced into `StageId`'s closed vocabulary.
 */
export const STEP_RUN_STATUSES = ['awaiting-work', 'running', 'auto-review', 'human-review', 'done', 'failed'] as const;
export const StepRunStatusSchema = z.enum(STEP_RUN_STATUSES);
export type StepRunStatus = z.infer<typeof StepRunStatusSchema>;

export const StepRunSchema = z.object({
  id: RegistryIdSchema,
  status: StepRunStatusSchema,
  /** Bumped each time this step is (re)run; carried into the slash-command prompt so agents can tell a rerun from a first run. */
  attempt: z.number().int().positive().default(1),
  /** Present after a reject — the reviewer's reason, carried forward to the rerun. */
  feedback: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
});
export type StepRun = z.infer<typeof StepRunSchema>;

export const PipelineRunSchema = z
  .object({
    schemaVersion: z.literal(1),
    epicId: z.string().min(1),
    pipelineId: RegistryIdSchema,
    pipelineVersion: z.string().min(1),
    steps: z.array(StepRunSchema).min(1),
    /** Optimistic-concurrency guard, same convention as `Epic.revision`/`EpicRun.revision`. */
    revision: z.number().int().nonnegative(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .refine((run) => new Set(run.steps.map((s) => s.id)).size === run.steps.length, {
    message: 'Step ids must be unique within a PipelineRun',
    path: ['steps'],
  });
export type PipelineRun = z.infer<typeof PipelineRunSchema>;

export function parsePipelineRun(raw: unknown): PipelineRun {
  return parseContract(PipelineRunSchema, raw, 'PipelineRun');
}

/** One append-only entry in a `PipelineRun`'s event log — mirrors `RunEvent`'s shape (`run.ts`) for the same reasons. */
export const PipelineRunEventSchema = z.object({
  schemaVersion: z.literal(1),
  at: z.string().min(1),
  actor: z.object({ kind: z.enum(['user', 'agent', 'system']), id: z.string().min(1), label: z.string().optional() }),
  command: z.string().min(1),
  stepId: RegistryIdSchema.optional(),
  from: StepRunStatusSchema.optional(),
  to: StepRunStatusSchema.optional(),
  detail: z.string().optional(),
});
export type PipelineRunEvent = z.infer<typeof PipelineRunEventSchema>;

export function parsePipelineRunEvent(raw: unknown): PipelineRunEvent {
  return parseContract(PipelineRunEventSchema, raw, 'PipelineRunEvent');
}
