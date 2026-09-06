/**
 * Translate a Discover scan's staged Markdown edits into the
 * `ContextOperation`/`ContextProposalGroupInput` shapes `ContextProposalService.start()`
 * expects (implementation plan §11.2, M5).
 *
 * Why a translation layer, not the agent writing operations directly: an
 * `entity.update`/`document.meta.update` operation carries a real SHA-256
 * `beforeObjectHash`/`afterObjectHash` (contracts/contextProposal.ts) — an
 * LLM cannot compute those, and asking it to would just move the failure
 * mode from "wrote the wrong Markdown" to "hand-typed the wrong hash and the
 * schema silently trusts it" (nothing re-derives an operation's hash from
 * content the way `ProjectContextRevision.rootHash` is re-derived from its
 * own fields). So the agent keeps doing the one thing it already does
 * reliably — edit the 14 managed Markdown files against `DocSpec.ts` — but
 * into an isolated staging copy of `docsRoot`, never the live one. This
 * module is the deterministic, host-side diff between that staged copy and
 * the current canonical Project Context: it is the only thing that computes
 * real hashes, so it is the only thing that can produce a valid operation.
 *
 * Scope: only `entity.add`/`entity.update`/`entity.remove` and
 * `document.meta.update` are produced. A pure reordering (same entities,
 * new order, identical content) is not detected or proposed by this pass —
 * `entity.reorder` exists in the contract but minting a minimal, correct set
 * of reorder ops for an arbitrary permutation is a distinct algorithm this
 * milestone does not need; a scan that only reordered content produces no
 * operations for that section, which is a safe (if slightly incomplete)
 * default, not a silent data-loss risk.
 */

import {
  computeContextObjectHash,
  computeManagedDocumentMetaHash,
  type ContextObject,
  type ManagedDocumentMetaObject,
  type ProjectContextRevision,
} from '../contracts/projectContext';
import type { ContextOperationInput, ContextProposalGroupInput } from '../context/ContextProposalService';
import { ContextProjectionRenderer } from '../context/ContextProjectionRenderer';
import type { ProjectContextRepository } from '../context/ProjectContextRepository';
import { extractManagedDocument, type ExtractedManagedSection } from '../context/ContextMarkdownBridge';
import { getFileSpec } from './DocSpec';

export interface ScanProposalDocumentRejection {
  documentPath: string;
  reasons: string[];
}

export interface ScanProposalBuild {
  operations: ContextOperationInput[];
  groups: ContextProposalGroupInput[];
  newObjects: unknown[];
  /** Documents whose staged content could not be trusted (fails the parse → render → parse round trip) — excluded from `operations`/`groups`, never silently folded in. */
  rejectedDocuments: ScanProposalDocumentRejection[];
}

function flattenSections(sections: Record<string, ContextObject[]>): Map<string, ContextObject> {
  const byKey = new Map<string, ContextObject>();
  for (const objects of Object.values(sections)) {
    for (const object of objects) byKey.set(object.entityKey, object);
  }
  return byKey;
}

function flattenExtractedSections(sections: Record<string, ExtractedManagedSection>): Map<string, ContextObject> {
  const byKey = new Map<string, ContextObject>();
  for (const section of Object.values(sections)) {
    for (const object of section.objects) byKey.set(object.entityKey, object);
  }
  return byKey;
}

/**
 * Diff one managed document's staged content against the current canonical
 * revision. Returns `undefined` (with a rejection reason) when the staged
 * content doesn't round-trip — the same "cannot represent faithfully" check
 * `ContextBootstrapService.preview()` already applies to the original 14
 * files, applied here to whatever the agent produced.
 */
function diffDocument(
  documentPath: string,
  stagedContent: string,
  currentRevision: ProjectContextRevision,
  renderer: ContextProjectionRenderer,
): { operations: ContextOperationInput[]; newObjects: unknown[] } | { rejected: string[] } {
  const fileSpec = getFileSpec(documentPath);
  if (!fileSpec) return { rejected: [`${documentPath} is not a managed document.`] };

  const staged = extractManagedDocument(fileSpec, stagedContent);
  if (staged.blockers.length > 0) return { rejected: staged.blockers };

  const current = renderer.loadManagedDocument(currentRevision, documentPath);
  const currentByKey = flattenSections(current.sections);
  const stagedByKey = flattenExtractedSections(staged.sections);

  const operations: ContextOperationInput[] = [];
  const newObjects: unknown[] = [];
  let opSeq = 0;
  const nextKey = () => `op-${documentPath}-${opSeq++}`;

  const currentMetaHash = computeManagedDocumentMetaHash(current.meta);
  const stagedMetaHash = computeManagedDocumentMetaHash(staged.meta);
  if (currentMetaHash !== stagedMetaHash) {
    operations.push({ key: nextKey(), value: { kind: 'document.meta.update', documentPath, beforeObjectHash: currentMetaHash, afterObjectHash: stagedMetaHash } });
    newObjects.push(staged.meta satisfies ManagedDocumentMetaObject);
  }

  for (const [entityKey, stagedObject] of stagedByKey) {
    const currentObject = currentByKey.get(entityKey);
    const afterHash = computeContextObjectHash(stagedObject);
    if (!currentObject) {
      operations.push({ key: nextKey(), value: { kind: 'entity.add', entityKey, afterObjectHash: afterHash } });
      newObjects.push(stagedObject);
      continue;
    }
    const beforeHash = computeContextObjectHash(currentObject);
    if (beforeHash !== afterHash) {
      operations.push({ key: nextKey(), value: { kind: 'entity.update', entityKey, beforeObjectHash: beforeHash, afterObjectHash: afterHash } });
      newObjects.push(stagedObject);
    }
  }

  for (const [entityKey, currentObject] of currentByKey) {
    if (stagedByKey.has(entityKey)) continue;
    operations.push({ key: nextKey(), value: { kind: 'entity.remove', entityKey, beforeObjectHash: computeContextObjectHash(currentObject) } });
  }

  return { operations, newObjects };
}

/** `'low'` for pure additions, `'medium'` once anything is updated, `'high'` once anything is removed or a document's title/preamble changes — the more disruptive a group is to review, the higher its risk. */
function riskForOperations(operations: ContextOperationInput[]): ContextProposalGroupInput['risk'] {
  if (operations.some((op) => op.value.kind === 'entity.remove' || op.value.kind === 'document.meta.update')) return 'high';
  if (operations.some((op) => op.value.kind === 'entity.update')) return 'medium';
  return 'low';
}

/**
 * Build the `start()` inputs for one scan pass. `readStagedDocument` returns
 * `undefined` for a document the agent never touched (no changes proposed
 * for it) and the staged Markdown string otherwise — the caller owns how
 * that staging area is laid out on disk (`DiscoverService`'s job, not this
 * pure function's).
 */
export function buildScanProposalInputs(params: {
  documentPaths: readonly string[];
  currentRevision: ProjectContextRevision;
  repository: ProjectContextRepository;
  docsRoot: string;
  readStagedDocument: (documentPath: string) => string | undefined;
}): ScanProposalBuild {
  const renderer = new ContextProjectionRenderer(params.repository, params.docsRoot);
  const operations: ContextOperationInput[] = [];
  const groups: ContextProposalGroupInput[] = [];
  const newObjects: unknown[] = [];
  const rejectedDocuments: ScanProposalDocumentRejection[] = [];

  for (const documentPath of params.documentPaths) {
    const stagedContent = params.readStagedDocument(documentPath);
    if (stagedContent === undefined) continue;

    const diff = diffDocument(documentPath, stagedContent, params.currentRevision, renderer);
    if ('rejected' in diff) {
      rejectedDocuments.push({ documentPath, reasons: diff.rejected });
      continue;
    }
    if (diff.operations.length === 0) continue;

    operations.push(...diff.operations);
    newObjects.push(...diff.newObjects);
    groups.push({
      key: `group-${documentPath}`,
      title: `Update ${documentPath}`,
      summary: `${diff.operations.length} change(s) from the scan.`,
      operationKeys: diff.operations.map((op) => op.key),
      affectedDocumentPaths: [documentPath],
      risk: riskForOperations(diff.operations),
    });
  }

  return { operations, groups, newObjects, rejectedDocuments };
}
