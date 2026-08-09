/**
 * The typed application command surface (design doc §2.1, §5): "Moi command
 * tra ve typed result gom status, nextAction, evidence, warnings va
 * recoveryActions." CLI, the Claude `/aidlc` command, and the extension are
 * all meant to call the SAME command bus (a later wave, W2A) through this
 * envelope — this file freezes the envelope shape, not any specific
 * command's payload (those are owned by whichever later wave registers the
 * command name).
 */

import { z } from 'zod';
import { ActorRefSchema, EvidenceRefSchema, IsoTimestampSchema, parseContract } from './common';
import { AidlcErrorSchema, RecoveryActionSchema } from './errors';

/** Dotted lowercase command name, e.g. `epic.start`, `project.analyze`, `gate.approve` (design doc §5). */
export const COMMAND_NAME_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;

export const CommandNameSchema = z
  .string()
  .regex(COMMAND_NAME_PATTERN, 'Must be a dotted lowercase command name, e.g. "epic.start"');

// ── ApplicationCommand ─────────────────────────────────────────────

export const ApplicationCommandEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  /** Unique invocation id — used for idempotency/tracing and to correlate the matching `CommandResult`. */
  id: z.string().min(1),
  name: CommandNameSchema,
  issuedAt: IsoTimestampSchema,
  actor: ActorRefSchema,
  /** Command-specific payload; shape is owned by whichever later wave registers `name` (W2A) — validated here only as "present", not by shape. */
  payload: z.unknown(),
});
type ApplicationCommandEnvelope = z.infer<typeof ApplicationCommandEnvelopeSchema>;

/** Generic envelope with a caller-supplied payload type for compile-time ergonomics; `parseApplicationCommand` validates the envelope only (payload shape is command-specific and out of scope for W0). */
export type ApplicationCommand<Payload = unknown> = Omit<ApplicationCommandEnvelope, 'payload'> & {
  payload: Payload;
};

export function parseApplicationCommand(raw: unknown): ApplicationCommand {
  return parseContract(ApplicationCommandEnvelopeSchema, raw, 'ApplicationCommand') as ApplicationCommand;
}

// ── NextAction ─────────────────────────────────────────────────────

export const NextActionSchema = z.object({
  /** Human-readable description of what to do next, e.g. "Review the generated plan". */
  summary: z.string().min(1),
  /** Suggested `ApplicationCommand.name` to invoke next, when the next step is directly actionable. */
  command: CommandNameSchema.optional(),
  reason: z.string().optional(),
});
export type NextAction = z.infer<typeof NextActionSchema>;

// ── CommandResult ──────────────────────────────────────────────────

export const COMMAND_OUTCOME_STATUSES = ['ok', 'waiting-for-user', 'blocked', 'error'] as const;
export const CommandOutcomeStatusSchema = z.enum(COMMAND_OUTCOME_STATUSES);
export type CommandOutcomeStatus = z.infer<typeof CommandOutcomeStatusSchema>;

export const CommandResultEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  /** Correlates to the `ApplicationCommand.id` this result answers. */
  commandId: z.string().min(1),
  status: CommandOutcomeStatusSchema,
  /** Command-specific response payload. */
  data: z.unknown().optional(),
  nextAction: NextActionSchema.optional(),
  evidence: z.array(EvidenceRefSchema).default([]),
  warnings: z.array(z.string()).default([]),
  recoveryActions: z.array(RecoveryActionSchema).default([]),
  error: AidlcErrorSchema.optional(),
});
type CommandResultEnvelope = z.infer<typeof CommandResultEnvelopeSchema>;

export type CommandResult<Data = unknown> = Omit<CommandResultEnvelope, 'data'> & { data?: Data };

export function parseCommandResult(raw: unknown): CommandResult {
  return parseContract(CommandResultEnvelopeSchema, raw, 'CommandResult') as CommandResult;
}
