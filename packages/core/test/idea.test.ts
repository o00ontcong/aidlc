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
  generatedCofofoWorkspace,
  markStepDone,
  startRun,
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

/** Drives a real `cofofo-foundation` run through bootstrap so CofofoFoundationService.inspect() reports `ready`. */
function readyCofofoFoundation(root: string): void {
  const service = new CofofoFoundationService(root);
  service.prepare();
  const foundation = generatedCofofoWorkspace({ version: '1.0', name: 'x', environment: {} }).pipelines.find((p) => p.id === 'cofofo-foundation')!;
  let state = startRun({ runId: 'FOUNDATION-R1', pipeline: foundation, context: {}, workspaceRoot: root });
  state = markStepDone({ state, pipeline: foundation, workspaceRoot: root }); // scan-stack
  state = markStepDone({ state, pipeline: foundation, workspaceRoot: root }); // define-rules -> Canvas
  state = approveCurrentCanvas(root, state, foundation);
  RunStateStore.save(root, state);
  state = markStepDone({ state, pipeline: foundation, workspaceRoot: root }); // map-system
  state = markStepDone({ state, pipeline: foundation, workspaceRoot: root }); // select-ecc-catalog -> Canvas
  state = approveCurrentCanvas(root, state, foundation);
  RunStateStore.save(root, state);
  service.install('FOUNDATION-R1');
  state = markStepDone({ state, pipeline: foundation, workspaceRoot: root }); // install-ecc-assets
  RunStateStore.save(root, state);
  service.publish('FOUNDATION-R1');
  state = markStepDone({ state, pipeline: foundation, workspaceRoot: root }); // publish-context -> Canvas
  state = approveCurrentCanvas(root, state, foundation);
  RunStateStore.save(root, state);
  service.activate('FOUNDATION-R1');
}

const USER = { kind: 'user' as const, id: 'owner' };
const AGENT = { kind: 'agent' as const, id: 'idea-prep-agent' };

describe('Idea capture — never blocked by Foundation', () => {
  it('captures with a null Foundation snapshot before any CoFoFo Foundation exists', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const idea = ideas.create({ seedSentence: 'The list never refreshes.' });
    expect(idea.checkpoint).toBe('captured');
    expect(idea.foundationHashAtCapture).toBeNull();
    expect(idea.title).toBe('The list never refreshes.');
  });

  it('binds the real Foundation snapshot once one is ready', () => {
    const root = swiftFixture();
    readyCofofoFoundation(root);
    const ideas = new IdeaService(root);
    const idea = ideas.create({ seedSentence: 'Add offline mode.' });
    expect(idea.foundationHashAtCapture?.revision).toBe(1);
  });
});

describe('Idea question loop', () => {
  it('skips straight to intent_drafted when zero questions survive filtering', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'Fix the typo in the footer.' });
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const done = ideas.completePrep(prepping.id, prepping.ideaRevision, {
      selfAnswered: [{ question: 'Which footer?', answer: 'The marketing site footer.', source: 'src/Footer.tsx', flagged: false }],
      questions: [],
    }, AGENT);
    expect(done.checkpoint).toBe('intent_drafted');
    expect(fs.existsSync(path.join(root, 'docs/ideas', done.id, 'INTENT.md'))).toBe(true);
  });

  it('opens a batch when questions survive, and resume finds the same unanswered question', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'The list never refreshes.' });
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const done = ideas.completePrep(prepping.id, prepping.ideaRevision, {
      selfAnswered: [],
      questions: [
        { id: 'q1', text: 'What changes for the user?', options: [{ id: 'a', label: 'Instant refresh', recommended: true }, { id: 'b', label: 'A notification', recommended: false }], reason: 'You said it feels stuck.', highImpact: true, dependsOn: [] },
        { id: 'q2', text: 'What is off-limits?', options: [{ id: 'a', label: 'No schema change', recommended: true }, { id: 'b', label: 'Anything goes', recommended: false }], reason: 'Appetite is small.', highImpact: false, dependsOn: [] },
        { id: 'q3', text: 'What proves it is done?', options: [{ id: 'a', label: 'A test under 1s', recommended: true }, { id: 'b', label: 'Nobody complains', recommended: false }], reason: 'create-plan needs a RED test.', highImpact: true, dependsOn: [] },
      ],
    }, AGENT);
    expect(done.checkpoint).toBe('awaiting_human');

    // Answer one, then simulate closing the tab and reopening (fresh load from disk).
    const answered = ideas.saveAnswer(done.id, done.ideaRevision, 'q1', 'a', USER);
    const reopened = ideas.require(done.id);
    expect(reopened.answers).toEqual({ q1: 'a' });
    expect(reopened.checkpoint).toBe('awaiting_human');
    expect(answered.ideaRevision).toBe(reopened.ideaRevision);
  });

  it('turns an unanswered eligible question into a labeled assumption on submit', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'Speed up search.' });
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const done = ideas.completePrep(prepping.id, prepping.ideaRevision, {
      selfAnswered: [],
      questions: [
        { id: 'q1', text: 'How fast is fast enough?', options: [{ id: 'a', label: 'Under 200ms', recommended: true }, { id: 'b', label: 'Under 1s', recommended: false }], reason: 'x', highImpact: true, dependsOn: [] },
      ],
    }, AGENT);
    const submitted = ideas.submitBatch(done.id, done.ideaRevision, USER);
    expect(submitted.checkpoint).toBe('intent_drafted');
    expect(submitted.assumptions).toHaveLength(1);
    expect(submitted.assumptions[0]!.label).toContain('Under 200ms');
    expect(submitted.assumptions[0]!.label).toContain('chưa trả lời');
  });

  it('"Bạn quyết hết" is user-only and converts every remaining question into an assumption', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'Speed up search.' });
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const done = ideas.completePrep(prepping.id, prepping.ideaRevision, {
      selfAnswered: [],
      questions: [{ id: 'q1', text: 'How fast?', options: [{ id: 'a', label: 'Fast', recommended: true }, { id: 'b', label: 'Slow', recommended: false }], reason: 'x', highImpact: false, dependsOn: [] }],
    }, AGENT);
    expect(() => ideas.decideRest(done.id, done.ideaRevision, AGENT)).toThrow(IdeaStateError);
    const decided = ideas.decideRest(done.id, done.ideaRevision, USER);
    expect(decided.checkpoint).toBe('intent_drafted');
    expect(decided.assumptions).toHaveLength(1);
  });

  it('F02 — flags a self-answer as wrong without changing checkpoint', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const done = ideas.completePrep(prepping.id, prepping.ideaRevision, {
      selfAnswered: [{ question: 'Which nav library?', answer: 'react-navigation', source: 'ARCHITECTURE-MAP.md', flagged: false }],
      questions: [{ id: 'q1', text: 'y', options: [{ id: 'a', label: 'y', recommended: true }, { id: 'b', label: 'z', recommended: false }], reason: 'z', highImpact: true, dependsOn: [] }],
    }, AGENT);
    const flagged = ideas.flagSelfAnswer(done.id, done.ideaRevision, 0, USER);
    expect(flagged.prep.selfAnswered[0]!.flagged).toBe(true);
    expect(flagged.checkpoint).toBe('awaiting_human');
  });
});

describe('Idea routing and close', () => {
  it('closes with EVIDENCE.md and no epic when the answer was just a question', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'Should we switch navigation libraries?' });
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const drafted = ideas.completePrep(prepping.id, prepping.ideaRevision, { selfAnswered: [], questions: [] }, AGENT);
    expect(drafted.checkpoint).toBe('intent_drafted');
    const closed = ideas.generateRoute(drafted.id, drafted.ideaRevision, {
      outcome: 'close', steps: [], evidence: '## Findings\n\nCurrent library already supports the needed transition; no migration required.',
    }, AGENT);
    expect(closed.checkpoint).toBe('closed');
    expect(closed.routeConfirmed).toBe(false); // never asked — the flow bypasses confirm entirely
    expect(fs.readFileSync(path.join(root, 'docs/ideas', closed.id, 'EVIDENCE.md'), 'utf8')).toContain('Findings');
  });

  it('route_proposed requires a confirm before anything scaffolds, and confirm is user-only', () => {
    const root = swiftFixture();
    readyCofofoFoundation(root);
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'Add a heat alert.' });
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const drafted = ideas.completePrep(prepping.id, prepping.ideaRevision, { selfAnswered: [], questions: [] }, AGENT);
    const proposed = ideas.generateRoute(drafted.id, drafted.ideaRevision, {
      outcome: 'epics',
      steps: [{ recipeId: 'cofofo-feature', epicTitle: 'Heat alert', rationale: 'New behavior, never worked before.' }],
    }, AGENT);
    expect(proposed.checkpoint).toBe('route_proposed');
    expect(proposed.routeConfirmed).toBe(false);
    expect(fs.existsSync(path.join(root, 'docs/ideas', proposed.id, 'ROUTE.md'))).toBe(true);

    const cfg = generatedCofofoWorkspace({ version: '1.0', name: 'x', environment: {} });
    const pipeline = assemblePipeline(cfg, { recipeId: 'cofofo-feature', pipelineId: 'EPIC-101-PIPELINE' });
    expect(() => ideas.confirmRouteAndScaffold(proposed.id, proposed.ideaRevision, [
      { recipeId: 'cofofo-feature', epicId: 'EPIC-101', epicTitle: 'Heat alert', pipeline, scaffold: { agents: pipeline.steps.map((s) => (typeof s === 'string' ? s : s.agent)), inputs: {} } },
    ], null, AGENT)).toThrow(/human user/i);

    const scaffolded = ideas.confirmRouteAndScaffold(proposed.id, proposed.ideaRevision, [
      { recipeId: 'cofofo-feature', epicId: 'EPIC-101', epicTitle: 'Heat alert', pipeline, scaffold: { agents: pipeline.steps.map((s) => (typeof s === 'string' ? s : s.agent)), inputs: {} } },
    ], null, USER);
    expect(scaffolded.checkpoint).toBe('in_delivery');
    expect(scaffolded.children).toEqual([{ epicId: 'EPIC-101', recipeId: 'cofofo-feature', runStatus: 'running' }]);
    expect(scaffolded.inDelivery?.epicId).toBe('EPIC-101');
    expect(fs.readFileSync(path.join(root, 'docs/epics/EPIC-101/artifacts/INTENT.md'), 'utf8')).toContain('IDEA-');
    const inputs = JSON.parse(fs.readFileSync(path.join(root, 'docs/epics/EPIC-101/inputs.json'), 'utf8'));
    expect(inputs.source_idea.id).toBe(created.id);

    // Simulate a crash between the confirm write and the final checkpoint
    // advance: routeConfirmed already persisted, epic already scaffolded on
    // disk, but checkpoint never made it to in_delivery. Re-entry must find
    // the existing epic (verified via its inputs.json provenance) rather
    // than erroring or re-scaffolding over it.
    ideas.store.save({ ...scaffolded, checkpoint: 'route_proposed', ideaRevision: scaffolded.ideaRevision + 1 }, scaffolded.ideaRevision);
    const recovered = ideas.confirmRouteAndScaffold(scaffolded.id, scaffolded.ideaRevision + 1, [
      { recipeId: 'cofofo-feature', epicId: 'EPIC-101', epicTitle: 'Heat alert', pipeline, scaffold: { agents: [], inputs: {} } },
    ], null, USER);
    expect(recovered.checkpoint).toBe('in_delivery');
    // The verify-only branch doesn't re-read live RunState, only that the
    // epic on disk is this Idea's own scaffold — runStatus is a best-effort
    // display value, not re-derived on recovery.
    expect(recovered.children.map((c) => ({ epicId: c.epicId, recipeId: c.recipeId }))).toEqual(
      scaffolded.children.map((c) => ({ epicId: c.epicId, recipeId: c.recipeId })),
    );
  });
});

describe('Idea shelve / reopen / restart', () => {
  it('shelve hides it from the default inbox bucket; reopen resumes at captured', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    expect(() => ideas.shelve(created.id, created.ideaRevision, AGENT)).toThrow(/human user/i);
    const shelved = ideas.shelve(created.id, created.ideaRevision, USER);
    expect(ideas.inboxBucket(shelved)).toBe('shelved');
    const reopened = ideas.reopen(shelved.id, shelved.ideaRevision, USER);
    expect(reopened.checkpoint).toBe('captured');
  });

  it('restart bumps revision and clears prep/answers/route while events.ndjson keeps every prior attempt', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const restarted = ideas.restart(prepping.id, prepping.ideaRevision, USER);
    expect(restarted.checkpoint).toBe('captured');
    expect(restarted.prep.status).toBe('idle');
    const events = ideas.store.readEvents(created.id);
    expect(events.map((e) => e.type)).toEqual(['created', 'prep_started', 'restarted']);
  });

  it('refuses a stale-revision call with IdeaRevisionConflictError', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    ideas.patchSeed(created.id, created.ideaRevision, 'edited', USER);
    expect(() => ideas.patchSeed(created.id, created.ideaRevision, 'stale write', USER)).toThrow(IdeaRevisionConflictError);
  });
});
