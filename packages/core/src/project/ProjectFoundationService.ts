import * as crypto from 'crypto';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import {
  parseProjectFoundation,
  type FoundationDocument,
  type FoundationSnapshot,
  type FoundationStatus,
  type ProjectFoundation,
} from '../contracts/foundation';
import { nowIso } from '../contracts/common';
import { writeFileAtomic } from '../epic/EpicStore';

const FOUNDATION_DIR = '.aidlc/foundation';
const MANIFEST_FILE = 'manifest.json';

const DOCUMENTS = [
  { id: 'agents', path: 'AGENTS.md' },
  { id: 'project', path: 'PROJECT.md' },
  { id: 'status', path: 'STATUS.md' },
  { id: 'decisions', path: 'DECISIONS.md' },
] as const;

export interface ProjectFoundationStatus {
  status: FoundationStatus;
  foundation: ProjectFoundation | null;
  documents: Array<{ id: FoundationDocument['id']; path: string; exists: boolean; contentHash?: string }>;
  reason?: string;
}

export class FoundationNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FoundationNotReadyError';
  }
}

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sourceCommit(root: string): string | undefined {
  try {
    const value = childProcess.execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function manifestHash(documents: FoundationDocument[]): string {
  return sha256(JSON.stringify(documents.map(({ id, path: documentPath, contentHash }) => ({ id, path: documentPath, contentHash }))));
}

/**
 * Owns the tiny manifest which pins the project documents required before a
 * Shape can begin. The project documents themselves remain user-authored files
 * at the workspace root.
 */
export class ProjectFoundationService {
  constructor(
    readonly workspaceRoot: string,
    private readonly clock: () => string = nowIso,
    private readonly getSourceCommit: (root: string) => string | undefined = sourceCommit,
  ) {}

  manifestFile(): string {
    return path.join(this.workspaceRoot, FOUNDATION_DIR, MANIFEST_FILE);
  }

  load(): ProjectFoundation | null {
    const file = this.manifestFile();
    if (!fs.existsSync(file)) return null;
    try {
      return parseProjectFoundation(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (error) {
      throw new Error(`Invalid project Foundation manifest at ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  inspect(): ProjectFoundationStatus {
    const documents: ProjectFoundationStatus['documents'] = DOCUMENTS.map((definition) => {
      const file = path.join(this.workspaceRoot, definition.path);
      if (!fs.existsSync(file)) return { ...definition, exists: false };
      try {
        return { ...definition, exists: true, contentHash: sha256(fs.readFileSync(file)) };
      } catch {
        return { ...definition, exists: false };
      }
    });
    const manifest = this.load();
    if (documents.some((document) => !document.exists)) {
      return { status: 'incomplete', foundation: manifest, documents, reason: 'Required project context files are missing.' };
    }
    if (!manifest) {
      return { status: 'incomplete', foundation: null, documents, reason: 'Project context has not been published as a Foundation revision.' };
    }
    const currentHash = manifestHash(documents.map((document) => ({
      id: document.id,
      path: document.path,
      contentHash: document.contentHash!,
    })));
    if (currentHash !== manifest.contentHash) {
      return { status: 'stale', foundation: manifest, documents, reason: 'Project context documents changed after the Foundation was published.' };
    }
    const currentCommit = this.getSourceCommit(this.workspaceRoot);
    if (manifest.sourceCommit && currentCommit && manifest.sourceCommit !== currentCommit) {
      return { status: 'stale', foundation: manifest, documents, reason: 'The source revision changed after the Foundation was published.' };
    }
    return { status: 'ready', foundation: manifest, documents };
  }

  /** Explicit human action: snapshot current project context without editing it. */
  publish(): ProjectFoundation {
    const inspection = this.inspect();
    if (inspection.documents.some((document) => !document.exists)) {
      throw new FoundationNotReadyError('Create the missing shared project-context documents before publishing Foundation.');
    }
    // Publishing a current Foundation must be idempotent. Without this guard,
    // an accidental second click creates a new revision despite no change to
    // the project context or source commit.
    if (inspection.status === 'ready' && inspection.foundation) {
      return inspection.foundation;
    }
    const previous = this.load();
    const documents: FoundationDocument[] = inspection.documents.map((document) => ({
      id: document.id,
      path: document.path,
      contentHash: document.contentHash!,
    }));
    const foundation: ProjectFoundation = {
      schemaVersion: 1,
      revision: previous ? previous.revision + 1 : 0,
      status: 'ready',
      documents,
      contentHash: manifestHash(documents),
      sourceCommit: this.getSourceCommit(this.workspaceRoot),
      publishedAt: this.clock(),
    };
    writeFileAtomic(this.manifestFile(), `${JSON.stringify(foundation, null, 2)}\n`);
    return foundation;
  }

  requireReady(): FoundationSnapshot {
    const inspection = this.inspect();
    if (inspection.status !== 'ready' || !inspection.foundation) {
      throw new FoundationNotReadyError(inspection.reason ?? 'Project Foundation is not ready.');
    }
    const { revision, contentHash, sourceCommit: commit, publishedAt } = inspection.foundation;
    return { revision, contentHash, sourceCommit: commit, publishedAt };
  }
}
