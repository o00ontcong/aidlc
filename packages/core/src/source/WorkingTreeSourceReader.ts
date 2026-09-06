/**
 * `WorkingTreeSourceReader` (implementation plan §11.1) — only used when a
 * human explicitly opts into "Include local WIP". `HEAD` is still the
 * pinned baseline (`snapshot.git.headCommit`); this reader layers the dirty
 * files on top, each pinned by its own content hash and status.
 *
 * `files`/`readFile` here cover only the *dirty* set (`git status
 * --porcelain`) — an unmodified tracked file's content is unchanged from
 * `headCommit` by definition, so a caller wanting it reads a
 * `GitHeadSourceReader` on the same root instead of duplicating that content
 * into every working-tree snapshot.
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  buildExcludeSet,
  capturedAtNow,
  finalizeSourceSnapshot,
  isExcludedPath,
  projectRootLabel,
  runGit,
  sha256OfContent,
  toPosixRelative,
  SourceReaderError,
  type ProjectSourceReader,
  type SourceFileEntry,
  type SourceReadOptions,
  type SourceReadResult,
} from './ProjectSourceReader';
import type { SourceSnapshotDraft, SourceSnapshotFileStatus } from '../contracts/contextProposal';

/** One `git status --porcelain` line, parsed. Renames are simplified to "added at the new path" — the old path's disappearance is not separately represented; exhaustive rename tracking is not required by any M5 test and would add parsing surface for no pinned-hash benefit. */
function parsePorcelainLine(line: string): { path: string; status: SourceSnapshotFileStatus } | undefined {
  if (line.length < 4) return undefined;
  const indexStatus = line[0];
  const worktreeStatus = line[1];
  let rest = line.slice(3);
  const arrow = rest.indexOf(' -> ');
  if (arrow >= 0) rest = rest.slice(arrow + 4);

  let status: SourceSnapshotFileStatus;
  if (indexStatus === '?' && worktreeStatus === '?') status = 'untracked';
  else if (indexStatus === 'D' || worktreeStatus === 'D') status = 'deleted';
  else if (indexStatus === 'A') status = 'added';
  else status = 'modified';

  return { path: toPosixRelative(rest), status };
}

export class WorkingTreeSourceReader implements ProjectSourceReader {
  readonly mode = 'working-tree' as const;

  constructor(private readonly workspaceRoot: string) {}

  read(options: SourceReadOptions = {}): SourceReadResult {
    const headCommit = runGit(this.workspaceRoot, ['rev-parse', 'HEAD'])?.trim();
    if (!headCommit) {
      throw new SourceReaderError(`Not a Git repository, or HEAD has no commits, at ${this.workspaceRoot}. Use FilesystemSourceReader instead.`);
    }
    const treeHash = runGit(this.workspaceRoot, ['rev-parse', 'HEAD^{tree}'])?.trim();
    const statusOutput = runGit(this.workspaceRoot, ['status', '--porcelain']) ?? '';
    const dirty = statusOutput.trim().length > 0;
    const diffOutput = runGit(this.workspaceRoot, ['diff', 'HEAD', '--no-color']) ?? '';
    const diffHash = diffOutput.length > 0 ? sha256OfContent(diffOutput) : undefined;

    const excludes = buildExcludeSet(options);
    const dirtyEntries = statusOutput
      .split('\n')
      .map((line) => parsePorcelainLine(line))
      .filter((entry): entry is { path: string; status: SourceSnapshotFileStatus } => !!entry && !isExcludedPath(entry.path, excludes))
      .sort((a, b) => a.path.localeCompare(b.path));

    const contentByPath = new Map<string, string>();
    const files: SourceFileEntry[] = dirtyEntries.map(({ path: relPath, status }) => {
      const content = status === 'deleted'
        ? runGit(this.workspaceRoot, ['show', `HEAD:${relPath}`]) ?? ''
        : readWorkingTreeFile(this.workspaceRoot, relPath);
      contentByPath.set(relPath, content);
      return { path: relPath, contentHash: sha256OfContent(content), status };
    });

    const draft: SourceSnapshotDraft = {
      schemaVersion: 1,
      mode: 'working-tree',
      root: projectRootLabel(this.workspaceRoot, options),
      capturedAt: capturedAtNow(options),
      git: { headCommit, treeHash, diffHash, dirty },
      files: files.map(({ path: relPath, contentHash, status }) => ({ path: relPath, contentHash, status })),
      warnings: [],
    };

    return {
      snapshot: finalizeSourceSnapshot(draft),
      files,
      readFile: (relativePath) => contentByPath.get(toPosixRelative(relativePath)),
    };
  }
}

function readWorkingTreeFile(workspaceRoot: string, relPath: string): string {
  try {
    return fs.readFileSync(path.join(workspaceRoot, relPath), 'utf8');
  } catch {
    return '';
  }
}
