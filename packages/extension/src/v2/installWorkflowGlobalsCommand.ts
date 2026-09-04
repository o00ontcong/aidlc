/**
 * `aidlc.installWorkflowGlobals` — multi-pick UI to install one or more
 * built-in workflows' agents + skills into `~/.claude/agents/` and
 * `~/.claude/skills/`.
 *
 * These are optional legacy/static presets. CoFoFo is the extension default
 * and keeps its generated assets project-local, so it never participates in
 * this global installer. Static workflows remain opt-in and idempotent.
 */

import * as vscode from 'vscode';

import { BUILTIN_WORKFLOWS } from './builtinPresets';
import {
  installWorkflowGlobalsByIds,
  isWorkflowGloballyInstalled,
} from './globalDefaultsInstaller';
import { resolveTechStackForRoot } from './techStackResolver';
import { WorkspaceWebview } from './workspaceWebview';

export async function installWorkflowGlobalsCommand(
  extensionPath: string,
  output: vscode.OutputChannel,
): Promise<void> {
  interface WorkflowPickItem extends vscode.QuickPickItem {
    workflowId: string;
  }

  const items: WorkflowPickItem[] = BUILTIN_WORKFLOWS.map((w) => {
    const installed = isWorkflowGloballyInstalled(extensionPath, w.id);
    return {
      label: w.name,
      description: installed ? '$(check) installed' : 'not installed',
      detail: w.description,
      workflowId: w.id,
      picked: installed,
    };
  });

  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder:
      'Select workflows to install into ~/.claude/agents and ~/.claude/skills (checked = already installed)',
    ignoreFocusOut: true,
    matchOnDetail: true,
    title: 'Install Workflow Globals',
  });
  if (!picked) { return; }

  const wantedIds = new Set(picked.map((p) => p.workflowId));
  const toInstall = BUILTIN_WORKFLOWS
    .filter((w) => wantedIds.has(w.id) && !isWorkflowGloballyInstalled(extensionPath, w.id))
    .map((w) => w.id);

  if (toInstall.length === 0) {
    void vscode.window.showInformationMessage(
      'AIDLC: nothing to install — every selected workflow was already in ~/.claude/.',
    );
    return;
  }

  const techStack = resolveTechStackForRoot();
  const reports = installWorkflowGlobalsByIds(
    extensionPath,
    toInstall,
    (m) => output.appendLine(m),
    techStack,
  );
  const totalWritten = reports.reduce((acc, r) => acc + r.written.length, 0);
  const totalSkipped = reports.reduce((acc, r) => acc + r.skipped.length, 0);

  const names = toInstall
    .map((id) => BUILTIN_WORKFLOWS.find((w) => w.id === id)?.name ?? id)
    .join(', ');
  const skippedNote = totalSkipped > 0
    ? ` (skipped ${totalSkipped} user-owned file${totalSkipped === 1 ? '' : 's'})`
    : '';
  void vscode.window.showInformationMessage(
    `AIDLC: installed ${totalWritten} file${totalWritten === 1 ? '' : 's'} for ${names}${skippedNote}.`,
  );
  // Refresh the Builder so newly installed workflows appear in the Domain
  // dropdown without requiring a manual reload.
  WorkspaceWebview.refreshCurrent();
}
