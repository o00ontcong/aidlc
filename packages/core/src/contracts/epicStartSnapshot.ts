/**
 * `EpicStartSnapshot` — the immutable record an Epic pins the moment
 * `change.epic.start` succeeds (plan §18.3): the exact Change/Shape/
 * ScopeAnalysis/Context/source state delivery began from, so a later edit
 * to any of those never retroactively changes what this Epic started with.
 *
 * Scope note: lives at `.aidlc/epics/<EPIC-ID>/start.json`, a sibling of the
 * *unmodified* `state.json` `epic/EpicStore.ts` already owns. This session
 * does not touch `contracts/epic.ts`/`EpicSchema` at all — see
 * `change/ChangeEpicCoordinator.ts`'s module doc for the reasoning (the
 * existing Epic contract has ~90 tests and zero extension callers today;
 * bumping it to a discriminated v1/v2 union is real, separate surgery this
 * milestone does not need to risk). Everything §18.3 puts on `EpicV2`
 * (`sourceChange`, `startSnapshotHash`, `artifactRoot`) is fully
 * reconstructable from this file plus the Change's own `epicLink` —
 * nothing here duplicates onto the Epic record itself yet.
 */

import { z } from 'zod';

import { ActorRefSchema, IsoTimestampSchema, parseContract } from './common';
import { ChangeRequirementSchema, ChangeShapeSchema, ChangeTypeSchema, ExternalReferenceSchema, ScopeAnalysisSchema } from './change';
import { SourceSnapshotSchema } from './contextProposal';
import { Sha256HexSchema, sha256Hex } from './hash';
import { ChangeIdSchema, ContextRevisionIdSchema, EpicIdSchema } from './ids';

export const EPIC_START_PIPELINE_RUN_MODES = ['guided', 'autonomous'] as const;
export const EpicStartPipelineRunModeSchema = z.enum(EPIC_START_PIPELINE_RUN_MODES);
export type EpicStartPipelineRunMode = z.infer<typeof EpicStartPipelineRunModeSchema>;

export const EpicStartSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  commandId: z.string().min(1),
  epicId: EpicIdSchema,
  change: z.object({
    id: ChangeIdSchema,
    revision: z.number().int().nonnegative(),
    contentHash: Sha256HexSchema,
    title: z.string().min(1),
    type: ChangeTypeSchema,
    requirement: ChangeRequirementSchema,
    externalRefs: z.array(ExternalReferenceSchema).default([]),
  }),
  shape: ChangeShapeSchema.optional(),
  scopeAnalysis: ScopeAnalysisSchema.optional(),
  context: z.object({
    baseRevisionId: ContextRevisionIdSchema,
    baseRootHash: Sha256HexSchema,
    entityObjectHashes: z.record(z.string(), Sha256HexSchema).default({}),
    contextSliceHash: Sha256HexSchema,
  }),
  pipeline: z.object({
    id: z.string().min(1),
    runMode: EpicStartPipelineRunModeSchema,
    extraProjects: z.array(z.string().min(1)).default([]),
  }),
  source: SourceSnapshotSchema,
  createdAt: IsoTimestampSchema,
  createdBy: ActorRefSchema.refine((actor) => actor.kind === 'user', 'Only a human user may start an Epic'),
});
export type EpicStartSnapshot = z.infer<typeof EpicStartSnapshotSchema>;

/** No self-referential hash field lives inside this immutable file — the hash of the whole file is what the Change's `epicLink.changeSnapshotHash` pins. */
export function computeEpicStartSnapshotHash(snapshot: EpicStartSnapshot): string {
  return sha256Hex(snapshot);
}

export function parseEpicStartSnapshot(raw: unknown): EpicStartSnapshot {
  return parseContract(EpicStartSnapshotSchema, raw, 'EpicStartSnapshot');
}
