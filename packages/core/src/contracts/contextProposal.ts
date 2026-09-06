/**
 * `ContextProposal` — the Git-like isolation area a scan/Shape/delivery
 * result stages a canonical Project Context change into before a human
 * reviews and Applies it (Master Rule §0.4, §D17, implementation plan
 * §6.4, locked appendix §18.2).
 *
 * Scope note: this file is "proposal/operation/group contracts" only (plan
 * §5.1 module ownership) — the *canonical* Project Context store shapes
 * that a proposal is applied against (`ProjectContextRevision`,
 * `ProjectContextHead`, the `Prose/Item/RecordContextObject` union, ...)
 * belong to `context/ProjectContextRepository.ts` (M4) and are not defined
 * here. Nothing in this file writes or reads the filesystem.
 */

import { z } from 'zod';

import { ActorRefSchema, IsoTimestampSchema, WorkspaceRelativePathSchema, parseContract } from './common';
import { Sha256HexSchema, sha256Hex } from './hash';
import {
  ApprovalIdSchema,
  ChangeIdSchema,
  ContextGroupIdSchema,
  ContextOperationIdSchema,
  ContextProposalIdSchema,
  ContextRevisionIdSchema,
  EpicIdSchema,
  ScopeAnalysisIdSchema,
} from './ids';

// ── ContextEntityKey ───────────────────────────────────────────────

/**
 * Either a DocSpec-managed entity id (`FR-01`, `M-02`, ...) or a prose
 * section key `SEC:<documentPath>#<sectionKey>` (§18.2). The exact entity-id
 * grammar is owned by `DocSpec.ts`'s registry (§18.1), not this contract —
 * validating it here would duplicate that registry and drift from it, so
 * this only enforces the shape common to both kinds: a non-empty string.
 */
export type ContextEntityKey = string;

export const SEC_ENTITY_KEY_PATTERN = /^SEC:[^#]+#.+$/;

export function isProseContextEntityKey(key: ContextEntityKey): boolean {
  return SEC_ENTITY_KEY_PATTERN.test(key);
}

export const ContextEntityKeySchema = z.string().min(1);

// ── SourceSnapshot ─────────────────────────────────────────────────

export const SOURCE_SNAPSHOT_MODES = ['head', 'working-tree', 'filesystem'] as const;
export const SourceSnapshotModeSchema = z.enum(SOURCE_SNAPSHOT_MODES);
export type SourceSnapshotMode = z.infer<typeof SourceSnapshotModeSchema>;

export const SOURCE_SNAPSHOT_FILE_STATUSES = ['tracked', 'modified', 'added', 'deleted', 'untracked'] as const;
export const SourceSnapshotFileStatusSchema = z.enum(SOURCE_SNAPSHOT_FILE_STATUSES);
export type SourceSnapshotFileStatus = z.infer<typeof SourceSnapshotFileStatusSchema>;

export const SourceSnapshotFileSchema = z.object({
  path: WorkspaceRelativePathSchema,
  contentHash: Sha256HexSchema,
  status: SourceSnapshotFileStatusSchema,
});
export type SourceSnapshotFile = z.infer<typeof SourceSnapshotFileSchema>;

export const SourceSnapshotGitSchema = z.object({
  headCommit: z.string().min(1),
  treeHash: z.string().min(1).optional(),
  diffHash: z.string().min(1).optional(),
  dirty: z.boolean(),
});
export type SourceSnapshotGit = z.infer<typeof SourceSnapshotGitSchema>;

const SourceSnapshotFieldsSchema = z.object({
  schemaVersion: z.literal(1),
  mode: SourceSnapshotModeSchema,
  /** Logical workspace/project reference — never an absolute filesystem path sent to a client (§18.2). */
  root: z.string().min(1),
  sourceHash: Sha256HexSchema,
  capturedAt: IsoTimestampSchema,
  git: SourceSnapshotGitSchema.optional(),
  files: z.array(SourceSnapshotFileSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export type SourceSnapshotDraft = Omit<z.infer<typeof SourceSnapshotFieldsSchema>, 'sourceHash'>;

/**
 * "`sourceHash` hash canonical cua mode/git/files, bo `capturedAt` va
 * `warnings`" (§18.2). `files` is a set-like inventory — its order carries
 * no meaning — so it is sorted by path before hashing.
 */
export function computeSourceSnapshotHash(draft: SourceSnapshotDraft): string {
  return sha256Hex({
    mode: draft.mode,
    git: draft.git,
    files: [...draft.files].sort((a, b) => a.path.localeCompare(b.path)),
  });
}

export const SourceSnapshotSchema = SourceSnapshotFieldsSchema.superRefine((snapshot, ctx) => {
  const needsGit = snapshot.mode === 'head' || snapshot.mode === 'working-tree';
  if (needsGit && !snapshot.git) {
    ctx.addIssue({ code: 'custom', path: ['git'], message: `Source mode "${snapshot.mode}" must carry a git block.` });
  }
  if (!needsGit && snapshot.git) {
    ctx.addIssue({ code: 'custom', path: ['git'], message: 'Source mode "filesystem" must not carry a git block.' });
  }

  const { sourceHash, ...draft } = snapshot;
  const expectedHash = computeSourceSnapshotHash(draft);
  if (expectedHash !== sourceHash) {
    ctx.addIssue({ code: 'custom', path: ['sourceHash'], message: `sourceHash does not match canonical content (expected ${expectedHash}).` });
  }
});
export type SourceSnapshot = z.infer<typeof SourceSnapshotSchema>;

export function parseSourceSnapshot(raw: unknown): SourceSnapshot {
  return parseContract(SourceSnapshotSchema, raw, 'SourceSnapshot');
}

// ── ContextOperation (locked union, §18.2) ─────────────────────────

const ContextEntityAddSchema = z.object({
  kind: z.literal('entity.add'),
  entityKey: ContextEntityKeySchema,
  afterObjectHash: Sha256HexSchema,
});
const ContextEntityUpdateSchema = z.object({
  kind: z.literal('entity.update'),
  entityKey: ContextEntityKeySchema,
  beforeObjectHash: Sha256HexSchema,
  afterObjectHash: Sha256HexSchema,
});
const ContextEntityRemoveSchema = z.object({
  kind: z.literal('entity.remove'),
  entityKey: ContextEntityKeySchema,
  beforeObjectHash: Sha256HexSchema,
});
const ContextEntityReorderSchema = z.object({
  kind: z.literal('entity.reorder'),
  entityKey: ContextEntityKeySchema,
  documentPath: WorkspaceRelativePathSchema,
  sectionKey: z.string().min(1),
  afterEntityKey: ContextEntityKeySchema.optional(),
});
const ContextDocumentMetaUpdateSchema = z.object({
  kind: z.literal('document.meta.update'),
  documentPath: WorkspaceRelativePathSchema,
  beforeObjectHash: Sha256HexSchema,
  afterObjectHash: Sha256HexSchema,
});
const ContextSupplementalPutSchema = z.object({
  kind: z.literal('supplemental.put'),
  documentPath: WorkspaceRelativePathSchema,
  beforeObjectHash: Sha256HexSchema.optional(),
  afterObjectHash: Sha256HexSchema,
});
const ContextSupplementalRemoveSchema = z.object({
  kind: z.literal('supplemental.remove'),
  documentPath: WorkspaceRelativePathSchema,
  beforeObjectHash: Sha256HexSchema,
});

export const ContextOperationSchema = z.discriminatedUnion('kind', [
  ContextEntityAddSchema,
  ContextEntityUpdateSchema,
  ContextEntityRemoveSchema,
  ContextEntityReorderSchema,
  ContextDocumentMetaUpdateSchema,
  ContextSupplementalPutSchema,
  ContextSupplementalRemoveSchema,
]);
export type ContextOperation = z.infer<typeof ContextOperationSchema>;
export type ContextOperationKind = ContextOperation['kind'];

export const ContextProposalOperationEntrySchema = z.object({
  id: ContextOperationIdSchema,
  value: ContextOperationSchema,
});
export type ContextProposalOperationEntry = z.infer<typeof ContextProposalOperationEntrySchema>;

// ── ContextProposalGroup ───────────────────────────────────────────

export const CONTEXT_PROPOSAL_GROUP_RISKS = ['low', 'medium', 'high'] as const;
export const ContextProposalGroupRiskSchema = z.enum(CONTEXT_PROPOSAL_GROUP_RISKS);
export type ContextProposalGroupRisk = z.infer<typeof ContextProposalGroupRiskSchema>;

export const CONTEXT_PROPOSAL_GROUP_DECISIONS = ['pending', 'changes-requested', 'applied', 'discarded'] as const;
export const ContextProposalGroupDecisionSchema = z.enum(CONTEXT_PROPOSAL_GROUP_DECISIONS);
export type ContextProposalGroupDecision = z.infer<typeof ContextProposalGroupDecisionSchema>;

export const ContextProposalGroupSchema = z
  .object({
    id: ContextGroupIdSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    operationIds: z.array(ContextOperationIdSchema).min(1),
    dependsOnGroupIds: z.array(ContextGroupIdSchema).default([]),
    affectedDocumentPaths: z.array(WorkspaceRelativePathSchema).default([]),
    risk: ContextProposalGroupRiskSchema,
    decision: ContextProposalGroupDecisionSchema,
  })
  .superRefine((group, ctx) => {
    if (group.dependsOnGroupIds.includes(group.id)) {
      ctx.addIssue({ code: 'custom', path: ['dependsOnGroupIds'], message: 'A group cannot depend on itself.' });
    }
  });
export type ContextProposalGroup = z.infer<typeof ContextProposalGroupSchema>;

/** DFS cycle check over `dependsOnGroupIds` — apply must only ever see an acyclic dependency graph (§18.2). */
function hasCyclicGroupDependency(groups: readonly ContextProposalGroup[]): boolean {
  type GroupId = ContextProposalGroup['id'];
  const byId = new Map(groups.map((group) => [group.id, group] as const));
  const state = new Map<GroupId, 'visiting' | 'done'>();

  function visit(id: GroupId): boolean {
    const status = state.get(id);
    if (status === 'visiting') return true;
    if (status === 'done') return false;
    state.set(id, 'visiting');
    const group = byId.get(id);
    for (const dep of group?.dependsOnGroupIds ?? []) {
      if (byId.has(dep) && visit(dep)) return true;
    }
    state.set(id, 'done');
    return false;
  }

  return groups.some((group) => visit(group.id));
}

// ── ContextProposal ────────────────────────────────────────────────

export const CONTEXT_PROPOSAL_ORIGINS = ['scan', 'shape', 'delivery', 'manual-correction', 'drift-correction', 'migration'] as const;
export const ContextProposalOriginSchema = z.enum(CONTEXT_PROPOSAL_ORIGINS);
export type ContextProposalOrigin = z.infer<typeof ContextProposalOriginSchema>;

export const ContextProposalOriginRefSchema = z.object({
  changeId: ChangeIdSchema.optional(),
  shapeRevision: z.number().int().nonnegative().optional(),
  epicId: EpicIdSchema.optional(),
  analysisId: ScopeAnalysisIdSchema.optional(),
  migrationId: z.string().min(1).optional(),
});
export type ContextProposalOriginRef = z.infer<typeof ContextProposalOriginRefSchema>;

export const CONTEXT_PROPOSAL_STATUSES = [
  'draft',
  'review',
  'needs-rebase',
  'changes-requested',
  'partially-applied',
  'applied',
  'discarded',
] as const;
export const ContextProposalStatusSchema = z.enum(CONTEXT_PROPOSAL_STATUSES);
export type ContextProposalStatus = z.infer<typeof ContextProposalStatusSchema>;

const ContextProposalFieldsSchema = z.object({
  schemaVersion: z.literal(1),
  id: ContextProposalIdSchema,
  revision: z.number().int().nonnegative(),
  contentHash: Sha256HexSchema,
  origin: ContextProposalOriginSchema,
  originRef: ContextProposalOriginRefSchema.optional(),
  /** Always the human who initiated the intent — agent/system only ever appears in `producedBy` (§18.2, never a self-approval loophole). */
  requestedBy: ActorRefSchema,
  producedBy: ActorRefSchema.optional(),
  baseContext: z.object({ revisionId: ContextRevisionIdSchema, rootHash: Sha256HexSchema }),
  sourceSnapshot: SourceSnapshotSchema,
  status: ContextProposalStatusSchema,
  operations: z.array(ContextProposalOperationEntrySchema).default([]),
  groups: z.array(ContextProposalGroupSchema).default([]),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type ContextProposalDraft = Omit<z.infer<typeof ContextProposalFieldsSchema>, 'contentHash'>;

/**
 * SHA-256 of every field except `contentHash`. Unlike `externalRefs`/
 * relations on `ProjectChange`, `operations` and `groups` are ordered lists
 * with review-sequence meaning (a group's `dependsOnGroupIds` already
 * captures the *structural* dependency; array order itself is left as
 * authored) — neither is sorted before hashing.
 */
export function computeContextProposalContentHash(draft: ContextProposalDraft): string {
  // Defensive strip, same reasoning as computeChangeContentHash in
  // contracts/change.ts: a caller that spreads a full ContextProposal (which
  // has contentHash) into its "next" draft keeps that stale field as a real
  // runtime property despite the stricter static type.
  const { contentHash: _ignored, ...rest } = draft as ContextProposalDraft & { contentHash?: unknown };
  return sha256Hex(rest);
}

export const ContextProposalSchema = ContextProposalFieldsSchema.superRefine((proposal, ctx) => {
  if (proposal.requestedBy.kind !== 'user') {
    ctx.addIssue({ code: 'custom', path: ['requestedBy'], message: 'requestedBy must be a human user; agent/system belongs in producedBy.' });
  }

  const operationIds = new Set<string>();
  for (const entry of proposal.operations) {
    if (operationIds.has(entry.id)) {
      ctx.addIssue({ code: 'custom', path: ['operations'], message: `Duplicate operation id ${entry.id}.` });
    }
    operationIds.add(entry.id);
  }

  const groupIds = new Set<string>();
  for (const group of proposal.groups) {
    if (groupIds.has(group.id)) {
      ctx.addIssue({ code: 'custom', path: ['groups'], message: `Duplicate group id ${group.id}.` });
    }
    groupIds.add(group.id);
  }
  for (const group of proposal.groups) {
    for (const operationId of group.operationIds) {
      if (!operationIds.has(operationId)) {
        ctx.addIssue({ code: 'custom', path: ['groups'], message: `Group ${group.id} references unknown operation ${operationId}.` });
      }
    }
    for (const dependencyId of group.dependsOnGroupIds) {
      if (!groupIds.has(dependencyId)) {
        ctx.addIssue({ code: 'custom', path: ['groups'], message: `Group ${group.id} depends on unknown group ${dependencyId}.` });
      }
    }
  }
  if (hasCyclicGroupDependency(proposal.groups)) {
    ctx.addIssue({ code: 'custom', path: ['groups'], message: 'Group dependency graph must be acyclic.' });
  }

  const { contentHash, ...draft } = proposal;
  const expectedHash = computeContextProposalContentHash(draft);
  if (expectedHash !== contentHash) {
    ctx.addIssue({ code: 'custom', path: ['contentHash'], message: `contentHash does not match canonical content (expected ${expectedHash}).` });
  }
});
export type ContextProposal = z.infer<typeof ContextProposalSchema>;

export function parseContextProposal(raw: unknown): ContextProposal {
  return parseContract(ContextProposalSchema, raw, 'ContextProposal');
}

// ── ContextProposalApproval ────────────────────────────────────────

export const CONTEXT_PROPOSAL_APPROVAL_SOURCES = ['aidlc-local', 'git-provider'] as const;
export const ContextProposalApprovalSourceSchema = z.enum(CONTEXT_PROPOSAL_APPROVAL_SOURCES);
export type ContextProposalApprovalSource = z.infer<typeof ContextProposalApprovalSourceSchema>;

/**
 * Immutable: one approval only ever covers the exact `proposalRevision` /
 * `proposalContentHash` / `groupIds` it was recorded against (§18.2) — a
 * rebase or "request changes" makes it stale rather than mutating it.
 */
export const ContextProposalApprovalSchema = z.object({
  schemaVersion: z.literal(1),
  id: ApprovalIdSchema,
  proposalId: ContextProposalIdSchema,
  proposalRevision: z.number().int().nonnegative(),
  proposalContentHash: Sha256HexSchema,
  groupIds: z.array(ContextGroupIdSchema).min(1),
  actor: ActorRefSchema.refine((actor) => actor.kind === 'user', 'Only a human user may record a Context Proposal approval'),
  source: ContextProposalApprovalSourceSchema,
  at: IsoTimestampSchema,
});
export type ContextProposalApproval = z.infer<typeof ContextProposalApprovalSchema>;

export function parseContextProposalApproval(raw: unknown): ContextProposalApproval {
  return parseContract(ContextProposalApprovalSchema, raw, 'ContextProposalApproval');
}
