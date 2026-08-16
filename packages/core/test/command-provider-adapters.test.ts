import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BUILTIN_WORKFLOWS,
  buildStepCommandSpec,
  getCommandProviderAdapter,
  loadBuiltinPreset,
  ModelProviderConfigStore,
  pipelineCommandId,
  workflowCommandPhases,
  builtinTemplatesRoot,
} from '../src';

describe('CommandProviderAdapter', () => {
  it('renders provider-specific command formats from the same StepCommandSpec', () => {
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === 'cohesive-delivery')!;
    const preset = loadBuiltinPreset(builtinTemplatesRoot(), workflow);
    const phase = workflowCommandPhases(workflow).find((p) => p.phase.id === 'implement')!.phase;
    const skillBody = preset.skillContents.implement;
    const commandName = pipelineCommandId('feature-implement', 'implement');
    const spec = buildStepCommandSpec(phase, skillBody, 'docs/epics', commandName);

    const claude = getCommandProviderAdapter('claude').renderCommandFile(spec, 'claude-opus-5');
    const cursor = getCommandProviderAdapter('cursor').renderCommandFile(spec, 'claude-opus-4-8');
    const codex = getCommandProviderAdapter('codex').renderCommandFile(spec, 'o3');
    const opencode = getCommandProviderAdapter('opencode').renderCommandFile(spec, 'opencode/big-pickle');

    expect(claude).toMatch(/^---\n/);
    expect(claude).toContain('model: claude-opus-5');
    expect(cursor).not.toContain('model:');
    expect(cursor.startsWith('# ')).toBe(true);
    expect(codex).toContain('disable-model-invocation: true');
    expect(codex).toContain('name: aidlc-feature-implement-implement');
    expect(claude).toContain('## Task');
    expect(cursor).toContain('## Task');
    expect(codex).toContain('## Task');
    expect(opencode).toContain('model: opencode/big-pickle');
    expect(opencode).toContain('## Task');
  });

  it('maps claude-opus-5 to cursor bundled id', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-map-'));
    const store = new ModelProviderConfigStore(root);
    expect(store.mapModel('claude-opus-5', 'cursor')).toBe('claude-opus-4-8');
  });

  it('maps models to OpenCode provider/model identifiers', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-opencode-map-'));
    const store = new ModelProviderConfigStore(root);
    expect(store.mapModel('claude-opus-5', 'opencode')).toBe('opencode/big-pickle');
  });
});
