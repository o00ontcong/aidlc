/**
 * Filesystem repository for the canonical Project Context (implementation
 * plan §10, §18.2): `.aidlc/project.json` (identity, immutable),
 * `.aidlc/context/objects/<hash>.json` (immutable content objects),
 * `.aidlc/context/revisions/CTX-<Ulid>.json` (immutable revision manifests),
 * `.aidlc/context/current.json` (the one mutable pointer, CAS-guarded).
 *
 * Low-level only — bootstrap/render/proposal business rules live one layer
 * up (`ContextBootstrapService`, `ContextProjectionRenderer`,
 * `ContextProposalService`), mirroring the `ChangeStore` vs `ChangeService`
 * split already established for the Change aggregate.
 */

import * as path from 'path';

import {
  parseProjectContextHead,
  parseProjectContextRevision,
  parseProjectIdentity,
  type ProjectContextHead,
  type ProjectContextRevision,
  type ProjectIdentity,
} from '../contracts/projectContext';
import type { ContextRevisionId } from '../contracts/ids';
import { createJsonFileIfAbsent, readJsonFile } from '../storage/atomicJson';
import { AggregateConflictError, mutateAggregateFile, type VersionGuard } from '../storage/WorkspaceTransaction';

const AIDLC_DIR = '.aidlc';
const CONTEXT_DIR = 'context';
const OBJECTS_DIR = 'objects';
const REVISIONS_DIR = 'revisions';
const HEAD_FILE = 'current.json';
const IDENTITY_FILE = 'project.json';

const headAccessor = {
  parse: parseProjectContextHead,
  getRevision: (head: ProjectContextHead) => head.currentRevisionNumber,
  getContentHash: (head: ProjectContextHead) => head.rootHash,
};

export class ProjectContextRepository {
  constructor(readonly workspaceRoot: string) {}

  contextRoot(): string {
    return path.join(this.workspaceRoot, AIDLC_DIR, CONTEXT_DIR);
  }
  identityFile(): string {
    return path.join(this.workspaceRoot, AIDLC_DIR, IDENTITY_FILE);
  }
  headFile(): string {
    return path.join(this.contextRoot(), HEAD_FILE);
  }
  objectsDir(): string {
    return path.join(this.contextRoot(), OBJECTS_DIR);
  }
  objectFile(hash: string): string {
    return path.join(this.objectsDir(), `${hash}.json`);
  }
  revisionsDir(): string {
    return path.join(this.contextRoot(), REVISIONS_DIR);
  }
  revisionFile(id: ContextRevisionId): string {
    return path.join(this.revisionsDir(), `${id}.json`);
  }

  // ── ProjectIdentity ────────────────────────────────────────────

  readIdentity(): ProjectIdentity | null {
    const raw = readJsonFile<unknown>(this.identityFile());
    return raw === undefined ? null : parseProjectIdentity(raw);
  }

  requireIdentity(): ProjectIdentity {
    const identity = this.readIdentity();
    if (!identity) throw new AggregateConflictError('context.not_bootstrapped', 'This workspace has no Project Context yet — run context.bootstrap.preview / .apply first.');
    return identity;
  }

  /** Create-only; a second bootstrap attempt with an existing identity is idempotent (returns it unchanged), never a second identity. */
  writeIdentityIfAbsent(identity: ProjectIdentity): { created: boolean; identity: ProjectIdentity } {
    const { created } = createJsonFileIfAbsent(this.identityFile(), identity);
    return { created, identity: created ? identity : this.requireIdentity() };
  }

  // ── Head / Revisions ───────────────────────────────────────────

  readHead(): ProjectContextHead | null {
    const raw = readJsonFile<unknown>(this.headFile());
    return raw === undefined ? null : parseProjectContextHead(raw);
  }

  requireHead(): ProjectContextHead {
    const head = this.readHead();
    if (!head) throw new AggregateConflictError('context.not_bootstrapped', 'This workspace has no Project Context yet — run context.bootstrap.preview / .apply first.');
    return head;
  }

  readRevision(id: ContextRevisionId): ProjectContextRevision | null {
    const raw = readJsonFile<unknown>(this.revisionFile(id));
    return raw === undefined ? null : parseProjectContextRevision(raw);
  }

  requireRevision(id: ContextRevisionId): ProjectContextRevision {
    const revision = this.readRevision(id);
    if (!revision) throw new AggregateConflictError('context.revision_conflict', `Context revision ${id} was not found.`);
    return revision;
  }

  requireCurrentRevision(): ProjectContextRevision {
    return this.requireRevision(this.requireHead().currentRevisionId);
  }

  /** Bootstrap only — creates revision 0 (immutable, written once) and the head pointer atomically-in-sequence. */
  bootstrapHead(build: () => { revision: ProjectContextRevision }): ProjectContextHead {
    return mutateAggregateFile(
      this.headFile(),
      headAccessor,
      'create',
      () => {
        const { revision } = build();
        createJsonFileIfAbsent(this.revisionFile(revision.id), revision);
        const head: ProjectContextHead = {
          schemaVersion: 1,
          // The identity must already exist by the time bootstrapHead runs (ContextBootstrapService writes it first).
          projectId: this.requireIdentity().id,
          currentRevisionId: revision.id,
          currentRevisionNumber: revision.number,
          rootHash: revision.rootHash,
          updatedAt: revision.createdAt,
        };
        return head;
      },
      { errorDomain: 'context', displayId: 'Project Context' },
    ).next;
  }

  /** CAS advance from the current head to a new revision (Apply). `build` receives the current head and returns the next immutable revision (already persisted as a new file before the head is repointed). */
  advanceHead(guard: VersionGuard, build: (current: ProjectContextHead) => ProjectContextRevision): ProjectContextHead {
    return mutateAggregateFile(
      this.headFile(),
      headAccessor,
      guard,
      (current) => {
        const revision = build(current as ProjectContextHead);
        createJsonFileIfAbsent(this.revisionFile(revision.id), revision);
        const head: ProjectContextHead = {
          schemaVersion: 1,
          projectId: (current as ProjectContextHead).projectId,
          currentRevisionId: revision.id,
          currentRevisionNumber: revision.number,
          rootHash: revision.rootHash,
          updatedAt: revision.createdAt,
        };
        return head;
      },
      { errorDomain: 'context', displayId: 'Project Context' },
    ).next;
  }

  // ── Immutable content objects ──────────────────────────────────

  readObject<T = unknown>(hash: string): T | null {
    const raw = readJsonFile<T>(this.objectFile(hash));
    return raw === undefined ? null : raw;
  }

  /** Content-addressed create — a retry with the same hash is a no-op, never a second write (plan §18.2). */
  writeObjectIfAbsent(hash: string, value: unknown): { created: boolean } {
    return createJsonFileIfAbsent(this.objectFile(hash), value);
  }
}
