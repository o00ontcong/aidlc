import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DOC_IDEA, DOC_REQUIREMENTS, getFileSpec } from '../src/discover/DocSpec';
import { ContextBootstrapService } from '../src/context/ContextBootstrapService';
import { ProjectContextRepository } from '../src/context/ProjectContextRepository';
import { ContextProjectionRenderer } from '../src/context/ContextProjectionRenderer';
import { ContextApplyTransaction } from '../src/context/ContextApplyTransaction';
import { extractManagedDocument, renderManagedDocument } from '../src/context/ContextMarkdownBridge';
import { computeContextObjectHash, computeContextRootHash, type ContextObject, type ItemContextObject, type ProjectContextRevision } from '../src/contracts/projectContext';
import { generateContextProposalId, generateContextRevisionId, generateTransactionId } from '../src/contracts/ids';
import { sha256Hex } from '../src/contracts/hash';
import { writeJsonFileAtomic } from '../src/storage/atomicJson';

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-context-apply-txn-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const USER = { kind: 'user' as const, id: 'cong' };
const NOW = '2026-09-05T00:00:00.000Z';

function writeDoc(root: string, docPath: string, content: string): void {
  const file = path.join(root, 'docs', docPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function bootstrapFixture(root: string) {
  writeDoc(root, DOC_IDEA, ['# Idea', '', '## Original sentence', '', 'A shopping list app.', ''].join('\n'));
  writeDoc(root, DOC_REQUIREMENTS, ['# Requirements', '', '## Functional requirements', '', '- **FR-01** — Add item', '- **FR-02** — Remove item', '- **FR-03** — Share list', '', '## Non-functional requirements', '', '- **NFR-PERF-01** — Loads fast', ''].join('\n'));
  const service = new ContextBootstrapService(root, { clock: () => NOW });
  const preview = service.preview();
  return service.apply({ actor: USER, previewId: preview.previewId, sourceHashes: preview.sourceHashes });
}

/** Build a revision identical to `base` except FR-01's title is replaced, writing the new object + the new revision file (mirrors what ContextProposalService.apply would do before invoking the transaction). */
function buildEditedRevision(root: string, repository: ProjectContextRepository, base: ProjectContextRevision, newTitle: string): ProjectContextRevision {
  const fileSpec = getFileSpec(DOC_REQUIREMENTS)!;
  const rendered = new ContextProjectionRenderer(repository, 'docs').renderManagedDocumentContent(base, DOC_REQUIREMENTS);
  const current = extractManagedDocument(fileSpec, rendered);
  const currentFr01 = current.sections.functional!.objects.find((o) => o.entityKey === 'FR-01')! as ItemContextObject;
  const editedFr01: ItemContextObject = { ...currentFr01, title: newTitle };
  repository.writeObjectIfAbsent(computeContextObjectHash(editedFr01), editedFr01);

  const entityObjectHashes = { ...base.entityObjectHashes, 'FR-01': computeContextObjectHash(editedFr01) };
  const sectionsAsPlainObjects: Record<string, ContextObject[]> = {};
  for (const [key, section] of Object.entries(current.sections)) {
    sectionsAsPlainObjects[key] = section.objects.map((object) => (object.entityKey === 'FR-01' ? editedFr01 : object));
  }
  const reRendered = renderManagedDocument(fileSpec, current.meta, sectionsAsPlainObjects);

  const managedDocuments = {
    ...base.managedDocuments,
    [DOC_REQUIREMENTS]: { ...base.managedDocuments[DOC_REQUIREMENTS]!, projectionHash: sha256Hex(reRendered) },
  };

  const draft = {
    schemaVersion: 1 as const,
    id: generateContextRevisionId(),
    number: base.number + 1,
    parentRevisionId: base.id,
    docSpecVersion: 1 as const,
    createdAt: NOW,
    createdBy: USER,
    managedDocuments,
    supplementalDocuments: base.supplementalDocuments,
    entityObjectHashes,
  };
  return { ...draft, rootHash: computeContextRootHash(draft) };
}

describe('ContextApplyTransaction.run', () => {
  it('advances the head, renders only the affected document, and leaves everything else untouched', () => {
    const root = newRoot();
    const { revision: base } = bootstrapFixture(root);
    const repository = new ProjectContextRepository(root);
    const renderer = new ContextProjectionRenderer(repository, 'docs');
    const txn = new ContextApplyTransaction(root, repository, renderer, () => NOW);

    const before = fs.readFileSync(path.join(root, 'docs', DOC_IDEA), 'utf8');
    const next = buildEditedRevision(root, repository, base, 'Add item to the shared list');
    const head = repository.requireHead();
    const result = txn.run({ proposalId: generateContextProposalId(), actor: USER, guard: { expectedRevision: head.currentRevisionNumber, expectedContentHash: head.rootHash }, afterRevision: next });

    expect(result.renderedPaths).toEqual([DOC_REQUIREMENTS]);
    expect(result.head.currentRevisionId).toBe(next.id);
    expect(result.manifest.status).toBe('committed');

    const requirementsContent = fs.readFileSync(path.join(root, 'docs', DOC_REQUIREMENTS), 'utf8');
    expect(requirementsContent).toContain('Add item to the shared list');
    expect(requirementsContent).not.toContain('- **FR-01** — Add item\n');

    // IDEA.md was not part of the affected set — byte-identical to before.
    expect(fs.readFileSync(path.join(root, 'docs', DOC_IDEA), 'utf8')).toBe(before);
  });

  it('throws storage.recovery_required if the rendered content does not match the revision\'s recorded projectionHash', () => {
    const root = newRoot();
    const { revision: base } = bootstrapFixture(root);
    const repository = new ProjectContextRepository(root);
    const renderer = new ContextProjectionRenderer(repository, 'docs');
    const txn = new ContextApplyTransaction(root, repository, renderer, () => NOW);

    const next = buildEditedRevision(root, repository, base, 'Add item to the shared list');
    const corrupted: ProjectContextRevision = { ...next, managedDocuments: { ...next.managedDocuments, [DOC_REQUIREMENTS]: { ...next.managedDocuments[DOC_REQUIREMENTS]!, projectionHash: 'f'.repeat(64) } } };
    const head = repository.requireHead();
    expect(() =>
      txn.run({ proposalId: generateContextProposalId(), actor: USER, guard: { expectedRevision: head.currentRevisionNumber, expectedContentHash: head.rootHash }, afterRevision: corrupted }),
    ).toThrow(/does not match its recorded projectionHash/);
  });
});

describe('ContextApplyTransaction.recoverPending', () => {
  it('rolls a transaction forward when the pointer already moved but rendering never finished (simulated crash)', () => {
    const root = newRoot();
    const { revision: base } = bootstrapFixture(root);
    const repository = new ProjectContextRepository(root);
    const renderer = new ContextProjectionRenderer(repository, 'docs');
    const txn = new ContextApplyTransaction(root, repository, renderer, () => NOW);

    const next = buildEditedRevision(root, repository, base, 'Add item to the shared list');
    const head = repository.requireHead();
    // Simulate steps 2-4 having happened (manifest written, pointer advanced) but the crash landing before rendering.
    repository.advanceHead({ expectedRevision: head.currentRevisionNumber, expectedContentHash: head.rootHash }, () => next);
    const manifestId = generateTransactionId();
    writeJsonFileAtomic(txn.manifestFile(manifestId), {
      schemaVersion: 1,
      id: manifestId,
      proposalId: generateContextProposalId(),
      status: 'prepared',
      beforeRevisionId: base.id,
      afterRevisionId: next.id,
      affectedDocumentPaths: [DOC_REQUIREMENTS],
      createdAt: NOW,
      createdBy: USER,
    });

    expect(fs.readFileSync(path.join(root, 'docs', DOC_REQUIREMENTS), 'utf8')).not.toContain('Add item to the shared list');

    const outcomes = txn.recoverPending();
    expect(outcomes).toEqual([{ id: manifestId, outcome: 'rolled-forward' }]);
    expect(fs.readFileSync(path.join(root, 'docs', DOC_REQUIREMENTS), 'utf8')).toContain('Add item to the shared list');
    expect(txn.readManifest(manifestId)!.status).toBe('committed');
  });

  it('marks a transaction aborted when its afterRevisionId never became the canonical head', () => {
    const root = newRoot();
    bootstrapFixture(root);
    const repository = new ProjectContextRepository(root);
    const renderer = new ContextProjectionRenderer(repository, 'docs');
    const txn = new ContextApplyTransaction(root, repository, renderer, () => NOW);

    const manifestId = generateTransactionId();
    writeJsonFileAtomic(txn.manifestFile(manifestId), {
      schemaVersion: 1,
      id: manifestId,
      proposalId: generateContextProposalId(),
      status: 'prepared',
      beforeRevisionId: repository.requireHead().currentRevisionId,
      afterRevisionId: generateContextRevisionId(), // never actually created
      affectedDocumentPaths: [DOC_REQUIREMENTS],
      createdAt: NOW,
      createdBy: USER,
    });

    const outcomes = txn.recoverPending();
    expect(outcomes).toEqual([{ id: manifestId, outcome: 'aborted' }]);
    expect(txn.readManifest(manifestId)!.status).toBe('aborted');
  });

  it('leaves an already-committed manifest untouched', () => {
    const root = newRoot();
    const { revision: base } = bootstrapFixture(root);
    const repository = new ProjectContextRepository(root);
    const renderer = new ContextProjectionRenderer(repository, 'docs');
    const txn = new ContextApplyTransaction(root, repository, renderer, () => NOW);
    const next = buildEditedRevision(root, repository, base, 'Add item to the shared list');
    const head = repository.requireHead();
    txn.run({ proposalId: generateContextProposalId(), actor: USER, guard: { expectedRevision: head.currentRevisionNumber, expectedContentHash: head.rootHash }, afterRevision: next });

    expect(txn.recoverPending()).toEqual([]);
  });
});
