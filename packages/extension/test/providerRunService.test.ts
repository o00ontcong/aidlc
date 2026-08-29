import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { getCommandProviderAdapter } from '@aidlc/core';

import {
  buildCodexRunPrompt,
  buildHeadlessAnalysisInvocation,
  buildIdeaPrepPrompt,
  buildOpenCodeRunPrompt,
  buildTaskPrompt,
  canonicalModelForSlash,
  formatBugReportScreenshotSection,
  sanitizeBugScreenshotName,
  slashCommandName,
  terminalNameForProvider,
  uniqueBugScreenshotName,
  writeBugScreenshot,
  resolveRunnableModel,
} from '../src/v2/providerRunLogic';
import { parseCliModelList, parseCodexModels, parseOpenCodeModels } from '../src/v2/providerConfig';

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

  it('builds the Idea prep prompt with self-answer-first instructions and a strict JSON contract', () => {
    const prompt = buildIdeaPrepPrompt({ ideaId: 'IDEA-001', seedSentence: 'The list never refreshes.', language: 'vi' });
    expect(prompt).toContain('The list never refreshes.');
    expect(prompt).toContain('read before asking');
    expect(prompt).toContain('at least 3 questions survive');
    expect(prompt).toContain('dependsOn');
    expect(prompt).toContain('Write every human-readable string in Vietnamese');
    expect(prompt).toContain('"selfAnswered"');
    expect(prompt).not.toContain('undefined');
  });

  it('tells the prep agent not to repeat a self-answer a human already flagged wrong', () => {
    const prompt = buildIdeaPrepPrompt({
      ideaId: 'IDEA-001', seedSentence: 'x', language: 'en',
      excludeAnswers: ['Which nav library does this app use?'],
    });
    expect(prompt).toContain('already flagged wrong');
    expect(prompt).toContain('Which nav library does this app use?');
  });

  it('uses verified read-only headless modes for supported analysis providers', () => {
    expect(buildHeadlessAnalysisInvocation({ providerId: 'claude', cli: 'claude', prompt: 'plan' }).args)
      .toEqual(['--print', '--permission-mode', 'plan', 'plan']);
    expect(buildHeadlessAnalysisInvocation({ providerId: 'cursor', cli: 'agent', model: 'gpt-5', prompt: 'plan' }).args)
      .toEqual(['--print', '--output-format', 'text', '--mode', 'ask', '--model', 'gpt-5', 'plan']);
    expect(buildHeadlessAnalysisInvocation({ providerId: 'codex', cli: 'codex', prompt: 'plan' }).args)
      .toEqual(['exec', '--sandbox', 'read-only', 'plan']);
    expect(buildHeadlessAnalysisInvocation({ providerId: 'codex', cli: 'codex', model: 'gpt-5', prompt: 'plan' }).args)
      .toEqual(['exec', '--model', 'gpt-5', '--sandbox', 'read-only', 'plan']);
    expect(() => buildHeadlessAnalysisInvocation({ providerId: 'opencode', cli: 'opencode', prompt: 'plan' }))
      .toThrow(/verified read-only headless/i);
  });

  it('builds slash task prompt for claude/cursor', () => {
    expect(buildTaskPrompt('/aidlc-workflow-full-implement', 'EPIC-1', '', 'claude', '/tmp'))
      .toBe('/aidlc-workflow-full-implement EPIC-1');
  });

  it('stores multiple bug screenshots with unique names for the agent to read', () => {
    expect(sanitizeBugScreenshotName('Login crash.png')).toBe('Login-crash.png');
    expect(uniqueBugScreenshotName(['Login-crash.png'], 'Login crash.png')).toBe('Login-crash-2.png');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-bug-shots-'));
    roots.push(root);
    const first = writeBugScreenshot(root, 'EPIC-1', 'Login crash.png', Buffer.from('png-one'));
    const second = writeBugScreenshot(root, 'EPIC-1', 'Login crash.png', Buffer.from('png-two'));
    expect(first.fileName).toBe('Login-crash.png');
    expect(second.fileName).toBe('Login-crash-2.png');
    expect(first.relativePath).toBe('docs/epics/EPIC-1/artifacts/bug-screenshots/Login-crash.png');
    expect(fs.readFileSync(first.absPath, 'utf8')).toBe('png-one');
    expect(fs.readFileSync(second.absPath, 'utf8')).toBe('png-two');

    const section = formatBugReportScreenshotSection([first.relativePath, second.relativePath]);
    expect(section).toContain('## Screenshots');
    expect(section).toContain(first.relativePath);
    expect(section).toContain(second.relativePath);
    expect(() => writeBugScreenshot(root, '../../escape', 'x.png', Buffer.from('x'))).toThrow(/Unsafe/);
  });

  it('resolves canonical model from slash stem', () => {
    const model = canonicalModelForSlash('/aidlc-workflow-full-implement');
    expect(typeof model).toBe('string');
    expect(model!.length).toBeGreaterThan(0);
  });

  it('falls back to the provider default when a mapped model is unavailable', () => {
    expect(resolveRunnableModel(
      'opencode/not-installed',
      'silvertiger_tech/glm-5',
      new Set(['silvertiger_tech/glm-5']),
    )).toEqual({ model: 'silvertiger_tech/glm-5', fellBack: true });
  });

  it('parses the OpenCode model list for the provider dropdown', () => {
    expect(parseOpenCodeModels('opencode/big-pickle\nsilvertiger_tech/glm-5\nnot a model\n'))
      .toEqual(['opencode/big-pickle', 'silvertiger_tech/glm-5']);
  });

  it('parses Cursor and Codex model catalogs for the provider dropdown', () => {
    expect(parseCliModelList('\u001B[36mgpt-5.3-codex\u001B[0m - Codex 5.3\nauto - Auto\nAvailable models\n'))
      .toEqual(['gpt-5.3-codex', 'auto']);
    expect(parseCodexModels(JSON.stringify({ data: [
      { id: 'gpt-5.6-sol', model: 'gpt-5.6-sol' },
      { id: 'gpt-5.6-luna', model: 'gpt-5.6-luna' },
    ] }))).toEqual(['gpt-5.6-sol', 'gpt-5.6-luna']);
  });

  it('builds codex inline prompt from synced skill file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-codex-run-'));
    roots.push(root);
    const commandName = 'feature-implement-implement';
    const adapter = getCommandProviderAdapter('codex');
    const file = adapter.commandFilePath(root, commandName);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `---
name: aidlc-${commandName}
description: test
disable-model-invocation: true
---

Run implement for epic \`$ARGUMENTS\`.`, 'utf8');

    expect(buildCodexRunPrompt(root, `/feature-implement-implement`, 'EPIC-9', ''))
      .toContain('EPIC-9');
    expect(buildCodexRunPrompt(root, `/feature-implement-implement`, 'EPIC-9', ''))
      .not.toContain('$ARGUMENTS');
  });

  it('can inspect an OpenCode synced command file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-opencode-run-'));
    roots.push(root);
    const commandName = 'aidlc-provider-managed-task';
    const adapter = getCommandProviderAdapter('opencode');
    const file = adapter.commandFilePath(root, commandName);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `---\ndescription: test\nmodel: opencode/big-pickle\n---\n\nRun autonomous epic $ARGUMENTS.`, 'utf8');

    const prompt = buildOpenCodeRunPrompt(root, `/${commandName}`, 'PROJECT-CONTEXT', '');
    expect(prompt).toContain('Run autonomous epic PROJECT-CONTEXT.');
    expect(prompt).not.toContain('model:');
  });

  it('keeps OpenCode execution as a native slash command', () => {
    expect(buildTaskPrompt('/aidlc-provider-managed-task', 'PROJECT-CONTEXT', 'retry this', 'opencode', '/tmp'))
      .toBe('/aidlc-provider-managed-task PROJECT-CONTEXT');
  });

  it('expands a Cursor command file instead of passing Claude slash syntax', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cursor-run-'));
    roots.push(root);
    const commandName = 'annotate-artifact';
    const adapter = getCommandProviderAdapter('cursor');
    const file = adapter.commandFilePath(root, commandName);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '# Annotate\n\nReview artifact $ARGUMENTS.', 'utf8');

    const prompt = buildTaskPrompt(`/${commandName}`, 'EPIC-2 SPEC.md', '', 'cursor', root);
    expect(prompt).toContain('Review artifact EPIC-2 SPEC.md.');
    expect(prompt).not.toContain('/annotate-artifact');
  });

  it('adapter one-shot argv matches provider CLI conventions', () => {
    const prompt = '/feature-implement-implement EPIC-1';
    expect(getCommandProviderAdapter('claude').buildOneShotInvocation({ slashOrPrompt: prompt }).shellOneLiner)
      .toMatch(/^claude '/);
    expect(getCommandProviderAdapter('claude').buildOneShotInvocation({
      slashOrPrompt: prompt,
      mappedModel: 'claude-sonnet-5',
    }).shellOneLiner).toContain('claude --model claude-sonnet-5');
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
      mappedModel: 'opencode/big-pickle',
    }).shellOneLiner).toContain('opencode --model opencode/big-pickle --auto --prompt');
    expect(getCommandProviderAdapter('opencode').buildOneShotInvocation({
      slashOrPrompt: prompt,
      mappedModel: 'opencode/big-pickle',
      cliBinary: 'custom-opencode',
    }).shellOneLiner).toContain('custom-opencode --model opencode/big-pickle --auto --prompt');
  });

  it('parses slash command name', () => {
    expect(slashCommandName('/project-context-scan-project EPIC-1')).toBe('project-context-scan-project');
  });
});
