import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  DeliveryOrchestrator,
  DeliveryStateStore,
  deliveryReviewSummaryPath,
  recordHumanCharterEdit,
  listValidatorConflicts,
  resolveValidatorConflict,
  AUTONOMOUS_MASTER_COMMAND,
  AUTONOMOUS_EPIC_MASTER_COMMAND,
  ensureAutonomousEpicMasterCommand,
  ensureAutonomousMasterCommand,
  RunStateStore,
  writeAutonomousRequest,
  ensureCohesiveBundleInstalled,
  type DeliveryRequest,
} from '@aidlc/core';

function root(): string | undefined {
  const value = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!value) void vscode.window.showWarningMessage('AIDLC: Open a project first.');
  return value;
}

async function openSummary(workspaceRoot: string, deliveryId: string): Promise<void> {
  const state = DeliveryStateStore.load(workspaceRoot, deliveryId);
  if (!state) return;
  const file = deliveryReviewSummaryPath(workspaceRoot, state);
  if (!fs.existsSync(file)) return;
  const doc = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(doc, { preview: false });
  try { await vscode.commands.executeCommand('markdown.showPreviewToSide', doc.uri); } catch { /* optional */ }
}

async function launchAutonomousMaster(
  workspaceRoot: string,
  deliveryId: string,
  output: vscode.OutputChannel,
): Promise<void> {
  ensureAutonomousMasterCommand(workspaceRoot);
  output.show(true);
  output.appendLine(`Opening selected-provider master: ${AUTONOMOUS_MASTER_COMMAND} ${deliveryId}`);
  await vscode.commands.executeCommand(
    'aidlc.runStepWithFeedback',
    AUTONOMOUS_MASTER_COMMAND,
    deliveryId,
    '',
  );
}

/** Launch the visible generic master for any already-scaffolded pipeline epic. */
export async function runEpicAutonomouslyCommand(epicId: string): Promise<void> {
  const workspaceRoot = root();
  if (!workspaceRoot) return;
  if (!RunStateStore.load(workspaceRoot, epicId)) {
    throw new Error(`Epic "${epicId}" does not have a runnable pipeline checkpoint.`);
  }
  ensureAutonomousEpicMasterCommand(workspaceRoot);
  await vscode.commands.executeCommand(
    'aidlc.runStepWithFeedback',
    AUTONOMOUS_EPIC_MASTER_COMMAND,
    epicId,
    '',
  );
}

/**
 * Walk every pending `.aidlc/validators/*.aidlc-new` conflict one at a time:
 * open a diff view of installed vs. bundled, then ask the human to keep,
 * accept, or skip. Returns true once nothing is left pending.
 */
async function reconcileValidatorConflictsInteractive(workspaceRoot: string): Promise<boolean> {
  const pending = listValidatorConflicts(workspaceRoot);
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
      resolveValidatorConflict(workspaceRoot, conflict.rel, pick.value);
    }
  }
  const remaining = listValidatorConflicts(workspaceRoot);
  if (remaining.length) {
    void vscode.window.showWarningMessage(
      `${remaining.length} validator conflict(s) still pending: ${remaining.map((c) => c.rel).join(', ')}.`,
    );
    return false;
  }
  return true;
}

export async function reconcileValidatorConflictsCommand(): Promise<void> {
  const workspaceRoot = root();
  if (!workspaceRoot) return;
  const pending = listValidatorConflicts(workspaceRoot);
  if (!pending.length) {
    void vscode.window.showInformationMessage('AIDLC: No pending validator conflicts.');
    return;
  }
  const resolved = await reconcileValidatorConflictsInteractive(workspaceRoot);
  if (resolved) {
    void vscode.window.showInformationMessage('AIDLC: All validator conflicts resolved.');
  }
}

async function chooseDelivery(workspaceRoot: string): Promise<string | undefined> {
  const states = DeliveryStateStore.list(workspaceRoot);
  if (!states.length) {
    void vscode.window.showInformationMessage('AIDLC: No autonomous deliveries found.');
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    states.map((state) => ({
      label: state.id,
      description: `${state.status} · review R${state.reviewRevision}${state.lastFailure ? ` · ${state.lastFailure.code}` : ''}`,
      detail: state.lastFailure ? `Log: ${state.lastFailure.logPath} · Resume: ${state.lastFailure.resumeCommand}` : undefined,
    })),
    { placeHolder: 'Select an autonomous delivery' },
  );
  return pick?.label;
}

async function resolveDeliveryId(
  workspaceRoot: string,
  requestedId?: string,
): Promise<string | undefined> {
  if (!requestedId) return chooseDelivery(workspaceRoot);
  if (!DeliveryStateStore.load(workspaceRoot, requestedId)) {
    void vscode.window.showWarningMessage(`AIDLC: Delivery "${requestedId}" was not found.`);
    return undefined;
  }
  return requestedId;
}

export async function startAutonomousDeliveryCommand(output: vscode.OutputChannel): Promise<void> {
  const workspaceRoot = root();
  if (!workspaceRoot) return;
  try { ensureCohesiveBundleInstalled(workspaceRoot); } catch (error) {
    void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    return;
  }
  const id = await vscode.window.showInputBox({
    title: 'Existing Project Autonomous Delivery',
    prompt: 'Feature / delivery id',
    placeHolder: 'FEATURE-001',
    validateInput: (value) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) ? undefined : 'Use letters, digits, dot, dash or underscore.',
  });
  if (!id) return;
  const title = await vscode.window.showInputBox({ title: 'Feature title', value: id });
  if (!title) return;
  const source = await vscode.window.showQuickPick(
    [
      { label: 'Enter description', value: 'manual' },
      { label: 'Choose requirement file', value: 'file' },
    ],
    { title: 'Requirement source' },
  );
  if (!source) return;
  let description = '';
  let reference: string | undefined;
  if (source.value === 'file') {
    const picked = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Use requirement' });
    if (!picked?.[0]) return;
    description = fs.readFileSync(picked[0].fsPath, 'utf8');
    reference = path.relative(workspaceRoot, picked[0].fsPath);
  } else {
    description = await vscode.window.showInputBox({
      title: 'Feature request',
      prompt: 'Describe desired behavior, constraints, and acceptance criteria.',
    }) ?? '';
  }
  if (description.trim().length < 20) {
    void vscode.window.showErrorMessage('Feature request must contain at least 20 characters.');
    return;
  }

  const request: DeliveryRequest = {
    id, title, description,
    source: { type: source.value as 'manual' | 'file', reference },
  };
  await runNewAutonomousDelivery(workspaceRoot, request, output);
}

/**
 * Start the master Claude command. The extension prepares only the durable
 * delivery request; it never runs a hidden local/global orchestration CLI.
 */
async function runNewAutonomousDelivery(
  workspaceRoot: string,
  request: DeliveryRequest,
  output: vscode.OutputChannel,
): Promise<void> {
  if (!(await reconcileValidatorConflictsInteractive(workspaceRoot))) return;

  const orchestrator = new DeliveryOrchestrator(workspaceRoot);
  orchestrator.create(request);
  writeAutonomousRequest(workspaceRoot, request);
  try {
    await launchAutonomousMaster(workspaceRoot, request.id, output);
  } catch (error) {
    output.show(true);
    void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

/** Start from the in-webview form without routing through VS Code's command registry. */
export async function startAutonomousDeliveryFromRequest(
  request: DeliveryRequest,
  output: vscode.OutputChannel,
): Promise<void> {
  const workspaceRoot = root();
  if (!workspaceRoot) return;
  try { ensureCohesiveBundleInstalled(workspaceRoot); } catch (error) {
    void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    return;
  }
  await runNewAutonomousDelivery(workspaceRoot, request, output);
}

export async function resumeAutonomousDeliveryCommand(
  output: vscode.OutputChannel,
  requestedId?: string,
): Promise<void> {
  const workspaceRoot = root();
  if (!workspaceRoot) return;
  const id = await resolveDeliveryId(workspaceRoot, requestedId);
  if (!id) return;
  if (!(await reconcileValidatorConflictsInteractive(workspaceRoot))) return;
  try {
    await launchAutonomousMaster(workspaceRoot, id, output);
  } catch (error) {
    output.show(true);
    void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

export async function openAutonomousReviewSummaryCommand(requestedId?: string): Promise<void> {
  const workspaceRoot = root();
  if (!workspaceRoot) return;
  const id = await resolveDeliveryId(workspaceRoot, requestedId);
  if (!id) return;
  await openSummary(workspaceRoot, id);
}

export async function addAutonomousReviewTaskCommand(
  output: vscode.OutputChannel,
  requestedId?: string,
): Promise<void> {
  const workspaceRoot = root();
  if (!workspaceRoot) return;
  const id = await resolveDeliveryId(workspaceRoot, requestedId);
  if (!id) return;
  const title = await vscode.window.showInputBox({ title: `Add review task · ${id}`, prompt: 'Describe the requested correction.' });
  if (!title) return;
  const orchestrator = new DeliveryOrchestrator(workspaceRoot);
  const task = orchestrator.addTask(id, { title });
  const action = await vscode.window.showInformationMessage(`Added ${task.id}.`, 'Run now');
  if (action !== 'Run now') { await openSummary(workspaceRoot, id); return; }
  try {
    await launchAutonomousMaster(workspaceRoot, id, output);
  } catch (error) {
    output.show(true);
    await openSummary(workspaceRoot, id);
    void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

export async function resumeAutonomousAfterMergeCommand(
  output: vscode.OutputChannel,
  requestedId?: string,
): Promise<void> {
  const workspaceRoot = root();
  if (!workspaceRoot) return;
  const id = await resolveDeliveryId(workspaceRoot, requestedId);
  if (!id) return;
  try {
    await launchAutonomousMaster(workspaceRoot, id, output);
  } catch (error) {
    output.show(true);
    await openSummary(workspaceRoot, id);
    void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

export async function editInferredProjectContextCommand(
  output: vscode.OutputChannel,
  requestedId?: string,
): Promise<void> {
  const workspaceRoot = root();
  if (!workspaceRoot) return;
  const id = await resolveDeliveryId(workspaceRoot, requestedId);
  if (!id) return;
  const state = DeliveryStateStore.load(workspaceRoot, id);
  if (!state?.projectContextRunId) return;
  if (state.status === 'completed') {
    void vscode.window.showInformationMessage(
      'This delivery is complete. Edit project context independently or create a follow-up delivery.',
    );
    return;
  }
  for (const rel of [
    'docs/project/charter/NORTH-STAR.md',
    'docs/project/charter/ARCHITECTURE-PRINCIPLES.md',
    'docs/project/charter/TECH-POLICY.md',
    'docs/project/charter/CHARTER.json',
    'docs/project/conventions/CONVENTIONS.md',
  ]) {
    const file = path.join(workspaceRoot, rel);
    if (fs.existsSync(file)) {
      const doc = await vscode.workspace.openTextDocument(file);
      await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
    }
  }
  const action = await vscode.window.showInformationMessage(
    'Edit the inferred project context in the opened files. Save all files, then confirm to refresh affected delivery work.',
    'Confirm saved edits',
  );
  if (action !== 'Confirm saved edits') return;
  try {
    await vscode.workspace.saveAll(false);
    const result = recordHumanCharterEdit(workspaceRoot, { confirmAll: true });
    const orchestrator = new DeliveryOrchestrator(workspaceRoot);
    orchestrator.addTask(id, {
      title: `Human revised project charter to revision ${result.revision}.`,
      acceptanceCriteria: ['Refresh context evidence, drift analysis, manifest, and downstream alignment.'],
      target: { runId: state.projectContextRunId, step: 'define-charter' },
    });
    await launchAutonomousMaster(workspaceRoot, id, output);
  } catch (error) {
    output.show(true);
    await openSummary(workspaceRoot, id);
    void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

/** Apply already-created review tasks without forcing the user through another picker. */
export async function reworkAutonomousDeliveryCommand(
  output: vscode.OutputChannel,
  requestedId?: string,
): Promise<void> {
  const workspaceRoot = root();
  if (!workspaceRoot) return;
  const id = await resolveDeliveryId(workspaceRoot, requestedId);
  if (!id) return;
  try {
    await launchAutonomousMaster(workspaceRoot, id, output);
  } catch (error) {
    output.show(true);
    await openSummary(workspaceRoot, id);
    void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
  }
}

/** Open the newest durable, secret-redacted execution log for one delivery. */
export async function openAutonomousFailureLogCommand(requestedId?: string): Promise<void> {
  const workspaceRoot = root();
  if (!workspaceRoot) return;
  const id = await resolveDeliveryId(workspaceRoot, requestedId);
  if (!id) return;
  const state = DeliveryStateStore.load(workspaceRoot, id);
  if (!state) return;
  const history = state.failureHistory ?? [];
  const failure = state.lastFailure ?? history[history.length - 1];
  if (!failure) {
    void vscode.window.showInformationMessage(
      state.lastError
        ? `This legacy failure predates durable logs: ${state.lastError}`
        : `Delivery ${id} has no recorded failures.`,
    );
    return;
  }
  const file = path.resolve(workspaceRoot, failure.logPath);
  const relative = path.relative(workspaceRoot, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to open a failure log outside this workspace: ${failure.logPath}`);
  }
  if (!fs.existsSync(file)) {
    void vscode.window.showWarningMessage(`Failure log is missing: ${failure.logPath}`);
    return;
  }
  const doc = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(doc, { preview: false });
}

/** User-triggered recovery terminals keep authentication and diagnostics visible and interactive. */
export function openClaudeLoginTerminalCommand(): void {
  const workspaceRoot = root();
  if (!workspaceRoot) return;
  const terminal = vscode.window.createTerminal({
    name: 'AIDLC · Claude Login', cwd: workspaceRoot, iconPath: new vscode.ThemeIcon('key'),
    location: vscode.TerminalLocation.Panel,
  });
  terminal.show(false);
  terminal.sendText('claude /login', true);
}

export async function runAutonomousDoctorCommand(): Promise<void> {
  const workspaceRoot = root();
  if (!workspaceRoot) return;
  void workspaceRoot;
  void vscode.window.showInformationMessage(
    'AIDLC diagnostics run in the Claude terminal. Review the active master session or open Claude to diagnose the delivery.',
  );
  await vscode.commands.executeCommand('aidlc.openClaudeTerminal');
}
