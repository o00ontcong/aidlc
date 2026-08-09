/**
 * EpicRun and RunEvent — one workflow execution, and its append-only audit
 * log (design doc §2.2, §11: "`state.json` la projection de doc nhanh; event
 * log moi la audit source").
 *
 * `EpicRun` is the fast-read projection (current stage/action snapshot);
 * `RunEvent` entries are the audit source. They are deliberately kept as two
 * separate contracts — `EpicRun` does NOT embed the event array — so the
 * projection stays small and cheap to read/write while the log can grow
 * without bound.
 */

import { z } from 'zod';
import { StageIdSchema } from './stageId';
import { EpicIdSchema, RunIdSchema, EventIdSchema } from './ids';
import { StageSchema } from './stage';
import { EpicProfileSchema, EpicStatusSchema } from './epic';
import { ActorRefSchema, EvidenceRefSchema, IsoTimestampSchema, parseContract } from './common';
import { CommandNameSchema } from './command';

// ── EpicRun (root, durable) ────────────────────────────────────────

export const EpicRunSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: RunIdSchema,
    epicId: EpicIdSchema,
    /** Deterministic hash of the compiled workflow this run executes (TODO W1E: "Deterministic compiled workflow hash"). Opaque here — computed by the workflow compiler in a later wave. */
    workflowHash: z.string().min(1),
    profile: EpicProfileSchema,
    /**
     * Reuses {@link EpicStatus} verbatim — a Run does NOT get its own status
     * vocabulary (see the note in `epic.ts`). While this run is the Epic's
     * active run, `Epic.status` mirrors this field exactly.
     */
    status: EpicStatusSchema,
    stages: z.array(StageSchema).default([]),
    startedAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
    completedAt: IsoTimestampSchema.optional(),
    /** Optimistic-concurrency guard, same convention as `Epic.revision`. */
    revision: z.number().int().nonnegative(),
  })
  .refine((run) => new Set(run.stages.map((s) => s.id)).size === run.stages.length, {
    message: 'Stage ids must be unique within an EpicRun',
    path: ['stages'],
  });
export type EpicRun = z.infer<typeof EpicRunSchema>;

export function parseEpicRun(raw: unknown): EpicRun {
  return parseContract(EpicRunSchema, raw, 'EpicRun');
}

// ── RunEvent (root, durable — per-record schemaVersion) ───────────

/**
 * One append-only entry in a run's event log (design doc §11 example:
 * `at`/`actor`/`command`/`epic`/`stage`/`action`/`from`/`to`/`evidence`).
 *
 * Unlike the other durable roots, `schemaVersion` here is a PER-RECORD tag
 * rather than a whole-file tag: the event log is appended to forever, so
 * events written under different schema versions can sit side by side in
 * the same log, and each one must self-identify rather than relying on a
 * single version stamped once at the top of the file.
 */
export const RunEventSchema = z.object({
  schemaVersion: z.literal(1),
  id: EventIdSchema,
  at: IsoTimestampSchema,
  actor: ActorRefSchema,
  epicId: EpicIdSchema,
  runId: RunIdSchema,
  /** The `ApplicationCommand.name` that produced this event, e.g. `aidlc.action.execute` — just its identifier (for audit), not the command payload itself. */
  command: CommandNameSchema,
  stageId: StageIdSchema.optional(),
  actionId: z.string().optional(),
  /**
   * Free-form prior/new sub-state. Deliberately untyped (not `StageStatus`/
   * `ActionStatus`) — the log records fine-grained execution phases (e.g.
   * `validating`, per the design doc's own example) that are transient and
   * never appear in the closed, durable status enums used by the
   * projections (`Epic`/`EpicRun`/`Stage`/`Action`).
   */
  from: z.string().optional(),
  to: z.string().optional(),
  evidence: z.array(EvidenceRefSchema).default([]),
  detail: z.string().optional(),
});
export type RunEvent = z.infer<typeof RunEventSchema>;

export function parseRunEvent(raw: unknown): RunEvent {
  return parseContract(RunEventSchema, raw, 'RunEvent');
}

/** An append-only run event log — just an array; the on-disk stream format (NDJSON, etc.) is a later wave's concern. */
export type RunEventLog = RunEvent[];
