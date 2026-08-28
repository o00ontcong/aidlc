import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { snapshotPipeline, type PipelineConfig } from '@aidlc/core';

import { listEpics, migrateEpicStateFiles, setEpicRunMode } from '../src/v2/epicsList';

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

  it('persists a user mode switch for the generic autonomous master', () => {
    expect(setEpicRunMode(root, doc, epicId, 'autonomous')).toBe(true);
    expect(listEpics(root, doc).find((epic) => epic.id === epicId)?.runMode).toBe('autonomous');
    expect(setEpicRunMode(root, doc, epicId, 'guided')).toBe(true);
    expect(listEpics(root, doc).find((epic) => epic.id === epicId)?.runMode).toBe('guided');
  });

  it('reconciles a newer manually-completed epic mirror into the live run', () => {
    const statePath = path.join(root, 'docs', 'epics', epicId, 'state.json');
    const mirror = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    mirror.currentStep = 3;
    mirror.updatedAt = '2026-01-02T00:00:00Z';
    mirror.stepStates[2] = {
      ...mirror.stepStates[2],
      status: 'done',
      finishedAt: '2026-01-02T00:00:00Z',
    };
    fs.writeFileSync(statePath, JSON.stringify(mirror));

    const epic = listEpics(root, doc).find((entry) => entry.id === epicId);
    const run = JSON.parse(fs.readFileSync(
      path.join(root, '.aidlc', 'runs', `${epicId}.json`),
      'utf8',
    ));

    expect(run.steps[2].status).toBe('approved');
    expect(run.steps[3].status).toBe('awaiting_work');
    expect(run.currentStepIdx).toBe(3);
    expect(epic?.currentStep).toBe(3);
    expect(epic?.stepDetails[3].isCurrentRunStep).toBe(true);
  });

  it('refuses to fabricate approval for a Canvas-gated step', () => {
    // Same newer mirror as the test above, but the pipeline now gates step 2
    // on Canvas review. Inferring approval from a mirror would record an
    // approval no human gave, with no reviewed content bound to it — so the
    // promoted prefix has to stop before the gate.
    const canvasDoc = JSON.parse(JSON.stringify(doc));
    canvasDoc.pipelines[0].steps[2].human_review = true;
    canvasDoc.pipelines[0].steps[2].review = {
      mode: 'canvas',
      artifacts: ['docs/{epic}/TEST-PLAN.md'],
    };

    const statePath = path.join(root, 'docs', 'epics', epicId, 'state.json');
    const mirror = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    mirror.currentStep = 3;
    mirror.updatedAt = '2026-01-02T00:00:00Z';
    mirror.stepStates[2] = {
      ...mirror.stepStates[2],
      status: 'done',
      finishedAt: '2026-01-02T00:00:00Z',
    };
    fs.writeFileSync(statePath, JSON.stringify(mirror));

    listEpics(root, canvasDoc);
    const run = JSON.parse(fs.readFileSync(
      path.join(root, '.aidlc', 'runs', `${epicId}.json`),
      'utf8',
    ));

    expect(run.steps[2].status).toBe('awaiting_work');
    expect(run.steps[2].canvasReview).toBeUndefined();
    expect(run.steps[3].status).toBe('pending');
    expect(run.currentStepIdx).toBe(2);
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
  const epicId = 'EPIC-01';

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolves produces against a non-default state.root, not the docs/epics literal', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-epicslist-epicsdir-'));
    const epicDir = path.join(root, '.aidlc', 'epics', epicId);
    fs.mkdirSync(path.join(epicDir, 'artifacts'), { recursive: true });
    fs.writeFileSync(
      path.join(epicDir, 'artifacts', 'PRD.md'),
      '---\nstatus: approved\n---\n# PRD\n',
    );
    fs.writeFileSync(
      path.join(epicDir, 'state.json'),
      JSON.stringify({
        id: epicId,
        title: 'Plan the epic',
        pipeline: 'aidlc-workflow-full',
        currentStep: 0,
        status: 'done',
        stepStates: [{ agent: 'po', status: 'done' }],
      }),
    );

    fs.mkdirSync(path.join(root, '.aidlc'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.aidlc', 'workspace.yaml'),
      JSON.stringify({
        state: { root: '.aidlc/epics' },
        pipelines: [
          {
            id: 'aidlc-workflow-full',
            steps: [
              {
                agent: 'po',
                name: 'plan',
                produces: ['docs/epics/{epic}/artifacts/PRD.md'],
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
    expect(run.steps[0].artifactsProduced).toEqual(['.aidlc/epics/EPIC-01/artifacts/PRD.md']);
  });
});
