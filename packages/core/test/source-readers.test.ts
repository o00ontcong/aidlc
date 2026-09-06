import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { GitHeadSourceReader } from '../src/source/GitHeadSourceReader';
import { WorkingTreeSourceReader } from '../src/source/WorkingTreeSourceReader';
import { FilesystemSourceReader } from '../src/source/FilesystemSourceReader';
import { SourceReaderError } from '../src/source/ProjectSourceReader';

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-source-reader-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function write(root: string, relative: string, body = ''): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

function git(root: string, args: string[]): void {
  execFileSync('git', args, { cwd: root });
}

function initGit(root: string): void {
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.email', 'test@aidlc.dev']);
  git(root, ['config', 'user.name', 'AIDLC Test']);
}

function commitAll(root: string, message: string): void {
  git(root, ['add', '.']);
  git(root, ['commit', '--quiet', '-m', message]);
}

describe('GitHeadSourceReader', () => {
  it('reads committed HEAD content even when the working tree is dirty, and never touches the dirty content', () => {
    const root = newRoot();
    initGit(root);
    write(root, 'src/app.ts', 'export const version = 1;\n');
    commitAll(root, 'initial');

    // Dirty the tree after commit.
    write(root, 'src/app.ts', 'export const version = 999; // uncommitted\n');
    write(root, 'src/new-untracked.ts', 'export const secret = true;\n');

    const reader = new GitHeadSourceReader(root);
    const result = reader.read();

    expect(result.snapshot.mode).toBe('head');
    expect(result.snapshot.git!.dirty).toBe(true); // informational, not blocking
    const paths = result.files.map((f) => f.path).sort();
    expect(paths).toEqual(['src/app.ts']); // the dirty untracked file is invisible to this reader
    expect(result.readFile('src/app.ts')).toBe('export const version = 1;\n');
    expect(result.files.every((f) => f.status === 'tracked')).toBe(true);

    // The dirty working-tree file on disk is untouched by reading it.
    expect(fs.readFileSync(path.join(root, 'src', 'app.ts'), 'utf8')).toBe('export const version = 999; // uncommitted\n');
  });

  it('excludes AIDLC scaffolding and dependency directories even if accidentally tracked', () => {
    const root = newRoot();
    initGit(root);
    write(root, 'src/app.ts', 'ok');
    write(root, '.aidlc/context/current.json', '{}');
    write(root, 'node_modules/left-pad/index.js', 'module.exports = {};');
    commitAll(root, 'initial');

    const result = new GitHeadSourceReader(root).read();
    expect(result.files.map((f) => f.path)).toEqual(['src/app.ts']);
  });

  it('throws SourceReaderError on a non-Git directory', () => {
    const root = newRoot();
    write(root, 'src/app.ts', 'ok');
    expect(() => new GitHeadSourceReader(root).read()).toThrow(SourceReaderError);
  });

  it('is deterministic — two reads of the same commit produce byte-identical snapshots (fixed capturedAt)', () => {
    const root = newRoot();
    initGit(root);
    write(root, 'src/app.ts', 'export const version = 1;\n');
    commitAll(root, 'initial');

    const clock = () => '2026-09-05T00:00:00.000Z';
    const first = new GitHeadSourceReader(root).read({ clock });
    const second = new GitHeadSourceReader(root).read({ clock });
    expect(second.snapshot).toEqual(first.snapshot);
  });

  it('reflects a new commit made between two reads as a different, still-valid snapshot (never silently stale)', () => {
    const root = newRoot();
    initGit(root);
    write(root, 'src/app.ts', 'v1');
    commitAll(root, 'initial');
    const before = new GitHeadSourceReader(root).read();

    write(root, 'src/app.ts', 'v2');
    commitAll(root, 'second');
    const after = new GitHeadSourceReader(root).read();

    expect(after.snapshot.sourceHash).not.toBe(before.snapshot.sourceHash);
    expect(after.snapshot.git!.headCommit).not.toBe(before.snapshot.git!.headCommit);
    expect(after.readFile('src/app.ts')).toBe('v2');
    // The earlier snapshot is still exactly what it claims — pinned to the OLD commit's content, not silently updated.
    expect(before.readFile('src/app.ts')).toBe('v1');
  });
});

describe('WorkingTreeSourceReader', () => {
  it('pins dirty files by content hash and status, leaving unmodified tracked files out of the inventory', () => {
    const root = newRoot();
    initGit(root);
    write(root, 'src/app.ts', 'v1');
    write(root, 'src/untouched.ts', 'stable');
    commitAll(root, 'initial');

    write(root, 'src/to-delete.ts', 'will be removed');
    commitAll(root, 'add to-delete');

    write(root, 'src/app.ts', 'v2-dirty'); // modified
    write(root, 'src/added.ts', 'new file'); // untracked
    fs.rmSync(path.join(root, 'src', 'to-delete.ts')); // deleted

    const result = new WorkingTreeSourceReader(root).read();
    expect(result.snapshot.mode).toBe('working-tree');
    expect(result.snapshot.git!.dirty).toBe(true);

    const byPath = new Map(result.files.map((f) => [f.path, f]));
    expect(byPath.get('src/app.ts')!.status).toBe('modified');
    expect(result.readFile('src/app.ts')).toBe('v2-dirty');
    expect(byPath.get('src/added.ts')!.status).toBe('untracked');
    expect(result.readFile('src/added.ts')).toBe('new file');
    expect(byPath.get('src/to-delete.ts')!.status).toBe('deleted');
    expect(result.readFile('src/to-delete.ts')).toBe('will be removed'); // last known committed content
    // untouched.ts was deleted by the test setup, not part of the intended dirty set — assert it doesn't leak in as unrelated noise beyond what git reports.
    expect([...byPath.keys()].sort()).toEqual(['src/app.ts', 'src/added.ts', 'src/to-delete.ts'].sort());
  });

  it('reports a clean tree as not dirty with no diffHash and no dirty files', () => {
    const root = newRoot();
    initGit(root);
    write(root, 'src/app.ts', 'v1');
    commitAll(root, 'initial');

    const result = new WorkingTreeSourceReader(root).read();
    expect(result.snapshot.git!.dirty).toBe(false);
    expect(result.snapshot.git!.diffHash).toBeUndefined();
    expect(result.files).toEqual([]);
  });
});

describe('FilesystemSourceReader (non-Git fallback)', () => {
  it('walks the plain filesystem, hashes content, and warns about the lack of revision pinning', () => {
    const root = newRoot();
    write(root, 'src/app.ts', 'plain content');
    write(root, 'node_modules/dep/index.js', 'ignored');

    const result = new FilesystemSourceReader(root).read();
    expect(result.snapshot.mode).toBe('filesystem');
    expect(result.snapshot.git).toBeUndefined();
    expect(result.snapshot.warnings.some((w) => w.includes('not under Git version control'))).toBe(true);
    expect(result.files.map((f) => f.path)).toEqual(['src/app.ts']);
    expect(result.files[0]!.status).toBe('untracked');
    expect(result.readFile('src/app.ts')).toBe('plain content');
  });
});
