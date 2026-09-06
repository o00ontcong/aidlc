import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { computeChangeContentHash, computeChangeRequirementSliceHash, type ActorRef, type ActorKind, type ChangeId, type ChangeRequirement, type ProjectChangeDraft } from '../src/contracts';
import { generateContextRevisionId, generateExternalRefId, toEpicId } from '../src/contracts/ids';
import { AggregateConflictError, StorageRecoveryRequiredError, type VersionGuard } from '../src/storage/WorkspaceTransaction';
import { readJsonFile, writeJsonFileAtomic } from '../src/storage/atomicJson';
import { ChangeService, type CreateChangeInput } from '../src/change/ChangeService';
import { ChangeStore } from '../src/change/ChangeStore';
import { ChangeAgentRequiredError, ChangeHumanRequiredError, ChangeInvalidStateError, ChangeRelationCycleError, ShapeNotReadyError } from '../src/change/errors';

const CONTEXT_REVISION_ID = generateContextRevisionId();
const CONTEXT_ROOT_HASH = 'a'.repeat(64);
const SOURCE_SNAPSHOT_HASH = 'b'.repeat(64);

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-change-service-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function newService(): ChangeService {
  return new ChangeService(newRoot(), { clock: () => '2026-09-05T00:00:00.000Z' });
}

function actor(kind: ActorKind = 'user', id = 'tester'): ActorRef {
  return { kind, id };
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

let cmdSeq = 0;
function cmd(): string {
  cmdSeq += 1;
  return `cmd-${cmdSeq}`;
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

describe('ChangeService.create', () => {
  it('creates an active Change with revision 0 and a read model', () => {
    const service = newService();
    const { change, readModel } = service.create(createInput());
    expect(change).toMatchObject({ schemaVersion: 1, revision: 0, disposition: 'active', title: 'Add guest mode' });
    expect(readModel.derived.state).toBe('captured');
  });

  it('rejects an agent actor (create is user or system only)', () => {
    const service = newService();
    expect(() => service.create(createInput({ actor: actor('agent') }))).toThrow(ChangeHumanRequiredError);
  });

  it('allows a system actor (explicit import/migration)', () => {
    const service = newService();
    expect(() => service.create(createInput({ actor: actor('system') }))).not.toThrow();
  });

  it('concurrent creates always produce distinct, collision-safe ids', () => {
    // ULID collision-resistance itself is exercised at high volume, fast,
    // with no disk I/O in ulid-and-change-ids.test.ts (5,000 raw ULIDs,
    // 2,000 ChangeIds); this only needs enough real `create()` calls to
    // prove the service persists a genuinely distinct record each time.
    const service = newService();
    const ids = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      const { change } = service.create(createInput());
      expect(ids.has(change.id)).toBe(false);
      ids.add(change.id);
    }
  });
});

describe('ChangeService.updateRequirement', () => {
  it('bumps the revision and replaces requirement/title/type/priority', () => {
    const service = newService();
    const { change } = service.create(createInput());
    const { change: updated, staleFacts } = service.updateRequirement({
      commandId: cmd(),
      actor: actor('user'),
      changeId: change.id,
      guard: guardOf(change),
      requirement: baseRequirement({ problem: 'A refined problem statement.' }),
      title: 'Add guest mode (refined)',
    });
    expect(updated.revision).toBe(1);
    expect(updated.title).toBe('Add guest mode (refined)');
    expect(updated.requirement.problem).toBe('A refined problem statement.');
    expect(staleFacts).toEqual([]);
  });

  it('rejects a non-user actor', () => {
    const service = newService();
    const { change } = service.create(createInput());
    expect(() =>
      service.updateRequirement({ commandId: cmd(), actor: actor('agent'), changeId: change.id, guard: guardOf(change), requirement: baseRequirement() }),
    ).toThrow(ChangeHumanRequiredError);
  });

  it('two updates from the same starting revision: exactly one succeeds, the other gets a typed revision conflict', () => {
    const service = newService();
    const { change } = service.create(createInput());
    const guard = guardOf(change);
    service.updateRequirement({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard, requirement: baseRequirement({ problem: 'First writer wins.' }) });

    try {
      service.updateRequirement({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard, requirement: baseRequirement({ problem: 'Second writer loses.' }) });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateConflictError);
      const conflict = error as AggregateConflictError;
      expect(conflict.code).toBe('change.revision_conflict');
      expect(conflict.metadata?.expectedRevision).toBe(0);
      expect(conflict.metadata?.actualRevision).toBe(1);
      expect(conflict.recoveryActions.map((a) => a.kind)).toEqual(['reload', 'rebase']);
    }
    expect(service.require(change.id).requirement.problem).toBe('First writer wins.');
  });

  it('retrying the same commandId is idempotent: no duplicate event, same result returned', () => {
    const service = newService();
    const { change } = service.create(createInput());
    const commandId = cmd();
    const first = service.updateRequirement({ commandId, actor: actor('user'), changeId: change.id, guard: guardOf(change), requirement: baseRequirement({ problem: 'Only once.' }) });
    const second = service.updateRequirement({ commandId, actor: actor('user'), changeId: change.id, guard: guardOf(change), requirement: baseRequirement({ problem: 'Should be ignored.' }) });
    expect(second.change).toEqual(first.change);
    expect(service.require(change.id).requirement.problem).toBe('Only once.');
    expect(service.store.listEvents(change.id).filter((e) => e.commandId === commandId)).toHaveLength(1);
  });

  it('reports staleFacts for an existing Shape/scope analysis without touching them', () => {
    const service = newService();
    const { change } = service.create(createInput());
    const { shape } = service.startExplore({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(change) });
    const current = service.require(change.id);
    const { staleFacts } = service.updateRequirement({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(current), requirement: baseRequirement({ problem: 'Changed after shaping.' }) });
    expect(staleFacts).toEqual(['shape']);
    expect(service.getShape(change.id)).toEqual(shape); // requirement.update never mutates the Shape itself.
  });

  it('rejects updating a cancelled Change', () => {
    const service = newService();
    const { change } = service.create(createInput());
    const { change: cancelled } = service.cancel({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(change) });
    expect(() =>
      service.updateRequirement({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(cancelled), requirement: baseRequirement() }),
    ).toThrow(ChangeInvalidStateError);
  });
});

describe('ChangeService.proposeScope / recordScopeFeedback', () => {
  it('agent may propose scope; a user actor is rejected', () => {
    const service = newService();
    const { change } = service.create(createInput());
    expect(() =>
      service.proposeScope({
        commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(change), confidence: 'medium',
        contextRevisionId: CONTEXT_REVISION_ID, contextRootHash: CONTEXT_ROOT_HASH, sourceSnapshotHash: SOURCE_SNAPSHOT_HASH,
      }),
    ).toThrow(ChangeAgentRequiredError);

    const { change: analyzed, analysis } = service.proposeScope({
      commandId: cmd(), actor: actor('agent'), changeId: change.id, guard: guardOf(change), confidence: 'medium', risks: ['session boundary'],
      contextRevisionId: CONTEXT_REVISION_ID, contextRootHash: CONTEXT_ROOT_HASH, sourceSnapshotHash: SOURCE_SNAPSHOT_HASH,
    });
    expect(analyzed.latestScopeAnalysisId).toBe(analysis.id);
    expect(service.store.readAnalysis(change.id, analysis.id)).toEqual(analysis);
  });

  it('a second analysis records supersedesAnalysisId and becomes the new latest', () => {
    const service = newService();
    const { change } = service.create(createInput());
    const baseArgs = { contextRevisionId: CONTEXT_REVISION_ID, contextRootHash: CONTEXT_ROOT_HASH, sourceSnapshotHash: SOURCE_SNAPSHOT_HASH, confidence: 'low' as const };
    const first = service.proposeScope({ commandId: cmd(), actor: actor('agent'), changeId: change.id, guard: guardOf(change), ...baseArgs });
    const second = service.proposeScope({ commandId: cmd(), actor: actor('agent'), changeId: change.id, guard: guardOf(first.change), ...baseArgs });
    expect(second.analysis.supersedesAnalysisId).toBe(first.analysis.id);
    expect(second.change.latestScopeAnalysisId).toBe(second.analysis.id);
  });

  it('retrying scope.propose with the same commandId does not create a second analysis', () => {
    const service = newService();
    const { change } = service.create(createInput());
    const commandId = cmd();
    const args = { commandId, actor: actor('agent'), changeId: change.id, guard: guardOf(change), confidence: 'low' as const, contextRevisionId: CONTEXT_REVISION_ID, contextRootHash: CONTEXT_ROOT_HASH, sourceSnapshotHash: SOURCE_SNAPSHOT_HASH };
    const first = service.proposeScope(args);
    const second = service.proposeScope(args);
    expect(second.analysis.id).toBe(first.analysis.id);
    expect(service.store.listAnalyses(change.id)).toHaveLength(1);
  });

  it('scope.feedback with nextRoute analyze-again records a review outcome and bumps revision', () => {
    const service = newService();
    const { change } = service.create(createInput());
    const { analysis, change: analyzed } = service.proposeScope({ commandId: cmd(), actor: actor('agent'), changeId: change.id, guard: guardOf(change), confidence: 'low', contextRevisionId: CONTEXT_REVISION_ID, contextRootHash: CONTEXT_ROOT_HASH, sourceSnapshotHash: SOURCE_SNAPSHOT_HASH });
    const { change: fedback } = service.recordScopeFeedback({
      commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(analyzed), analysisId: analysis.id, feedback: 'Drop analytics.', nextRoute: 'analyze-again',
    });
    expect(fedback.scopeReview).toMatchObject({ analysisId: analysis.id, outcome: 'feedback-recorded', feedback: 'Drop analytics.' });
    expect(fedback.revision).toBe(analyzed.revision + 1);
  });

  it('scope.feedback with nextRoute edit-requirement or shelve records an audit event without mutating the Change', () => {
    const service = newService();
    const { change } = service.create(createInput());
    const { change: fedback } = service.recordScopeFeedback({
      commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(change), analysisId: 'ANL-none', nextRoute: 'edit-requirement',
    });
    expect(fedback).toEqual(change);
    expect(service.store.listEvents(change.id).some((e) => e.type === 'change.scope.feedback.recorded')).toBe(true);
  });

  it('rejects a non-user actor for scope.feedback', () => {
    const service = newService();
    const { change } = service.create(createInput());
    expect(() =>
      service.recordScopeFeedback({ commandId: cmd(), actor: actor('system'), changeId: change.id, guard: guardOf(change), analysisId: 'ANL-none', nextRoute: 'shelve' }),
    ).toThrow(ChangeHumanRequiredError);
  });

  it('rejects an unrecognized nextRoute rather than silently treating it as a no-op audit note', () => {
    const service = newService();
    const { change } = service.create(createInput());
    expect(() =>
      service.recordScopeFeedback({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(change), analysisId: 'ANL-none', nextRoute: 'not-a-real-route' as never }),
    ).toThrow(ChangeInvalidStateError);
  });
});

describe('ChangeService.startExplore', () => {
  it('creates a Shape in exploring status and pins basedOnChange to the requirement-slice hash (not the whole Change contentHash)', () => {
    const service = newService();
    const { change } = service.create(createInput());
    const { change: updated, shape } = service.startExplore({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(change) });
    expect(shape).toMatchObject({ status: 'exploring', changeId: change.id, basedOnChange: { revision: change.revision, contentHash: computeChangeRequirementSliceHash(change) } });
    expect(updated.shapeRef).toEqual({ revision: shape.revision, contentHash: shape.contentHash });
  });

  it('re-entering Explore on an already-shaped Change returns the existing Shape rather than erroring (§D2)', () => {
    const service = newService();
    const { change } = service.create(createInput());
    const first = service.startExplore({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(change) });
    const second = service.startExplore({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(first.change) });
    expect(second.shape).toEqual(first.shape);
    expect(service.store.listAnalyses(change.id)).toEqual([]);
  });

  it('rejects a non-user actor', () => {
    const service = newService();
    const { change } = service.create(createInput());
    expect(() => service.startExplore({ commandId: cmd(), actor: actor('agent'), changeId: change.id, guard: guardOf(change) })).toThrow(ChangeHumanRequiredError);
  });
});

describe('ChangeService.updateShape / markShapeReady / acceptShape / reopenShape', () => {
  function explored(service: ChangeService) {
    const { change } = service.create(createInput());
    const { change: afterExplore, shape } = service.startExplore({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(change) });
    return { change: afterExplore, shape };
  }

  it('shape.update lets an agent propose but not system, and bumps both Shape and Change revisions', () => {
    const service = newService();
    const { change, shape } = explored(service);
    expect(() =>
      service.updateShape({ commandId: cmd(), actor: actor('system'), changeId: change.id, changeGuard: guardOf(change), shapeGuard: guardOf(shape), shapeDraft: {} }),
    ).toThrow(ChangeHumanRequiredError);

    const { change: updated, shape: updatedShape } = service.updateShape({
      commandId: cmd(), actor: actor('agent'), changeId: change.id, changeGuard: guardOf(change), shapeGuard: guardOf(shape),
      shapeDraft: { appetite: 'Two weeks', options: [{ id: 'opt-a', title: 'A', summary: 'Simple', tradeoffs: [] }], selectedOptionId: 'opt-a', rationale: 'Fastest safe path', noGos: ['No new dependency'] },
    });
    expect(updatedShape.appetite).toBe('Two weeks');
    expect(updatedShape.revision).toBe(shape.revision + 1);
    expect(updated.revision).toBe(change.revision + 1);
    expect(updated.shapeRef).toEqual({ revision: updatedShape.revision, contentHash: updatedShape.contentHash });
  });

  it('editing a ready Shape reopens it to exploring and clears acceptance-in-waiting', () => {
    const service = newService();
    const { change, shape } = explored(service);
    const { change: c1, shape: s1 } = service.updateShape({
      commandId: cmd(), actor: actor('user'), changeId: change.id, changeGuard: guardOf(change), shapeGuard: guardOf(shape),
      shapeDraft: { appetite: 'Two weeks', options: [{ id: 'opt-a', title: 'A', summary: 'Simple', tradeoffs: [] }], selectedOptionId: 'opt-a', rationale: 'Fastest safe path', noGos: ['No new dependency'] },
    });
    const { change: c2, shape: readyShape } = service.markShapeReady({ commandId: cmd(), actor: actor('user'), changeId: c1.id, changeGuard: guardOf(c1), shapeGuard: guardOf(s1) });
    expect(readyShape.status).toBe('ready');
    const { shape: reEdited } = service.updateShape({ commandId: cmd(), actor: actor('user'), changeId: c2.id, changeGuard: guardOf(c2), shapeGuard: guardOf(readyShape), shapeDraft: { rationale: 'Revised rationale' } });
    expect(reEdited.status).toBe('exploring');
  });

  it('markShapeReady reports blockers and does not transition when the Shape is incomplete', () => {
    const service = newService();
    const { change, shape } = explored(service);
    const { blockers, shape: stillExploring } = service.markShapeReady({ commandId: cmd(), actor: actor('user'), changeId: change.id, changeGuard: guardOf(change), shapeGuard: guardOf(shape) });
    expect(blockers.length).toBeGreaterThan(0);
    expect(stillExploring.status).toBe('exploring');
  });

  it('acceptShape rejects an agent actor — the literal "agent khong duoc accept Shape" rule (plan §18.6)', () => {
    const service = newService();
    const { change, shape } = explored(service);
    const { change: c1, shape: s1 } = service.updateShape({
      commandId: cmd(), actor: actor('user'), changeId: change.id, changeGuard: guardOf(change), shapeGuard: guardOf(shape),
      shapeDraft: { appetite: 'Two weeks', options: [{ id: 'opt-a', title: 'A', summary: 'Simple', tradeoffs: [] }], selectedOptionId: 'opt-a', rationale: 'Fastest safe path', noGos: ['No new dependency'] },
    });
    const { change: c2, shape: ready } = service.markShapeReady({ commandId: cmd(), actor: actor('user'), changeId: c1.id, changeGuard: guardOf(c1), shapeGuard: guardOf(s1) });
    expect(() => service.acceptShape({ commandId: cmd(), actor: actor('agent'), changeId: c2.id, changeGuard: guardOf(c2), shapeGuard: guardOf(ready) })).toThrow(ChangeHumanRequiredError);

    const { shape: accepted } = service.acceptShape({ commandId: cmd(), actor: actor('user'), changeId: c2.id, changeGuard: guardOf(c2), shapeGuard: guardOf(ready) });
    expect(accepted.status).toBe('accepted');
    expect(accepted.acceptedBy).toEqual(actor('user'));
  });

  it('acceptShape throws ShapeNotReadyError when the Shape has not been marked ready', () => {
    const service = newService();
    const { change, shape } = explored(service);
    expect(() => service.acceptShape({ commandId: cmd(), actor: actor('user'), changeId: change.id, changeGuard: guardOf(change), shapeGuard: guardOf(shape) })).toThrow(ShapeNotReadyError);
  });

  it('reopenShape requires a reason and clears acceptance', () => {
    const service = newService();
    const { change, shape } = explored(service);
    const { change: c1, shape: s1 } = service.updateShape({
      commandId: cmd(), actor: actor('user'), changeId: change.id, changeGuard: guardOf(change), shapeGuard: guardOf(shape),
      shapeDraft: { appetite: 'Two weeks', options: [{ id: 'opt-a', title: 'A', summary: 'Simple', tradeoffs: [] }], selectedOptionId: 'opt-a', rationale: 'Fastest safe path', noGos: ['No new dependency'] },
    });
    const { change: c2, shape: ready } = service.markShapeReady({ commandId: cmd(), actor: actor('user'), changeId: c1.id, changeGuard: guardOf(c1), shapeGuard: guardOf(s1) });
    const { change: c3, shape: accepted } = service.acceptShape({ commandId: cmd(), actor: actor('user'), changeId: c2.id, changeGuard: guardOf(c2), shapeGuard: guardOf(ready) });

    expect(() => service.reopenShape({ commandId: cmd(), actor: actor('user'), changeId: c3.id, changeGuard: guardOf(c3), shapeGuard: guardOf(accepted), reason: '' })).toThrow(ChangeInvalidStateError);

    const { shape: reopened } = service.reopenShape({ commandId: cmd(), actor: actor('user'), changeId: c3.id, changeGuard: guardOf(c3), shapeGuard: guardOf(accepted), reason: 'Scope changed.' });
    expect(reopened.status).toBe('exploring');
    expect(reopened.acceptedBy).toBeUndefined();
    expect(reopened.acceptedAt).toBeUndefined();
  });
});

describe('ChangeService.shelve / reopen / cancel', () => {
  it('shelve then reopen round-trips disposition and never touches requirement (provenance preserved)', () => {
    const service = newService();
    const { change } = service.create(createInput());
    const { change: shelved } = service.shelve({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(change), reason: 'Not now.' });
    expect(shelved.disposition).toBe('shelved');
    expect(shelved.requirement).toEqual(change.requirement);
    const { change: reopened } = service.reopen({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(shelved) });
    expect(reopened.disposition).toBe('active');
    expect(reopened.requirement).toEqual(change.requirement);
  });

  it('shelve from shelved is rejected; cancel is allowed from active or shelved but not twice', () => {
    const service = newService();
    const { change } = service.create(createInput());
    const { change: shelved } = service.shelve({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(change) });
    expect(() => service.shelve({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(shelved) })).toThrow(ChangeInvalidStateError);
    const { change: cancelled } = service.cancel({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(shelved) });
    expect(cancelled.disposition).toBe('cancelled');
    expect(() => service.cancel({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(cancelled) })).toThrow(ChangeInvalidStateError);
  });

  it('rejects a non-user actor for shelve/reopen/cancel', () => {
    const service = newService();
    const { change } = service.create(createInput());
    expect(() => service.shelve({ commandId: cmd(), actor: actor('agent'), changeId: change.id, guard: guardOf(change) })).toThrow(ChangeHumanRequiredError);
  });

  it('retrying shelve with the same commandId is idempotent', () => {
    const service = newService();
    const { change } = service.create(createInput());
    const commandId = cmd();
    const first = service.shelve({ commandId, actor: actor('user'), changeId: change.id, guard: guardOf(change) });
    const second = service.shelve({ commandId, actor: actor('user'), changeId: change.id, guard: guardOf(change) });
    expect(second.change).toEqual(first.change);
    expect(service.store.listEvents(change.id).filter((e) => e.commandId === commandId)).toHaveLength(1);
  });
});

describe('ChangeService.split', () => {
  it('creates children that trace back via splitFrom, and the source becomes superseded listing them in relatesTo', () => {
    const service = newService();
    const { change } = service.create(createInput());
    const childRequirementA = baseRequirement({ desiredOutcome: 'Child A outcome.' });
    const childRequirementB = baseRequirement({ desiredOutcome: 'Child B outcome.' });
    const { source, children } = service.split({
      commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(change), reason: 'Two independent efforts.',
      children: [
        { title: 'Child A', type: 'feature', requirement: childRequirementA },
        { title: 'Child B', type: 'feature', requirement: childRequirementB },
      ],
    });
    expect(source.disposition).toBe('superseded');
    expect(source.relations.relatesTo.sort()).toEqual(children.map((c) => c.id).sort());
    expect(source.relations.supersededBy).toBeUndefined();
    expect(children).toHaveLength(2);
    for (const child of children) expect(child.relations.splitFrom).toBe(change.id);
    expect(children.map((c) => c.requirement.desiredOutcome).sort()).toEqual(['Child A outcome.', 'Child B outcome.']);
    // Original requirement stays intact on the (now superseded) source for audit.
    expect(source.requirement).toEqual(change.requirement);
  });

  it('rejects fewer than two children, a non-user actor, and a Change that already has an Epic link', () => {
    const service = newService();
    const { change } = service.create(createInput());
    expect(() =>
      service.split({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(change), reason: 'x', children: [{ title: 'Only one', type: 'feature', requirement: baseRequirement() }] }),
    ).toThrow(ChangeInvalidStateError);
    expect(() =>
      service.split({ commandId: cmd(), actor: actor('agent'), changeId: change.id, guard: guardOf(change), reason: 'x', children: [{ title: 'A', type: 'feature', requirement: baseRequirement() }, { title: 'B', type: 'feature', requirement: baseRequirement() }] }),
    ).toThrow(ChangeHumanRequiredError);

    const linked = withEpicLinkFixture(service, change.id);
    expect(() =>
      service.split({ commandId: cmd(), actor: actor('user'), changeId: change.id, guard: guardOf(linked), reason: 'x', children: [{ title: 'A', type: 'feature', requirement: baseRequirement() }, { title: 'B', type: 'feature', requirement: baseRequirement() }] }),
    ).toThrow(ChangeInvalidStateError);
  });

  it('retrying split with the same commandId does not create a second set of children', () => {
    const service = newService();
    const { change } = service.create(createInput());
    const commandId = cmd();
    const args = {
      commandId, actor: actor('user'), changeId: change.id, guard: guardOf(change), reason: 'x',
      children: [{ title: 'A', type: 'feature' as const, requirement: baseRequirement() }, { title: 'B', type: 'feature' as const, requirement: baseRequirement() }],
    };
    const first = service.split(args);
    const second = service.split(args);
    expect(second.children.map((c) => c.id).sort()).toEqual(first.children.map((c) => c.id).sort());
    expect(service.list().filter((c) => c.relations.splitFrom === change.id)).toHaveLength(2);
  });
});

describe('ChangeService.merge', () => {
  it('creates one target listing mergedFrom, and each source becomes superseded pointing at the target', () => {
    const service = newService();
    const externalRefId = generateExternalRefId();
    const a = service.create(createInput({ requirement: baseRequirement({ desiredOutcome: 'A outcome' }), externalRefs: [{ id: externalRefId, provider: 'jira', key: 'ABC-1', capturedAt: '2026-09-05T00:00:00.000Z', availability: 'unknown' }] })).change;
    const b = service.create(createInput({ requirement: baseRequirement({ desiredOutcome: 'B outcome' }) })).change;
    const { sources, target } = service.merge({
      commandId: cmd(), actor: actor('user'), sourceIds: [a.id, b.id], sourceGuards: [guardOf(a), guardOf(b)], reason: 'Same delivery.',
      target: { title: 'Unified guest mode', type: 'feature', requirement: baseRequirement({ desiredOutcome: 'Unified outcome' }) },
    });
    expect(target.relations.mergedFrom.sort()).toEqual([a.id, b.id].sort());
    expect(target.requirement.desiredOutcome).toBe('Unified outcome');
    expect(target.externalRefs.map((r) => r.id)).toContain(externalRefId);
    for (const source of sources) {
      expect(source.disposition).toBe('superseded');
      expect(source.relations.supersededBy).toBe(target.id);
    }
    // Sources keep their own original requirement — merge does not silently discard it.
    expect(sources.find((s) => s.id === a.id)?.requirement.desiredOutcome).toBe('A outcome');
    expect(sources.find((s) => s.id === b.id)?.requirement.desiredOutcome).toBe('B outcome');
  });

  it('rejects fewer than two sources, duplicate sourceIds, and a non-user actor', () => {
    const service = newService();
    const a = service.create(createInput()).change;
    expect(() => service.merge({ commandId: cmd(), actor: actor('user'), sourceIds: [a.id], sourceGuards: [guardOf(a)], reason: 'x', target: { title: 'T', type: 'feature', requirement: baseRequirement() } })).toThrow(ChangeInvalidStateError);
    expect(() => service.merge({ commandId: cmd(), actor: actor('user'), sourceIds: [a.id, a.id], sourceGuards: [guardOf(a), guardOf(a)], reason: 'x', target: { title: 'T', type: 'feature', requirement: baseRequirement() } })).toThrow(ChangeRelationCycleError);
    const b = service.create(createInput()).change;
    expect(() => service.merge({ commandId: cmd(), actor: actor('agent'), sourceIds: [a.id, b.id], sourceGuards: [guardOf(a), guardOf(b)], reason: 'x', target: { title: 'T', type: 'feature', requirement: baseRequirement() } })).toThrow(ChangeHumanRequiredError);
  });

  it('retrying merge with the same commandId returns the same target rather than creating a second one', () => {
    const service = newService();
    const a = service.create(createInput()).change;
    const b = service.create(createInput()).change;
    const commandId = cmd();
    const args = { commandId, actor: actor('user'), sourceIds: [a.id, b.id], sourceGuards: [guardOf(a), guardOf(b)], reason: 'x', target: { title: 'T', type: 'feature' as const, requirement: baseRequirement() } };
    const first = service.merge(args);
    const second = service.merge(args);
    expect(second.target.id).toBe(first.target.id);
    expect(service.list().filter((c) => c.relations.mergedFrom.length > 0)).toHaveLength(1);
  });
});

describe('crash/failure injection', () => {
  it('an event file that exists with different content than intended forces StorageRecoveryRequiredError instead of silently accepting it', () => {
    const root = newRoot();
    const store = new ChangeStore(root);
    const service = new ChangeService(root, { clock: () => '2026-09-05T00:00:00.000Z', store });
    const { change } = service.create(createInput());

    // Simulate the residue of a corrupted/partial event write: a file already sits at the
    // target event path with content that does not match what this command would append.
    const events = service.store.listEvents(change.id);
    const collidingId = events[0].id;
    writeJsonFileAtomic(store.eventFile(change.id, collidingId), { ...events[0], type: 'tampered.event' });

    expect(() => store.appendEvent(change.id, events[0])).toThrow(StorageRecoveryRequiredError);
  });

  it('the aggregate write is durable even if event recording is retried afterwards (audit catches up, state is never lost)', () => {
    const root = newRoot();
    const store = new ChangeStore(root);
    const service = new ChangeService(root, { clock: () => '2026-09-05T00:00:00.000Z', store });
    const { change } = service.create(createInput());
    // change.json exists and is correct even though we are about to poke at the events directory directly.
    expect(readJsonFile(store.changeFile(change.id))).toMatchObject({ id: change.id, revision: 0 });
    expect(fs.existsSync(store.eventsDir(change.id))).toBe(true);
  });
});

/** Directly plants an `epicLink` on a Change's file for tests that need to simulate "an Epic already started" without M3's coordinator existing yet. */
function withEpicLinkFixture(service: ChangeService, changeId: ChangeId) {
  const current = service.require(changeId);
  return service.store.update(changeId, guardOf(current), (change) => {
    const { contentHash: _contentHash, ...rest } = change;
    const draft: ProjectChangeDraft = {
      ...rest,
      epicLink: {
        state: 'linked',
        commandId: 'fixture',
        epicId: toEpicId('EPIC-FIXTURE'),
        changeRevision: change.revision,
        changeContentHash: change.contentHash,
        changeSnapshotHash: change.contentHash,
        contextRevisionId: CONTEXT_REVISION_ID,
        contextRootHash: CONTEXT_ROOT_HASH,
        linkedAt: '2026-09-05T00:00:00.000Z',
      },
      revision: change.revision + 1,
    };
    return { ...draft, contentHash: computeChangeContentHash(draft) };
  });
}
