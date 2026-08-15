import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { getCommandProviderAdapter } from '@aidlc/core';

import {
  buildCodexRunPrompt,
  buildTaskPrompt,
  canonicalModelForSlash,
  slashCommandName,
  terminalNameForProvider,
} from '../src/v2/providerRunLogic';

describe('providerRunService', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('names terminal after provider display name', () => {
    expect(terminalNameForProvider('Cursor Agent')).toBe('AIDLC · Cursor Agent');
  });

  it('builds slash task prompt for claude/cursor', () => {
    expect(buildTaskPrompt('/cohesive-feature-implement', 'EPIC-1', '', 'claude', '/tmp'))
      .toBe('/cohesive-feature-implement EPIC-1');
  });

  it('resolves canonical model from slash stem', () => {
    const model = canonicalModelForSlash('/cohesive-feature-implement');
    expect(typeof model).toBe('string');
    expect(model!.length).toBeGreaterThan(0);
  });

  it('builds codex inline prompt from synced skill file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-codex-run-'));
    roots.push(root);
    const commandName = 'cohesive-feature-implement';
    const adapter = getCommandProviderAdapter('codex');
    const file = adapter.commandFilePath(root, commandName);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `---
name: aidlc-${commandName}
description: test
disable-model-invocation: true
---

Run implement for epic \`$ARGUMENTS\`.`, 'utf8');

    expect(buildCodexRunPrompt(root, `/cohesive-feature-implement`, 'EPIC-9', ''))
      .toContain('EPIC-9');
    expect(buildCodexRunPrompt(root, `/cohesive-feature-implement`, 'EPIC-9', ''))
      .not.toContain('$ARGUMENTS');
  });

  it('adapter one-shot argv matches provider CLI conventions', () => {
    const prompt = '/cohesive-feature-implement EPIC-1';
    expect(getCommandProviderAdapter('claude').buildOneShotInvocation({ slashOrPrompt: prompt }).shellOneLiner)
      .toMatch(/^claude '/);
    expect(getCommandProviderAdapter('cursor').buildOneShotInvocation({
      slashOrPrompt: prompt,
      mappedModel: 'gpt-5.2',
    }).shellOneLiner).toContain('agent --model gpt-5.2');
    expect(getCommandProviderAdapter('codex').buildOneShotInvocation({
      slashOrPrompt: prompt,
      mappedModel: 'o3',
    }).shellOneLiner).toContain('codex exec --model o3 --sandbox workspace-write');
    expect(getCommandProviderAdapter('opencode').buildOneShotInvocation({
      slashOrPrompt: prompt,
      mappedModel: 'openai/gpt-5.2',
    }).shellOneLiner).toContain('opencode run --model openai/gpt-5.2 --auto');
    expect(getCommandProviderAdapter('opencode').buildOneShotInvocation({
      slashOrPrompt: prompt,
      mappedModel: 'openai/gpt-5.2',
      cliBinary: 'custom-opencode',
    }).shellOneLiner).toContain('custom-opencode run --model openai/gpt-5.2 --auto');
  });

  it('parses slash command name', () => {
    expect(slashCommandName('/project-context-scan-project EPIC-1')).toBe('project-context-scan-project');
  });
});
