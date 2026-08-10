import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import {
  autonomousDeliveryActions,
  autonomousDeliveryReadiness,
} from '../src/webview/lib/autonomousDelivery';
import type { AutonomousDeliverySummary } from '../src/webview/lib/types';

const complete = [
  { id: 'project-context', steps: Array(7) },
  { id: 'cohesive-feature', steps: Array(13) },
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

  it('rejects the legacy four-step project-context pipeline', () => {
    const pipelines = complete.map((pipeline) =>
      pipeline.id === 'project-context' ? { ...pipeline, steps: Array(4) } : pipeline,
    );
    expect(autonomousDeliveryReadiness(pipelines)).toEqual({
      ready: false,
      missingOrOutdated: ['project-context (4/7 steps)'],
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

  it('launches the full Cohesive Delivery through a visible Claude master command', () => {
    const root = path.resolve(process.cwd());
    const commands = fs.readFileSync(path.join(root, 'src/v2/autonomousDeliveryCommands.ts'), 'utf8');
    expect(commands).toContain("const AUTONOMOUS_MASTER_COMMAND = '/aidlc-autonomous-delivery'");
    expect(commands).toContain('ensureAutonomousMasterCommand(workspaceRoot)');
    expect(commands).toContain('launchAutonomousMaster(workspaceRoot, id, output)');
    expect(commands).toContain("'aidlc.runStepWithFeedback',");
    expect(commands).toContain('Never invoke a global');
    expect(commands).toContain('Do not rerun an approved upstream phase');
    expect(commands).toContain('Report the checkpoint selected before doing any work.');
    expect(commands).toContain('one independent epic');
    expect(commands).not.toContain('Execute independent work packages in parallel');
    expect(commands).not.toContain("'cohesive', 'run'");
    expect(commands).not.toContain("['cohesive', 'resume', id]");
    expect(commands).not.toContain('orchestrator.rework(');
    expect(commands).not.toContain('.resumeAfterMerge(');
  });

  it('offers one-click Claude retry for failed or previously attempted workflow steps', () => {
    const root = path.resolve(process.cwd());
    const card = fs.readFileSync(path.join(root, 'src/webview/components/EpicCard.tsx'), 'utf8');
    const host = fs.readFileSync(path.join(root, 'src/v2/workspaceWebview.ts'), 'utf8');
    expect(card).toContain('Run again with Claude');
    expect(card).toContain("type: 'rerunAndRunWithClaude'");
    expect(card).toContain('hasPreviousAttempt');
    expect(host).toContain("case 'rerunAndRunWithClaude'");
    expect(host).toContain("'aidlc.runStepWithFeedback', slash, runId, feedback");
  });

  it('keeps general and per-step help aligned with Claude-only execution and recovery', () => {
    const root = path.resolve(process.cwd());
    const cohesiveGuide = fs.readFileSync(path.join(root, 'media/guides/cohesive-delivery.md'), 'utf8');
    const gettingStarted = fs.readFileSync(path.join(root, 'media/getting-started.md'), 'utf8');
    const ask = fs.readFileSync(path.join(root, 'src/v2/askCommand.ts'), 'utf8');
    const stepHelp = fs.readFileSync(path.join(root, '../core/src/presets/builtinWorkflows.ts'), 'utf8');

    for (const contents of [cohesiveGuide, gettingStarted, ask, stepHelp]) {
      expect(contents).toContain('/aidlc-autonomous-delivery');
      expect(contents).toContain('Run again with Claude');
    }
    expect(cohesiveGuide).toContain('không chạy lại từ đầu');
    expect(cohesiveGuide).toContain('nhiều feature epic độc lập');
    expect(gettingStarted).toContain('does not launch a global `aidlc cohesive`');
  });
});
