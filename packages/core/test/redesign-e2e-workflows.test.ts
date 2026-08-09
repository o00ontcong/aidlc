import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AidlcApplication,
  ArtifactPolicyService,
  AutonomyController,
  EpicService,
  FakeModelProvider,
  ModelProviderRegistry,
  ModelSelectionLockStore,
  ProjectIntelligenceService,
  compileWorkflow,
  type ModelDescriptor,
} from '../src';
import { createDefaultAutonomyPolicy } from '../src/contracts';

const FIXTURES = path.join(__dirname, 'fixtures', 'redesign');
const ACTOR = { kind: 'user' as const, id: 'e2e-user' };

function workspace(fixture: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `aidlc-redesign-${fixture}-`));
  fs.cpSync(path.join(FIXTURES, fixture), root, { recursive: true });
  return root;
}

function readyEpic(root: string, id: string, profile: 'quick' | 'parallel') {
  const epics = new EpicService(root, () => '2026-08-09T00:00:00.000Z');
  const epic = epics.create({ id, title: `${profile} fixture`, profile });
  return { epics, epic: epics.transition(epic.id, 'ready', { expectedRevision: epic.revision, actor: ACTOR }) };
}

describe('redesign E2E fixtures', () => {
  it('runs a Quick TypeScript Epic from explicit context refresh through compiled durable run', async () => {
    const root = workspace('quick-ts');
    const app = new AidlcApplication(root);

    // Analysis must remain read-only until the user expressly refreshes context.
    const analysis = await app.bus.dispatch(app.bus.command('analysis', 'project.analyze', ACTOR, { projectId: 'quick-ts', sourceCommit: 'before' }));
    expect(analysis.status).toBe('ok');
    expect(fs.existsSync(path.join(root, '.aidlc', 'project.yaml'))).toBe(false);
    const refresh = await app.bus.dispatch(app.bus.command('refresh', 'project.context.refresh', ACTOR, { projectId: 'quick-ts', sourceCommit: 'before' }));
    expect((refresh.data as { revision: number }).revision).toBe(0);

    const started = await app.bus.dispatch(app.bus.command('start', 'epic.start', ACTOR, {
      id: 'EPIC-QUICK-E2E', title: 'Format a greeting', profile: 'quick',
    }));
    expect(started.status).toBe('ok');
    const draft = app.epics.require('EPIC-QUICK-E2E');
    const ready = app.epics.transition(draft.id, 'ready', { expectedRevision: draft.revision, actor: ACTOR });
    const facts = app.project.loadContext();
    expect(facts).not.toBeNull();
    const compiled = compileWorkflow({
      epic: ready,
      facts: facts!,
      selectedCapabilities: [],
      autonomy: createDefaultAutonomyPolicy(),
      pack: { id: 'builtin', version: '1' },
    });
    expect(compiled.visibleStageIds).toEqual(['understand', 'build', 'verify']);
    expect(compiled.actions.find((action) => action.id === 'implement')?.dependsOn).toEqual(['analyze-project']);

    const run = await app.bus.dispatch(app.bus.command('run', 'epic.run', ACTOR, { epicId: ready.id, workflowHash: compiled.hash }));
    expect(run.status).toBe('ok');
    expect(app.epics.require(ready.id)).toMatchObject({ status: 'running', activeRunId: `${ready.id}--run-001` });
    expect(app.epics.events(ready.id)).toHaveLength(2);
  });

  it('recommends, explicitly accepts, and locks an iOS trading profile', () => {
    const root = workspace('ios-trading');
    const project = new ProjectIntelligenceService(root, () => '2026-08-09T00:00:00.000Z');
    const facts = project.refreshContext('trading-ios', 'ios-a1');
    const proposed = project.propose(facts);

    expect(proposed).toMatchObject({ workflowProfile: 'regulated', status: 'proposed' });
    expect(proposed.roles).toContainEqual(expect.objectContaining({ stageId: 'build', agent: 'senior-ios-developer', skills: ['swift', 'ios'] }));
    expect(proposed.roles).toContainEqual(expect.objectContaining({ stageId: 'verify', agent: 'ios-reviewer' }));
    expect(proposed.roles.find((role) => role.stageId === 'verify')?.skills).toEqual(expect.arrayContaining(['financial-precision', 'trading-invariants']));

    const locked = project.lock(project.accept(proposed));
    expect(locked.recommendation.status).toBe('locked');
    expect(project.loadRecommendationLock()).toEqual(locked);
  });

  it('compiles a Parallel build as an internal subrun while keeping the five-stage timeline', () => {
    const root = workspace('parallel-ts');
    const project = new ProjectIntelligenceService(root, () => '2026-08-09T00:00:00.000Z');
    const facts = project.refreshContext('parallel-ts', 'parallel-a1');
    const { epics, epic } = readyEpic(root, 'EPIC-PARALLEL-E2E', 'parallel');
    const workflow = compileWorkflow({
      epic,
      facts,
      selectedCapabilities: ['ast-graph'],
      autonomy: createDefaultAutonomyPolicy(),
      pack: { id: 'builtin', version: '1' },
    });

    expect(workflow.visibleStageIds).toEqual(['understand', 'plan', 'build', 'verify', 'ship']);
    expect(workflow.actions).toHaveLength(5);
    expect(workflow.actions.find((action) => action.stageId === 'build')).toMatchObject({ id: 'implement', subrun: true });
    const started = epics.startRun(epic.id, { expectedRevision: epic.revision, workflowHash: workflow.hash, stages: workflow.stages, actor: ACTOR });
    expect(started.run.stages.map((stage) => stage.id)).toEqual(workflow.visibleStageIds);
  });

  it('requires an explicit approval for external communication even when unattended', async () => {
    const root = workspace('quick-ts');
    const app = new AidlcApplication(root);
    const command = app.bus.command('external', 'gate.preview', ACTOR, {
      mode: 'unattended' as const,
      subject: {
        mutation: true,
        externalCommunication: 'pull-request' as const,
        destination: 'github.com/acme/quick-ts',
        contentSummary: 'Open the reviewed pull request',
        mutationScope: ['pull-request'],
      },
    });
    const result = await app.bus.dispatch(command);
    const evaluation = result.data as ReturnType<AutonomyController['evaluate']>;

    expect(evaluation).toMatchObject({ gate: 'external_communication', hard: true, requiresApproval: true });
    expect(app.gates.canProceed(evaluation)).toBe(false);
    expect(app.gates.canProceed(evaluation, {
      gate: 'external_communication', outcome: 'approved', preview: evaluation.preview!, decidedBy: ACTOR, decidedAt: '2026-08-09T00:00:00.000Z',
    })).toBe(true);
  });

  it('keeps Project Context unchanged until explicit refresh, then records the next revision', () => {
    const root = workspace('quick-ts');
    const project = new ProjectIntelligenceService(root, () => '2026-08-09T00:00:00.000Z');
    const first = project.refreshContext('quick-ts', 'commit-a');
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'quick-ts-fixture', dependencies: { vitest: '^4.0.0' } }));

    const readOnly = project.analyze('quick-ts', 'commit-b');
    expect(readOnly.revision).toBe(first.revision);
    expect(project.loadContext()).toEqual(first);
    expect(project.contextStatus('commit-b').stale).toBe(true);

    const refreshed = project.refreshContext('quick-ts', 'commit-b');
    expect(refreshed.revision).toBe(first.revision + 1);
    expect(project.loadContext()).toEqual(refreshed);
  });

  it('previews only commit-enabled artifacts and locks a provider-neutral fake model selection', async () => {
    const root = workspace('artifacts');
    const artifacts = new ArtifactPolicyService(root);
    const preview = artifacts.preview(artifacts.load(), ['specification', 'review'], { epic: 'EPIC-ARTIFACT-E2E' }, ['src/index.ts']);
    expect(preview).toEqual({
      artifacts: [expect.objectContaining({ resolvedPath: 'docs/epics/EPIC-ARTIFACT-E2E/SPEC.md', commit: true })],
      codePaths: ['src/index.ts'], configPaths: [],
    });

    const descriptor: ModelDescriptor = {
      provider: 'fake-e2e', modelId: 'fake-review', tiers: ['review'], contextWindowTokens: 128_000,
      supportsTools: true, latencyClass: 'standard', costClass: 'low',
    };
    const provider = new FakeModelProvider('fake-e2e', [descriptor], { modelVersions: { 'fake-review': 'fixture-v1' }, now: () => '2026-08-09T00:00:00.000Z' });
    const registry = new ModelProviderRegistry();
    registry.register(provider, { default: true });
    const selected = await registry.resolve({ tier: 'review', requiresTools: true, capability: 'ast-graph' });
    const locks = new ModelSelectionLockStore(root, () => '2026-08-09T00:01:00.000Z');
    locks.record('verify.review', selected);

    expect(locks.load()?.selections['verify.review']).toMatchObject({ provider: 'fake-e2e', modelId: 'fake-review', modelVersion: 'fixture-v1' });
  });
});
