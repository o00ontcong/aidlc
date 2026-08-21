import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { snapshotPipeline, type PipelineConfig } from '@aidlc/core';

import { listEpics, migrateEpicStateFiles, setEpicRunMode } from '../src/v2/epicsList';

describe('migrateEpicStateFiles pipeline reconciliation', () => {
  let root: string;
  const epicId = 'EPIC-MIGRATE';

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('adds every missing legacy phase dynamically, preserves old records, and is idempotent', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-epic-migrate-'));
    const oldPipeline = {
      id: 'feature-implement',
      name: 'Old Implement',
      steps: [
        { name: 'implement', agent: 'cohesive-agent' },
      ],
    } as PipelineConfig;
    const currentPipeline = {
      ...oldPipeline,
      name: 'Current Implement',
      steps: [
        oldPipeline.steps[0],
        { name: 'resolve-bugs', agent: 'cohesive-agent', depends_on: ['implement'] },
        { name: 'ship', agent: 'cohesive-agent', depends_on: ['resolve-bugs'] },
      ],
    } as PipelineConfig;
    fs.mkdirSync(path.join(root, '.aidlc', 'runs'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs', 'epics', epicId), { recursive: true });
    fs.writeFileSync(path.join(root, '.aidlc', 'workspace.yaml'), JSON.stringify({
      state: { root: 'docs/epics' },
      pipelines: [currentPipeline],
    }));
    fs.writeFileSync(path.join(root, 'docs', 'epics', epicId, 'state.json'), JSON.stringify({
      id: epicId,
      title: 'Migrate me',
      pipeline: 'feature-implement',
      currentStep: 0,
      status: 'done',
      stepStates: [
        { agent: 'cohesive-agent', status: 'done' },
      ],
    }));
    fs.writeFileSync(path.join(root, '.aidlc', 'runs', `${epicId}.json`), JSON.stringify({
      schemaVersion: 1,
      runId: epicId,
      pipelineId: 'feature-implement',
      pipelineSnapshot: snapshotPipeline(oldPipeline, '2026-08-01T00:00:00.000Z'),
      context: { epic: epicId },
      startedAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      currentStepIdx: 0,
      status: 'completed',
      steps: [
        {
          stepIdx: 0,
          agent: 'cohesive-agent',
          revision: 4,
          status: 'approved',
          artifactsProduced: ['IMPLEMENTATION-SUMMARY.md'],
          feedback: 'preserve me',
        },
      ],
    }));

    const first = migrateEpicStateFiles(root);
    expect(first.addedSteps).toEqual([{ epicId, stepIds: ['resolve-bugs', 'ship'] }]);
    const run = JSON.parse(fs.readFileSync(path.join(root, '.aidlc', 'runs', `${epicId}.json`), 'utf8'));
    expect(run.steps).toHaveLength(3);
    expect(run.steps[0]).toMatchObject({ revision: 4, feedback: 'preserve me', status: 'approved' });
    expect(run.steps[1]).toMatchObject({ isNew: true, status: 'awaiting_work' });
    expect(run.steps[2]).toMatchObject({ isNew: true, status: 'pending' });

    const epic = listEpics(root).find((item) => item.id === epicId)!;
    expect(epic.stepDetails.map((step) => step.isNew)).toEqual([false, true, true]);
    expect(epic.stepDetails[1].status).toBe('pending');
    expect(epic.stepDetails[1].runStatus).toBe('awaiting_work');

    const repeated = migrateEpicStateFiles(root);
    expect(repeated.migrated).toEqual([]);
    expect(repeated.addedSteps).toEqual([]);
    expect(repeated.reopenedSteps).toEqual([]);
  });

  it('reopens approved implement when FEATURE-SURFACES graphs are missing', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-epic-graph-migrate-'));
    const pipeline = {
      id: 'feature-implement',
      steps: [
        {
          name: 'implement',
          agent: 'cohesive-agent',
          produces: [
            'docs/epics/{epic}/artifacts/IMPLEMENTATION-SUMMARY.md',
            'docs/epics/{epic}/artifacts/FEATURE-SURFACES.json',
            'docs/epics/{epic}/artifacts/FEATURE-SURFACES.mmd',
          ],
        },
        { name: 'resolve-bugs', agent: 'cohesive-agent', depends_on: ['implement'] },
      ],
    } as PipelineConfig;
    fs.mkdirSync(path.join(root, '.aidlc', 'runs'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs', 'epics', epicId, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'epics', epicId, 'artifacts', 'IMPLEMENTATION-SUMMARY.md'), '# done\n');
    fs.writeFileSync(path.join(root, '.aidlc', 'workspace.yaml'), JSON.stringify({
      state: { root: 'docs/epics' },
      pipelines: [pipeline],
    }));
    fs.writeFileSync(path.join(root, 'docs', 'epics', epicId, 'state.json'), JSON.stringify({
      id: epicId, title: 'Graphs', pipeline: 'feature-implement', currentStep: 1, status: 'in_progress',
      stepStates: [{ agent: 'cohesive-agent', status: 'done' }, { agent: 'cohesive-agent', status: 'in_progress' }],
    }));
    fs.writeFileSync(path.join(root, '.aidlc', 'runs', `${epicId}.json`), JSON.stringify({
      schemaVersion: 1,
      runId: epicId,
      pipelineId: 'feature-implement',
      pipelineSnapshot: snapshotPipeline(pipeline, '2026-08-01T00:00:00.000Z'),
      context: { epic: epicId },
      startedAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      currentStepIdx: 1,
      status: 'running',
      steps: [
        { stepIdx: 0, agent: 'cohesive-agent', revision: 1, status: 'approved', artifactsProduced: ['IMPLEMENTATION-SUMMARY.md'] },
        { stepIdx: 1, agent: 'cohesive-agent', revision: 1, status: 'awaiting_work', artifactsProduced: [] },
      ],
    }));

    const report = migrateEpicStateFiles(root);
    expect(report.reopenedSteps).toEqual([{ epicId, stepIds: ['implement'] }]);
    const run = JSON.parse(fs.readFileSync(path.join(root, '.aidlc', 'runs', `${epicId}.json`), 'utf8'));
    expect(run.steps[0]).toMatchObject({ status: 'awaiting_work', isNew: true });
    expect(run.steps[1].status).toBe('awaiting_work');
    expect(run.currentStepIdx).toBe(1);
  });
});

/**
 * Regression coverage for issue #57: a step showed "IN PROGRESS" with no
 * "Mark step done" affordance because the run-state overlay was keyed by
 * agent id. When one persona (e.g. `qa`) owns several pipeline steps, the
 * last-writer-wins map collapsed them, so a mid-pipeline `awaiting_work`
 * step inherited a trailing step's `pending` status and lost its button.
 * The overlay is now keyed by step index.
 */
describe('listEpics run-state overlay with a multi-step agent', () => {
  let root: string;
  const epicId = 'EPIC-1';

  const doc = {
    state: { root: 'docs/epics' },
    slash_commands: [{ name: '/pl-test-plan' }],
    pipelines: [
      {
        id: 'pl',
        steps: [
          { agent: 'po', name: 'plan' },
          { agent: 'arch', name: 'design' },
          { agent: 'qa', name: 'test-plan', produces: ['docs/{epic}/TEST-PLAN.md'] },
          { agent: 'qa', name: 'generate-test-cases' },
          { agent: 'qa', name: 'execute-test' },
        ],
      },
    ],
  } as unknown as Parameters<typeof listEpics>[1];

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-epicslist-'));
    const epicDir = path.join(root, 'docs', 'epics', epicId);
    fs.mkdirSync(epicDir, { recursive: true });
    fs.mkdirSync(path.join(root, '.aidlc', 'runs'), { recursive: true });

    fs.writeFileSync(
      path.join(epicDir, 'state.json'),
      JSON.stringify({
        id: epicId,
        title: 'Test',
        pipeline: 'pl',
        currentStep: 2,
        status: 'in_progress',
        stepStates: [
          { agent: 'po', status: 'done' },
          { agent: 'arch', status: 'done' },
          { agent: 'qa', status: 'in_progress' },
          { agent: 'qa', status: 'pending' },
          { agent: 'qa', status: 'pending' },
        ],
      }),
    );

    const mkStep = (stepIdx: number, agent: string, status: string) => ({
      stepIdx,
      agent,
      revision: 1,
      status,
      artifactsProduced: [],
    });
    fs.writeFileSync(
      path.join(root, '.aidlc', 'runs', `${epicId}.json`),
      JSON.stringify({
        schemaVersion: 1,
        runId: epicId,
        pipelineId: 'pl',
        context: { epic: epicId },
        startedAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        currentStepIdx: 2,
        status: 'running',
        steps: [
          mkStep(0, 'po', 'approved'),
          mkStep(1, 'arch', 'approved'),
          mkStep(2, 'qa', 'awaiting_work'),
          mkStep(3, 'qa', 'pending'),
          mkStep(4, 'qa', 'pending'),
        ],
      }),
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves each repeated-agent step independently by index', () => {
    const epic = listEpics(root, doc).find((e) => e.id === epicId);
    expect(epic).toBeDefined();
    const steps = epic!.stepDetails;

    // The genuinely-active qa step keeps its actionable status (drives the
    // "Mark step done" button) instead of inheriting a trailing qa step.
    expect(steps[2].agent).toBe('qa');
    expect(steps[2].runStatus).toBe('awaiting_work');
    expect(steps[2].isCurrentRunStep).toBe(true);

    // Later qa steps stay pending and are not flagged current.
    expect(steps[3].runStatus).toBe('pending');
    expect(steps[4].runStatus).toBe('pending');
    expect(steps[3].isCurrentRunStep).toBe(false);
    expect(steps[4].isCurrentRunStep).toBe(false);

    // Earlier single-agent steps are unaffected.
    expect(steps[0].runStatus).toBe('approved');
    expect(steps[1].runStatus).toBe('approved');
  });

  it('reports guided mode until a durable legacy delivery checkpoint exists', () => {
    expect(listEpics(root, doc).find((epic) => epic.id === epicId)?.runMode).toBe('guided');

    const deliveryDir = path.join(root, '.aidlc', 'deliveries', epicId);
    fs.mkdirSync(deliveryDir, { recursive: true });
    fs.writeFileSync(path.join(deliveryDir, 'state.json'), JSON.stringify({
      schemaVersion: 1,
      id: epicId,
      status: 'feature-contract',
      workerRunIds: [],
    }));

    expect(listEpics(root, doc).find((epic) => epic.id === epicId)?.runMode).toBe('autonomous');
  });

  it('persists a user mode switch for the generic autonomous master', () => {
    expect(setEpicRunMode(root, doc, epicId, 'autonomous')).toBe(true);
    expect(listEpics(root, doc).find((epic) => epic.id === epicId)?.runMode).toBe('autonomous');
    expect(setEpicRunMode(root, doc, epicId, 'guided')).toBe(true);
    expect(listEpics(root, doc).find((epic) => epic.id === epicId)?.runMode).toBe('guided');
  });
});

/**
 * Coverage for the artifacts-only fallback: a folder with no `state.json`
 * (no pipeline binding) is no longer silently skipped — it's synthesized into
 * an epic straight from the `.md` files in its `artifacts/` folder, mirroring
 * cf-aidlc-dashboard's `pipelineId: 'artifacts'` behavior.
 */
describe('listEpics artifacts-only fallback (no state.json)', () => {
  let root: string;

  const write = (rel: string, body: string) => {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-epicslist-artifacts-'));
    // An epic folder with artifacts but NO state.json, in lifecycle-shuffled order.
    write('docs/epics/LOOSE-1/artifacts/TECH-DESIGN.md', '---\nstatus: draft\n---\n# Design\n');
    write('docs/epics/LOOSE-1/artifacts/PRD.md', '---\nstatus: approved\n---\n# PRD\n');
    write('docs/epics/LOOSE-1/artifacts/.annotation-history.json', '{}');
    // A folder with neither state.json nor artifacts — must stay skipped.
    fs.mkdirSync(path.join(root, 'docs', 'epics', 'EMPTY'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('synthesizes an epic from artifact .md files, ordered by lifecycle', () => {
    const epics = listEpics(root, { state: { root: 'docs/epics' } } as unknown as Parameters<typeof listEpics>[1]);

    // The empty folder is skipped; only the artifacts-bearing one appears.
    expect(epics.map((e) => e.id)).toEqual(['LOOSE-1']);

    const epic = epics[0];
    expect(epic.artifactsOnly).toBe(true);
    expect(epic.pipeline).toBeNull();
    expect(epic.statePath).toBe('');

    // PRD sorts before TECH-DESIGN (lifecycle), dotfiles are excluded.
    expect(epic.stepDetails.map((s) => s.artifact)).toEqual(['PRD.md', 'TECH-DESIGN.md']);

    // Status is read from each artifact's own frontmatter.
    expect(epic.stepDetails[0].status).toBe('done');       // approved
    expect(epic.stepDetails[1].status).toBe('in_progress'); // draft
    expect(epic.status).toBe('in_progress');
  });
});

/**
 * project-context writes canonical files under docs/project/context/, not
 * docs/epics/<id>/artifacts/. The Epic card must still treat those produces:
 * paths as existing so the Artifact chip is clickable.
 */
describe('listEpics indexes produces: outside epic artifacts/', () => {
  let root: string;
  const epicId = 'PROJECT-CONTEXT-001';

  const doc = {
    state: { root: 'docs/epics' },
    slash_commands: [{ name: '/project-context-scan-project' }],
    pipelines: [
      {
        id: 'project-context',
        steps: [
          {
            agent: 'aidlc-project-context-agent',
            name: 'scan-project',
            produces: ['docs/project/context/PROJECT-SCAN.md'],
          },
          {
            agent: 'aidlc-project-context-agent',
            name: 'model-project',
            produces: [
              'docs/project/context/PROJECT-CONTEXT.md',
              'docs/project/context/ARCHITECTURE-MAP.md',
            ],
          },
        ],
      },
    ],
  } as unknown as Parameters<typeof listEpics>[1];

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-epicslist-pc-'));
    const epicDir = path.join(root, 'docs', 'epics', epicId);
    fs.mkdirSync(path.join(epicDir, 'artifacts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs', 'project', 'context'), { recursive: true });
    fs.writeFileSync(
      path.join(epicDir, 'state.json'),
      JSON.stringify({
        id: epicId,
        title: 'Init context',
        pipeline: 'project-context',
        currentStep: 0,
        status: 'in_progress',
        stepStates: [
          { agent: 'aidlc-project-context-agent', status: 'in_progress' },
          { agent: 'aidlc-project-context-agent', status: 'pending' },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(root, 'docs', 'project', 'context', 'PROJECT-SCAN.md'),
      '# Scan\n',
    );
    fs.writeFileSync(
      path.join(root, 'docs', 'project', 'context', 'PROJECT-CONTEXT.md'),
      '# Context\n',
    );
    fs.writeFileSync(
      path.join(root, 'docs', 'project', 'context', 'ARCHITECTURE-MAP.md'),
      '# Architecture\n',
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('lists PROJECT-SCAN.md as existing with the canonical absolute path', () => {
    const epic = listEpics(root, doc).find((e) => e.id === epicId);
    expect(epic).toBeDefined();
    expect(epic!.stepDetails[0].artifact).toBe('PROJECT-SCAN.md');
    expect(epic!.stepDetails[0].artifactExists).toBe(true);
    expect(epic!.existingArtifacts).toContain('PROJECT-SCAN.md');
    expect(epic!.artifactPaths['PROJECT-SCAN.md']).toBe(
      path.join(root, 'docs', 'project', 'context', 'PROJECT-SCAN.md'),
    );
    expect(epic!.stepDetails[1].artifacts).toEqual([
      'PROJECT-CONTEXT.md',
      'ARCHITECTURE-MAP.md',
    ]);
    expect(epic!.existingArtifacts).toContain('PROJECT-CONTEXT.md');
    expect(epic!.existingArtifacts).toContain('ARCHITECTURE-MAP.md');
    expect(epic!.artifactPaths['ARCHITECTURE-MAP.md']).toBe(
      path.join(root, 'docs', 'project', 'context', 'ARCHITECTURE-MAP.md'),
    );
  });

  it('normalizes completed aliases written by an autonomous master', () => {
    const epicDir = path.join(root, 'docs', 'epics', epicId);
    fs.writeFileSync(
      path.join(epicDir, 'state.json'),
      JSON.stringify({
        id: epicId,
        title: 'Init context',
        pipeline: 'project-context',
        currentStep: 1,
        status: 'completed',
        stepStates: [
          {
            agent: 'aidlc-project-context-agent',
            status: 'completed',
            artifactsProduced: ['docs/project/context/PROJECT-SCAN.md'],
          },
          {
            agent: 'aidlc-project-context-agent',
            status: 'completed',
            artifactsProduced: [
              'docs/project/context/PROJECT-CONTEXT.md',
              'docs/project/context/ARCHITECTURE-MAP.md',
            ],
          },
        ],
      }),
    );
    fs.mkdirSync(path.join(root, '.aidlc', 'runs'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.aidlc', 'runs', `${epicId}.json`),
      JSON.stringify({
        schemaVersion: 1,
        runId: epicId,
        pipelineId: 'project-context',
        context: { epic: epicId },
        startedAt: '2026-08-13T00:00:00.000Z',
        updatedAt: '2026-08-13T01:00:00.000Z',
        currentStepIdx: 1,
        status: 'completed',
        steps: [
          { stepIdx: 0, agent: 'aidlc-project-context-agent', revision: 1, status: 'completed', artifactsProduced: ['docs/project/context/PROJECT-SCAN.md'] },
          { stepIdx: 1, agent: 'aidlc-project-context-agent', revision: 1, status: 'completed', artifactsProduced: ['docs/project/context/PROJECT-CONTEXT.md', 'docs/project/context/ARCHITECTURE-MAP.md'] },
        ],
      }),
    );

    const epic = listEpics(root, doc).find((entry) => entry.id === epicId);
    expect(epic?.status).toBe('done');
    expect(epic?.stepStatuses).toEqual(['done', 'done']);
    expect(epic?.stepDetails.map((step) => step.runStatus)).toEqual(['approved', 'approved']);
    expect(epic?.stepDetails[1].artifacts).toEqual([
      'PROJECT-CONTEXT.md',
      'ARCHITECTURE-MAP.md',
    ]);
  });
});

/**
 * Built-in pipeline steps bake the conventional `docs/epics/{epic}/artifacts/...`
 * prefix into `produces:` (see core's presets/builtinWorkflows.ts). A project
 * can point its active epics directory elsewhere via the
 * `aidlc.workspace.epicsDirectory` setting (`state.root` in workspace.yaml) —
 * when it does, legacy-migration backfill must resolve `produces` against
 * that *active* directory, not the literal baked into the step, or a
 * genuinely-produced artifact gets recorded as missing. This is the bug
 * behind a real-world repro: an epic scaffolded under a non-default
 * `state.root` whose `package-mission` step nonetheless reported its
 * MISSION.md as absent because the step's `produces:` still said
 * `docs/epics/...`.
 */
describe('legacy migration backfill follows the active epics directory', () => {
  let root: string;
  const epicId = 'SPIKE-01';

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves produces against a non-default state.root, not the docs/epics literal', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-epicslist-epicsdir-'));
    const epicDir = path.join(root, '.aidlc', 'epics', epicId);
    fs.mkdirSync(path.join(epicDir, 'artifacts'), { recursive: true });
    fs.writeFileSync(
      path.join(epicDir, 'artifacts', 'MISSION.md'),
      '---\nstatus: approved\n---\n# Mission\n',
    );
    fs.writeFileSync(
      path.join(epicDir, 'state.json'),
      JSON.stringify({
        id: epicId,
        title: 'Spike',
        pipeline: 'feature-spike',
        currentStep: 0,
        status: 'done',
        stepStates: [{ agent: 'spike', status: 'done' }],
      }),
    );

    fs.mkdirSync(path.join(root, '.aidlc'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.aidlc', 'workspace.yaml'),
      JSON.stringify({
        state: { root: '.aidlc/epics' },
        pipelines: [
          {
            id: 'feature-spike',
            steps: [
              {
                agent: 'spike',
                name: 'package-mission',
                produces: ['docs/epics/{epic}/artifacts/MISSION.md'],
              },
            ],
          },
        ],
      }),
    );

    const report = migrateEpicStateFiles(root);
    expect(report.backfilled).toEqual([epicId]);

    const run = JSON.parse(fs.readFileSync(path.join(root, '.aidlc', 'runs', `${epicId}.json`), 'utf8'));
    expect(run.steps[0].status).toBe('approved');
    expect(run.steps[0].artifactsProduced).toEqual(['.aidlc/epics/SPIKE-01/artifacts/MISSION.md']);
  });
});
