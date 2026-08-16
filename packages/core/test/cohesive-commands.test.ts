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

describe('cohesive companion command files', () => {
  const tempRoots: string[] = [];
  afterEach(() => {
    for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('expects 6 distinct command ids for the three Cohesive pipelines', () => {
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === 'cohesive-delivery')!;
    const pairs = workflowCommandPhases(workflow);
    expect(pairs).toHaveLength(6);

    const ids = pairs.map(({ pipelineId, phase }) => pipelineCommandId(pipelineId, phase.id));
    expect(ids).toEqual(expect.arrayContaining([
      'project-context-establish-baseline',
      'project-context-publish-context',
      'feature-spike-package-mission',
      'feature-implement-implement',
      'feature-implement-resolve-bugs',
      'feature-implement-ship',
    ]));
    expect(ids).not.toContain('cohesive-feature-implement');
    expect(ids).not.toContain('project-context-define-charter');
    expect(ids).not.toContain('cohesive-feature-scan-project');
    expect(new Set(ids).size).toBe(6);
  });

  it('loadBuiltinPreset has skill content for every cohesive phase', () => {
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === 'cohesive-delivery')!;
    const preset = loadBuiltinPreset(builtinTemplatesRoot(), workflow);
    for (const { phase } of workflowCommandPhases(workflow)) {
      expect(preset.skillContents[phase.id], phase.id).toBeTruthy();
    }
  });

  it('can materialize all 6 command files into an empty .claude/commands', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cmds-'));
    tempRoots.push(root);
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === 'cohesive-delivery')!;
    const preset = loadBuiltinPreset(builtinTemplatesRoot(), workflow);
    const dir = path.join(root, '.claude', 'commands');
    fs.mkdirSync(dir, { recursive: true });

    for (const { pipelineId, phase } of workflowCommandPhases(workflow)) {
      const file = path.join(dir, `${pipelineCommandId(pipelineId, phase.id)}.md`);
      const body = preset.skillContents[phase.id] ?? phase.description;
      fs.writeFileSync(file, builtinClaudeCommand(phase, body, 'docs/epics'), 'utf8');
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    expect(files).toContain('project-context-publish-context.md');
    expect(files).toContain('project-context-establish-baseline.md');
    expect(files.filter((f) => f.startsWith('project-context-'))).toHaveLength(2);
    expect(files.filter((f) => f.startsWith('feature-spike-'))).toHaveLength(1);
    expect(files.filter((f) => f.startsWith('feature-implement-'))).toHaveLength(3);
    expect(files.filter((f) => f.startsWith('cohesive-feature-'))).toHaveLength(0);
  });
});
