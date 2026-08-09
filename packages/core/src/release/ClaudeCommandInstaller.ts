/**
 * Installs the thin Claude `/aidlc` command template into a workspace.
 *
 * The template is a dispatcher only — it shells out to the AIDLC CLI, which
 * shares the same AidlcApplication command bus as the Extension.
 */
import * as fs from 'fs';
import * as path from 'path';

import { writeFileAtomic } from '../epic';

const RELATIVE_TARGET = '.claude/commands/aidlc.md';

export interface ClaudeCommandInstallResult {
  path: string;
  installed: boolean;
  overwritten: boolean;
  reason: string;
}

function templateSourceCandidates(): string[] {
  return [
    // Standalone CLI bundle copies package templates beside bundle.js.
    path.join(__dirname, 'templates', 'claude', 'commands', 'aidlc.md'),
    path.join(__dirname, '..', '..', 'templates', 'claude', 'commands', 'aidlc.md'),
    path.join(__dirname, '..', 'templates', 'claude', 'commands', 'aidlc.md'),
  ];
}

/** Resolve the packaged `/aidlc` template path. */
export function resolveClaudeCommandTemplatePath(): string {
  for (const candidate of templateSourceCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Claude /aidlc command template is missing from the AIDLC package.');
}

function safeWorkspaceTarget(workspaceRoot: string): string {
  const target = path.resolve(workspaceRoot, RELATIVE_TARGET);
  const relative = path.relative(path.resolve(workspaceRoot), target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Refusing Claude command path outside the workspace: ${RELATIVE_TARGET}`);
  }
  return target;
}

/**
 * Copy `templates/claude/commands/aidlc.md` into `.claude/commands/aidlc.md`.
 * Existing content is preserved unless `force` is true.
 */
export function installClaudeAidlcCommand(
  workspaceRoot: string,
  options: { force?: boolean } = {},
): ClaudeCommandInstallResult {
  const source = resolveClaudeCommandTemplatePath();
  const target = safeWorkspaceTarget(workspaceRoot);
  const content = fs.readFileSync(source, 'utf8');
  const relativePath = RELATIVE_TARGET.replace(/\\/g, '/');

  if (fs.existsSync(target)) {
    const existing = fs.readFileSync(target, 'utf8');
    if (existing === content) {
      return { path: relativePath, installed: false, overwritten: false, reason: 'Claude /aidlc command already matches the packaged template.' };
    }
    if (!options.force) {
      return { path: relativePath, installed: false, overwritten: false, reason: 'Existing .claude/commands/aidlc.md differs; pass force to overwrite.' };
    }
    writeFileAtomic(target, content);
    return { path: relativePath, installed: true, overwritten: true, reason: 'Overwrote the existing Claude /aidlc command with the packaged template.' };
  }

  writeFileAtomic(target, content);
  return { path: relativePath, installed: true, overwritten: false, reason: 'Installed the Claude /aidlc command template.' };
}
