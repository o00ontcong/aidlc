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
  listValidatorConflicts,
  loadBuiltinPreset,
  resolveValidatorConflict,
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
    expect(config.agents).toHaveLength(4);
    expect(config.skills).toHaveLength(4);
    expect(config.slash_commands).toHaveLength(28);
    const slashNames = config.slash_commands.map((c) => c.name);
    expect(slashNames).toContain('/project-context-define-charter');
    expect(slashNames).toContain('/project-context-scan-project');
    expect(slashNames).toContain('/project-context-check-drift');
    expect(slashNames).toContain('/project-context-project-rules-sync');
    expect(slashNames).toContain('/cohesive-feature-capture-context');
    expect(slashNames).toContain('/cohesive-feature-open-pr');
    expect(slashNames).toContain('/cohesive-feature-await-merge');
    expect(slashNames).toContain('/cohesive-work-package-load-package');
    expect(slashNames).toContain('/cohesive-work-package-package-test-plan');
    expect(slashNames).toContain('/cohesive-work-package-package-review');
    expect(slashNames).not.toContain('/cohesive-feature-scan-project');
    expect(slashNames).not.toContain('/cohesive-work-package-open-pr');

    const project = config.pipelines.find((pipeline) => pipeline.id === 'project-context')!;
    const feature = config.pipelines.find((pipeline) => pipeline.id === 'cohesive-feature')!;
    const worker = config.pipelines.find((pipeline) => pipeline.id === 'cohesive-work-package')!;
    expect(project.steps).toHaveLength(7);
    expect(feature.steps).toHaveLength(14);
    expect(worker.steps).toHaveLength(7);

    expect(feature.steps[0].requires).toContain('docs/project/context/CONTEXT-MANIFEST.json');
    const specify = feature.steps.find((s) => s.name === 'specify')!;
    expect(specify.requires).toContain('docs/project/charter/CHARTER.json');
    expect(specify.requires).toContain('docs/epics/{epic}/artifacts/ALIGNMENT.md');
    expect(specify.auto_review_runner).toBe('.aidlc/validators/charter-alignment.mjs');

    const ids = feature.steps.map((s) => s.name);
    const systemTest = ids.indexOf('system-test');
    const openPr = ids.indexOf('open-pr');
    const awaitMerge = ids.indexOf('await-merge');
    const projectSync = ids.indexOf('project-sync');
    expect(systemTest).toBeGreaterThan(-1);
    expect(openPr).toBe(systemTest + 1);
    expect(awaitMerge).toBe(openPr + 1);
    expect(projectSync).toBe(awaitMerge + 1);
    expect(feature.steps[projectSync].depends_on).toContain('await-merge');
    expect(feature.steps[openPr].auto_review_runner).toBe('.aidlc/validators/ship.mjs');

    const workerIds = worker.steps.map((s) => s.name);
    expect(workerIds).not.toContain('open-pr');
    expect(workerIds).not.toContain('await-merge');

    const tasksPackage = feature.steps.find((s) => s.name === 'tasks-package')!;
    expect(tasksPackage.produces).toContain('docs/epics/{epic}/artifacts/WORK-PACKAGES.json');
    expect(tasksPackage.auto_review_runner).toBe('.aidlc/validators/work-packages.mjs');
    expect(worker.steps[0].auto_review_runner).toBe('.aidlc/validators/package-context.mjs');

    const cohesion = feature.steps.find((s) => s.name === 'cohesion-review')!;
    expect(cohesion.agent).toBe('aidlc-cohesive-reviewer-agent');

    const shipOnPackage = worker.steps.some((s) => s.name === 'open-pr' || s.name === 'await-merge');
    expect(shipOnPackage).toBe(false);
  });

  it('keeps companion pipeline lookup compatible with existing extension code', () => {
    const project = getBuiltinWorkflowByPipelineId('project-context');
    const worker = getBuiltinWorkflowByPipelineId('cohesive-work-package');
    expect(project?.phases.map((phase) => phase.id)).toEqual([
      'define-charter', 'scan-project', 'model-project', 'check-drift',
      'review-context', 'publish-context', 'project-rules-sync',
    ]);
    expect(worker?.phases.map((phase) => phase.id)).toEqual([
      'load-package',
      'prepare-worktree',
      'package-test-plan',
      'implement-package',
      'package-test',
      'package-review',
      'publish-result',
    ]);
    expect(getBuiltinPipelineSummary(workflow).steps).toHaveLength(14);
    expect(worker?.phases.map((phase) => phase.id)).not.toContain('open-pr');
  });

  it('orders package-test-plan before implement and review before publish', () => {
    const worker = getBuiltinWorkflowByPipelineId('cohesive-work-package')!;
    const ids = worker.phases.map((p) => p.id);
    expect(ids.indexOf('package-test-plan')).toBeLessThan(ids.indexOf('implement-package'));
    expect(ids.indexOf('implement-package')).toBeLessThan(ids.indexOf('package-test'));
    expect(ids.indexOf('package-test')).toBeLessThan(ids.indexOf('package-review'));
    expect(ids.indexOf('package-review')).toBeLessThan(ids.indexOf('publish-result'));

    const testPlan = worker.phases.find((p) => p.id === 'package-test-plan')!;
    expect(testPlan.producesContains).toContain('## Failing Tests');

    const implement = worker.phases.find((p) => p.id === 'implement-package')!;
    expect(implement.dependsOn).toContain('package-test-plan');
    expect(implement.produces).toContain('docs/epics/{epic}/artifacts/REVIEW-DIFF.md');
    expect(implement.autoReviewRunner).toBe('.aidlc/validators/diff-review.mjs');

    const review = worker.phases.find((p) => p.id === 'package-review')!;
    expect(review.persona).toBe('cohesive-reviewer-agent');
    expect(review.autoReviewRunner).toBe('.aidlc/validators/package-review.mjs');
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
    expect(fs.existsSync(path.join(validators, 'lib.mjs.aidlc-new'))).toBe(true);
    expect(fs.existsSync(path.join(validators, '.aidlc-validator-manifest.json'))).toBe(true);
    for (const file of [
      'project-context.mjs', 'charter.mjs', 'rules-sync.mjs',
      'work-packages.mjs', 'feature-contract.mjs',
      'await-packages.mjs', 'integration-cohesion.mjs', 'project-ci.mjs',
      'package-context.mjs', 'worktree-state.mjs', 'package-result.mjs',
      'charter-alignment.mjs', 'ship.mjs',
      'diff-review.mjs', 'package-review.mjs',
    ]) {
      expect(fs.existsSync(path.join(validators, file)), file).toBe(true);
    }

    const managed = path.join(validators, 'ship.mjs');
    fs.writeFileSync(managed, '// old managed bytes\n', 'utf8');
    const manifestPath = path.join(validators, '.aidlc-validator-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files['ship.mjs'].installedHash = `sha256:${require('crypto')
      .createHash('sha256').update('// old managed bytes\n').digest('hex')}`;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    writeBuiltinAutoReviewValidators(ROOT, root, workflow);
    expect(fs.readFileSync(managed, 'utf8')).toBe(
      fs.readFileSync(path.join(ROOT, 'templates', 'cohesive', 'validators', 'ship.mjs'), 'utf8'),
    );
    expect(fs.readFileSync(path.join(validators, 'lib.mjs'), 'utf8')).toBe('// user-owned\n');

    fs.unlinkSync(path.join(validators, 'lib.mjs.aidlc-new'));
    writeBuiltinAutoReviewValidators(ROOT, root, workflow);
    expect(fs.readFileSync(path.join(validators, 'lib.mjs'), 'utf8')).toBe('// user-owned\n');
    expect(fs.existsSync(path.join(validators, 'lib.mjs.aidlc-new'))).toBe(false);
  });

  it('lets a human list and resolve pending validator conflicts without manual file surgery', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cohesive-'));
    tempRoots.push(root);
    const validators = path.join(root, '.aidlc', 'validators');
    fs.mkdirSync(validators, { recursive: true });
    fs.writeFileSync(path.join(validators, 'lib.mjs'), '// user-owned lib\n', 'utf8');
    fs.writeFileSync(path.join(validators, 'ship.mjs'), '// user-owned ship\n', 'utf8');
    writeBuiltinAutoReviewValidators(ROOT, root, workflow);

    const bundledShip = fs.readFileSync(path.join(ROOT, 'templates', 'cohesive', 'validators', 'ship.mjs'), 'utf8');
    const conflicts = listValidatorConflicts(root);
    expect(conflicts.map((c) => c.rel).sort()).toEqual(['lib.mjs', 'ship.mjs']);
    const shipConflict = conflicts.find((c) => c.rel === 'ship.mjs')!;
    expect(shipConflict.installed).toBe('// user-owned ship\n');
    expect(shipConflict.proposed).toBe(bundledShip);

    // Accept the bundled replacement for ship.mjs.
    resolveValidatorConflict(root, 'ship.mjs', 'accept');
    expect(fs.readFileSync(path.join(validators, 'ship.mjs'), 'utf8')).toBe(bundledShip);
    expect(fs.existsSync(path.join(validators, 'ship.mjs.aidlc-new'))).toBe(false);

    // Keep the installed lib.mjs as-is.
    resolveValidatorConflict(root, 'lib.mjs', 'keep');
    expect(fs.readFileSync(path.join(validators, 'lib.mjs'), 'utf8')).toBe('// user-owned lib\n');
    expect(fs.existsSync(path.join(validators, 'lib.mjs.aidlc-new'))).toBe(false);

    expect(listValidatorConflicts(root)).toEqual([]);

    // Re-applying with no bundled change respects both resolutions: the
    // accepted file is now managed (would auto-upgrade on a future bundle
    // change), the kept file is remembered as reviewed-and-customized.
    writeBuiltinAutoReviewValidators(ROOT, root, workflow);
    expect(fs.readFileSync(path.join(validators, 'ship.mjs'), 'utf8')).toBe(bundledShip);
    expect(fs.readFileSync(path.join(validators, 'lib.mjs'), 'utf8')).toBe('// user-owned lib\n');
    expect(listValidatorConflicts(root)).toEqual([]);
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
