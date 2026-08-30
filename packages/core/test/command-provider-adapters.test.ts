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
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === 'aidlc-workflow')!;
    const preset = loadBuiltinPreset(builtinTemplatesRoot(), workflow);
    const phase = workflowCommandPhases(workflow).find((p) => p.phase.id === 'implement')!.phase;
    const skillBody = preset.skillContents.implement;
    const commandName = pipelineCommandId(workflow.pipelineId, 'implement');
    const spec = buildStepCommandSpec(phase, skillBody, 'docs/epics', commandName);

    const claude = getCommandProviderAdapter('claude').renderCommandFile(spec, 'claude-opus-5');
    const cursor = getCommandProviderAdapter('cursor').renderCommandFile(spec, 'claude-opus-4-8');
    const codex = getCommandProviderAdapter('codex').renderCommandFile(spec, 'o3');
    const opencode = getCommandProviderAdapter('opencode').renderCommandFile(spec, 'silvertiger/glm-5.3');

    expect(claude).toMatch(/^---\n/);
    expect(claude).toContain('model: claude-opus-5');
    expect(cursor).toMatch(/^---\n/);
    expect(cursor).toContain(`name: ${commandName}`);
    expect(cursor.split('---')[1]).not.toContain('model:');
    expect(codex).toContain('disable-model-invocation: true');
    expect(codex).toContain('name: aidlc-aidlc-workflow-full-implement');
    expect(claude).toContain('## Task');
    expect(cursor).toContain('## Task');
    expect(codex).toContain('## Task');
    expect(opencode).toContain('model: silvertiger/glm-5.3');
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
    expect(store.mapModel('claude-opus-5', 'opencode')).toBe('silvertiger/glm-5.3');
  });

  // Artifact paths are baked with the conventional `docs/epics` prefix in
  // presets/builtinWorkflows.ts. Passing a non-default epicRoot must rewrite
  // that prefix in the "## Task" instructions the runner composes — otherwise
  // the agent writes under `docs/epics` regardless of the workspace's active
  // epics directory.
  it('rewrites the baked docs/epics prefix in Task instructions to the active epicRoot', () => {
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === 'aidlc-workflow')!;
    const preset = loadBuiltinPreset(builtinTemplatesRoot(), workflow);
    const phase = workflowCommandPhases(workflow).find((p) => p.phase.id === 'plan')!.phase;
    const skillBody = preset.skillContents.plan;
    const commandName = pipelineCommandId(workflow.pipelineId, 'plan');
    const spec = buildStepCommandSpec(phase, skillBody, '.aidlc/epics', commandName);
    const taskSection = spec.body.slice(spec.body.indexOf('## Task'));

    expect(taskSection).not.toContain('docs/epics');
    expect(taskSection).toContain('.aidlc/epics/$ARGUMENTS/artifacts/');
  });

  it('uses only verified read-only provider modes for discovery', () => {
    const prompt = 'Discuss SHAPE-001 only.';
    const claude = getCommandProviderAdapter('claude').buildDiscoveryInvocation({ prompt })!;
    const cursor = getCommandProviderAdapter('cursor').buildDiscoveryInvocation({ prompt })!;
    const codex = getCommandProviderAdapter('codex').buildDiscoveryInvocation({ prompt })!;
    expect(claude.argv).toContain('--permission-mode');
    expect(claude.argv).toContain('plan');
    expect(cursor.argv).toContain('--mode');
    expect(cursor.argv).toContain('ask');
    expect(codex.argv).toContain('--sandbox');
    expect(codex.argv).toContain('read-only');
    expect(codex.argv).not.toContain('workspace-write');
    expect(getCommandProviderAdapter('opencode').buildDiscoveryInvocation({ prompt })).toBeNull();
  });

  it('opens provider-native interactive sessions for human questions', () => {
    const prompt = 'Read the project and ask only what changes the outcome.';
    expect(getCommandProviderAdapter('claude').buildInteractiveInvocation({ prompt }).shellOneLiner)
      .toContain('claude --permission-mode plan');
    expect(getCommandProviderAdapter('cursor').buildInteractiveInvocation({ prompt }).shellOneLiner)
      .toContain('agent --mode ask');
    const codex = getCommandProviderAdapter('codex').buildInteractiveInvocation({ prompt }).shellOneLiner!;
    expect(codex).toContain('codex --sandbox read-only --no-alt-screen');
    expect(codex).not.toContain('codex exec');
    expect(getCommandProviderAdapter('opencode').buildInteractiveInvocation({ prompt }).shellOneLiner)
      .toContain('opencode --prompt');
  });

  it('keeps a provider-managed native session interactive while allowing it to save checkpoints', () => {
    const prompt = 'Own IDEA-001 and persist its state.';
    const claude = getCommandProviderAdapter('claude').buildInteractiveInvocation({ prompt, allowWorkspaceWrite: true });
    expect(claude.shellOneLiner).not.toContain('--permission-mode plan');
    const cursor = getCommandProviderAdapter('cursor').buildInteractiveInvocation({ prompt, allowWorkspaceWrite: true });
    expect(cursor.shellOneLiner).not.toContain('--mode ask');
    const codex = getCommandProviderAdapter('codex').buildInteractiveInvocation({ prompt, allowWorkspaceWrite: true });
    expect(codex.shellOneLiner).toContain('codex --sandbox workspace-write --no-alt-screen');
    expect(codex.shellOneLiner).not.toContain('codex exec');
  });
});
