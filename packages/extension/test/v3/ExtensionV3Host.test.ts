import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { AidlcApplication } from '@aidlc/core';
import { PipelineRunStore, StepRunner, type Pipeline } from '@aidlc/core';

import { ExtensionV3Host, toApplicationCommandName } from '../../src/v3/ExtensionV3Host';

/**
 * Snapshot of the command names the (now mock-driven, rebuilt) webview/v3 UI
 * used to declare in its `contracts/client.ts` before the pixel-perfect
 * redesign replaced that module. Kept here, inlined, purely as a regression
 * check that the host-side dispatch table this file exercises hasn't lost
 * coverage for any of them — this is host-only test fixture data now, not a
 * shared contract with the webview.
 */
const V3_COMMAND_NAMES = [
  'project.analyze', 'project.context.refresh', 'project.context.status', 'project.recommend',
  'epic.create', 'epic.prepare', 'epic.next', 'epic.status', 'epic.explain', 'epic.resume', 'epic.review', 'epic.ship',
  'epic.stage.autonomy.set', 'gate.approve', 'gate.reject', 'recovery.apply', 'workflow.compile', 'model.diagnose',
  'artifact.policy.update', 'model.provider.default.set', 'capability.enabled.set', 'capability.ast.graph.open', 'capability.annotation.open', 'epic.review.feedback',
  'migration.preview',
  'registry.pipeline.run', 'registry.step.run', 'registry.step.rerun', 'registry.gate.approve', 'registry.gate.reject',
  'registry.step.complete', 'preset.redrawDesign.apply',
] as const;

const roots: string[] = [];

function tempWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-v3-host-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('ExtensionV3Host', () => {
  it('uses the shared application command names at the migration edge', () => {
    expect(toApplicationCommandName('epic.create')).toBe('epic.start');
    expect(toApplicationCommandName('project.context.refresh')).toBe('project.context.refresh');
    expect(toApplicationCommandName('epic.resume')).toBe('epic.resume');
  });

  it('routes every browser command to the shared application bus or an explicit host capability', () => {
    const app = new AidlcApplication(tempWorkspace());
    const applicationNames = new Set(app.bus.names());
    // Registry/preset commands are intentionally dispatched by the VS Code
    // host adapter: they write project files and open visible terminals, not
    // the in-process application command bus.
    const hostNames = new Set([
      'capability.ast.graph.open', 'capability.annotation.open',
      'registry.pipeline.run', 'registry.step.run', 'registry.step.rerun', 'registry.step.complete',
      'registry.gate.approve', 'registry.gate.reject', 'preset.redrawDesign.apply',
    ]);
    const missing = V3_COMMAND_NAMES.filter((name) => !hostNames.has(name) && !applicationNames.has(toApplicationCommandName(name)));
    expect(missing).toEqual([]);
  });

  it('dispatches a V3 envelope through the application client and returns a typed result', async () => {
    const root = tempWorkspace();
    const host = new ExtensionV3Host({ workspaceRoot: () => root });
    const result = await host.handleMessage({
      type: 'aidlc.v3.command',
      command: { id: 'ui-1', name: 'epic.create', payload: { id: 'EPIC-V3', title: 'V3 panel host' } },
    });
    expect(result).toMatchObject({ commandId: 'ui-1', status: 'ok' });
    const state = host.workspaceState() as { epics: Array<{ id: string; nextAction?: { command?: string } }>; workflowPacks: unknown[] };
    expect(state.epics).toEqual([expect.objectContaining({ id: 'EPIC-V3', nextAction: expect.objectContaining({ command: 'epic.prepare' }) })]);
    expect(state.workflowPacks.length).toBeGreaterThan(0);
  });

  it('turns missing workspace errors into a typed result', async () => {
    const host = new ExtensionV3Host({ workspaceRoot: () => undefined });
    const result = await host.handleMessage({
      type: 'aidlc.v3.command',
      command: { id: 'ui-2', name: 'project.analyze', payload: {} },
    });
    expect(result).toMatchObject({ commandId: 'ui-2', status: 'error' });
  });

  it('projects shipped agent and skill templates as starters, not saved assets', () => {
    const root = tempWorkspace();
    const templates = tempWorkspace();
    const agentDir = path.join(templates, 'sdlc', 'agents');
    const skillDir = path.join(templates, 'sdlc', 'skills');
    fs.mkdirSync(agentDir, { recursive: true }); fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'reviewer.md'), '---\nname: Reviewer\ndescription: Reviews changes\nmodel: claude-opus-5\ntools: [files, github]\n---\n# Reviewer\n');
    fs.writeFileSync(path.join(skillDir, 'review.md'), '---\nname: Review\ndescription: Review a diff\n---\n# Review\nUse a structured checklist.\n');
    const host = new ExtensionV3Host({ workspaceRoot: () => root, templateRoot: () => templates });
    const state = host.workspaceState() as { registry: { agents: unknown[]; skills: unknown[]; templates: Array<{ kind: string; agent?: { id: string; tier: string }; skill?: { body: string } }> } };
    expect(state.registry.agents).toEqual([]);
    expect(state.registry.skills).toEqual([]);
    expect(state.registry.templates).toContainEqual(expect.objectContaining({ kind: 'agent', agent: expect.objectContaining({ id: 'aidlc-sdlc-reviewer', tier: 'deep' }) }));
    expect(state.registry.templates).toContainEqual(expect.objectContaining({ kind: 'skill', skill: expect.objectContaining({ body: '# Review\nUse a structured checklist.' }) }));
  });

  it('publishes durable state subscriptions and projects artifact evidence', async () => {
    const root = tempWorkspace();
    const app = new AidlcApplication(root);
    const draft = app.epics.create({ id: 'EPIC-SUBSCRIBE', title: 'Subscribe', stages: [{
      id: 'understand', status: 'completed', autonomy: 'auto', finishedAt: '2026-08-09T00:00:00.000Z', actions: [{
        id: 'analysis', stageId: 'understand', name: 'Analysis', status: 'completed', evidence: [{ kind: 'artifact', ref: '.aidlc/runs/evidence.json', status: 'verified', label: 'Analysis evidence' }],
      }],
    }] });
    app.epics.transition(draft.id, 'ready', { expectedRevision: draft.revision });
    const host = new ExtensionV3Host({ workspaceRoot: () => root, applicationFactory: () => app });
    const states: Array<Record<string, unknown>> = [];
    const subscription = host.subscribe((state) => states.push(state));
    await host.handleMessage({ type: 'aidlc.v3.command', command: { id: 'status', name: 'epic.status', payload: { epicId: draft.id } } });
    expect(states).toHaveLength(1);
    const projected = states[0] as { epics: Array<{ artifacts: Array<{ path: string }> }> };
    expect(projected.epics[0].artifacts).toContainEqual(expect.objectContaining({ path: '.aidlc/runs/evidence.json' }));
    subscription.dispose();
    host.notifyDurableStateChanged();
    expect(states).toHaveLength(1);
  });

  it('performs typed registry CRUD, validates pipeline links, and guards active runs', async () => {
    const root = tempWorkspace();
    const host = new ExtensionV3Host({ workspaceRoot: () => root });
    const send = (name: string, payload: unknown) => host.handleMessage({ type: 'aidlc.v3.command', command: { id: `${name}-${Math.random()}`, name, payload } });
    await expect(send('registry.skill.create', { scope: 'project', skill: { id: 'test-plan', source: 'custom', description: 'Test plan', body: '# test' } })).resolves.toMatchObject({ status: 'ok' });
    await expect(send('registry.agent.create', { scope: 'project', agent: { id: 'test-agent', name: 'Test Agent', description: 'Runs tests', model: 'claude-sonnet', tier: 'balanced', skills: ['test-plan'], capabilities: ['files'] } })).resolves.toMatchObject({ status: 'ok' });
    const pipeline: Pipeline = { id: 'test-flow', source: 'project', version: '1.0.0', steps: [{ id: 'test', agent: 'test-agent', skills: ['test-plan'], outputs: ['test.md'], autoReview: false, humanReview: true, onReject: { rerun: 'test', withFeedback: true } }] };
    await expect(send('registry.pipeline.create', { pipeline })).resolves.toMatchObject({ status: 'ok' });
    const state = host.workspaceState() as { registry: { agents: Array<{ id: string; scope: string }>; pipelines: Array<{ id: string }> } };
    expect(state.registry.agents).toContainEqual(expect.objectContaining({ id: 'test-agent', scope: 'project' }));
    expect(state.registry.pipelines).toContainEqual(expect.objectContaining({ id: 'test-flow' }));
    await expect(send('registry.agent.update', { scope: 'project', agent: { id: 'test-agent', name: 'Test Agent', description: 'Updated test runner', model: 'claude-sonnet', tier: 'balanced', skills: ['test-plan'], capabilities: ['files'] } })).resolves.toMatchObject({ status: 'ok' });
    const updatedPipeline = { ...pipeline, version: '2.0.0' };
    await expect(send('registry.pipeline.update', { pipeline: updatedPipeline })).resolves.toMatchObject({ status: 'ok' });
    expect(fs.readFileSync(path.join(root, '.claude', 'commands', 'aidlc-test-flow.md'), 'utf8')).toContain('v2.0.0');
    await expect(send('registry.pipeline.create', { pipeline: { ...pipeline, id: 'broken-flow', steps: [{ ...pipeline.steps[0], agent: 'missing-agent' }] } })).resolves.toMatchObject({ status: 'error' });
    await expect(send('registry.pipeline.create', { pipeline: { ...pipeline, id: 'unsafe-flow', steps: [{ ...pipeline.steps[0], id: 'unsafe', gate: 'merge_default_branch', humanReview: false }] } })).resolves.toMatchObject({ status: 'error' });
    await expect(send('registry.agent.delete', { id: 'test-agent', scope: 'project' })).resolves.toMatchObject({ status: 'error' });
    const runner = new StepRunner(new PipelineRunStore(root));
    let run = runner.ensureStarted(updatedPipeline, 'EPIC-ACTIVE');
    await expect(send('registry.pipeline.delete', { id: 'test-flow' })).resolves.toMatchObject({ status: 'error' });
    run = runner.runStep(updatedPipeline, run, 'test', { kind: 'user', id: 'test' });
    run = runner.completeStep(updatedPipeline, run, 'test', { kind: 'user', id: 'test' });
    runner.approve(updatedPipeline, run, 'test', { kind: 'user', id: 'test' });
    await expect(send('registry.pipeline.delete', { id: 'test-flow' })).resolves.toMatchObject({ status: 'ok' });
    expect(fs.existsSync(path.join(root, '.claude', 'commands', 'aidlc-test-flow.md'))).toBe(false);
    await expect(send('registry.agent.delete', { id: 'test-agent', scope: 'project' })).resolves.toMatchObject({ status: 'ok' });
    await expect(send('registry.skill.delete', { id: 'test-plan', scope: 'project' })).resolves.toMatchObject({ status: 'ok' });
  });
});
