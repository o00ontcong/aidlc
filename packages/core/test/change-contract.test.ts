import { describe, it, expect } from 'vitest';

import { ContractValidationError } from '../src/contracts/common';
import {
  generateChangeId,
  generateExternalRefId,
  generateContextRevisionId,
  generateContextProposalId,
  toEpicId,
  type EpicId,
} from '../src/contracts/ids';
import {
  type ProjectChange,
  type ProjectChangeDraft,
  type ExternalReference,
  type ContextSyncFact,
  computeChangeContentHash,
  parseProjectChange,
  type ChangeShape,
  type ChangeShapeDraft,
  computeChangeShapeContentHash,
  parseChangeShape,
  parseChangeProvenance,
} from '../src/contracts/change';

const NOW = '2026-09-05T00:00:00.000Z';
const LATER = '2026-09-05T01:00:00.000Z';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_ZERO = '0'.repeat(64);
const EPIC_ID: EpicId = toEpicId('EPIC-001');

function externalRef(overrides: Partial<ExternalReference> = {}): ExternalReference {
  return {
    id: generateExternalRefId(),
    provider: 'jira',
    key: 'ABC-123',
    capturedAt: NOW,
    availability: 'unknown',
    ...overrides,
  };
}

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
      acceptanceCriteria: [
        { id: 'AC-01', text: 'Guest can enter from the login screen.' },
        { id: 'AC-02', text: 'Restricted data never persists after the session ends.' },
      ],
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

describe('computeChangeContentHash', () => {
  it('is deterministic for the same content', () => {
    const draft = draftChange();
    expect(computeChangeContentHash(draft)).toBe(computeChangeContentHash(draft));
    expect(computeChangeContentHash(draft)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when semantic content changes', () => {
    const base = computeChangeContentHash(draftChange());
    expect(computeChangeContentHash(draftChange({ title: 'A different title' }))).not.toBe(base);
    expect(computeChangeContentHash(draftChange({ disposition: 'shelved' }))).not.toBe(base);
  });

  it('is unaffected by the order of "set-like" arrays (externalRefs, relations.*)', () => {
    const sharedId = generateChangeId();
    const refA = externalRef({ key: 'A-1' });
    const refB = externalRef({ key: 'B-2' });
    const forward = computeChangeContentHash(draftChange({ id: sharedId, externalRefs: [refA, refB] }));
    const reversed = computeChangeContentHash(draftChange({ id: sharedId, externalRefs: [refB, refA] }));
    expect(forward).toBe(reversed);

    const idOne = generateChangeId();
    const idTwo = generateChangeId();
    const relForward = computeChangeContentHash(draftChange({ id: sharedId, relations: { mergedFrom: [idOne, idTwo], relatesTo: [] } }));
    const relReversed = computeChangeContentHash(draftChange({ id: sharedId, relations: { mergedFrom: [idTwo, idOne], relatesTo: [] } }));
    expect(relForward).toBe(relReversed);
  });

  it('preserves order for user-ordered lists like acceptanceCriteria', () => {
    const forward = draftChange();
    const reordered = draftChange({
      requirement: { ...forward.requirement, acceptanceCriteria: [...forward.requirement.acceptanceCriteria].reverse() },
    });
    expect(computeChangeContentHash(forward)).not.toBe(computeChangeContentHash(reordered));
  });
});

describe('ProjectChangeSchema / parseProjectChange', () => {
  it('parses a well-formed Change and round-trips through JSON', () => {
    const change = buildChange();
    const parsed = parseProjectChange(change);
    expect(parsed).toEqual(change);

    const roundTripped = parseProjectChange(JSON.parse(JSON.stringify(change)));
    expect(roundTripped).toEqual(change);
  });

  it('rejects an unknown schemaVersion', () => {
    const change = buildChange();
    expect(() => parseProjectChange({ ...change, schemaVersion: 2 })).toThrow(ContractValidationError);
  });

  it('rejects a tampered contentHash', () => {
    const change = buildChange();
    expect(() => parseProjectChange({ ...change, contentHash: HASH_ZERO })).toThrow(/contentHash/);
  });

  it('rejects duplicate external reference ids', () => {
    const ref = externalRef();
    const change = buildChange({ externalRefs: [ref, { ...ref }] });
    expect(() => parseProjectChange(change)).toThrow(/Duplicate external reference/);
  });

  it('rejects a Change that relates to itself', () => {
    const draft = draftChange();
    const selfRelating: ProjectChangeDraft = { ...draft, relations: { mergedFrom: [], relatesTo: [draft.id] } };
    const change = { ...selfRelating, contentHash: computeChangeContentHash(selfRelating) };
    expect(() => parseProjectChange(change)).toThrow(/cannot relate to itself/);
  });

  it('requires a superseded Change to show a successor trail via supersededBy (merge) or relatesTo (split)', () => {
    const supersededById = generateChangeId();
    const neitherTrail = buildChange({ disposition: 'superseded' });
    expect(() => parseProjectChange(neitherTrail)).toThrow(/must record relations.supersededBy .* or relations.relatesTo/);

    const misusedRef = buildChange({ disposition: 'active', relations: { mergedFrom: [], relatesTo: [], supersededBy: supersededById } });
    expect(() => parseProjectChange(misusedRef)).toThrow(/Only a superseded Change/);

    // Merge: one source superseded by exactly one target.
    const mergedAway = buildChange({ disposition: 'superseded', relations: { mergedFrom: [], relatesTo: [], supersededBy: supersededById } });
    expect(() => parseProjectChange(mergedAway)).not.toThrow();

    // Split: one source superseded by many children — no single supersededBy, but relatesTo lists them.
    const childId = generateChangeId();
    const splitAway = buildChange({ disposition: 'superseded', relations: { mergedFrom: [], relatesTo: [childId] } });
    expect(() => parseProjectChange(splitAway)).not.toThrow();
  });

  it('accepts every ChangeEpicLink variant (pending/linked)', () => {
    const contextRevisionId = generateContextRevisionId();

    const pending = buildChange({
      epicLink: {
        state: 'pending',
        commandId: 'cmd-1',
        epicId: EPIC_ID,
        changeRevision: 0,
        changeContentHash: HASH_A,
        contextRevisionId,
        contextRootHash: HASH_B,
        startedAt: NOW,
      },
      contextSync: { status: 'pending', epicId: EPIC_ID, deliveryCompletedAt: NOW },
    });
    expect(() => parseProjectChange(pending)).not.toThrow();

    const linked = buildChange({
      epicLink: {
        state: 'linked',
        commandId: 'cmd-1',
        epicId: EPIC_ID,
        changeRevision: 0,
        changeContentHash: HASH_A,
        changeSnapshotHash: HASH_B,
        contextRevisionId,
        contextRootHash: HASH_B,
        linkedAt: NOW,
      },
    });
    expect(() => parseProjectChange(linked)).not.toThrow();
  });

  it('accepts every ContextSyncFact variant and enforces its own shape', () => {
    const contextRevisionId = generateContextRevisionId();
    const contextProposalId = generateContextProposalId();

    const variants: ContextSyncFact[] = [
      { status: 'not-evaluated' },
      { status: 'pending', epicId: EPIC_ID, deliveryCompletedAt: NOW },
      { status: 'proposed', epicId: EPIC_ID, proposalIds: [contextProposalId] },
      {
        status: 'applied',
        epicId: EPIC_ID,
        proposalIds: [contextProposalId],
        contextRevisionIds: [contextRevisionId],
        resolvedAt: LATER,
        resolvedBy: { kind: 'user', id: 'cong' },
      },
      {
        status: 'not-required',
        epicId: EPIC_ID,
        reason: 'Docs-only change; nothing durable to sync.',
        resolvedAt: LATER,
        resolvedBy: { kind: 'user', id: 'cong' },
      },
    ];
    for (const contextSync of variants) {
      expect(() => parseProjectChange(buildChange({ contextSync }))).not.toThrow();
    }

    // `proposed` and `applied` each declare their array non-empty in the doc; enforce it.
    expect(() => parseProjectChange(buildChange({ contextSync: { status: 'proposed', epicId: EPIC_ID, proposalIds: [] } }))).toThrow(
      ContractValidationError,
    );
    expect(() =>
      parseProjectChange(
        buildChange({
          contextSync: {
            status: 'applied',
            epicId: EPIC_ID,
            proposalIds: [],
            contextRevisionIds: [],
            resolvedAt: LATER,
            resolvedBy: { kind: 'user', id: 'cong' },
          },
        }),
      ),
    ).toThrow(ContractValidationError);
  });
});

describe('ChangeShape', () => {
  function draftShape(overrides: Partial<ChangeShapeDraft> = {}): ChangeShapeDraft {
    return {
      schemaVersion: 1,
      changeId: generateChangeId(),
      revision: 0,
      status: 'exploring',
      constraints: [],
      options: [
        { id: 'opt-a', title: 'Option A', summary: 'Do it the simple way.', tradeoffs: ['Less flexible later.'] },
        { id: 'opt-b', title: 'Option B', summary: 'Do it the flexible way.', tradeoffs: ['More upfront work.'] },
      ],
      risks: [],
      noGos: [],
      openQuestions: [],
      architectureImpact: [],
      basedOnChange: { revision: 0, contentHash: HASH_A },
      ...overrides,
    };
  }

  function buildShape(overrides: Partial<ChangeShapeDraft> = {}): ChangeShape {
    const draft = draftShape(overrides);
    return { ...draft, contentHash: computeChangeShapeContentHash(draft) };
  }

  it('parses a well-formed Shape and is hash-stable', () => {
    const changeId = generateChangeId();
    const shape = buildShape({ changeId, selectedOptionId: 'opt-a' });
    expect(() => parseChangeShape(shape)).not.toThrow();
    expect(computeChangeShapeContentHash(draftShape({ changeId, selectedOptionId: 'opt-a' }))).toBe(shape.contentHash);
  });

  it('rejects a selectedOptionId that is not one of options', () => {
    const shape = buildShape({ selectedOptionId: 'does-not-exist' });
    expect(() => parseChangeShape(shape)).toThrow(/is not one of options/);
  });

  it('requires acceptedBy/acceptedAt when status is accepted, and only from a human user', () => {
    const missingAcceptance = buildShape({ status: 'accepted' });
    expect(() => parseChangeShape(missingAcceptance)).toThrow(/must record acceptedBy and acceptedAt/);

    const agentAccepted = buildShape({ status: 'accepted', acceptedBy: { kind: 'agent', id: 'planner' }, acceptedAt: NOW });
    expect(() => parseChangeShape(agentAccepted)).toThrow(/Only a human user may accept/);

    const humanAccepted = buildShape({ status: 'accepted', acceptedBy: { kind: 'user', id: 'cong' }, acceptedAt: NOW });
    expect(() => parseChangeShape(humanAccepted)).not.toThrow();
  });

  it('rejects a tampered contentHash', () => {
    const shape = buildShape();
    expect(() => parseChangeShape({ ...shape, contentHash: HASH_ZERO })).toThrow(/contentHash/);
  });
});

describe('ChangeProvenance', () => {
  it('parses a well-formed provenance record', () => {
    const provenance = {
      changeId: generateChangeId(),
      changeRevision: 3,
      changeContentHash: HASH_A,
      changeSnapshotHash: HASH_B,
      contextRevision: generateContextRevisionId(),
      contextRootHash: HASH_A,
    };
    expect(parseChangeProvenance(provenance)).toEqual(provenance);
  });

  it('rejects a malformed hash', () => {
    const provenance = {
      changeId: generateChangeId(),
      changeRevision: 0,
      changeContentHash: 'not-a-hash',
      changeSnapshotHash: HASH_B,
      contextRevision: generateContextRevisionId(),
      contextRootHash: HASH_A,
    };
    expect(() => parseChangeProvenance(provenance)).toThrow(ContractValidationError);
  });
});
