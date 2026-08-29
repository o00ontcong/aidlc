import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {},
  commands: {},
  Uri: {},
}));

import { seedCofofoWeatherDemo } from '../src/v2/demoCofofoWeatherProject';
import { listEpics } from '../src/v2/epicsList';
import { readYaml } from '../src/v2/yamlIO';
import {
  CofofoFoundationService,
  RunStateStore,
  applyArtifactReviewVerdict,
  buildReviewBundle,
  cofofoFoundationIssues,
  markStepDone,
  normalizeStep,
  readEvidenceLedger,
  rerunStep,
  resolveArtifactPath,
  stepDagId,
  type PipelineConfig,
} from '@aidlc/core';

describe('CoFoFo SkyCast demo seed', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cofofo-weather-demo-'));
    seedCofofoWeatherDemo(root, path.resolve('.'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('keeps the demo workspace to the CoFoFo workflow set and materializes every scenario only in run state', () => {
    const doc = readYaml(root)!;
    const ids = doc.pipelines.map((pipeline) => pipeline.id);
    expect(ids).toEqual(['cofofo-foundation', 'cofofo-delivery']);
    const recipes = (doc.recipes as Array<{ id: string; from: string }>);
    expect(recipes.find((recipe) => recipe.id === 'cofofo-feature')?.from).toBe('cofofo-delivery');
    expect(recipes.find((recipe) => recipe.id === 'cofofo-bugfix')?.from).toBe('cofofo-delivery');
    const bugfix = RunStateStore.load(root, 'COFOFO-WEATHER-006-BUGFIX-COMPLETED')!.pipelineSnapshot!.pipeline;
    expect(bugfix.materialized_from_recipe).toBe('cofofo-bugfix');
    expect((bugfix.steps as Array<{ name?: string }>).map((step) => step.name)).toContain('diagnose');
    expect((bugfix.steps as Array<{ review?: unknown; evidence?: unknown }>).some((step) => step.review && step.evidence)).toBe(true);
  });

  it('activates a validated Foundation before delivery runs pin its context', () => {
    const inspection = new CofofoFoundationService(root).inspect();
    expect(inspection.status).toBe('ready');
    expect(inspection.snapshot).toMatchObject({ revision: 2 });

    const doc = readYaml(root)!;
    const epics = listEpics(root, doc);
    const foundation = epics.find((epic) => epic.id === 'COFOFO-WEATHER-FOUNDATION')!;
    expect(foundation.status).toBe('done');
    expect(foundation.stepDetails.every((step) => step.runStatus === 'approved')).toBe(true);

    const current = RunStateStore.load(root, 'COFOFO-WEATHER-001-GATE')!;
    expect(current.cofofoFoundation).toMatchObject({
      revision: 2,
      manifestPath: 'docs/project/foundation/CONTEXT-MANIFEST.json',
      manifestHash: inspection.snapshot?.manifestHash,
    });

    const stale = RunStateStore.load(root, 'COFOFO-WEATHER-009-STALE-REBASE')!;
    expect(stale.cofofoFoundation?.revision).toBe(1);
    const feature = stale.pipelineSnapshot!.pipeline as PipelineConfig;
    expect(cofofoFoundationIssues({ state: stale, pipeline: feature, workspaceRoot: root }))
      .toContain('foundation revision changed from 1 to 2');
  });

  it('remains ready after a byte-identical clone assigns fresh mtimes', () => {
    const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cofofo-weather-clone-'));
    try {
      fs.cpSync(root, clone, { recursive: true });
      const manifest = new CofofoFoundationService(clone).inspect().manifest!;
      const future = new Date(Date.now() + 60_000);
      for (const artifact of manifest.artifacts) {
        fs.utimesSync(path.join(clone, artifact.path), future, future);
      }
      expect(new CofofoFoundationService(clone).inspect().status).toBe('ready');
    } finally {
      fs.rmSync(clone, { recursive: true, force: true });
    }
  });

  it('passes the same Foundation auto-review validators shipped with the demo', async () => {
    for (const name of ['stack-profile', 'project-rules', 'installed-assets', 'context-manifest']) {
      const module = await import(pathToFileURL(path.join(root, `.aidlc/validators/${name}.mjs`)).href);
      await expect(module.default({ workspaceRoot: root })).resolves.toMatchObject({ decision: 'pass' });
    }
  });

  it('shows completed feature and bugfix runs with every produced artifact', () => {
    const epics = listEpics(root, readYaml(root));
    const feature = epics.find((epic) => epic.id === 'COFOFO-WEATHER-005-COMPLETED')!;
    const bugfix = epics.find((epic) => epic.id === 'COFOFO-WEATHER-006-BUGFIX-COMPLETED')!;

    expect(feature.recipeId).toBe('cofofo-feature');
    expect(bugfix.recipeId).toBe('cofofo-bugfix');
    expect(feature.status).toBe('done');
    expect(feature.stepDetails.every((step) => step.status === 'done' && step.runStatus === 'approved')).toBe(true);
    expect(feature.existingArtifacts).toContain('VERIFY.md');
    expect(feature.stepDetails.some((step) => step.reviewMode === 'canvas' && step.reviewArtifacts?.length)).toBe(true);

    expect(bugfix.status).toBe('done');
    expect(bugfix.pipeline).toBe('COFOFO-WEATHER-006-BUGFIX-COMPLETED-PIPELINE');
    expect(bugfix.stepDetails.map((step) => step.name)).toContain('diagnose');
    expect(bugfix.stepDetails.every((step) => step.status === 'done')).toBe(true);
    expect(bugfix.existingArtifacts).toContain('ROOT-CAUSE.md');
    expect(bugfix.stepDetails.some((step) => step.rejectCount > 0)).toBe(true);
    expect(readEvidenceLedger(root, 'COFOFO-WEATHER-006-BUGFIX-COMPLETED').map((record) => record.stage)).toEqual([
      'red', 'green', 'refactor', 'verify',
    ]);
  });

  it('seeds diagnosis, waiver, stale-foundation and improvement recovery states', () => {
    const epics = listEpics(root, readYaml(root));
    const diagnosis = epics.find((epic) => epic.id === 'COFOFO-WEATHER-007-PROD-DIAGNOSIS')!;
    const waiver = epics.find((epic) => epic.id === 'COFOFO-WEATHER-008-RED-WAIVER')!;
    const stale = epics.find((epic) => epic.id === 'COFOFO-WEATHER-009-STALE-REBASE')!;
    const improvement = epics.find((epic) => epic.id === 'COFOFO-WEATHER-010-RULE-IMPROVEMENT')!;

    const diagnoseStep = diagnosis.stepDetails.find((step) => step.name === 'diagnose');
    expect(diagnoseStep).toMatchObject({
      name: 'diagnose',
      runStatus: 'awaiting_review',
      reviewMode: 'canvas',
      artifact: 'ROOT-CAUSE.md',
    });
    const waiverStep = waiver.stepDetails.find((step) => step.name === 'reproduce');
    expect(waiverStep).toMatchObject({ name: 'reproduce', runStatus: 'awaiting_review' });
    expect(readEvidenceLedger(root, waiver.id)[0]).toMatchObject({
      stage: 'red-waiver',
      accepted: true,
      waiver: { reviewer: 'On-call Reviewer' },
    });
    expect(stale.status).toBe('failed');
    const staleStep = stale.stepDetails.find((step) => step.name === 'implement');
    expect(staleStep?.feedback).toMatch(/Foundation revision changed/i);
    const improvementStep = improvement.stepDetails.find((step) => step.isCurrentRunStep);
    expect(improvementStep).toMatchObject({
      name: 'test',
      runStatus: 'awaiting_review',
      reviewMode: 'canvas',
    });
    expect(improvementStep?.artifacts).toEqual(expect.arrayContaining(['VERIFY.md', 'TEST-REPORT.md', 'REVIEW.md']));
  });

  // Asserting a seeded *state* is not the same as asserting the demo is
  // walkable. Both demo dead-ends found in review passed every state
  // assertion above while offering a human no legal move at all, so this
  // exercises the actual transition each scenario invites.
  it('offers a legal next move for every scenario a human is invited to act on', () => {
    for (const state of RunStateStore.list(root)) {
      const pipeline = state.pipelineSnapshot!.pipeline;
      const idx = state.currentStepIdx;
      const step = state.steps[idx]!;
      const norm = normalizeStep(pipeline.steps[idx]!);
      const where = `${state.runId} · ${norm.name ?? norm.agent} · ${step.status}`;

      // Every phase the run has already reached must have its inputs on disk.
      // A `requires` entry that no step `produces` — BUG-REPORT.md arrives from
      // the "Report a problem" action — is invisible to produces-driven seeding
      // and strands the phase the moment anyone reruns it.
      for (let reached = 0; reached <= idx; reached += 1) {
        for (const template of normalizeStep(pipeline.steps[reached]!).requires) {
          const rel = resolveArtifactPath(template, state.context);
          expect(fs.existsSync(path.join(root, rel)),
            `${state.runId} · ${stepDagId(pipeline.steps[reached]!)} requires missing ${rel}`).toBe(true);
        }
      }

      if (step.status === 'awaiting_review' && norm.review) {
        const bundle = buildReviewBundle({
          workspaceRoot: root,
          runId: state.runId,
          stepIdx: idx,
          stepRevision: step.revision,
          reviewRevision: 1,
          artifacts: norm.review.artifacts,
          context: state.context,
        });
        expect(() => applyArtifactReviewVerdict({
          workspaceRoot: root, state, pipeline, stepIdx: idx, bundle,
          verdict: { verdict: 'approve', reviewer: 'Demo Reviewer' },
        }), `${where} cannot be approved`).not.toThrow();
      }

      if (step.status === 'rejected') {
        // The stale-Foundation scenario is *meant* to refuse a rerun until the
        // run is rebased; every other rejection must be reworkable in place.
        const rerun = rerunStep({ state, stepIdx: idx });
        const blocked = cofofoFoundationIssues({ state, pipeline, workspaceRoot: root }).length > 0;
        if (!blocked) {
          expect(() => markStepDone({ state: rerun, pipeline, workspaceRoot: root, stepIdx: idx }),
            `${where} cannot be reworked`).not.toThrow();
        }
      }
    }
  });
});
