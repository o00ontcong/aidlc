import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  IdeaService,
  IdeaStateError,
  IdeaStore,
  canAdvance,
  getCompletion,
  getMissingRequirements,
  getNextStage,
  getStageStatus,
  type Idea,
} from '../src';

function temporary(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-idea-workflow-')); }

const USER = { kind: 'user' as const, id: 'owner' };
const NOW = '2026-08-01T00:00:00.000Z';

function freshIdea(): Idea {
  const ideas = new IdeaService(temporary());
  return ideas.create({ seedSentence: 'x' });
}

describe('Definition of Done — Understand', () => {
  it('required fields gate canAdvance; optional fields never block it', () => {
    const idea = freshIdea();
    expect(canAdvance(idea)).toBe(false);
    expect(getMissingRequirements(idea).map((r) => r.id).sort()).toEqual(['context', 'problem', 'users']);

    const withOptionalOnly: Idea = { ...idea, understand: { ...idea.understand, assumptions: ['maybe'], unknowns: ['not sure'] } };
    expect(canAdvance(withOptionalOnly)).toBe(false); // required still missing

    const complete: Idea = {
      ...idea,
      understand: { problem: 'p', context: 'c', users: ['u'], assumptions: [], unknowns: [] },
    };
    expect(canAdvance(complete)).toBe(true);
    expect(getCompletion(complete)).toBe(1);
    expect(getNextStage(complete)).toBe('research');
  });
});

describe('Definition of Done — Research', () => {
  it('requires 2+ findings and 1+ existing solution; sources only required alongside a fact finding', () => {
    const base: Idea = { ...freshIdea(), stage: 'research' };
    expect(canAdvance(base)).toBe(false);

    const twoInferences: Idea = {
      ...base,
      research: {
        findings: [
          { id: 'f1', text: 'a', type: 'inference', sourceIds: [], createdBy: 'user', createdAt: NOW },
          { id: 'f2', text: 'b', type: 'assumption', sourceIds: [], createdBy: 'user', createdAt: NOW },
        ],
        sources: [],
        existingSolutions: [{ id: 'e1', text: 'existing', createdBy: 'user', createdAt: NOW }],
        unknowns: [],
      },
    };
    expect(canAdvance(twoInferences)).toBe(true); // no fact finding — sources not required

    const withFact: Idea = {
      ...twoInferences,
      research: { ...twoInferences.research, findings: [...twoInferences.research.findings, { id: 'f3', text: 'c', type: 'fact', sourceIds: [], createdBy: 'user', createdAt: NOW }] },
    };
    expect(canAdvance(withFact)).toBe(false); // fact finding now demands a source
    expect(getMissingRequirements(withFact).map((r) => r.id)).toEqual(['sources']);

    const withSource: Idea = { ...withFact, research: { ...withFact.research, sources: [{ id: 's1', source: 'doc', type: 'doc', question: 'q', read: true }] } };
    expect(canAdvance(withSource)).toBe(true);
  });
});

describe('Definition of Done — Explore', () => {
  it('requires 2+ options each with pros and cons, plus a validation idea', () => {
    const base: Idea = { ...freshIdea(), stage: 'explore' };
    const oneOption: Idea = {
      ...base,
      explore: { options: [{ id: 'o1', title: 't', description: '', pros: ['p'], cons: ['c'], risks: [], tradeoffs: [] }], validations: ['v'] },
    };
    expect(canAdvance(oneOption)).toBe(false);

    const missingCons: Idea = {
      ...base,
      explore: {
        options: [
          { id: 'o1', title: 't1', description: '', pros: ['p'], cons: [], risks: [], tradeoffs: [] },
          { id: 'o2', title: 't2', description: '', pros: ['p'], cons: ['c'], risks: [], tradeoffs: [] },
        ],
        validations: ['v'],
      },
    };
    expect(canAdvance(missingCons)).toBe(false);

    const complete: Idea = {
      ...base,
      explore: {
        options: [
          { id: 'o1', title: 't1', description: '', pros: ['p'], cons: ['c'], risks: [], tradeoffs: [] },
          { id: 'o2', title: 't2', description: '', pros: ['p'], cons: ['c'], risks: [], tradeoffs: [] },
        ],
        validations: [],
      },
    };
    expect(canAdvance(complete)).toBe(false); // no idea-level validation and no per-option validation either

    const completeWithOptionValidation: Idea = {
      ...base,
      explore: { options: [{ ...complete.explore.options[0]!, validation: 'Ask users' }, complete.explore.options[1]!], validations: [] },
    };
    expect(canAdvance(completeWithOptionValidation)).toBe(true);
  });
});

describe('Stage transitions', () => {
  it('blocks forward transitions when the current stage is incomplete', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    expect(() => ideas.advanceStage(created.id, created.ideaRevision, USER)).toThrow(/Cannot advance/);
  });

  it('allows revisiting a prior stage without destroying later-stage data, and flags needsReview', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    let idea = ideas.updateUnderstand(created.id, created.ideaRevision, { problem: 'p1', context: 'c', users: ['u'] }, USER);
    idea = ideas.advanceStage(created.id, idea.ideaRevision, USER);
    idea = ideas.updateResearch(created.id, idea.ideaRevision, {
      findings: [
        { id: 'f1', text: 'a', type: 'inference', sourceIds: [], createdBy: 'user', createdAt: NOW },
        { id: 'f2', text: 'b', type: 'inference', sourceIds: [], createdBy: 'user', createdAt: NOW },
      ],
      existingSolutions: [{ id: 'e1', text: 'x', createdBy: 'user', createdAt: NOW }],
    }, USER);
    idea = ideas.advanceStage(created.id, idea.ideaRevision, USER); // now at "explore"
    expect(idea.needsReview).toBeUndefined();

    // Go back and edit Understand — a stage the workflow already moved past.
    const revisited = ideas.updateUnderstand(created.id, idea.ideaRevision, { problem: 'p1 changed' }, USER);
    expect(revisited.stage).toBe('explore'); // unchanged — going back never destroys forward progress
    expect(revisited.research.findings).toHaveLength(2); // later-stage data intact
    expect(revisited.needsReview?.reason).toMatch(/understand/i);
  });

  it('rejects reaching "ready" through advanceStage — markReady is the only door', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const idea: Idea = { ...ideas.require(created.id), stage: 'decide' };
    // Force the idea onto "decide" directly to isolate the guard being tested.
    fs.writeFileSync(path.join(root, '.aidlc', 'ideas', created.id, 'state.json'), `${JSON.stringify(idea, null, 2)}\n`);
    expect(() => ideas.advanceStage(created.id, idea.ideaRevision, USER)).toThrow(/markReady/);
  });
});

describe('markReady', () => {
  it('rejects a non-human actor', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    expect(() => ideas.markReady(created.id, created.ideaRevision, 'cofofo-feature', 'Title', { kind: 'agent', id: 'bot' }))
      .toThrow(IdeaStateError);
  });
});

/** Writes a raw pre-5-stage `state.json` (schemaVersion 1) straight to disk, bypassing IdeaService — simulates a file nothing has touched since before `migrateIdea` existed. */
function writeLegacyIdea(root: string, id: string, overrides: Record<string, unknown>): void {
  const dir = path.join(root, '.aidlc', 'ideas', id);
  fs.mkdirSync(dir, { recursive: true });
  const raw = {
    schemaVersion: 1,
    id,
    checkpoint: 'captured',
    ideaRevision: 0,
    seedSentence: 'The list never refreshes.',
    title: 'The list never refreshes.',
    outputLanguage: 'vi',
    foundationHashAtCapture: null,
    answers: {},
    batchIndex: 0,
    batchSubmitted: false,
    prep: { status: 'idle', selfAnswered: [], questions: [] },
    routeConfirmed: false,
    assumptions: [],
    children: [],
    saveStatus: 'saved',
    dirty: false,
    journalPhase: 'spark',
    journal: { sources: [], notes: [], rewrite: { problem: '', outcome: '', appetite: '', noGos: '' } },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
  fs.writeFileSync(path.join(dir, 'state.json'), `${JSON.stringify(raw, null, 2)}\n`);
}

describe('Migration from the legacy 4-phase journal', () => {
  it('maps spark → understand with no data loss and no needsReview (still in progress, not "wrong")', () => {
    const root = temporary();
    writeLegacyIdea(root, 'IDEA-001', { journalPhase: 'spark' });
    const idea = new IdeaStore(root).require('IDEA-001');
    expect(idea.schemaVersion).toBe(2);
    expect(idea.stage).toBe('understand');
    expect(idea.seedSentence).toBe('The list never refreshes.');
    expect(idea.needsReview).toBeUndefined();
    expect(idea.journalPhase).toBeUndefined();
  });

  it('maps research → research, carrying sources over untouched', () => {
    const root = temporary();
    writeLegacyIdea(root, 'IDEA-002', {
      journalPhase: 'research',
      journal: { sources: [{ id: 's1', source: 'a.ts', type: 'code', question: 'q?', read: true }], notes: [], rewrite: { problem: '', outcome: '', appetite: '', noGos: '' } },
    });
    const idea = new IdeaStore(root).require('IDEA-002');
    expect(idea.stage).toBe('research');
    expect(idea.research.sources).toEqual([{ id: 's1', source: 'a.ts', type: 'code', question: 'q?', read: true }]);
  });

  it('maps rewrite → decide, backfilling Understand/Decide from the old draft, notes becoming unverified "inference" findings', () => {
    const root = temporary();
    writeLegacyIdea(root, 'IDEA-003', {
      journalPhase: 'rewrite',
      journal: {
        sources: [],
        notes: [{ id: 'n1', at: NOW, text: 'Found an existing type.', origin: 'ai' }],
        rewrite: { problem: 'No alert.', outcome: 'User sees alert.', appetite: 'Small', noGos: 'No push.' },
      },
    });
    const idea = new IdeaStore(root).require('IDEA-003');
    expect(idea.stage).toBe('decide');
    expect(idea.understand.problem).toBe('No alert.');
    expect(idea.decision.finalIdea).toBe('No alert.');
    expect(idea.decision.recommendation).toBe('User sees alert.');
    expect(idea.decision.scope).toEqual(['Small']);
    expect(idea.decision.outOfScope).toEqual(['No push.']);
    expect(idea.research.findings).toEqual([{ id: 'n1', text: 'Found an existing type.', type: 'inference', sourceIds: [], createdBy: 'ai', createdAt: NOW }]);
    // Still mid-flight under the old rules too — no needsReview noise.
    expect(idea.needsReview).toBeUndefined();
  });

  it('flags needsReview when an old "ready" idea does not satisfy the new (stricter) Decide requirements', () => {
    const root = temporary();
    writeLegacyIdea(root, 'IDEA-004', {
      journalPhase: 'ready',
      journal: {
        sources: [],
        notes: [],
        rewrite: { problem: 'No alert.', outcome: '', appetite: '', noGos: '' },
        readyRecipeId: 'cofofo-feature',
        readyEpicTitle: 'Heat alert',
      },
    });
    const idea = new IdeaStore(root).require('IDEA-004');
    expect(idea.stage).toBe('ready');
    expect(idea.readyRecipeId).toBe('cofofo-feature');
    expect(idea.needsReview).toBeDefined();
    expect(getStageStatus(idea, 'decide').canAdvance).toBe(false);
  });
});
