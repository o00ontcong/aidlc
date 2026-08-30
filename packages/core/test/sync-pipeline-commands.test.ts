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
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === 'aidlc-workflow')!;
    fs.writeFileSync(
      path.join(root, '.aidlc', 'workspace.yaml'),
      yaml.dump({
        pipelines: [{ id: workflow.pipelineId, steps: [] }],
      }),
    );

    syncPipelineCommandsForProvider(root, extPath, 'cursor');
    syncPipelineCommandsForProvider(root, extPath, 'codex');
    syncPipelineCommandsForProvider(root, extPath, 'opencode');

    const cursorFile = path.join(root, '.cursor', 'commands', 'aidlc-workflow-full-implement.md');
    const codexFile = path.join(root, '.codex', 'skills', 'aidlc-aidlc-workflow-full-implement', 'SKILL.md');
    const opencodeFile = path.join(root, '.opencode', 'commands', 'aidlc-workflow-full-implement.md');
    expect(fs.existsSync(cursorFile)).toBe(true);
    expect(fs.readFileSync(cursorFile, 'utf8')).toMatch(/^---\n/);
    expect(fs.readFileSync(cursorFile, 'utf8')).toContain('name: aidlc-workflow-full-implement');
    const cursorSkill = path.join(root, '.cursor', 'skills', 'aidlc-workflow-full-implement', 'SKILL.md');
    expect(fs.existsSync(cursorSkill)).toBe(true);
    const planSkill = path.join(root, '.cursor', 'skills', 'aidlc-workflow-full-plan', 'SKILL.md');
    expect(fs.existsSync(planSkill)).toBe(true);
    expect(fs.existsSync(codexFile)).toBe(true);
    expect(fs.readFileSync(codexFile, 'utf8')).toContain('disable-model-invocation: true');
    expect(fs.existsSync(opencodeFile)).toBe(true);
    expect(fs.readFileSync(opencodeFile, 'utf8')).toContain('model: silvertiger/glm-5.3');

    const opencodeAutonomousFile = path.join(root, '.opencode', 'commands', 'aidlc-provider-managed-task.md');
    expect(fs.readFileSync(opencodeAutonomousFile, 'utf8')).toContain('model: silvertiger/glm-5.3');

    const claudeFile = path.join(root, '.claude', 'commands', 'aidlc-workflow-full-implement.md');
    expect(fs.existsSync(claudeFile)).toBe(false);
  });

  it('rewrites baked-in docs/epics paths to a custom state.root before writing command files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-sync-epicsdir-'));
    roots.push(root);
    const extPath = builtinTemplatesRoot();

    fs.mkdirSync(path.join(root, '.aidlc'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.aidlc', 'workspace.yaml'),
      yaml.dump({
        state: { root: '.aidlc/epics' },
        pipelines: [{ id: 'aidlc-workflow-full', steps: [] }],
      }),
    );

    syncPipelineCommandsForProvider(root, extPath, 'cursor');

    const cursorFile = path.join(root, '.cursor', 'commands', 'aidlc-workflow-full-plan.md');
    const body = fs.readFileSync(cursorFile, 'utf8');
    expect(body).toContain('.aidlc/epics/$ARGUMENTS/state.json');
    expect(body).toContain('.aidlc/epics/$ARGUMENTS/artifacts/PRD.md');
    expect(body).not.toContain('docs/epics/$ARGUMENTS');
  });

  it('installs the provider-managed Idea command even before any delivery pipeline exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-sync-idea-native-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, '.aidlc'), { recursive: true });
    fs.writeFileSync(path.join(root, '.aidlc', 'workspace.yaml'), yaml.dump({ pipelines: [] }));

    syncPipelineCommandsForProvider(root, builtinTemplatesRoot(), 'codex');

    const commandFile = path.join(
      root,
      '.codex',
      'skills',
      'aidlc-aidlc-provider-managed-idea',
      'SKILL.md',
    );
    const body = fs.readFileSync(commandFile, 'utf8');
    expect(body).toContain('Own Idea `$ARGUMENTS` in this visible provider session');
    expect(body).toContain('provider-native UI');
    expect(body).toContain('watches those files and does not consume terminal output');
    expect(body).not.toContain('"humanAnswers"');
  });
});
