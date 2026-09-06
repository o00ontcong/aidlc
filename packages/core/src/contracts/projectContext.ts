/**
 * The canonical, content-addressed Project Context (implementation plan
 * §10, §18.2) — structured state is truth; the 14 managed Markdown files
 * (`discover/DocSpec.ts`) are a deterministic *projection* rendered from it,
 * the reverse of today's direction (plan §10: "Hien tai DiscoverContextPublisher
 * xem Markdown la editable canonical source... Dich phai dao lai").
 *
 * Object identity: a `ContextObject` has no self-referential hash field —
 * unlike `ProjectChange`/`ChangeShape` (which pin their own `contentHash`
 * inline, and so need the defensive strip in `computeChangeContentHash`),
 * these are pure immutable values; the SHA-256 of the whole object *is* its
 * filename (`.aidlc/context/objects/<hash>.json`), computed once at write
 * time by whoever builds it, with nothing to exclude.
 */

import { z } from 'zod';

import { ActorRefSchema, IsoTimestampSchema, WorkspaceRelativePathSchema, parseContract } from './common';
import { ContextEntityKeySchema } from './contextProposal';
import { Sha256HexSchema, sha256Hex } from './hash';
import { ContextProposalIdSchema, ContextRevisionIdSchema, ProjectIdSchema } from './ids';

// ── ProjectIdentity (.aidlc/project.json, immutable) ──────────────

export const ProjectIdentitySchema = z.object({
  schemaVersion: z.literal(1),
  id: ProjectIdSchema,
  createdAt: IsoTimestampSchema,
  createdBy: ActorRefSchema,
});
export type ProjectIdentity = z.infer<typeof ProjectIdentitySchema>;

export function parseProjectIdentity(raw: unknown): ProjectIdentity {
  return parseContract(ProjectIdentitySchema, raw, 'ProjectIdentity');
}

// ── Immutable content objects ──────────────────────────────────────

export const ProseContextObjectSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('prose'),
  entityKey: ContextEntityKeySchema,
  documentPath: WorkspaceRelativePathSchema,
  sectionKey: z.string().min(1),
  markdown: z.string(),
});
export type ProseContextObject = z.infer<typeof ProseContextObjectSchema>;

export const ItemContextObjectSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('item'),
  entityKey: ContextEntityKeySchema,
  documentPath: WorkspaceRelativePathSchema,
  sectionKey: z.string().min(1),
  title: z.string(),
  description: z.string(),
});
export type ItemContextObject = z.infer<typeof ItemContextObjectSchema>;

export const RecordContextFieldSchema = z.object({
  label: z.string().min(1),
  values: z.array(z.string()).default([]),
});
export type RecordContextField = z.infer<typeof RecordContextFieldSchema>;

export const RecordContextObjectSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('record'),
  entityKey: ContextEntityKeySchema,
  documentPath: WorkspaceRelativePathSchema,
  sectionKey: z.string().min(1),
  title: z.string(),
  /** In DocSpec field order; a scalar field has at most one value, a list field keeps its order (plan §18.2). */
  fields: z.array(RecordContextFieldSchema).default([]),
  /** An undeclared field/content the parser could not place — preserved verbatim until a correction resolves it. */
  trailingMarkdown: z.string().default(''),
});
export type RecordContextObject = z.infer<typeof RecordContextObjectSchema>;

export const ContextObjectSchema = z.discriminatedUnion('kind', [ProseContextObjectSchema, ItemContextObjectSchema, RecordContextObjectSchema]);
export type ContextObject = z.infer<typeof ContextObjectSchema>;

export function parseContextObject(raw: unknown): ContextObject {
  return parseContract(ContextObjectSchema, raw, 'ContextObject');
}

export function computeContextObjectHash(object: ContextObject): string {
  return sha256Hex(object);
}

// ── Managed document metadata (immutable object) ──────────────────

export const ManagedDocumentMetaObjectSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string(),
  preambleMarkdown: z.string().default(''),
  unmanagedBlocks: z
    .array(
      z.object({
        /** Insert right after this managed section; `undefined` means "before every managed section" (still after the preamble). */
        afterSectionKey: z.string().min(1).optional(),
        markdown: z.string(),
      }),
    )
    .default([]),
});
export type ManagedDocumentMetaObject = z.infer<typeof ManagedDocumentMetaObjectSchema>;

export function computeManagedDocumentMetaHash(meta: ManagedDocumentMetaObject): string {
  return sha256Hex(meta);
}

export const SupplementalDocumentObjectSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('supplemental-document'),
  documentPath: WorkspaceRelativePathSchema,
  markdown: z.string(),
});
export type SupplementalDocumentObject = z.infer<typeof SupplementalDocumentObjectSchema>;

export function computeSupplementalDocumentObjectHash(object: SupplementalDocumentObject): string {
  return sha256Hex(object);
}

// ── ProjectContextRevision / Head ──────────────────────────────────

export const ManagedDocumentSectionManifestSchema = z.object({
  kind: z.enum(['prose', 'items', 'records']),
  entityKeys: z.array(ContextEntityKeySchema).default([]),
});
export type ManagedDocumentSectionManifest = z.infer<typeof ManagedDocumentSectionManifestSchema>;

export const ManagedDocumentManifestSchema = z.object({
  metaObjectHash: Sha256HexSchema,
  sections: z.record(z.string(), ManagedDocumentSectionManifestSchema),
  projectionHash: Sha256HexSchema,
});
export type ManagedDocumentManifest = z.infer<typeof ManagedDocumentManifestSchema>;

export const SupplementalDocumentManifestSchema = z.object({
  objectHash: Sha256HexSchema,
  projectionHash: Sha256HexSchema,
});
export type SupplementalDocumentManifest = z.infer<typeof SupplementalDocumentManifestSchema>;

const ProjectContextRevisionFieldsSchema = z.object({
  schemaVersion: z.literal(1),
  id: ContextRevisionIdSchema,
  number: z.number().int().nonnegative(),
  parentRevisionId: ContextRevisionIdSchema.optional(),
  docSpecVersion: z.literal(1),
  rootHash: Sha256HexSchema,
  createdAt: IsoTimestampSchema,
  createdBy: ActorRefSchema,
  sourceProposalId: ContextProposalIdSchema.optional(),
  managedDocuments: z.record(z.string(), ManagedDocumentManifestSchema),
  supplementalDocuments: z.record(z.string(), SupplementalDocumentManifestSchema),
  /**
   * `entityKey -> objectHash` for every entity referenced anywhere in
   * `managedDocuments[*].sections[*].entityKeys`. Not in the plan's original
   * TS sketch of this interface, but required for it to actually function:
   * a section manifest records *which* entities it holds (`entityKeys`,
   * order-significant), not *what they currently contain* — something has
   * to map a key back to the immutable object a renderer/reader loads. Kept
   * as its own field (mirroring `EpicStartSnapshot.context.entityObjectHashes`,
   * §18.3) rather than folded into the section manifest, so that shape stays
   * exactly as specified.
   */
  entityObjectHashes: z.record(z.string(), Sha256HexSchema),
});

export type ProjectContextRevisionDraft = Omit<z.infer<typeof ProjectContextRevisionFieldsSchema>, 'rootHash'>;

/**
 * `rootHash` covers `docSpecVersion` + `managedDocuments` +
 * `supplementalDocuments` + `entityObjectHashes` — NOT `createdAt`/
 * `createdBy`/`sourceProposalId`/`rootHash` itself (plan §18.2: those are
 * write metadata, not the content two revisions are compared by).
 */
export function computeContextRootHash(draft: ProjectContextRevisionDraft): string {
  return sha256Hex({
    docSpecVersion: draft.docSpecVersion,
    managedDocuments: draft.managedDocuments,
    supplementalDocuments: draft.supplementalDocuments,
    entityObjectHashes: draft.entityObjectHashes,
  });
}

export const ProjectContextRevisionSchema = ProjectContextRevisionFieldsSchema.superRefine((revision, ctx) => {
  const expected = computeContextRootHash(revision);
  if (expected !== revision.rootHash) {
    ctx.addIssue({ code: 'custom', path: ['rootHash'], message: `rootHash does not match canonical content (expected ${expected}).` });
  }
});
export type ProjectContextRevision = z.infer<typeof ProjectContextRevisionSchema>;

export function parseProjectContextRevision(raw: unknown): ProjectContextRevision {
  return parseContract(ProjectContextRevisionSchema, raw, 'ProjectContextRevision');
}

export const ProjectContextHeadSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: ProjectIdSchema,
  currentRevisionId: ContextRevisionIdSchema,
  currentRevisionNumber: z.number().int().nonnegative(),
  rootHash: Sha256HexSchema,
  updatedAt: IsoTimestampSchema,
});
export type ProjectContextHead = z.infer<typeof ProjectContextHeadSchema>;

export function parseProjectContextHead(raw: unknown): ProjectContextHead {
  return parseContract(ProjectContextHeadSchema, raw, 'ProjectContextHead');
}
