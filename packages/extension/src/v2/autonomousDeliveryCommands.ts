import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import * as vscode from 'vscode';

import {
  DeliveryOrchestrator,
  DeliveryStateStore,
  deliveryReviewSummaryPath,
  recordHumanCharterEdit,
  listValidatorConflicts,
  resolveValidatorConflict,
  WorkspaceLoader,
  type DeliveryHooks,
  type DeliveryRequest,
} from '@aidlc/core';

function root(): string | undefined {
  const value = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!value) void vscode.window.showWarningMessage('AIDLC: Open a project first.');
  return value;
}

function ensureBundle(workspaceRoot: string): void {
  const ids = new Set(WorkspaceLoader.load(workspaceRoot).config.pipelines.map((pipeline) => pipeline.id));
  for (const id of ['project-context', 'cohesive-feature', 'cohesive-work-package']) {
    if (!ids.has(id)) throw new Error(`Cohesive Delivery is not installed (missing pipeline ${id}).`);
  }
}

function progressHooks(
  output: vscode.OutputChannel,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
): DeliveryHooks {
  return {
    onDeliveryStage: ({ stage }) => {
      progress.report({ message: stage });
      output.appendLine(`\n◆ ${stage}`);
    },
    onStepStart: ({ stepIdx, agent }) => output.appendLine(`▶ step ${stepIdx}: ${agent}`),
    onOutput: (chunk) => output.append(chunk),
    onErrorOutput: (chunk) => output.append(chunk),
    onAutoReviewResult: ({ decision, reason }) => output.appendLine(`auto-review ${decision}: ${reason}`),
    onReviewDeferred: ({ agent, reviewBundleRevision }) => {
      output.appendLine(`human review deferred: ${agent} → bundle R${reviewBundleRevision}`);
    },
    onStepFailed: ({ message, missing, failure }) => {
      output.appendLine(`✘ ${message ?? 'Step failed.'}`);
      if (missing?.length) output.appendLine(`Missing: ${missing.join(', ')}`);
      if (failure) {
        output.appendLine(`Failure code: ${failure.code}`);
        output.appendLine(`Failure log: ${failure.logPath}`);
        for (const command of failure.recoveryCommands) output.appendLine(`Recovery: ${command}`);
      }
    },
  };
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

/** POSIX single-quote a shell argument; inside single quotes the only special character is `'` itself. */
function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isAidlcCliOnPath(): Promise<boolean> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where aidlc' : 'which aidlc';
    exec(cmd, { timeout: 5000 }, (err, stdout) => resolve(!err && !!stdout.trim()));
  });
}

/**
 * A stale/incompatible `aidlc` (older global npm install, or one linked from
 * a different checkout) fails silently at the wrong moment — commander
 * prints `error: unknown command 'cohesive'` only after the terminal already
 * opened. Check for actual `cohesive` support up front, not just that some
 * binary named `aidlc` is on PATH.
 */
function hasAidlcCohesiveCommand(): Promise<boolean> {
  return new Promise((resolve) => {
    exec('aidlc cohesive --help', { timeout: 5000 }, (err) => resolve(!err));
  });
}

/** Confirm the `aidlc` CLI on PATH actually supports Cohesive Delivery, offering to install/fix it otherwise. */
async function ensureAidlcCliAvailable(): Promise<boolean> {
  if (await hasAidlcCohesiveCommand()) return true;
  if (await isAidlcCliOnPath()) {
    void vscode.window.showErrorMessage(
      'The `aidlc` CLI on PATH does not support Cohesive Delivery yet (older or mismatched version). '
      + 'If you are developing AIDLC from source, rebuild and `npm link` packages/cli; otherwise install/update '
      + 'to a release that includes it.',
    );
    return false;
  }
  const action = await vscode.window.showErrorMessage(
    'Autonomous Delivery runs through the `aidlc` CLI in a terminal so every step and prompt is directly visible, but it is not installed.',
    'Install via npm',
  );
  if (action === 'Install via npm') {
    const terminal = vscode.window.createTerminal({ name: 'AIDLC CLI Setup' });
    terminal.sendText('npm install -g aidlc');
    terminal.show();
  }
  return false;
}

/**
 * Run `aidlc <argv>` in a fresh, dedicated terminal so the whole delivery —
 * every autonomous step's `claude` invocation, and any validator-conflict
 * prompt — is a normal, watchable CLI process instead of a silent in-process
 * VS Code action. `argv` entries are shell-ready tokens (quote values with
 * {@link shQuote} yourself; bare flags/enum values need no quoting). Mirrors
 * the shell-integration wait `aidlc.runStepWithFeedback` / `openClaudeTerminal`
 * use so it doesn't race heavy shell-init scripts (oh-my-zsh, direnv, nvm).
 */
function launchCliInTerminal(workspaceRoot: string, argv: string[], terminalName: string): void {
  const cwd = fs.existsSync(workspaceRoot) ? workspaceRoot : undefined;
  const terminal = vscode.window.createTerminal({
    name: terminalName,
    cwd,
    iconPath: new vscode.ThemeIcon('run-all'),
    location: vscode.TerminalLocation.Panel,
  });
  terminal.show(false);
  const oneShot = ['aidlc', ...argv].join(' ');

  let sent = false;
  const integ = vscode.window.onDidChangeTerminalShellIntegration((e) => {
    if (e.terminal === terminal && e.shellIntegration && !sent) {
      sent = true;
      e.shellIntegration.executeCommand(oneShot);
      integ.dispose();
    }
  });
  // Fallback for shells without integration — same 2s window as
  // openClaudeTerminal / runStepWithFeedback.
  setTimeout(() => {
    if (!sent) {
      sent = true;
      terminal.sendText(oneShot, true);
      integ.dispose();
    }
  }, 2000);
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
  try { ensureBundle(workspaceRoot); } catch (error) {
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
  await runNewAutonomousDelivery(workspaceRoot, request);
}

/**
 * Launch `aidlc cohesive run` in a terminal for this request. The CLI does
 * create+reconcile+run end to end (create is idempotent — an existing
 * delivery id just resumes), including its own interactive keep/accept/skip
 * prompt for validator conflicts, so nothing here needs to special-case
 * "already exists" or catch `assertValidatorsReady` failures.
 */
async function runNewAutonomousDelivery(workspaceRoot: string, request: DeliveryRequest): Promise<void> {
  if (!(await ensureAidlcCliAvailable())) return;

  const descFile = path.join(os.tmpdir(), `aidlc-delivery-${request.id}-${Date.now()}.md`);
  fs.writeFileSync(descFile, request.description, 'utf8');

  const argv = [
    'cohesive', 'run',
    '--id', request.id,
    '--title', shQuote(request.title),
    '--input', shQuote(descFile),
    '--source-type', request.source?.type ?? 'manual',
  ];
  if (request.source?.reference) argv.push('--source-ref', shQuote(request.source.reference));
  for (const item of request.acceptanceCriteria ?? []) argv.push('--acceptance', shQuote(item));
  for (const item of request.constraints ?? []) argv.push('--constraint', shQuote(item));

  launchCliInTerminal(workspaceRoot, argv, `AIDLC · Delivery: ${request.id}`);
}

/** Start from the in-webview form without routing through VS Code's command registry. */
export async function startAutonomousDeliveryFromRequest(
  request: DeliveryRequest,
  _output: vscode.OutputChannel,
): Promise<void> {
  const workspaceRoot = root();
  if (!workspaceRoot) return;
  try { ensureBundle(workspaceRoot); } catch (error) {
    void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    return;
  }
  await runNewAutonomousDelivery(workspaceRoot, request);
}

export async function resumeAutonomousDeliveryCommand(
  _output: vscode.OutputChannel,
  requestedId?: string,
): Promise<void> {
  const workspaceRoot = root();
  if (!workspaceRoot) return;
  const id = await resolveDeliveryId(workspaceRoot, requestedId);
  if (!id) return;
  if (!(await ensureAidlcCliAvailable())) return;
  launchCliInTerminal(workspaceRoot, ['cohesive', 'resume', id], `AIDLC · Delivery: ${id}`);
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
  const action = await vscode.window.showInformationMessage(`Added ${task.id}.`, 'Run rework now');
  if (action !== 'Run rework now') { await openSummary(workspaceRoot, id); return; }
  try {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Applying review tasks: ${id}`,
      cancellable: false,
    }, async (progress) => orchestrator.rework(id, { hooks: progressHooks(output, progress) }));
    await openSummary(workspaceRoot, id);
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
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Post-merge project sync: ${id}`,
      cancellable: false,
    }, async (progress) => new DeliveryOrchestrator(workspaceRoot)
      .resumeAfterMerge(id, progressHooks(output, progress)));
    await openSummary(workspaceRoot, id);
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
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Refreshing project context: ${id}`,
      cancellable: false,
    }, async (progress) => orchestrator.rework(id, { hooks: progressHooks(output, progress) }));
    await openSummary(workspaceRoot, id);
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
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Applying review tasks: ${id}`,
      cancellable: false,
    }, async (progress) => new DeliveryOrchestrator(workspaceRoot)
      .rework(id, { hooks: progressHooks(output, progress) }));
    await openSummary(workspaceRoot, id);
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
  if (!(await ensureAidlcCliAvailable())) return;
  launchCliInTerminal(workspaceRoot, ['doctor'], 'AIDLC · Doctor');
}
