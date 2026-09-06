/**
 * `FilesystemSourceReader` (implementation plan §11.1) — the explicit
 * non-Git fallback. No revision to pin, so it walks the plain filesystem and
 * says so plainly (`snapshot.warnings`, `mode: 'filesystem'`, no `git`
 * block) rather than pretending to the same isolation guarantee the other
 * two readers give.
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  buildExcludeSet,
  capturedAtNow,
  finalizeSourceSnapshot,
  projectRootLabel,
  sha256OfContent,
  toPosixRelative,
  type ProjectSourceReader,
  type SourceFileEntry,
  type SourceReadOptions,
  type SourceReadResult,
} from './ProjectSourceReader';
import type { SourceSnapshotDraft } from '../contracts/contextProposal';

/** Generous but finite — this reader has no Git-driven pruning (no `.gitignore`, no tracked-only filter), so a runaway walk must still stop somewhere. */
const MAX_FILES = 5000;

function walk(absDir: string, relDir: string, excludes: ReadonlySet<string>, out: string[]): void {
  if (out.length >= MAX_FILES) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    if (excludes.has(entry.name) || entry.name.startsWith('.')) continue;
    const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
    const childAbs = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      walk(childAbs, childRel, excludes, out);
      continue;
    }
    if (entry.isFile()) out.push(childRel);
  }
}

export class FilesystemSourceReader implements ProjectSourceReader {
  readonly mode = 'filesystem' as const;

  constructor(private readonly workspaceRoot: string) {}

  read(options: SourceReadOptions = {}): SourceReadResult {
    const excludes = buildExcludeSet(options);
    const relPaths: string[] = [];
    walk(this.workspaceRoot, '', excludes, relPaths);
    relPaths.sort();

    const contentByPath = new Map<string, string>();
    const files: SourceFileEntry[] = relPaths.map((relPath) => {
      let content = '';
      try {
        content = fs.readFileSync(path.join(this.workspaceRoot, relPath), 'utf8');
      } catch {
        content = '';
      }
      contentByPath.set(relPath, content);
      // Not Git-tracked by definition — 'untracked' is the closest of the locked SourceSnapshotFileStatus values.
      return { path: toPosixRelative(relPath), contentHash: sha256OfContent(content), status: 'untracked' as const };
    });

    const warnings = ['This project is not under Git version control (or Git is unavailable); scanning reflects raw filesystem state with no revision pinning or drift detection.'];
    if (relPaths.length >= MAX_FILES) warnings.push(`Inventory truncated at ${MAX_FILES} files.`);

    const draft: SourceSnapshotDraft = {
      schemaVersion: 1,
      mode: 'filesystem',
      root: projectRootLabel(this.workspaceRoot, options),
      capturedAt: capturedAtNow(options),
      files: files.map(({ path: relPath, contentHash, status }) => ({ path: relPath, contentHash, status })),
      warnings,
    };

    return {
      snapshot: finalizeSourceSnapshot(draft),
      files,
      readFile: (relativePath) => contentByPath.get(toPosixRelative(relativePath)),
    };
  }
}
