import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { formatEpicEventId, formatEventId, type Epic, type EpicRun } from '../src/contracts';
import {
  EpicAlreadyExistsError,
  EpicRevisionConflictError,
  EpicService,
  EpicTransitionError,
} from '../src/epic';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-epic-service-'));
}

const INPUT = {
  id: 'EPIC-PRICE-ALERTS',
  title: 'Price alerts',
  description: 'Notify users when a price crosses its threshold.',
} as const;

function readyEpic(service: EpicService): Epic {
  const created = service.create(INPUT);
  return service.transition(created.id, 'ready', { expectedRevision: created.revision });
}

function runningEpic(service: EpicService): { epic: Epic; run: EpicRun } {
  const ready = readyEpic(service);
  const result = service.startRun(ready.id, {
    expectedRevision: ready.revision,
    workflowHash: 'workflow:price-alerts:v1',
  });
  return { epic: result.epic, run: result.run };
}

describe('EpicService — unified durable state', () => {
  it('starts idempotently and never creates a duplicate Epic', () => {
    const service = new EpicService(tmpRoot());
    const first = service.start(INPUT);
    const second = service.start({ ...INPUT, title: 'A changed title must not overwrite the first Epic' });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.epic).toEqual(first.epic);
    expect(second.nextAction?.command).toBe('epic.prepare');
    expect(service.list()).toHaveLength(1);
    expect(() => service.create(INPUT)).toThrow(EpicAlreadyExistsError);
  });

  it('persists one Epic projection, one active run projection, and append-only events', () => {
    const service = new EpicService(tmpRoot());
    const ready = readyEpic(service);
    const started = service.startRun(ready.id, {
      expectedRevision: ready.revision,
      workflowHash: 'workflow:price-alerts:v1',
      command: 'epic.run',
    });

    expect(started.started).toBe(true);
    expect(started.epic.status).toBe('running');
    expect(started.epic.activeRunId).toBe('EPIC-PRICE-ALERTS--run-001');
    expect(started.run.status).toBe('running');
    expect(service.events(started.epic.id)).toHaveLength(2);

    const paused = service.transition(started.epic.id, 'paused', {
      expectedRevision: started.epic.revision,
      command: 'epic.pause',
    });
    const resumed = service.resume(paused.id, { expectedRevision: paused.revision, command: 'epic.resume' });

    expect(resumed.resumed).toBe(true);
    expect(resumed.epic.status).toBe('running');
    expect(service.events(resumed.epic.id).map((event) => [event.from, event.to])).toEqual([
      ['draft', 'ready'],
      ['ready', 'running'],
      ['running', 'paused'],
      ['paused', 'running'],
    ]);
    expect(service.store.loadRun(resumed.epic.activeRunId!)?.status).toBe('running');

    const noOp = service.resume(resumed.epic.id);
    expect(noOp.resumed).toBe(false);
    expect(noOp.epic.revision).toBe(resumed.epic.revision);
  });

  it('rejects invalid transitions and stale concurrent writes', () => {
    const service = new EpicService(tmpRoot());
    const created = service.create(INPUT);

    expect(() => service.transition(created.id, 'shipping', { expectedRevision: created.revision }))
      .toThrow(EpicTransitionError);

    const edited = service.update(created.id, { title: 'Price alert preferences' }, created.revision);
    expect(edited.revision).toBe(1);
    expect(() => service.update(created.id, { description: 'stale editor' }, created.revision))
      .toThrow(EpicRevisionConflictError);
  });

  it('validates the complete durable Epic before the first write', () => {
    const root = tmpRoot();
    const service = new EpicService(root);
    expect(() => service.create({ ...INPUT, profile: 'invalid' as Epic['profile'] })).toThrow(/Invalid Epic/);
    expect(fs.existsSync(path.join(root, '.aidlc', 'epics', INPUT.id, 'state.json'))).toBe(false);
  });

  it('recovers a state write interrupted before atomic rename', () => {
    const service = new EpicService(tmpRoot());
    const created = service.create(INPUT);
    const stateFile = service.store.epicStateFile(created.id);
    fs.renameSync(stateFile, `${stateFile}.tmp`);

    const reloaded = new EpicService(service.store.workspaceRoot).require(created.id);
    expect(reloaded).toMatchObject({ id: created.id, status: 'draft', revision: 0 });
    expect(fs.existsSync(stateFile)).toBe(true);
    expect(fs.existsSync(`${stateFile}.tmp`)).toBe(false);
  });

  it('recovers a pre-run Epic projection from its append-only audit event', () => {
    const service = new EpicService(tmpRoot());
    const created = service.create(INPUT);
    service.store.appendEpicEvent(created.id, {
      schemaVersion: 1, id: formatEpicEventId(created.id, 1),
      at: '2026-08-09T10:00:00.000Z', actor: { kind: 'system', id: 'crash-simulation' },
      epicId: created.id, command: 'epic.prepare', from: 'draft', to: 'ready', evidence: [],
    });
    expect(new EpicService(service.store.workspaceRoot).require(created.id).status).toBe('ready');
  });

  it('rebuilds stale read projections from an already-appended event after a crash', () => {
    const service = new EpicService(tmpRoot());
    const { epic, run } = runningEpic(service);
    service.store.appendEvent(run.id, {
      schemaVersion: 1,
      id: formatEventId(run.id, 2),
      at: '2026-08-09T10:00:00.000Z',
      actor: { kind: 'system', id: 'crash-simulation' },
      epicId: epic.id,
      runId: run.id,
      command: 'epic.pause',
      from: 'running',
      to: 'paused',
      evidence: [],
    });

    const recovered = new EpicService(service.store.workspaceRoot).require(epic.id);
    expect(recovered.status).toBe('paused');
    expect(new EpicService(service.store.workspaceRoot).store.loadRun(run.id)?.status).toBe('paused');
  });

  it('redacts credentials before persisting audit events', () => {
    const service = new EpicService(tmpRoot());
    const { epic, run } = runningEpic(service);
    service.store.appendEvent(run.id, {
      schemaVersion: 1,
      id: formatEventId(run.id, 2),
      at: '2026-08-09T10:00:00.000Z',
      actor: { kind: 'system', id: 'redaction-test' },
      epicId: epic.id,
      runId: run.id,
      command: 'epic.explain',
      evidence: [],
      detail: 'provider returned Bearer abcdefghijklmnop',
    });

    expect(service.store.readEvents(run.id).at(-1)?.detail).toBe('provider returned [REDACTED]');
    expect(fs.readFileSync(service.store.runEventsFile(run.id), 'utf8')).not.toContain('abcdefghijklmnop');
  });
});
