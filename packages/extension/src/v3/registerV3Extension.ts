/** Activation glue for the isolated V3 surface. */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import { CohesiveDeliveryUpgradeService, discoverLegacyRecords } from '@aidlc/core';

import { ExtensionV3Host } from './ExtensionV3Host';
import { V3WorkspacePanel } from './V3WorkspacePanel';

export function registerV3Extension(context: vscode.ExtensionContext, output: vscode.OutputChannel): vscode.Disposable[] {
  const host = new ExtensionV3Host({
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    templatesRoot: () => context.extensionUri.fsPath,
    hostDispatcher: async (command) => {
      if (command.name === 'capability.ast.graph.open') {
        await vscode.commands.executeCommand('aidlc.astGraph.openReport');
        return { commandId: command.id, status: 'ok', data: { opened: true, capabilityId: 'ast-graph' } };
      }
      if (command.name === 'capability.annotation.open') {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const artifactPath = (command.payload as { path?: unknown }).path;
        if (!root || typeof artifactPath !== 'string') return { commandId: command.id, status: 'error', data: { message: 'Annotation requires a workspace-relative artifact path.' } };
        const target = path.resolve(root, artifactPath);
        const relative = path.relative(root, target);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return { commandId: command.id, status: 'error', data: { message: 'Artifact path escapes the workspace.' } };
        const annotronBin = path.join(os.homedir(), '.claude', 'tools', 'annotron', 'bin', 'annotron');
        if (!fs.existsSync(annotronBin)) return { commandId: command.id, status: 'error', data: { message: 'Annotron is not installed. Re-run AIDLC setup or extension activation.' } };
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        delete env.VSCODE_IPC_HOOK;
        const child = spawn(process.execPath, [annotronBin, target], { env, detached: true, stdio: 'ignore' });
        child.unref();
        return { commandId: command.id, status: 'ok', data: { opened: true, capabilityId: 'artifact-annotation', path: relative } };
      }
      if (command.name === 'architecture.source.open') {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const sourcePath = (command.payload as { path?: unknown }).path;
        if (!root || typeof sourcePath !== 'string') return { commandId: command.id, status: 'error', data: { message: 'Source open requires a workspace-relative file path.' } };
        const target = path.resolve(root, sourcePath);
        const relative = path.relative(root, target);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return { commandId: command.id, status: 'error', data: { message: 'Source path escapes the workspace.' } };
        if (!fs.existsSync(target)) return { commandId: command.id, status: 'error', data: { message: `Source file does not exist: ${relative}` } };
        await vscode.window.showTextDocument(vscode.Uri.file(target));
        return { commandId: command.id, status: 'ok', data: { opened: true, path: relative } };
      }
      if (command.name === 'cohesive.upgrade.open') {
        await vscode.commands.executeCommand('aidlc.cohesiveUpgrade');
        return { commandId: command.id, status: 'ok', data: { opened: true } };
      }
      return undefined;
    },
  });
  const open = () => {
    if (!vscode.workspace.workspaceFolders?.length) {
      void vscode.window.showInformationMessage('Open a workspace folder before using AIDLC V3.');
      return;
    }
    V3WorkspacePanel.show(context.extensionUri, host);
  };
  const legacyRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (legacyRoot) {
    const legacyCount = discoverLegacyRecords(legacyRoot).length;
    if (legacyCount) {
      output.appendLine(`Unified Epic migration available for ${legacyCount} legacy record(s). Preview: aidlc migration preview`);
      void vscode.window.showInformationMessage(
        `AIDLC found ${legacyCount} legacy Epic/Run/Delivery record(s). Nothing will migrate automatically.`,
        'Open Unified AIDLC',
      ).then((choice) => { if (choice === 'Open Unified AIDLC') open(); });
    }
    try {
      const preview = new CohesiveDeliveryUpgradeService(legacyRoot, undefined, context.extensionUri.fsPath).preview();
      const pending = preview.items.some((item) => item.disposition === 'upgrade' || item.disposition === 'missing' || item.disposition === 'conflict');
      if (pending) {
        output.appendLine(`Cohesive Delivery ${preview.fromVersion} → ${preview.toVersion} is available. No files were changed.`);
        void vscode.window.showInformationMessage(
          'AIDLC found an older Cohesive Delivery workflow. Upgrade it to add the Architecture → Feature → Code explorer.',
          'Review & Upgrade',
        ).then((choice) => { if (choice === 'Review & Upgrade') void vscode.commands.executeCommand('aidlc.cohesiveUpgrade'); });
      }
    } catch { /* Project does not have a Cohesive workspace; do not notify. */ }
  }
  let paletteSequence = 0;
  const dispatchPalette = async (name: string, payload: Record<string, unknown>) => {
    paletteSequence += 1;
    const result = await host.handleMessage({ type: 'aidlc.v3.command', command: { id: `palette-${Date.now()}-${paletteSequence}`, name, payload } });
    if (result?.status === 'error') void vscode.window.showErrorMessage(`AIDLC: ${JSON.stringify(result.data)}`);
    else if (result) void vscode.window.showInformationMessage(`AIDLC ${name}: ${result.status}`);
    return result;
  };
  const withEpicId = async (name: string) => {
    const epicId = await vscode.window.showInputBox({ prompt: `Epic id for ${name}`, placeHolder: 'EPIC-001' });
    return epicId ? dispatchPalette(name, { epicId }) : undefined;
  };
  const root = vscode.workspace.workspaceFolders?.[0];
  const watcher = root ? vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '.aidlc/{epics/**,runs/**,project.yaml,autonomy.yaml,artifacts.yaml,catalog/**}')) : undefined;
  const architectureWatcher = root ? vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '{docs/project/context/visualization/**,docs/epics/*/artifacts/FEATURE-FLOW.*}')) : undefined;
  const legacyStateWatcher = root ? vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '{docs/epics/*/state.json,docs/project/context/CONTEXT-MANIFEST.json}')) : undefined;
  if (watcher) {
    watcher.onDidCreate(() => host.notifyDurableStateChanged());
    watcher.onDidChange(() => host.notifyDurableStateChanged());
    watcher.onDidDelete(() => host.notifyDurableStateChanged());
  }
  if (architectureWatcher) {
    architectureWatcher.onDidCreate(() => host.notifyDurableStateChanged());
    architectureWatcher.onDidChange(() => host.notifyDurableStateChanged());
    architectureWatcher.onDidDelete(() => host.notifyDurableStateChanged());
  }
  if (legacyStateWatcher) {
    legacyStateWatcher.onDidCreate(() => host.notifyDurableStateChanged());
    legacyStateWatcher.onDidChange(() => host.notifyDurableStateChanged());
    legacyStateWatcher.onDidDelete(() => host.notifyDurableStateChanged());
  }
  return [
    vscode.commands.registerCommand('aidlc.v3.open', open),
    vscode.commands.registerCommand('aidlc.v3.command', async (message: unknown) => {
      const result = await host.handleMessage(message);
      if (!result) output.appendLine('Ignored malformed aidlc.v3.command message.');
      return result;
    }),
    vscode.commands.registerCommand('aidlc.project.analyze', () => dispatchPalette('project.analyze', {})),
    vscode.commands.registerCommand('aidlc.project.setup', () => dispatchPalette('project.setup', { confirm: false })),
    vscode.commands.registerCommand('aidlc.epic.next', () => withEpicId('epic.next')),
    vscode.commands.registerCommand('aidlc.epic.resume', () => withEpicId('epic.resume')),
    vscode.commands.registerCommand('aidlc.cohesiveUpgrade', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) { void vscode.window.showInformationMessage('Open a workspace folder before upgrading Cohesive Delivery.'); return; }
      try {
        const service = new CohesiveDeliveryUpgradeService(workspaceRoot, undefined, context.extensionUri.fsPath);
        const preview = service.preview();
        const conflicts = preview.items.filter((item) => item.disposition === 'conflict');
        if (conflicts.length) {
          void vscode.window.showWarningMessage(`Cohesive upgrade found custom pipeline phases in ${conflicts.map((item) => item.pipelineId).join(', ')}. No files were changed; use the CLI preview to inspect the merge.`);
          return;
        }
        const choice = await vscode.window.showInformationMessage(
          `Cohesive ${preview.fromVersion} → ${preview.toVersion}. ${preview.activeRunIds.length ? `${preview.activeRunIds.length} active run(s) will be frozen. ` : ''}A backup will be created.`,
          { modal: true }, 'Upgrade', 'Cancel',
        );
        if (choice !== 'Upgrade') return;
        const manifest = service.apply(preview, { confirm: true });
        void vscode.window.showInformationMessage(`Cohesive Delivery upgraded. Backup: ${manifest.backupDir}`);
        host.notifyDurableStateChanged();
      } catch (error) { void vscode.window.showErrorMessage(`AIDLC Cohesive upgrade failed: ${error instanceof Error ? error.message : String(error)}`); }
    }),
    ...(watcher ? [watcher] : []),
    ...(architectureWatcher ? [architectureWatcher] : []),
    ...(legacyStateWatcher ? [legacyStateWatcher] : []),
  ];
}
