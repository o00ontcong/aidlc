/**
 * One-time import of the 14 existing managed Markdown files (+ supplemental
 * docs) into the canonical, content-addressed Project Context
 * (implementation plan §10, §18.2). Preview is read-only and mutates
 * nothing; only `apply` writes `.aidlc/project.json` + revision 0 +
 * `.aidlc/context/current.json`, and only once (idempotent by content).
 */

import * as fs from 'fs';
import * as path from 'path';

import type { ActorRef } from '../contracts/common';
import { sha256Hex } from '../contracts/hash';
import { generateContextRevisionId, generateProjectId } from '../contracts/ids';
import {
  computeContextObjectHash,
  computeContextRootHash,
  computeManagedDocumentMetaHash,
  computeSupplementalDocumentObjectHash,
  parseProjectContextRevision,
  type ContextObject,
  type ManagedDocumentManifest,
  type ManagedDocumentMetaObject,
  type ProjectContextHead,
  type ProjectContextRevision,
  type SupplementalDocumentManifest,
} from '../contracts/projectContext';
import { DEV_DOC_PATHS, DISCOVER_STEPS, allDocPaths, getFileSpec, type DocFileSpec } from '../discover/DocSpec';
import { extractManagedDocument, renderManagedDocument, type ExtractedManagedDocument } from './ContextMarkdownBridge';
import { ProjectContextRepository } from './ProjectContextRepository';
import { AggregateConflictError } from '../storage/WorkspaceTransaction';

const ADR_STEP = DISCOVER_STEPS.find((step) => step.extraDir);

export interface ContextBootstrapPreview {
  previewId: string;
  /** documentPath -> content hash as currently read (missing files hash the empty string). */
  sourceHashes: Record<string, string>;
  /** Semantic parse -> render -> parse mismatches — bootstrap cannot represent this file faithfully. */
  blockers: string[];
  /** Non-blocking notices: files that will be newly created, byte-only formatting diffs, etc. */
  warnings: string[];
  /** documentPath -> true if a byte diff exists between the file and its canonical re-render, even though semantically equal. */
  roundTripDiff: Record<string, boolean>;
}

interface PreparedDocument {
  path: string;
  fileSpec: DocFileSpec;
  extracted: ExtractedManagedDocument;
}

interface PreparedSupplementalDocument {
  path: string;
  markdown: string;
  exists: boolean;
}

function readFileOrEmpty(file: string): string {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

/** documentPaths (relative to docsRoot) of ADR files actually on disk, sorted for determinism. */
function adrDocPaths(absoluteDocsRoot: string): string[] {
  if (!ADR_STEP?.extraDir) return [];
  const dir = path.join(absoluteDocsRoot, ADR_STEP.extraDir.path);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => ADR_STEP.extraDir!.pattern.test(name))
    .sort()
    .map((name) => path.posix.join(ADR_STEP.extraDir!.path, name));
}

function objectsBySection(extracted: ExtractedManagedDocument): Record<string, ContextObject[]> {
  const out: Record<string, ContextObject[]> = {};
  for (const [key, section] of Object.entries(extracted.sections)) out[key] = section.objects;
  return out;
}

export class ContextBootstrapService {
  private readonly repository: ProjectContextRepository;
  private readonly docsRoot: string;
  private readonly clock: () => string;

  constructor(readonly workspaceRoot: string, options: { docsRoot?: string; clock?: () => string; repository?: ProjectContextRepository } = {}) {
    this.docsRoot = options.docsRoot ?? 'docs';
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.repository = options.repository ?? new ProjectContextRepository(workspaceRoot);
  }

  private absoluteDocsRoot(): string {
    return path.join(this.workspaceRoot, this.docsRoot);
  }

  private prepareManagedDocuments(): PreparedDocument[] {
    return allDocPaths().map((docPath) => {
      const fileSpec = getFileSpec(docPath)!;
      const content = readFileOrEmpty(path.join(this.absoluteDocsRoot(), docPath));
      return { path: docPath, fileSpec, extracted: extractManagedDocument(fileSpec, content) };
    });
  }

  private prepareSupplementalDocuments(): PreparedSupplementalDocument[] {
    const paths = [...DEV_DOC_PATHS, ...adrDocPaths(this.absoluteDocsRoot())];
    return paths.map((docPath) => {
      const file = path.join(this.absoluteDocsRoot(), docPath);
      const exists = fs.existsSync(file);
      return { path: docPath, markdown: exists ? fs.readFileSync(file, 'utf8') : '', exists };
    });
  }

  /** Read-only. Never touches `.aidlc/context/**` or any managed file. */
  preview(): ContextBootstrapPreview {
    const managed = this.prepareManagedDocuments();
    const supplemental = this.prepareSupplementalDocuments();

    const sourceHashes: Record<string, string> = {};
    const blockers: string[] = [];
    const warnings: string[] = [];
    const roundTripDiff: Record<string, boolean> = {};
    const seenEntityKeys = new Map<string, string>(); // entityKey -> first "documentPath#sectionKey" it appeared in

    for (const doc of managed) {
      const file = path.join(this.absoluteDocsRoot(), doc.path);
      const exists = fs.existsSync(file);
      const content = readFileOrEmpty(file);
      sourceHashes[doc.path] = sha256Hex(content);
      if (!exists) {
        warnings.push(`${doc.path} does not exist yet; bootstrap will create it as an empty managed document.`);
      }
      blockers.push(...doc.extracted.blockers);

      for (const [sectionKey, section] of Object.entries(doc.extracted.sections)) {
        for (const object of section.objects) {
          if (object.kind === 'prose') continue;
          const previousDoc = seenEntityKeys.get(object.entityKey);
          if (previousDoc) {
            blockers.push(`Duplicate entity id "${object.entityKey}" in ${doc.path}#${sectionKey} — already used in ${previousDoc}.`);
          } else {
            seenEntityKeys.set(object.entityKey, `${doc.path}#${sectionKey}`);
          }
        }
      }

      if (exists && doc.extracted.blockers.length === 0) {
        const rendered = renderManagedDocument(doc.fileSpec, doc.extracted.meta, objectsBySection(doc.extracted));
        const reExtracted = extractManagedDocument(doc.fileSpec, rendered);
        const semanticMismatch =
          JSON.stringify(reExtracted.sections) !== JSON.stringify(doc.extracted.sections) || JSON.stringify(reExtracted.meta) !== JSON.stringify(doc.extracted.meta);
        if (semanticMismatch) {
          blockers.push(`${doc.path} does not survive a parse -> render -> parse round trip; bootstrap cannot represent it faithfully yet.`);
        } else if (rendered !== content) {
          roundTripDiff[doc.path] = true;
          warnings.push(`${doc.path} will be rewritten with formatting differences only (no semantic change) once a proposal is applied.`);
        }
      }
    }

    for (const doc of supplemental) {
      sourceHashes[doc.path] = sha256Hex(doc.markdown);
      // Absent supplemental docs are simply absent — not a warning, not a blocker (plan §18.2).
    }

    const previewId = sha256Hex(sourceHashes);
    return { previewId, sourceHashes, blockers, warnings, roundTripDiff };
  }

  /**
   * Human-only, idempotent by content. If `.aidlc/context/current.json`
   * already exists, this returns the existing head unchanged (never a
   * second revision 0) — unless the current source content no longer
   * matches what was bootstrapped, in which case it fails closed (drift
   * must go through a Context Proposal, not a silent re-bootstrap).
   */
  apply(input: { actor: ActorRef; previewId: string; sourceHashes: Record<string, string> }): { head: ProjectContextHead; revision: ProjectContextRevision } {
    const fresh = this.preview();
    if (fresh.previewId !== input.previewId || JSON.stringify(fresh.sourceHashes) !== JSON.stringify(input.sourceHashes)) {
      throw new AggregateConflictError('source.snapshot_changed', 'The managed files changed since this bootstrap preview was taken; preview again before applying.', {
        expectedPreviewId: input.previewId,
        actualPreviewId: fresh.previewId,
      });
    }
    if (fresh.blockers.length > 0) {
      throw new AggregateConflictError('context.projection_drift', `Bootstrap cannot proceed: ${fresh.blockers.join(' | ')}`);
    }

    const existingHead = this.repository.readHead();
    if (existingHead) {
      return { head: existingHead, revision: this.repository.requireRevision(existingHead.currentRevisionId) };
    }

    const managed = this.prepareManagedDocuments();
    const supplemental = this.prepareSupplementalDocuments();
    const managedDocuments: Record<string, ManagedDocumentManifest> = {};
    const supplementalDocuments: Record<string, SupplementalDocumentManifest> = {};
    const entityObjectHashes: Record<string, string> = {};

    for (const doc of managed) {
      const metaHash = computeManagedDocumentMetaHash(doc.extracted.meta);
      this.repository.writeObjectIfAbsent(metaHash, doc.extracted.meta);
      const sections: ManagedDocumentManifest['sections'] = {};
      for (const [sectionKey, section] of Object.entries(doc.extracted.sections)) {
        for (const object of section.objects) {
          entityObjectHashes[object.entityKey] = computeContextObjectHash(object);
          this.repository.writeObjectIfAbsent(computeContextObjectHash(object), object);
        }
        sections[sectionKey] = { kind: section.kind, entityKeys: section.objects.map((object) => object.entityKey) };
      }
      const rendered = renderManagedDocument(doc.fileSpec, doc.extracted.meta, objectsBySection(doc.extracted));
      managedDocuments[doc.path] = { metaObjectHash: metaHash, sections, projectionHash: sha256Hex(rendered) };
    }

    for (const doc of supplemental) {
      if (!doc.exists) continue;
      const object = { schemaVersion: 1 as const, kind: 'supplemental-document' as const, documentPath: doc.path, markdown: doc.markdown };
      const objectHash = computeSupplementalDocumentObjectHash(object);
      this.repository.writeObjectIfAbsent(objectHash, object);
      supplementalDocuments[doc.path] = { objectHash, projectionHash: sha256Hex(doc.markdown) };
    }

    const identity = this.repository.readIdentity() ?? { schemaVersion: 1 as const, id: generateProjectId(), createdAt: this.clock(), createdBy: input.actor };
    this.repository.writeIdentityIfAbsent(identity);

    const draft = {
      schemaVersion: 1 as const,
      id: generateContextRevisionId(),
      number: 0,
      docSpecVersion: 1 as const,
      createdAt: this.clock(),
      createdBy: input.actor,
      managedDocuments,
      supplementalDocuments,
      entityObjectHashes,
    };
    const revision = parseProjectContextRevision({ ...draft, rootHash: computeContextRootHash(draft) });
    const head = this.repository.bootstrapHead(() => ({ revision }));
    return { head, revision };
  }
}
