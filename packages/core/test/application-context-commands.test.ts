import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { AidlcApplication } from '../src/application';
import { DOC_REQUIREMENTS, getFileSpec } from '../src/discover/DocSpec';
import { extractManagedDocument } from '../src/context/ContextMarkdownBridge';
import { ContextProjectionRenderer } from '../src/context/ContextProjectionRenderer';
import { computeContextObjectHash, type ItemContextObject, type ProjectContextRevision } from '../src/contracts/projectContext';
import { computeSourceSnapshotHash, type SourceSnapshotDraft } from '../src/contracts/contextProposal';
import { generateContextProposalId } from '../src/contracts/ids';

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-application-context-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const REQUESTER = { kind: 'user' as const, id: 'cong' };
const REVIEWER = { kind: 'user' as const, id: 'other-reviewer' };
const AGENT = { kind: 'agent' as const, id: 'discover-agent' };

function fakeSourceSnapshot() {
  const draft: SourceSnapshotDraft = { schemaVersion: 1, mode: 'filesystem', root: 'workspace', capturedAt: new Date().toISOString(), files: [], warnings: [] };
  return { ...draft, sourceHash: computeSourceSnapshotHash(draft) };
}

describe('AidlcApplication context.* commands — end to end through the command bus', () => {
  it('walks bootstrap.preview -> bootstrap.apply -> proposal.start -> finish -> approve -> apply (M4 exit criteria)', async () => {
    const root = newRoot();
    fs.mkdirSync(path.join(root, 'docs', 'product'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'docs', DOC_REQUIREMENTS),
      ['# Requirements', '', '## Functional requirements', '', '- **FR-01** — Add item', '- **FR-02** — Remove item', '', '## Non-functional requirements', '', '- **NFR-PERF-01** — Loads fast', ''].join('\n'),
      'utf8',
    );

    const app = new AidlcApplication(root);

    const previewResult = await app.bus.dispatch(app.bus.command('1', 'context.bootstrap.preview', REQUESTER, {}));
    expect(previewResult.status).toBe('ok');
    const preview = previewResult.data as { previewId: string; sourceHashes: Record<string, string>; blockers: string[] };
    expect(preview.blockers).toEqual([]);

    const applyBootstrapResult = await app.bus.dispatch(app.bus.command('2', 'context.bootstrap.apply', REQUESTER, { previewId: preview.previewId, sourceHashes: preview.sourceHashes }));
    expect(applyBootstrapResult.status).toBe('ok');
    const bootstrap = applyBootstrapResult.data as { head: { currentRevisionId: string; currentRevisionNumber: number; rootHash: string }; revision: ProjectContextRevision };

    const fileSpec = getFileSpec(DOC_REQUIREMENTS)!;
    const renderer = new ContextProjectionRenderer(app.contextProposals.repository, 'docs');
    const rendered = renderer.renderManagedDocumentContent(bootstrap.revision, DOC_REQUIREMENTS);
    const extracted = extractManagedDocument(fileSpec, rendered);
    const currentFr01 = extracted.sections.functional!.objects.find((o) => o.entityKey === 'FR-01')! as ItemContextObject;
    const editedFr01: ItemContextObject = { ...currentFr01, title: 'Add an item to the shared list' };
    const beforeHash = bootstrap.revision.entityObjectHashes['FR-01']!;
    const afterHash = computeContextObjectHash(editedFr01);

    const startResult = await app.bus.dispatch(
      app.bus.command('3', 'context.proposal.start', REQUESTER, {
        origin: 'manual-correction',
        contextGuard: { expectedRevisionId: bootstrap.head.currentRevisionId, expectedRootHash: bootstrap.head.rootHash },
        sourceSnapshot: fakeSourceSnapshot(),
        operations: [{ key: 'edit-fr01', value: { kind: 'entity.update', entityKey: 'FR-01', beforeObjectHash: beforeHash, afterObjectHash: afterHash } }],
        groups: [{ key: 'g1', title: 'Reword FR-01', summary: 'Clarify FR-01', operationKeys: ['edit-fr01'], affectedDocumentPaths: [DOC_REQUIREMENTS], risk: 'low' }],
        newObjects: [editedFr01],
      }),
    );
    expect(startResult.status).toBe('ok');
    const draft = (startResult.data as { proposal: { id: string; revision: number; contentHash: string; groups: { id: string }[] } }).proposal;

    const finishResult = await app.bus.dispatch(app.bus.command('4', 'context.proposal.finish', AGENT, { proposalId: draft.id, guard: { expectedRevision: draft.revision, expectedContentHash: draft.contentHash } }));
    expect(finishResult.status).toBe('ok');
    const review = (finishResult.data as { proposal: { id: string; revision: number; contentHash: string; groups: { id: string }[] } }).proposal;

    const approveResult = await app.bus.dispatch(
      app.bus.command('5', 'context.proposal.approve', REVIEWER, { proposalId: review.id, guard: { expectedRevision: review.revision, expectedContentHash: review.contentHash }, groupIds: [review.groups[0]!.id] }),
    );
    expect(approveResult.status).toBe('ok');

    const head = app.contextProposals.repository.requireHead();
    const applyProposalResult = await app.bus.dispatch(
      app.bus.command('6', 'context.proposal.apply', REQUESTER, {
        proposalId: review.id,
        guard: { expectedRevision: review.revision, expectedContentHash: review.contentHash },
        contextGuard: { expectedRevision: head.currentRevisionNumber, expectedContentHash: head.rootHash },
        groupIds: [review.groups[0]!.id],
      }),
    );
    expect(applyProposalResult.status).toBe('ok');
    const applied = (applyProposalResult.data as { proposal: { status: string } }).proposal;
    expect(applied.status).toBe('applied');

    const finalContent = fs.readFileSync(path.join(root, 'docs', DOC_REQUIREMENTS), 'utf8');
    expect(finalContent).toContain('Add an item to the shared list');
  });

  it('surfaces a domain rejection (unknown proposal) as a structured CommandResult error, never a thrown exception', async () => {
    const app = new AidlcApplication(newRoot());
    const result = await app.bus.dispatch(app.bus.command('1', 'context.proposal.finish', AGENT, { proposalId: generateContextProposalId(), guard: { expectedRevision: 0, expectedContentHash: 'x'.repeat(64) } }));
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('proposal.not_found');
  });
});
