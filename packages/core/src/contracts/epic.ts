/**
 * Epic — the single unified request/state entity (design doc §2.2, §11).
 *
 * Replaces the three overlapping state concepts the redesign is meant to
 * retire: `EpicScaffold`'s epic `state.json`, the pipeline `RunState`
 * machine, and the newer `DeliveryState`. Autonomous Delivery is no longer a
 * separate state machine — it becomes `profile`/`autonomy` choices on an
 * ordinary Epic (design doc §0.6).
 */

import { z } from 'zod';
import { EpicIdSchema, RunIdSchema } from './ids';
import { StageIdSchema } from './stageId';
import { StageSchema } from './stage';
import { AutonomyPolicySchema, PendingGateSchema } from './autonomy';
import { IsoTimestampSchema, parseContract } from './common';

// ── EpicType ───────────────────────────────────────────────────────

/** "mot feature, bug, refactor, spike hoac maintenance request" (design doc §2.2). */
export const EPIC_TYPES = ['feature', 'bug', 'refactor', 'spike', 'maintenance'] as const;
export const EpicTypeSchema = z.enum(EPIC_TYPES);
export type EpicType = z.infer<typeof EpicTypeSchema>;

// ── EpicProfile ────────────────────────────────────────────────────

/** Workflow compilation profile (design doc §3.1): Quick / Standard / Parallel / Regulated. */
export const EPIC_PROFILES = ['quick', 'standard', 'parallel', 'regulated'] as const;
export const EpicProfileSchema = z.enum(EPIC_PROFILES);
export type EpicProfile = z.infer<typeof EpicProfileSchema>;

// ── EpicStatus ─────────────────────────────────────────────────────

export const EPIC_STATUSES = [
  'draft',
  'ready',
  'running',
  'waiting-for-user',
  'blocked',
  'paused',
  'review',
  'shipping',
  'completed',
] as const;
export const EpicStatusSchema = z.enum(EPIC_STATUSES);
export type EpicStatus = z.infer<typeof EpicStatusSchema>;

/**
 * The unified Epic state machine (design doc §11). This is the ONLY status
 * vocabulary for an Epic — `Stage`/`Action` have their own substates
 * (`StageStatus`/`ActionStatus`, see `stage.ts`) but must never grow into a
 * second, competing top-level status. That competing-status pattern is
 * exactly the Epic/Run/Delivery overlap this redesign replaces (see
 * `EpicScaffold.ts` `EpicStatus`, `RunState.ts` `RunStatus`,
 * legacy delivery state — three separate vocabularies for
 * "how far along is this" today).
 *
 * The design doc's linear-with-fanout diagram doesn't spell out every edge
 * (e.g. does a paused Epic resume straight to `running`, or through
 * `review`?). This transition table is this contract's considered
 * interpretation of the intent — flag it in review if it should be tighter
 * or looser:
 *
 *   - the three interruption states (`waiting-for-user`, `blocked`,
 *     `paused`) all resume back to `running`;
 *   - `review` can bounce back to `running` (changes requested) as well as
 *     forward to `shipping`, or stall at `blocked`;
 *   - `shipping` can fail back to `blocked` (e.g. a failed release step);
 *   - `completed` is terminal — no further transitions.
 */
export const EPIC_STATUS_TRANSITIONS: Readonly<Record<EpicStatus, readonly EpicStatus[]>> = Object.freeze({
  draft: ['ready'],
  ready: ['running'],
  running: ['waiting-for-user', 'blocked', 'paused', 'review'],
  'waiting-for-user': ['running', 'blocked', 'paused'],
  blocked: ['running', 'paused'],
  paused: ['running'],
  review: ['shipping', 'running', 'blocked'],
  shipping: ['completed', 'blocked'],
  completed: [],
});

/** Is `from -> to` a legal Epic status transition per {@link EPIC_STATUS_TRANSITIONS}? */
export function isValidEpicTransition(from: EpicStatus, to: EpicStatus): boolean {
  return (EPIC_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

// ── Epic (root, durable) ───────────────────────────────────────────

export const EpicSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: EpicIdSchema,
    title: z.string().min(1),
    description: z.string(),
    type: EpicTypeSchema,
    profile: EpicProfileSchema,
    status: EpicStatusSchema,
    autonomy: AutonomyPolicySchema,
    /**
     * Denormalized mirror of the active run's stage/action progress — a
     * read projection, not a second source of truth. While `activeRunId`
     * points at a live `EpicRun` (see `run.ts`), that run is authoritative;
     * this field exists purely so `epic status`/`epic next` reads don't
     * need to load the run, mirroring the existing
     * `EpicScaffold.ts#mirrorRunStateToEpic` convention ("Mirror the live
     * RunState back into the epic's state.json ... RunState file remains
     * the source of truth").
     */
    stages: z.array(StageSchema).default([]),
    currentStageId: StageIdSchema.optional(),
    activeRunId: RunIdSchema.optional(),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
    /** Populated when `status === 'blocked'`. */
    blockedReason: z.string().optional(),
    /** Present only while a guarded action is waiting for a correlated user decision. */
    pendingGate: PendingGateSchema.optional(),
    /**
     * Optimistic-concurrency guard. Bump on every write; a writer that read
     * revision N must fail (not silently overwrite) if the file is now at a
     * revision > N (TODO W1A: "concurrent revision check").
     */
    revision: z.number().int().nonnegative(),
  })
  .refine((epic) => new Set(epic.stages.map((s) => s.id)).size === epic.stages.length, {
    message: 'Stage ids must be unique within an Epic',
    path: ['stages'],
  });
export type Epic = z.infer<typeof EpicSchema>;

export function parseEpic(raw: unknown): Epic {
  return parseContract(EpicSchema, raw, 'Epic');
}
