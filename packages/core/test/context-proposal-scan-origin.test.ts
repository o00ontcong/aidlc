import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DOC_REQUIREMENTS } from '../src/discover/DocSpec';
import { ContextBootstrapService } from '../src/context/ContextBootstrapService';
import { ProjectContextRepository } from '../src/context/ProjectContextRepository';
import { ContextProposalStore } from '../src/context/ContextProposalStore';
import { ContextProposalService } from '../src/context/ContextProposalService';
import { GitHeadSourceReader } from '../src/source/GitHeadSourceReader';
import { ContractValidationError } from '../src/contracts/common';
import { sha256Hex } from '../src/contracts/hash';
import type { ContextOperationInput, ContextProposalGroupInput } from '../src/context/ContextProposalService';

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-scan-origin-'));
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

function initGitWithSource(root: string): void {
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@aidlc.dev'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'AIDLC Test'], { cwd: root });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'export const version = 1;\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '--quiet', '-m', 'initial'], { cwd: root });
}

function bootstrapFixture(root: string) {
  writeDoc(root, DOC_REQUIREMENTS, ['# Requirements', '', '## Functional requirements', '', '- **FR-01** — Add item', '', '## Non-functional requirements', '', '- **NFR-PERF-01** — Loads fast', ''].join('\n'));
  const service = new ContextBootstrapService(root, { clock: () => NOW });
  const preview = service.preview();
  return service.apply({ actor: REQUESTER, previewId: preview.previewId, sourceHashes: preview.sourceHashes });
}

function setup(root: string) {
  const { revision: base } = bootstrapFixture(root);
  const repository = new ProjectContextRepository(root);
  const store = new ContextProposalStore(root);
  const service = new ContextProposalService(root, { clock: () => NOW, repository, store });
  return { base, repository, store, service };
}

describe('Discover scan origin — a real GitHeadSourceReader snapshot feeds ContextProposalService.start', () => {
  it('accepts a scan-origin proposal carrying a real source snapshot pinned to HEAD', () => {
    const root = newRoot();
    initGitWithSource(root);
    const { base, service } = setup(root);

    const snapshot = new GitHeadSourceReader(root).read({ clock: () => NOW }).snapshot;
    const { proposal } = service.start({
      commandId: nextCommandId(),
      actor: REQUESTER,
      origin: 'scan',
      contextGuard: { expectedRevisionId: base.id, expectedRootHash: base.rootHash },
      sourceSnapshot: snapshot,
      operations: [],
      groups: [],
      newObjects: [],
    });

    expect(proposal.origin).toBe('scan');
    expect(proposal.sourceSnapshot.mode).toBe('head');
    expect(proposal.sourceSnapshot.git!.headCommit).toBe(snapshot.git!.headCommit);
  });

  it('rejects apply once the base Context has moved since the scan was based (needs-rebase), same as any other origin', () => {
    const root = newRoot();
    initGitWithSource(root);
    const { base, service, repository } = setup(root);
    const snapshot = new GitHeadSourceReader(root).read({ clock: () => NOW }).snapshot;

    const { proposal: scanProposal } = service.start({
      commandId: nextCommandId(),
      actor: REQUESTER,
      origin: 'scan',
      contextGuard: { expectedRevisionId: base.id, expectedRootHash: base.rootHash },
      sourceSnapshot: snapshot,
      operations: [],
      groups: [],
      newObjects: [],
    });
    const reviewProposal = service.finish({ commandId: nextCommandId(), actor: { kind: 'agent', id: 'discover-scan' }, proposalId: scanProposal.id, guard: { expectedRevision: scanProposal.revision, expectedContentHash: scanProposal.contentHash } }).proposal;

    // Move the canonical context out from under it via an unrelated, already-applied proposal.
    const otherSnapshot = new GitHeadSourceReader(root).read({ clock: () => NOW }).snapshot;
    const opKey = 'noop';
    const groups: ContextProposalGroupInput[] = [{ key: 'g', title: 'Unrelated no-op group', summary: 'n/a', operationKeys: [], affectedDocumentPaths: [], risk: 'low' }];
    // A group needs at least one operationId per contract — use a trivial supplemental.put introducing a brand-new supplemental doc, which needs no base entity.
    const supplementalObject = { schemaVersion: 1 as const, kind: 'supplemental-document' as const, documentPath: 'docs/dev/NOTES.md', markdown: 'notes' };
    const afterHash = sha256Hex(supplementalObject);
    const operations: ContextOperationInput[] = [{ key: opKey, value: { kind: 'supplemental.put', documentPath: 'docs/dev/NOTES.md', afterObjectHash: afterHash } }];
    groups[0]!.operationKeys = [opKey];
    const { proposal: otherDraft } = service.start({
      commandId: nextCommandId(),
      actor: REQUESTER,
      origin: 'manual-correction',
      contextGuard: { expectedRevisionId: base.id, expectedRootHash: base.rootHash },
      sourceSnapshot: otherSnapshot,
      operations,
      groups,
      newObjects: [supplementalObject],
    });
    const otherReview = service.finish({ commandId: nextCommandId(), actor: { kind: 'agent', id: 'x' }, proposalId: otherDraft.id, guard: { expectedRevision: otherDraft.revision, expectedContentHash: otherDraft.contentHash } }).proposal;
    service.approve({ commandId: nextCommandId(), actor: { kind: 'user', id: 'reviewer' }, proposalId: otherReview.id, guard: { expectedRevision: otherReview.revision, expectedContentHash: otherReview.contentHash }, groupIds: [otherReview.groups[0]!.id] });
    const head = repository.requireHead();
    service.apply({
      commandId: nextCommandId(),
      actor: REQUESTER,
      proposalId: otherReview.id,
      guard: { expectedRevision: otherReview.revision, expectedContentHash: otherReview.contentHash },
      contextGuard: { expectedRevision: head.currentRevisionNumber, expectedContentHash: head.rootHash },
      groupIds: [otherReview.groups[0]!.id],
    });

    // The scan proposal's own base is now stale — apply must refuse with needs-rebase, not silently proceed.
    const newHead = repository.requireHead();
    expect(() =>
      service.apply({
        commandId: nextCommandId(),
        actor: REQUESTER,
        proposalId: reviewProposal.id,
        guard: { expectedRevision: reviewProposal.revision, expectedContentHash: reviewProposal.contentHash },
        contextGuard: { expectedRevision: newHead.currentRevisionNumber, expectedContentHash: newHead.rootHash },
        groupIds: [],
      }),
    ).toThrow(/rebase before applying/);
  });

  it('two scans started back to back produce distinct proposal ids and non-colliding staging paths', () => {
    const root = newRoot();
    initGitWithSource(root);
    const { base, service, store } = setup(root);
    const snapshot = new GitHeadSourceReader(root).read({ clock: () => NOW }).snapshot;

    const { proposal: first } = service.start({ commandId: nextCommandId(), actor: REQUESTER, origin: 'scan', contextGuard: { expectedRevisionId: base.id, expectedRootHash: base.rootHash }, sourceSnapshot: snapshot, operations: [], groups: [], newObjects: [] });
    const { proposal: second } = service.start({ commandId: nextCommandId(), actor: REQUESTER, origin: 'scan', contextGuard: { expectedRevisionId: base.id, expectedRootHash: base.rootHash }, sourceSnapshot: snapshot, operations: [], groups: [], newObjects: [] });

    expect(first.id).not.toBe(second.id);
    expect(store.proposalDir(first.id)).not.toBe(store.proposalDir(second.id));
    expect(fs.existsSync(store.proposalFile(first.id))).toBe(true);
    expect(fs.existsSync(store.proposalFile(second.id))).toBe(true);
  });

  it('rejects a proposal operation whose documentPath escapes the workspace (path traversal), before it ever reaches staging', () => {
    const root = newRoot();
    initGitWithSource(root);
    const { base, service } = setup(root);
    const snapshot = new GitHeadSourceReader(root).read({ clock: () => NOW }).snapshot;

    const operations: ContextOperationInput[] = [{ key: 'op', value: { kind: 'supplemental.put', documentPath: '../../outside-workspace.md', afterObjectHash: 'f'.repeat(64) } }];
    const groups: ContextProposalGroupInput[] = [{ key: 'g', title: 'Malicious write', summary: 'n/a', operationKeys: ['op'], affectedDocumentPaths: ['../../outside-workspace.md'], risk: 'high' }];

    expect(() =>
      service.start({
        commandId: nextCommandId(),
        actor: REQUESTER,
        origin: 'scan',
        contextGuard: { expectedRevisionId: base.id, expectedRootHash: base.rootHash },
        sourceSnapshot: snapshot,
        operations,
        groups,
        newObjects: [],
      }),
    ).toThrow(ContractValidationError);
  });
});
