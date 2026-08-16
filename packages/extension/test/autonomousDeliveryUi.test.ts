import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import {
  autonomousDeliveryActions,
  autonomousDeliveryReadiness,
} from '../src/webview/lib/autonomousDelivery';
import type { AutonomousDeliverySummary } from '../src/webview/lib/types';

const complete = [
  { id: 'project-context', steps: Array(2) },
  { id: 'feature-implement', steps: Array(3) },
];

describe('Autonomous Delivery UI', () => {
  const delivery = (
    patch: Partial<AutonomousDeliverySummary>,
  ): AutonomousDeliverySummary => ({
    id: 'FEATURE-001',
    title: 'Feature',
    status: 'pending',
    updatedAt: '2026-08-09T00:00:00.000Z',
    reviewRevision: 1,
    workerCount: 0,
    openReviewTasks: 0,
    openBlockingTasks: 0,
    failureCount: 0,
    ...patch,
  });

  it('accepts the current Project Context plus independent Feature Epic bundle', () => {
    expect(autonomousDeliveryReadiness(complete)).toEqual({
      ready: true,
      missingOrOutdated: [],
    });
  });

  it('rejects a one-step project-context pipeline as outdated', () => {
    const pipelines = complete.map((pipeline) =>
      pipeline.id === 'project-context' ? { ...pipeline, steps: Array(1) } : pipeline,
    );
    expect(autonomousDeliveryReadiness(pipelines)).toEqual({
      ready: false,
      missingOrOutdated: ['project-context (1/2 steps)'],
    });
  });

  it('offers login, diagnostics, log and resume for an authentication failure', () => {
    expect(autonomousDeliveryActions(delivery({
      status: 'blocked',
      failureCount: 1,
      latestFailure: {
        id: 'failure-1', at: '2026-08-09T00:00:00.000Z',
        code: 'runner.authentication_required', summary: 'Not logged in',
        logPath: '.aidlc/runs/run/logs/failure-1.json', retryable: true,
        recoveryCommands: ['claude /login'], runId: 'run',
        resumeCommand: 'aidlc cohesive resume FEATURE-001', current: true,
      },
    }))).toEqual(['claude-login', 'doctor', 'open-log', 'resume']);
  });

  it('offers validator reconciliation before resuming a legacy blocked delivery', () => {
    expect(autonomousDeliveryActions(delivery({
      status: 'blocked',
      lastError: 'Validator reconciliation required: policy.md.aidlc-new',
    }))).toEqual(['resolve-validators', 'resume']);
  });

  it.each([
    'pending', 'project-context', 'feature-contract', 'integrating', 'failed',
  ] as const)('offers direct checkpoint resume while status is %s', (status) => {
    expect(autonomousDeliveryActions(delivery({ status }))).toEqual(['resume']);
  });

  it('offers a direct resume for a generic legacy blocker', () => {
    expect(autonomousDeliveryActions(delivery({
      status: 'blocked', lastError: 'Runner exited unexpectedly',
    }))).toEqual(['resume']);
  });

  it('offers the complete aggregate-review action set including selective rework', () => {
    expect(autonomousDeliveryActions(delivery({
      status: 'awaiting-aggregate-review',
      projectContextRunId: 'FEATURE-001-PROJECT-CONTEXT',
      openReviewTasks: 2,
      openBlockingTasks: 1,
    }))).toEqual([
      'open-review', 'add-review-task', 'rework', 'edit-context', 'complete-after-merge',
    ]);
  });

  it('uses post-merge recovery instead of restarting feature execution', () => {
    expect(autonomousDeliveryActions(delivery({
      status: 'blocked',
      lastEventKind: 'post-merge-blocked',
    }))).toEqual(['complete-after-merge']);
    expect(autonomousDeliveryActions(delivery({ status: 'project-sync' })))
      .toEqual(['complete-after-merge']);
  });

  it('offers review and completion while waiting for a human merge', () => {
    expect(autonomousDeliveryActions(delivery({ status: 'awaiting-merge' })))
      .toEqual(['open-review', 'complete-after-merge']);
  });

  it('keeps completed deliveries read-only', () => {
    expect(autonomousDeliveryActions(delivery({ status: 'completed' })))
      .toEqual(['open-review']);
  });

  it('wires every lifecycle action from the modal to a host command', () => {
    const root = path.resolve(process.cwd());
    const modal = fs.readFileSync(path.join(root, 'src/webview/components/AutonomousDeliveryModal.tsx'), 'utf8');
    const host = fs.readFileSync(path.join(root, 'src/v2/workspaceWebview.ts'), 'utf8');
    const messages = [
      'startAutonomousDelivery',
      'startAutonomousDeliveryInline',
      'resumeAutonomousDelivery',
      'openAutonomousReviewSummary',
      'addAutonomousReviewTask',
      'editInferredProjectContext',
      'resumeAutonomousAfterMerge',
      'reworkAutonomousDelivery',
      'openAutonomousFailureLog',
      'openClaudeLoginTerminal',
      'runAutonomousDoctor',
      'reconcileAutonomousValidators',
      'applyCohesiveDelivery',
    ];
    for (const message of messages) {
      expect(modal).toContain(message);
      expect(host).toContain(`case '${message}'`);
    }
    expect(host).toContain('await startAutonomousDeliveryFromRequest');
    expect(host).toContain('await resumeAutonomousDeliveryCommand');
    expect(modal).toContain('postMessage({ type: message, deliveryId })');
    expect(modal).toContain('run(action.message, delivery.id)');
    expect(host).toContain("typeof msg.deliveryId === 'string' ? msg.deliveryId : undefined");
    expect(host).not.toContain("case 'startAutonomousDelivery':\n        await vscode.commands.executeCommand");
  });

  it('switches any pipeline epic into a persisted autonomous run mode', () => {
    const root = path.resolve(process.cwd());
    const detail = fs.readFileSync(path.join(root, 'src/webview/components/epic-v3/EpicDetail.tsx'), 'utf8');
    const host = fs.readFileSync(path.join(root, 'src/v2/workspaceWebview.ts'), 'utf8');

    expect(detail).toContain("type: 'setEpicRunMode'");
    expect(detail).toContain("setRunMode('autonomous')");
    expect(detail).toContain("setRunMode('guided')");
    expect(detail).not.toContain("mock('epic.config.runMode'");
    expect(detail).toContain('<Mono>{epic.runMode === \'autonomous\' ? \'autonomous\' : \'guided\'}</Mono>');
    expect(host).toContain("case 'setEpicRunMode'");
    expect(host).toContain('setEpicRunMode(root, doc, epicId, mode)');
    expect(host).toContain("case 'runEpicAutonomously'");
    expect(host).toContain('await runEpicAutonomouslyCommand(epicId)');
    expect(detail).toContain('Run / resume selected-provider master');
    expect(detail).toContain("type: 'runEpicAutonomously'");
    const master = fs.readFileSync(path.join(root, '../core/src/delivery/AutonomousMaster.ts'), 'utf8');
    expect(master).toContain("AUTONOMOUS_EPIC_MASTER_COMMAND = '/aidlc-autonomous-epic'");
    expect(master).toContain('Continue only while');
    expect(master).toContain('configured human-review or merge gate');
    expect(master).toContain('resolve-bugs');
  });

  it('launches the full Cohesive Delivery through a visible Claude master command', () => {
    const root = path.resolve(process.cwd());
    const commands = fs.readFileSync(path.join(root, 'src/v2/autonomousDeliveryCommands.ts'), 'utf8');
    // The master command id + prompt template are shared with the CLI via
    // @aidlc/core (see packages/core/src/delivery/AutonomousMaster.ts) so both
    // launch surfaces hand off to the exact same Claude command.
    const masterModule = fs.readFileSync(
      path.join(root, '../core/src/delivery/AutonomousMaster.ts'),
      'utf8',
    );
    expect(masterModule).toContain("export const AUTONOMOUS_MASTER_COMMAND = '/aidlc-autonomous-delivery'");
    expect(commands).toContain('ensureAutonomousMasterCommand(workspaceRoot)');
    expect(commands).toContain('launchAutonomousMaster(workspaceRoot, id, output)');
    expect(commands).toContain("'aidlc.runStepWithFeedback',");
    expect(masterModule).toContain('Never invoke a global');
    expect(masterModule).toContain('Do not rerun an approved upstream phase');
    expect(masterModule).toContain('Report the checkpoint selected before doing any work.');
    expect(masterModule).toContain('one independent epic');
    expect(masterModule).toContain('explicitly approves it in AIDLC');
    expect(commands).not.toContain('Execute independent work packages in parallel');
    expect(commands).not.toContain("'cohesive', 'run'");
    expect(commands).not.toContain("['cohesive', 'resume', id]");
    expect(commands).not.toContain('orchestrator.rework(');
    expect(commands).not.toContain('.resumeAfterMerge(');
  });

  it('offers one-click agent retry for failed or previously attempted workflow steps', () => {
    const root = path.resolve(process.cwd());
    const card = fs.readFileSync(path.join(root, 'src/webview/components/EpicCard.tsx'), 'utf8');
    const detail = fs.readFileSync(path.join(root, 'src/webview/components/epic-v3/EpicDetail.tsx'), 'utf8');
    const host = fs.readFileSync(path.join(root, 'src/v2/workspaceWebview.ts'), 'utf8');
    const runSvc = fs.readFileSync(path.join(root, 'src/v2/providerRunLogic.ts'), 'utf8');
    expect(card).toContain('runStepButtonLabel');
    expect(detail).toContain('runStepButtonLabel');
    expect(host).toContain("case 'rerunAndRunWithClaude'");
    expect(host).toContain("'aidlc.runStepWithFeedback', slash, runId, feedback");
    expect(runSvc).toContain('buildTaskPrompt');
    expect(runSvc).toContain('terminalNameForProvider');
    expect(card).toContain("mode={isBugResolutionStep(focused) ? 'bug-report' : 'feedback'}");
    expect(detail).toContain("mode={isBugResolution ? 'bug-report' : 'feedback'}");
    expect(detail).not.toContain('Cách can thiệp thực tế');
    const modal = fs.readFileSync(path.join(root, 'src/webview/components/RunWithFeedbackModal.tsx'), 'utf8');
    expect(modal).toContain('Chèn ảnh');
    expect(modal).toContain('pickBugImages');
    expect(modal).toContain('savePastedBugImage');
  });

  it('keeps general and per-step help aligned with provider-aware execution', () => {
    const root = path.resolve(process.cwd());
    const cohesiveGuide = fs.readFileSync(path.join(root, 'media/guides/cohesive-delivery.md'), 'utf8');
    const gettingStarted = fs.readFileSync(path.join(root, 'media/getting-started.md'), 'utf8');
    const ask = fs.readFileSync(path.join(root, 'src/v2/askCommand.ts'), 'utf8');
    const stepHelp = fs.readFileSync(path.join(root, '../core/src/presets/builtinWorkflows.ts'), 'utf8');
    const providers = fs.readFileSync(path.join(root, 'src/webview/lib/providers.ts'), 'utf8');

    for (const contents of [cohesiveGuide, gettingStarted, ask, stepHelp]) {
      expect(contents).toContain('/aidlc-autonomous-delivery');
    }
    expect(providers).toContain('runStepButtonLabel');
    expect(providers).toContain('isRunStepDisabled');
    expect(cohesiveGuide).toContain('không chạy lại từ đầu');
    expect(gettingStarted).toContain('does not launch a global `aidlc cohesive`');
  });
});
