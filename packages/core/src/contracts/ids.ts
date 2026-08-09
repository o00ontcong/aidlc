/**
 * Identifier conventions for the unified AIDLC domain model (design doc §2.2,
 * §11; TODO W0 deliverable "Quy uoc ID: EPIC-*, run ID va event ID").
 *
 * Three identifier families are used across the durable contracts in this
 * directory:
 *
 *   - {@link EpicId}  — `EPIC-<slug>`, e.g. `EPIC-001`, `EPIC-2100`. The
 *     public-facing key for an Epic; stable for the Epic's whole lifetime.
 *     Matches every example in the design doc.
 *   - {@link RunId}   — `<EpicId>--run-<sequence>`, e.g. `EPIC-001--run-001`.
 *     An Epic can accumulate more than one run over its lifetime (a retry, a
 *     re-run after a rejected review, ...); encoding the owning Epic id in
 *     the run id keeps every run traceable back to its Epic without a join,
 *     and keeps the id filesystem-safe as its own path segment under
 *     `.aidlc/runs/<run-id>/` (design doc §7).
 *   - {@link EventId}  — `<RunId>--evt-<sequence>`, e.g.
 *     `EPIC-001--run-001--evt-0001`. One entry in a run's append-only event
 *     log (design doc §11); self-describing so a single event can be
 *     located/audited without the surrounding file.
 *
 * This widens rather than replaces the existing filesystem-safe id pattern
 * in `runs/RunStateStore.ts` (`RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/`,
 * whose own comment already anticipates `EPIC-2100`-style keys) — every
 * {@link EpicId} produced here also satisfies that legacy, looser pattern.
 *
 * Branding: each id is a plain `string` at runtime (JSON-serializes as-is,
 * no wrapper object) but carries a nominal TS brand so `EpicId`/`RunId`/
 * `EventId` aren't structurally interchangeable with each other or with a
 * bare `string` by accident. Construct via `toEpicId`/`toRunId`/`toEventId`
 * (throws on a malformed value), the `formatXxxId` builders, or the
 * `isXxxId` guards.
 */

import { z } from 'zod';

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ── Epic id ────────────────────────────────────────────────────────

export type EpicId = Brand<string, 'EpicId'>;

/**
 * `EPIC-` followed by one or more uppercase-alnum segments separated by `-`.
 * Covers both counter-style ids (`EPIC-001`, `EPIC-2100`) and slug-style ids
 * (`EPIC-ADD-PORTFOLIO-ALERTS`) so an id generator can pick either without a
 * contract change.
 */
export const EPIC_ID_PATTERN = /^EPIC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export function isEpicId(value: string): value is EpicId {
  return EPIC_ID_PATTERN.test(value);
}

export function toEpicId(value: string): EpicId {
  if (!isEpicId(value)) {
    throw new Error(`Invalid EpicId "${value}" — must match ${EPIC_ID_PATTERN}`);
  }
  return value;
}

export const EpicIdSchema = z
  .string()
  .regex(EPIC_ID_PATTERN, 'Must match EPIC-<UPPER-ALNUM segments separated by ->')
  .transform(toEpicId);

// ── Run id ─────────────────────────────────────────────────────────

export type RunId = Brand<string, 'RunId'>;

export const RUN_ID_PATTERN = /^EPIC-[A-Z0-9]+(?:-[A-Z0-9]+)*--run-[0-9]+$/;

export function isRunId(value: string): value is RunId {
  return RUN_ID_PATTERN.test(value);
}

export function toRunId(value: string): RunId {
  if (!isRunId(value)) {
    throw new Error(`Invalid RunId "${value}" — must match ${RUN_ID_PATTERN}`);
  }
  return value;
}

export const RunIdSchema = z
  .string()
  .regex(RUN_ID_PATTERN, 'Must match <EpicId>--run-<sequence>')
  .transform(toRunId);

/**
 * Build a {@link RunId} from an Epic id + a 1-based sequence number (padded
 * to 3 digits by convention — wider sequences still parse fine since
 * {@link RUN_ID_PATTERN} accepts any digit run).
 */
export function formatRunId(epicId: EpicId, sequence: number): RunId {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Run sequence must be a positive integer, got ${sequence}`);
  }
  return toRunId(`${epicId}--run-${String(sequence).padStart(3, '0')}`);
}

/** Extract the owning {@link EpicId} out of a {@link RunId}. Always succeeds for a well-formed RunId. */
export function epicIdOfRun(runId: RunId): EpicId {
  const idx = runId.indexOf('--run-');
  return toEpicId(runId.slice(0, idx));
}

// ── Event id ───────────────────────────────────────────────────────

export type EventId = Brand<string, 'EventId'>;

export const EVENT_ID_PATTERN = /^EPIC-[A-Z0-9]+(?:-[A-Z0-9]+)*--run-[0-9]+--evt-[0-9]+$/;

export function isEventId(value: string): value is EventId {
  return EVENT_ID_PATTERN.test(value);
}

export function toEventId(value: string): EventId {
  if (!isEventId(value)) {
    throw new Error(`Invalid EventId "${value}" — must match ${EVENT_ID_PATTERN}`);
  }
  return value;
}

export const EventIdSchema = z
  .string()
  .regex(EVENT_ID_PATTERN, 'Must match <RunId>--evt-<sequence>')
  .transform(toEventId);

/** Build an {@link EventId} from a Run id + a 1-based sequence number (padded to 4 digits by convention). */
export function formatEventId(runId: RunId, sequence: number): EventId {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Event sequence must be a positive integer, got ${sequence}`);
  }
  return toEventId(`${runId}--evt-${String(sequence).padStart(4, '0')}`);
}

/** Extract the owning {@link RunId} out of an {@link EventId}. Always succeeds for a well-formed EventId. */
export function runIdOfEvent(eventId: EventId): RunId {
  const idx = eventId.indexOf('--evt-');
  return toRunId(eventId.slice(0, idx));
}
