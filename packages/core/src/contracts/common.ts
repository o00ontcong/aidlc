/**
 * Small shared value types used across every contract file: timestamps,
 * "who did this" ({@link ActorRef}), "proof this happened"
 * ({@link EvidenceRef}), and the shared parse/validation helper every root
 * contract's `parseXxx` function is built on.
 *
 * Neither `ActorRef` nor `EvidenceRef` carries its own `schemaVersion` —
 * they are always embedded inside a versioned root (`Epic`, `EpicRun`,
 * `RunEvent`, `CommandResult`, ...) and evolve implicitly with that root's
 * version. This mirrors the existing convention in `runs/RunState.ts`
 * (`StepRecord`, `AutoReviewVerdict`, `StepHistoryEntry` carry no version of
 * their own — only the top-level `RunState.schemaVersion` does) and in
 * `delivery/DeliveryTypes.ts` (`DeliveryEvent`, `DeliveryReviewTask` likewise
 * unversioned under `DeliveryState.schemaVersion`).
 */

import { z } from 'zod';

// ── Timestamps ─────────────────────────────────────────────────────

/** ISO-8601 timestamp with an explicit offset (`Z` or `+HH:MM`/`-HH:MM`). */
export type IsoTimestamp = string;

export const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

export const IsoTimestampSchema = z
  .string()
  .regex(ISO_TIMESTAMP_PATTERN, 'Must be an ISO-8601 timestamp with a Z or +HH:MM/-HH:MM offset');

export function isIsoTimestamp(value: string): value is IsoTimestamp {
  return ISO_TIMESTAMP_PATTERN.test(value);
}

/** Current time as an {@link IsoTimestamp}. Thin wrapper so call sites read intent, not `Date` mechanics. */
export function nowIso(): IsoTimestamp {
  return new Date().toISOString();
}

// ── ActorRef ───────────────────────────────────────────────────────

export const ACTOR_KINDS = ['user', 'agent', 'system'] as const;
export const ActorKindSchema = z.enum(ACTOR_KINDS);
export type ActorKind = z.infer<typeof ActorKindSchema>;

export const ActorRefSchema = z.object({
  kind: ActorKindSchema,
  /** Free-form id within the kind — a username/email, an agent role id, or a component name. */
  id: z.string().min(1),
  /** Optional display label. */
  label: z.string().optional(),
});
export type ActorRef = z.infer<typeof ActorRefSchema>;

/** Compact `kind:id` form used in event-log YAML (design doc §11 example: `actor: agent:senior-ios-developer`). */
export function formatActorRef(actor: ActorRef): string {
  return `${actor.kind}:${actor.id}`;
}

const ACTOR_REF_STRING_PATTERN = /^(user|agent|system):(.+)$/;

/** Parse the compact `kind:id` form back into an {@link ActorRef}. Throws on a malformed string. */
export function parseActorRefString(value: string): ActorRef {
  const match = ACTOR_REF_STRING_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Invalid actor reference "${value}" — expected "<user|agent|system>:<id>"`);
  }
  return { kind: match[1] as ActorKind, id: match[2] };
}

// ── EvidenceRef ────────────────────────────────────────────────────

/** Well-known evidence kinds seen in the design doc's examples. Not a closed set — agents/validators may record any kind. */
export const WELL_KNOWN_EVIDENCE_KINDS = [
  'git-diff',
  'git-commit',
  'test',
  'file',
  'command-output',
  'external-link',
  'artifact',
] as const;

export const EvidenceRefSchema = z.object({
  /** e.g. `git-diff`, `test`; extensible beyond {@link WELL_KNOWN_EVIDENCE_KINDS}. */
  kind: z.string().min(1),
  /** The evidence payload identifier — a sha256, a test name, a file path, a URL, ... */
  ref: z.string().min(1),
  /** Optional outcome captured at evidence time, e.g. `passed`/`failed`. */
  status: z.string().optional(),
  /** Optional human-readable label. */
  label: z.string().optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

/**
 * Compact `kind:ref[:status]` form matching the design doc's event example
 * (`test:xcodebuild-test:passed`, `git-diff:sha256:...`). One-way: a
 * formatter only, not guaranteed losslessly parseable back — `ref` itself
 * may contain `:` (as in the `git-diff` example), so there is no safe
 * generic inverse. The structured {@link EvidenceRef} is the source of
 * truth; this is a rendering convenience for YAML/log output.
 */
export function formatEvidenceRef(evidence: EvidenceRef): string {
  return evidence.status
    ? `${evidence.kind}:${evidence.ref}:${evidence.status}`
    : `${evidence.kind}:${evidence.ref}`;
}

// ── Shared parse helper ────────────────────────────────────────────

/**
 * Thrown by every contract's `parseXxx` helper when a raw payload fails
 * schema validation. Mirrors `WorkspaceValidationError` in
 * `schema/WorkspaceSchema.ts` (same shape: message + zod issues + a
 * `contract` name standing in for that class's file `path`).
 */
export class ContractValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.core.$ZodIssue[],
    public readonly contract: string,
  ) {
    super(`[contract ${contract}] ${message}`);
    this.name = 'ContractValidationError';
  }
}

/** Parse `raw` against `schema`, throwing {@link ContractValidationError} (first few issues summarized) on failure. */
export function parseContract<T>(schema: z.ZodType<T>, raw: unknown, contractName: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const summary = result.error.issues
      .slice(0, 5)
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new ContractValidationError(`Invalid ${contractName}:\n${summary}`, result.error.issues, contractName);
  }
  return result.data;
}
