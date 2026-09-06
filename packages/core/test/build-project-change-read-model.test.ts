import { describe, it, expect } from 'vitest';

import { toEpicId } from '../src/contracts/ids';
import {
  generateChangeId,
  generateContextRevisionId,
  generateScopeAnalysisId,
} from '../src/contracts/ids';
import { computeChangeContentHash, computeChangeShapeContentHash, type ChangeShape, type ChangeShapeDraft, type ProjectChange, type ProjectChangeDraft } from '../src/contracts/change';
import { buildProjectChangeReadModel } from '../src/change/buildProjectChangeReadModel';

const NOW = '2026-09-05T00:00:00.000Z';
const HASH_A = 'a'.repeat(64);
const EPIC_ID = toEpicId('EPIC-001');

function draftChange(overrides: Partial<ProjectChangeDraft> = {}): ProjectChangeDraft {
  return {
    schemaVersion: 1,
    id: generateChangeId(),
    revision: 0,
    title: 'Add guest mode',
    type: 'feature',
    priority: 'unset',
    disposition: 'active',
    requirement: {
      problem: 'Users cannot try the app without registering.',
      desiredOutcome: 'Users can enter a restricted guest session.',
      acceptanceCriteria: [],
      inScope: [],
      outOfScope: [],
      constraints: [],
    },
    origin: { kind: 'user', entryPoint: 'project', actor: { kind: 'user', id: 'cong' } },
    externalRefs: [],
    contextSync: { status: 'not-evaluated' },
    relations: { mergedFrom: [], relatesTo: [] },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildChange(overrides: Partial<ProjectChangeDraft> = {}): ProjectChange {
  const draft = draftChange(overrides);
  return { ...draft, contentHash: computeChangeContentHash(draft) };
}

function draftShape(changeId: ProjectChange['id'], overrides: Partial<ChangeShapeDraft> = {}): ChangeShapeDraft {
  return {
    schemaVersion: 1,
    changeId,
    revision: 0,
    status: 'exploring',
    constraints: [],
    options: [],
    risks: [],
    noGos: [],
    openQuestions: [],
    architectureImpact: [],
    basedOnChange: { revision: 0, contentHash: HASH_A },
    ...overrides,
  };
}

function buildShape(changeId: ProjectChange['id'], overrides: Partial<ChangeShapeDraft> = {}): ChangeShape {
  const draft = draftShape(changeId, overrides);
  return { ...draft, contentHash: computeChangeShapeContentHash(draft) };
}

describe('buildProjectChangeReadModel — derived state matches deriveProjectChangeState', () => {
  it('composes disposition + epicStatus + contextSync + shape into the same derived state', () => {
    const change = buildChange({ disposition: 'shelved' });
    const readModel = buildProjectChangeReadModel({ change });
    expect(readModel.derived.state).toBe('shelved');
    expect(readModel.schemaVersion).toBe(1);
    expect(readModel.change).toBe(change);
  });

  it('reflects a linked, completed Epic with resolved context as done', () => {
    const change = buildChange({
      epicLink: {
        state: 'linked',
        commandId: 'cmd-1',
        epicId: EPIC_ID,
        changeRevision: 0,
        changeContentHash: HASH_A,
        changeSnapshotHash: HASH_A,
        contextRevisionId: generateContextRevisionId(),
        contextRootHash: HASH_A,
        linkedAt: NOW,
      },
      contextSync: { status: 'not-required', epicId: EPIC_ID, reason: 'Docs-only.', resolvedAt: NOW, resolvedBy: { kind: 'user', id: 'cong' } },
    });
    const readModel = buildProjectChangeReadModel({ change, epicStatus: 'completed' });
    expect(readModel.derived.state).toBe('done');
  });
});

describe('buildProjectChangeReadModel — warnings', () => {
  it('warns change.problem_missing when problem is blank', () => {
    const change = buildChange({ requirement: { ...draftChange().requirement, problem: '' } });
    const readModel = buildProjectChangeReadModel({ change });
    expect(readModel.warnings).toEqual([
      expect.objectContaining({ code: 'change.problem_missing', severity: 'info' }),
    ]);
  });

  it('has no warnings when problem is present', () => {
    const readModel = buildProjectChangeReadModel({ change: buildChange() });
    expect(readModel.warnings).toEqual([]);
  });
});

describe('buildProjectChangeReadModel — availableActions (advisory)', () => {
  function commandsOf(readModel: ReturnType<typeof buildProjectChangeReadModel>): string[] {
    return readModel.availableActions.map((a) => a.command);
  }

  it('terminal dispositions (cancelled/superseded) offer no actions', () => {
    const cancelled = buildProjectChangeReadModel({ change: buildChange({ disposition: 'cancelled' }) });
    expect(cancelled.availableActions).toEqual([]);
    const supersededById = generateChangeId();
    const superseded = buildProjectChangeReadModel({
      change: buildChange({ disposition: 'superseded', relations: { mergedFrom: [], relatesTo: [], supersededBy: supersededById } }),
    });
    expect(superseded.availableActions).toEqual([]);
  });

  it('shelved disposition offers only reopen', () => {
    const readModel = buildProjectChangeReadModel({ change: buildChange({ disposition: 'shelved' }) });
    expect(commandsOf(readModel)).toEqual(['change.reopen']);
  });

  it('captured (no Shape, no Epic) offers explore + start epic among the base actions', () => {
    const readModel = buildProjectChangeReadModel({ change: buildChange() });
    const commands = commandsOf(readModel);
    expect(commands).toContain('change.explore.start');
    expect(commands).toContain('change.epic.start');
    expect(commands).toContain('change.requirement.update');
    expect(commands).toContain('change.shelve');
    expect(commands).toContain('change.cancel');
    expect(commands).not.toContain('change.shape.update');
  });

  it('exploring/ready/accepted Shape offer the matching Shape actions, always alongside Start Epic anyway (§D2)', () => {
    const change = buildChange();
    const exploring = buildProjectChangeReadModel({ change, shape: buildShape(change.id, { status: 'exploring' }) });
    expect(commandsOf(exploring)).toEqual(expect.arrayContaining(['change.shape.update', 'change.shape.ready', 'change.epic.start']));

    const ready = buildProjectChangeReadModel({ change, shape: buildShape(change.id, { status: 'ready' }) });
    expect(commandsOf(ready)).toEqual(expect.arrayContaining(['change.shape.update', 'change.shape.accept', 'change.epic.start']));

    const accepted = buildProjectChangeReadModel({
      change,
      shape: buildShape(change.id, { status: 'accepted', acceptedBy: { kind: 'user', id: 'cong' }, acceptedAt: NOW }),
    });
    expect(commandsOf(accepted)).toEqual(expect.arrayContaining(['change.shape.reopen', 'change.epic.start']));
  });

  it('surfaces change.scope.feedback only while the latest analysis has not been reviewed', () => {
    const analysisId = generateScopeAnalysisId();
    const unreviewed = buildProjectChangeReadModel({ change: buildChange({ latestScopeAnalysisId: analysisId }) });
    expect(commandsOf(unreviewed)).toContain('change.scope.feedback');

    const reviewed = buildProjectChangeReadModel({
      change: buildChange({
        latestScopeAnalysisId: analysisId,
        scopeReview: { analysisId, outcome: 'used-for-exploration', at: NOW, actor: { kind: 'user', id: 'cong' } },
      }),
    });
    expect(commandsOf(reviewed)).not.toContain('change.scope.feedback');
  });

  it('a pending Epic link only offers resume/rollback', () => {
    const change = buildChange({
      epicLink: {
        state: 'pending',
        commandId: 'cmd-1',
        epicId: EPIC_ID,
        changeRevision: 0,
        changeContentHash: HASH_A,
        contextRevisionId: generateContextRevisionId(),
        contextRootHash: HASH_A,
        startedAt: NOW,
      },
    });
    const readModel = buildProjectChangeReadModel({ change });
    expect(commandsOf(readModel)).toEqual(['change.epic.pending.resume', 'change.epic.pending.rollback']);
  });

  it('a linked Epic offers context.notrequired only once delivered, and drops requirement.update once done', () => {
    const linkedChange = (contextSync: ProjectChange['contextSync']) =>
      buildChange({
        epicLink: {
          state: 'linked',
          commandId: 'cmd-1',
          epicId: EPIC_ID,
          changeRevision: 0,
          changeContentHash: HASH_A,
          changeSnapshotHash: HASH_A,
          contextRevisionId: generateContextRevisionId(),
          contextRootHash: HASH_A,
          linkedAt: NOW,
        },
        contextSync,
      });

    const inDelivery = buildProjectChangeReadModel({ change: linkedChange({ status: 'not-evaluated' }), epicStatus: 'running' });
    expect(commandsOf(inDelivery)).toEqual(['change.requirement.update']);

    const delivered = buildProjectChangeReadModel({ change: linkedChange({ status: 'pending', epicId: EPIC_ID, deliveryCompletedAt: NOW }), epicStatus: 'completed' });
    expect(commandsOf(delivered)).toEqual(expect.arrayContaining(['change.requirement.update', 'change.context.notrequired']));

    const done = buildProjectChangeReadModel({
      change: linkedChange({ status: 'not-required', epicId: EPIC_ID, reason: 'x', resolvedAt: NOW, resolvedBy: { kind: 'user', id: 'cong' } }),
      epicStatus: 'completed',
    });
    expect(commandsOf(done)).toEqual([]);
  });
});
