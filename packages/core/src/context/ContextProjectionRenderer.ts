/**
 * Renders the canonical Project Context out to the 14 managed Markdown
 * files + supplemental docs (implementation plan §10, §18.2 renderer
 * rules) — reads objects back out of `ProjectContextRepository` for a
 * given revision and calls `ContextMarkdownBridge.renderManagedDocument`;
 * only ever writes the *affected* set for a transaction (§18.2: "Chi render
 * file nam trong affected set").
 */

import * as fs from 'fs';
import * as path from 'path';

import { sha256Hex } from '../contracts/hash';
import type {
  ContextObject,
  ManagedDocumentMetaObject,
  ProjectContextRevision,
  SupplementalDocumentObject,
} from '../contracts/projectContext';
import { getFileSpec } from '../discover/DocSpec';
import { writeTextFileAtomic } from '../storage/atomicJson';
import { AggregateConflictError } from '../storage/WorkspaceTransaction';
import { renderManagedDocument } from './ContextMarkdownBridge';
import { ProjectContextRepository } from './ProjectContextRepository';

export interface LoadedManagedDocument {
  meta: ManagedDocumentMetaObject;
  sections: Record<string, ContextObject[]>;
}

export class ContextProjectionRenderer {
  constructor(
    private readonly repository: ProjectContextRepository,
    private readonly docsRoot: string,
  ) {}

  /** Every object a managed document's manifest references, for one revision. Throws `storage.recovery_required` if an object went missing — never silently renders stale/partial content. */
  loadManagedDocument(revision: ProjectContextRevision, documentPath: string): LoadedManagedDocument {
    const manifest = revision.managedDocuments[documentPath];
    if (!manifest) throw new Error(`${documentPath} is not part of context revision ${revision.id}.`);
    const meta = this.repository.readObject<ManagedDocumentMetaObject>(manifest.metaObjectHash);
    if (!meta) throw new AggregateConflictError('storage.recovery_required', `Missing meta object for ${documentPath} at revision ${revision.id}.`, { documentPath, revisionId: revision.id });

    const sections: Record<string, ContextObject[]> = {};
    for (const [sectionKey, sectionManifest] of Object.entries(manifest.sections)) {
      sections[sectionKey] = sectionManifest.entityKeys.map((entityKey) => {
        const hash = revision.entityObjectHashes[entityKey];
        if (!hash) throw new AggregateConflictError('storage.recovery_required', `No object hash recorded for entity "${entityKey}" at revision ${revision.id}.`, { entityKey, revisionId: revision.id });
        const object = this.repository.readObject<ContextObject>(hash);
        if (!object) throw new AggregateConflictError('storage.recovery_required', `Missing object for entity "${entityKey}" (hash ${hash}) at revision ${revision.id}.`, { entityKey, hash, revisionId: revision.id });
        return object;
      });
    }
    return { meta, sections };
  }

  renderManagedDocumentContent(revision: ProjectContextRevision, documentPath: string): string {
    const fileSpec = getFileSpec(documentPath);
    if (!fileSpec) throw new Error(`${documentPath} is not a managed document.`);
    const { meta, sections } = this.loadManagedDocument(revision, documentPath);
    return renderManagedDocument(fileSpec, meta, sections);
  }

  renderSupplementalDocumentContent(revision: ProjectContextRevision, documentPath: string): string {
    const manifest = revision.supplementalDocuments[documentPath];
    if (!manifest) throw new Error(`${documentPath} is not part of context revision ${revision.id}'s supplemental documents.`);
    const object = this.repository.readObject<SupplementalDocumentObject>(manifest.objectHash);
    if (!object) throw new AggregateConflictError('storage.recovery_required', `Missing supplemental object for ${documentPath} at revision ${revision.id}.`, { documentPath, revisionId: revision.id });
    return object.markdown;
  }

  isManagedDocument(documentPath: string): boolean {
    return !!getFileSpec(documentPath);
  }

  renderDocumentContent(revision: ProjectContextRevision, documentPath: string): string {
    return this.isManagedDocument(documentPath) ? this.renderManagedDocumentContent(revision, documentPath) : this.renderSupplementalDocumentContent(revision, documentPath);
  }

  expectedProjectionHash(revision: ProjectContextRevision, documentPath: string): string | undefined {
    return revision.managedDocuments[documentPath]?.projectionHash ?? revision.supplementalDocuments[documentPath]?.projectionHash;
  }

  /** Document paths whose rendered content would differ between two revisions — the transaction's "affected set" (plan §18.2). `before` is `undefined` for a from-scratch render (e.g. recovery with no prior revision). */
  computeAffectedDocumentPaths(before: ProjectContextRevision | undefined, after: ProjectContextRevision): string[] {
    const affected = new Set<string>();
    const beforeManaged = before?.managedDocuments ?? {};
    for (const docPath of new Set([...Object.keys(beforeManaged), ...Object.keys(after.managedDocuments)])) {
      if (beforeManaged[docPath]?.projectionHash !== after.managedDocuments[docPath]?.projectionHash) affected.add(docPath);
    }
    const beforeSupplemental = before?.supplementalDocuments ?? {};
    for (const docPath of new Set([...Object.keys(beforeSupplemental), ...Object.keys(after.supplementalDocuments)])) {
      if (beforeSupplemental[docPath]?.projectionHash !== after.supplementalDocuments[docPath]?.projectionHash) affected.add(docPath);
    }
    return [...affected].sort();
  }

  /**
   * Render + atomically write every path in `documentPaths` under
   * `workspaceRoot/docsRoot`. Verifies the rendered byte hash against the
   * revision's recorded `projectionHash` *before* the atomic rename (plan
   * §18.2 renderer rule 4) — a mismatch means the object store and the
   * manifest disagree, which must fail loudly, not write silently-wrong
   * content.
   */
  writeDocuments(workspaceRoot: string, revision: ProjectContextRevision, documentPaths: readonly string[]): string[] {
    const written: string[] = [];
    for (const documentPath of documentPaths) {
      const content = this.renderDocumentContent(revision, documentPath);
      const expectedHash = this.expectedProjectionHash(revision, documentPath);
      const actualHash = sha256Hex(content);
      if (!expectedHash || actualHash !== expectedHash) {
        throw new AggregateConflictError('storage.recovery_required', `Rendered content for ${documentPath} does not match its recorded projectionHash at revision ${revision.id}.`, {
          documentPath,
          revisionId: revision.id,
          expectedHash: expectedHash ?? 'missing',
          actualHash,
        });
      }
      const target = path.join(workspaceRoot, this.docsRoot, documentPath);
      writeTextFileAtomic(target, content);
      // Read back what was just written (§18.2 renderer rule 6: "sau render, parse lai va so semantic
      // object hashes") — catches an OS/filesystem-level surprise (e.g. newline translation) rather than
      // trusting the write silently succeeded exactly as intended.
      const rereadContent = fs.readFileSync(target, 'utf8');
      if (rereadContent !== content) {
        throw new AggregateConflictError('storage.recovery_required', `${documentPath} did not read back identically after being written.`, { documentPath });
      }
      written.push(documentPath);
    }
    return written;
  }
}
