import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DOC_REQUIREMENTS } from '../src/discover/DocSpec';
import { buildScanProposalInputs } from '../src/discover/DiscoverScanProposalBridge';
import { ContextBootstrapService } from '../src/context/ContextBootstrapService';
import { ProjectContextRepository } from '../src/context/ProjectContextRepository';
import { ContextProposalStore } from '../src/context/ContextProposalStore';
import { ContextProposalService } from '../src/context/ContextProposalService';
import { computeSourceSnapshotHash, type SourceSnapshotDraft } from '../src/contracts/contextProposal';

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-scan-bridge-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const REQUESTER = { kind: 'user' as const, id: 'cong' };
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

const ORIGINAL_REQUIREMENTS = ['# Requirements', '', '## Functional requirements', '', '- **FR-01** — Add item', '- **FR-02** — Remove item', '', '## Non-functional requirements', '', '- **NFR-PERF-01** — Loads fast', ''].join('\n');

function bootstrapFixture(root: string) {
  writeDoc(root, DOC_REQUIREMENTS, ORIGINAL_REQUIREMENTS);
  const service = new ContextBootstrapService(root, { clock: () => NOW });
  const preview = service.preview();
  return service.apply({ actor: REQUESTER, previewId: preview.previewId, sourceHashes: preview.sourceHashes });
}

function fakeSourceSnapshot() {
  const draft: SourceSnapshotDraft = { schemaVersion: 1, mode: 'filesystem', root: 'workspace', capturedAt: NOW, files: [], warnings: [] };
  return { ...draft, sourceHash: computeSourceSnapshotHash(draft) };
}

describe('buildScanProposalInputs', () => {
  it('produces no operations/groups for a document the agent never touched', () => {
    const root = newRoot();
    const { revision } = bootstrapFixture(root);
    const repository = new ProjectContextRepository(root);
    const result = buildScanProposalInputs({ documentPaths: [DOC_REQUIREMENTS], currentRevision: revision, repository, docsRoot: 'docs', readStagedDocument: () => undefined });
    expect(result).toEqual({ operations: [], groups: [], newObjects: [], rejectedDocuments: [] });
  });

  it('produces no operations/groups when the staged content is byte-for-byte the same content re-rendered (no real change)', () => {
    const root = newRoot();
    const { revision } = bootstrapFixture(root);
    const repository = new ProjectContextRepository(root);
    const result = buildScanProposalInputs({ documentPaths: [DOC_REQUIREMENTS], currentRevision: revision, repository, docsRoot: 'docs', readStagedDocument: () => ORIGINAL_REQUIREMENTS });
    expect(result.operations).toEqual([]);
    expect(result.groups).toEqual([]);
  });

  it('detects an add, an update, and a removal in one document, grouped together with "high" risk (removal present)', () => {
    const root = newRoot();
    const { revision } = bootstrapFixture(root);
    const repository = new ProjectContextRepository(root);
    const staged = ['# Requirements', '', '## Functional requirements', '', '- **FR-01** — Add item to the shared list', '- **FR-03** — Share list', '', '## Non-functional requirements', '', '- **NFR-PERF-01** — Loads fast', ''].join('\n');

    const result = buildScanProposalInputs({ documentPaths: [DOC_REQUIREMENTS], currentRevision: revision, repository, docsRoot: 'docs', readStagedDocument: () => staged });

    expect(result.rejectedDocuments).toEqual([]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.risk).toBe('high'); // FR-02 removed
    const kinds = result.operations.map((op) => op.value.kind).sort();
    expect(kinds).toEqual(['entity.add', 'entity.remove', 'entity.update']);

    const addOp = result.operations.find((op) => op.value.kind === 'entity.add')!;
    expect((addOp.value as { entityKey: string }).entityKey).toBe('FR-03');
    const updateOp = result.operations.find((op) => op.value.kind === 'entity.update')!;
    expect((updateOp.value as { entityKey: string }).entityKey).toBe('FR-01');
    const removeOp = result.operations.find((op) => op.value.kind === 'entity.remove')!;
    expect((removeOp.value as { entityKey: string }).entityKey).toBe('FR-02');
  });

  it('marks a pure addition as "low" risk and a pure update (no removal) as "medium"', () => {
    const root = newRoot();
    const { revision } = bootstrapFixture(root);
    const repository = new ProjectContextRepository(root);

    const additionOnly = ['# Requirements', '', '## Functional requirements', '', '- **FR-01** — Add item', '- **FR-02** — Remove item', '- **FR-03** — Share list', '', '## Non-functional requirements', '', '- **NFR-PERF-01** — Loads fast', ''].join('\n');
    const additionResult = buildScanProposalInputs({ documentPaths: [DOC_REQUIREMENTS], currentRevision: revision, repository, docsRoot: 'docs', readStagedDocument: () => additionOnly });
    expect(additionResult.groups[0]!.risk).toBe('low');

    const updateOnly = ['# Requirements', '', '## Functional requirements', '', '- **FR-01** — Add an item to the shared list', '- **FR-02** — Remove item', '', '## Non-functional requirements', '', '- **NFR-PERF-01** — Loads fast', ''].join('\n');
    const updateResult = buildScanProposalInputs({ documentPaths: [DOC_REQUIREMENTS], currentRevision: revision, repository, docsRoot: 'docs', readStagedDocument: () => updateOnly });
    expect(updateResult.groups[0]!.risk).toBe('medium');
  });

  it('detects a document.meta.update when the title changes', () => {
    const root = newRoot();
    const { revision } = bootstrapFixture(root);
    const repository = new ProjectContextRepository(root);
    const staged = ORIGINAL_REQUIREMENTS.replace('# Requirements', '# Product Requirements');

    const result = buildScanProposalInputs({ documentPaths: [DOC_REQUIREMENTS], currentRevision: revision, repository, docsRoot: 'docs', readStagedDocument: () => staged });
    expect(result.operations.some((op) => op.value.kind === 'document.meta.update')).toBe(true);
    expect(result.groups[0]!.risk).toBe('high');
  });

  it('rejects a document whose staged content does not round-trip, without proposing any operation for it', () => {
    const root = newRoot();
    const { revision } = bootstrapFixture(root);
    const repository = new ProjectContextRepository(root);
    const broken = ['# Requirements', '', '## Functional requirements', '', 'Just some prose someone typed here instead of a bullet.', '', '## Non-functional requirements', '', '- **NFR-PERF-01** — Loads fast', ''].join('\n');

    const result = buildScanProposalInputs({ documentPaths: [DOC_REQUIREMENTS], currentRevision: revision, repository, docsRoot: 'docs', readStagedDocument: () => broken });
    expect(result.operations).toEqual([]);
    expect(result.groups).toEqual([]);
    expect(result.rejectedDocuments).toHaveLength(1);
    expect(result.rejectedDocuments[0]!.documentPath).toBe(DOC_REQUIREMENTS);
    expect(result.rejectedDocuments[0]!.reasons.join(' ')).toContain('Functional requirements');
  });

  it('end to end: the built inputs are directly consumable by ContextProposalService.start/finish/approve/apply', () => {
    const root = newRoot();
    const { revision } = bootstrapFixture(root);
    const repository = new ProjectContextRepository(root);
    const store = new ContextProposalStore(root);
    const service = new ContextProposalService(root, { clock: () => NOW, repository, store });
    const staged = ['# Requirements', '', '## Functional requirements', '', '- **FR-01** — Add an item to the shared list', '', '## Non-functional requirements', '', '- **NFR-PERF-01** — Loads fast', ''].join('\n');

    const built = buildScanProposalInputs({ documentPaths: [DOC_REQUIREMENTS], currentRevision: revision, repository, docsRoot: 'docs', readStagedDocument: () => staged });
    const head = repository.requireHead();
    const { proposal: draft } = service.start({
      commandId: nextCommandId(),
      actor: REQUESTER,
      origin: 'scan',
      contextGuard: { expectedRevisionId: head.currentRevisionId, expectedRootHash: head.rootHash },
      sourceSnapshot: fakeSourceSnapshot(),
      operations: built.operations,
      groups: built.groups,
      newObjects: built.newObjects,
    });

    const review = service.finish({ commandId: nextCommandId(), actor: { kind: 'agent', id: 'discover-scan' }, proposalId: draft.id, guard: { expectedRevision: draft.revision, expectedContentHash: draft.contentHash } }).proposal;
    service.approve({ commandId: nextCommandId(), actor: { kind: 'user', id: 'reviewer' }, proposalId: review.id, guard: { expectedRevision: review.revision, expectedContentHash: review.contentHash }, groupIds: [review.groups[0]!.id] });
    const { proposal: applied } = service.apply({
      commandId: nextCommandId(),
      actor: REQUESTER,
      proposalId: review.id,
      guard: { expectedRevision: review.revision, expectedContentHash: review.contentHash },
      contextGuard: { expectedRevision: head.currentRevisionNumber, expectedContentHash: head.rootHash },
      groupIds: [review.groups[0]!.id],
    });

    expect(applied.status).toBe('applied');
    const rendered = fs.readFileSync(path.join(root, 'docs', DOC_REQUIREMENTS), 'utf8');
    expect(rendered).toContain('Add an item to the shared list');
  });
});
