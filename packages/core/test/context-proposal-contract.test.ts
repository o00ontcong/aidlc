import { describe, it, expect } from 'vitest';

import { ContractValidationError } from '../src/contracts/common';
import {
  generateApprovalId,
  generateChangeId,
  generateContextGroupId,
  generateContextOperationId,
  generateContextProposalId,
  generateContextRevisionId,
  toEpicId,
} from '../src/contracts/ids';
import {
  type ContextProposal,
  type ContextProposalDraft,
  type ContextProposalGroup,
  type SourceSnapshot,
  type SourceSnapshotDraft,
  computeContextProposalContentHash,
  computeSourceSnapshotHash,
  parseContextProposal,
  parseContextProposalApproval,
  parseSourceSnapshot,
} from '../src/contracts/contextProposal';

const NOW = '2026-09-05T00:00:00.000Z';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_ZERO = '0'.repeat(64);
const EPIC_ID = toEpicId('EPIC-001');

function draftSnapshot(overrides: Partial<SourceSnapshotDraft> = {}): SourceSnapshotDraft {
  return {
    schemaVersion: 1,
    mode: 'head',
    root: 'workspace',
    capturedAt: NOW,
    git: { headCommit: '7bc91e2', dirty: false },
    files: [],
    warnings: [],
    ...overrides,
  };
}

function buildSnapshot(overrides: Partial<SourceSnapshotDraft> = {}): SourceSnapshot {
  const draft = draftSnapshot(overrides);
  return { ...draft, sourceHash: computeSourceSnapshotHash(draft) };
}

function draftProposal(overrides: Partial<ContextProposalDraft> = {}): ContextProposalDraft {
  return {
    schemaVersion: 1,
    id: generateContextProposalId(),
    revision: 0,
    origin: 'scan',
    requestedBy: { kind: 'user', id: 'cong' },
    baseContext: { revisionId: generateContextRevisionId(), rootHash: HASH_A },
    sourceSnapshot: buildSnapshot(),
    status: 'draft',
    operations: [],
    groups: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildProposal(overrides: Partial<ContextProposalDraft> = {}): ContextProposal {
  const draft = draftProposal(overrides);
  return { ...draft, contentHash: computeContextProposalContentHash(draft) };
}

describe('SourceSnapshot', () => {
  it('is hash-stable and rejects a tampered sourceHash', () => {
    const snapshot = buildSnapshot();
    expect(() => parseSourceSnapshot(snapshot)).not.toThrow();
    expect(computeSourceSnapshotHash(draftSnapshot())).toBe(snapshot.sourceHash);
    expect(() => parseSourceSnapshot({ ...snapshot, sourceHash: HASH_ZERO })).toThrow(/sourceHash/);
  });

  it('is unaffected by file inventory order (set-like)', () => {
    const fileA = { path: 'a.ts', contentHash: HASH_A, status: 'tracked' as const };
    const fileB = { path: 'b.ts', contentHash: HASH_B, status: 'modified' as const };
    const forward = computeSourceSnapshotHash(draftSnapshot({ files: [fileA, fileB] }));
    const reversed = computeSourceSnapshotHash(draftSnapshot({ files: [fileB, fileA] }));
    expect(forward).toBe(reversed);
  });

  it('requires a git block for head/working-tree and forbids one for filesystem', () => {
    const missingGit = buildSnapshot({ git: undefined });
    expect(() => parseSourceSnapshot(missingGit)).toThrow(/must carry a git block/);

    const filesystemWithGit = buildSnapshot({ mode: 'filesystem', git: { headCommit: 'x', dirty: false } });
    expect(() => parseSourceSnapshot(filesystemWithGit)).toThrow(/must not carry a git block/);

    const filesystemOk = buildSnapshot({ mode: 'filesystem', git: undefined });
    expect(() => parseSourceSnapshot(filesystemOk)).not.toThrow();
  });
});

describe('ContextOperation / ContextProposalGroup shape', () => {
  it('accepts every locked operation kind and rejects an unknown kind', () => {
    const opAdd = { id: generateContextOperationId(), value: { kind: 'entity.add' as const, entityKey: 'FR-01', afterObjectHash: HASH_A } };
    const opUpdate = {
      id: generateContextOperationId(),
      value: { kind: 'entity.update' as const, entityKey: 'FR-01', beforeObjectHash: HASH_A, afterObjectHash: HASH_B },
    };
    const opRemove = { id: generateContextOperationId(), value: { kind: 'entity.remove' as const, entityKey: 'FR-01', beforeObjectHash: HASH_A } };
    const opReorder = {
      id: generateContextOperationId(),
      value: { kind: 'entity.reorder' as const, entityKey: 'FR-01', documentPath: 'product/REQUIREMENTS.md', sectionKey: 'functional' },
    };
    const opDocMeta = {
      id: generateContextOperationId(),
      value: { kind: 'document.meta.update' as const, documentPath: 'product/REQUIREMENTS.md', beforeObjectHash: HASH_A, afterObjectHash: HASH_B },
    };
    const opSupPut = {
      id: generateContextOperationId(),
      value: { kind: 'supplemental.put' as const, documentPath: 'development/CODING_RULES.md', afterObjectHash: HASH_A },
    };
    const opSupRemove = {
      id: generateContextOperationId(),
      value: { kind: 'supplemental.remove' as const, documentPath: 'development/CODING_RULES.md', beforeObjectHash: HASH_A },
    };

    const proposal = buildProposal({ operations: [opAdd, opUpdate, opRemove, opReorder, opDocMeta, opSupPut, opSupRemove] });
    expect(() => parseContextProposal(proposal)).not.toThrow();

    const invalidKind = buildProposal({ operations: [{ id: generateContextOperationId(), value: { kind: 'entity.delete', entityKey: 'FR-01' } as never }] });
    expect(() => parseContextProposal(invalidKind)).toThrow(ContractValidationError);
  });

  it('rejects a group that depends on itself', () => {
    const groupId = generateContextGroupId();
    const opId = generateContextOperationId();
    const group: ContextProposalGroup = {
      id: groupId,
      title: 'Self-dependent group',
      summary: 'Should never validate.',
      operationIds: [opId],
      dependsOnGroupIds: [groupId],
      affectedDocumentPaths: [],
      risk: 'low',
      decision: 'pending',
    };
    const proposal = buildProposal({
      operations: [{ id: opId, value: { kind: 'entity.add', entityKey: 'FR-01', afterObjectHash: HASH_A } }],
      groups: [group],
    });
    expect(() => parseContextProposal(proposal)).toThrow(/cannot depend on itself/);
  });
});

describe('ContextProposalSchema / parseContextProposal', () => {
  it('parses a well-formed proposal and round-trips through JSON', () => {
    const proposal = buildProposal();
    expect(parseContextProposal(proposal)).toEqual(proposal);
    expect(parseContextProposal(JSON.parse(JSON.stringify(proposal)))).toEqual(proposal);
  });

  it('rejects an unknown schemaVersion and a tampered contentHash', () => {
    const proposal = buildProposal();
    expect(() => parseContextProposal({ ...proposal, schemaVersion: 2 })).toThrow(ContractValidationError);
    expect(() => parseContextProposal({ ...proposal, contentHash: HASH_ZERO })).toThrow(/contentHash/);
  });

  it('requires requestedBy to be a human user', () => {
    const proposal = buildProposal({ requestedBy: { kind: 'agent', id: 'discover-scanner' }, producedBy: { kind: 'agent', id: 'discover-scanner' } });
    expect(() => parseContextProposal(proposal)).toThrow(/requestedBy must be a human user/);
  });

  it('rejects duplicate operation ids and duplicate group ids', () => {
    const opId = generateContextOperationId();
    const duplicateOps = buildProposal({
      operations: [
        { id: opId, value: { kind: 'entity.add', entityKey: 'FR-01', afterObjectHash: HASH_A } },
        { id: opId, value: { kind: 'entity.add', entityKey: 'FR-02', afterObjectHash: HASH_B } },
      ],
    });
    expect(() => parseContextProposal(duplicateOps)).toThrow(/Duplicate operation id/);

    const groupId = generateContextGroupId();
    const group = (id: string) => ({
      id: groupId,
      title: id,
      summary: 'x',
      operationIds: [opId],
      dependsOnGroupIds: [],
      affectedDocumentPaths: [],
      risk: 'low' as const,
      decision: 'pending' as const,
    });
    const duplicateGroups = buildProposal({
      operations: [{ id: opId, value: { kind: 'entity.add', entityKey: 'FR-01', afterObjectHash: HASH_A } }],
      groups: [group('a'), group('b')],
    });
    expect(() => parseContextProposal(duplicateGroups)).toThrow(/Duplicate group id/);
  });

  it('rejects a group referencing an unknown operation or unknown dependency', () => {
    const realOpId = generateContextOperationId();
    const base = {
      operations: [{ id: realOpId, value: { kind: 'entity.add' as const, entityKey: 'FR-01', afterObjectHash: HASH_A } }],
    };

    const unknownOperation = buildProposal({
      ...base,
      groups: [
        {
          id: generateContextGroupId(),
          title: 'g',
          summary: 's',
          operationIds: [generateContextOperationId()],
          dependsOnGroupIds: [],
          affectedDocumentPaths: [],
          risk: 'low',
          decision: 'pending',
        },
      ],
    });
    expect(() => parseContextProposal(unknownOperation)).toThrow(/references unknown operation/);

    const unknownDependency = buildProposal({
      ...base,
      groups: [
        {
          id: generateContextGroupId(),
          title: 'g',
          summary: 's',
          operationIds: [realOpId],
          dependsOnGroupIds: [generateContextGroupId()],
          affectedDocumentPaths: [],
          risk: 'low',
          decision: 'pending',
        },
      ],
    });
    expect(() => parseContextProposal(unknownDependency)).toThrow(/depends on unknown group/);
  });

  it('rejects a cyclic group dependency graph and accepts an acyclic chain', () => {
    const opId = generateContextOperationId();
    const groupA = generateContextGroupId();
    const groupB = generateContextGroupId();
    const operations = [{ id: opId, value: { kind: 'entity.add' as const, entityKey: 'FR-01', afterObjectHash: HASH_A } }];

    const cyclic = buildProposal({
      operations,
      groups: [
        { id: groupA, title: 'A', summary: 's', operationIds: [opId], dependsOnGroupIds: [groupB], affectedDocumentPaths: [], risk: 'low', decision: 'pending' },
        { id: groupB, title: 'B', summary: 's', operationIds: [opId], dependsOnGroupIds: [groupA], affectedDocumentPaths: [], risk: 'low', decision: 'pending' },
      ],
    });
    expect(() => parseContextProposal(cyclic)).toThrow(/acyclic/);

    const acyclic = buildProposal({
      operations,
      groups: [
        { id: groupA, title: 'A', summary: 's', operationIds: [opId], dependsOnGroupIds: [], affectedDocumentPaths: [], risk: 'low', decision: 'pending' },
        { id: groupB, title: 'B', summary: 's', operationIds: [opId], dependsOnGroupIds: [groupA], affectedDocumentPaths: [], risk: 'low', decision: 'pending' },
      ],
    });
    expect(() => parseContextProposal(acyclic)).not.toThrow();
  });

  it('accepts an originRef tying the proposal back to a Change/Epic/analysis', () => {
    const proposal = buildProposal({
      origin: 'delivery',
      originRef: { changeId: generateChangeId(), epicId: EPIC_ID },
    });
    expect(() => parseContextProposal(proposal)).not.toThrow();
  });
});

describe('ContextProposalApproval', () => {
  it('parses a well-formed approval', () => {
    const approval = {
      schemaVersion: 1 as const,
      id: generateApprovalId(),
      proposalId: generateContextProposalId(),
      proposalRevision: 0,
      proposalContentHash: HASH_A,
      groupIds: [generateContextGroupId()],
      actor: { kind: 'user' as const, id: 'reviewer' },
      source: 'aidlc-local' as const,
      at: NOW,
    };
    expect(parseContextProposalApproval(approval)).toEqual(approval);
  });

  it('rejects an approval recorded by a non-human actor', () => {
    const approval = {
      schemaVersion: 1 as const,
      id: generateApprovalId(),
      proposalId: generateContextProposalId(),
      proposalRevision: 0,
      proposalContentHash: HASH_A,
      groupIds: [generateContextGroupId()],
      actor: { kind: 'agent' as const, id: 'reviewer-bot' },
      source: 'aidlc-local' as const,
      at: NOW,
    };
    expect(() => parseContextProposalApproval(approval)).toThrow(/human user/);
  });

  it('rejects a malformed approval id', () => {
    const approval = {
      schemaVersion: 1 as const,
      id: 'not-an-approval-id',
      proposalId: generateContextProposalId(),
      proposalRevision: 0,
      proposalContentHash: HASH_A,
      groupIds: [generateContextGroupId()],
      actor: { kind: 'user' as const, id: 'reviewer' },
      source: 'aidlc-local' as const,
      at: NOW,
    };
    expect(() => parseContextProposalApproval(approval)).toThrow(ContractValidationError);
  });
});
