import { describe, expect, it } from 'vitest';
import { createDefaultAutonomyPolicy } from '../src/contracts';
import { AutonomyController, planRecovery } from '../src/autonomy';

describe('AutonomyController', () => {
  it('never lets unattended mode bypass external communication', () => {
    const controller = new AutonomyController();
    const evaluation = controller.evaluate(createDefaultAutonomyPolicy(), 'unattended', {
      mutation: true,
      externalCommunication: 'pull-request',
      destination: 'github.com/acme/app',
      contentSummary: 'Open a pull request',
      mutationScope: ['pull-request'],
    });
    expect(evaluation).toMatchObject({ gate: 'external_communication', hard: true, requiresApproval: true });
    expect(controller.canProceed(evaluation)).toBe(false);
    expect(controller.canProceed(evaluation, { gate: 'external_communication', outcome: 'approved', preview: evaluation.preview! })).toBe(false);
    expect(controller.canProceed(evaluation, {
      gate: 'external_communication', outcome: 'approved', preview: evaluation.preview!,
      decidedBy: { kind: 'user', id: 'reviewer' }, decidedAt: '2026-08-09T00:00:00.000Z',
    })).toBe(true);
  });

  it('supports per-stage mode changes without changing durable Epic state', () => {
    const policy = createDefaultAutonomyPolicy();
    policy.stages.build = 'unattended';
    const controller = new AutonomyController();
    expect(controller.effectiveMode(policy, 'build')).toBe('unattended');
    policy.stages.build = 'assist';
    expect(controller.effectiveMode(policy, 'build')).toBe('assist');
  });

  it('returns deterministic recovery/escalation actions', () => {
    const policy = createDefaultAutonomyPolicy();
    policy.recovery.onValidationFailure = 'repair-and-retry';
    expect(planRecovery(policy, 'validation-failure', 1)).toMatchObject({ retry: true, actions: [{ kind: 'apply-fix' }] });
    expect(planRecovery(policy, 'execution-failure', 3)).toMatchObject({ retry: false, actions: [{ kind: 'escalate' }] });
  });
});
