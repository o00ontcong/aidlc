import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BUILTIN_WORKFLOWS,
  loadBuiltinPreset,
  pipelineCommandId,
  workflowCommandPhases,
  builtinTemplatesRoot,
  builtinClaudeCommand,
} from '../src';

/**
 * Mirrors extension syncBuiltinPipelineCommands file-writing expectations:
 * every (pipelineId, phase) pair must produce a command file under
 * .claude/commands/. This test guards the cohesive companion rename.
 */
describe('cohesive companion command files', () => {
  const tempRoots: string[] = [];
  afterEach(() => {
    for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('expects 23 distinct pipeline-namespaced command ids (no cohesive-feature-scan-project)', () => {
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === 'cohesive-delivery')!;
    const pairs = workflowCommandPhases(workflow);
    expect(pairs).toHaveLength(23);

    const ids = pairs.map(({ pipelineId, phase }) => pipelineCommandId(pipelineId, phase.id));
    expect(ids).toContain('project-context-publish-context');
    expect(ids).toContain('project-context-scan-project');
    expect(ids).toContain('cohesive-work-package-load-package');
    expect(ids).toContain('cohesive-work-package-package-test-plan');
    expect(ids).toContain('cohesive-work-package-package-review');
    expect(ids).toContain('cohesive-feature-capture-context');
    expect(ids).not.toContain('cohesive-feature-scan-project');
    expect(ids).not.toContain('cohesive-feature-publish-context');
    expect(ids).not.toContain('cohesive-feature-load-package');
    expect(ids).not.toContain('cohesive-work-package-open-pr');
    expect(new Set(ids).size).toBe(23);
  });

  it('loadBuiltinPreset has skill content for every cohesive phase', () => {
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === 'cohesive-delivery')!;
    const preset = loadBuiltinPreset(builtinTemplatesRoot(), workflow);
    for (const { phase } of workflowCommandPhases(workflow)) {
      expect(preset.skillContents[phase.id], phase.id).toBeTruthy();
    }
  });

  it('can materialize all 23 command files into an empty .claude/commands', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cmds-'));
    tempRoots.push(root);
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === 'cohesive-delivery')!;
    const preset = loadBuiltinPreset(builtinTemplatesRoot(), workflow);
    const dir = path.join(root, '.claude', 'commands');
    fs.mkdirSync(dir, { recursive: true });

    const { builtinClaudeCommand: cmd } = { builtinClaudeCommand };
    for (const { pipelineId, phase } of workflowCommandPhases(workflow)) {
      const file = path.join(dir, `${pipelineCommandId(pipelineId, phase.id)}.md`);
      const body = preset.skillContents[phase.id] ?? phase.description;
      fs.writeFileSync(file, cmd(phase, body, 'docs/epics'), 'utf8');
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    expect(files).toContain('project-context-publish-context.md');
    expect(files).toContain('cohesive-work-package-publish-result.md');
    expect(files).toContain('cohesive-work-package-package-test-plan.md');
    expect(files).toContain('cohesive-work-package-package-review.md');
    expect(files.filter((f) => f.startsWith('project-context-'))).toHaveLength(4);
    expect(files.filter((f) => f.startsWith('cohesive-work-package-'))).toHaveLength(7);
    expect(files.filter((f) => f.startsWith('cohesive-feature-'))).toHaveLength(12);
  });
});
