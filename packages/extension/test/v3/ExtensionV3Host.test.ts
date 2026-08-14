import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { AidlcApplication } from '@aidlc/core';

import { ExtensionV3Host, toApplicationCommandName } from '../../src/v3/ExtensionV3Host';
import { V3_COMMAND_NAMES } from '../../src/webview/v3/contracts';

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
    const hostNames = new Set(['capability.ast.graph.open', 'capability.annotation.open', 'architecture.source.open', 'cohesive.upgrade.open']);
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

  it('projects legacy sidebar state without requiring a migration first', () => {
    const root = tempWorkspace();
    const epicDir = path.join(root, 'docs', 'epics', 'EPIC-LEGACY');
    fs.mkdirSync(epicDir, { recursive: true });
    fs.mkdirSync(path.join(root, 'docs', 'project', 'context'), { recursive: true });
    fs.writeFileSync(path.join(epicDir, 'state.json'), JSON.stringify({
      id: 'EPIC-LEGACY', title: 'Existing feature', status: 'done', runMode: 'autonomous', createdAt: '2026-08-14T00:00:00.000Z',
      stepStates: [{ status: 'done', finishedAt: '2026-08-14T00:01:00.000Z', artifactsProduced: ['docs/epics/EPIC-LEGACY/artifacts/SPEC.md'] }],
    }));
    fs.writeFileSync(path.join(root, 'docs', 'project', 'context', 'CONTEXT-MANIFEST.json'), JSON.stringify({ revision: 2 }));

    const state = new ExtensionV3Host({ workspaceRoot: () => root }).workspaceState() as {
      project: { readiness: string; contextRevision?: string };
      epics: Array<{ id: string; status: string; autonomy: string; artifacts: Array<{ path: string }> }>;
    };

    expect(state.project).toMatchObject({ readiness: 'ready', contextRevision: '2' });
    expect(state.epics).toContainEqual(expect.objectContaining({ id: 'EPIC-LEGACY', status: 'completed', autonomy: 'unattended' }));
    expect(state.epics[0]?.artifacts).toContainEqual(expect.objectContaining({ path: 'docs/epics/EPIC-LEGACY/artifacts/SPEC.md' }));
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
});
