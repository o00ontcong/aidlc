import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { IdeaService } from '@aidlc/core';

import { buildIdeaRoutePrompt } from '../src/v2/providerRunLogic';
import { extractJsonObject } from '../src/v2/ideaPrepResult';
import { readIdeaRouteResult } from '../src/v2/ideaRouteResult';

function root(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-idea-route-')); }

const AGENT = { kind: 'agent' as const, id: 'idea-route-agent' };

/** Realistic messy CLI output: fenced JSON with surrounding chat prose. */
function fenced(payload: unknown): string {
  return ["Based on what I found:", '```json', JSON.stringify(payload), '```', 'Hope that helps!'].join('\n');
}

describe('Idea routing pipeline end to end', () => {
  it('routes a single new-behavior sentence to cofofo-feature, and IdeaService prepends bootstrap since no Foundation exists', () => {
    const workspaceRoot = root();
    const ideas = new IdeaService(workspaceRoot);
    const created = ideas.create({ seedSentence: 'Warn me when it gets dangerously hot.' });
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const drafted = ideas.completePrep(prepping.id, prepping.ideaRevision, { selfAnswered: [], questions: [] }, AGENT);
    expect(drafted.checkpoint).toBe('intent_drafted');

    const prompt = buildIdeaRoutePrompt({ ideaId: drafted.id, intentBrief: '# Intent\n\nWarn on heat.', language: 'en' });
    expect(prompt).toContain('cofofo-feature');
    expect(prompt).toContain('Do not ever propose "cofofo-bootstrap"');

    const raw = fenced({
      outcome: 'epics',
      steps: [{ recipeId: 'cofofo-feature', epicTitle: 'Heat alert', rationale: 'New behavior, never worked before.' }],
    });
    const parsed = readIdeaRouteResult(extractJsonObject(raw));
    const proposed = ideas.generateRoute(drafted.id, drafted.ideaRevision, parsed, AGENT);

    expect(proposed.checkpoint).toBe('route_proposed');
    // The agent never mentioned bootstrap — IdeaService inserted it because
    // this workspace has no CoFoFo Foundation at all.
    expect(proposed.routeDraft?.steps.map((s) => s.recipeId)).toEqual(['cofofo-bootstrap', 'cofofo-feature']);
    expect(fs.readFileSync(path.join(workspaceRoot, 'docs/ideas', proposed.id, 'ROUTE.md'), 'utf8')).toContain('cofofo-bootstrap');
  });

  it('routes a "just a question" sentence straight to closed with the agent\'s research as EVIDENCE.md', () => {
    const workspaceRoot = root();
    const ideas = new IdeaService(workspaceRoot);
    const created = ideas.create({ seedSentence: 'Should we switch navigation libraries?' });
    const prepping = ideas.startPrep(created.id, created.ideaRevision, 'job-1', AGENT);
    const drafted = ideas.completePrep(prepping.id, prepping.ideaRevision, { selfAnswered: [], questions: [] }, AGENT);

    const raw = fenced({ outcome: 'close', evidence: '## Findings\n\nCurrent library already covers this case.' });
    const parsed = readIdeaRouteResult(extractJsonObject(raw));
    const closed = ideas.generateRoute(drafted.id, drafted.ideaRevision, parsed, AGENT);

    expect(closed.checkpoint).toBe('closed');
    expect(closed.routeConfirmed).toBe(false);
  });
});
