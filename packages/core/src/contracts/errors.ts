/**
 * Structured errors + recovery actions (design doc §8.2; TODO W1G: "Structured
 * errors luon co code, summary, detail va recovery actions").
 *
 * Every error surfaced to a human must carry a machine-checkable `code`, a
 * one-line `summary`, and a set of {@link RecoveryAction}s like `Retry`,
 * `Apply fix`, `Open diff`, `Change policy`, `Skip with reason` — never a
 * raw exception. `AidlcError` is the value embedded in `CommandResult.error`
 * (see `command.ts`) and, optionally, in a `RunEvent`'s `detail`; it is a
 * plain nested value object (no `schemaVersion` of its own — see the note in
 * `common.ts`).
 */

import { z } from 'zod';
import { IsoTimestampSchema, parseContract } from './common';

// ── ErrorCode ──────────────────────────────────────────────────────

/**
 * Dotted, lowercase `<domain>.<reason>` identifier, e.g. `epic.not_found`,
 * `gate.blocked`. Intentionally open-ended — later waves add their own
 * codes for modules that don't exist yet at W0 — but format-checked so
 * every code stays greppable and consistent.
 */
export type ErrorCode = string;

export const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export const ErrorCodeSchema = z
  .string()
  .regex(ERROR_CODE_PATTERN, 'Must be a dotted lowercase code, e.g. "epic.not_found"');

/** Starter vocabulary for invariants this W0 contract layer itself enforces. Not a closed list — later waves add their own. */
export const CORE_ERROR_CODES = {
  EPIC_NOT_FOUND: 'epic.not_found',
  EPIC_DUPLICATE: 'epic.duplicate',
  EPIC_INVALID_TRANSITION: 'epic.invalid_transition',
  GATE_BLOCKED: 'gate.blocked',
  CONTRACT_SCHEMA_MISMATCH: 'contract.schema_mismatch',
  PROVIDER_UNAVAILABLE: 'provider.unavailable',
} as const satisfies Record<string, ErrorCode>;

// ── RecoveryAction ─────────────────────────────────────────────────

export const RECOVERY_ACTION_KINDS = [
  'retry',
  'apply-fix',
  'open-diff',
  'change-policy',
  'skip-with-reason',
  'ask-user',
  'refresh-context',
  'escalate',
] as const;

export const RecoveryActionSchema = z.object({
  kind: z.enum(RECOVERY_ACTION_KINDS),
  /** Display label, e.g. "Retry". */
  label: z.string().min(1),
  description: z.string().optional(),
  /** `ApplicationCommand.name` to invoke when the user picks this action. */
  command: z.string().optional(),
  /** True when the UI must collect a free-text reason before invoking `command` (e.g. `skip-with-reason`). */
  requiresReason: z.boolean().optional(),
});
export type RecoveryAction = z.infer<typeof RecoveryActionSchema>;

// ── AidlcError ─────────────────────────────────────────────────────

export const AidlcErrorSchema = z.object({
  code: ErrorCodeSchema,
  /** One-line, user-facing summary — never a raw exception message. */
  summary: z.string().min(1),
  /** Longer explanation / raw diagnostic, shown only in "advanced details". */
  detail: z.string().optional(),
  recoveryActions: z.array(RecoveryActionSchema).default([]),
  at: IsoTimestampSchema,
});
export type AidlcError = z.infer<typeof AidlcErrorSchema>;

export function parseAidlcError(raw: unknown): AidlcError {
  return parseContract(AidlcErrorSchema, raw, 'AidlcError');
}