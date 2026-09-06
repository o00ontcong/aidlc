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

import * as crypto from 'crypto';

import { z } from 'zod';

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ── ULID ───────────────────────────────────────────────────────────
//
// Crockford Base32, 26 uppercase chars: 48-bit timestamp (10 chars) + 80-bit
// randomness (16 chars), monotonic within this process (implementation plan
// §18.2). Collision-safe across branches/processes without a shared counter
// (design doc §11, plan §D16) — every new Change/Epic/Run/proposal/event id
// introduced by the redesign is `<PREFIX>-<Ulid>` built on top of this.

const ULID_ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_TIME_LENGTH = 10;
const ULID_RANDOM_LENGTH = 16;
const ULID_RANDOM_BYTES = 10; // 80 bits
const ULID_MAX_RANDOM = (1n << 80n) - 1n;

export type Ulid = Brand<string, 'Ulid'>;

/** Crockford base32; the first char must be 0-7 so the 50-bit encoding never exceeds the 48-bit timestamp range. */
export const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z]{24}$/;

export function isUlid(value: string): value is Ulid {
  return ULID_PATTERN.test(value);
}

export function toUlid(value: string): Ulid {
  if (!isUlid(value)) {
    throw new Error(`Invalid ULID "${value}" — must match ${ULID_PATTERN}`);
  }
  return value;
}

export const UlidSchema = z.string().regex(ULID_PATTERN, 'Must be a 26-char Crockford-base32 ULID').transform(toUlid);

function encodeUlidTime(timeMs: number): string {
  if (!Number.isInteger(timeMs) || timeMs < 0 || timeMs > 0xffffffffffff) {
    throw new Error(`ULID timestamp out of range: ${timeMs}`);
  }
  let value = BigInt(timeMs);
  const chars = new Array<string>(ULID_TIME_LENGTH);
  for (let i = ULID_TIME_LENGTH - 1; i >= 0; i -= 1) {
    chars[i] = ULID_ENCODING[Number(value & 0x1fn)];
    value >>= 5n;
  }
  return chars.join('');
}

function encodeUlidRandom(value: bigint): string {
  let remaining = value;
  const chars = new Array<string>(ULID_RANDOM_LENGTH);
  for (let i = ULID_RANDOM_LENGTH - 1; i >= 0; i -= 1) {
    chars[i] = ULID_ENCODING[Number(remaining & 0x1fn)];
    remaining >>= 5n;
  }
  return chars.join('');
}

function randomBits80(): bigint {
  let value = 0n;
  for (const byte of crypto.randomBytes(ULID_RANDOM_BYTES)) value = (value << 8n) | BigInt(byte);
  return value;
}

let monotonicState: { timeMs: number; random: bigint } | null = null;

/**
 * Generate a ULID. Two calls landing in the same millisecond (within this
 * process) return strictly increasing ids by incrementing the random
 * component instead of redrawing it, per the monotonic rule in §18.2.
 */
export function generateUlid(now: number = Date.now()): Ulid {
  let random: bigint;
  if (monotonicState && monotonicState.timeMs === now) {
    random = monotonicState.random + 1n;
    if (random > ULID_MAX_RANDOM) {
      throw new Error('ULID random component overflowed within the same millisecond.');
    }
  } else {
    random = randomBits80();
  }
  monotonicState = { timeMs: now, random };
  return toUlid(encodeUlidTime(now) + encodeUlidRandom(random));
}

/** Decode the 48-bit timestamp out of a ULID. For diagnostics only — never use it to decide business ordering (§18.2). */
export function ulidTimeMs(value: Ulid | string): number {
  const ulid = toUlid(value);
  let value48 = 0n;
  for (let i = 0; i < ULID_TIME_LENGTH; i += 1) {
    value48 = (value48 << 5n) | BigInt(ULID_ENCODING.indexOf(ulid[i]));
  }
  return Number(value48);
}

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

// ── Pre-run Epic event id ──────────────────────────────────────────

export type EpicEventId = Brand<string, 'EpicEventId'>;
export const EPIC_EVENT_ID_PATTERN = /^EPIC-[A-Z0-9]+(?:-[A-Z0-9]+)*--evt-[0-9]+$/;
export function toEpicEventId(value: string): EpicEventId {
  if (!EPIC_EVENT_ID_PATTERN.test(value)) throw new Error(`Invalid EpicEventId "${value}" — must match ${EPIC_EVENT_ID_PATTERN}`);
  return value as EpicEventId;
}
export const EpicEventIdSchema = z.string().regex(EPIC_EVENT_ID_PATTERN, 'Must match <EpicId>--evt-<sequence>').transform(toEpicEventId);
export function formatEpicEventId(epicId: EpicId, sequence: number): EpicEventId {
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error(`Epic event sequence must be a positive integer, got ${sequence}`);
  return toEpicEventId(`${epicId}--evt-${String(sequence).padStart(4, '0')}`);
}

// ── ProjectChange domain ids ───────────────────────────────────────
//
// Each of these is `<PREFIX>-<Ulid>` (implementation plan §6.1, §18.2,
// §18.5) — collision-safe across branches without a shared `max + 1`
// counter (design doc §9 "Hai thanh vien tao Change cung luc", §D16).
//
// Hand-written per id (matching the EpicId/RunId/EventId shape above) rather
// than through a shared generic factory: a factory's local type parameter
// prevents `tsc` from naming the branded type back to its exported alias
// when emitting declarations (TS4023 — "has or is using name 'brand' ...
// but cannot be named"), since the printed type would be the factory's
// locally-scoped alias, not the top-level exported one.

export type ChangeId = Brand<string, 'ChangeId'>;
export const CHANGE_ID_PATTERN = /^CHG-[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
export function isChangeId(value: string): value is ChangeId {
  return CHANGE_ID_PATTERN.test(value);
}
export function toChangeId(value: string): ChangeId {
  if (!isChangeId(value)) throw new Error(`Invalid ChangeId "${value}" — must match ${CHANGE_ID_PATTERN}`);
  return value;
}
export const ChangeIdSchema = z.string().regex(CHANGE_ID_PATTERN, 'Must match CHG-<ULID>').transform(toChangeId);
export function generateChangeId(): ChangeId {
  return toChangeId(`CHG-${generateUlid()}`);
}

export type ContextRevisionId = Brand<string, 'ContextRevisionId'>;
export const CONTEXT_REVISION_ID_PATTERN = /^CTX-[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
export function isContextRevisionId(value: string): value is ContextRevisionId {
  return CONTEXT_REVISION_ID_PATTERN.test(value);
}
export function toContextRevisionId(value: string): ContextRevisionId {
  if (!isContextRevisionId(value)) throw new Error(`Invalid ContextRevisionId "${value}" — must match ${CONTEXT_REVISION_ID_PATTERN}`);
  return value;
}
export const ContextRevisionIdSchema = z.string().regex(CONTEXT_REVISION_ID_PATTERN, 'Must match CTX-<ULID>').transform(toContextRevisionId);
export function generateContextRevisionId(): ContextRevisionId {
  return toContextRevisionId(`CTX-${generateUlid()}`);
}

export type ContextProposalId = Brand<string, 'ContextProposalId'>;
export const CONTEXT_PROPOSAL_ID_PATTERN = /^CP-[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
export function isContextProposalId(value: string): value is ContextProposalId {
  return CONTEXT_PROPOSAL_ID_PATTERN.test(value);
}
export function toContextProposalId(value: string): ContextProposalId {
  if (!isContextProposalId(value)) throw new Error(`Invalid ContextProposalId "${value}" — must match ${CONTEXT_PROPOSAL_ID_PATTERN}`);
  return value;
}
export const ContextProposalIdSchema = z.string().regex(CONTEXT_PROPOSAL_ID_PATTERN, 'Must match CP-<ULID>').transform(toContextProposalId);
export function generateContextProposalId(): ContextProposalId {
  return toContextProposalId(`CP-${generateUlid()}`);
}

/** A Change's immutable `ScopeAnalysis` proposal id, `ANL-<Ulid>` (plan §6.1, §18.5). */
export type ScopeAnalysisId = Brand<string, 'ScopeAnalysisId'>;
export const SCOPE_ANALYSIS_ID_PATTERN = /^ANL-[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
export function isScopeAnalysisId(value: string): value is ScopeAnalysisId {
  return SCOPE_ANALYSIS_ID_PATTERN.test(value);
}
export function toScopeAnalysisId(value: string): ScopeAnalysisId {
  if (!isScopeAnalysisId(value)) throw new Error(`Invalid ScopeAnalysisId "${value}" — must match ${SCOPE_ANALYSIS_ID_PATTERN}`);
  return value;
}
export const ScopeAnalysisIdSchema = z.string().regex(SCOPE_ANALYSIS_ID_PATTERN, 'Must match ANL-<ULID>').transform(toScopeAnalysisId);
export function generateScopeAnalysisId(): ScopeAnalysisId {
  return toScopeAnalysisId(`ANL-${generateUlid()}`);
}

/** A Change's `ExternalReference.id`, `XREF-<Ulid>` (plan §18.5) — stable so Sprint placement can foreign-key it. */
export type ExternalRefId = Brand<string, 'ExternalRefId'>;
export const EXTERNAL_REF_ID_PATTERN = /^XREF-[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
export function isExternalRefId(value: string): value is ExternalRefId {
  return EXTERNAL_REF_ID_PATTERN.test(value);
}
export function toExternalRefId(value: string): ExternalRefId {
  if (!isExternalRefId(value)) throw new Error(`Invalid ExternalRefId "${value}" — must match ${EXTERNAL_REF_ID_PATTERN}`);
  return value;
}
export const ExternalRefIdSchema = z.string().regex(EXTERNAL_REF_ID_PATTERN, 'Must match XREF-<ULID>').transform(toExternalRefId);
export function generateExternalRefId(): ExternalRefId {
  return toExternalRefId(`XREF-${generateUlid()}`);
}

// ── Context Proposal domain ids (plan §18.2 "IDs moi") ─────────────

/** A `ContextProposal`'s dependency-safe review group, `GRP-<Ulid>` (§18.2, §D8). */
export type ContextGroupId = Brand<string, 'ContextGroupId'>;
export const CONTEXT_GROUP_ID_PATTERN = /^GRP-[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
export function isContextGroupId(value: string): value is ContextGroupId {
  return CONTEXT_GROUP_ID_PATTERN.test(value);
}
export function toContextGroupId(value: string): ContextGroupId {
  if (!isContextGroupId(value)) throw new Error(`Invalid ContextGroupId "${value}" — must match ${CONTEXT_GROUP_ID_PATTERN}`);
  return value;
}
export const ContextGroupIdSchema = z.string().regex(CONTEXT_GROUP_ID_PATTERN, 'Must match GRP-<ULID>').transform(toContextGroupId);
export function generateContextGroupId(): ContextGroupId {
  return toContextGroupId(`GRP-${generateUlid()}`);
}

/** One operation entry inside a `ContextProposal`, `OP-<Ulid>` (§18.2). */
export type ContextOperationId = Brand<string, 'ContextOperationId'>;
export const CONTEXT_OPERATION_ID_PATTERN = /^OP-[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
export function isContextOperationId(value: string): value is ContextOperationId {
  return CONTEXT_OPERATION_ID_PATTERN.test(value);
}
export function toContextOperationId(value: string): ContextOperationId {
  if (!isContextOperationId(value)) throw new Error(`Invalid ContextOperationId "${value}" — must match ${CONTEXT_OPERATION_ID_PATTERN}`);
  return value;
}
export const ContextOperationIdSchema = z.string().regex(CONTEXT_OPERATION_ID_PATTERN, 'Must match OP-<ULID>').transform(toContextOperationId);
export function generateContextOperationId(): ContextOperationId {
  return toContextOperationId(`OP-${generateUlid()}`);
}

/** A recorded human approval of a `ContextProposal` (or a subset of its groups), `APR-<Ulid>` (§18.2). */
export type ApprovalId = Brand<string, 'ApprovalId'>;
export const APPROVAL_ID_PATTERN = /^APR-[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
export function isApprovalId(value: string): value is ApprovalId {
  return APPROVAL_ID_PATTERN.test(value);
}
export function toApprovalId(value: string): ApprovalId {
  if (!isApprovalId(value)) throw new Error(`Invalid ApprovalId "${value}" — must match ${APPROVAL_ID_PATTERN}`);
  return value;
}
export const ApprovalIdSchema = z.string().regex(APPROVAL_ID_PATTERN, 'Must match APR-<ULID>').transform(toApprovalId);
export function generateApprovalId(): ApprovalId {
  return toApprovalId(`APR-${generateUlid()}`);
}

/** A multi-file `WorkspaceTransaction` journal entry (M2, §9.3), `TXN-<Ulid>` (§18.2). Defined now since §18.2 groups it with the other new ids; not yet consumed by this session's contracts. */
export type TransactionId = Brand<string, 'TransactionId'>;
export const TRANSACTION_ID_PATTERN = /^TXN-[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
export function isTransactionId(value: string): value is TransactionId {
  return TRANSACTION_ID_PATTERN.test(value);
}
export function toTransactionId(value: string): TransactionId {
  if (!isTransactionId(value)) throw new Error(`Invalid TransactionId "${value}" — must match ${TRANSACTION_ID_PATTERN}`);
  return value;
}
export const TransactionIdSchema = z.string().regex(TRANSACTION_ID_PATTERN, 'Must match TXN-<ULID>').transform(toTransactionId);
export function generateTransactionId(): TransactionId {
  return toTransactionId(`TXN-${generateUlid()}`);
}

/** A single immutable domain event file (§6.3, §D16), `EVT-<Ulid>` — distinct from the legacy pipeline {@link EventId} (`<RunId>--evt-<sequence>`), which stays read-only/parse-compatible. */
export type DomainEventId = Brand<string, 'DomainEventId'>;
export const DOMAIN_EVENT_ID_PATTERN = /^EVT-[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
export function isDomainEventId(value: string): value is DomainEventId {
  return DOMAIN_EVENT_ID_PATTERN.test(value);
}
export function toDomainEventId(value: string): DomainEventId {
  if (!isDomainEventId(value)) throw new Error(`Invalid DomainEventId "${value}" — must match ${DOMAIN_EVENT_ID_PATTERN}`);
  return value;
}
export const DomainEventIdSchema = z.string().regex(DOMAIN_EVENT_ID_PATTERN, 'Must match EVT-<ULID>').transform(toDomainEventId);
export function generateDomainEventId(): DomainEventId {
  return toDomainEventId(`EVT-${generateUlid()}`);
}

/** The workspace's immutable identity (`.aidlc/project.json`, §18.2), `PRJ-<Ulid>`. Not yet consumed by this session's contracts (bootstrap owns it, M4). */
export type ProjectId = Brand<string, 'ProjectId'>;
export const PROJECT_ID_PATTERN = /^PRJ-[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
export function isProjectId(value: string): value is ProjectId {
  return PROJECT_ID_PATTERN.test(value);
}
export function toProjectId(value: string): ProjectId {
  if (!isProjectId(value)) throw new Error(`Invalid ProjectId "${value}" — must match ${PROJECT_ID_PATTERN}`);
  return value;
}
export const ProjectIdSchema = z.string().regex(PROJECT_ID_PATTERN, 'Must match PRJ-<ULID>').transform(toProjectId);
export function generateProjectId(): ProjectId {
  return toProjectId(`PRJ-${generateUlid()}`);
}

// ── Epic/Run id generation for the new lifecycle (plan §18.3) ──────
//
// The *parsers* above (`isEpicId`/`isRunId`) are unchanged and stay
// read-compatible with every legacy id. Only new-write generation changes:
// no more `max + 1`.

/**
 * Default id for an Epic created by `change.epic.start`: `EPIC-<same ULID
 * suffix as the owning Change>` (§18.3) — collision-safe without a shared
 * counter, and trivially traceable back to its one owning Change (§D4). The
 * result already satisfies the legacy {@link EPIC_ID_PATTERN} (a ULID is
 * uppercase-alnum), so no parser change was needed for this to round-trip.
 */
export function epicIdFromChangeId(changeId: ChangeId): EpicId {
  const ulid = changeId.slice('CHG-'.length);
  return toEpicId(`EPIC-${ulid}`);
}

/**
 * The new Epic-execution Run entity's id (§18.3, §5.2 `.aidlc/runs/<RUN-ID>/`):
 * `RUN-<Ulid>`, always carrying its own `epicId` field rather than encoding
 * a sequence in the id. Deliberately a different brand/format from the
 * legacy {@link RunId} (`<EpicId>--run-<sequence>`, driven by
 * `RunStateStore`/`PipelineRunner`) — that pipeline-run concept is untouched
 * and keeps writing its own id shape; this is the new M3 Epic-run entity.
 */
export type LifecycleRunId = Brand<string, 'LifecycleRunId'>;
export const LIFECYCLE_RUN_ID_PATTERN = /^RUN-[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
export function isLifecycleRunId(value: string): value is LifecycleRunId {
  return LIFECYCLE_RUN_ID_PATTERN.test(value);
}
export function toLifecycleRunId(value: string): LifecycleRunId {
  if (!isLifecycleRunId(value)) throw new Error(`Invalid LifecycleRunId "${value}" — must match ${LIFECYCLE_RUN_ID_PATTERN}`);
  return value;
}
export const LifecycleRunIdSchema = z.string().regex(LIFECYCLE_RUN_ID_PATTERN, 'Must match RUN-<ULID>').transform(toLifecycleRunId);
export function generateLifecycleRunId(): LifecycleRunId {
  return toLifecycleRunId(`RUN-${generateUlid()}`);
}
