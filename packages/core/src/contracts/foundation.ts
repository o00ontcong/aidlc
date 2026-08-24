import { z } from 'zod';

import { IsoTimestampSchema, parseContract } from './common';

export const FOUNDATION_STATUSES = ['incomplete', 'ready', 'stale'] as const;
export const FoundationStatusSchema = z.enum(FOUNDATION_STATUSES);
export type FoundationStatus = z.infer<typeof FoundationStatusSchema>;

export const FoundationDocumentSchema = z.object({
  id: z.enum(['agents', 'project', 'status', 'decisions']),
  path: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i, 'Must be a SHA-256 hash'),
});
export type FoundationDocument = z.infer<typeof FoundationDocumentSchema>;

/** A compact, immutable reference to the project context a Shape was discussed against. */
export const FoundationSnapshotSchema = z.object({
  revision: z.number().int().nonnegative(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i, 'Must be a SHA-256 hash'),
  sourceCommit: z.string().min(1).optional(),
  publishedAt: IsoTimestampSchema,
});
export type FoundationSnapshot = z.infer<typeof FoundationSnapshotSchema>;

/**
 * The Foundation manifest references canonical project documents; it never
 * copies them. Hashes make an accepted Shape auditable even after the project
 * context changes.
 */
export const ProjectFoundationSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  status: FoundationStatusSchema,
  documents: z.array(FoundationDocumentSchema),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i, 'Must be a SHA-256 hash'),
  sourceCommit: z.string().min(1).optional(),
  publishedAt: IsoTimestampSchema,
});
export type ProjectFoundation = z.infer<typeof ProjectFoundationSchema>;

export function parseProjectFoundation(raw: unknown): ProjectFoundation {
  return parseContract(ProjectFoundationSchema, raw, 'ProjectFoundation');
}
