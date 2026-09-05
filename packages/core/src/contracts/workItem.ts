import { z } from 'zod';

import { IsoTimestampSchema, parseContract } from './common';
import { EpicIdSchema, toEpicId } from './ids';
import { EpicTypeSchema } from './epic';

/** A product request before (and while) it becomes delivery work. */
export const WORK_ITEM_STATUSES = ['draft', 'ready', 'active', 'completed', 'cancelled'] as const;
export const WorkItemStatusSchema = z.enum(WORK_ITEM_STATUSES);
export type WorkItemStatus = z.infer<typeof WorkItemStatusSchema>;

export const WorkItemPrioritySchema = z.enum(['critical', 'high', 'normal', 'low']).default('normal');
export type WorkItemPriority = z.infer<typeof WorkItemPrioritySchema>;

export const WorkItemRequirementSchema = z.object({
  /** Problem to solve or desired outcome. */
  outcome: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).default([]),
  inScope: z.array(z.string().min(1)).default([]),
  outOfScope: z.array(z.string().min(1)).default([]),
  links: z.array(z.string().min(1)).default([]),
});
export type WorkItemRequirement = z.infer<typeof WorkItemRequirementSchema>;

/** Context pinned when the request was understood, so later code drift is visible. */
export const WorkItemContextRefSchema = z.object({
  discoverRevision: z.number().int().nonnegative().optional(),
  source: z.array(z.object({
    path: z.string().min(1),
    head: z.string(),
    ref: z.string(),
  })).default([]),
  capturedAt: IsoTimestampSchema,
});
export type WorkItemContextRef = z.infer<typeof WorkItemContextRefSchema>;

export const WorkItemImpactStatusSchema = z.enum(['not-analyzed', 'proposed', 'confirmed']);
export type WorkItemImpactStatus = z.infer<typeof WorkItemImpactStatusSchema>;

/** References into the shared Project Context that this change is allowed to affect. */
export const WorkItemImpactSchema = z.object({
  status: WorkItemImpactStatusSchema.default('not-analyzed'),
  contextIds: z.array(z.string().min(1)).default([]),
  symbols: z.array(z.string().min(1)).default([]),
  risks: z.array(z.string().min(1)).default([]),
  analyzedAt: IsoTimestampSchema.optional(),
  confirmedAt: IsoTimestampSchema.optional(),
});
export type WorkItemImpact = z.infer<typeof WorkItemImpactSchema>;

/** A reviewable change to project context generated after delivery, never an implicit full re-scan. */
export const WorkItemContextPatchSchema = z.object({
  status: z.enum(['proposed', 'applied']),
  contextIds: z.array(z.string().min(1)).min(1),
  summary: z.string().min(1),
  createdAt: IsoTimestampSchema,
  appliedAt: IsoTimestampSchema.optional(),
});
export type WorkItemContextPatch = z.infer<typeof WorkItemContextPatchSchema>;

export const WorkItemSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^WORK-[A-Z0-9][A-Z0-9-]*$/, 'Must match WORK-<SLUG>'),
  title: z.string().min(1),
  type: EpicTypeSchema,
  priority: WorkItemPrioritySchema,
  status: WorkItemStatusSchema,
  requirement: WorkItemRequirementSchema,
  context: WorkItemContextRefSchema.optional(),
  impact: WorkItemImpactSchema.default({ status: 'not-analyzed', contextIds: [], symbols: [], risks: [] }),
  /** Set after the request is promoted into the unified delivery lifecycle. */
  epicId: EpicIdSchema.optional(),
  contextPatch: WorkItemContextPatchSchema.optional(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
  revision: z.number().int().nonnegative(),
});
export type WorkItem = z.infer<typeof WorkItemSchema>;

export function parseWorkItem(raw: unknown): WorkItem {
  return parseContract(WorkItemSchema, raw, 'WorkItem');
}

/** Keep the compiler honest when an Epic id is attached by a caller. */
export function normalizeWorkItemEpicId(value: string): z.infer<typeof EpicIdSchema> {
  return toEpicId(value.trim().toUpperCase());
}
