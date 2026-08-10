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
  WorkspaceLoader,
  type DeliveryRequest,
} from '@aidlc/core';

function root(): string | undefined {
  const value = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!value) void vscode.window.showWarningMessage('AIDLC: Open a project first.');
  return value;
}

function ensureBundle(workspaceRoot: string): void {
  const ids = new Set(WorkspaceLoader.load(workspaceRoot).config.pipelines.map((pipeline) => pipeline.id));
  for (const id of ['project-context', 'cohesive-feature']) {
    if (!ids.has(id)) throw new Error(`Cohesive Delivery is not installed (missing pipeline ${id}).`);
  }
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

const AUTONOMOUS_MASTER_COMMAND = '/aidlc-autonomous-delivery';

async function launchAutonomousMaster(
  workspaceRoot: string,
  deliveryId: string,
  output: vscode.OutputChannel,
): Promise<void> {
  ensureAutonomousMasterCommand(workspaceRoot);
  output.show(true);
  output.appendLine(`Opening Claude master: ${AUTONOMOUS_MASTER_COMMAND} ${deliveryId}`);
  await vscode.commands.executeCommand(
    'aidlc.runStepWithFeedback',
    AUTONOMOUS_MASTER_COMMAND,
    deliveryId,
    '',
  );
}

/**
 * The extension's only delivery launch surface is an interactive Claude
 * command. The command owns the full workflow so users can watch, interrupt,
 * and direct its work in the terminal instead of trusting a hidden CLI.
 */
function ensureAutonomousMasterCommand(workspaceRoot: string): void {
  const file = path.join(workspaceRoot, '.claude', 'commands', 'aidlc-autonomous-delivery.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---
description: Run an entire AIDLC Cohesive Delivery autonomously. Usage: /aidlc-autonomous-delivery <delivery-id>
---

# AIDLC Autonomous Delivery Master

You are the master executor for delivery \`$ARGUMENTS\`. Own the entire delivery
until it reaches aggregate human review, a real external blocker, or a required
human decision. Do **not** stop after one phase and do not ask the user to click
"Mark step done" between phases.

## Source of truth

1. Read \`.aidlc/deliveries/$ARGUMENTS/request.md\` and
   \`.aidlc/deliveries/$ARGUMENTS/state.json\`.
2. Read \`.aidlc/workspace.yaml\`, its two Cohesive pipelines
   (\`project-context\`, \`cohesive-feature\`), and
   every relevant agent/skill file under \`.claude/\` or \`~/.claude/\`.
3. Read existing run and epic state before resuming; preserve completed,
   validated work and continue from the first incomplete phase.

## Resume contract (mandatory)

- Treat \`.aidlc/deliveries/$ARGUMENTS/state.json\`, \`.aidlc/runs/*.json\`,
  and the matching epic \`state.json\` files as durable checkpoints.
- Never delete, recreate, reset, or overwrite a run, worktree, artifact, or
  approved phase that already exists and validates successfully.
- On a resumed invocation, locate the first phase whose state is
  \`awaiting_work\`, \`pending\`, \`rejected\`, or recorded as failed; retry only
  that incomplete phase and its required downstream dependants.
- Do not rerun an approved upstream phase merely because this master command
  was invoked again. Report the checkpoint selected before doing any work.

## Execute autonomously

1. Complete all seven project-context phases in dependency order.
2. Complete the cohesive-feature phases end-to-end: contract, task plan,
   implementation, validation, test, and the single feature PR/review bundle.
3. This delivery is one independent epic. Do not create or ask the user to
   manage work-package/worker epics, choose a worker count, or wait on an
   internal worker board. You may choose internal task decomposition yourself
   when it helps, but it is not a user-visible parallelism control.
4. For every phase, follow the corresponding namespaced command document in
   \`.claude/commands/\` (for example
   \`project-context-project-rules-sync.md\`) as the authoritative persona,
   skill, input, output, and acceptance contract.
5. Validate declared outputs before treating a phase as complete. Keep the
   AIDLC run/epic state files aligned with the completed phase so the extension
   can render current progress after refresh.
6. If a recoverable failure occurs, diagnose, repair, and retry that phase.
   Stop only for missing credentials, an unsafe/destructive action requiring
   consent, a genuine ambiguity that needs product input, or an enforced human
   review/merge gate. State the exact blocker and the next command to resume.

Work visibly in this Claude session: narrate stage transitions, commands,
validation results, and failures. Never invoke a global \`aidlc\` CLI.
`, 'utf8');
}

function writeAutonomousRequest(workspaceRoot: string, request: DeliveryRequest): void {
  const file = path.join(workspaceRoot, '.aidlc', 'deliveries', request.id, 'request.md');
  const body = [
    `# Delivery Request: ${request.title}`,
    '',
    request.description.trim(),
    ...(request.acceptanceCriteria?.length ? ['', '## Acceptance Criteria', ...request.acceptanceCriteria.map((item) => `- ${item}`)] : []),
    ...(request.constraints?.length ? ['', '## Constraints', ...request.constraints.map((item) => `- ${item}`)] : []),
    ...(request.source?.reference ? ['', `Source: ${request.source.type} — ${request.source.reference}`] : []),
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, 'utf8');
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
  try { ensureBundle(workspaceRoot); } catch (error) {
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
  const action = await vscode.window.showInformationMessage(`Added ${task.id}.`, 'Run in Claude now');
  if (action !== 'Run in Claude now') { await openSummary(workspaceRoot, id); return; }
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
