import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { AidlcApplication } from '../src/application';
import type { ChangeRequirement } from '../src/contracts';
import { generateContextRevisionId } from '../src/contracts/ids';

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-application-change-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const USER = { kind: 'user' as const, id: 'cong' };
const AGENT = { kind: 'agent' as const, id: 'discover-scanner' };

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

describe('AidlcApplication change.* commands — end to end through the command bus', () => {
  it('walks create -> requirement.update -> scope.propose -> shelve -> reopen without touching the extension (M2 exit criteria)', async () => {
    const app = new AidlcApplication(newRoot());

    const created = await app.bus.dispatch(
      app.bus.command('1', 'change.create', USER, {
        title: 'Add guest mode',
        type: 'feature',
        requirement: requirement(),
        origin: { kind: 'user', entryPoint: 'project', actor: USER },
      }),
    );
    expect(created.status).toBe('ok');
    const change = (created.data as { change: { id: string; revision: number; contentHash: string } }).change;

    const updated = await app.bus.dispatch(
      app.bus.command('2', 'change.requirement.update', USER, {
        changeId: change.id,
        guard: { expectedRevision: change.revision, expectedContentHash: change.contentHash },
        requirement: requirement({ problem: 'A refined problem statement.' }),
      }),
    );
    expect(updated.status).toBe('ok');
    const afterUpdate = (updated.data as { change: { id: string; revision: number; contentHash: string; requirement: ChangeRequirement } }).change;
    expect(afterUpdate.requirement.problem).toBe('A refined problem statement.');
    expect(afterUpdate.revision).toBe(change.revision + 1);

    const proposed = await app.bus.dispatch(
      app.bus.command('3', 'change.scope.propose', AGENT, {
        changeId: change.id,
        guard: { expectedRevision: afterUpdate.revision, expectedContentHash: afterUpdate.contentHash },
        analysis: {
          confidence: 'medium',
          contextRevisionId: generateContextRevisionId(),
          contextRootHash: 'a'.repeat(64),
          sourceSnapshotHash: 'b'.repeat(64),
        },
      }),
    );
    expect(proposed.status).toBe('ok');
    const afterPropose = (proposed.data as { change: { revision: number; contentHash: string; latestScopeAnalysisId: string } }).change;
    expect(afterPropose.latestScopeAnalysisId).toBeTruthy();

    const shelved = await app.bus.dispatch(
      app.bus.command('4', 'change.shelve', USER, {
        changeId: change.id,
        guard: { expectedRevision: afterPropose.revision, expectedContentHash: afterPropose.contentHash },
        reason: 'Not now.',
      }),
    );
    expect(shelved.status).toBe('ok');
    const afterShelve = (shelved.data as { change: { disposition: string; revision: number; contentHash: string } }).change;
    expect(afterShelve.disposition).toBe('shelved');

    const reopened = await app.bus.dispatch(
      app.bus.command('5', 'change.reopen', USER, {
        changeId: change.id,
        guard: { expectedRevision: afterShelve.revision, expectedContentHash: afterShelve.contentHash },
      }),
    );
    expect(reopened.status).toBe('ok');
    expect((reopened.data as { change: { disposition: string } }).change.disposition).toBe('active');
    expect(app.changes.require(change.id as never).requirement.problem).toBe('A refined problem statement.');
  });

  it('surfaces a stale guard as a structured change.revision_conflict error with recovery actions, through the bus', async () => {
    const app = new AidlcApplication(newRoot());
    const created = await app.bus.dispatch(
      app.bus.command('1', 'change.create', USER, { title: 'X', type: 'feature', requirement: requirement(), origin: { kind: 'user', entryPoint: 'project', actor: USER } }),
    );
    const change = (created.data as { change: { id: string; revision: number; contentHash: string } }).change;
    const staleGuard = { expectedRevision: 99, expectedContentHash: 'f'.repeat(64) };

    const result = await app.bus.dispatch(app.bus.command('2', 'change.requirement.update', USER, { changeId: change.id, guard: staleGuard, requirement: requirement() }));
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('change.revision_conflict');
    expect(result.error?.metadata).toMatchObject({ expectedRevision: 99, actualRevision: 0 });
    expect(result.error?.recoveryActions.map((a) => a.kind)).toEqual(['reload', 'rebase']);
  });

  it('surfaces a human-required violation as a structured error, through the bus', async () => {
    const app = new AidlcApplication(newRoot());
    const created = await app.bus.dispatch(
      app.bus.command('1', 'change.create', USER, { title: 'X', type: 'feature', requirement: requirement(), origin: { kind: 'user', entryPoint: 'project', actor: USER } }),
    );
    const change = (created.data as { change: { id: string; revision: number; contentHash: string } }).change;
    const result = await app.bus.dispatch(
      app.bus.command('2', 'change.requirement.update', AGENT, {
        changeId: change.id,
        guard: { expectedRevision: change.revision, expectedContentHash: change.contentHash },
        requirement: requirement(),
      }),
    );
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('change.human_required');
  });

  it('walks the Shape flow (explore -> update -> ready(blocked then ok) -> accept), through the bus', async () => {
    const app = new AidlcApplication(newRoot());
    const created = await app.bus.dispatch(
      app.bus.command('1', 'change.create', USER, { title: 'X', type: 'feature', requirement: requirement(), origin: { kind: 'user', entryPoint: 'project', actor: USER } }),
    );
    const change = (created.data as { change: { id: string; revision: number; contentHash: string } }).change;

    const explored = await app.bus.dispatch(app.bus.command('2', 'change.explore.start', USER, { changeId: change.id, guard: { expectedRevision: change.revision, expectedContentHash: change.contentHash } }));
    expect(explored.status).toBe('ok');
    const { change: c1, shape: s1 } = explored.data as { change: { revision: number; contentHash: string }; shape: { revision: number; contentHash: string } };

    const blockedReady = await app.bus.dispatch(
      app.bus.command('3', 'change.shape.ready', USER, {
        changeId: change.id,
        changeGuard: { expectedRevision: c1.revision, expectedContentHash: c1.contentHash },
        shapeGuard: { expectedRevision: s1.revision, expectedContentHash: s1.contentHash },
      }),
    );
    expect(blockedReady.status).toBe('blocked');
    expect((blockedReady.data as { blockers: string[] }).blockers.length).toBeGreaterThan(0);

    const updated = await app.bus.dispatch(
      app.bus.command('4', 'change.shape.update', USER, {
        changeId: change.id,
        changeGuard: { expectedRevision: c1.revision, expectedContentHash: c1.contentHash },
        shapeGuard: { expectedRevision: s1.revision, expectedContentHash: s1.contentHash },
        shapeDraft: {
          appetite: 'Two weeks',
          options: [{ id: 'opt-a', title: 'A', summary: 'Simple', tradeoffs: [] }],
          selectedOptionId: 'opt-a',
          rationale: 'Fastest safe path',
          noGos: ['No new dependency'],
        },
      }),
    );
    expect(updated.status).toBe('ok');
    const { change: c2, shape: s2 } = updated.data as { change: { revision: number; contentHash: string }; shape: { revision: number; contentHash: string } };

    const ready = await app.bus.dispatch(
      app.bus.command('5', 'change.shape.ready', USER, {
        changeId: change.id,
        changeGuard: { expectedRevision: c2.revision, expectedContentHash: c2.contentHash },
        shapeGuard: { expectedRevision: s2.revision, expectedContentHash: s2.contentHash },
      }),
    );
    expect(ready.status).toBe('ok');
    const { change: c3, shape: s3 } = ready.data as { change: { revision: number; contentHash: string }; shape: { revision: number; contentHash: string; status: string } };
    expect(s3.status).toBe('ready');

    const accepted = await app.bus.dispatch(
      app.bus.command('6', 'change.shape.accept', USER, {
        changeId: change.id,
        changeGuard: { expectedRevision: c3.revision, expectedContentHash: c3.contentHash },
        shapeGuard: { expectedRevision: s3.revision, expectedContentHash: s3.contentHash },
      }),
    );
    expect(accepted.status).toBe('ok');
    expect((accepted.data as { shape: { status: string } }).shape.status).toBe('accepted');
  });

  it('walks split then merge through the bus, preserving distinct requirements and provenance', async () => {
    const app = new AidlcApplication(newRoot());
    const created = await app.bus.dispatch(
      app.bus.command('1', 'change.create', USER, { title: 'X', type: 'feature', requirement: requirement(), origin: { kind: 'user', entryPoint: 'project', actor: USER } }),
    );
    const change = (created.data as { change: { id: string; revision: number; contentHash: string } }).change;

    const split = await app.bus.dispatch(
      app.bus.command('2', 'change.split', USER, {
        changeId: change.id,
        guard: { expectedRevision: change.revision, expectedContentHash: change.contentHash },
        reason: 'Two independent efforts.',
        children: [
          { title: 'Child A', type: 'feature', requirement: requirement({ desiredOutcome: 'A outcome' }) },
          { title: 'Child B', type: 'feature', requirement: requirement({ desiredOutcome: 'B outcome' }) },
        ],
      }),
    );
    expect(split.status).toBe('ok');
    const { source, children } = split.data as { source: { disposition: string }; children: Array<{ id: string; revision: number; contentHash: string }> };
    expect(source.disposition).toBe('superseded');
    expect(children).toHaveLength(2);

    const merged = await app.bus.dispatch(
      app.bus.command('3', 'change.merge', USER, {
        sourceIds: children.map((c) => c.id),
        sourceGuards: children.map((c) => ({ expectedRevision: c.revision, expectedContentHash: c.contentHash })),
        reason: 'Recombine after all.',
        target: { title: 'Reunified', type: 'feature', requirement: requirement({ desiredOutcome: 'Reunified outcome' }) },
      }),
    );
    expect(merged.status).toBe('ok');
    const { target, sources } = merged.data as { target: { relations: { mergedFrom: string[] } }; sources: Array<{ disposition: string }> };
    expect(target.relations.mergedFrom.sort()).toEqual(children.map((c) => c.id).sort());
    expect(sources.every((s) => s.disposition === 'superseded')).toBe(true);
  });
});
