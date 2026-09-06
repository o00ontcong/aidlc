import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ActorKind, ActorRef, ChangeId, ChangeRequirement } from '../src/contracts';
import { computeChangeContentHash, type ProjectChange, type ProjectChangeDraft } from '../src/contracts/change';
import { epicIdFromChangeId, generateChangeId, generateContextRevisionId } from '../src/contracts/ids';
import { computeSourceSnapshotHash, type SourceSnapshot, type SourceSnapshotDraft } from '../src/contracts/contextProposal';
import { AggregateConflictError, type VersionGuard } from '../src/storage/WorkspaceTransaction';
import { writeJsonFileAtomic } from '../src/storage/atomicJson';
import { ChangeService, type CreateChangeInput } from '../src/change/ChangeService';
import { ChangeStore } from '../src/change/ChangeStore';
import { isShapeFreshForChange } from '../src/change/buildProjectChangeReadModel';
import { ChangeEpicCoordinator, type StartEpicInput } from '../src/change/ChangeEpicCoordinator';
import { ChangeHumanRequiredError, ChangeInvalidStateError } from '../src/change/errors';
import { EpicService } from '../src/epic';
import { parseEpicStartSnapshot } from '../src/contracts/epicStartSnapshot';

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-change-epic-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const NOW = '2026-09-05T00:00:00.000Z';
const CLOCK = () => NOW;
const CONTEXT_REVISION_ID = generateContextRevisionId();
const CONTEXT_ROOT_HASH = 'a'.repeat(64);
const CONTEXT_SLICE_HASH = 'c'.repeat(64);

function actor(kind: ActorKind = 'user', id = 'tester'): ActorRef {
  return { kind, id };
}

let cmdSeq = 0;
function cmd(): string {
  cmdSeq += 1;
  return `cmd-${cmdSeq}`;
}

function baseRequirement(overrides: Partial<ChangeRequirement> = {}): ChangeRequirement {
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

function createInput(overrides: Partial<CreateChangeInput> = {}): CreateChangeInput {
  return {
    commandId: cmd(),
    actor: actor('user'),
    title: 'Add guest mode',
    type: 'feature',
    requirement: baseRequirement(),
    origin: { kind: 'user', entryPoint: 'project', actor: actor('user') },
    ...overrides,
  };
}

function guardOf(entity: { revision: number; contentHash: string }): VersionGuard {
  return { expectedRevision: entity.revision, expectedContentHash: entity.contentHash };
}

function sourceSnapshot(): SourceSnapshot {
  const draft: SourceSnapshotDraft = { schemaVersion: 1, mode: 'filesystem', root: 'workspace', capturedAt: NOW, files: [], warnings: [] };
  return { ...draft, sourceHash: computeSourceSnapshotHash(draft) };
}

function startEpicInput(changeId: ChangeId, guard: VersionGuard, overrides: Partial<StartEpicInput> = {}): StartEpicInput {
  return {
    commandId: cmd(),
    actor: actor('user'),
    changeId,
    guard,
    pipeline: { id: 'cofofo-feature', runMode: 'guided' },
    source: sourceSnapshot(),
    context: { baseRevisionId: CONTEXT_REVISION_ID, baseRootHash: CONTEXT_ROOT_HASH, contextSliceHash: CONTEXT_SLICE_HASH },
    ...overrides,
  };
}

function harness() {
  const root = newRoot();
  const changeStore = new ChangeStore(root);
  const changes = new ChangeService(root, { clock: CLOCK, store: changeStore });
  const coordinator = new ChangeEpicCoordinator(root, { clock: CLOCK, changeStore });
  return { root, changes, coordinator };
}

describe('ChangeShape has no independent id or requirement copy (§D13)', () => {
  it('a Shape carries changeId (not its own id) and no problem/desiredOutcome/acceptanceCriteria fields', () => {
    const { changes } = harness();
    const { change } = changes.create(createInput());
    const { shape } = changes.startExplore({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(change) });
    expect(shape.changeId).toBe(change.id);
    expect('id' in shape).toBe(false);
    expect('problem' in shape).toBe(false);
    expect('desiredOutcome' in shape).toBe(false);
    expect('acceptanceCriteria' in shape).toBe(false);
  });
});

describe('Shape freshness relative to its Change (§D10 fail-closed, whole-content hash as the slice)', () => {
  it('a Change edit makes an existing Shape stale, surfaced as a shape.stale badge', () => {
    const { changes } = harness();
    const { change } = changes.create(createInput());
    const { shape } = changes.startExplore({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(change) });
    const fresh = changes.readModel(change.id);
    expect(isShapeFreshForChange(fresh.change, shape)).toBe(true);
    expect(fresh.derived.badges).not.toContain('shape.stale');

    changes.updateRequirement({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(fresh.change), requirement: baseRequirement({ problem: 'A materially different problem.' }) });
    const afterEdit = changes.readModel(change.id);
    expect(isShapeFreshForChange(afterEdit.change, shape)).toBe(false);
    expect(afterEdit.derived.badges).toContain('shape.stale');
    // Staleness is advisory only — it must never fork the lifecycle bucket.
    expect(afterEdit.derived.state).toBe('understanding');
  });
});

describe('ChangeEpicCoordinator.startEpic — success and 1:1', () => {
  it('links exactly one Epic to the Change, pinning an immutable start snapshot', () => {
    const { changes, coordinator } = harness();
    const { change } = changes.create(createInput());
    const result = coordinator.startEpic(startEpicInput(change.id, guardOf(change)));

    expect(result.alreadyLinked).toBe(false);
    expect(result.change.epicLink).toMatchObject({ state: 'linked', epicId: result.epic.id });
    expect(result.epic.id).toBe(`EPIC-${change.id.slice('CHG-'.length)}`);
    expect(result.startSnapshot.change.id).toBe(change.id);
    expect(result.startSnapshot.change.requirement).toEqual(change.requirement);

    // Persisted correctly: re-reading through fresh instances agrees.
    const reread = new ChangeStore(coordinator.workspaceRoot).require(change.id);
    expect(reread.epicLink).toEqual(result.change.epicLink);
    const rereadEpic = new EpicService(coordinator.workspaceRoot).require(result.epic.id);
    expect(rereadEpic.id).toBe(result.epic.id);
  });

  it('rejects a non-user actor', () => {
    const { changes, coordinator } = harness();
    const { change } = changes.create(createInput());
    expect(() => coordinator.startEpic(startEpicInput(change.id, guardOf(change), { actor: actor('agent') }))).toThrow(ChangeHumanRequiredError);
  });

  it('rejects starting from a non-active disposition', () => {
    const { changes, coordinator } = harness();
    const { change } = changes.create(createInput());
    const { change: shelved } = changes.shelve({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(change) });
    expect(() => coordinator.startEpic(startEpicInput(change.id, guardOf(shelved)))).toThrow(ChangeInvalidStateError);
  });
});

describe('ChangeEpicCoordinator — Start Epic a second time navigates, never duplicates (§D2)', () => {
  it('a second startEpic call (fresh commandId) returns the same Epic with alreadyLinked=true and mutates nothing', () => {
    const { changes, coordinator } = harness();
    const { change } = changes.create(createInput());
    const first = coordinator.startEpic(startEpicInput(change.id, guardOf(change)));

    const second = coordinator.startEpic(startEpicInput(change.id, guardOf(first.change)));
    expect(second.alreadyLinked).toBe(true);
    expect(second.epic.id).toBe(first.epic.id);
    expect(second.change).toEqual(first.change);
    expect(new EpicService(coordinator.workspaceRoot).list()).toHaveLength(1);
  });
});

describe('ChangeEpicCoordinator — crash/failure injection at each saga step never creates a second Epic', () => {
  function plantPending(store: ChangeStore, change: ProjectChange, commandId: string): ProjectChange {
    return store.update(change.id, guardOf(change), (current) => {
      const { contentHash: _ignored, ...rest } = current;
      const next: ProjectChangeDraft = {
        ...rest,
        epicLink: { state: 'pending', commandId, epicId: epicIdFromChangeId(change.id), changeRevision: current.revision, changeContentHash: current.contentHash, contextRevisionId: CONTEXT_REVISION_ID, contextRootHash: CONTEXT_ROOT_HASH, startedAt: NOW },
        updatedAt: NOW,
        revision: current.revision + 1,
      };
      return { ...next, contentHash: computeChangeContentHash(next) };
    });
  }

  it('resumes correctly when the crash happened right after the pending link was written (nothing else exists yet)', () => {
    const { changes, coordinator } = harness();
    const { change } = changes.create(createInput());
    const commandId = cmd();
    const pending = plantPending(coordinator.changeStore, change, commandId);

    const result = coordinator.startEpic(startEpicInput(change.id, guardOf(pending), { commandId }));
    expect(result.alreadyLinked).toBe(false);
    expect(result.change.epicLink?.state).toBe('linked');
    expect(coordinator.epics.list()).toHaveLength(1);

    // Retrying again (same commandId) must not create a second Epic or a second start.json write.
    const again = coordinator.startEpic(startEpicInput(change.id, guardOf(result.change), { commandId }));
    expect(again.alreadyLinked).toBe(true);
    expect(coordinator.epics.list()).toHaveLength(1);
  });

  it('resumes correctly when the crash happened after the Epic was created but before start.json was written', () => {
    const { changes, coordinator } = harness();
    const { change } = changes.create(createInput());
    const commandId = cmd();
    const pending = plantPending(coordinator.changeStore, change, commandId);
    const epicId = pending.epicLink && pending.epicLink.state === 'pending' ? pending.epicLink.epicId : never();
    coordinator.epics.start({ id: epicId, title: change.title, type: 'feature' });
    expect(coordinator.epics.list()).toHaveLength(1);

    const result = coordinator.startEpic(startEpicInput(change.id, guardOf(pending), { commandId }));
    expect(result.change.epicLink?.state).toBe('linked');
    expect(coordinator.epics.list()).toHaveLength(1);
    expect(coordinator.readStartSnapshot(epicId)?.change.id).toBe(change.id);
  });

  it('resumes correctly when the crash happened after start.json was written but before the final link', () => {
    const { changes, coordinator } = harness();
    const { change } = changes.create(createInput());
    const commandId = cmd();
    const pending = plantPending(coordinator.changeStore, change, commandId);
    const first = coordinator.startEpic(startEpicInput(change.id, guardOf(pending), { commandId }));
    const snapshotBefore = coordinator.readStartSnapshot(first.epic.id);

    // Re-plant pending (simulating "the final link write itself never landed") without touching the Epic/start.json already created.
    const rePending = plantPending(coordinator.changeStore, first.change, commandId);
    const resumed = coordinator.resumePending({ commandId, actor: actor('user'), changeId: change.id, guard: guardOf(rePending) });
    expect(resumed.change.epicLink?.state).toBe('linked');
    expect(coordinator.epics.list()).toHaveLength(1);
    expect(coordinator.readStartSnapshot(first.epic.id)).toEqual(snapshotBefore);
  });
});

describe('ChangeEpicCoordinator — pending saga resume/rollback (§9.2, §D16)', () => {
  it('resumePending rejects a commandId that does not match the pending saga, with resume/rollback recovery actions', () => {
    const { changes, coordinator } = harness();
    const { change } = changes.create(createInput());
    const commandId = cmd();
    const pending = coordinator.changeStore.update(change.id, guardOf(change), (current) => {
      const { contentHash: _ignored, ...rest } = current;
      const next: ProjectChangeDraft = { ...rest, epicLink: { state: 'pending', commandId, epicId: epicIdFromChangeId(change.id), changeRevision: current.revision, changeContentHash: current.contentHash, contextRevisionId: CONTEXT_REVISION_ID, contextRootHash: CONTEXT_ROOT_HASH, startedAt: NOW }, updatedAt: NOW, revision: current.revision + 1 };
      return { ...next, contentHash: computeChangeContentHash(next) };
    });

    try {
      coordinator.resumePending({ commandId: 'a-different-command', actor: actor('user'), changeId: change.id, guard: guardOf(pending) });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateConflictError);
      const conflict = error as AggregateConflictError;
      expect(conflict.code).toBe('epic.pending_recovery');
      expect(conflict.recoveryActions.map((a) => a.kind).sort()).toEqual(['resume', 'rollback']);
    }
  });

  it('resumePending refuses to fabricate a start snapshot when none was ever recorded, directing the caller back to change.epic.start', () => {
    const { changes, coordinator } = harness();
    const { change } = changes.create(createInput());
    const commandId = cmd();
    const pending = coordinator.changeStore.update(change.id, guardOf(change), (current) => {
      const { contentHash: _ignored, ...rest } = current;
      const next: ProjectChangeDraft = { ...rest, epicLink: { state: 'pending', commandId, epicId: epicIdFromChangeId(change.id), changeRevision: current.revision, changeContentHash: current.contentHash, contextRevisionId: CONTEXT_REVISION_ID, contextRootHash: CONTEXT_ROOT_HASH, startedAt: NOW }, updatedAt: NOW, revision: current.revision + 1 };
      return { ...next, contentHash: computeChangeContentHash(next) };
    });
    expect(() => coordinator.resumePending({ commandId, actor: actor('user'), changeId: change.id, guard: guardOf(pending) })).toThrow(ChangeInvalidStateError);
  });

  it('rollbackPending clears the pending link without deleting anything already created, and a fresh Start Epic afterwards succeeds', () => {
    const { changes, coordinator } = harness();
    const { change } = changes.create(createInput());
    const commandId = cmd();
    const pending = coordinator.changeStore.update(change.id, guardOf(change), (current) => {
      const { contentHash: _ignored, ...rest } = current;
      const next: ProjectChangeDraft = { ...rest, epicLink: { state: 'pending', commandId, epicId: epicIdFromChangeId(change.id), changeRevision: current.revision, changeContentHash: current.contentHash, contextRevisionId: CONTEXT_REVISION_ID, contextRootHash: CONTEXT_ROOT_HASH, startedAt: NOW }, updatedAt: NOW, revision: current.revision + 1 };
      return { ...next, contentHash: computeChangeContentHash(next) };
    });

    const rolledBack = coordinator.rollbackPending({ commandId, actor: actor('user'), changeId: change.id, guard: guardOf(pending), reason: 'Abandoned.' });
    expect(rolledBack.change.epicLink).toBeUndefined();
    expect(rolledBack.change.disposition).toBe('active');

    const started = coordinator.startEpic(startEpicInput(change.id, guardOf(rolledBack.change)));
    expect(started.alreadyLinked).toBe(false);
    expect(started.change.epicLink?.state).toBe('linked');
  });

  it('rollbackPending requires a non-blank reason and a human actor', () => {
    const { changes, coordinator } = harness();
    const { change } = changes.create(createInput());
    const commandId = cmd();
    const pending = coordinator.changeStore.update(change.id, guardOf(change), (current) => {
      const { contentHash: _ignored, ...rest } = current;
      const next: ProjectChangeDraft = { ...rest, epicLink: { state: 'pending', commandId, epicId: epicIdFromChangeId(change.id), changeRevision: current.revision, changeContentHash: current.contentHash, contextRevisionId: CONTEXT_REVISION_ID, contextRootHash: CONTEXT_ROOT_HASH, startedAt: NOW }, updatedAt: NOW, revision: current.revision + 1 };
      return { ...next, contentHash: computeChangeContentHash(next) };
    });
    expect(() => coordinator.rollbackPending({ commandId, actor: actor('user'), changeId: change.id, guard: guardOf(pending), reason: '' })).toThrow(ChangeInvalidStateError);
    expect(() => coordinator.rollbackPending({ commandId, actor: actor('agent'), changeId: change.id, guard: guardOf(pending), reason: 'x' })).toThrow(ChangeHumanRequiredError);
  });
});

describe('ChangeEpicCoordinator — provenance conflict when the target Epic id is already claimed', () => {
  it('throws epic.provenance_conflict when start.json at the deterministic Epic id belongs to a different Change/command', () => {
    const { changes, coordinator } = harness();
    const { change } = changes.create(createInput());
    const epicId = epicIdFromChangeId(change.id);
    // Someone else's saga got here first, for a *different* Change.
    coordinator.epics.start({ id: epicId, title: 'Unrelated', type: 'feature' });
    writeJsonFileAtomic(coordinator.startSnapshotFile(epicId), parseEpicStartSnapshot({
      schemaVersion: 1,
      commandId: 'someone-elses-command',
      epicId,
      change: { id: generateChangeId(), revision: 0, contentHash: 'f'.repeat(64), title: 'Unrelated', type: 'feature', requirement: baseRequirement(), externalRefs: [] },
      context: { baseRevisionId: CONTEXT_REVISION_ID, baseRootHash: CONTEXT_ROOT_HASH, entityObjectHashes: {}, contextSliceHash: CONTEXT_SLICE_HASH },
      pipeline: { id: 'x', runMode: 'guided', extraProjects: [] },
      source: sourceSnapshot(),
      createdAt: NOW,
      createdBy: actor('user'),
    }));

    try {
      coordinator.startEpic(startEpicInput(change.id, guardOf(change)));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateConflictError);
      expect((error as AggregateConflictError).code).toBe('epic.provenance_conflict');
    }
  });
});

describe('ChangeEpicCoordinator — the start snapshot never changes after the Change is edited later', () => {
  it('a requirement.update after Start Epic does not retroactively change the pinned snapshot', () => {
    const { changes, coordinator } = harness();
    const { change } = changes.create(createInput());
    const started = coordinator.startEpic(startEpicInput(change.id, guardOf(change)));
    const pinnedRequirement = started.startSnapshot.change.requirement;

    changes.updateRequirement({
      commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(started.change),
      requirement: baseRequirement({ problem: 'Completely different problem after delivery started.' }),
    });

    const snapshotAfter = coordinator.readStartSnapshot(started.epic.id);
    expect(snapshotAfter?.change.requirement).toEqual(pinnedRequirement);
    expect(snapshotAfter).toEqual(started.startSnapshot);
  });
});

function never(): never {
  throw new Error('unreachable in test fixture');
}
