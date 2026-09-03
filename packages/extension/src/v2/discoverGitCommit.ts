/**
 * Stage and commit all changes in the repo Discover treats as "home" for the
 * blueprint — the parent when the layout is multi-repo, otherwise the single
 * declared repo.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

import type { DiscoverScope } from '@aidlc/core';

import {
  discoverCommitRepoIsGit,
  discoverCommitRepoName,
  discoverRepoChangeCount,
  discoverRepoIsDirty,
  resolveDiscoverCommitRoot,
} from './discoverCommitRoot';

export {
  discoverCommitRepoIsGit,
  discoverCommitRepoName,
  discoverRepoChangeCount,
  discoverRepoIsDirty,
  resolveDiscoverCommitRoot,
} from './discoverCommitRoot';

const execFileAsync = promisify(execFile);

export interface DiscoverCommitCopy {
  notRepo: (dir: string) => string;
  nothing: (dir: string) => string;
  success: (dir: string, hash: string) => string;
  failed: (detail: string) => string;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout.trim();
}

export async function executeDiscoverCommit(
  workspaceRoot: string,
  scope: DiscoverScope | undefined,
  message: string,
  copy: DiscoverCommitCopy,
): Promise<boolean> {
  const dir = resolveDiscoverCommitRoot(workspaceRoot, scope);
  const trimmed = message.trim();
  if (!trimmed) { return false; }

  if (!fs.existsSync(dir) || !discoverCommitRepoIsGit(workspaceRoot, scope)) {
    void vscode.window.showWarningMessage(copy.notRepo(path.basename(dir)));
    return false;
  }
  if (!discoverRepoIsDirty(workspaceRoot, scope)) {
    void vscode.window.showInformationMessage(copy.nothing(path.basename(dir)));
    return false;
  }

  try {
    await git(dir, ['add', '-A']);
    await git(dir, ['commit', '-m', trimmed]);
    const hash = await git(dir, ['rev-parse', '--short', 'HEAD']);
    void vscode.window.showInformationMessage(copy.success(dir, hash));
    return true;
  } catch (error) {
    void vscode.window.showWarningMessage(copy.failed(error instanceof Error ? error.message : String(error)));
    return false;
  }
}

export interface DiscoverCommitDialogPayload {
  defaultMessage: string;
  repoName: string;
  changeCount: number;
}

/** Validate git state and build the payload for the in-webview commit dialog. */
export function prepareDiscoverCommitDialog(
  workspaceRoot: string,
  scope: DiscoverScope | undefined,
  title: string | undefined,
  copy: DiscoverCommitCopy,
): DiscoverCommitDialogPayload | 'not-repo' | 'clean' {
  const dir = resolveDiscoverCommitRoot(workspaceRoot, scope);
  if (!fs.existsSync(dir) || !discoverCommitRepoIsGit(workspaceRoot, scope)) {
    void vscode.window.showWarningMessage(copy.notRepo(path.basename(dir)));
    return 'not-repo';
  }
  if (!discoverRepoIsDirty(workspaceRoot, scope)) {
    void vscode.window.showInformationMessage(copy.nothing(path.basename(dir)));
    return 'clean';
  }
  const defaultMessage = title?.trim()
    ? `AIDLC Discover: ${title.trim()}`
    : 'AIDLC Discover: update blueprint';
  return {
    defaultMessage,
    repoName: discoverCommitRepoName(workspaceRoot, scope),
    changeCount: discoverRepoChangeCount(workspaceRoot, scope),
  };
}
