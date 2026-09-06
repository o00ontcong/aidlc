import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { AidlcApplication } from '../src/application';
import type { ChangeId, ChangeRequirement } from '../src/contracts';
import { computeChangeContentHash, type ProjectChangeDraft } from '../src/contracts/change';
import { computeSourceSnapshotHash } from '../src/contracts/contextProposal';
import { epicIdFromChangeId, generateContextRevisionId, toChangeId } from '../src/contracts/ids';

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-application-change-epic-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const USER = { kind: 'user' as const, id: 'cong' };
const AGENT = { kind: 'agent' as const, id: 'discover-scanner' };
const NOW = '2026-09-05T00:00:00.000Z';

function requirement(overrides: Partial<ChangeRequirement> = {}): ChangeRequirement {
  return {
    problem: 'Users cannot try the app without registering.',
    desiredOutcome: 'Users can enter a restricted guest session.',
    acceptanceCriteria: [{ id: 'AC-01', text: 'Guest can enter from the login screen.' }],
    inScope: [],
    outOfScope: [],
    constraints: [],
    ...overrides,
  };
}

function sourcePayload() {
  const draft = { schemaVersion: 1 as const, mode: 'filesystem' as const, root: 'workspace', capturedAt: NOW, files: [], warnings: [] };
  return { ...draft, sourceHash: computeSourceSnapshotHash(draft) };
}

function epicStartPayload(changeId: string, guard: { expectedRevision: number; expectedContentHash: string }) {
  return {
    changeId,
    guard,
    pipeline: { id: 'cofofo-feature', runMode: 'guided' as const },
    source: sourcePayload(),
    context: { baseRevisionId: generateContextRevisionId(), baseRootHash: 'a'.repeat(64), contextSliceHash: 'c'.repeat(64) },
  };
}

describe('AidlcApplication change.epic.* commands — end to end through the command bus (M3)', () => {
  it('walks create -> change.epic.start, then a second epic.start just navigates to the same Epic', async () => {
    const app = new AidlcApplication(newRoot());
    const created = await app.bus.dispatch(
      app.bus.command('1', 'change.create', USER, { title: 'Add guest mode', type: 'feature', requirement: requirement(), origin: { kind: 'user', entryPoint: 'project', actor: USER } }),
    );
    const change = (created.data as { change: { id: string; revision: number; contentHash: string } }).change;

    const started = await app.bus.dispatch(app.bus.command('2', 'change.epic.start', USER, epicStartPayload(change.id, { expectedRevision: change.revision, expectedContentHash: change.contentHash })));
    expect(started.status).toBe('ok');
    const startedData = started.data as { change: { epicLink: { state: string }; revision: number; contentHash: string }; epic: { id: string }; startSnapshot: { change: { id: string } }; alreadyLinked: boolean };
    expect(startedData.alreadyLinked).toBe(false);
    expect(startedData.change.epicLink.state).toBe('linked');
    expect(startedData.startSnapshot.change.id).toBe(change.id);

    const again = await app.bus.dispatch(
      app.bus.command('3', 'change.epic.start', USER, epicStartPayload(change.id, { expectedRevision: startedData.change.revision, expectedContentHash: startedData.change.contentHash })),
    );
    expect(again.status).toBe('ok');
    const againData = again.data as { alreadyLinked: boolean; epic: { id: string } };
    expect(againData.alreadyLinked).toBe(true);
    expect(againData.epic.id).toBe(startedData.epic.id);
  });

  it('rejects an agent actor for change.epic.start with a structured error', async () => {
    const app = new AidlcApplication(newRoot());
    const created = await app.bus.dispatch(app.bus.command('1', 'change.create', USER, { title: 'X', type: 'feature', requirement: requirement(), origin: { kind: 'user', entryPoint: 'project', actor: USER } }));
    const change = (created.data as { change: { id: string; revision: number; contentHash: string } }).change;
    const result = await app.bus.dispatch(app.bus.command('2', 'change.epic.start', AGENT, epicStartPayload(change.id, { expectedRevision: change.revision, expectedContentHash: change.contentHash })));
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('change.human_required');
  });

  it('surfaces a pending-saga conflict (resume/rollback recovery actions), then rollback frees the Change for a fresh Start Epic', async () => {
    const app = new AidlcApplication(newRoot());
    const created = await app.bus.dispatch(app.bus.command('1', 'change.create', USER, { title: 'X', type: 'feature', requirement: requirement(), origin: { kind: 'user', entryPoint: 'project', actor: USER } }));
    const change = (created.data as { change: { id: string; revision: number; contentHash: string } }).change;
    const changeId: ChangeId = toChangeId(change.id);

    // Fixture: an abandoned saga attempt left `epicLink = pending` under a commandId nobody is retrying.
    // Planted directly through the coordinator's own (public) ChangeStore — same technique as
    // change-epic-coordinator.test.ts's crash-injection tests — to force this specific interleaving.
    const stuck = app.changeEpics.changeStore.update(changeId, { expectedRevision: change.revision, expectedContentHash: change.contentHash }, (current) => {
      const { contentHash: _ignored, ...rest } = current;
      const next: ProjectChangeDraft = {
        ...rest,
        epicLink: {
          state: 'pending',
          commandId: 'abandoned-command',
          epicId: epicIdFromChangeId(changeId),
          changeRevision: current.revision,
          changeContentHash: current.contentHash,
          contextRevisionId: generateContextRevisionId(),
          contextRootHash: 'a'.repeat(64),
          startedAt: NOW,
        },
        updatedAt: NOW,
        revision: current.revision + 1,
      };
      return { ...next, contentHash: computeChangeContentHash(next) };
    });

    const blocked = await app.bus.dispatch(app.bus.command('2', 'change.epic.start', USER, epicStartPayload(change.id, { expectedRevision: stuck.revision, expectedContentHash: stuck.contentHash })));
    expect(blocked.status).toBe('error');
    expect(blocked.error?.code).toBe('epic.pending_recovery');
    expect(blocked.error?.recoveryActions.map((a) => a.kind).sort()).toEqual(['resume', 'rollback']);

    const rolledBack = await app.bus.dispatch(
      app.bus.command('3', 'change.epic.pending.rollback', USER, {
        changeId: change.id,
        guard: { expectedRevision: stuck.revision, expectedContentHash: stuck.contentHash },
        pendingCommandId: 'abandoned-command',
        reason: 'Abandoned attempt.',
      }),
    );
    expect(rolledBack.status).toBe('ok');
    const rolledBackChange = (rolledBack.data as { change: { revision: number; contentHash: string; epicLink?: unknown } }).change;
    expect(rolledBackChange.epicLink).toBeUndefined();

    const fresh = await app.bus.dispatch(app.bus.command('4', 'change.epic.start', USER, epicStartPayload(change.id, { expectedRevision: rolledBackChange.revision, expectedContentHash: rolledBackChange.contentHash })));
    expect(fresh.status).toBe('ok');
    expect((fresh.data as { alreadyLinked: boolean }).alreadyLinked).toBe(false);
  });
});
