/**
 * Business-rule layer for `ContextProposal` (implementation plan §6.4,
 * §8, §18.2, §18.6, §D8, §D9) — the Git-like isolation area a scan/Shape/
 * delivery result stages a canonical Project Context change into before a
 * human reviews and Applies it.
 *
 * Scope note: `context.proposal.start`'s locked payload (§18.6) is
 * `{origin,originRef,contextGuard,sourceSnapshot}` — no operations/groups.
 * Building *those* from a real scan is M5's job ("DiscoverAgentCommand.ts
 * de output chi vao proposal staging"); this milestone (M4) is "review/
 * apply/rebase/discard mechanics", so `start` here additionally accepts
 * already-computed operations/groups/new-content-objects directly — the
 * same shape M5's scan integration will hand it once it exists. Grouping
 * itself (which operations form one dependency-safe atomic unit) is
 * supplied by the caller, not computed here — clustering operations by
 * inferred dependency is a distinct algorithm the plan does not specify.
 */

import type { ActorRef } from '../contracts/common';
import {
  generateApprovalId,
  generateContextGroupId,
  generateContextOperationId,
  generateContextProposalId,
  generateContextRevisionId,
  generateDomainEventId,
  type ContextGroupId,
  type ContextOperationId,
  type ContextProposalId,
  type ContextRevisionId,
} from '../contracts/ids';
import {
  computeContextProposalContentHash,
  parseContextProposal,
  type ContextOperation,
  type ContextProposal,
  type ContextProposalApproval,
  type ContextProposalDraft,
  type ContextProposalGroupDecision,
  type ContextProposalGroupRisk,
  type ContextProposalOrigin,
  type ContextProposalOriginRef,
  type SourceSnapshot,
} from '../contracts/contextProposal';
import {
  computeContextRootHash,
  type ManagedDocumentManifest,
  type ProjectContextRevision,
  type SupplementalDocumentManifest,
} from '../contracts/projectContext';
import { sha256Hex } from '../contracts/hash';
import * as fs from 'fs';
import type { DomainEvent } from '../contracts/domainEvent';
import type { ProjectPolicy } from '../contracts/projectPolicy';
import { AggregateConflictError, type VersionGuard } from '../storage/WorkspaceTransaction';
import { ContextApplyTransaction, type ContextApplyTransactionResult } from './ContextApplyTransaction';
import { ContextProjectionRenderer } from './ContextProjectionRenderer';
import { ContextProposalStore } from './ContextProposalStore';
import { ProjectContextRepository } from './ProjectContextRepository';
import { ProjectPolicyStore } from './ProjectPolicyStore';

function actorRequiresUser(actor: ActorRef, action: string): void {
  if (actor.kind !== 'user') throw new AggregateConflictError('change.human_required', `${action} requires a human user (actor was "${actor.kind}").`);
}

function assertGuardMatches(domain: string, displayId: string, actual: { revision: number; contentHash: string }, guard: VersionGuard): void {
  if (actual.revision !== guard.expectedRevision || actual.contentHash !== guard.expectedContentHash) {
    throw new AggregateConflictError(
      `${domain}.revision_conflict`,
      `${displayId} changed (expected revision ${guard.expectedRevision}, actual ${actual.revision}).`,
      { expectedRevision: guard.expectedRevision, expectedContentHash: guard.expectedContentHash, actualRevision: actual.revision, actualContentHash: actual.contentHash },
      [
        { kind: 'reload', label: 'Reload the current version' },
        { kind: 'rebase', label: 'Rebase your edit onto the current version' },
      ],
    );
  }
}

export interface ContextOperationInput {
  /** Caller-local key used only to wire up group membership below — never written to disk. */
  key: string;
  value: ContextOperation;
}

export interface ContextProposalGroupInput {
  key: string;
  title: string;
  summary: string;
  operationKeys: string[];
  dependsOnGroupKeys?: string[];
  affectedDocumentPaths: string[];
  risk: ContextProposalGroupRisk;
}

export interface StartContextProposalInput {
  commandId: string;
  /** Becomes `requestedBy` — always a human user, for every origin including 'delivery' (contracts/contextProposal.ts's own superRefine enforces this; the automated process belongs in `producedBy`). */
  actor: ActorRef;
  /** The agent/system that actually produced the operations, if different from `actor`. */
  producedBy?: ActorRef;
  origin: ContextProposalOrigin;
  originRef?: ContextProposalOriginRef;
  contextGuard: { expectedRevisionId: ContextRevisionId; expectedRootHash: string };
  sourceSnapshot: SourceSnapshot;
  operations: ContextOperationInput[];
  groups: ContextProposalGroupInput[];
  /** New immutable content this proposal introduces — objects/meta/supplemental — staged under this proposal, not canonical, until Apply. Hashed with the same plain `sha256Hex` every context object uses. */
  newObjects: unknown[];
}

export interface FinishContextProposalInput {
  commandId: string;
  actor: ActorRef;
  proposalId: ContextProposalId;
  guard: VersionGuard;
}

export interface ApproveContextProposalInput {
  commandId: string;
  actor: ActorRef;
  proposalId: ContextProposalId;
  guard: VersionGuard;
  groupIds: ContextGroupId[];
}

export interface ApplyContextProposalInput {
  commandId: string;
  actor: ActorRef;
  proposalId: ContextProposalId;
  guard: VersionGuard;
  contextGuard: VersionGuard;
  groupIds: ContextGroupId[];
}

export interface RebaseContextProposalInput {
  commandId: string;
  actor: ActorRef;
  proposalId: ContextProposalId;
  guard: VersionGuard;
  contextGuard: { expectedRevisionId: ContextRevisionId; expectedRootHash: string };
}

export interface RequestProposalChangesInput {
  commandId: string;
  actor: ActorRef;
  proposalId: ContextProposalId;
  guard: VersionGuard;
  groupIds: ContextGroupId[];
  feedback: string;
}

export interface DiscardProposalInput {
  commandId: string;
  actor: ActorRef;
  proposalId: ContextProposalId;
  guard: VersionGuard;
  groupIds?: ContextGroupId[];
  reason: string;
}

export class ContextProposalService {
  readonly store: ContextProposalStore;
  readonly repository: ProjectContextRepository;
  private readonly renderer: ContextProjectionRenderer;
  private readonly transactions: ContextApplyTransaction;
  private readonly policyStore: ProjectPolicyStore;
  private readonly clock: () => string;

  constructor(
    readonly workspaceRoot: string,
    options: {
      clock?: () => string;
      store?: ContextProposalStore;
      repository?: ProjectContextRepository;
      docsRoot?: string;
      policyStore?: ProjectPolicyStore;
    } = {},
  ) {
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.store = options.store ?? new ContextProposalStore(workspaceRoot);
    this.repository = options.repository ?? new ProjectContextRepository(workspaceRoot);
    this.renderer = new ContextProjectionRenderer(this.repository, options.docsRoot ?? 'docs');
    this.transactions = new ContextApplyTransaction(workspaceRoot, this.repository, this.renderer, this.clock);
    this.policyStore = options.policyStore ?? new ProjectPolicyStore(workspaceRoot);
  }

  list(): ContextProposal[] {
    return this.store.list();
  }
  get(id: ContextProposalId): ContextProposal | null {
    return this.store.read(id);
  }
  require(id: ContextProposalId): ContextProposal {
    return this.store.require(id);
  }
  policy(): ProjectPolicy {
    return this.policyStore.load();
  }

  // ── context.proposal.start ────────────────────────────────────

  start(input: StartContextProposalInput): { proposal: ContextProposal } {
    // `requestedBy` (the contract's own superRefine, contracts/contextProposal.ts) is always a human —
    // even for an automated `origin: 'delivery'` proposal, `requestedBy` is the human who started/approved
    // that delivery; the automated process that computed the diff belongs in `producedBy` instead.
    actorRequiresUser(input.actor, 'context.proposal.start');

    const id = generateContextProposalId();
    for (const object of input.newObjects) {
      this.store.writeObjectIfAbsent(id, sha256Hex(object), object);
    }

    const operationIdByKey = new Map<string, ContextOperationId>();
    for (const operation of input.operations) operationIdByKey.set(operation.key, generateContextOperationId());
    const groupIdByKey = new Map<string, ContextGroupId>();
    for (const group of input.groups) groupIdByKey.set(group.key, generateContextGroupId());

    const operations = input.operations.map((operation) => ({ id: operationIdByKey.get(operation.key)!, value: operation.value }));
    const groups = input.groups.map((group) => ({
      id: groupIdByKey.get(group.key)!,
      title: group.title,
      summary: group.summary,
      operationIds: group.operationKeys.map((key) => {
        const opId = operationIdByKey.get(key);
        if (!opId) throw new AggregateConflictError('proposal.invalid_operation', `Group "${group.key}" references unknown operation key "${key}".`);
        return opId;
      }),
      dependsOnGroupIds: (group.dependsOnGroupKeys ?? []).map((key) => {
        const grpId = groupIdByKey.get(key);
        if (!grpId) throw new AggregateConflictError('proposal.invalid_dependency', `Group "${group.key}" depends on unknown group key "${key}".`);
        return grpId;
      }),
      affectedDocumentPaths: group.affectedDocumentPaths,
      risk: group.risk,
      decision: 'pending' as ContextProposalGroupDecision,
    }));

    const now = this.clock();
    const draft: ContextProposalDraft = {
      schemaVersion: 1,
      id,
      revision: 0,
      origin: input.origin,
      originRef: input.originRef,
      requestedBy: input.actor,
      producedBy: input.producedBy,
      baseContext: { revisionId: input.contextGuard.expectedRevisionId, rootHash: input.contextGuard.expectedRootHash },
      sourceSnapshot: input.sourceSnapshot,
      status: 'draft',
      operations,
      groups,
      createdAt: now,
      updatedAt: now,
    };
    const proposal = this.store.create(id, () => parseContextProposal({ ...draft, contentHash: computeContextProposalContentHash(draft) }));
    this.recordEvent(id, { commandId: input.commandId, type: 'context.proposal.started', actor: input.actor, afterHash: proposal.contentHash });
    return { proposal };
  }

  // ── context.proposal.finish ────────────────────────────────────

  finish(input: FinishContextProposalInput): { proposal: ContextProposal } {
    if (input.actor.kind === 'user') {
      throw new AggregateConflictError('change.agent_required', 'context.proposal.finish must be recorded by an agent or system, not a user directly.');
    }
    const before = this.store.require(input.proposalId);
    if (before.status !== 'draft') {
      throw new AggregateConflictError('proposal.invalid_operation', `context.proposal.finish requires status "draft" (current: ${before.status}).`);
    }
    const proposal = this.store.update(input.proposalId, input.guard, (current) => {
      const next: Omit<ContextProposal, 'contentHash'> = { ...stripHash(current), status: 'review', revision: current.revision + 1, updatedAt: this.clock() };
      return parseContextProposal({ ...next, contentHash: computeContextProposalContentHash(next) });
    });
    this.recordEvent(input.proposalId, { commandId: input.commandId, type: 'context.proposal.finished', actor: input.actor, beforeHash: before.contentHash, afterHash: proposal.contentHash });
    return { proposal };
  }

  // ── context.proposal.approve ────────────────────────────────────

  approve(input: ApproveContextProposalInput): { approval: ContextProposalApproval; proposal: ContextProposal } {
    actorRequiresUser(input.actor, 'context.proposal.approve');
    const proposal = this.store.require(input.proposalId);
    assertGuardMatches('proposal', `Context Proposal ${input.proposalId}`, proposal, input.guard);
    if (proposal.status !== 'review' && proposal.status !== 'partially-applied') {
      throw new AggregateConflictError('proposal.invalid_operation', `context.proposal.approve requires status "review" (current: ${proposal.status}).`);
    }
    const policy = this.policy();
    if (!policy.contextReview.allowSelfApproval && proposal.requestedBy.kind === 'user' && proposal.requestedBy.id === input.actor.id) {
      throw new AggregateConflictError('change.human_required', 'Self-approval is disabled by .aidlc/project-policy.yaml; a different reviewer must approve this proposal.');
    }
    const knownGroupIds = new Set(proposal.groups.map((group) => group.id));
    for (const groupId of input.groupIds) {
      if (!knownGroupIds.has(groupId)) throw new AggregateConflictError('proposal.invalid_operation', `Unknown group id ${groupId} for proposal ${input.proposalId}.`);
    }
    const approval: ContextProposalApproval = {
      schemaVersion: 1,
      id: generateApprovalId(),
      proposalId: input.proposalId,
      proposalRevision: proposal.revision,
      proposalContentHash: proposal.contentHash,
      groupIds: input.groupIds,
      actor: input.actor,
      source: 'aidlc-local',
      at: this.clock(),
    };
    this.store.writeApproval(input.proposalId, approval);
    this.recordEvent(input.proposalId, { commandId: input.commandId, type: 'context.proposal.approved', actor: input.actor, evidence: { approvalId: approval.id, groupIds: input.groupIds } });
    return { approval, proposal };
  }

  // ── context.proposal.apply ──────────────────────────────────────

  apply(input: ApplyContextProposalInput): { proposal: ContextProposal } & ContextApplyTransactionResult {
    actorRequiresUser(input.actor, 'context.proposal.apply');
    const proposal = this.store.require(input.proposalId);
    assertGuardMatches('proposal', `Context Proposal ${input.proposalId}`, proposal, input.guard);
    if (proposal.status !== 'review' && proposal.status !== 'partially-applied') {
      throw new AggregateConflictError('proposal.invalid_operation', `context.proposal.apply requires status "review" (current: ${proposal.status}).`);
    }

    const currentHead = this.repository.requireHead();
    if (currentHead.currentRevisionId !== proposal.baseContext.revisionId || currentHead.rootHash !== proposal.baseContext.rootHash) {
      throw new AggregateConflictError(
        'proposal.needs_rebase',
        `Context Proposal ${input.proposalId} was based on a context revision that is no longer current; rebase before applying.`,
        { expectedRevisionId: proposal.baseContext.revisionId, actualRevisionId: currentHead.currentRevisionId },
        [{ kind: 'rebase', label: 'Rebase this proposal onto the current context' }],
      );
    }
    assertGuardMatches('context', 'Project Context', { revision: currentHead.currentRevisionNumber, contentHash: currentHead.rootHash }, input.contextGuard);

    const selectedGroups = proposal.groups.filter((group) => input.groupIds.includes(group.id));
    if (selectedGroups.length !== input.groupIds.length) {
      throw new AggregateConflictError('proposal.invalid_operation', `One or more group ids are not part of proposal ${input.proposalId}.`);
    }
    for (const group of selectedGroups) {
      for (const dependencyId of group.dependsOnGroupIds) {
        if (!input.groupIds.includes(dependencyId)) {
          throw new AggregateConflictError(
            'proposal.invalid_dependency',
            `Group "${group.title}" depends on a group that is not selected; the selection must be dependency-closed.`,
            { groupId: group.id, missingDependency: dependencyId },
          );
        }
      }
    }

    const policy = this.policy();
    const approvals = this.store.listApprovals(input.proposalId).filter((approval) => approval.proposalRevision === proposal.revision && approval.proposalContentHash === proposal.contentHash);
    for (const group of selectedGroups) {
      const coveringApprovers = new Set(
        approvals.filter((approval) => approval.groupIds.includes(group.id)).filter((approval) => policy.contextReview.allowSelfApproval || approval.actor.id !== proposal.requestedBy.id).map((approval) => approval.actor.id),
      );
      if (coveringApprovers.size < policy.contextReview.approvalsRequired) {
        throw new AggregateConflictError(
          'proposal.invalid_operation',
          `Group "${group.title}" has ${coveringApprovers.size} valid approval(s), fewer than the ${policy.contextReview.approvalsRequired} required by .aidlc/project-policy.yaml.`,
          { groupId: group.id, required: policy.contextReview.approvalsRequired, actual: coveringApprovers.size },
        );
      }
    }

    const selectedOperationIds = new Set(selectedGroups.flatMap((group) => group.operationIds));
    const selectedOperations = proposal.operations.filter((entry) => selectedOperationIds.has(entry.id)).map((entry) => entry.value);

    // Copy every new content object the selected operations reference, from proposal-local staging into the canonical object store, BEFORE building the next revision — the renderer that computes each touched document's projectionHash reads only from the canonical repository, never proposal staging.
    for (const operation of selectedOperations) {
      if (!('afterObjectHash' in operation)) continue;
      const hash = operation.afterObjectHash;
      if (this.repository.readObject(hash)) continue;
      const staged = this.store.readObject(input.proposalId, hash);
      if (staged) this.repository.writeObjectIfAbsent(hash, staged);
    }

    const baseRevision = this.repository.requireCurrentRevision();
    const nextRevisionDraft = this.buildNextRevisionDraft(baseRevision, selectedOperations, input.proposalId);
    const nextRevision: ProjectContextRevision = { ...nextRevisionDraft, rootHash: computeContextRootHash(nextRevisionDraft) };

    const result = this.transactions.run({ proposalId: input.proposalId, actor: input.actor, guard: input.contextGuard, afterRevision: nextRevision });

    const allSelectedNow = new Set([...proposal.groups.filter((g) => g.decision === 'applied').map((g) => g.id), ...input.groupIds]);
    const fullyApplied = proposal.groups.every((group) => allSelectedNow.has(group.id));
    const updatedProposal = this.store.update(input.proposalId, input.guard, (current) => {
      const groups = current.groups.map((group) => (input.groupIds.includes(group.id) ? { ...group, decision: 'applied' as ContextProposalGroupDecision } : group));
      const next: Omit<ContextProposal, 'contentHash'> = { ...stripHash(current), groups, status: fullyApplied ? 'applied' : 'partially-applied', revision: current.revision + 1, updatedAt: this.clock() };
      return parseContextProposal({ ...next, contentHash: computeContextProposalContentHash(next) });
    });

    this.recordEvent(input.proposalId, {
      commandId: input.commandId,
      type: 'context.proposal.applied',
      actor: input.actor,
      beforeHash: proposal.contentHash,
      afterHash: updatedProposal.contentHash,
      evidence: { groupIds: input.groupIds, newRevisionId: nextRevision.id },
    });

    return { proposal: updatedProposal, ...result };
  }

  // ── context.proposal.rebase ──────────────────────────────────────

  rebase(input: RebaseContextProposalInput): { supersededProposal: ContextProposal; newProposal: ContextProposal; conflicts: string[] } {
    if (input.actor.kind === 'agent') throw new AggregateConflictError('change.agent_required', 'context.proposal.rebase must be initiated by a user (system may execute it on the user\'s behalf with the same commandId).');
    const before = this.store.require(input.proposalId);
    assertGuardMatches('proposal', `Context Proposal ${input.proposalId}`, before, input.guard);

    const currentHead = this.repository.requireHead();
    const remainingGroups = before.groups.filter((group) => group.decision !== 'applied' && group.decision !== 'discarded');
    const remainingOperationIds = new Set(remainingGroups.flatMap((group) => group.operationIds));
    const remainingOperations = before.operations.filter((entry) => remainingOperationIds.has(entry.id));

    const currentRevision = this.repository.requireRevision(currentHead.currentRevisionId);
    const conflicts: string[] = [];
    for (const entry of remainingOperations) {
      if (entry.value.kind === 'entity.update' || entry.value.kind === 'entity.remove') {
        const currentHash = currentRevision.entityObjectHashes[entry.value.entityKey];
        if (currentHash && currentHash !== entry.value.beforeObjectHash) {
          conflicts.push(`${entry.value.entityKey} changed since this proposal was based (expected ${entry.value.beforeObjectHash}, current ${currentHash}).`);
        }
      }
    }

    const supersededProposal = this.store.update(input.proposalId, input.guard, (current) => {
      const next: Omit<ContextProposal, 'contentHash'> = { ...stripHash(current), status: 'needs-rebase', revision: current.revision + 1, updatedAt: this.clock() };
      return parseContextProposal({ ...next, contentHash: computeContextProposalContentHash(next) });
    });

    const newId = generateContextProposalId();
    const now = this.clock();
    const newDraft: ContextProposalDraft = {
      schemaVersion: 1,
      id: newId,
      revision: 0,
      origin: before.origin,
      originRef: before.originRef,
      requestedBy: before.requestedBy,
      producedBy: before.producedBy,
      baseContext: { revisionId: input.contextGuard.expectedRevisionId, rootHash: input.contextGuard.expectedRootHash },
      sourceSnapshot: before.sourceSnapshot,
      status: 'draft',
      operations: remainingOperations,
      groups: remainingGroups.map((group) => ({ ...group, decision: 'pending' as ContextProposalGroupDecision })),
      createdAt: now,
      updatedAt: now,
    };
    const newProposal = this.store.create(newId, () => parseContextProposal({ ...newDraft, contentHash: computeContextProposalContentHash(newDraft) }));
    // Carry forward whatever new content the old proposal staged, so the new one can still Apply it.
    for (const name of listProposalObjectFiles(this.store, input.proposalId)) {
      const object = this.store.readObject(input.proposalId, name);
      if (object) this.store.writeObjectIfAbsent(newId, name, object);
    }

    this.recordEvent(input.proposalId, { commandId: input.commandId, type: 'context.proposal.rebased', actor: input.actor, beforeHash: before.contentHash, afterHash: supersededProposal.contentHash, evidence: { newProposalId: newId, conflicts } });
    return { supersededProposal, newProposal, conflicts };
  }

  // ── context.proposal.changes.request ─────────────────────────────

  requestChanges(input: RequestProposalChangesInput): { proposal: ContextProposal } {
    actorRequiresUser(input.actor, 'context.proposal.changes.request');
    if (!input.feedback.trim()) throw new AggregateConflictError('proposal.invalid_operation', 'context.proposal.changes.request requires non-blank feedback.');
    const before = this.store.require(input.proposalId);
    const knownGroupIds = new Set(before.groups.map((group) => group.id));
    for (const groupId of input.groupIds) {
      if (!knownGroupIds.has(groupId)) throw new AggregateConflictError('proposal.invalid_operation', `Unknown group id ${groupId} for proposal ${input.proposalId}.`);
    }
    const proposal = this.store.update(input.proposalId, input.guard, (current) => {
      const groups = current.groups.map((group) => (input.groupIds.includes(group.id) ? { ...group, decision: 'changes-requested' as ContextProposalGroupDecision } : group));
      const next: Omit<ContextProposal, 'contentHash'> = { ...stripHash(current), groups, status: 'changes-requested', revision: current.revision + 1, updatedAt: this.clock() };
      return parseContextProposal({ ...next, contentHash: computeContextProposalContentHash(next) });
    });
    this.recordEvent(input.proposalId, { commandId: input.commandId, type: 'context.proposal.changes_requested', actor: input.actor, beforeHash: before.contentHash, afterHash: proposal.contentHash, evidence: { groupIds: input.groupIds, feedback: input.feedback } });
    return { proposal };
  }

  // ── context.proposal.discard ──────────────────────────────────────

  discard(input: DiscardProposalInput): { proposal: ContextProposal } {
    actorRequiresUser(input.actor, 'context.proposal.discard');
    if (!input.reason.trim()) throw new AggregateConflictError('proposal.invalid_operation', 'context.proposal.discard requires a non-blank reason.');
    const before = this.store.require(input.proposalId);
    const targetGroupIds = input.groupIds ?? before.groups.map((group) => group.id);
    const proposal = this.store.update(input.proposalId, input.guard, (current) => {
      const groups = current.groups.map((group) => (targetGroupIds.includes(group.id) ? { ...group, decision: 'discarded' as ContextProposalGroupDecision } : group));
      const allResolved = groups.every((group) => group.decision === 'applied' || group.decision === 'discarded');
      const anyApplied = groups.some((group) => group.decision === 'applied');
      const status = allResolved ? (anyApplied ? 'partially-applied' : 'discarded') : current.status;
      const next: Omit<ContextProposal, 'contentHash'> = { ...stripHash(current), groups, status, revision: current.revision + 1, updatedAt: this.clock() };
      return parseContextProposal({ ...next, contentHash: computeContextProposalContentHash(next) });
    });
    this.recordEvent(input.proposalId, { commandId: input.commandId, type: 'context.proposal.discarded', actor: input.actor, beforeHash: before.contentHash, afterHash: proposal.contentHash, evidence: { groupIds: targetGroupIds, reason: input.reason } });
    return { proposal };
  }

  // ── internals ──────────────────────────────────────────────────

  private buildNextRevisionDraft(base: ProjectContextRevision, operations: ContextOperation[], proposalId: ContextProposalId) {
    const managedDocuments: Record<string, ManagedDocumentManifest> = { ...base.managedDocuments };
    const supplementalDocuments: Record<string, SupplementalDocumentManifest> = { ...base.supplementalDocuments };
    const entityObjectHashes: Record<string, string> = { ...base.entityObjectHashes };
    const touchedDocuments = new Set<string>();

    for (const operation of operations) {
      switch (operation.kind) {
        case 'entity.add':
        case 'entity.update': {
          entityObjectHashes[operation.entityKey] = operation.afterObjectHash;
          const object = this.store.readObject(proposalId, operation.afterObjectHash) as { documentPath: string; sectionKey: string } | null;
          if (object) touchedDocuments.add(object.documentPath);
          break;
        }
        case 'entity.remove': {
          delete entityObjectHashes[operation.entityKey];
          break;
        }
        case 'entity.reorder': {
          touchedDocuments.add(operation.documentPath);
          break;
        }
        case 'document.meta.update': {
          const manifest = managedDocuments[operation.documentPath];
          if (manifest) managedDocuments[operation.documentPath] = { ...manifest, metaObjectHash: operation.afterObjectHash };
          touchedDocuments.add(operation.documentPath);
          break;
        }
        case 'supplemental.put': {
          supplementalDocuments[operation.documentPath] = { objectHash: operation.afterObjectHash, projectionHash: '' };
          touchedDocuments.add(operation.documentPath);
          break;
        }
        case 'supplemental.remove': {
          delete supplementalDocuments[operation.documentPath];
          break;
        }
      }
    }

    // entity.remove doesn't carry its own documentPath — look up which document held it (in `base`, since it must already exist there to be removed) so its section manifest gets rebuilt too.
    for (const operation of operations) {
      if (operation.kind !== 'entity.remove') continue;
      const documentPath = this.documentPathForEntity(base, operation);
      if (documentPath && managedDocuments[documentPath]) touchedDocuments.add(documentPath);
    }

    for (const documentPath of touchedDocuments) {
      const manifest = managedDocuments[documentPath];
      if (manifest) {
        managedDocuments[documentPath] = { ...manifest, sections: this.rebuildSectionManifest(documentPath, manifest, operations, proposalId) };
      }
    }

    const rendererScratchRevision: ProjectContextRevision = { ...base, managedDocuments, supplementalDocuments, entityObjectHashes, rootHash: base.rootHash };
    for (const documentPath of touchedDocuments) {
      if (managedDocuments[documentPath]) {
        const rendered = this.renderer.renderManagedDocumentContent(rendererScratchRevision, documentPath);
        managedDocuments[documentPath] = { ...managedDocuments[documentPath]!, projectionHash: sha256Hex(rendered) };
      } else if (supplementalDocuments[documentPath]) {
        const object = this.repository.readObject<{ markdown: string }>(supplementalDocuments[documentPath]!.objectHash) ?? this.store.readObject<{ markdown: string }>(proposalId, supplementalDocuments[documentPath]!.objectHash);
        supplementalDocuments[documentPath] = { ...supplementalDocuments[documentPath]!, projectionHash: sha256Hex(object?.markdown ?? '') };
      }
    }

    return {
      schemaVersion: 1 as const,
      id: generateContextRevisionId(),
      number: base.number + 1,
      parentRevisionId: base.id,
      docSpecVersion: 1 as const,
      createdAt: this.clock(),
      createdBy: { kind: 'system', id: 'context-proposal-apply' } as ActorRef,
      sourceProposalId: proposalId,
      managedDocuments,
      supplementalDocuments,
      entityObjectHashes,
    };
  }

  private documentPathForEntity(base: ProjectContextRevision, operation: ContextOperation): string | undefined {
    if (!('entityKey' in operation)) return undefined;
    for (const [documentPath, manifest] of Object.entries(base.managedDocuments)) {
      for (const section of Object.values(manifest.sections)) {
        if (section.entityKeys.includes(operation.entityKey)) return documentPath;
      }
    }
    return undefined;
  }

  private rebuildSectionManifest(
    documentPath: string,
    manifest: ManagedDocumentManifest,
    operations: ContextOperation[],
    proposalId: ContextProposalId,
  ): ManagedDocumentManifest['sections'] {
    const sections: ManagedDocumentManifest['sections'] = {};
    for (const [sectionKey, sectionManifest] of Object.entries(manifest.sections)) {
      sections[sectionKey] = { kind: sectionManifest.kind, entityKeys: [...sectionManifest.entityKeys] };
    }
    for (const operation of operations) {
      if (operation.kind === 'entity.add') {
        const object = this.store.readObject<{ documentPath: string; sectionKey: string }>(proposalId, operation.afterObjectHash);
        if (object?.documentPath === documentPath && sections[object.sectionKey] && !sections[object.sectionKey]!.entityKeys.includes(operation.entityKey)) {
          sections[object.sectionKey]!.entityKeys.push(operation.entityKey);
        }
      }
      if (operation.kind === 'entity.remove') {
        for (const section of Object.values(sections)) {
          const idx = section.entityKeys.indexOf(operation.entityKey);
          if (idx >= 0) section.entityKeys.splice(idx, 1);
        }
      }
      if (operation.kind === 'entity.reorder' && operation.documentPath === documentPath) {
        const section = sections[operation.sectionKey];
        if (section) {
          const idx = section.entityKeys.indexOf(operation.entityKey);
          if (idx >= 0) section.entityKeys.splice(idx, 1);
          const afterIdx = operation.afterEntityKey ? section.entityKeys.indexOf(operation.afterEntityKey) : -1;
          section.entityKeys.splice(afterIdx + 1, 0, operation.entityKey);
        }
      }
    }
    return sections;
  }

  private recordEvent(id: ContextProposalId, params: { commandId: string; type: string; actor: ActorRef; beforeHash?: string; afterHash?: string; evidence?: Record<string, unknown> }): void {
    const event: DomainEvent = {
      schemaVersion: 1,
      id: generateDomainEventId(),
      aggregateType: 'context-proposal',
      aggregateId: id,
      commandId: params.commandId,
      type: params.type,
      actor: params.actor,
      at: this.clock(),
      beforeHash: params.beforeHash,
      afterHash: params.afterHash,
      evidence: params.evidence,
    };
    this.store.appendEvent(id, event);
  }
}

function stripHash(proposal: ContextProposal): Omit<ContextProposal, 'contentHash'> {
  const { contentHash: _ignored, ...rest } = proposal;
  return rest;
}

function listProposalObjectFiles(store: ContextProposalStore, id: ContextProposalId): string[] {
  const dir = store.objectsDir(id);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => name.replace(/\.json$/, ''));
}
