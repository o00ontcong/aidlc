/** Activation glue for the isolated V3 surface. */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import { discoverLegacyRecords } from '@aidlc/core';

import { ExtensionV3Host } from './ExtensionV3Host';
import { V3WorkspacePanel } from './V3WorkspacePanel';

export function registerV3Extension(context: vscode.ExtensionContext, output: vscode.OutputChannel): vscode.Disposable[] {
  const host = new ExtensionV3Host({
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    language: () => (vscode.workspace.getConfiguration('aidlc').get<string>('language') === 'vi' ? 'vi' : 'en'),
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
      if (command.name === 'preset.redrawDesign.apply') {
        try {
          await vscode.commands.executeCommand('aidlc.preset.redrawDesign.apply');
          return { commandId: command.id, status: 'ok', data: { dispatched: 'aidlc.preset.redrawDesign.apply' } };
        } catch (error) {
          return { commandId: command.id, status: 'error', data: { message: error instanceof Error ? error.message : String(error) } };
        }
      }
      if (command.name.startsWith('registry.')) {
        const payload = command.payload as { epicId?: unknown; pipelineId?: unknown; stepId?: unknown; feedback?: unknown; reason?: unknown };
        const vscodeCommand = `aidlc.${command.name}`;
        const args = command.name === 'registry.pipeline.run'
          ? [payload.epicId, payload.pipelineId, payload.feedback]
          : command.name === 'registry.step.rerun'
            ? [payload.epicId, payload.pipelineId, payload.stepId, payload.feedback]
            : command.name === 'registry.gate.reject'
              ? [payload.epicId, payload.pipelineId, payload.stepId, payload.reason]
              : [payload.epicId, payload.pipelineId, payload.stepId];
        try {
          await vscode.commands.executeCommand(vscodeCommand, ...args);
          return { commandId: command.id, status: 'ok', data: { dispatched: vscodeCommand } };
        } catch (error) {
          return { commandId: command.id, status: 'error', data: { message: error instanceof Error ? error.message : String(error) } };
        }
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
  if (watcher) {
    watcher.onDidCreate(() => host.notifyDurableStateChanged());
    watcher.onDidChange(() => host.notifyDurableStateChanged());
    watcher.onDidDelete(() => host.notifyDurableStateChanged());
  }
  // Live-refresh the panel's display language when the user flips
  // `aidlc.language` from the Settings UI, without needing a reload.
  const languageConfigReg = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('aidlc.language')) { host.notifyDurableStateChanged(); }
  });
  const toggleMock = async () => {
    const config = vscode.workspace.getConfiguration('aidlc');
    const next = !config.get<boolean>('showMockData', true);
    await config.update('showMockData', next, vscode.ConfigurationTarget.Global);
    V3WorkspacePanel.setMockVisible(next);
  };
  return [
    vscode.commands.registerCommand('aidlc.v3.open', open),
    vscode.commands.registerCommand('aidlc.debug.toggleMock', toggleMock),
    vscode.commands.registerCommand('aidlc.v3.command', async (message: unknown) => {
      const result = await host.handleMessage(message);
      if (!result) output.appendLine('Ignored malformed aidlc.v3.command message.');
      return result;
    }),
    vscode.commands.registerCommand('aidlc.project.analyze', () => dispatchPalette('project.analyze', {})),
    vscode.commands.registerCommand('aidlc.project.setup', () => dispatchPalette('project.setup', { confirm: false })),
    vscode.commands.registerCommand('aidlc.epic.next', () => withEpicId('epic.next')),
    vscode.commands.registerCommand('aidlc.epic.resume', () => withEpicId('epic.resume')),
    languageConfigReg,
    ...(watcher ? [watcher] : []),
  ];
}
