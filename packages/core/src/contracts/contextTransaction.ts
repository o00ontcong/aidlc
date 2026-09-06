/**
 * `.aidlc/transactions/TXN-<Ulid>/manifest.json` (implementation plan §9.3)
 * — the recoverable journal around the one genuinely multi-file step in a
 * Context Proposal Apply: re-rendering every affected managed Markdown file
 * after the canonical pointer (`current.json`) has already moved.
 *
 * Scope: the object/revision write and the `current.json` switch are each
 * already atomic and idempotent on their own (content-addressed immutable
 * writes; a single CAS file switch) — this manifest exists specifically so
 * a crash *during* the render fan-out can be resumed deterministically
 * (§9.3 step 7: "khong tu doan rollback sau khi canonical pointer da doi").
 */

import { z } from 'zod';

import { ActorRefSchema, IsoTimestampSchema, WorkspaceRelativePathSchema, parseContract } from './common';
import { ContextProposalIdSchema, ContextRevisionIdSchema, TransactionIdSchema } from './ids';

export const CONTEXT_APPLY_TRANSACTION_STATUSES = ['prepared', 'committed', 'aborted'] as const;
export const ContextApplyTransactionStatusSchema = z.enum(CONTEXT_APPLY_TRANSACTION_STATUSES);
export type ContextApplyTransactionStatus = z.infer<typeof ContextApplyTransactionStatusSchema>;

export const ContextApplyTransactionManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: TransactionIdSchema,
  proposalId: ContextProposalIdSchema,
  status: ContextApplyTransactionStatusSchema,
  beforeRevisionId: ContextRevisionIdSchema,
  afterRevisionId: ContextRevisionIdSchema,
  affectedDocumentPaths: z.array(WorkspaceRelativePathSchema),
  createdAt: IsoTimestampSchema,
  createdBy: ActorRefSchema,
});
export type ContextApplyTransactionManifest = z.infer<typeof ContextApplyTransactionManifestSchema>;

export function parseContextApplyTransactionManifest(raw: unknown): ContextApplyTransactionManifest {
  return parseContract(ContextApplyTransactionManifestSchema, raw, 'ContextApplyTransactionManifest');
}
