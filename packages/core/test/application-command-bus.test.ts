import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AidlcApplication } from '../src/application';

describe('AidlcApplication command boundary', () => {
  it('runs Epic and Project operations through typed command results', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-application-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }));
    const app = new AidlcApplication(root);
    const start = await app.bus.dispatch(app.bus.command('1', 'epic.start', { kind: 'user', id: 'test' }, { id: 'EPIC-APP', title: 'App boundary' }));
    expect(start.status).toBe('ok');
    const status = await app.bus.dispatch(app.bus.command('2', 'epic.status', { kind: 'user', id: 'test' }, { epicId: 'EPIC-APP' }));
    expect((status.data as { id: string }).id).toBe('EPIC-APP');
    const analysis = await app.bus.dispatch(app.bus.command('3', 'project.analyze', { kind: 'user', id: 'test' }, {}));
    expect(analysis.status).toBe('ok');
  });

  it('does not implicitly run project analysis on the primary Epic execution path', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-application-nonblocking-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'nonblocking' }));
    const app = new AidlcApplication(root);
    const analyze = vi.spyOn(app.project, 'analyze').mockImplementation(() => {
      throw new Error('project analysis must remain explicit');
    });
    const actor = { kind: 'user' as const, id: 'nonblocking' };
    await app.bus.dispatch(app.bus.command('start', 'epic.start', actor, { id: 'EPIC-NONBLOCKING', title: 'Nonblocking', profile: 'quick' }));
    await app.bus.dispatch(app.bus.command('prepare', 'epic.prepare', actor, { epicId: 'EPIC-NONBLOCKING' }));
    expect((await app.bus.dispatch(app.bus.command('run', 'epic.run', actor, { epicId: 'EPIC-NONBLOCKING', mode: 'guide' }))).status).toBe('ok');
    expect((await app.bus.dispatch(app.bus.command('next', 'epic.next', actor, { epicId: 'EPIC-NONBLOCKING' }))).status).toBe('ok');
    expect(analyze).not.toHaveBeenCalled();
  });

  it('rejects invalid command payloads before durable state is written', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-application-invalid-'));
    const app = new AidlcApplication(root);
    const result = await app.bus.dispatch(app.bus.command('invalid', 'epic.start', { kind: 'user', id: 'test' }, { id: 'EPIC-INVALID', title: 'Invalid', profile: 'unknown' }));
    expect(result.status).toBe('error');
    expect(fs.existsSync(path.join(root, '.aidlc', 'epics', 'EPIC-INVALID', 'state.json'))).toBe(false);
  });

  it('uses valid command names and preserves waiting/blocked outcomes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-application-status-'));
    const app = new AidlcApplication(root);
    await app.bus.dispatch(app.bus.command('start', 'epic.start', { kind: 'user', id: 'test' }, { id: 'EPIC-STATUS', title: 'Status' }));
    const draft = app.epics.require('EPIC-STATUS');
    const ready = app.epics.transition(draft.id, 'ready', { expectedRevision: draft.revision });
    const running = app.epics.startRun(ready.id, { expectedRevision: ready.revision, workflowHash: 'hash' }).epic;
    app.epics.transition(running.id, 'blocked', { expectedRevision: running.revision, detail: 'Needs input' });
    const status = await app.bus.dispatch(app.bus.command('status', 'epic.status', { kind: 'user', id: 'test' }, { epicId: 'EPIC-STATUS' }));
    expect(status.status).toBe('blocked');
    expect(() => app.bus.command('bad', 'artifact.preview-commit', { kind: 'user', id: 'test' }, {})).toThrow(/ApplicationCommand/);
    expect(app.bus.command('good', 'artifact.preview.commit', { kind: 'user', id: 'test' }, {}).name).toBe('artifact.preview.commit');
  });

  it('persists and resolves a hard gate through application commands', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-application-gate-'));
    const app = new AidlcApplication(root);
    const actor = { kind: 'user' as const, id: 'reviewer' };
    await app.bus.dispatch(app.bus.command('start', 'epic.start', actor, { id: 'EPIC-GATE-APP', title: 'Gate app' }));
    await app.bus.dispatch(app.bus.command('prepare', 'epic.prepare', actor, { epicId: 'EPIC-GATE-APP' }));
    await app.bus.dispatch(app.bus.command('run', 'epic.run', actor, { epicId: 'EPIC-GATE-APP', workflowHash: 'hash' }));
    const request = await app.bus.dispatch(app.bus.command('gate', 'gate.request', actor, {
      epicId: 'EPIC-GATE-APP', stageId: 'build',
      subject: { mutation: true, externalCommunication: 'pull-request', destination: 'github.com/acme/app', contentSummary: 'Open PR' },
    }));
    expect(request.status).toBe('waiting-for-user');
    const waiting = app.epics.require('EPIC-GATE-APP');
    const gateId = waiting.pendingGate!.id;
    expect(() => app.epics.transition(waiting.id, 'running', { expectedRevision: waiting.revision }))
      .toThrow(/explicitly approved/);
    const bypass = await app.bus.dispatch(app.bus.command('resume', 'epic.resume', actor, { epicId: 'EPIC-GATE-APP' }));
    expect(bypass).toMatchObject({ status: 'waiting-for-user', data: { resumed: false, epic: { status: 'waiting-for-user' } } });
    expect(app.epics.require('EPIC-GATE-APP').pendingGate?.id).toBe(gateId);
    const approval = await app.bus.dispatch(app.bus.command('approve', 'gate.approve', actor, { epicId: 'EPIC-GATE-APP', gateId }));
    expect(approval).toMatchObject({ status: 'ok', data: { status: 'approved', epic: { status: 'running' } } });
    expect(app.epics.require('EPIC-GATE-APP').pendingGate).toBeUndefined();
  });

  it('covers setup, help, why-blocked, run --mode, and epic-aware gate preview', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-application-parity-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'parity' }));
    const app = new AidlcApplication(root);
    const actor = { kind: 'user' as const, id: 'parity' };

    const preview = await app.bus.dispatch(app.bus.command('setup-preview', 'project.setup', actor, {}));
    expect(preview).toMatchObject({
      status: 'ok',
      data: { applied: false, defaultAutonomy: 'guide' },
      warnings: [expect.stringContaining('confirm')],
    });
    expect(fs.existsSync(path.join(root, '.aidlc', 'project.yaml'))).toBe(false);

    const applied = await app.bus.dispatch(app.bus.command('setup-apply', 'project.setup', actor, { confirm: true }));
    expect(applied.status).toBe('ok');
    expect(fs.existsSync(path.join(root, '.aidlc', 'project.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.claude', 'commands', 'aidlc.md'))).toBe(true);
    expect((applied.data as { claudeCommand: { installed: boolean } }).claudeCommand.installed).toBe(true);

    const analysis = await app.bus.dispatch(app.bus.command('analyze-after-setup', 'project.analyze', actor, {}));
    expect(analysis).toMatchObject({ status: 'ok', data: { analysisStatus: 'published', revision: 0 } });
    const refreshed = await app.bus.dispatch(app.bus.command('refresh-after-setup', 'project.context.refresh', actor, {}));
    expect(refreshed).toMatchObject({ status: 'ok', data: { analysisStatus: 'published', revision: 0 } });

    const help = await app.bus.dispatch(app.bus.command('help', 'guide.help', actor, { topic: 'start' }));
    expect(help).toMatchObject({ status: 'ok', data: { id: 'start' } });
    expect(((help.data as { commands: string[] }).commands).some((command) => command.includes('epic-v3 run'))).toBe(true);

    await app.bus.dispatch(app.bus.command('start', 'epic.start', actor, { id: 'EPIC-PARITY', title: 'Parity' }));
    await app.bus.dispatch(app.bus.command('prepare', 'epic.prepare', actor, { epicId: 'EPIC-PARITY' }));
    const run = await app.bus.dispatch(app.bus.command('run', 'epic.run', actor, {
      epicId: 'EPIC-PARITY', workflowHash: 'hash', mode: 'assist',
    }));
    expect(run.status).toBe('ok');
    expect(app.epics.require('EPIC-PARITY').autonomy.default).toBe('assist');

    await app.bus.dispatch(app.bus.command('autonomy', 'epic.stage.autonomy.set', actor, {
      epicId: 'EPIC-PARITY', stageId: 'ship', autonomy: 'unattended',
    }));
    const gate = await app.bus.dispatch(app.bus.command('gate', 'gate.preview', actor, {
      epicId: 'EPIC-PARITY',
      stageId: 'ship',
      subject: {
        mutation: true,
        externalCommunication: 'pull-request',
        destination: 'github.com/acme/parity',
        contentSummary: 'Open PR',
      },
    }));
    expect(gate).toMatchObject({
      status: 'ok',
      data: { mode: 'unattended', gate: 'external_communication', requiresApproval: true, hard: true },
    });

    await app.bus.dispatch(app.bus.command('wait', 'gate.request', actor, {
      epicId: 'EPIC-PARITY',
      stageId: 'ship',
      subject: {
        mutation: true,
        externalCommunication: 'comment',
        destination: 'github.com/acme/parity',
        contentSummary: 'Post review comment',
      },
    }));
    const why = await app.bus.dispatch(app.bus.command('why', 'guide.why.blocked', actor, { epicId: 'EPIC-PARITY' }));
    expect(why.status).toBe('waiting-for-user');
    expect((why.recoveryActions ?? []).length).toBeGreaterThan(0);
    expect((why.data as { summary: string }).summary).toMatch(/waiting for approval/i);
  });

  it('exposes recommendation override/lock and applies the explicit lock to new Epics', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-application-recommendation-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'recommendation' }));
    const app = new AidlcApplication(root);
    const actor = { kind: 'user' as const, id: 'selector' };
    await app.bus.dispatch(app.bus.command('recommend', 'project.recommend', actor, {}));
    const overridden = await app.bus.dispatch(app.bus.command('override', 'project.recommend.override', actor, { workflowProfile: 'quick' }));
    expect(overridden).toMatchObject({ status: 'ok', data: { workflowProfile: 'quick', status: 'overridden' } });
    expect((await app.bus.dispatch(app.bus.command('lock', 'project.recommend.lock', actor, {}))).status).toBe('ok');
    await app.bus.dispatch(app.bus.command('start', 'epic.start', actor, { id: 'EPIC-LOCKED-PROFILE', title: 'Locked profile' }));
    expect(app.epics.require('EPIC-LOCKED-PROFILE').profile).toBe('quick');
  });
});
