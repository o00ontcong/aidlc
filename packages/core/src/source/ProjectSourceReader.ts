/**
 * `ProjectSourceReader` (implementation plan §5.1, §11.1) — the abstraction
 * that keeps a scan from accidentally reading a team member's dirty working
 * tree. Three implementations share this contract:
 *
 *   - {@link GitHeadSourceReader} — committed `HEAD` only, via Git object
 *     access (`git ls-tree`, `git show`); never touches the filesystem for
 *     source content. The default reader, even when the tree is dirty.
 *   - {@link WorkingTreeSourceReader} — HEAD as a baseline, plus the dirty
 *     files layered on top (pinned by content hash); only used when a human
 *     explicitly opts into "Include local WIP".
 *   - {@link FilesystemSourceReader} — the non-Git fallback; walks the plain
 *     filesystem and says so in `snapshot.warnings`.
 *
 * Each reader targets one repository root (one Git working directory, or one
 * plain folder for the filesystem fallback) — a multi-repo `DiscoverScope`
 * composes one reader instance per declared repo path; that composition is
 * the caller's job, not this contract's.
 *
 * Output is always a `SourceSnapshot` (contracts/contextProposal.ts, already
 * locked by M4) — the exact shape `ContextProposalService.start()` consumes
 * as `sourceSnapshot`, so a scan-to-proposal bridge (a later pass) needs no
 * translation layer between "what a reader saw" and "what a proposal pins".
 */

import * as path from 'path';
import { execFileSync } from 'child_process';
import * as crypto from 'crypto';

import { computeSourceSnapshotHash, parseSourceSnapshot, type SourceSnapshot, type SourceSnapshotDraft, type SourceSnapshotFileStatus, type SourceSnapshotMode } from '../contracts/contextProposal';
import { EXCLUDED_DIRS } from '../discover/sourceScope';

/** Directory names never treated as project source, regardless of reader — the AIDLC scaffolding's own tooling, build output, and dependency trees. Reuses the same list `discoverScan.ts`'s inventory walk already tunes (`discover/sourceScope.ts`). */
export const DEFAULT_SOURCE_EXCLUDES: readonly string[] = EXCLUDED_DIRS;

/** Thrown when a reader's own precondition isn't met (e.g. `GitHeadSourceReader` pointed at a non-Git folder) — a caller picks the wrong reader, this never silently degrades to a different mode. */
export class SourceReaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceReaderError';
  }
}

export interface SourceReadOptions {
  /** Extra directory names to exclude, beyond {@link DEFAULT_SOURCE_EXCLUDES}. */
  excludes?: readonly string[];
  /** Logical project label embedded in the snapshot's `root` — never an absolute filesystem path. Defaults to the workspace root's basename. */
  projectRoot?: string;
  /** Override for `capturedAt`, for deterministic tests. */
  clock?: () => string;
}

export interface SourceFileEntry {
  /** POSIX, workspace-relative. */
  path: string;
  contentHash: string;
  status: SourceSnapshotFileStatus;
}

export interface SourceReadResult {
  snapshot: SourceSnapshot;
  /** Same entries as `snapshot.files`, typed and exposed directly for convenience. */
  files: SourceFileEntry[];
  /**
   * The exact content this snapshot hashed for `relativePath` — `undefined`
   * if that path isn't part of this snapshot. `WorkingTreeSourceReader` only
   * covers the *dirty* files this way (see its own doc comment); a caller
   * needing an unmodified file's content reads it via a `GitHeadSourceReader`
   * on the same root instead.
   */
  readFile(relativePath: string): string | undefined;
}

export interface ProjectSourceReader {
  readonly mode: SourceSnapshotMode;
  read(options?: SourceReadOptions): SourceReadResult;
}

/** `git <args>` in `cwd`; `undefined` on any failure (not a repo, bad ref, ...) rather than throwing — callers decide what a missing result means. */
export function runGit(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return undefined;
  }
}

/** SHA-256 of raw bytes — deliberately not `contracts/hash.ts`'s `sha256Hex` (that hashes `canonicalJson(value)`, meant for structured values; a file's content hash should match what `sha256sum` would report, not `sha256(JSON.stringify(content))`). */
export function sha256OfContent(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function toPosixRelative(relPath: string): string {
  return relPath.split(path.sep).join('/');
}

/** True if any *directory* segment (every segment but the last) is excluded by name or is dot-prefixed — mirrors the walk-time decision `discover/sourceScope.ts` already makes, applied post-hoc so it works equally well against `git ls-tree`'s flat output. */
export function isExcludedPath(relPath: string, excludes: ReadonlySet<string>): boolean {
  const segments = toPosixRelative(relPath).split('/');
  const dirSegments = segments.slice(0, -1);
  return dirSegments.some((segment) => excludes.has(segment) || segment.startsWith('.'));
}

export function buildExcludeSet(options: SourceReadOptions | undefined): Set<string> {
  return new Set([...DEFAULT_SOURCE_EXCLUDES, ...(options?.excludes ?? [])]);
}

export function projectRootLabel(workspaceRoot: string, options: SourceReadOptions | undefined): string {
  return options?.projectRoot ?? path.basename(workspaceRoot);
}

export function capturedAtNow(options: SourceReadOptions | undefined): string {
  return options?.clock ? options.clock() : new Date().toISOString();
}

/** Validate + finalize a draft into a real `SourceSnapshot` — every reader ends here so a malformed snapshot fails loudly instead of reaching `ContextProposalService.start()` and failing there instead, further from the cause. */
export function finalizeSourceSnapshot(draft: SourceSnapshotDraft): SourceSnapshot {
  return parseSourceSnapshot({ ...draft, sourceHash: computeSourceSnapshotHash(draft) });
}
