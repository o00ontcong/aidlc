/**
 * `GitHeadSourceReader` (implementation plan §11.1) — the default reader.
 * Reads inventory and content only from the committed `HEAD` tree via Git
 * object access (`git ls-tree`, `git show`) — never the working tree, even
 * when it is dirty. Dirty state is only surfaced as an informational flag
 * (`snapshot.git.dirty`); it never blocks or changes what this reader reads.
 */

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
import type { SourceSnapshotDraft } from '../contracts/contextProposal';

export class GitHeadSourceReader implements ProjectSourceReader {
  readonly mode = 'head' as const;

  constructor(private readonly workspaceRoot: string) {}

  read(options: SourceReadOptions = {}): SourceReadResult {
    const headCommit = runGit(this.workspaceRoot, ['rev-parse', 'HEAD'])?.trim();
    if (!headCommit) {
      throw new SourceReaderError(`Not a Git repository, or HEAD has no commits, at ${this.workspaceRoot}. Use FilesystemSourceReader instead.`);
    }
    const treeHash = runGit(this.workspaceRoot, ['rev-parse', 'HEAD^{tree}'])?.trim();
    const dirty = (runGit(this.workspaceRoot, ['status', '--porcelain']) ?? '').trim().length > 0;

    const excludes = buildExcludeSet(options);
    const paths = (runGit(this.workspaceRoot, ['ls-tree', '-r', '--name-only', 'HEAD']) ?? '')
      .split('\n')
      .map((line) => toPosixRelative(line.trim()))
      .filter((relPath) => relPath.length > 0 && !isExcludedPath(relPath, excludes))
      .sort();

    const contentByPath = new Map<string, string>();
    const files: SourceFileEntry[] = paths.map((relPath) => {
      // One `git show` per file — correct for any repo size this milestone targets; a `git cat-file --batch`
      // pipeline would cut subprocess overhead for very large trees, left as a known follow-up, not a correctness gap.
      const content = runGit(this.workspaceRoot, ['show', `HEAD:${relPath}`]) ?? '';
      contentByPath.set(relPath, content);
      return { path: relPath, contentHash: sha256OfContent(content), status: 'tracked' as const };
    });

    const draft: SourceSnapshotDraft = {
      schemaVersion: 1,
      mode: 'head',
      root: projectRootLabel(this.workspaceRoot, options),
      capturedAt: capturedAtNow(options),
      git: { headCommit, treeHash, dirty },
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
