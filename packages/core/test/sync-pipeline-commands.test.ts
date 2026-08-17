import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BUILTIN_WORKFLOWS,
  ModelProviderConfigStore,
  syncPipelineCommandsForProvider,
  builtinTemplatesRoot,
} from '../src';

describe('syncPipelineCommands multi-provider', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('writes cursor, Codex, and OpenCode command files with their model format', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-sync-mp-'));
    roots.push(root);
    const extPath = builtinTemplatesRoot();

    fs.mkdirSync(path.join(root, '.aidlc'), { recursive: true });
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === 'cohesive-delivery')!;
    fs.writeFileSync(
      path.join(root, '.aidlc', 'workspace.yaml'),
      yaml.dump({
        pipelines: [{ id: workflow.pipelineId, steps: [] }, { id: 'feature-implement', steps: [] }],
      }),
    );

    syncPipelineCommandsForProvider(root, extPath, 'cursor');
    syncPipelineCommandsForProvider(root, extPath, 'codex');
    syncPipelineCommandsForProvider(root, extPath, 'opencode');

    const cursorFile = path.join(root, '.cursor', 'commands', 'feature-implement-implement.md');
    const codexFile = path.join(root, '.codex', 'skills', 'aidlc-feature-implement-implement', 'SKILL.md');
    const opencodeFile = path.join(root, '.opencode', 'commands', 'feature-implement-implement.md');
    expect(fs.existsSync(cursorFile)).toBe(true);
    expect(fs.readFileSync(cursorFile, 'utf8')).toMatch(/^---\n/);
    expect(fs.readFileSync(cursorFile, 'utf8')).toContain('name: feature-implement-implement');
    const cursorSkill = path.join(root, '.cursor', 'skills', 'feature-implement-implement', 'SKILL.md');
    expect(fs.existsSync(cursorSkill)).toBe(true);
    const baselineSkill = path.join(root, '.cursor', 'skills', 'project-context-establish-baseline', 'SKILL.md');
    expect(fs.existsSync(baselineSkill)).toBe(true);
    expect(fs.readFileSync(baselineSkill, 'utf8')).toContain('SCREEN-CATALOG');
    expect(fs.existsSync(codexFile)).toBe(true);
    expect(fs.readFileSync(codexFile, 'utf8')).toContain('disable-model-invocation: true');
    expect(fs.existsSync(opencodeFile)).toBe(true);
    expect(fs.readFileSync(opencodeFile, 'utf8')).toContain('model: silvertiger/glm-5.3');

    const opencodeAutonomousFile = path.join(root, '.opencode', 'commands', 'aidlc-autonomous-epic.md');
    expect(fs.readFileSync(opencodeAutonomousFile, 'utf8')).toContain('model: silvertiger/glm-5.3');

    const claudeFile = path.join(root, '.claude', 'commands', 'feature-implement-implement.md');
    expect(fs.existsSync(claudeFile)).toBe(false);
  });
});
