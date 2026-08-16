import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BUILTIN_WORKFLOWS,
  DeliveryOrchestrator,
  DeliveryStateStore,
  ensureAutonomousEpicMasterCommand,
  ensureAutonomousMasterCommand,
  RunStateStore,
  builtinTemplatesRoot,
  loadBuiltinPreset,
  recordHumanCharterEdit,
  runExecLoop,
  startRun,
  validateWorkspace,
  writeDeliveryReviewBundle,
  type DeliveryState,
  type PipelineConfig,
} from '../src';

const roots: string[] = [];
const temp = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-autonomous-'));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  RunStateStore.resetBackend();
});

function deliveryState(id = 'FEATURE-1'): DeliveryState {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id,
    profile: {
      id: 'existing-project-autonomous',
      projectContextMode: 'infer-or-refresh',
      reviewStrategy: 'aggregate',
      maxParallelWorkers: 3,
      openFeaturePullRequest: true,
      mergePolicy: 'human-only',
    },
    request: { id, title: 'Feature', description: 'A sufficiently detailed feature request for testing.' },
    status: 'pending',
    workerRunIds: [],
    completedStages: [],
    reviewRevision: 1,
    reviewTasks: [],
    events: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe('Existing Project Autonomous Delivery contracts', () => {
  it('auto-approves ordinary human-review gates but waits for bug-fix approval', () => {
    const root = temp();
    ensureAutonomousEpicMasterCommand(root);
    ensureAutonomousMasterCommand(root);

    const epicMaster = fs.readFileSync(
      path.join(root, '.claude', 'commands', 'aidlc-autonomous-epic.md'),
      'utf8',
    );
    const deliveryMaster = fs.readFileSync(
      path.join(root, '.claude', 'commands', 'aidlc-autonomous-delivery.md'),
      'utf8',
    );
    for (const command of [epicMaster, deliveryMaster]) {
      expect(command).toMatch(/autonomous approval|automatically approved/i);
      expect(command).toContain('resolve-bugs');
      expect(command).toMatch(/resolve-bugs[\s\S]*explicitly approve|explicitly approves[\s\S]*resolve-bugs/i);
      expect(command).toMatch(/question[\s\S]*human answer|human answer[\s\S]*question/i);
      expect(command).not.toContain('Stop at every configured human-review or merge gate');
    }
  });

  it('ships an opt-in project-level profile with cohesive-delivery only', () => {
    const cohesive = BUILTIN_WORKFLOWS.find((workflow) => workflow.id === 'cohesive-delivery')!;
    const preset = loadBuiltinPreset(builtinTemplatesRoot(), cohesive);
    const config = validateWorkspace({ name: 'test', ...preset.workspace }, 'workspace.yaml');
    expect(config.cohesive_delivery?.execution_profiles['existing-project-autonomous']).toEqual({
      project_context: 'infer-or-refresh',
      review_strategy: 'aggregate',
      open_feature_pr: true,
      merge: 'human-only',
    });
    const legacy = loadBuiltinPreset(builtinTemplatesRoot(), BUILTIN_WORKFLOWS[0]!);
    expect(legacy.workspace.cohesive_delivery).toBeUndefined();
  });

  it('persists delivery state atomically and renders a durable review bundle', () => {
    const root = temp();
    const state = deliveryState();
    state.featureRunId = state.id;
    DeliveryStateStore.save(root, state);
    expect(DeliveryStateStore.load(root, state.id)?.request.title).toBe('Feature');
    expect(DeliveryStateStore.list(root).map((item) => item.id)).toEqual([state.id]);
    const file = writeDeliveryReviewBundle(root, state);
    expect(file).toContain(path.join('.aidlc', 'deliveries', state.id, 'review'));
    expect(fs.existsSync(path.join(root, 'docs', 'epics', state.id))).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toContain('# Human Review: FEATURE-1');
    expect(fs.existsSync(path.join(path.dirname(file), 'HUMAN-REVIEW-TASKS.json'))).toBe(true);
  });

  it('treats creating an existing delivery as an idempotent resume', () => {
    const root = temp();
    const existing = deliveryState('PROJECT-CONTEXT');
    existing.status = 'blocked';
    existing.lastError = 'Interrupted before completion.';
    DeliveryStateStore.save(root, existing);

    const result = new DeliveryOrchestrator(root).create({
      id: existing.id,
      title: 'Replacement title',
      description: 'A different sufficiently detailed request must not overwrite existing delivery state.',
    });

    expect(result.status).toBe('blocked');
    expect(result.request.title).toBe('Feature');
    expect(result.lastError).toBe('Interrupted before completion.');
    expect(DeliveryStateStore.list(root)).toHaveLength(1);
  });

  it('defers per-step human review to the aggregate bundle without claiming human approval', async () => {
    const root = temp();
    fs.mkdirSync(path.join(root, '.aidlc', 'skills'), { recursive: true });
    fs.mkdirSync(path.join(root, '.aidlc', 'runners'), { recursive: true });
    fs.writeFileSync(path.join(root, '.aidlc', 'skills', 'work.md'), '# Work\n');
    fs.writeFileSync(path.join(root, '.aidlc', 'runners', 'write.js'), [
      "const fs = require('fs');",
      "const path = require('path');",
      "module.exports = async (ctx) => { fs.writeFileSync(path.join(ctx.workspaceRoot, 'out.txt'), 'ok\\n'); return { success: true, output: 'ok' }; };",
    ].join('\n'));
    fs.writeFileSync(path.join(root, '.aidlc', 'workspace.yaml'), [
      'version: "1.0"',
      'name: test',
      'skills:',
      '  - id: work',
      '    path: ./.aidlc/skills/work.md',
      'agents:',
      '  - id: worker',
      '    name: Worker',
      '    skills: [work]',
      '    runner: custom',
      '    runner_path: ./.aidlc/runners/write.js',
      'pipelines:',
      '  - id: one',
      '    steps:',
      '      - name: work',
      '        agent: worker',
      '        produces: [out.txt]',
      '        human_review: true',
    ].join('\n'));
    const pipeline: PipelineConfig = {
      id: 'one', on_failure: 'stop', steps: [{
        name: 'work', agent: 'worker', enabled: true, produces: ['out.txt'],
        produces_contains: [], skills: ['work'], requires: [], depends_on: [],
        auto_review: false, human_review: true,
      }],
    };
    RunStateStore.save(root, startRun({ runId: 'RUN-1', pipeline, context: {} }));
    const outcome = await runExecLoop(root, 'RUN-1', { aggregateReview: true, reviewBundleRevision: 2 });
    expect(outcome.kind).toBe('completed');
    const step = RunStateStore.load(root, 'RUN-1')!.steps[0]!;
    expect(step.reviewDisposition).toBe('deferred-to-aggregate');
    expect(step.reviewBundleRevision).toBe(2);
    expect(step.history?.some((entry) => entry.kind === 'aggregate_defer')).toBe(true);
    expect(step.history?.some((entry) => entry.kind === 'approve')).toBe(false);
  });

  it('records human edits to inferred context, confirms assumptions, and refreshes rule projections', () => {
    const root = temp();
    const charterDir = path.join(root, 'docs/project/charter');
    fs.mkdirSync(charterDir, { recursive: true });
    for (const name of ['NORTH-STAR.md', 'ARCHITECTURE-PRINCIPLES.md', 'TECH-POLICY.md']) {
      fs.writeFileSync(path.join(charterDir, name), `# ${name}\nHuman edited baseline.\n`);
    }
    fs.mkdirSync(path.join(root, 'docs/project/conventions'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/project/conventions/CONVENTIONS.md'), '# Conventions\n- Keep tests close.\n');
    fs.writeFileSync(path.join(charterDir, 'CHARTER.json'), JSON.stringify({
      revision: 4,
      hash: 'sha256:' + '0'.repeat(64),
      status: 'provisional',
      origin: 'existing-project-inference',
      goals: [{ id: 'G-1', title: 'Goal', metric: 'Metric', status: 'active', confirmation: 'pending' }],
      nonGoals: [],
      invariants: [{ id: 'INV-1', rule: 'Rule', scope: ['src/**'], severity: 'advisory', confirmation: 'pending' }],
      techRules: [{ id: 'T-1', kind: 'must-use', value: 'pnpm', reason: 'repo policy', confirmation: 'pending' }],
      protectedPaths: [],
      deliveryBudget: { maxFilesPerPackage: 12, maxTasksPerPackage: 6 },
      requiredQualityGates: ['test'],
      shipPolicy: {
        requirePullRequest: true,
        forbidAgentMergeToDefaultBranch: true,
        defaultBranch: 'main',
        allowAiAssistReview: true,
      },
    }, null, 2));

    const result = recordHumanCharterEdit(root, { confirmAll: true });
    expect(result.revision).toBe(5);
    expect(result.status).toBe('confirmed');
    expect(result.confirmedIds).toEqual(['G-1', 'INV-1', 'T-1']);
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain('revision 5');
  });

  it('orchestrates context, feature, dynamic worker, aggregate rework, and post-merge sync', async () => {
    const root = temp();
    fs.mkdirSync(path.join(root, '.aidlc/skills'), { recursive: true });
    fs.mkdirSync(path.join(root, '.aidlc/runners'), { recursive: true });
    fs.writeFileSync(path.join(root, '.aidlc/skills/fake.md'), '# Deterministic delivery fixture\n');
    fs.writeFileSync(path.join(root, '.aidlc/runners/delivery.js'), `
const fs = require('fs');
const path = require('path');
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
module.exports = async (ctx) => {
  const pairs = Object.fromEntries(ctx.args.join(' ').split(/\\s+/).map(v => v.split('=')));
  const runId = pairs.epic;
  const state = JSON.parse(fs.readFileSync(path.join(ctx.workspaceRoot, '.aidlc/runs', runId + '.json'), 'utf8'));
  const idx = state.currentStepIdx;
  const epic = id => path.join(ctx.workspaceRoot, 'docs/epics', id, 'artifacts');
  if (state.pipelineId === 'project-context') {
    if (!fs.existsSync(path.join(ctx.workspaceRoot, '.claude-auth-ok'))) {
      return { success: false, output: 'Not logged in · Please run /login api_key=delivery-secret-token' };
    }
    write(path.join(ctx.workspaceRoot, 'docs/project/context/CONTEXT-MANIFEST.json'), JSON.stringify({ revision: 1, sourceCommit: 'fixture', files: [] }, null, 2));
  } else if (state.pipelineId === 'cohesive-work-package') {
    write(path.join(epic(runId), 'PACKAGE-RESULT.json'), JSON.stringify({ status: 'done', commits: ['fixture'], tests: ['pass'], changedFiles: ['src/fixture.ts'] }, null, 2));
  } else if (state.pipelineId === 'feature-implement') {
    if (idx === 0) {
      write(path.join(epic(runId), 'IMPLEMENTATION-SUMMARY.md'), '# Implemented\\n');
    } else if (idx === 1) {
      write(path.join(epic(runId), 'BUG-FIX-LOG.md'), '## Reported Bugs\\nnone\\n**Status:** READY-FOR-APPROVAL\\n');
    } else {
      write(path.join(epic(runId), 'PR-LINK.md'), '**URL:** https://example.invalid/pr/1\\n**Head:** feature/' + runId + '\\n**Base:** main\\n**Status:** merged\\n');
      write(path.join(epic(runId), 'PROJECT-UPDATE.md'), '## Project Knowledge Changes\\nFixture synced.\\n## Final Feature Status\\nDone.\\n');
    }
  } else if (idx === 0) {
    write(path.join(epic(runId), 'WORK-PACKAGES.json'), JSON.stringify({ feature: runId, packages: [{ id: 'WP-01', runId: runId + '-WP-01', dependsOn: [] }] }, null, 2));
  } else if (idx === 1) {
    write(path.join(epic(runId), 'PACKAGE-RESULTS.md'), '# Package Results\\nWP-01 done\\n');
  } else if (idx === 2) {
    write(path.join(epic(runId), 'PR-LINK.md'), '**URL:** https://example.invalid/pr/1\\n**Head:** feature/' + runId + '\\n**Base:** main\\n**Status:** open\\n');
  } else if (idx === 3) {
    write(path.join(epic(runId), 'PR-LINK.md'), '**URL:** https://example.invalid/pr/1\\n**Head:** feature/' + runId + '\\n**Base:** main\\n**Status:** merged\\n');
  } else if (idx === 4) {
    write(path.join(epic(runId), 'PROJECT-UPDATE.md'), '## Project Knowledge Changes\\nFixture synced.\\n## Final Feature Status\\nDone.\\n');
  }
  return { success: true, output: state.pipelineId + ':' + idx };
};
`);
    fs.writeFileSync(path.join(root, '.aidlc/workspace.yaml'), `
version: "1.0"
name: fixture
state:
  entity: epic
  root: docs/epics
skills:
  - id: fake
    path: ./.aidlc/skills/fake.md
agents:
  - id: fixture-agent
    name: Fixture
    skills: [fake]
    runner: custom
    runner_path: ./.aidlc/runners/delivery.js
pipelines:
  - id: project-context
    steps:
      - name: establish-baseline
        agent: fixture-agent
        produces: [docs/project/context/CONTEXT-MANIFEST.json]
        human_review: true
  - id: feature-implement
    steps:
      - name: implement
        agent: fixture-agent
        produces: ["docs/epics/{epic}/artifacts/IMPLEMENTATION-SUMMARY.md"]
        human_review: true
      - name: resolve-bugs
        agent: fixture-agent
        produces: ["docs/epics/{epic}/artifacts/BUG-FIX-LOG.md"]
        human_review: true
      - name: ship
        agent: fixture-agent
        produces: ["docs/epics/{epic}/artifacts/PR-LINK.md"]
        human_review: false
cohesive_delivery:
  execution_profiles:
    existing-project-autonomous:
      project_context: infer-or-refresh
      review_strategy: aggregate
      max_parallel_workers: 2
      open_feature_pr: true
      merge: human-only
`);

    const orchestrator = new DeliveryOrchestrator(root);
    orchestrator.create({
      id: 'FEATURE-1',
      title: 'Fixture feature',
      description: 'Deliver a deterministic fixture feature through every orchestration stage.',
    });
    await expect(orchestrator.run('FEATURE-1')).rejects.toThrow(/claude \/login/);
    const blocked = DeliveryStateStore.load(root, 'FEATURE-1')!;
    expect(blocked).toMatchObject({
      status: 'blocked',
      lastFailure: {
        runId: 'FEATURE-1-PROJECT-CONTEXT',
        code: 'runner.authentication_required',
        stepIdx: 0,
        resumeCommand: 'aidlc cohesive resume FEATURE-1',
      },
    });
    expect(RunStateStore.load(root, 'FEATURE-1-PROJECT-CONTEXT')).toMatchObject({
      status: 'running', currentStepIdx: 0, steps: [{ status: 'awaiting_work', revision: 1 }],
    });
    const failureLog = fs.readFileSync(path.join(root, blocked.lastFailure!.logPath), 'utf8');
    expect(failureLog).toContain('Not logged in');
    expect(failureLog).toContain('[REDACTED]');
    expect(failureLog).not.toContain('delivery-secret-token');

    fs.writeFileSync(path.join(root, '.claude-auth-ok'), 'fixed\n');
    let state = await orchestrator.run('FEATURE-1');
    expect(state.status).toBe('awaiting-aggregate-review');
    expect(state.lastFailure).toBeUndefined();
    expect(state.failureHistory).toHaveLength(1);
    expect(state.events.some((entry) => entry.kind === 'execution-recovered')).toBe(true);
    expect(RunStateStore.load(root, 'FEATURE-1-PROJECT-CONTEXT')?.failureHistory).toHaveLength(1);
    expect(state.workerRunIds).toEqual([]);
    expect(fs.readFileSync(path.join(root, 'docs/epics/FEATURE-1/artifacts/HUMAN-REVIEW-SUMMARY.md'), 'utf8'))
      .toContain('GO FOR HUMAN REVIEW');

    orchestrator.addTask('FEATURE-1', {
      title: 'Adjust implementation fixture',
      target: { runId: 'FEATURE-1', step: 'implement' },
    });
    orchestrator.addTask('FEATURE-1', {
      title: 'Document the same implementation adjustment',
      target: { runId: 'FEATURE-1', step: 'implement' },
    });
    state = await orchestrator.rework('FEATURE-1');
    expect(state.reviewRevision).toBe(2);
    expect(state.reviewTasks.every((task) => task.status === 'done')).toBe(true);

    state = await orchestrator.resumeAfterMerge('FEATURE-1');
    expect(state.status).toBe('completed');
    expect(fs.existsSync(path.join(root, 'docs/epics/FEATURE-1/artifacts/FINAL-DELIVERY-SUMMARY.md'))).toBe(true);
  });
});

describe('cohesive validator hardening', () => {
  it('uses segment-aware glob matching and scopes approved variances to cited paths', async () => {
    const root = temp();
    const libFile = path.join(__dirname, '..', 'templates', 'cohesive', 'validators', 'lib.mjs');
    const lib = await import(pathToFileURL(libFile).href + `?t=${Date.now()}`);
    expect(lib.matchesScope('src/a.ts', 'src/*.ts')).toBe(true);
    expect(lib.matchesScope('src/private/secret.json', 'src/*.ts')).toBe(false);
    expect(lib.matchesScope('src/private/a.ts', 'src/**')).toBe(true);

    const dir = path.join(root, 'docs', 'epics', 'FEATURE-1', 'artifacts', 'variance-requests');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'VR-001.md'), [
      '# Variance',
      '**Status:** APPROVED',
      'Allowed path: `src/allowed/**`',
      'Rejected discussion only: `src/protected/**`',
    ].join('\n'));
    expect(lib.approvedVarianceCoversPath(root, 'FEATURE-1', 'src/allowed/a.ts')).toBe(true);
    expect(lib.approvedVarianceCoversPath(root, 'FEATURE-1', 'src/protected/secret.ts')).toBe(false);
  });
});
