import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

import { BUILTIN_WORKFLOWS, builtinTemplatesRoot, CohesiveDeliveryUpgradeService, loadBuiltinPreset } from '../src';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function legacyWorkspace(): { root: string; oldProjectSteps: unknown[] } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cohesive-upgrade-')); roots.push(root);
  const workflow = BUILTIN_WORKFLOWS.find((item) => item.id === 'cohesive-delivery')!;
  const workspace = JSON.parse(JSON.stringify(loadBuiltinPreset(builtinTemplatesRoot(), workflow).workspace)) as Record<string, unknown>;
  const pipelines = workspace.pipelines as Array<Record<string, unknown>>;
  const project = pipelines.find((pipeline) => pipeline.id === 'project-context')!;
  const feature = pipelines.find((pipeline) => pipeline.id === 'cohesive-feature')!;
  project.steps = (project.steps as Array<Record<string, unknown>>).filter((step) => step.name !== 'map-features');
  feature.steps = (feature.steps as Array<Record<string, unknown>>).filter((step) => step.name !== 'map-feature-flow');
  fs.mkdirSync(path.join(root, '.aidlc', 'runs'), { recursive: true });
  fs.writeFileSync(path.join(root, '.aidlc', 'workspace.yaml'), yaml.dump(workspace), 'utf8');
  const oldProjectSteps = project.steps as unknown[];
  fs.writeFileSync(path.join(root, '.aidlc', 'runs', 'context-run.json'), JSON.stringify({
    schemaVersion: 1, runId: 'context-run', pipelineId: 'project-context', context: {}, startedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', currentStepIdx: 0, status: 'running',
    steps: oldProjectSteps.map((step, stepIdx) => ({ stepIdx, agent: String((step as Record<string, unknown>).agent), revision: 1, status: stepIdx === 0 ? 'awaiting_work' : 'pending', artifactsProduced: [] })),
  }, null, 2), 'utf8');
  return { root, oldProjectSteps };
}

describe('CohesiveDeliveryUpgradeService', () => {
  it('previews, backs up, upgrades generated pipelines, and freezes active legacy runs', () => {
    const { root, oldProjectSteps } = legacyWorkspace();
    const service = new CohesiveDeliveryUpgradeService(root, () => '2026-08-14T00:00:00.000Z');
    const preview = service.preview();
    expect(preview.fromVersion).toBe('legacy-unlocked');
    expect(preview.items.map((item) => item.disposition)).toEqual(['upgrade', 'upgrade']);
    expect(preview.activeRunIds).toEqual(['context-run']);

    const manifest = service.apply(preview, { confirm: true });
    expect(manifest.status).toBe('applied');
    const upgraded = yaml.load(fs.readFileSync(path.join(root, '.aidlc', 'workspace.yaml'), 'utf8')) as { pipelines: Array<{ id: string; steps: unknown[] }> };
    expect(upgraded.pipelines.find((pipeline) => pipeline.id === 'project-context')?.steps).toHaveLength(8);
    expect(upgraded.pipelines.find((pipeline) => pipeline.id === 'cohesive-feature')?.steps).toHaveLength(14);
    const run = JSON.parse(fs.readFileSync(path.join(root, '.aidlc', 'runs', 'context-run.json'), 'utf8'));
    expect(run.pipelineSnapshot.pipeline.steps).toHaveLength(oldProjectSteps.length);
    expect(fs.existsSync(path.join(manifest.backupDir, 'files', '.aidlc', 'workspace.yaml'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, '.aidlc', 'locks', 'cohesive-delivery.json'), 'utf8')).bundleVersion).toBe('2.0.0');
  });

  it('refuses to replace a pipeline with user-owned phase names', () => {
    const { root } = legacyWorkspace();
    const file = path.join(root, '.aidlc', 'workspace.yaml');
    const doc = yaml.load(fs.readFileSync(file, 'utf8')) as { pipelines: Array<{ id: string; steps: unknown[] }> };
    doc.pipelines.find((pipeline) => pipeline.id === 'project-context')!.steps.push({ name: 'customer-step', agent: 'aidlc-project-context-agent' });
    fs.writeFileSync(file, yaml.dump(doc), 'utf8');
    const preview = new CohesiveDeliveryUpgradeService(root).preview();
    expect(preview.items.find((item) => item.pipelineId === 'project-context')?.disposition).toBe('conflict');
  });
});
