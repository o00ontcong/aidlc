import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { AidlcApplication, FakeModelProvider, ModelProviderRegistry, type ModelDescriptor } from '../src';

const ACTOR = { kind: 'user' as const, id: 'runtime-test' };
const MODELS: ModelDescriptor[] = [{
  provider: 'fake', modelId: 'all-purpose', tiers: ['fast', 'balanced', 'deep', 'review'],
  contextWindowTokens: 100_000, supportsTools: true,
}];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-runtime-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'runtime-fixture', scripts: { test: 'vitest' } }));
  const registry = new ModelProviderRegistry();
  const provider = new FakeModelProvider('fake', MODELS);
  registry.register(provider, { default: true });
  return { root, provider, app: new AidlcApplication(root, { models: registry }) };
}

async function start(app: AidlcApplication, id: string, mode: 'guide' | 'assist' | 'auto') {
  await app.bus.dispatch(app.bus.command('start', 'epic.start', ACTOR, { id, title: id, profile: 'quick' }));
  await app.bus.dispatch(app.bus.command('prepare', 'epic.prepare', ACTOR, { epicId: id }));
  return app.bus.dispatch(app.bus.command('run', 'epic.run', ACTOR, { epicId: id, mode }));
}

describe('compiled workflow runtime', () => {
  it('executes an auto Quick workflow through model, evidence, validator lock, and review', async () => {
    const { root, app, provider } = fixture();
    const run = await start(app, 'EPIC-RUNTIME-AUTO', 'auto');
    expect(run.status).toBe('ok');
    expect((run.data as { run: { workflowHash: string; stages: unknown[] } }).run).toMatchObject({ workflowHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect((run.data as { run: { stages: unknown[] } }).run.stages).toHaveLength(3);

    await app.bus.dispatch(app.bus.command('next-1', 'epic.next', ACTOR, { epicId: 'EPIC-RUNTIME-AUTO' }));
    await app.bus.dispatch(app.bus.command('next-2', 'epic.next', ACTOR, { epicId: 'EPIC-RUNTIME-AUTO' }));
    const finished = await app.bus.dispatch(app.bus.command('next-3', 'epic.next', ACTOR, { epicId: 'EPIC-RUNTIME-AUTO' }));

    expect(finished.status).toBe('ok');
    expect(app.epics.require('EPIC-RUNTIME-AUTO').status).toBe('review');
    expect(provider.executed).toHaveLength(3);
    expect(provider.executed[0]).toMatchObject({ workingDirectory: root, mutationAllowed: false });
    expect(provider.executed[1]).toMatchObject({ workingDirectory: root, mutationAllowed: true });
    const activeRun = app.epics.require('EPIC-RUNTIME-AUTO').activeRunId!;
    expect(fs.existsSync(path.join(root, '.aidlc', 'runs', activeRun, 'evidence', 'verify.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.aidlc', 'runs', activeRun, 'validators.lock.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.aidlc', 'catalog', 'selection.lock.yaml'))).toBe(true);
  });

  it('keeps guide mode read-only and executes an assist mutation only after correlated approval', async () => {
    const guide = fixture();
    await start(guide.app, 'EPIC-RUNTIME-GUIDE', 'guide');
    const preview = await guide.app.bus.dispatch(guide.app.bus.command('next-guide', 'epic.next', ACTOR, { epicId: 'EPIC-RUNTIME-GUIDE' }));
    expect(preview).toMatchObject({ status: 'ok', data: { status: 'guidance', actionId: 'analyze-project' } });
    expect(guide.provider.executed).toHaveLength(0);
    await guide.app.bus.dispatch(guide.app.bus.command('raise-mode', 'epic.stage.autonomy.set', ACTOR, { epicId: 'EPIC-RUNTIME-GUIDE', stageId: 'understand', autonomy: 'auto' }));
    const afterModeChange = await guide.app.bus.dispatch(guide.app.bus.command('next-auto', 'epic.next', ACTOR, { epicId: 'EPIC-RUNTIME-GUIDE' }));
    expect(afterModeChange).toMatchObject({ status: 'ok', data: { status: 'completed-action', actionId: 'analyze-project' } });
    expect(guide.provider.executed).toHaveLength(1);

    const assist = fixture();
    await start(assist.app, 'EPIC-RUNTIME-ASSIST', 'assist');
    await assist.app.bus.dispatch(assist.app.bus.command('understand', 'epic.next', ACTOR, { epicId: 'EPIC-RUNTIME-ASSIST' }));
    const waiting = await assist.app.bus.dispatch(assist.app.bus.command('build', 'epic.next', ACTOR, { epicId: 'EPIC-RUNTIME-ASSIST' }));
    expect(waiting.status).toBe('waiting-for-user');
    const epic = assist.app.epics.require('EPIC-RUNTIME-ASSIST');
    expect(epic.pendingGate).toMatchObject({ actionId: 'implement', preview: { gate: 'manual_confirmation' } });
    expect(assist.provider.executed).toHaveLength(1);

    const approved = await assist.app.bus.dispatch(assist.app.bus.command('approve', 'gate.approve', ACTOR, { epicId: epic.id, gateId: epic.pendingGate!.id }));
    expect(approved.status).toBe('ok');
    expect(assist.app.epics.require(epic.id).stages.find((stage) => stage.id === 'build')?.actions[0]?.status).toBe('completed');
    expect(assist.provider.executed).toHaveLength(2);
  });

  it('re-enters the rejected action after an explicit resume instead of deadlocking the run', async () => {
    const { app, provider } = fixture();
    const id = 'EPIC-RUNTIME-REJECT-RESUME';
    await start(app, id, 'assist');
    await app.bus.dispatch(app.bus.command('understand', 'epic.next', ACTOR, { epicId: id }));
    await app.bus.dispatch(app.bus.command('build-gate', 'epic.next', ACTOR, { epicId: id }));
    const firstGate = app.epics.require(id).pendingGate!;

    const rejected = await app.bus.dispatch(app.bus.command('reject', 'gate.reject', ACTOR, {
      epicId: id,
      gateId: firstGate.id,
      reason: 'Revise the implementation preview.',
    }));
    expect(rejected).toMatchObject({ status: 'ok', data: { status: 'rejected', epic: { status: 'paused' } } });

    await app.bus.dispatch(app.bus.command('resume', 'epic.resume', ACTOR, { epicId: id }));
    const retried = await app.bus.dispatch(app.bus.command('retry', 'epic.next', ACTOR, { epicId: id }));
    expect(retried).toMatchObject({ status: 'waiting-for-user', data: { actionId: 'implement' } });
    expect(app.epics.require(id).pendingGate?.id).not.toBe(firstGate.id);
    expect(provider.executed).toHaveLength(1);
  });

  it('redacts provider secrets before writing durable execution evidence', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-runtime-redaction-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'runtime-redaction' }));
    const registry = new ModelProviderRegistry();
    registry.register(new FakeModelProvider('fake', MODELS, {
      result: { content: 'Bearer abcdefghijklmnop api_key=super-secret-value', stopReason: 'end_turn' },
    }), { default: true });
    const app = new AidlcApplication(root, { models: registry });
    const id = 'EPIC-RUNTIME-REDACT';
    await start(app, id, 'auto');
    await app.bus.dispatch(app.bus.command('next', 'epic.next', ACTOR, { epicId: id }));
    const runId = app.epics.require(id).activeRunId!;
    const evidence = fs.readFileSync(path.join(root, '.aidlc', 'runs', runId, 'evidence', 'analyze-project.json'), 'utf8');
    expect(evidence).toContain('[REDACTED]');
    expect(evidence).not.toContain('abcdefghijklmnop');
    expect(evidence).not.toContain('super-secret-value');
  });

  it('runs unattended end-to-end until the non-bypassable external communication gate', async () => {
    const { app, provider } = fixture();
    const id = 'EPIC-RUNTIME-UNATTENDED';
    await app.bus.dispatch(app.bus.command('start', 'epic.start', ACTOR, { id, title: id, profile: 'standard' }));
    await app.bus.dispatch(app.bus.command('prepare', 'epic.prepare', ACTOR, { epicId: id }));
    await app.bus.dispatch(app.bus.command('run', 'epic.run', ACTOR, { epicId: id, mode: 'unattended' }));
    const result = await app.bus.dispatch(app.bus.command('next', 'epic.next', ACTOR, { epicId: id }));
    expect(result.status).toBe('waiting-for-user');
    expect(app.epics.require(id).pendingGate).toMatchObject({ actionId: 'ship', preview: { gate: 'external_communication' } });
    expect(provider.executed).toHaveLength(4);
  });
});
