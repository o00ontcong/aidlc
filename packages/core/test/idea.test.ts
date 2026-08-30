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

/**
 * `prepare()` no longer pre-seeds PROJECT-RULES.json/ARCHITECTURE-MAP.md — a
 * real `define-rules`/`map-system` step run by an agent would write these.
 * These stand in for that, the same way `write()` stands in for any other
 * agent-written artifact in a test with no real agent to call.
 */
function simulateDefineRules(root: string): void {
  const rules = createDefaultRules(detectStack(root), 1, new Date().toISOString());
  write(root, 'docs/project/foundation/PROJECT-RULES.json', JSON.stringify(rules, null, 2));
  write(root, 'docs/project/foundation/PROJECT-RULES.md', renderProjectRules(rules));
  write(root, 'docs/project/foundation/RULE-DRIFT.md', '# Rule Drift\n\n## Findings\n\n- No current violations.\n');
}
function simulateMapSystem(root: string): void {
  write(root, 'docs/project/foundation/ARCHITECTURE-MAP.md', '# Architecture Map\n\n## Layer Map\n\n- (test placeholder)\n');
}

/** Drives a real `cofofo-foundation` run through bootstrap so CofofoFoundationService.inspect() reports `ready`. */
function readyCofofoFoundation(root: string): void {
  const service = new CofofoFoundationService(root);
  service.prepare();
  const foundation = generatedCofofoWorkspace({ version: '1.0', name: 'x', environment: {} }).pipelines.find((p) => p.id === 'cofofo-foundation')!;
  let state = startRun({ runId: 'FOUNDATION-R1', pipeline: foundation, context: {}, workspaceRoot: root });
  state = markStepDone({ state, pipeline: foundation, workspaceRoot: root }); // scan-stack
  simulateDefineRules(root);
  state = markStepDone({ state, pipeline: foundation, workspaceRoot: root }); // define-rules -> Canvas
  state = approveCurrentCanvas(root, state, foundation);
  RunStateStore.save(root, state);
  simulateMapSystem(root);
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
    const question = { id: 'q1', text: 'How fast?', options: [{ id: 'a', label: 'Fast', recommended: true }, { id: 'b', label: 'Slow', recommended: false }], reason: 'x', highImpact: false, dependsOn: [] as string[] };
    const done = ideas.completePrep(prepping.id, prepping.ideaRevision, {
      selfAnswered: [],
      questions: [question, { ...question, id: 'q2', text: 'Which screen?' }, { ...question, id: 'q3', text: 'Which metric?' }],
    }, AGENT);
    expect(done.checkpoint).toBe('awaiting_human');
    expect(() => ideas.decideRest(done.id, done.ideaRevision, AGENT)).toThrow(IdeaStateError);
    const decided = ideas.decideRest(done.id, done.ideaRevision, USER);
    expect(decided.checkpoint).toBe('intent_drafted');
    expect(decided.assumptions).toHaveLength(3);
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

  it('prepends cofofo-bootstrap when Foundation was never captured, regardless of what the routing agent proposed', () => {
    const root = temporary(); // no CoFoFo Foundation exists at all
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'Add a heat alert.' });
    expect(created.foundationHashAtCapture).toBeNull();
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const drafted = ideas.completePrep(prepping.id, prepping.ideaRevision, { selfAnswered: [], questions: [] }, AGENT);
    const proposed = ideas.generateRoute(drafted.id, drafted.ideaRevision, {
      outcome: 'epics',
      steps: [{ recipeId: 'cofofo-feature', epicTitle: 'Heat alert', rationale: 'New behavior.' }],
    }, AGENT);
    expect(proposed.routeDraft?.steps.map((s) => s.recipeId)).toEqual(['cofofo-bootstrap', 'cofofo-feature']);
  });

  it('does not double-prepend bootstrap when the agent already put it first', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'Add a heat alert.' });
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const drafted = ideas.completePrep(prepping.id, prepping.ideaRevision, { selfAnswered: [], questions: [] }, AGENT);
    const proposed = ideas.generateRoute(drafted.id, drafted.ideaRevision, {
      outcome: 'epics',
      steps: [
        { recipeId: 'cofofo-bootstrap', epicTitle: 'Bootstrap', rationale: 'No Foundation yet.' },
        { recipeId: 'cofofo-feature', epicTitle: 'Heat alert', rationale: 'New behavior.' },
      ],
    }, AGENT);
    expect(proposed.routeDraft?.steps.map((s) => s.recipeId)).toEqual(['cofofo-bootstrap', 'cofofo-feature']);
  });

  it('does not prepend bootstrap when the captured Foundation snapshot is still current', () => {
    const root = swiftFixture();
    readyCofofoFoundation(root);
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'Add a heat alert.' });
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const drafted = ideas.completePrep(prepping.id, prepping.ideaRevision, { selfAnswered: [], questions: [] }, AGENT);
    const proposed = ideas.generateRoute(drafted.id, drafted.ideaRevision, {
      outcome: 'epics',
      steps: [{ recipeId: 'cofofo-feature', epicTitle: 'Heat alert', rationale: 'New behavior.' }],
    }, AGENT);
    expect(proposed.routeDraft?.steps.map((s) => s.recipeId)).toEqual(['cofofo-feature']);
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

describe('Idea blocked state', () => {
  it('sets and clears blockedReason without touching checkpoint', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const blocked = ideas.setBlocked(created.id, created.ideaRevision, 'The routing agent could not run.', AGENT);
    expect(blocked.blockedReason).toBe('The routing agent could not run.');
    expect(blocked.checkpoint).toBe(created.checkpoint);
    expect(ideas.inboxBucket(blocked)).toBe('blocked');
    const cleared = ideas.clearBlocked(blocked.id, blocked.ideaRevision, AGENT);
    expect(cleared.blockedReason).toBeUndefined();
  });

  it('clearBlocked is a no-op when nothing is blocked', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const result = ideas.clearBlocked(created.id, created.ideaRevision, AGENT);
    expect(result).toEqual(created);
  });
});

describe('Idea shelve / reopen / restart', () => {
  it('shelve hides it from the default inbox bucket; reopen resumes at the shelved checkpoint', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    expect(() => ideas.shelve(created.id, created.ideaRevision, AGENT)).toThrow(/human user/i);
    const shelved = ideas.shelve(created.id, created.ideaRevision, USER);
    expect(ideas.inboxBucket(shelved)).toBe('shelved');
    expect(shelved.shelvedFromCheckpoint).toBe('captured');
    const reopened = ideas.reopen(shelved.id, shelved.ideaRevision, USER);
    expect(reopened.checkpoint).toBe('captured');
    expect(reopened.shelvedFromCheckpoint).toBeUndefined();
  });

  it('reopen after shelve during awaiting_human resumes the question batch', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const awaiting = ideas.completePrep(prepping.id, prepping.ideaRevision, {
      selfAnswered: [],
      questions: [{
        id: 'q1', text: 'Who?', reason: 'Scope', highImpact: true, dependsOn: [],
        options: [{ id: 'a', label: 'Users', recommended: true }, { id: 'b', label: 'Admins', recommended: false }],
      }],
    }, AGENT);
    expect(awaiting.checkpoint).toBe('awaiting_human');
    const shelved = ideas.shelve(awaiting.id, awaiting.ideaRevision, USER);
    const reopened = ideas.reopen(shelved.id, shelved.ideaRevision, USER);
    expect(reopened.checkpoint).toBe('awaiting_human');
    expect(reopened.prep.questions).toHaveLength(1);
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

describe('Idea delete', () => {
  it('removes both .aidlc/ideas/<id> and docs/ideas/<id>, and is user-only', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    write(root, `docs/ideas/${created.id}/INTENT.md`, '# intent\n');
    expect(() => ideas.delete(created.id, created.ideaRevision, AGENT)).toThrow(/human user/i);
    ideas.delete(created.id, created.ideaRevision, USER);
    expect(ideas.get(created.id)).toBeNull();
    expect(fs.existsSync(path.join(root, 'docs/ideas', created.id))).toBe(false);
  });

  it('refuses a stale-revision delete', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    ideas.patchSeed(created.id, created.ideaRevision, 'edited', USER);
    expect(() => ideas.delete(created.id, created.ideaRevision, USER)).toThrow(IdeaRevisionConflictError);
  });
});

describe('Idea repairCorrupted', () => {
  it('salvages seedSentence/title from a broken state.json, backs it up, and resets to captured', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'Original seed', title: 'Original title' });
    const stateFile = ideas.store.stateFile(created.id);
    fs.writeFileSync(stateFile, JSON.stringify({
      ...JSON.parse(fs.readFileSync(stateFile, 'utf8')),
      checkpoint: 'route_proposed', // missing the routeDraft this checkpoint requires — fails schema validation
    }));
    expect(() => ideas.get(created.id)).toThrow(); // confirms this Idea is actually corrupted before repairing it
    expect(ideas.store.list().map((i) => i.id)).not.toContain(created.id);

    const repaired = ideas.repairCorrupted(created.id, USER);
    expect(repaired.checkpoint).toBe('captured');
    expect(repaired.seedSentence).toBe('Original seed');
    expect(repaired.title).toBe('Original title');
    expect(fs.existsSync(stateFile)).toBe(true);
    const backups = fs.readdirSync(path.dirname(stateFile)).filter((f) => f.includes('.broken-'));
    expect(backups).toHaveLength(1);
    expect(ideas.store.list().map((i) => i.id)).toContain(created.id);
  });

  it('falls back to a placeholder seed when the file is not even valid JSON', () => {
    const root = temporary();
    write(root, '.aidlc/ideas/IDEA-001/state.json', '{ not json at all');
    const ideas = new IdeaService(root);
    const repaired = ideas.repairCorrupted('IDEA-001', USER);
    expect(repaired.checkpoint).toBe('captured');
    expect(repaired.seedSentence.length).toBeGreaterThan(0);
  });

  it('refuses to repair an Idea that already loads successfully, and is user-only', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    expect(() => ideas.repairCorrupted(created.id, USER)).toThrow(/nothing to repair/i);
    write(root, '.aidlc/ideas/IDEA-999/state.json', '{ broken');
    expect(() => ideas.repairCorrupted('IDEA-999', AGENT)).toThrow(/human user/i);
  });
});

describe('Idea agent stop / re-run', () => {
  it('stops a running prep without resetting the Idea and re-runs it with a fresh job id', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const running = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);

    const stopped = ideas.stopPrep(running.id, running.ideaRevision, USER);
    expect(stopped.checkpoint).toBe('preparing');
    expect(stopped.prep.status).toBe('failed');
    expect(stopped.prep.error).toBe('Stopped by user.');

    const rerun = ideas.retryPrep(stopped.id, stopped.ideaRevision, 'job-2', AGENT);
    expect(rerun.prep).toMatchObject({ status: 'running', jobId: 'job-2' });
    expect(ideas.store.readEvents(created.id).map((event) => event.type)).toEqual([
      'created', 'prep_started', 'prep_stopped', 'prep_rerun',
    ]);
  });

  it('stops routing as a resumable state rather than resetting the intake', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const preparing = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const routing = ideas.completePrep(preparing.id, preparing.ideaRevision, { selfAnswered: [], questions: [] }, AGENT);
    const stopped = ideas.stopRoute(routing.id, routing.ideaRevision, USER);

    expect(stopped.checkpoint).toBe('intent_drafted');
    expect(stopped.blockedReason).toBe('Stopped by user.');
  });

  it('lets a person edit submitted answers before routing, preserving only explicit answers', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const running = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const awaiting = ideas.completePrep(running.id, running.ideaRevision, {
      selfAnswered: [],
      questions: [{
        id: 'q1', text: 'Who?', reason: 'Scope', highImpact: true, dependsOn: [],
        options: [{ id: 'a', label: 'Users', recommended: true }, { id: 'b', label: 'Admins', recommended: false }],
      }],
    }, AGENT);
    const routed = ideas.submitBatch(awaiting.id, awaiting.ideaRevision, USER);
    const reopened = ideas.reopenQuestionBatch(routed.id, routed.ideaRevision, USER);

    expect(reopened.checkpoint).toBe('awaiting_human');
    expect(reopened.answers).toEqual({});
    expect(reopened.assumptions).toEqual([]);
  });

  it('allows a seed edit while routing is in progress and resets it to fresh prep', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'old input' });
    const running = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const routing = ideas.completePrep(running.id, running.ideaRevision, { selfAnswered: [], questions: [] }, AGENT);
    const edited = ideas.patchSeed(routing.id, routing.ideaRevision, 'new input', USER);

    expect(edited).toMatchObject({ checkpoint: 'captured', seedSentence: 'new input', blockedReason: undefined });
    expect(edited.prep.status).toBe('idle');
  });
});

describe('Idea to CoFoFo delivery, end to end', () => {
  it('an Idea-originated epic reaches a real, approvable requirement Canvas gate with all four artifacts', () => {
    const root = swiftFixture();
    readyCofofoFoundation(root);
    const ideas = new IdeaService(root);

    const created = ideas.create({ seedSentence: 'Add a heat alert when it gets dangerously hot.' });
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const drafted = ideas.completePrep(prepping.id, prepping.ideaRevision, { selfAnswered: [], questions: [] }, AGENT);
    const proposed = ideas.generateRoute(drafted.id, drafted.ideaRevision, {
      outcome: 'epics',
      steps: [{ recipeId: 'cofofo-feature', epicTitle: 'Heat alert', rationale: 'New behavior, never worked before.' }],
    }, AGENT);
    expect(proposed.routeDraft?.steps.map((s) => s.recipeId)).toEqual(['cofofo-feature']); // Foundation is ready — no bootstrap

    const cfg = generatedCofofoWorkspace({ version: '1.0', name: 'x', environment: {} });
    const pipeline = assemblePipeline(cfg, { recipeId: 'cofofo-feature', pipelineId: 'EPIC-200-PIPELINE' });
    const scaffolded = ideas.confirmRouteAndScaffold(proposed.id, proposed.ideaRevision, [
      { recipeId: 'cofofo-feature', epicId: 'EPIC-200', epicTitle: 'Heat alert', pipeline, scaffold: { agents: pipeline.steps.map((s) => (typeof s === 'string' ? s : s.agent)), inputs: {} } },
    ], null, USER);
    expect(scaffolded.checkpoint).toBe('in_delivery');

    // INTENT.md was snapshotted by scaffold; simulate the requirement-phase
    // agent producing the other three artifacts the widened Canvas bundle needs.
    const artifactsDir = path.join(root, 'docs/epics/EPIC-200/artifacts');
    expect(fs.readFileSync(path.join(artifactsDir, 'INTENT.md'), 'utf8')).toContain('heat alert');
    fs.writeFileSync(path.join(artifactsDir, 'EVIDENCE.md'), '## Findings\n\nNo existing alert type. Source: Domain/WeatherSnapshot.swift.\n', 'utf8');
    fs.writeFileSync(path.join(artifactsDir, 'OPTIONS.md'), '## Options\n\n## Open Decisions\n\n1. Threshold — recommend 38C.\n', 'utf8');
    fs.writeFileSync(path.join(artifactsDir, 'REQUIREMENT.md'), '# Requirement\n\n## Acceptance Criteria\n\n1. Alert shows above 38C.\n', 'utf8');

    let run = RunStateStore.load(root, 'EPIC-200')!;
    run = markStepDone({ state: run, pipeline, workspaceRoot: root }); // requirement -> awaiting_review
    expect(run.steps[0]!.status).toBe('awaiting_review');

    const bundle = buildReviewBundle({
      workspaceRoot: root, runId: run.runId, stepIdx: 0, stepRevision: run.steps[0]!.revision,
      reviewRevision: 1,
      artifacts: ['docs/epics/{epic}/artifacts/INTENT.md', 'docs/epics/{epic}/artifacts/EVIDENCE.md', 'docs/epics/{epic}/artifacts/OPTIONS.md', 'docs/epics/{epic}/artifacts/REQUIREMENT.md'],
      context: run.context,
    });
    expect(bundle.artifacts.map((a) => a.path)).toEqual([
      'docs/epics/EPIC-200/artifacts/INTENT.md',
      'docs/epics/EPIC-200/artifacts/EVIDENCE.md',
      'docs/epics/EPIC-200/artifacts/OPTIONS.md',
      'docs/epics/EPIC-200/artifacts/REQUIREMENT.md',
    ]);

    const approved = applyArtifactReviewVerdict({
      workspaceRoot: root, state: run, pipeline, bundle,
      verdict: { verdict: 'approve', reviewer: 'Reviewer <r@example.test>' },
    });
    expect(approved.steps[0]!.status).toBe('approved');
    expect(approved.currentStepIdx).toBe(1); // advanced to create-plan
  });

  it('syncAllIdeaDeliveries marks the Idea completed when every child run finishes', () => {
    const root = swiftFixture();
    readyCofofoFoundation(root);
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'Add a heat alert.' });
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const drafted = ideas.completePrep(prepping.id, prepping.ideaRevision, { selfAnswered: [], questions: [] }, AGENT);
    const proposed = ideas.generateRoute(drafted.id, drafted.ideaRevision, {
      outcome: 'epics',
      steps: [{ recipeId: 'cofofo-feature', epicTitle: 'Heat alert', rationale: 'New behavior.' }],
    }, AGENT);
    const cfg = generatedCofofoWorkspace({ version: '1.0', name: 'x', environment: {} });
    const pipeline = assemblePipeline(cfg, { recipeId: 'cofofo-feature', pipelineId: 'EPIC-201-PIPELINE' });
    ideas.confirmRouteAndScaffold(proposed.id, proposed.ideaRevision, [
      { recipeId: 'cofofo-feature', epicId: 'EPIC-201', epicTitle: 'Heat alert', pipeline, scaffold: { agents: pipeline.steps.map((s) => (typeof s === 'string' ? s : s.agent)), inputs: {} } },
    ], null, USER);

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

describe('Idea prep question gate', () => {
  it('drops fewer than three low-impact questions and skips straight to intent_drafted', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const drafted = ideas.completePrep(prepping.id, prepping.ideaRevision, {
      selfAnswered: [],
      questions: [
        { id: 'q1', text: 'A?', reason: 'r', highImpact: false, dependsOn: [], options: [{ id: 'a', label: 'A', recommended: true }, { id: 'b', label: 'B', recommended: false }] },
        { id: 'q2', text: 'B?', reason: 'r', highImpact: false, dependsOn: [], options: [{ id: 'a', label: 'A', recommended: true }, { id: 'b', label: 'B', recommended: false }] },
      ],
    }, AGENT);
    expect(drafted.checkpoint).toBe('intent_drafted');
    expect(drafted.prep.questions).toHaveLength(0);
  });
});
