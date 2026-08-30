import * as vscode from 'vscode';

import {
  IdeaService,
  PROVIDER_MANAGED_IDEA_COMMAND,
  PROVIDER_MANAGED_TASK_COMMAND,
  ensureProviderManagedTaskCommand,
  listValidatorConflicts,
  resolveValidatorConflict,
  RunStateStore,
  getCommandProviderAdapter,
} from '@aidlc/core';

import { getProviderConfigStore } from './providerConfig';
import { runProviderManagedInteractiveSession, terminalNameForProvider } from './providerRunService';

function workspaceRoot(): string | undefined {
  const value = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!value) void vscode.window.showWarningMessage('AIDLC: Open a project first.');
  return value;
}

/** Launch the visible provider master for an already-scaffolded task. */
export async function runTaskWithProviderCommand(taskId: string): Promise<void> {
  const root = workspaceRoot();
  if (!root) return;
  if (!RunStateStore.load(root, taskId)) {
    throw new Error(`Task "${taskId}" does not have a runnable pipeline checkpoint.`);
  }
  ensureProviderManagedTaskCommand(root);
  await vscode.commands.executeCommand(
    'aidlc.runStepWithFeedback',
    PROVIDER_MANAGED_TASK_COMMAND,
    taskId,
    '',
  );
}

function ideaTerminalName(root: string, ideaId: string): string {
  const store = getProviderConfigStore(root);
  const config = store.loadOrDefault();
  const adapter = getCommandProviderAdapter(config.defaultProvider);
  return `${terminalNameForProvider(adapter.displayName)} · Idea ${ideaId}`;
}

/**
 * Start or reveal one visible, provider-owned Idea session. Unlike the old
 * terminal-result bridge, this does not read stdout or wait for the shell to
 * exit; the provider command persists each Idea checkpoint itself.
 */
export function runIdeaWithProviderCommand(
  ideaId: string,
  extensionPath: string,
): void {
  const root = workspaceRoot();
  if (!root) return;
  if (!new IdeaService(root).get(ideaId)) {
    throw new Error(`Idea "${ideaId}" does not exist.`);
  }
  const terminalName = ideaTerminalName(root, ideaId);
  const existing = vscode.window.terminals.find((terminal) => terminal.name === terminalName);
  if (existing && existing.exitStatus === undefined) {
    existing.show(false);
    return;
  }
  existing?.dispose();
  runProviderManagedInteractiveSession({
    slashCommand: PROVIDER_MANAGED_IDEA_COMMAND,
    runId: ideaId,
    root,
    extensionPath,
    terminalName,
  });
}

/** Reveal the Idea's visible native provider session without submitting text. */
export function revealIdeaProviderTerminal(root: string, ideaId: string): boolean {
  const terminal = vscode.window.terminals.find((candidate) => candidate.name === ideaTerminalName(root, ideaId));
  if (!terminal) return false;
  terminal.show(false);
  return true;
}

/** Stop only this Idea's foreground provider session. */
export function stopIdeaProviderTerminal(root: string, ideaId: string): void {
  const terminal = vscode.window.terminals.find((candidate) => candidate.name === ideaTerminalName(root, ideaId));
  terminal?.dispose();
}

async function reconcileValidatorConflictsInteractive(root: string): Promise<boolean> {
  const pending = listValidatorConflicts(root);
  for (const conflict of pending) {
    try {
      await vscode.commands.executeCommand(
        'vscode.diff',
        vscode.Uri.file(conflict.installedPath),
        vscode.Uri.file(conflict.conflictPath),
        `${conflict.rel}: installed ↔ bundled update`,
      );
    } catch { /* diff view is best-effort */ }

    const pick = await vscode.window.showQuickPick(
      [
        { label: 'Keep installed', description: 'Discard the bundled suggestion for now', value: 'keep' as const },
        { label: 'Accept bundled', description: 'Overwrite the installed validator with the bundled update', value: 'accept' as const },
        { label: 'Skip for now', value: 'skip' as const },
      ],
      { title: `Resolve validator conflict: ${conflict.rel}`, ignoreFocusOut: true },
    );
    if (pick && pick.value !== 'skip') {
      resolveValidatorConflict(root, conflict.rel, pick.value);
    }
  }

  const remaining = listValidatorConflicts(root);
  if (remaining.length) {
    void vscode.window.showWarningMessage(
      `${remaining.length} validator conflict(s) still pending: ${remaining.map((item) => item.rel).join(', ')}.`,
    );
    return false;
  }
  return true;
}

export async function reconcileValidatorConflictsCommand(): Promise<void> {
  const root = workspaceRoot();
  if (!root) return;
  const pending = listValidatorConflicts(root);
  if (!pending.length) {
    void vscode.window.showInformationMessage('AIDLC: No pending validator conflicts.');
    return;
  }
  if (await reconcileValidatorConflictsInteractive(root)) {
    void vscode.window.showInformationMessage('AIDLC: All validator conflicts resolved.');
  }
}
