import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  activeEpicsDir,
  CofofoFoundationService,
  detectStack,
  diagnoseCofofoBinding,
  lostCofofoGateSnapshotIssues,
  mirrorRunStateToEpic,
  RunStateStore,
  StackProfileSchema,
  WorkspaceLoader,
  captureEvidence,
  evidenceStageRevisionsForRun,
  markStepDone,
  normalizeStep,
  rebaseRunToCurrentDiscoverContext,
  rebaseRunToCurrentFoundation,
  recordBugReport,
  scaffoldEpic,
  formatCofofoBugReport,
  COFOFO_BUG_REPORT_FILENAME,
  removeRogueCofofoPipelinesFromWorkspace,
  type PipelineConfig,
  type RunState,
} from '@aidlc/core';
import { readYaml, writeYaml } from './yamlIO';

function rootOrWarn(): string | undefined {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) void vscode.window.showWarningMessage('AIDLC: open a project before running CoFoFo.');
  return root;
}

function serviceFor(root: string, extensionPath: string): CofofoFoundationService {
  return new CofofoFoundationService(root, path.join(extensionPath, 'templates', 'cofofo', 'catalog'));
}

/** True for a CoFoFo delivery run under either the current or legacy prerequisite gate. */
function isCofofoDeliveryRun(run: RunState): boolean {
  const pipeline = run.pipelineSnapshot?.pipeline;
  return Boolean(pipeline?.discover_context) || pipeline?.foundation?.mode === 'cofofo';
}

async function chooseDeliveryRun(root: string): Promise<RunState | undefined> {
  const runs = RunStateStore.list(root).filter(isCofofoDeliveryRun);
  if (runs.length === 0) {
    void vscode.window.showWarningMessage('AIDLC: no delivery run exists. Start a CoFoFo feature or bugfix first.');
    return undefined;
  }
  if (runs.length === 1) return runs[0];
  const picked = await vscode.window.showQuickPick(
    runs.map((run) => ({
      label: run.runId,
      description: `${run.pipelineId} · ${run.status} · step ${run.currentStepIdx + 1}/${run.steps.length}`,
      run,
    })),
    { placeHolder: 'Choose a delivery run', ignoreFocusOut: true },
  );
  return picked?.run;
}

function pipelineFor(state: RunState): PipelineConfig {
  const pipeline = state.pipelineSnapshot?.pipeline;
  if (!pipeline) throw new Error(`Foundation run "${state.runId}" has no immutable pipeline snapshot.`);
  return pipeline;
}

function saveAndRefresh(root: string, state: RunState): void {
  RunStateStore.save(root, state);
  void vscode.commands.executeCommand('aidlc.refreshSidebar');
}

function currentPhase(state: RunState, pipeline: PipelineConfig): string {
  const raw = pipeline.steps[state.currentStepIdx];
  return raw ? normalizeStep(raw).name ?? normalizeStep(raw).agent : '(missing)';
}

/** Ensure the project-local CoFoFo workflow exists. Safe to call repeatedly. */
export async function ensureCofofoWorkflowCommand(extensionPath: string): Promise<void> {
  const root = rootOrWarn();
  if (!root) return;
  try {
    serviceFor(root, extensionPath).ensureWorkflowRegistered();
    void vscode.commands.executeCommand('aidlc.refreshSidebar');
    void vscode.window.showInformationMessage(
      'CoFoFo delivery pipelines are ready (Feature and Bugfix). Publish Context from Discover before creating a task.',
    );
  } catch (error) {
    void vscode.window.showErrorMessage(
      `CoFoFo setup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** @deprecated Compatibility alias for older extension command wiring. */
export const installCofofoWorkflowCommand = ensureCofofoWorkflowCommand;

export async function showCofofoStatusCommand(extensionPath: string): Promise<void> {
  const root = rootOrWarn();
  if (!root) return;
  try {
    const inspection = serviceFor(root, extensionPath).inspect();
    const detail = [
      `status: ${inspection.status}`,
      inspection.state ? `revision: ${inspection.state.revision}` : '',
      inspection.profile?.stack ? `stack: ${inspection.profile.stack.id}` : '',
      ...inspection.issues,
      `next: ${inspection.nextAction}`,
    ].filter(Boolean).join('\n');
    const document = await vscode.workspace.openTextDocument({ content: detail, language: 'text' });
    await vscode.window.showTextDocument(document, { preview: true });
  } catch (error) {
    void vscode.window.showErrorMessage(`CoFoFo status failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function rebaseCofofoRunCommand(): Promise<void> {
  const root = rootOrWarn();
  if (!root) return;
  const state = await chooseDeliveryRun(root);
  if (!state) return;
  try {
    const pipeline = pipelineFor(state);
    if (pipeline.discover_context) {
      const next = rebaseRunToCurrentDiscoverContext({ state, pipeline, workspaceRoot: root });
      saveAndRefresh(root, next);
      void vscode.window.showInformationMessage(
        next.discoverContext?.packHash === state.discoverContext?.packHash
          ? `${state.runId} already uses the latest Discover context.`
          : `${state.runId} rebased to Discover revision ${next.discoverContext?.discoverRevision}; every phase was reset for replay.`,
      );
      return;
    }
    const next = rebaseRunToCurrentFoundation({ state, pipeline, workspaceRoot: root });
    saveAndRefresh(root, next);
    void vscode.window.showInformationMessage(
      next.cofofoFoundation?.revision === state.cofofoFoundation?.revision
        ? `${state.runId} already uses the active Foundation.`
        : `${state.runId} rebased to Foundation revision ${next.cofofoFoundation?.revision}; every phase was reset for replay.`,
    );
  } catch (error) {
    void vscode.window.showErrorMessage(`CoFoFo rebase failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function captureCofofoEvidenceCommand(): Promise<void> {
  const root = rootOrWarn();
  if (!root) return;
  const state = await chooseDeliveryRun(root);
  if (!state) return;
  try {
    const pipeline = pipelineFor(state);
    const norm = normalizeStep(pipeline.steps[state.currentStepIdx]!);
    const stage = norm.evidence?.stage;
    if (stage !== 'verify') throw new Error(`Current phase ${norm.name ?? norm.agent} does not declare a VERIFY evidence gate.`);
    const stackJsonPath = path.join(root, 'docs/project/foundation/STACK-PROFILE.json');
    const profile = fs.existsSync(stackJsonPath)
      ? StackProfileSchema.parse(JSON.parse(fs.readFileSync(stackJsonPath, 'utf8')))
      : detectStack(root);
    const record = captureEvidence({
      workspaceRoot: root,
      runId: state.runId,
      profile,
      stage: 'verify',
      commandId: 'swift.test',
      stepRevision: state.steps[state.currentStepIdx]!.revision,
      stageRevisions: evidenceStageRevisionsForRun(state, pipeline),
    });
    void vscode.window.showInformationMessage(
      `${stage.toUpperCase()} evidence ${record.accepted ? 'accepted' : 'rejected'} · exit ${record.exitStatus ?? 'none'} · ${record.id}`,
    );
  } catch (error) {
    void vscode.window.showErrorMessage(`CoFoFo evidence failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

type BugReportFields = { did: string; observed: string; expected: string };

async function promptBugReport(): Promise<BugReportFields | undefined> {
  const did = await vscode.window.showInputBox({ prompt: 'Báo lỗi — bạn đã làm gì?', ignoreFocusOut: true });
  if (did === undefined || !did.trim()) return undefined;
  const observed = await vscode.window.showInputBox({ prompt: 'Báo lỗi — bạn thấy gì?', ignoreFocusOut: true });
  if (observed === undefined || !observed.trim()) return undefined;
  const expected = await vscode.window.showInputBox({ prompt: 'Báo lỗi — bạn mong đợi gì?', ignoreFocusOut: true });
  if (expected === undefined || !expected.trim()) return undefined;
  return { did, observed, expected };
}

/**
 * Report a CoFoFo bug without asking a non-technical user to identify a phase.
 * Completed delivery opens a fresh bugfix run (and therefore a fresh ledger);
 * an active run attaches the report to its current step for the agent to use.
 */
export async function reportCofofoBugCommand(
  runIdArg?: string,
  supplied?: Partial<BugReportFields>,
): Promise<void> {
  const root = rootOrWarn();
  if (!root) return;
  const state = runIdArg ? RunStateStore.load(root, runIdArg) : await chooseDeliveryRun(root);
  if (!state) return;
  const pipeline = pipelineFor(state);
  if (!pipeline.discover_context && pipeline.foundation?.mode !== 'cofofo') {
    void vscode.window.showWarningMessage(`Run "${state.runId}" is not a CoFoFo delivery run.`);
    return;
  }
  const fields = supplied?.did?.trim() && supplied?.observed?.trim() && supplied?.expected?.trim()
    ? supplied as BugReportFields
    : await promptBugReport();
  if (!fields) return;
  const report = formatCofofoBugReport(fields);

  try {
    if (state.status !== 'completed') {
      const next = recordBugReport({ state, report, workspaceRoot: root, pipeline });
      RunStateStore.save(root, next);
      const doc = readYaml(root);
      if (doc) mirrorRunStateToEpic(root, next, doc);
      void vscode.window.showInformationMessage(`Đã ghi báo lỗi vào phase ${currentPhase(state, pipeline)} của ${state.runId}.`);
      void vscode.commands.executeCommand('aidlc.refreshSidebar');
      return;
    }

    const relatesTo = state.context.epic ?? state.runId;
    const relatedState = path.join(root, activeEpicsDir(root), relatesTo, 'state.json');
    if (!fs.existsSync(relatedState)) {
      throw new Error(`Không thể tạo bugfix: epic gốc "${relatesTo}" không tồn tại.`);
    }
    const doc = readYaml(root);
    if (!doc) throw new Error('workspace.yaml is missing.');
    new CofofoFoundationService(root).ensureWorkflowRegistered();
    const config = WorkspaceLoader.load(root).config;
    const epicId = `COFOFO-BUGFIX-${Date.now()}`;
    const bugfix = config.pipelines.find((p) => p.id === 'cofofo-bugfix');
    if (!bugfix) throw new Error('Pipeline cofofo-bugfix missing — register CoFoFo first.');
    const freshDoc = readYaml(root) ?? doc;

    const result = scaffoldEpic({
      workspaceRoot: root,
      doc: freshDoc,
      epicId,
      title: `Sửa lỗi cho ${relatesTo}`,
      description: fields.observed.trim(),
      target: { kind: 'pipeline', id: 'cofofo-bugfix' },
      agents: bugfix.steps.map((step) => normalizeStep(step).agent),
      inputs: {},
      pipeline: bugfix,
      relatesTo,
    });
    fs.writeFileSync(path.join(result.artifactsDir, COFOFO_BUG_REPORT_FILENAME), report, 'utf8');
    if (result.runState) {
      const next = { ...result.runState, relatesTo };
      RunStateStore.save(root, next);
      mirrorRunStateToEpic(root, next, doc);
    }
    void vscode.window.showInformationMessage(`Đã tạo ${epicId}: bắt đầu sạch với BUG-REPORT.md và chờ phase diagnose.`);
    void vscode.commands.executeCommand('aidlc.refreshSidebar');
  } catch (error) {
    void vscode.window.showErrorMessage(`Báo lỗi CoFoFo thất bại: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Inspect CoFoFo workspace health and only advertise repairs that can work. */
export async function cofofoDoctorCommand(): Promise<void> {
  const root = rootOrWarn();
  if (!root) return;
  const inspection = new CofofoFoundationService(root).inspect();
  const doc = readYaml(root);
  const source = doc?.pipelines as PipelineConfig[] | undefined;
  const snapshotIssues = RunStateStore.list(root).flatMap((run) => {
    const current = source?.find((pipeline) => pipeline.id === run.pipelineId);
    return lostCofofoGateSnapshotIssues({ state: run, sourcePipeline: current })
      .map((issue) => `${run.runId}: ${issue} — start a new CoFoFo run; this snapshot predates a workflow gate upgrade`);
  });
  // Always re-run binding diagnose so rogue pipelines surface even when
  // inspect() collapses to ready with an empty doctorIssues array.
  const bindingIssues = diagnoseCofofoBinding(root);
  const rogueIssues = bindingIssues.filter((issue) => issue.kind === 'rogue-cofofo-pipeline');
  const issues = [
    ...bindingIssues.map((issue) => issue.userMessageVi),
    ...inspection.issues.filter((issue) => !bindingIssues.some((doctor) => doctor.detail === issue)),
    ...snapshotIssues,
  ];
  if (issues.length === 0 && inspection.status === 'ready') {
    void vscode.window.showInformationMessage('CoFoFo workspace khỏe mạnh; không cần sửa gì.');
    return;
  }

  const removeLabel = rogueIssues.length > 0
    ? `Xóa ${rogueIssues.length} pipeline cofofo-* giả`
    : undefined;
  const repair = rogueIssues.length > 0
    ? `Phát hiện pipeline CoFoFo không hợp lệ. Pipeline delivery chỉ có cofofo-feature / cofofo-bugfix; Foundation cũ chỉ để tương thích.`
    : (bindingIssues[0]?.userMessageVi
      ?? (snapshotIssues.length > 0
        ? 'Các run bị ảnh hưởng cần epic/recipe mới — snapshot cũ không có gate Canvas/evidence mới.'
        : (inspection.nextAction || 'Mở một run mới nếu snapshot cũ đã mất gate.')));

  const choice = await vscode.window.showWarningMessage(
    `CoFoFo doctor: ${issues.length || 1} vấn đề. ${repair}`,
    { modal: true, detail: issues.map((issue) => `• ${issue}`).join('\n') || 'Foundation chưa sẵn sàng.' },
    ...(removeLabel ? [removeLabel] : []),
  );

  if (removeLabel && choice === removeLabel && doc) {
    const removed = removeRogueCofofoPipelinesFromWorkspace(doc);
    if (removed.length === 0) {
      void vscode.window.showInformationMessage('Không còn pipeline cofofo-* giả để xóa.');
      return;
    }
    writeYaml(root, doc);
    void vscode.window.showInformationMessage(
      `Đã xóa pipeline giả: ${removed.join(', ')}. Pipeline delivery hợp lệ là cofofo-feature / cofofo-bugfix.`,
    );
    void vscode.commands.executeCommand('aidlc.refreshSidebar');
  }
}
