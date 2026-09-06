import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DOC_IDEA, DOC_MODULES, DOC_REQUIREMENTS } from '../src/discover/DocSpec';
import { ContextBootstrapService } from '../src/context/ContextBootstrapService';
import { ProjectContextRepository } from '../src/context/ProjectContextRepository';

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-context-bootstrap-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const USER = { kind: 'user' as const, id: 'cong' };

function writeDoc(root: string, docsRoot: string, docPath: string, content: string): void {
  const file = path.join(root, docsRoot, docPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function fixture(root: string, docsRoot = 'docs'): void {
  writeDoc(
    root,
    docsRoot,
    DOC_IDEA,
    ['# Idea', '', '## Original sentence', '', 'A shopping list app.', '', '## Problem', '', 'Lists get lost.', '', '## Users', '', '- **U-01** — Shopper', '', '## Core value', '', 'Never lose a list.', '', '## Minimum MVP', '', 'One shared list.', ''].join(
      '\n',
    ),
  );
  writeDoc(
    root,
    docsRoot,
    DOC_REQUIREMENTS,
    ['# Requirements', '', '## Functional requirements', '', '- **FR-01** — Add item', '- **FR-02** — Remove item', '- **FR-03** — Share list', '', '## Non-functional requirements', '', '- **NFR-PERF-01** — Loads fast', ''].join('\n'),
  );
  writeDoc(
    root,
    docsRoot,
    DOC_MODULES,
    ['# Modules', '', '## Modules', '', '### M-01 — Storage', '', '- **Responsibility:** Persists lists', '', '### M-02 — Sync', '', '- **Responsibility:** Syncs across devices', ''].join('\n'),
  );
}

describe('ContextBootstrapService.preview', () => {
  it('never mutates the workspace (no .aidlc/context, no rewritten managed file)', () => {
    const root = newRoot();
    fixture(root);
    const before = fs.readFileSync(path.join(root, 'docs', DOC_IDEA), 'utf8');
    const service = new ContextBootstrapService(root);
    const preview = service.preview();
    expect(preview.blockers).toEqual([]);
    expect(fs.existsSync(path.join(root, '.aidlc', 'context'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.aidlc', 'project.json'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'docs', DOC_IDEA), 'utf8')).toBe(before);
  });

  it('reports missing managed files as a warning (create-on-apply), never a blocker', () => {
    const root = newRoot();
    fixture(root); // most of the 14 files are absent on purpose
    const preview = new ContextBootstrapService(root).preview();
    expect(preview.blockers).toEqual([]);
    expect(preview.warnings.some((w) => w.includes('does not exist yet'))).toBe(true);
  });

  it('flags a duplicate entity id across two different managed files as a blocker', () => {
    const root = newRoot();
    fixture(root);
    writeDoc(root, 'docs', DOC_MODULES, ['# Modules', '', '## Modules', '', '### M-01 — Storage', '', '- **Responsibility:** Persists lists', '', '### FR-01 — Not actually a module', '', '- **Responsibility:** Oops', ''].join('\n'));
    const preview = new ContextBootstrapService(root).preview();
    expect(preview.blockers.some((b) => b.includes('Duplicate entity id "FR-01"'))).toBe(true);
  });

  it('is a stable, deterministic id and sourceHashes for the same input', () => {
    const root = newRoot();
    fixture(root);
    const a = new ContextBootstrapService(root).preview();
    const b = new ContextBootstrapService(root).preview();
    expect(a.previewId).toBe(b.previewId);
    expect(a.sourceHashes).toEqual(b.sourceHashes);
  });
});

describe('ContextBootstrapService.apply', () => {
  it('creates project.json + revision 0 + current.json from the preview, matching the parsed content', () => {
    const root = newRoot();
    fixture(root);
    const service = new ContextBootstrapService(root, { clock: () => '2026-09-05T00:00:00.000Z' });
    const preview = service.preview();
    const { head, revision } = service.apply({ actor: USER, previewId: preview.previewId, sourceHashes: preview.sourceHashes });

    expect(revision.number).toBe(0);
    expect(head.currentRevisionId).toBe(revision.id);
    expect(head.rootHash).toBe(revision.rootHash);

    const repository = new ProjectContextRepository(root);
    expect(repository.readIdentity()).toBeTruthy();
    expect(repository.readHead()).toEqual(head);
    expect(repository.readRevision(revision.id)).toEqual(revision);

    // Every managed document — including the 11 absent ones — is represented in the manifest.
    expect(Object.keys(revision.managedDocuments)).toHaveLength(14);
    expect(revision.managedDocuments[DOC_REQUIREMENTS]!.sections.functional.entityKeys).toEqual(['FR-01', 'FR-02', 'FR-03']);
  });

  it('rejects applying with a stale previewId/sourceHashes (source changed since preview)', () => {
    const root = newRoot();
    fixture(root);
    const service = new ContextBootstrapService(root);
    const preview = service.preview();
    writeDoc(root, 'docs', DOC_IDEA, ['# Idea', '', '## Original sentence', '', 'Changed after preview.', ''].join('\n'));
    expect(() => service.apply({ actor: USER, previewId: preview.previewId, sourceHashes: preview.sourceHashes })).toThrow(/source\.snapshot_changed|changed since this bootstrap preview/);
  });

  it('rejects applying when the preview has blockers', () => {
    const root = newRoot();
    fixture(root);
    writeDoc(root, 'docs', DOC_IDEA, ['# Idea', '', '## Users', '', 'Not a bullet, just prose.', ''].join('\n'));
    const service = new ContextBootstrapService(root);
    const preview = service.preview();
    expect(preview.blockers.length).toBeGreaterThan(0);
    expect(() => service.apply({ actor: USER, previewId: preview.previewId, sourceHashes: preview.sourceHashes })).toThrow(/Bootstrap cannot proceed/);
  });

  it('is idempotent: a second apply with the same content returns the existing head, never a second revision 0', () => {
    const root = newRoot();
    fixture(root);
    const service = new ContextBootstrapService(root);
    const preview1 = service.preview();
    const first = service.apply({ actor: USER, previewId: preview1.previewId, sourceHashes: preview1.sourceHashes });
    const preview2 = service.preview();
    const second = service.apply({ actor: USER, previewId: preview2.previewId, sourceHashes: preview2.sourceHashes });
    expect(second.head).toEqual(first.head);
    expect(second.revision.id).toBe(first.revision.id);
    const repository = new ProjectContextRepository(root);
    expect(fs.readdirSync(repository.revisionsDir())).toHaveLength(1);
  });
});
