import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { AidlcApplication } from '@aidlc/core';

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
  'quota.list', 'quota.refresh', 'quota.setEnabled',
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

  it('lists, refreshes, and toggles quota providers, and projects them into workspaceState().quota', async () => {
    const root = tempWorkspace();
    const host = new ExtensionV3Host({ workspaceRoot: () => root });

    const listed = await host.handleMessage({ type: 'aidlc.v3.command', command: { id: 'q1', name: 'quota.list', payload: {} } });
    expect(listed).toMatchObject({ commandId: 'q1', status: 'ok' });

    const refreshed = await host.handleMessage({ type: 'aidlc.v3.command', command: { id: 'q2', name: 'quota.refresh', payload: {} } });
    expect(refreshed).toMatchObject({ commandId: 'q2', status: 'ok' });
    const projected = (refreshed as { data: { cards: unknown[] } }).data;
    expect(projected.cards).toHaveLength(4); // claude-code, openai-codex, kimi, xai-grok

    const toggled = await host.handleMessage({
      type: 'aidlc.v3.command',
      command: { id: 'q3', name: 'quota.setEnabled', payload: { providerId: 'xai-grok', enabled: false } },
    });
    expect(toggled).toMatchObject({ commandId: 'q3', status: 'ok' });

    const state = host.workspaceState() as { quota: { cards: Array<{ provider: string; enabled: boolean }> } };
    expect(state.quota.cards).toHaveLength(4);
    expect(state.quota.cards.find((c) => c.provider === 'xAI (Grok)')).toMatchObject({ enabled: false, connected: false });
  });
});
