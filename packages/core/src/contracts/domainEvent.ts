/**
 * `DomainEvent` — one immutable audit entry per successful mutation (plan
 * §6.3, §D16). One file per event (`events/EVT-<Ulid>.json`), never
 * appended into a shared `events.ndjson` — that is exactly what lets two
 * branches record events without a merge conflict on the same file.
 * Shared across aggregate types (`change` today; `context-proposal` from
 * M4) rather than owned by `change.ts`, since both stores append the same
 * shape.
 */

import { z } from 'zod';

import { ActorRefSchema, IsoTimestampSchema, parseContract } from './common';
import { Sha256HexSchema } from './hash';
import { DomainEventIdSchema } from './ids';

export const DOMAIN_EVENT_AGGREGATE_TYPES = ['change', 'context-proposal'] as const;
export const DomainEventAggregateTypeSchema = z.enum(DOMAIN_EVENT_AGGREGATE_TYPES);
export type DomainEventAggregateType = z.infer<typeof DomainEventAggregateTypeSchema>;

export const DomainEventSchema = z.object({
  schemaVersion: z.literal(1),
  id: DomainEventIdSchema,
  aggregateType: DomainEventAggregateTypeSchema,
  aggregateId: z.string().min(1),
  /** Correlates to the `ApplicationCommand`/service-call that produced this event — the idempotency key a retry is matched against. */
  commandId: z.string().min(1),
  /** Dotted-lowercase event type, e.g. `change.created`, `change.shape.accepted`. */
  type: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z0-9]+)+$/, 'Must be a dotted lowercase event type'),
  actor: ActorRefSchema,
  at: IsoTimestampSchema,
  beforeHash: Sha256HexSchema.optional(),
  afterHash: Sha256HexSchema.optional(),
  /** Free-form structured detail (e.g. the result revision/hash used for idempotent replay); never raw file content or secrets. */
  evidence: z.record(z.string(), z.unknown()).optional(),
});
export type DomainEvent = z.infer<typeof DomainEventSchema>;

export function parseDomainEvent(raw: unknown): DomainEvent {
  return parseContract(DomainEventSchema, raw, 'DomainEvent');
}
