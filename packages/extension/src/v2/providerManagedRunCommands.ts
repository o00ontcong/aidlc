import * as vscode from 'vscode';

import {
  PROVIDER_MANAGED_TASK_COMMAND,
  ensureProviderManagedTaskCommand,
  listValidatorConflicts,
  resolveValidatorConflict,
  RunStateStore,
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
