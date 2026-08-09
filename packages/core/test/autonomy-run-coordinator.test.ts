import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { createDefaultAutonomyPolicy } from '../src/contracts';
import { AutonomyRunCoordinator } from '../src/autonomy';
import { EpicService } from '../src/epic';

function runningEpic(): { service: EpicService; id: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-autonomy-run-'));
  const service = new EpicService(root);
  const draft = service.create({ id: 'EPIC-GATE', title: 'Gate test', autonomy: { ...createDefaultAutonomyPolicy(), stages: { build: 'unattended' } } });
  const ready = service.transition(draft.id, 'ready', { expectedRevision: draft.revision });
  return { service, id: service.startRun(ready.id, { expectedRevision: ready.revision, workflowHash: 'test' }).epic.id };
}

describe('AutonomyRunCoordinator', () => {
  it('persists an approval wait and resumes only after approval', () => {
    const { service, id } = runningEpic();
    const coordinator = new AutonomyRunCoordinator(service);
    const guarded = coordinator.guard({
      epicId: id, stageId: 'build',
      subject: { mutation: true, externalCommunication: 'pull-request', destination: 'github.com/acme/app', contentSummary: 'Open PR' },
    });
    expect(guarded).toMatchObject({ status: 'waiting-for-approval', epic: { status: 'waiting-for-user' } });
    expect(service.require(id).pendingGate?.id).toBe(guarded.pendingGate?.id);
    const approved = coordinator.decide(id, guarded.evaluation, {
      gate: 'external_communication', outcome: 'approved', preview: guarded.evaluation.preview!, decidedBy: { kind: 'user', id: 'alice' }, decidedAt: '2026-08-09T00:00:00.000Z',
    }, guarded.epic.revision);
    expect(approved).toMatchObject({ status: 'approved', epic: { status: 'running' } });
    expect(service.events(id).map((event) => event.command)).toContain('gate.approve');
    expect(service.events(id).at(-1)?.gateDecision).toMatchObject({ outcome: 'approved', decidedBy: { kind: 'user', id: 'alice' } });
    expect(service.require(id).pendingGate).toBeUndefined();
  });

  it('rejects a decision that is not correlated with the durable pending preview', () => {
    const { service, id } = runningEpic();
    const coordinator = new AutonomyRunCoordinator(service);
    const guarded = coordinator.guard({ epicId: id, stageId: 'build', subject: { mutation: true, externalCommunication: 'comment', destination: 'issue:1', contentSummary: 'Post comment' } });
    expect(() => coordinator.decide(id, guarded.evaluation, {
      gate: 'external_communication', outcome: 'approved',
      preview: { ...guarded.evaluation.preview!, contentSummary: 'Different content' },
      decidedBy: { kind: 'user', id: 'alice' }, decidedAt: '2026-08-09T00:00:00.000Z',
    }, guarded.epic.revision)).toThrow(/preview does not match/);
  });

  it('blocks an Epic when recovery needs a human rather than retrying', () => {
    const { service, id } = runningEpic();
    const coordinator = new AutonomyRunCoordinator(service);
    const result = coordinator.recover(id, 'ambiguous-requirement', 1, service.require(id).revision);
    expect(result).toMatchObject({ plan: { retry: false }, epic: { status: 'blocked' } });
  });

  it('changes stage autonomy during a run without migrating or replacing run state', () => {
    const { service, id } = runningEpic();
    const before = service.require(id);
    const updated = service.update(id, { autonomy: { ...before.autonomy, stages: { ...before.autonomy.stages, verify: 'assist' } } }, before.revision);
    expect(updated.activeRunId).toBe(before.activeRunId);
    expect(updated.autonomy.stages.verify).toBe('assist');
    expect(service.store.loadRun(before.activeRunId!)?.id).toBe(before.activeRunId);
  });
});
