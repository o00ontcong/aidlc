import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DOC_REQUIREMENTS, getFileSpec } from '../src/discover/DocSpec';
import { ContextBootstrapService } from '../src/context/ContextBootstrapService';
import { ProjectContextRepository } from '../src/context/ProjectContextRepository';
import { ContextProposalStore } from '../src/context/ContextProposalStore';
import { ContextProposalService, type ContextOperationInput, type ContextProposalGroupInput } from '../src/context/ContextProposalService';
import { extractManagedDocument } from '../src/context/ContextMarkdownBridge';
import { ContextProjectionRenderer } from '../src/context/ContextProjectionRenderer';
import { computeContextObjectHash, type ItemContextObject, type ProjectContextRevision } from '../src/contracts/projectContext';
import { computeSourceSnapshotHash, type SourceSnapshot, type SourceSnapshotDraft } from '../src/contracts/contextProposal';
import { AggregateConflictError } from '../src/storage/WorkspaceTransaction';

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-context-proposal-service-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const REQUESTER = { kind: 'user' as const, id: 'cong' };
const REVIEWER = { kind: 'user' as const, id: 'other-reviewer' };
const AGENT = { kind: 'agent' as const, id: 'discover-agent' };
const NOW = '2026-09-05T00:00:00.000Z';
let commandSeq = 0;
function nextCommandId(): string {
  commandSeq += 1;
  return `cmd-${commandSeq}`;
}

function writeDoc(root: string, docPath: string, content: string): void {
  const file = path.join(root, 'docs', docPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function bootstrapFixture(root: string) {
  writeDoc(
    root,
    DOC_REQUIREMENTS,
    ['# Requirements', '', '## Functional requirements', '', '- **FR-01** — Add item', '- **FR-02** — Remove item', '- **FR-03** — Share list', '', '## Non-functional requirements', '', '- **NFR-PERF-01** — Loads fast', ''].join('\n'),
  );
  const service = new ContextBootstrapService(root, { clock: () => NOW });
  const preview = service.preview();
  return service.apply({ actor: REQUESTER, previewId: preview.previewId, sourceHashes: preview.sourceHashes });
}

function fakeSourceSnapshot(): SourceSnapshot {
  const draft: SourceSnapshotDraft = { schemaVersion: 1, mode: 'filesystem', root: 'workspace', capturedAt: NOW, files: [], warnings: [] };
  return { ...draft, sourceHash: computeSourceSnapshotHash(draft) };
}

/** Build a same-shape ItemContextObject for FR-01 with a new title, plus the entity.update operation input + group referencing it. */
function editFr01Fixture(root: string, repository: ProjectContextRepository, base: ProjectContextRevision, newTitle: string) {
  const fileSpec = getFileSpec(DOC_REQUIREMENTS)!;
  const renderer = new ContextProjectionRenderer(repository, 'docs');
  const rendered = renderer.renderManagedDocumentContent(base, DOC_REQUIREMENTS);
  const current = extractManagedDocument(fileSpec, rendered);
  const currentFr01 = current.sections.functional!.objects.find((o) => o.entityKey === 'FR-01')! as ItemContextObject;
  const editedFr01: ItemContextObject = { ...currentFr01, title: newTitle };
  const beforeHash = base.entityObjectHashes['FR-01']!;
  const afterHash = computeContextObjectHash(editedFr01);

  const operations: ContextOperationInput[] = [{ key: 'edit-fr01', value: { kind: 'entity.update', entityKey: 'FR-01', beforeObjectHash: beforeHash, afterObjectHash: afterHash } }];
  const groups: ContextProposalGroupInput[] = [
    { key: 'g1', title: 'Reword FR-01', summary: 'Clarify FR-01', operationKeys: ['edit-fr01'], affectedDocumentPaths: [DOC_REQUIREMENTS], risk: 'low' },
  ];
  return { operations, groups, newObjects: [editedFr01] };
}

function editFr02Fixture(root: string, repository: ProjectContextRepository, base: ProjectContextRevision, newTitle: string) {
  const fileSpec = getFileSpec(DOC_REQUIREMENTS)!;
  const renderer = new ContextProjectionRenderer(repository, 'docs');
  const rendered = renderer.renderManagedDocumentContent(base, DOC_REQUIREMENTS);
  const current = extractManagedDocument(fileSpec, rendered);
  const currentFr02 = current.sections.functional!.objects.find((o) => o.entityKey === 'FR-02')! as ItemContextObject;
  const editedFr02: ItemContextObject = { ...currentFr02, title: newTitle };
  const beforeHash = base.entityObjectHashes['FR-02']!;
  const afterHash = computeContextObjectHash(editedFr02);

  const operations: ContextOperationInput[] = [{ key: 'edit-fr02', value: { kind: 'entity.update', entityKey: 'FR-02', beforeObjectHash: beforeHash, afterObjectHash: afterHash } }];
  const groups: ContextProposalGroupInput[] = [
    { key: 'g2', title: 'Reword FR-02', summary: 'Clarify FR-02', operationKeys: ['edit-fr02'], affectedDocumentPaths: [DOC_REQUIREMENTS], risk: 'low' },
  ];
  return { operations, groups, newObjects: [editedFr02] };
}

function setup(root: string) {
  const { revision: base } = bootstrapFixture(root);
  const repository = new ProjectContextRepository(root);
  const store = new ContextProposalStore(root);
  const service = new ContextProposalService(root, { clock: () => NOW, repository, store });
  return { base, repository, store, service };
}

describe('ContextProposalService.start', () => {
  it('creates a draft proposal with real ids wired from caller-local keys, and stages new objects', () => {
    const root = newRoot();
    const { base, service, store } = setup(root);
    const fixture = editFr01Fixture(root, new ProjectContextRepository(root), base, 'Add an item to the list');

    const { proposal } = service.start({
      commandId: nextCommandId(),
      actor: REQUESTER,
      producedBy: AGENT,
      origin: 'manual-correction',
      contextGuard: { expectedRevisionId: base.id, expectedRootHash: base.rootHash },
      sourceSnapshot: fakeSourceSnapshot(),
      operations: fixture.operations,
      groups: fixture.groups,
      newObjects: fixture.newObjects,
    });

    expect(proposal.status).toBe('draft');
    expect(proposal.revision).toBe(0);
    expect(proposal.operations).toHaveLength(1);
    expect(proposal.groups).toHaveLength(1);
    expect(proposal.groups[0]!.operationIds).toEqual([proposal.operations[0]!.id]);
    expect(proposal.groups[0]!.decision).toBe('pending');
    expect(proposal.requestedBy).toEqual(REQUESTER);
    expect(proposal.producedBy).toEqual(AGENT);

    const stagedHash = proposal.operations[0]!.value.kind === 'entity.update' ? proposal.operations[0]!.value.afterObjectHash : '';
    expect(store.readObject(proposal.id, stagedHash)).not.toBeNull();
  });

  it('rejects an agent actor for a non-delivery origin', () => {
    const root = newRoot();
    const { base, service } = setup(root);
    expect(() =>
      service.start({
        commandId: nextCommandId(),
        actor: AGENT,
        origin: 'scan',
        contextGuard: { expectedRevisionId: base.id, expectedRootHash: base.rootHash },
        sourceSnapshot: fakeSourceSnapshot(),
        operations: [],
        groups: [],
        newObjects: [],
      }),
    ).toThrow(/requires a human user/);
  });

  it('rejects a system actor even for origin "delivery" — requestedBy is always the human who started/approved the delivery', () => {
    const root = newRoot();
    const { base, service } = setup(root);
    expect(() =>
      service.start({
        commandId: nextCommandId(),
        actor: { kind: 'system', id: 'epic-delivery' },
        origin: 'delivery',
        contextGuard: { expectedRevisionId: base.id, expectedRootHash: base.rootHash },
        sourceSnapshot: fakeSourceSnapshot(),
        operations: [],
        groups: [],
        newObjects: [],
      }),
    ).toThrow(/requires a human user/);
  });

  it('accepts origin "delivery" with a human requestedBy and a system producedBy', () => {
    const root = newRoot();
    const { base, service } = setup(root);
    const { proposal } = service.start({
      commandId: nextCommandId(),
      actor: REQUESTER,
      producedBy: { kind: 'system', id: 'epic-delivery' },
      origin: 'delivery',
      contextGuard: { expectedRevisionId: base.id, expectedRootHash: base.rootHash },
      sourceSnapshot: fakeSourceSnapshot(),
      operations: [],
      groups: [],
      newObjects: [],
    });
    expect(proposal.requestedBy).toEqual(REQUESTER);
    expect(proposal.producedBy).toEqual({ kind: 'system', id: 'epic-delivery' });
  });
});

describe('ContextProposalService.finish', () => {
  it('moves a draft to review, only for an agent/system actor', () => {
    const root = newRoot();
    const { base, service } = setup(root);
    const fixture = editFr01Fixture(root, new ProjectContextRepository(root), base, 'Add an item');
    const { proposal: draft } = service.start({
      commandId: nextCommandId(),
      actor: REQUESTER,
      origin: 'manual-correction',
      contextGuard: { expectedRevisionId: base.id, expectedRootHash: base.rootHash },
      sourceSnapshot: fakeSourceSnapshot(),
      ...fixture,
    });

    expect(() => service.finish({ commandId: nextCommandId(), actor: REQUESTER, proposalId: draft.id, guard: { expectedRevision: draft.revision, expectedContentHash: draft.contentHash } })).toThrow(/agent or system/);

    const { proposal } = service.finish({ commandId: nextCommandId(), actor: AGENT, proposalId: draft.id, guard: { expectedRevision: draft.revision, expectedContentHash: draft.contentHash } });
    expect(proposal.status).toBe('review');
    expect(proposal.revision).toBe(draft.revision + 1);
  });
});

function startAndFinish(service: ContextProposalService, root: string, base: ProjectContextRevision, fixture: ReturnType<typeof editFr01Fixture>) {
  const { proposal: draft } = service.start({
    commandId: nextCommandId(),
    actor: REQUESTER,
    origin: 'manual-correction',
    contextGuard: { expectedRevisionId: base.id, expectedRootHash: base.rootHash },
    sourceSnapshot: fakeSourceSnapshot(),
    ...fixture,
  });
  return service.finish({ commandId: nextCommandId(), actor: AGENT, proposalId: draft.id, guard: { expectedRevision: draft.revision, expectedContentHash: draft.contentHash } }).proposal;
}

describe('ContextProposalService.approve', () => {
  it('rejects self-approval by default policy', () => {
    const root = newRoot();
    const { base, service } = setup(root);
    const fixture = editFr01Fixture(root, new ProjectContextRepository(root), base, 'Add an item');
    const reviewProposal = startAndFinish(service, root, base, fixture);

    expect(() =>
      service.approve({ commandId: nextCommandId(), actor: REQUESTER, proposalId: reviewProposal.id, guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash }, groupIds: [reviewProposal.groups[0]!.id] }),
    ).toThrow(/Self-approval is disabled/);
  });

  it('records an approval from a different reviewer', () => {
    const root = newRoot();
    const { base, service, store } = setup(root);
    const fixture = editFr01Fixture(root, new ProjectContextRepository(root), base, 'Add an item');
    const reviewProposal = startAndFinish(service, root, base, fixture);

    const { approval } = service.approve({
      commandId: nextCommandId(),
      actor: REVIEWER,
      proposalId: reviewProposal.id,
      guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash },
      groupIds: [reviewProposal.groups[0]!.id],
    });
    expect(approval.actor).toEqual(REVIEWER);
    expect(store.listApprovals(reviewProposal.id)).toHaveLength(1);
  });

  it('rejects an agent actor', () => {
    const root = newRoot();
    const { base, service } = setup(root);
    const fixture = editFr01Fixture(root, new ProjectContextRepository(root), base, 'Add an item');
    const reviewProposal = startAndFinish(service, root, base, fixture);
    expect(() =>
      service.approve({ commandId: nextCommandId(), actor: AGENT, proposalId: reviewProposal.id, guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash }, groupIds: [reviewProposal.groups[0]!.id] }),
    ).toThrow(/requires a human user/);
  });
});

describe('ContextProposalService.apply', () => {
  it('blocks apply when the selected group has no valid approval', () => {
    const root = newRoot();
    const { base, service } = setup(root);
    const fixture = editFr01Fixture(root, new ProjectContextRepository(root), base, 'Add an item');
    const reviewProposal = startAndFinish(service, root, base, fixture);
    const contextGuard = { expectedRevision: base.number, expectedContentHash: base.rootHash };

    expect(() =>
      service.apply({
        commandId: nextCommandId(),
        actor: REQUESTER,
        proposalId: reviewProposal.id,
        guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash },
        contextGuard,
        groupIds: [reviewProposal.groups[0]!.id],
      }),
    ).toThrow(/fewer than the 1 required/);
  });

  it('applies an approved group, updates the rendered document, and marks the proposal fully applied', () => {
    const root = newRoot();
    const { base, service, repository } = setup(root);
    const fixture = editFr01Fixture(root, repository, base, 'Add an item to the shared list');
    const reviewProposal = startAndFinish(service, root, base, fixture);
    service.approve({
      commandId: nextCommandId(),
      actor: REVIEWER,
      proposalId: reviewProposal.id,
      guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash },
      groupIds: [reviewProposal.groups[0]!.id],
    });

    const head = repository.requireHead();
    const { proposal, renderedPaths } = service.apply({
      commandId: nextCommandId(),
      actor: REQUESTER,
      proposalId: reviewProposal.id,
      guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash },
      contextGuard: { expectedRevision: head.currentRevisionNumber, expectedContentHash: head.rootHash },
      groupIds: [reviewProposal.groups[0]!.id],
    });

    expect(proposal.status).toBe('applied');
    expect(proposal.groups[0]!.decision).toBe('applied');
    expect(renderedPaths).toEqual([DOC_REQUIREMENTS]);
    const rendered = fs.readFileSync(path.join(root, 'docs', DOC_REQUIREMENTS), 'utf8');
    expect(rendered).toContain('Add an item to the shared list');
    expect(rendered).not.toContain('- **FR-01** — Add item\n');
  });

  it('partially applies a dependency-closed subset, leaving the remaining group pending and the proposal partially-applied', () => {
    const root = newRoot();
    const { base, service, repository } = setup(root);
    const f1 = editFr01Fixture(root, repository, base, 'Reworded FR-01');
    const f2 = editFr02Fixture(root, repository, base, 'Reworded FR-02');
    const { proposal: draft } = service.start({
      commandId: nextCommandId(),
      actor: REQUESTER,
      origin: 'manual-correction',
      contextGuard: { expectedRevisionId: base.id, expectedRootHash: base.rootHash },
      sourceSnapshot: fakeSourceSnapshot(),
      operations: [...f1.operations, ...f2.operations],
      groups: [...f1.groups, ...f2.groups],
      newObjects: [...f1.newObjects, ...f2.newObjects],
    });
    const reviewProposal = service.finish({ commandId: nextCommandId(), actor: AGENT, proposalId: draft.id, guard: { expectedRevision: draft.revision, expectedContentHash: draft.contentHash } }).proposal;
    const groupG1 = reviewProposal.groups.find((g) => g.title === 'Reword FR-01')!;
    service.approve({ commandId: nextCommandId(), actor: REVIEWER, proposalId: reviewProposal.id, guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash }, groupIds: [groupG1.id] });

    const head = repository.requireHead();
    const { proposal } = service.apply({
      commandId: nextCommandId(),
      actor: REQUESTER,
      proposalId: reviewProposal.id,
      guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash },
      contextGuard: { expectedRevision: head.currentRevisionNumber, expectedContentHash: head.rootHash },
      groupIds: [groupG1.id],
    });

    expect(proposal.status).toBe('partially-applied');
    const appliedGroup = proposal.groups.find((g) => g.id === groupG1.id)!;
    const pendingGroup = proposal.groups.find((g) => g.id !== groupG1.id)!;
    expect(appliedGroup.decision).toBe('applied');
    expect(pendingGroup.decision).toBe('pending');
    const rendered = fs.readFileSync(path.join(root, 'docs', DOC_REQUIREMENTS), 'utf8');
    expect(rendered).toContain('Reworded FR-01');
    expect(rendered).not.toContain('Reworded FR-02');
  });

  it('rejects applying a group whose dependency was not selected', () => {
    const root = newRoot();
    const { base, service, repository } = setup(root);
    const f1 = editFr01Fixture(root, repository, base, 'Reworded FR-01');
    const f2 = editFr02Fixture(root, repository, base, 'Reworded FR-02');
    const dependentGroups: ContextProposalGroupInput[] = [f1.groups[0]!, { ...f2.groups[0]!, dependsOnGroupKeys: ['g1'] }];

    const { proposal: draft } = service.start({
      commandId: nextCommandId(),
      actor: REQUESTER,
      origin: 'manual-correction',
      contextGuard: { expectedRevisionId: base.id, expectedRootHash: base.rootHash },
      sourceSnapshot: fakeSourceSnapshot(),
      operations: [...f1.operations, ...f2.operations],
      groups: dependentGroups,
      newObjects: [...f1.newObjects, ...f2.newObjects],
    });
    const reviewProposal = service.finish({ commandId: nextCommandId(), actor: AGENT, proposalId: draft.id, guard: { expectedRevision: draft.revision, expectedContentHash: draft.contentHash } }).proposal;
    const dependentGroup = reviewProposal.groups.find((g) => g.title === 'Reword FR-02')!;
    service.approve({ commandId: nextCommandId(), actor: REVIEWER, proposalId: reviewProposal.id, guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash }, groupIds: [dependentGroup.id] });

    const head = repository.requireHead();
    expect(() =>
      service.apply({
        commandId: nextCommandId(),
        actor: REQUESTER,
        proposalId: reviewProposal.id,
        guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash },
        contextGuard: { expectedRevision: head.currentRevisionNumber, expectedContentHash: head.rootHash },
        groupIds: [dependentGroup.id],
      }),
    ).toThrow(/dependency-closed/);
  });

  it('rejects apply with proposal.needs_rebase once the context head has moved since the proposal was based', () => {
    const root = newRoot();
    const { base, service, repository } = setup(root);
    const f1 = editFr01Fixture(root, repository, base, 'Reworded FR-01');
    const proposal1 = startAndFinish(service, root, base, f1);
    service.approve({ commandId: nextCommandId(), actor: REVIEWER, proposalId: proposal1.id, guard: { expectedRevision: proposal1.revision, expectedContentHash: proposal1.contentHash }, groupIds: [proposal1.groups[0]!.id] });
    const headBeforeApply = repository.requireHead();
    service.apply({
      commandId: nextCommandId(),
      actor: REQUESTER,
      proposalId: proposal1.id,
      guard: { expectedRevision: proposal1.revision, expectedContentHash: proposal1.contentHash },
      contextGuard: { expectedRevision: headBeforeApply.currentRevisionNumber, expectedContentHash: headBeforeApply.rootHash },
      groupIds: [proposal1.groups[0]!.id],
    });

    // proposal2 was based on the OLD head (before proposal1's apply moved it).
    const f2 = editFr02Fixture(root, repository, base, 'Reworded FR-02');
    const proposal2 = startAndFinish(service, root, base, f2);
    service.approve({ commandId: nextCommandId(), actor: REVIEWER, proposalId: proposal2.id, guard: { expectedRevision: proposal2.revision, expectedContentHash: proposal2.contentHash }, groupIds: [proposal2.groups[0]!.id] });

    const newHead = repository.requireHead();
    expect(() =>
      service.apply({
        commandId: nextCommandId(),
        actor: REQUESTER,
        proposalId: proposal2.id,
        guard: { expectedRevision: proposal2.revision, expectedContentHash: proposal2.contentHash },
        contextGuard: { expectedRevision: newHead.currentRevisionNumber, expectedContentHash: newHead.rootHash },
        groupIds: [proposal2.groups[0]!.id],
      }),
    ).toThrow(/rebase before applying/);
  });
});

describe('ContextProposalService.rebase', () => {
  it('detects a conflict when the same entity was already changed by another applied proposal', () => {
    const root = newRoot();
    const { base, service, repository } = setup(root);
    const editA = editFr01Fixture(root, repository, base, 'Applied edit A');
    const proposalA = startAndFinish(service, root, base, editA);
    service.approve({ commandId: nextCommandId(), actor: REVIEWER, proposalId: proposalA.id, guard: { expectedRevision: proposalA.revision, expectedContentHash: proposalA.contentHash }, groupIds: [proposalA.groups[0]!.id] });
    const headBeforeA = repository.requireHead();
    service.apply({
      commandId: nextCommandId(),
      actor: REQUESTER,
      proposalId: proposalA.id,
      guard: { expectedRevision: proposalA.revision, expectedContentHash: proposalA.contentHash },
      contextGuard: { expectedRevision: headBeforeA.currentRevisionNumber, expectedContentHash: headBeforeA.rootHash },
      groupIds: [proposalA.groups[0]!.id],
    });

    // proposalB, built against the pre-A base, also edits FR-01 — now stale.
    const editB = editFr01Fixture(root, repository, base, 'Conflicting edit B');
    const proposalB = startAndFinish(service, root, base, editB);

    const newHead = repository.requireHead();
    const { supersededProposal, newProposal, conflicts } = service.rebase({
      commandId: nextCommandId(),
      actor: REQUESTER,
      proposalId: proposalB.id,
      guard: { expectedRevision: proposalB.revision, expectedContentHash: proposalB.contentHash },
      contextGuard: { expectedRevisionId: newHead.currentRevisionId, expectedRootHash: newHead.rootHash },
    });

    expect(supersededProposal.status).toBe('needs-rebase');
    expect(newProposal.status).toBe('draft');
    expect(newProposal.baseContext.revisionId).toBe(newHead.currentRevisionId);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0]).toContain('FR-01');
  });

  it('rebases cleanly (no conflicts) when the remaining operations touch an untouched entity', () => {
    const root = newRoot();
    const { base, service, repository } = setup(root);
    const editA = editFr01Fixture(root, repository, base, 'Applied edit A');
    const proposalA = startAndFinish(service, root, base, editA);
    service.approve({ commandId: nextCommandId(), actor: REVIEWER, proposalId: proposalA.id, guard: { expectedRevision: proposalA.revision, expectedContentHash: proposalA.contentHash }, groupIds: [proposalA.groups[0]!.id] });
    const headBeforeA = repository.requireHead();
    service.apply({
      commandId: nextCommandId(),
      actor: REQUESTER,
      proposalId: proposalA.id,
      guard: { expectedRevision: proposalA.revision, expectedContentHash: proposalA.contentHash },
      contextGuard: { expectedRevision: headBeforeA.currentRevisionNumber, expectedContentHash: headBeforeA.rootHash },
      groupIds: [proposalA.groups[0]!.id],
    });

    const editC = editFr02Fixture(root, repository, base, 'Unrelated edit C');
    const proposalC = startAndFinish(service, root, base, editC);
    const newHead = repository.requireHead();
    const { conflicts, newProposal } = service.rebase({
      commandId: nextCommandId(),
      actor: REQUESTER,
      proposalId: proposalC.id,
      guard: { expectedRevision: proposalC.revision, expectedContentHash: proposalC.contentHash },
      contextGuard: { expectedRevisionId: newHead.currentRevisionId, expectedRootHash: newHead.rootHash },
    });

    expect(conflicts).toEqual([]);
    expect(newProposal.groups).toHaveLength(1);
    expect(newProposal.groups[0]!.decision).toBe('pending');

    // The rebased proposal can still be applied — its staged object survived the carry-forward.
    const finished = service.finish({ commandId: nextCommandId(), actor: AGENT, proposalId: newProposal.id, guard: { expectedRevision: newProposal.revision, expectedContentHash: newProposal.contentHash } }).proposal;
    service.approve({ commandId: nextCommandId(), actor: REVIEWER, proposalId: finished.id, guard: { expectedRevision: finished.revision, expectedContentHash: finished.contentHash }, groupIds: [finished.groups[0]!.id] });
    const head2 = repository.requireHead();
    const { proposal: applied } = service.apply({
      commandId: nextCommandId(),
      actor: REQUESTER,
      proposalId: finished.id,
      guard: { expectedRevision: finished.revision, expectedContentHash: finished.contentHash },
      contextGuard: { expectedRevision: head2.currentRevisionNumber, expectedContentHash: head2.rootHash },
      groupIds: [finished.groups[0]!.id],
    });
    expect(applied.status).toBe('applied');
    const rendered = fs.readFileSync(path.join(root, 'docs', DOC_REQUIREMENTS), 'utf8');
    expect(rendered).toContain('Unrelated edit C');
  });

  it('rejects an agent actor initiating a rebase', () => {
    const root = newRoot();
    const { base, service, repository } = setup(root);
    const fixture = editFr01Fixture(root, repository, base, 'edit');
    const reviewProposal = startAndFinish(service, root, base, fixture);
    const head = repository.requireHead();
    expect(() =>
      service.rebase({
        commandId: nextCommandId(),
        actor: AGENT,
        proposalId: reviewProposal.id,
        guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash },
        contextGuard: { expectedRevisionId: head.currentRevisionId, expectedRootHash: head.rootHash },
      }),
    ).toThrow(/must be initiated by a user/);
  });
});

describe('ContextProposalService.requestChanges', () => {
  it('marks the group changes-requested without touching the canonical context', () => {
    const root = newRoot();
    const { base, service, repository } = setup(root);
    const fixture = editFr01Fixture(root, repository, base, 'edit');
    const reviewProposal = startAndFinish(service, root, base, fixture);
    const headBefore = repository.requireHead();

    const { proposal } = service.requestChanges({
      commandId: nextCommandId(),
      actor: REVIEWER,
      proposalId: reviewProposal.id,
      guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash },
      groupIds: [reviewProposal.groups[0]!.id],
      feedback: 'Please reconsider the wording.',
    });

    expect(proposal.status).toBe('changes-requested');
    expect(proposal.groups[0]!.decision).toBe('changes-requested');
    expect(repository.requireHead()).toEqual(headBefore);
  });

  it('rejects blank feedback', () => {
    const root = newRoot();
    const { base, service } = setup(root);
    const fixture = editFr01Fixture(root, new ProjectContextRepository(root), base, 'edit');
    const reviewProposal = startAndFinish(service, root, base, fixture);
    expect(() =>
      service.requestChanges({
        commandId: nextCommandId(),
        actor: REVIEWER,
        proposalId: reviewProposal.id,
        guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash },
        groupIds: [reviewProposal.groups[0]!.id],
        feedback: '   ',
      }),
    ).toThrow(/non-blank feedback/);
  });
});

describe('ContextProposalService.discard', () => {
  it('discards the whole proposal without touching the canonical context', () => {
    const root = newRoot();
    const { base, service, repository } = setup(root);
    const fixture = editFr01Fixture(root, repository, base, 'edit');
    const reviewProposal = startAndFinish(service, root, base, fixture);
    const headBefore = repository.requireHead();

    const { proposal } = service.discard({
      commandId: nextCommandId(),
      actor: REQUESTER,
      proposalId: reviewProposal.id,
      guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash },
      reason: 'No longer needed.',
    });

    expect(proposal.status).toBe('discarded');
    expect(proposal.groups.every((g) => g.decision === 'discarded')).toBe(true);
    expect(repository.requireHead()).toEqual(headBefore);
  });

  it('leaves an already-applied proposal at partially-applied after discarding the remainder', () => {
    const root = newRoot();
    const { base, service, repository } = setup(root);
    const f1 = editFr01Fixture(root, repository, base, 'Reworded FR-01');
    const f2 = editFr02Fixture(root, repository, base, 'Reworded FR-02');
    const { proposal: draft } = service.start({
      commandId: nextCommandId(),
      actor: REQUESTER,
      origin: 'manual-correction',
      contextGuard: { expectedRevisionId: base.id, expectedRootHash: base.rootHash },
      sourceSnapshot: fakeSourceSnapshot(),
      operations: [...f1.operations, ...f2.operations],
      groups: [...f1.groups, ...f2.groups],
      newObjects: [...f1.newObjects, ...f2.newObjects],
    });
    const reviewProposal = service.finish({ commandId: nextCommandId(), actor: AGENT, proposalId: draft.id, guard: { expectedRevision: draft.revision, expectedContentHash: draft.contentHash } }).proposal;
    const groupG1 = reviewProposal.groups.find((g) => g.title === 'Reword FR-01')!;
    const groupG2 = reviewProposal.groups.find((g) => g.title === 'Reword FR-02')!;
    service.approve({ commandId: nextCommandId(), actor: REVIEWER, proposalId: reviewProposal.id, guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash }, groupIds: [groupG1.id] });
    const head = repository.requireHead();
    const { proposal: partiallyApplied } = service.apply({
      commandId: nextCommandId(),
      actor: REQUESTER,
      proposalId: reviewProposal.id,
      guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash },
      contextGuard: { expectedRevision: head.currentRevisionNumber, expectedContentHash: head.rootHash },
      groupIds: [groupG1.id],
    });

    const { proposal: discarded } = service.discard({
      commandId: nextCommandId(),
      actor: REQUESTER,
      proposalId: partiallyApplied.id,
      guard: { expectedRevision: partiallyApplied.revision, expectedContentHash: partiallyApplied.contentHash },
      groupIds: [groupG2.id],
      reason: 'Reviewer rejected this half.',
    });

    expect(discarded.status).toBe('partially-applied');
    expect(discarded.groups.find((g) => g.id === groupG1.id)!.decision).toBe('applied');
    expect(discarded.groups.find((g) => g.id === groupG2.id)!.decision).toBe('discarded');
  });

  it('rejects a blank reason', () => {
    const root = newRoot();
    const { base, service } = setup(root);
    const fixture = editFr01Fixture(root, new ProjectContextRepository(root), base, 'edit');
    const reviewProposal = startAndFinish(service, root, base, fixture);
    expect(() =>
      service.discard({ commandId: nextCommandId(), actor: REQUESTER, proposalId: reviewProposal.id, guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash }, reason: '' }),
    ).toThrow(/non-blank reason/);
  });
});

describe('ContextProposalService approval scoping', () => {
  it('an approval covers only the exact groupIds it was recorded for — applying an unapproved group alongside it is still blocked', () => {
    const root = newRoot();
    const { base, service, repository } = setup(root);
    const f1 = editFr01Fixture(root, repository, base, 'Reworded FR-01');
    const f2 = editFr02Fixture(root, repository, base, 'Reworded FR-02');
    const { proposal: draft } = service.start({
      commandId: nextCommandId(),
      actor: REQUESTER,
      origin: 'manual-correction',
      contextGuard: { expectedRevisionId: base.id, expectedRootHash: base.rootHash },
      sourceSnapshot: fakeSourceSnapshot(),
      operations: [...f1.operations, ...f2.operations],
      groups: [...f1.groups, ...f2.groups],
      newObjects: [...f1.newObjects, ...f2.newObjects],
    });
    const reviewProposal = service.finish({ commandId: nextCommandId(), actor: AGENT, proposalId: draft.id, guard: { expectedRevision: draft.revision, expectedContentHash: draft.contentHash } }).proposal;
    const groupG1 = reviewProposal.groups.find((g) => g.title === 'Reword FR-01')!;
    const groupG2 = reviewProposal.groups.find((g) => g.title === 'Reword FR-02')!;

    // Only G1 is approved.
    service.approve({ commandId: nextCommandId(), actor: REVIEWER, proposalId: reviewProposal.id, guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash }, groupIds: [groupG1.id] });

    const head = repository.requireHead();
    // Selecting both G1 (approved) and G2 (not approved) must fail on G2's missing approval, not silently pass because SOME approval exists on the proposal.
    expect(() =>
      service.apply({
        commandId: nextCommandId(),
        actor: REQUESTER,
        proposalId: reviewProposal.id,
        guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash },
        contextGuard: { expectedRevision: head.currentRevisionNumber, expectedContentHash: head.rootHash },
        groupIds: [groupG1.id, groupG2.id],
      }),
    ).toThrow(/Reword FR-02.*fewer than the 1 required/s);

    // G1 alone still applies fine.
    const { proposal } = service.apply({
      commandId: nextCommandId(),
      actor: REQUESTER,
      proposalId: reviewProposal.id,
      guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash },
      contextGuard: { expectedRevision: head.currentRevisionNumber, expectedContentHash: head.rootHash },
      groupIds: [groupG1.id],
    });
    expect(proposal.status).toBe('partially-applied');
  });
});

describe('ContextProposalService raw doc drift', () => {
  it('a hand-edited Markdown file does not silently become canonical truth — apply still renders from the structured revision', () => {
    const root = newRoot();
    const { base, service, repository } = setup(root);
    const fixture = editFr01Fixture(root, repository, base, 'Structured edit wins');
    const reviewProposal = startAndFinish(service, root, base, fixture);
    service.approve({ commandId: nextCommandId(), actor: REVIEWER, proposalId: reviewProposal.id, guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash }, groupIds: [reviewProposal.groups[0]!.id] });

    // Someone hand-edits the rendered file directly, bypassing the Context Proposal flow entirely.
    writeDoc(root, DOC_REQUIREMENTS, ['# Requirements', '', '## Functional requirements', '', '- **FR-01** — HAND EDITED DRIFT', '- **FR-02** — Remove item', '- **FR-03** — Share list', '', '## Non-functional requirements', '', '- **NFR-PERF-01** — Loads fast', ''].join('\n'));

    const head = repository.requireHead();
    const { proposal } = service.apply({
      commandId: nextCommandId(),
      actor: REQUESTER,
      proposalId: reviewProposal.id,
      guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash },
      contextGuard: { expectedRevision: head.currentRevisionNumber, expectedContentHash: head.rootHash },
      groupIds: [reviewProposal.groups[0]!.id],
    });

    expect(proposal.status).toBe('applied');
    const rendered = fs.readFileSync(path.join(root, 'docs', DOC_REQUIREMENTS), 'utf8');
    expect(rendered).toContain('Structured edit wins');
    expect(rendered).not.toContain('HAND EDITED DRIFT');
  });
});

describe('ContextProposalService.apply — actor rules', () => {
  it('rejects a non-human actor', () => {
    const root = newRoot();
    const { base, service, repository } = setup(root);
    const fixture = editFr01Fixture(root, repository, base, 'edit');
    const reviewProposal = startAndFinish(service, root, base, fixture);
    service.approve({ commandId: nextCommandId(), actor: REVIEWER, proposalId: reviewProposal.id, guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash }, groupIds: [reviewProposal.groups[0]!.id] });
    const head = repository.requireHead();
    expect(() =>
      service.apply({
        commandId: nextCommandId(),
        actor: AGENT,
        proposalId: reviewProposal.id,
        guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash },
        contextGuard: { expectedRevision: head.currentRevisionNumber, expectedContentHash: head.rootHash },
        groupIds: [reviewProposal.groups[0]!.id],
      }),
    ).toThrow(/requires a human user/);
  });
});

// Sanity: AggregateConflictError is the one error type this whole surface throws for domain rule violations.
describe('ContextProposalService error shape', () => {
  it('throws AggregateConflictError (not a generic Error) for a not-found proposal', () => {
    const root = newRoot();
    const { service } = setup(root);
    expect(() => service.require('CP-00000000000000000000000000' as never)).toThrow(AggregateConflictError);
  });
});
