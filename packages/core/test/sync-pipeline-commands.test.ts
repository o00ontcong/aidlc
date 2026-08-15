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
        pipelines: [{ id: workflow.pipelineId, steps: [] }, { id: 'cohesive-feature', steps: [] }],
      }),
    );

    syncPipelineCommandsForProvider(root, extPath, 'cursor');
    syncPipelineCommandsForProvider(root, extPath, 'codex');
    syncPipelineCommandsForProvider(root, extPath, 'opencode');

    const cursorFile = path.join(root, '.cursor', 'commands', 'cohesive-feature-implement.md');
    const codexFile = path.join(root, '.codex', 'skills', 'aidlc-cohesive-feature-implement', 'SKILL.md');
    const opencodeFile = path.join(root, '.opencode', 'commands', 'cohesive-feature-implement.md');
    expect(fs.existsSync(cursorFile)).toBe(true);
    expect(fs.readFileSync(cursorFile, 'utf8')).not.toMatch(/^---\n/);
    expect(fs.existsSync(codexFile)).toBe(true);
    expect(fs.readFileSync(codexFile, 'utf8')).toContain('disable-model-invocation: true');
    expect(fs.existsSync(opencodeFile)).toBe(true);
    expect(fs.readFileSync(opencodeFile, 'utf8')).toContain('model: opencode/big-pickle');

    const opencodeAutonomousFile = path.join(root, '.opencode', 'commands', 'aidlc-autonomous-epic.md');
    expect(fs.readFileSync(opencodeAutonomousFile, 'utf8')).toContain('model: opencode/big-pickle');

    const claudeFile = path.join(root, '.claude', 'commands', 'cohesive-feature-implement.md');
    expect(fs.existsSync(claudeFile)).toBe(false);
  });
});
