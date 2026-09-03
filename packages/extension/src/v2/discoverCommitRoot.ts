import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import type { DiscoverScope } from '@aidlc/core';

/** Which directory gets `git add -A && git commit`. */
export function resolveDiscoverCommitRoot(workspaceRoot: string, scope?: DiscoverScope): string {
  if (!scope) { return workspaceRoot; }
  if (scope.layout === 'parent') { return workspaceRoot; }
  if (scope.repos.length === 1) {
    const rel = scope.repos[0]!.path;
    return rel === '.' ? workspaceRoot : path.join(workspaceRoot, rel);
  }
  return workspaceRoot;
}

function gitLines(cwd: string, args: string[]): string[] {
  try {
    const out = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim() ? out.trim().split('\n') : [];
  } catch {
    return [];
  }
}

/** Whether the commit-target repo has unstaged or uncommitted changes. */
export function discoverRepoIsDirty(workspaceRoot: string, scope?: DiscoverScope): boolean {
  const dir = resolveDiscoverCommitRoot(workspaceRoot, scope);
  if (!fs.existsSync(dir)) { return false; }
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd: dir, stdio: 'ignore' });
  } catch {
    return false;
  }
  return gitLines(dir, ['status', '--porcelain']).length > 0;
}

/** Count of changed paths in the commit-target repo (for the commit dialog). */
export function discoverRepoChangeCount(workspaceRoot: string, scope?: DiscoverScope): number {
  const dir = resolveDiscoverCommitRoot(workspaceRoot, scope);
  if (!fs.existsSync(dir)) { return 0; }
  return gitLines(dir, ['status', '--porcelain']).length;
}

export function discoverCommitRepoName(workspaceRoot: string, scope?: DiscoverScope): string {
  return path.basename(resolveDiscoverCommitRoot(workspaceRoot, scope));
}

export function discoverCommitRepoIsGit(workspaceRoot: string, scope?: DiscoverScope): boolean {
  const dir = resolveDiscoverCommitRoot(workspaceRoot, scope);
  if (!fs.existsSync(dir)) { return false; }
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd: dir, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
