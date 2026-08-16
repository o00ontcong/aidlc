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
  getBuiltinStepHelp,
  getBuiltinWorkflowByPipelineId,
  listValidatorConflicts,
  loadBuiltinPreset,
  resolveValidatorConflict,
  renderBuiltinStepHelpMarkdown,
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
  it('materializes three pipelines: project-context, feature-spike, feature-implement', () => {
    const preset = loadBuiltinPreset(ROOT, workflow);
    const config = validateWorkspace(
      { name: 'cohesive-test', ...preset.workspace },
      'cohesive/workspace.yaml',
    );

    expect(config.pipelines.map((pipeline) => pipeline.id)).toEqual([
      'feature-implement',
      'project-context',
      'feature-spike',
    ]);
    expect(config.agents).toHaveLength(3);
    expect(config.skills).toHaveLength(3);
    expect(config.slash_commands).toHaveLength(6);
    const slashNames = config.slash_commands.map((c) => c.name);
    expect(slashNames).toEqual(expect.arrayContaining([
      '/project-context-establish-baseline',
      '/project-context-publish-context',
      '/feature-spike-package-mission',
      '/feature-implement-implement',
      '/feature-implement-resolve-bugs',
      '/feature-implement-ship',
    ]));
    expect(slashNames).not.toContain('/cohesive-feature-capture-context');
    expect(slashNames).not.toContain('/project-context-define-charter');
    expect(slashNames).not.toContain('/cohesive-feature-open-pr');

    const project = config.pipelines.find((pipeline) => pipeline.id === 'project-context')!;
    const spike = config.pipelines.find((pipeline) => pipeline.id === 'feature-spike')!;
    const feature = config.pipelines.find((pipeline) => pipeline.id === 'feature-implement')!;
    expect(project.steps.map((s) => s.name)).toEqual(['establish-baseline', 'publish-context']);
    expect(spike.steps.map((s) => s.name)).toEqual(['package-mission']);
    expect(feature.steps.map((s) => s.name)).toEqual(['implement', 'resolve-bugs', 'ship']);

    expect(feature.steps[0].requires).toContain('docs/epics/{epic}/artifacts/MISSION.md');
    expect(feature.steps[0].auto_review_runner).toBe('.aidlc/validators/project-ci.mjs');
    expect(project.steps[0].human_review).toBe(true);
    expect(project.steps[1].human_review).toBe(false);
    expect(spike.steps[0].auto_review_runner).toBe('.aidlc/validators/mission-completeness.mjs');

    const bugFix = feature.steps[1];
    expect(bugFix.human_review).toBe(true);
    expect(bugFix.auto_review).toBe(false);
    expect(bugFix.depends_on).toContain('implement');

    const ship = feature.steps[2];
    expect(ship.human_review).toBe(false);
    expect(ship.auto_review_runner).toBe('.aidlc/validators/ship.mjs');
    expect(ship.depends_on).toContain('resolve-bugs');
    expect(ship.produces).toContain('docs/epics/{epic}/artifacts/PROJECT-UPDATE.md');

    expect(feature.steps.find((s) => s.name === 'implement')?.model).toBe('claude-sonnet-5');
    expect(project.steps.find((s) => s.name === 'establish-baseline')?.model).toBe('claude-opus-5');
    expect(config.agents.map((a) => a.id)).not.toContain('aidlc-cohesive-reviewer-agent');
  });

  it('keeps companion pipeline lookup compatible with existing extension code', () => {
    const project = getBuiltinWorkflowByPipelineId('project-context');
    expect(project?.phases.map((phase) => phase.id)).toEqual([
      'establish-baseline', 'publish-context',
    ]);
    expect(getBuiltinPipelineSummary(workflow).steps).toHaveLength(3);
    expect(getBuiltinWorkflowByPipelineId('feature-spike')?.phases.map((p) => p.id)).toEqual([
      'package-mission',
    ]);
    expect(getBuiltinWorkflowByPipelineId('cohesive-feature')).toBeUndefined();
    expect(getBuiltinWorkflowByPipelineId('cohesive-work-package')).toBeUndefined();
  });

  it('does not pre-seed gate outputs with empty artifact templates', () => {
    expect(getBuiltinArtifactTemplates(ROOT, workflow)).toEqual({});
    expect(getBuiltinArtifactTemplates(
      ROOT,
      getBuiltinWorkflowByPipelineId('project-context')!,
    )).toEqual({});
  });

  it('writes all validator runners including mission-completeness without overwriting user files', () => {
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
      'project-context.mjs', 'establish-baseline.mjs',
      'mission-completeness.mjs', 'project-ci.mjs', 'ship.mjs',
    ]) {
      expect(fs.existsSync(path.join(validators, file)), file).toBe(true);
    }
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
    resolveValidatorConflict(root, 'ship.mjs', 'accept');
    expect(fs.readFileSync(path.join(validators, 'ship.mjs'), 'utf8')).toBe(bundledShip);
    resolveValidatorConflict(root, 'lib.mjs', 'keep');
    expect(fs.readFileSync(path.join(validators, 'lib.mjs'), 'utf8')).toBe('// user-owned lib\n');
    expect(listValidatorConflicts(root)).toEqual([]);
  });

  it('tells implement to produce IMPLEMENTATION-SUMMARY from MISSION.md', () => {
    const command = builtinClaudeCommand(
      workflow.primaryPhases!.find((phase) => phase.id === 'implement')!,
      '# implement',
      'docs/epics',
    );
    expect(command).toContain('docs/epics/$ARGUMENTS/artifacts/IMPLEMENTATION-SUMMARY.md');
    expect(command).toContain('do not create placeholders');
  });

  it('keeps bug fixes iterative and ships after approval', () => {
    const preset = loadBuiltinPreset(ROOT, workflow);
    const bugCommand = preset.skillContents['resolve-bugs']!;
    const shipCommand = preset.skillContents['ship']!;

    expect(bugCommand).toContain("user's consolidated report");
    expect(bugCommand).toContain('kind: bug_report');
    expect(bugCommand).toContain('append-only log');
    expect(bugCommand).toContain('## Screenshots');
    expect(bugCommand).toContain('bug-screenshots/');
    expect(bugCommand).toContain('must not edit those files yet');
    expect(bugCommand).toContain('**Status:** READY-FOR-APPROVAL');
    expect(shipCommand).toContain('Run only after `resolve-bugs` is approved');
    expect(shipCommand).toContain('Apply the approved `## Documentation Sync Plan`');
    expect(preset.skillContents['package-mission']).toContain('MISSION.md');
    expect(preset.skillContents['establish-baseline']).toContain('CONTEXT-REVIEW.md');

    const help = getBuiltinStepHelp('feature-implement', 'resolve-bugs')!;
    const helpMarkdown = renderBuiltinStepHelpMarkdown(help);
    expect(helpMarkdown).toContain('**Nhập bug & chạy agent**');
    expect(helpMarkdown).toContain('**Approve bản sửa**');
  });
});
