import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CohesiveDeliveryUpgradeService,
  LEGACY_FEATURE_PHASES,
  LEGACY_PROJECT_CONTEXT_PHASES,
  reconcileRunStateToPipeline,
  reopenApprovedStepsMissingProduces,
  snapshotPipeline,
  type PipelineConfig,
  type RunState,
} from '../src';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function v22Workspace(): { root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cohesive-upgrade-'));
  roots.push(root);
  const workspace = {
    version: '1.0',
    agents: [],
    skills: [],
    slash_commands: [
      { name: '/project-context-define-charter', agent: 'aidlc-project-context-agent' },
      { name: '/cohesive-feature-implement', agent: 'aidlc-cohesive-feature-agent' },
      { name: '/cohesive-feature-open-pr', agent: 'aidlc-cohesive-feature-agent' },
    ],
    pipelines: [
      {
        id: 'project-context',
        name: 'Project Context',
        steps: LEGACY_PROJECT_CONTEXT_PHASES.map((name) => ({
          name, agent: 'aidlc-project-context-agent',
        })),
      },
      {
        id: 'cohesive-feature',
        name: 'Cohesive Feature',
        steps: LEGACY_FEATURE_PHASES.map((name) => ({
          name, agent: 'aidlc-cohesive-feature-agent',
        })),
      },
    ],
  };
  fs.mkdirSync(path.join(root, '.aidlc', 'runs'), { recursive: true });
  fs.writeFileSync(path.join(root, '.aidlc', 'workspace.yaml'), yaml.dump(workspace), 'utf8');
  fs.writeFileSync(path.join(root, '.aidlc', 'runs', 'context-run.json'), JSON.stringify({
    schemaVersion: 1,
    runId: 'context-run',
    pipelineId: 'project-context',
    context: {},
    startedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    currentStepIdx: 0,
    status: 'running',
    pipelineSnapshot: snapshotPipeline(workspace.pipelines[0] as unknown as PipelineConfig, '2026-01-01T00:00:00.000Z'),
    steps: LEGACY_PROJECT_CONTEXT_PHASES.map((_, stepIdx) => ({
      stepIdx,
      agent: 'aidlc-project-context-agent',
      revision: 1,
      status: stepIdx === 0 ? 'awaiting_work' : 'pending',
      artifactsProduced: [],
    })),
  }, null, 2), 'utf8');
  const artifacts = path.join(root, 'docs', 'epics', 'PAY-1', 'artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  fs.writeFileSync(path.join(artifacts, 'SPEC.md'), '## Summary\nPay\n\n## Functional requirements\nFR1\n');
  fs.writeFileSync(path.join(root, 'docs', 'epics', 'PAY-1', 'state.json'), JSON.stringify({
    id: 'PAY-1', pipeline: 'cohesive-feature', status: 'in_progress',
  }, null, 2));
  fs.writeFileSync(path.join(root, '.aidlc', 'runs', 'PAY-1.json'), JSON.stringify({
    schemaVersion: 1,
    runId: 'PAY-1',
    pipelineId: 'cohesive-feature',
    context: { epic: 'PAY-1' },
    startedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    currentStepIdx: 1,
    status: 'running',
    pipelineSnapshot: snapshotPipeline(workspace.pipelines[1] as unknown as PipelineConfig, '2026-01-01T00:00:00.000Z'),
    steps: LEGACY_FEATURE_PHASES.map((name, stepIdx) => ({
      stepIdx,
      agent: 'aidlc-cohesive-feature-agent',
      revision: 1,
      status: name === 'specify' ? 'approved' : name === 'clarify' ? 'awaiting_work' : 'pending',
      artifactsProduced: name === 'specify' ? ['SPEC.md'] : [],
    })),
  }, null, 2), 'utf8');
  fs.mkdirSync(path.join(root, '.claude', 'commands'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'commands', 'cohesive-feature-implement.md'), '# leftover\n');
  fs.writeFileSync(path.join(root, '.claude', 'commands', 'project-context-define-charter.md'), '# leftover\n');
  return { root };
}

describe('CohesiveDeliveryUpgradeService', () => {
  it('reconciles runs by phase id, preserves old records, and marks only inserted phases New', () => {
    const oldPipeline = {
      id: 'cohesive-feature',
      name: 'Cohesive Feature',
      steps: [
        { name: 'specify', agent: 'feature-agent' },
        { name: 'implement', agent: 'feature-agent', depends_on: ['specify'] },
      ],
    } as PipelineConfig;
    const targetPipeline = {
      ...oldPipeline,
      steps: [
        oldPipeline.steps[0],
        { name: 'clarify', agent: 'feature-agent', depends_on: ['specify'] },
        oldPipeline.steps[1],
        { name: 'resolve-bugs', agent: 'feature-agent', depends_on: ['implement'] },
      ],
    } as PipelineConfig;
    const state: RunState = {
      schemaVersion: 1,
      runId: 'EPIC-001',
      pipelineId: oldPipeline.id,
      pipelineSnapshot: snapshotPipeline(oldPipeline, '2026-08-01T00:00:00.000Z'),
      context: { epic: 'EPIC-001' },
      startedAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      currentStepIdx: 1,
      status: 'completed',
      steps: [
        { stepIdx: 0, agent: 'feature-agent', revision: 1, status: 'approved', artifactsProduced: ['SPEC.md'] },
        {
          stepIdx: 1,
          agent: 'feature-agent',
          revision: 3,
          status: 'approved',
          artifactsProduced: ['IMPLEMENTATION-SUMMARY.md'],
          feedback: 'keep this history',
          history: [{ kind: 'approve', at: '2026-08-02T00:00:00.000Z', revision: 3 }],
        },
      ],
    };

    const migrated = reconcileRunStateToPipeline(
      state,
      targetPipeline,
      '2026-08-15T00:00:00.000Z',
    );

    expect(migrated.changed).toBe(true);
    expect(migrated.addedStepIds).toEqual(['clarify', 'resolve-bugs']);
    expect(migrated.state.steps).toHaveLength(4);
    expect(migrated.state.steps[1]).toMatchObject({ stepIdx: 1, isNew: true, status: 'awaiting_work' });
    expect(migrated.state.steps[2]).toMatchObject({
      stepIdx: 2,
      revision: 3,
      status: 'approved',
      feedback: 'keep this history',
    });
    expect(migrated.state.steps[2].history).toEqual(state.steps[1].history);
    expect(migrated.state.steps[3]).toMatchObject({ stepIdx: 3, isNew: true, status: 'awaiting_work' });
    expect(migrated.state.status).toBe('running');

    const repeated = reconcileRunStateToPipeline(migrated.state, targetPipeline);
    expect(repeated.changed).toBe(false);
    expect(repeated.addedStepIds).toEqual([]);
    expect(repeated.state).toBe(migrated.state);
  });

  it('upgrades 8+15 Cohesive workspaces onto 2+1+3, remaps runs, and drops leftover commands', () => {
    const { root } = v22Workspace();
    const service = new CohesiveDeliveryUpgradeService(root, () => '2026-08-16T00:00:00.000Z');
    const preview = service.preview();
    expect(preview.fromVersion).toBe('legacy-unlocked');
    expect(preview.toVersion).toBe('3.0.0');
    expect(preview.items.find((item) => item.pipelineId === 'project-context')?.disposition).toBe('upgrade');
    expect(preview.items.find((item) => item.pipelineId === 'feature-implement')?.disposition).toBe('missing');
    expect(preview.items.find((item) => item.pipelineId === 'feature-spike')?.disposition).toBe('missing');
    expect(preview.items.find((item) => item.pipelineId === 'cohesive-feature')?.disposition).toBe('upgrade');

    const manifest = service.apply(preview, { confirm: true });
    expect(manifest.status).toBe('applied');
    const upgraded = yaml.load(fs.readFileSync(path.join(root, '.aidlc', 'workspace.yaml'), 'utf8')) as {
      pipelines: Array<{ id: string; steps: Array<{ name?: string }> }>;
      slash_commands: Array<{ name: string }>;
    };
    expect(upgraded.pipelines.map((p) => p.id).sort()).toEqual([
      'feature-implement', 'feature-spike', 'project-context',
    ]);
    expect(upgraded.pipelines.find((p) => p.id === 'project-context')?.steps).toHaveLength(2);
    expect(upgraded.pipelines.find((p) => p.id === 'feature-spike')?.steps).toHaveLength(1);
    expect(upgraded.pipelines.find((p) => p.id === 'feature-implement')?.steps).toHaveLength(3);
    expect(upgraded.slash_commands.map((c) => c.name)).not.toContain('/cohesive-feature-implement');
    expect(upgraded.slash_commands.map((c) => c.name)).toContain('/feature-implement-implement');

    const contextRun = JSON.parse(fs.readFileSync(path.join(root, '.aidlc', 'runs', 'context-run.json'), 'utf8'));
    expect(contextRun.steps).toHaveLength(2);
    expect(contextRun.steps[0].status).toBe('awaiting_work');

    const featureRun = JSON.parse(fs.readFileSync(path.join(root, '.aidlc', 'runs', 'PAY-1.json'), 'utf8'));
    expect(featureRun.pipelineId).toBe('feature-implement');
    expect(featureRun.steps).toHaveLength(3);
    expect(featureRun.steps[0].status).toBe('awaiting_work');
    expect(fs.readFileSync(path.join(root, 'docs', 'epics', 'PAY-1', 'artifacts', 'MISSION.md'), 'utf8')).toContain('## Summary');
    expect(JSON.parse(fs.readFileSync(path.join(root, 'docs', 'epics', 'PAY-1', 'state.json'), 'utf8')).pipeline).toBe('feature-implement');
    expect(fs.existsSync(path.join(root, '.claude', 'commands', 'cohesive-feature-implement.md'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(root, '.aidlc', 'locks', 'cohesive-delivery.json'), 'utf8')).bundleVersion).toBe('3.0.0');
    expect(service.preview().items.filter((item) => item.pipelineId !== 'cohesive-feature').every((item) => item.disposition === 'already-current')).toBe(true);
  });

  it('refuses to replace a pipeline with user-owned phase names', () => {
    const { root } = v22Workspace();
    const file = path.join(root, '.aidlc', 'workspace.yaml');
    const doc = yaml.load(fs.readFileSync(file, 'utf8')) as { pipelines: Array<{ id: string; steps: unknown[] }> };
    doc.pipelines.find((pipeline) => pipeline.id === 'project-context')!.steps.push({ name: 'customer-step', agent: 'aidlc-project-context-agent' });
    fs.writeFileSync(file, yaml.dump(doc), 'utf8');
    const preview = new CohesiveDeliveryUpgradeService(root).preview();
    expect(preview.items.find((item) => item.pipelineId === 'project-context')?.disposition).toBe('conflict');
  });

  it('reopens approved plan/map-feature-flow when graph artifacts are missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cohesive-graph-reopen-'));
    roots.push(root);
    const pipeline = {
      id: 'cohesive-feature',
      steps: [
        {
          name: 'plan',
          agent: 'feature-agent',
          produces: [
            'docs/epics/{epic}/artifacts/PLAN.md',
            'docs/epics/{epic}/artifacts/FEATURE-IMPACT.json',
            'docs/epics/{epic}/artifacts/FEATURE-IMPACT.mmd',
          ],
        },
        {
          name: 'map-feature-flow',
          agent: 'feature-agent',
          depends_on: ['plan'],
          produces: [
            'docs/epics/{epic}/artifacts/FEATURE-FLOW.json',
            'docs/epics/{epic}/artifacts/FEATURE-SURFACES.json',
          ],
        },
        { name: 'implement', agent: 'feature-agent', depends_on: ['map-feature-flow'] },
      ],
    } as PipelineConfig;
    const artifacts = path.join(root, 'docs', 'epics', 'PAY-1', 'artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    fs.writeFileSync(path.join(artifacts, 'PLAN.md'), '# plan\n');
    fs.writeFileSync(path.join(artifacts, 'FEATURE-FLOW.json'), '{}\n');
    const state: RunState = {
      schemaVersion: 1,
      runId: 'PAY-1',
      pipelineId: 'cohesive-feature',
      pipelineSnapshot: snapshotPipeline(pipeline, '2026-08-01T00:00:00.000Z'),
      context: { epic: 'PAY-1' },
      startedAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      currentStepIdx: 2,
      status: 'running',
      steps: [
        { stepIdx: 0, agent: 'feature-agent', revision: 1, status: 'approved', artifactsProduced: ['PLAN.md'] },
        { stepIdx: 1, agent: 'feature-agent', revision: 1, status: 'approved', artifactsProduced: ['FEATURE-FLOW.json'] },
        { stepIdx: 2, agent: 'feature-agent', revision: 1, status: 'awaiting_work', artifactsProduced: [] },
      ],
    };
    const result = reopenApprovedStepsMissingProduces(state, pipeline, root);
    expect(result.reopenedStepIds).toEqual(['plan', 'map-feature-flow']);
    expect(result.state.steps[0]).toMatchObject({ status: 'awaiting_work', isNew: true });
    expect(result.state.steps[1]).toMatchObject({ status: 'awaiting_work', isNew: true });
    expect(result.state.steps[2].status).toBe('awaiting_work');
    expect(result.state.currentStepIdx).toBe(2);
  });
});
