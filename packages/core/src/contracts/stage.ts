/**
 * Stage and Action — the visible-progress unit and its internal tasks
 * (design doc §2.2: "Stage: don vi tien do ma user nhin thay" / "Action: tac
 * vu noi bo cua stage, chi hien trong che do chi tiet").
 *
 * Both are nested value objects embedded inside `Epic.stages` (a read
 * projection) and `EpicRun.stages` (the authoritative in-progress copy while
 * a run is active) — see `epic.ts`/`run.ts`. Neither carries its own
 * `schemaVersion`; they evolve with whichever root embeds them.
 */

import { z } from 'zod';
import { StageIdSchema } from './stageId';
import { AutonomyModeSchema, GateKindSchema } from './autonomy';
import { EvidenceRefSchema, IsoTimestampSchema } from './common';
import { AidlcErrorSchema } from './errors';
import { ModelTierSchema } from './model';

// ── Action ─────────────────────────────────────────────────────────

export const ACTION_STATUSES = [
  'pending',
  'running',
  'waiting-for-user',
  'blocked',
  'paused',
  'completed',
  'failed',
  'skipped',
] as const;
export const ActionStatusSchema = z.enum(ACTION_STATUSES);
export type ActionStatus = z.infer<typeof ActionStatusSchema>;

export const ActionSchema = z.object({
  /** Unique within the owning stage; kebab-case, e.g. `implement-ios-alert`. */
  id: z.string().min(1),
  stageId: StageIdSchema,
  name: z.string().min(1),
  status: ActionStatusSchema,
  /** Capability id this action needs (design doc §6.2), if any — see `capability.ts`. */
  capability: z.string().optional(),
  modelTier: ModelTierSchema.optional(),
  /** Gate this action is subject to (design doc §4), if any. */
  gate: GateKindSchema.optional(),
  startedAt: IsoTimestampSchema.optional(),
  finishedAt: IsoTimestampSchema.optional(),
  evidence: z.array(EvidenceRefSchema).default([]),
  error: AidlcErrorSchema.optional(),
});
export type Action = z.infer<typeof ActionSchema>;

// ── Stage ──────────────────────────────────────────────────────────

export const STAGE_STATUSES = [
  'pending',
  'active',
  'waiting-for-user',
  'blocked',
  'paused',
  'completed',
  'skipped',
] as const;
export const StageStatusSchema = z.enum(STAGE_STATUSES);
export type StageStatus = z.infer<typeof StageStatusSchema>;

export const StageSchema = z
  .object({
    id: StageIdSchema,
    status: StageStatusSchema,
    /**
     * Autonomy mode this stage is executing under — resolved from
     * `AutonomyPolicy` (via `effectiveAutonomyMode`, see `autonomy.ts`) at
     * stage start and snapshotted here for audit, so a later policy change
     * doesn't retroactively rewrite what mode this stage actually ran under.
     */
    autonomy: AutonomyModeSchema,
    actions: z.array(ActionSchema).default([]),
    startedAt: IsoTimestampSchema.optional(),
    finishedAt: IsoTimestampSchema.optional(),
  })
  .refine((stage) => new Set(stage.actions.map((a) => a.id)).size === stage.actions.length, {
    message: 'Action ids must be unique within a stage',
    path: ['actions'],
  });
export type Stage = z.infer<typeof StageSchema>;
