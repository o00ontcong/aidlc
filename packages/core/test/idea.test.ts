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
  type Idea,
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
const NOW = '2026-08-01T00:00:00.000Z';

/** Walks a fresh Idea through Understand → Research → Explore with just enough
 * data to satisfy each stage's Definition of Done, landing at "decide". */
function advanceToDecide(ideas: IdeaService, id: string, revision: number): Idea {
  let idea = ideas.updateUnderstand(id, revision, {
    problem: 'No alert when temperature spikes.',
    context: 'Weather app used by field workers.',
    users: ['Field worker checking conditions before a shift'],
  }, USER);
  idea = ideas.advanceStage(id, idea.ideaRevision, USER);
  idea = ideas.updateResearch(id, idea.ideaRevision, {
    findings: [
      { id: 'f1', text: 'No push API exists today.', type: 'inference', sourceIds: [], createdBy: 'user', createdAt: NOW },
      { id: 'f2', text: 'Users say they check the app manually.', type: 'assumption', sourceIds: [], createdBy: 'user', createdAt: NOW },
    ],
    existingSolutions: [{ id: 'e1', text: 'WeatherKit ships an alerts API.', createdBy: 'user', createdAt: NOW }],
  }, USER);
  idea = ideas.advanceStage(id, idea.ideaRevision, USER);
  idea = ideas.updateExplore(id, idea.ideaRevision, {
    options: [
      { id: 'o1', title: 'Push notification', description: 'Native push above 38C.', pros: ['Fast'], cons: ['Needs permission'], risks: [], tradeoffs: [] },
      { id: 'o2', title: 'In-app banner', description: 'Banner on next open.', pros: ['No permission needed'], cons: ['Easy to miss'], risks: [], tradeoffs: [] },
    ],
    validations: ['Ask 3 field workers which they would notice fastest.'],
  }, USER);
  idea = ideas.advanceStage(id, idea.ideaRevision, USER);
  return idea;
}

describe('Idea capture — never blocked by Foundation', () => {
  it('captures with a null Foundation snapshot before any CoFoFo Foundation exists', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const idea = ideas.create({ seedSentence: 'The list never refreshes.' });
    expect(idea.checkpoint).toBe('captured');
    expect(idea.foundationHashAtCapture).toBeNull();
    expect(idea.title).toBe('The list never refreshes.');
  });

  it('starts at the Understand stage with RESEARCH.md on disk', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const idea = ideas.create({ seedSentence: 'List feels stuck.' });
    expect(idea.stage).toBe('understand');
    expect(idea.understand).toEqual({ problem: '', context: '', users: [], assumptions: [], unknowns: [] });
    const researchDoc = path.join(root, 'docs', 'ideas', idea.id, 'RESEARCH.md');
    expect(fs.existsSync(researchDoc)).toBe(true);
    expect(fs.readFileSync(researchDoc, 'utf8')).toContain('List feels stuck.');
  });
});

describe('Idea research workflow', () => {
  it('updates Understand fields and advances to Research', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'Heat alert when temp > 38C.' });
    const saved = ideas.updateUnderstand(created.id, created.ideaRevision, {
      problem: 'No alert exists.', context: 'Weather app.', users: ['Field worker'],
    }, USER);
    expect(saved.understand.problem).toBe('No alert exists.');
    expect(ideas.inboxBucket(saved)).toBe('awaiting_you');
    const advanced = ideas.advanceStage(created.id, saved.ideaRevision, USER);
    expect(advanced.stage).toBe('research');
  });

  it('adds a research finding, never inferring it as a verified fact', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const updated = ideas.updateResearch(created.id, created.ideaRevision, {
      findings: [{ id: 'f1', text: 'Found existing WeatherSnapshot type.', type: 'inference', sourceIds: [], createdBy: 'user', createdAt: NOW }],
    }, USER);
    expect(updated.research.findings).toHaveLength(1);
    expect(updated.research.findings[0]?.type).toBe('inference');
  });

  it('requires the Decide fields before markReady', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const atDecide = advanceToDecide(ideas, created.id, created.ideaRevision);
    expect(atDecide.stage).toBe('decide');
    expect(() => ideas.markReady(created.id, atDecide.ideaRevision, 'cofofo-feature', 'Heat alert', USER))
      .toThrow(/Decide is not complete/);
  });

  it('scaffolds from a ready Idea', () => {
    const root = swiftFixture();
    readyCofofoFoundation(root);
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'Add heat alert.' });
    let idea = advanceToDecide(ideas, created.id, created.ideaRevision);
    idea = ideas.updateDecision(created.id, idea.ideaRevision, {
      status: 'go',
      recommendation: 'Ship the push alert.',
      finalIdea: 'Push alert when temperature exceeds 38C.',
      nextStep: 'Design the push copy.',
    }, USER);
    const ready = ideas.markReady(created.id, idea.ideaRevision, 'cofofo-feature', 'Heat alert', USER);
    expect(ready.stage).toBe('ready');

    const cfg = generatedCofofoWorkspace({ version: '1.0', name: 'x', environment: {} });
    const pipeline = assemblePipeline(cfg, { recipeId: 'cofofo-feature', pipelineId: 'EPIC-201-PIPELINE' });
    const scaffolded = ideas.scaffoldFromIdea(ready.id, ready.ideaRevision, [{
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

  it('projects a pending (unaccepted) AI proposal into RESEARCH.md', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const { idea } = ideas.importAgentProposal(
      created.id, created.ideaRevision, 'understand',
      '### set_context\nAn independent trader building this for personal use.',
      USER,
    );
    expect(idea.pendingActions).toHaveLength(1);
    const researchDoc = fs.readFileSync(path.join(root, 'docs', 'ideas', created.id, 'RESEARCH.md'), 'utf8');
    expect(researchDoc).toContain('## Pending AI proposals');
    expect(researchDoc).toContain('Set context: An independent trader building this for personal use.');
    // Not yet accepted, so it must not have landed in `understand` itself.
    expect(idea.understand.context).toBe('');
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

  it('restart resets the stage back to Understand', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const updated = ideas.updateUnderstand(created.id, created.ideaRevision, { problem: 'x', context: 'y', users: ['a'] }, USER);
    const restarted = ideas.restart(updated.id, updated.ideaRevision, USER);
    expect(restarted.checkpoint).toBe('captured');
    expect(restarted.stage).toBe('understand');
    expect(restarted.understand.problem).toBe('');
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
    let idea = advanceToDecide(ideas, created.id, created.ideaRevision);
    idea = ideas.updateDecision(created.id, idea.ideaRevision, {
      status: 'go', recommendation: 'Ship it.', finalIdea: 'Push alert above 38C.', nextStep: 'Design copy.',
    }, USER);
    const ready = ideas.markReady(created.id, idea.ideaRevision, 'cofofo-feature', 'Heat alert', USER);

    const cfg = generatedCofofoWorkspace({ version: '1.0', name: 'x', environment: {} });
    const pipeline = assemblePipeline(cfg, { recipeId: 'cofofo-feature', pipelineId: 'EPIC-201-PIPELINE' });
    ideas.scaffoldFromIdea(ready.id, ready.ideaRevision, [{
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
    expect(() => ideas.updateUnderstand(created.id, 999, { problem: 'x' }, USER))
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
    expect(repaired.stage).toBe('understand');
    expect(() => ideas.repairCorrupted(created.id, USER)).toThrow(IdeaStateError);
  });
});
