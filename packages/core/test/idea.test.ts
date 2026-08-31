import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  CofofoFoundationService,
  IdeaService,
  IdeaStateError,
  IdeaRevisionConflictError,
  RunStateStore,
  applyArtifactReviewVerdict,
  assemblePipeline,
  buildReviewBundle,
  createDefaultRules,
  detectStack,
  generatedCofofoWorkspace,
  markStepDone,
  renderProjectRules,
  startRun,
  syncAllIdeaDeliveries,
  type PipelineConfig,
  type RunState,
} from '../src';

function temporary(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-idea-')); }

function write(root: string, relative: string, content: string): void {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, 'utf8');
}

function swiftFixture(): string {
  const root = temporary();
  write(root, 'src/Package.swift', '// swift-tools-version: 5.9\nimport PackageDescription\nlet package = Package(name: "Demo")\n');
  write(root, 'src/Sources/Demo/Domain/City.swift', 'public struct City {}\n');
  write(root, 'src/Tests/DemoTests/CityTests.swift', 'import XCTest\n');
  return root;
}

function approveCurrentCanvas(root: string, state: RunState, pipeline: PipelineConfig): RunState {
  const index = state.currentStepIdx;
  const config = pipeline.steps[index]!;
  const artifacts = typeof config === 'string' ? [] : config.review?.artifacts ?? [];
  const bundle = buildReviewBundle({
    workspaceRoot: root, runId: state.runId, stepIdx: index, stepRevision: state.steps[index]!.revision,
    reviewRevision: 1, artifacts, context: state.context,
  });
  return applyArtifactReviewVerdict({ workspaceRoot: root, state, pipeline, bundle, verdict: { verdict: 'approve', reviewer: 'Reviewer <r@example.test>' } });
}

function simulateDefineRules(root: string): void {
  const rules = createDefaultRules(detectStack(root), 1, new Date().toISOString());
  write(root, 'docs/project/foundation/PROJECT-RULES.json', JSON.stringify(rules, null, 2));
  write(root, 'docs/project/foundation/PROJECT-RULES.md', renderProjectRules(rules));
  write(root, 'docs/project/foundation/RULE-DRIFT.md', '# Rule Drift\n\n## Findings\n\n- No current violations.\n');
}

function simulateMapSystem(root: string): void {
  write(root, 'docs/project/foundation/ARCHITECTURE-MAP.md', '# Architecture Map\n\n## Layer Map\n\n- (test placeholder)\n');
}

function readyCofofoFoundation(root: string): void {
  const service = new CofofoFoundationService(root);
  service.prepare();
  const foundation = generatedCofofoWorkspace({ version: '1.0', name: 'x', environment: {} }).pipelines.find((p) => p.id === 'cofofo-foundation')!;
  let state = startRun({ runId: 'FOUNDATION-R1', pipeline: foundation, context: {}, workspaceRoot: root });
  state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
  simulateDefineRules(root);
  state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
  state = approveCurrentCanvas(root, state, foundation);
  RunStateStore.save(root, state);
  simulateMapSystem(root);
  state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
  state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
  state = approveCurrentCanvas(root, state, foundation);
  RunStateStore.save(root, state);
  service.install('FOUNDATION-R1');
  state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
  RunStateStore.save(root, state);
  service.publish('FOUNDATION-R1');
  state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
  state = approveCurrentCanvas(root, state, foundation);
  RunStateStore.save(root, state);
  service.activate('FOUNDATION-R1');
}

const USER = { kind: 'user' as const, id: 'owner' };

describe('Idea capture — never blocked by Foundation', () => {
  it('captures with a null Foundation snapshot before any CoFoFo Foundation exists', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const idea = ideas.create({ seedSentence: 'The list never refreshes.' });
    expect(idea.checkpoint).toBe('captured');
    expect(idea.foundationHashAtCapture).toBeNull();
    expect(idea.title).toBe('The list never refreshes.');
  });

  it('starts in journal spark phase with journal.md on disk', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const idea = ideas.create({ seedSentence: 'List feels stuck.' });
    expect(idea.journalPhase).toBe('spark');
    expect(idea.journal?.sources).toEqual([]);
    const journalPath = path.join(root, 'docs', 'ideas', idea.id, 'journal.md');
    expect(fs.existsSync(journalPath)).toBe(true);
    expect(fs.readFileSync(journalPath, 'utf8')).toContain('List feels stuck.');
  });
});

describe('Idea journal', () => {
  it('saves journal fields and advances phase', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'Heat alert when temp > 38C.' });
    const saved = ideas.saveJournal(created.id, created.ideaRevision, {
      journalPhase: 'research',
      journal: {
        sources: [{ id: 's1', source: 'WeatherSnapshot.swift', type: 'code', question: 'Existing alert types?', read: false }],
      },
    }, USER);
    expect(saved.journalPhase).toBe('research');
    expect(saved.journal?.sources).toHaveLength(1);
    expect(ideas.inboxBucket(saved)).toBe('awaiting_you');
  });

  it('requires problem and outcome before markJournalReady', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    expect(() => ideas.markJournalReady(
      created.id, created.ideaRevision, 'cofofo-feature', 'Heat alert', USER,
    )).toThrow(/Problem and outcome/);
  });

  it('scaffolds from a ready journal', () => {
    const root = swiftFixture();
    readyCofofoFoundation(root);
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'Add heat alert.' });
    const ready = ideas.saveJournal(created.id, created.ideaRevision, {
      journalPhase: 'ready',
      journal: {
        rewrite: { problem: 'No alert', outcome: 'User sees alert above 38C', appetite: 'Small', noGos: 'No push' },
        readyRecipeId: 'cofofo-feature',
        readyEpicTitle: 'Heat alert',
      },
    }, USER);
    const cfg = generatedCofofoWorkspace({ version: '1.0', name: 'x', environment: {} });
    const pipeline = assemblePipeline(cfg, { recipeId: 'cofofo-feature', pipelineId: 'EPIC-201-PIPELINE' });
    const scaffolded = ideas.scaffoldFromJournal(ready.id, ready.ideaRevision, [{
      recipeId: 'cofofo-feature',
      epicId: 'EPIC-201',
      epicTitle: 'Heat alert',
      pipeline,
      scaffold: { agents: pipeline.steps.map((s) => (typeof s === 'string' ? s : s.agent)), inputs: {} },
    }], null, USER);
    expect(scaffolded.checkpoint).toBe('in_delivery');
    expect(scaffolded.children).toHaveLength(1);
    expect(fs.existsSync(path.join(root, 'docs', 'ideas', created.id, 'INTENT.md'))).toBe(true);
  });

  it('appends journal notes', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const noted = ideas.appendJournalNote(created.id, created.ideaRevision, 'Found existing WeatherSnapshot type.', 'human', USER);
    expect(noted.journal?.notes).toHaveLength(1);
    expect(noted.journal?.notes[0]?.text).toContain('WeatherSnapshot');
  });
});

describe('Idea shelve / reopen / restart', () => {
  it('shelve hides it from the default inbox bucket; reopen resumes at captured', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    expect(() => ideas.shelve(created.id, created.ideaRevision, { kind: 'agent' as const, id: 'bot' })).toThrow(/human user/i);
    const shelved = ideas.shelve(created.id, created.ideaRevision, USER);
    expect(ideas.inboxBucket(shelved)).toBe('shelved');
    expect(shelved.shelvedFromCheckpoint).toBe('captured');
    const reopened = ideas.reopen(shelved.id, shelved.ideaRevision, USER);
    expect(reopened.checkpoint).toBe('captured');
    expect(reopened.shelvedFromCheckpoint).toBeUndefined();
  });

  it('restart resets journal to spark', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const saved = ideas.saveJournal(created.id, created.ideaRevision, { journalPhase: 'rewrite' }, USER);
    const restarted = ideas.restart(saved.id, saved.ideaRevision, USER);
    expect(restarted.checkpoint).toBe('captured');
    expect(restarted.journalPhase).toBe('spark');
    expect(restarted.journal?.notes).toEqual([]);
  });

  it('delete removes machine state and docs', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    ideas.delete(created.id, created.ideaRevision, USER);
    expect(ideas.get(created.id)).toBeNull();
    expect(fs.existsSync(path.join(root, 'docs', 'ideas', created.id))).toBe(false);
  });
});

describe('Idea delivery sync', () => {
  it('syncAllIdeaDeliveries marks the Idea completed when every child run finishes', () => {
    const root = swiftFixture();
    readyCofofoFoundation(root);
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'Add a heat alert.' });
    const ready = ideas.saveJournal(created.id, created.ideaRevision, {
      journalPhase: 'ready',
      journal: {
        rewrite: { problem: 'No alert', outcome: 'User sees alert', appetite: 'Small', noGos: '' },
        readyRecipeId: 'cofofo-feature',
        readyEpicTitle: 'Heat alert',
      },
    }, USER);
    const cfg = generatedCofofoWorkspace({ version: '1.0', name: 'x', environment: {} });
    const pipeline = assemblePipeline(cfg, { recipeId: 'cofofo-feature', pipelineId: 'EPIC-201-PIPELINE' });
    ideas.scaffoldFromJournal(ready.id, ready.ideaRevision, [{
      recipeId: 'cofofo-feature',
      epicId: 'EPIC-201',
      epicTitle: 'Heat alert',
      pipeline,
      scaffold: { agents: pipeline.steps.map((s) => (typeof s === 'string' ? s : s.agent)), inputs: {} },
    }], null, USER);

    const run = RunStateStore.load(root, 'EPIC-201')!;
    RunStateStore.save(root, {
      ...run,
      status: 'completed',
      steps: run.steps.map((step) => ({ ...step, status: 'approved' as const })),
    });

    syncAllIdeaDeliveries(root, null);
    expect(ideas.require(created.id).checkpoint).toBe('completed');
  });
});

describe('Idea revision guard', () => {
  it('throws IdeaRevisionConflictError on stale writes', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    expect(() => ideas.saveJournal(created.id, 999, { journalPhase: 'research' }, USER))
      .toThrow(IdeaRevisionConflictError);
  });

  it('repairCorrupted resets to a valid captured checkpoint', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'Broken later.' });
    const stateFile = path.join(root, '.aidlc', 'ideas', created.id, 'state.json');
    fs.writeFileSync(stateFile, '{ not valid json', 'utf8');
    const repaired = ideas.repairCorrupted(created.id, USER);
    expect(repaired.checkpoint).toBe('captured');
    expect(repaired.journalPhase).toBe('spark');
    expect(() => ideas.repairCorrupted(created.id, USER)).toThrow(IdeaStateError);
  });
});
