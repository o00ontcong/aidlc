import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  BUILTIN_WORKFLOWS,
  builtinClaudeCommand,
  builtinTemplatesRoot,
  getBuiltinArtifactTemplates,
  getBuiltinPipelineSummary,
  getBuiltinWorkflowByPipelineId,
  loadBuiltinPreset,
  validateWorkspace,
  writeBuiltinAutoReviewValidators,
} from '../src';

const ROOT = builtinTemplatesRoot();
const workflow = BUILTIN_WORKFLOWS.find((entry) => entry.id === 'cohesive-delivery')!;
const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Cohesive Delivery built-in bundle', () => {
  it('materializes three valid, connected pipelines atomically', () => {
    const preset = loadBuiltinPreset(ROOT, workflow);
    const config = validateWorkspace(
      { name: 'cohesive-test', ...preset.workspace },
      'cohesive/workspace.yaml',
    );

    expect(config.pipelines.map((pipeline) => pipeline.id)).toEqual([
      'cohesive-feature',
      'project-context',
      'cohesive-work-package',
    ]);
    expect(config.agents).toHaveLength(3);
    expect(config.skills).toHaveLength(3);
    expect(config.slash_commands).toHaveLength(24);
    const slashNames = config.slash_commands.map((c) => c.name);
    expect(slashNames).toContain('/project-context-define-charter');
    expect(slashNames).toContain('/project-context-scan-project');
    expect(slashNames).toContain('/project-context-check-drift');
    expect(slashNames).toContain('/project-context-project-rules-sync');
    expect(slashNames).toContain('/cohesive-feature-capture-context');
    expect(slashNames).toContain('/cohesive-work-package-load-package');
    expect(slashNames).not.toContain('/cohesive-feature-scan-project');

    const project = config.pipelines.find((pipeline) => pipeline.id === 'project-context')!;
    const feature = config.pipelines.find((pipeline) => pipeline.id === 'cohesive-feature')!;
    const worker = config.pipelines.find((pipeline) => pipeline.id === 'cohesive-work-package')!;
    expect(project.steps).toHaveLength(7);
    expect(feature.steps).toHaveLength(12);
    expect(worker.steps).toHaveLength(5);

    expect(feature.steps[0].requires).toContain('docs/project/context/CONTEXT-MANIFEST.json');
    expect(feature.steps[4].produces).toContain('docs/epics/{epic}/artifacts/WORK-PACKAGES.json');
    expect(feature.steps[4].auto_review_runner).toBe('.aidlc/validators/work-packages.mjs');
    expect(worker.steps[0].auto_review_runner).toBe('.aidlc/validators/package-context.mjs');
  });

  it('keeps companion pipeline lookup compatible with existing extension code', () => {
    const project = getBuiltinWorkflowByPipelineId('project-context');
    const worker = getBuiltinWorkflowByPipelineId('cohesive-work-package');
    expect(project?.phases.map((phase) => phase.id)).toEqual([
      'define-charter', 'scan-project', 'model-project', 'check-drift',
      'review-context', 'publish-context', 'project-rules-sync',
    ]);
    expect(worker?.phases.map((phase) => phase.id)).toEqual([
      'load-package', 'prepare-worktree', 'implement-package', 'package-test', 'publish-result',
    ]);
    expect(getBuiltinPipelineSummary(workflow).steps).toHaveLength(12);
  });

  it('does not pre-seed gate outputs with empty artifact templates', () => {
    expect(getBuiltinArtifactTemplates(ROOT, workflow)).toEqual({});
    expect(getBuiltinArtifactTemplates(
      ROOT,
      getBuiltinWorkflowByPipelineId('project-context')!,
    )).toEqual({});
  });

  it('writes all validator runners and their shared helper without overwriting user files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cohesive-'));
    tempRoots.push(root);
    const validators = path.join(root, '.aidlc', 'validators');
    fs.mkdirSync(validators, { recursive: true });
    fs.writeFileSync(path.join(validators, 'lib.mjs'), '// user-owned\n', 'utf8');

    writeBuiltinAutoReviewValidators(ROOT, root, workflow);

    expect(fs.readFileSync(path.join(validators, 'lib.mjs'), 'utf8')).toBe('// user-owned\n');
    for (const file of [
      'project-context.mjs', 'charter.mjs', 'rules-sync.mjs',
      'work-packages.mjs', 'feature-contract.mjs',
      'await-packages.mjs', 'integration-cohesion.mjs', 'project-ci.mjs',
      'package-context.mjs', 'worktree-state.mjs', 'package-result.mjs',
    ]) {
      expect(fs.existsSync(path.join(validators, file)), file).toBe(true);
    }
  });

  it('tells commands to produce every explicit cross-pipeline gate output', () => {
    const command = builtinClaudeCommand(
      workflow.primaryPhases!.find((phase) => phase.id === 'tasks-package')!,
      '# package tasks',
      'docs/epics',
    );
    expect(command).toContain('docs/epics/$ARGUMENTS/artifacts/TASKS.md');
    expect(command).toContain('docs/epics/$ARGUMENTS/artifacts/WORK-PACKAGES.json');
    expect(command).toContain('do not create placeholders');
  });
});
