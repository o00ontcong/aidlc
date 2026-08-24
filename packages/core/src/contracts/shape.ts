import { z } from 'zod';

import { ActorRefSchema, IsoTimestampSchema, parseContract } from './common';
import { FoundationSnapshotSchema } from './foundation';

export const SHAPE_STATUSES = ['draft', 'exploring', 'ready', 'accepted', 'converted', 'shelved'] as const;
export const ShapeStatusSchema = z.enum(SHAPE_STATUSES);
export type ShapeStatus = z.infer<typeof ShapeStatusSchema>;

export const ShapeOptionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  tradeoffs: z.array(z.string()),
});
export type ShapeOption = z.infer<typeof ShapeOptionSchema>;

export const ShapeAcceptanceSchema = z.object({
  acceptedAt: IsoTimestampSchema,
  acceptedBy: ActorRefSchema.refine((actor) => actor.kind === 'user', 'Only a human user may accept a Shape'),
  acceptedRevision: z.number().int().nonnegative(),
  shapeHash: z.string().regex(/^[a-f0-9]{64}$/i, 'Must be a SHA-256 hash'),
});
export type ShapeAcceptance = z.infer<typeof ShapeAcceptanceSchema>;

export const ShapeConversionSchema = z.object({
  epicId: z.string().min(1),
  state: z.enum(['pending', 'completed']),
  startedAt: IsoTimestampSchema,
  completedAt: IsoTimestampSchema.optional(),
});
export type ShapeConversion = z.infer<typeof ShapeConversionSchema>;

/**
 * A pre-Epic, user-owned decision record. The Shape has no source file paths
 * and no generic write capability: it can only become a delivery Epic after a
 * human acceptance.
 */
export const ShapeSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^SHAPE-\d{3,}$/),
  title: z.string().min(1),
  status: ShapeStatusSchema,
  problem: z.string(),
  desiredOutcome: z.string(),
  appetite: z.string(),
  constraints: z.array(z.string()),
  options: z.array(ShapeOptionSchema),
  selectedApproach: z.string(),
  rationale: z.string(),
  risks: z.array(z.string()),
  noGos: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  architectureImpact: z.string(),
  openQuestions: z.array(z.string()),
  foundation: FoundationSnapshotSchema,
  providerSession: z.object({ providerId: z.string().min(1), sessionId: z.string().min(1) }).optional(),
  acceptance: ShapeAcceptanceSchema.optional(),
  conversion: ShapeConversionSchema.optional(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
  revision: z.number().int().nonnegative(),
}).superRefine((shape, ctx) => {
  if ((shape.status === 'accepted' || shape.status === 'converted') && !shape.acceptance) {
    ctx.addIssue({ code: 'custom', path: ['acceptance'], message: 'An accepted or converted Shape must have human acceptance.' });
  }
  if (shape.status === 'converted' && shape.conversion?.state !== 'completed') {
    ctx.addIssue({ code: 'custom', path: ['conversion'], message: 'A converted Shape must have a completed conversion.' });
  }
});
export type Shape = z.infer<typeof ShapeSchema>;

export const ShapeEventSchema = z.object({
  id: z.string().min(1),
  at: IsoTimestampSchema,
  type: z.enum(['created', 'updated', 'ready', 'accepted', 'reopened', 'shelved', 'conversion-pending', 'converted']),
  actor: ActorRefSchema,
  revision: z.number().int().nonnegative(),
  detail: z.string().optional(),
});
export type ShapeEvent = z.infer<typeof ShapeEventSchema>;

export function parseShape(raw: unknown): Shape {
  return parseContract(ShapeSchema, raw, 'Shape');
}

export function parseShapeEvent(raw: unknown): ShapeEvent {
  return parseContract(ShapeEventSchema, raw, 'ShapeEvent');
}
