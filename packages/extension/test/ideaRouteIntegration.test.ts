import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { IdeaService, providerManagedIdeaCommandBody } from '@aidlc/core';

function root(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-idea-route-')); }

const AGENT = { kind: 'agent' as const, id: 'provider-native-idea-session' };

function draftedIdea(workspaceRoot: string) {
  const ideas = new IdeaService(workspaceRoot);
  const created = ideas.create({ seedSentence: 'Warn me when it gets dangerously hot.' });
  const preparing = ideas.startPrep(created.id, created.ideaRevision, 'visible-session', AGENT);
  return {
    ideas,
    drafted: ideas.completePrep(preparing.id, preparing.ideaRevision, { selfAnswered: [], questions: [] }, AGENT),
  };
}

describe('provider-managed Idea routing', () => {
  it('keeps routing in the same visible provider session and does not ask the panel to apply a result', () => {
    const command = providerManagedIdeaCommandBody();
    expect(command).toContain('From `intent_drafted`');
    expect(command).toContain('route_proposed');
    expect(command).toContain('EVIDENCE.md');
    expect(command).toContain('Do not create Epics or implement code.');
    expect(command).not.toContain('Use result');
  });

  it('persists a feature route directly and leaves the irreversible delivery confirmation to the person', () => {
    const workspaceRoot = root();
    const { ideas, drafted } = draftedIdea(workspaceRoot);
    const proposed = ideas.generateRoute(drafted.id, drafted.ideaRevision, {
      outcome: 'epics',
      steps: [{ recipeId: 'cofofo-feature', epicTitle: 'Heat alert', rationale: 'A new alert behavior is needed.' }],
    }, AGENT);

    expect(proposed.checkpoint).toBe('route_proposed');
    expect(proposed.routeConfirmed).toBe(false);
    expect(fs.readFileSync(path.join(workspaceRoot, 'docs', 'ideas', proposed.id, 'ROUTE.md'), 'utf8'))
      .toContain('Heat alert');
  });

  it('persists a no-build answer as a closed Idea with evidence', () => {
    const workspaceRoot = root();
    const { ideas, drafted } = draftedIdea(workspaceRoot);
    const closed = ideas.generateRoute(drafted.id, drafted.ideaRevision, {
      outcome: 'close',
      steps: [],
      evidence: '## Findings\n\nThe current library already supports the requested behavior.',
    }, AGENT);

    expect(closed.checkpoint).toBe('closed');
    expect(fs.readFileSync(path.join(workspaceRoot, 'docs', 'ideas', closed.id, 'EVIDENCE.md'), 'utf8'))
      .toContain('Findings');
  });
});
