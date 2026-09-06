/**
 * The recoverable journal around Context Proposal Apply's one multi-file
 * step (implementation plan §9.3, §18.9): after the canonical
 * `current.json` pointer has already moved to the new revision, every
 * affected managed/supplemental Markdown file still needs to be
 * re-rendered. `run` does the whole sequence; `recoverPending` rolls a
 * crash-interrupted attempt forward (never backward — §9.3: "khong tu doan
 * rollback sau khi canonical pointer da doi").
 */

import * as fs from 'fs';
import * as path from 'path';

import type { ActorRef } from '../contracts/common';
import { generateTransactionId, type ContextProposalId, type TransactionId } from '../contracts/ids';
import {
  parseContextApplyTransactionManifest,
  type ContextApplyTransactionManifest,
} from '../contracts/contextTransaction';
import type { ProjectContextHead, ProjectContextRevision } from '../contracts/projectContext';
import { readJsonFile, writeJsonFileAtomic } from '../storage/atomicJson';
import type { VersionGuard } from '../storage/WorkspaceTransaction';
import { ContextProjectionRenderer } from './ContextProjectionRenderer';
import { ProjectContextRepository } from './ProjectContextRepository';

const AIDLC_DIR = '.aidlc';
const TRANSACTIONS_DIR = 'transactions';
const MANIFEST_FILE = 'manifest.json';

export interface ContextApplyTransactionResult {
  head: ProjectContextHead;
  renderedPaths: string[];
  manifest: ContextApplyTransactionManifest;
}

export class ContextApplyTransaction {
  constructor(
    private readonly workspaceRoot: string,
    private readonly repository: ProjectContextRepository,
    private readonly renderer: ContextProjectionRenderer,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  transactionsRoot(): string {
    return path.join(this.workspaceRoot, AIDLC_DIR, TRANSACTIONS_DIR);
  }
  transactionDir(id: TransactionId): string {
    return path.join(this.transactionsRoot(), id);
  }
  manifestFile(id: TransactionId): string {
    return path.join(this.transactionDir(id), MANIFEST_FILE);
  }

  readManifest(id: TransactionId): ContextApplyTransactionManifest | null {
    const raw = readJsonFile<unknown>(this.manifestFile(id));
    return raw === undefined ? null : parseContextApplyTransactionManifest(raw);
  }

  private writeManifest(manifest: ContextApplyTransactionManifest): void {
    writeJsonFileAtomic(this.manifestFile(manifest.id), manifest);
  }

  private listManifestIds(): TransactionId[] {
    if (!fs.existsSync(this.transactionsRoot())) return [];
    return fs.readdirSync(this.transactionsRoot()).sort() as TransactionId[];
  }

  /**
   * Steps 2-6 of §9.3: write the `prepared` manifest, advance the canonical
   * pointer (CAS-guarded), render every affected document, then mark the
   * manifest `committed`. `afterRevision` must already be fully built
   * in-memory (and its objects already durably written by the caller,
   * e.g. `ContextProposalService.apply`) — this only owns the pointer
   * switch and the render fan-out.
   */
  run(input: { proposalId: ContextProposalId; actor: ActorRef; guard: VersionGuard; afterRevision: ProjectContextRevision }): ContextApplyTransactionResult {
    const beforeRevision = this.repository.requireCurrentRevision();
    const affectedDocumentPaths = this.renderer.computeAffectedDocumentPaths(beforeRevision, input.afterRevision);

    let manifest: ContextApplyTransactionManifest = {
      schemaVersion: 1,
      id: generateTransactionId(),
      proposalId: input.proposalId,
      status: 'prepared',
      beforeRevisionId: beforeRevision.id,
      afterRevisionId: input.afterRevision.id,
      affectedDocumentPaths,
      createdAt: this.clock(),
      createdBy: input.actor,
    };
    this.writeManifest(manifest);

    const head = this.repository.advanceHead(input.guard, () => input.afterRevision);
    const renderedPaths = this.renderer.writeDocuments(this.workspaceRoot, input.afterRevision, affectedDocumentPaths);
    manifest = { ...manifest, status: 'committed' };
    this.writeManifest(manifest);

    return { head, renderedPaths, manifest };
  }

  /**
   * Roll forward every transaction still `prepared` (a crash landed between
   * the pointer switch and the final `committed` mark) and finish
   * rendering its affected set — idempotent, since rendering is a pure
   * function of an already-canonical revision. A `prepared` manifest whose
   * `afterRevisionId` never became canonical (the crash happened *before*
   * the pointer moved) is marked `aborted`: nothing durable to roll forward,
   * and it must never be mistaken for a committed one later.
   */
  recoverPending(): Array<{ id: TransactionId; outcome: 'rolled-forward' | 'aborted' }> {
    const results: Array<{ id: TransactionId; outcome: 'rolled-forward' | 'aborted' }> = [];
    const head = this.repository.readHead();
    for (const id of this.listManifestIds()) {
      const manifest = this.readManifest(id);
      if (!manifest || manifest.status !== 'prepared') continue;
      if (head && head.currentRevisionId === manifest.afterRevisionId) {
        const revision = this.repository.requireRevision(manifest.afterRevisionId);
        this.renderer.writeDocuments(this.workspaceRoot, revision, manifest.affectedDocumentPaths);
        this.writeManifest({ ...manifest, status: 'committed' });
        results.push({ id, outcome: 'rolled-forward' });
      } else {
        this.writeManifest({ ...manifest, status: 'aborted' });
        results.push({ id, outcome: 'aborted' });
      }
    }
    return results;
  }
}
