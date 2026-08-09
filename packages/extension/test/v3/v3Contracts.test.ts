import { describe, expect, it } from 'vitest';

import { ExtensionV3ApplicationClient, isExtensionV3InboundMessage } from '../../src/v3/ExtensionV3ApplicationClient';
import { AstGraphCapabilityAdapter } from '../../src/v3/capabilities/astGraph/AstGraphCapabilityAdapter';
import { AnnotationCapabilityAdapter } from '../../src/v3/capabilities/annotation/AnnotationCapabilityAdapter';
import {
  createV3ApplicationClient,
  createV3CommandFactory,
  currentEpic,
  visibleStages,
  type V3WorkspaceState,
} from '../../src/webview/v3/contracts';

const state: V3WorkspaceState = {
  project: { name: 'Trading iOS', readiness: 'ready', diagnostics: [] },
  currentEpicId: 'EPIC-2',
  epics: [
    {
      id: 'EPIC-1', title: 'First', type: 'feature', profile: 'quick', status: 'ready', autonomy: 'guide', updatedAt: '2026-08-09T00:00:00Z', artifacts: [], evidence: [], stages: [],
    },
    {
      id: 'EPIC-2', title: 'Second', type: 'feature', profile: 'standard', status: 'running', autonomy: 'auto', updatedAt: '2026-08-09T00:00:00Z', artifacts: [], evidence: [],
      stages: [
        { id: 'understand', status: 'completed' }, { id: 'plan', status: 'completed' }, { id: 'build', status: 'running' }, { id: 'verify', status: 'pending' }, { id: 'ship', status: 'pending' },
      ],
    },
  ],
  workflowPacks: [], providerDiagnostics: [], artifactPolicy: {}, capabilities: [],
  guide: { title: 'Guide', why: 'why', inputs: [], outputs: [], doneWhen: 'done', next: 'next', recovery: [] },
};

describe('v3 UI contract boundary', () => {
  it('selects the host-selected Epic and exposes at most five user stages', () => {
    const epic = currentEpic(state);
    expect(epic?.id).toBe('EPIC-2');
    expect(visibleStages(epic)).toHaveLength(5);
  });

  it('posts one typed command envelope rather than invoking VS Code commands', () => {
    const messages: unknown[] = [];
    const client = createV3ApplicationClient({ postMessage: (message) => messages.push(message) });
    const command = createV3CommandFactory('test', () => '1')('epic.resume', { epicId: 'EPIC-2' });
    client.dispatch(command);
    expect(messages).toEqual([{ type: 'aidlc.v3.command', command }]);
  });

  it('accepts only a valid v3 host envelope and delegates once', async () => {
    const calls: string[] = [];
    const client = new ExtensionV3ApplicationClient(async (command) => {
      calls.push(command.name);
      return { commandId: command.id, status: 'ok' };
    });
    expect(isExtensionV3InboundMessage({ type: 'aidlc.v3.command', command: { id: 'a', name: 'epic.resume' } })).toBe(true);
    expect(await client.handleMessage({ type: 'other' })).toBeUndefined();
    await client.handleMessage({ type: 'aidlc.v3.command', command: { id: 'a', name: 'epic.resume', payload: {} } });
    expect(calls).toEqual(['epic.resume']);
  });
});

describe('v3 contextual capability adapters', () => {
  it('does not open AST graph while policy disables it', async () => {
    let opened = false;
    const adapter = new AstGraphCapabilityAdapter(() => false, { openReport: async () => { opened = true; } });
    expect(await adapter.open()).toBe(false);
    expect(opened).toBe(false);
  });

  it('turns annotation feedback into a structured review payload without a second state machine', async () => {
    let opened = false;
    const adapter = new AnnotationCapabilityAdapter(() => true, { openArtifact: async () => { opened = true; } });
    expect(await adapter.open({ epicId: 'EPIC-2', artifactPath: 'docs/PLAN.md' })).toBe(true);
    expect(opened).toBe(true);
    expect(adapter.toReviewFeedback('plan', '  Request a risk section  ')).toEqual({ artifactId: 'plan', feedback: 'Request a risk section' });
    expect(adapter.toReviewFeedback('plan', '   ')).toBeUndefined();
  });
});
