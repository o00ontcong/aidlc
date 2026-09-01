import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { IdeaService, parseAgentProposal } from '../src';

function temporary(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-idea-natural-')); }
const USER = { kind: 'user' as const, id: 'owner' };

/**
 * Real repro for the "UI không đọc file md khi agent phân tích xong" bug:
 * an agentic CLI tool asked to work the Understand prompt wrote a normal
 * Markdown notes doc (`## Problem`, `## Context`, ...) instead of the exact
 * `### action_type` block format — the strict parser found zero blocks and
 * silently produced nothing importable.
 */
const AGENT_NOTES = `# IDEA-003 — UNDERSTAND stage notes

- **Idea:** IDEA-003
- **Stage:** UNDERSTAND (idea research — problem/context, not solution/architecture)

## Original idea

Build a tool that turns a rough strategy into a profitable one via backtesting.

## Problem

Independent traders have no reliable way to know whether a strategy idea is
genuinely profitable before risking real capital.

## Context

An independent trader working alone, without a dedicated quant team.

## Users / use cases

1. A trader who has a rule-based idea but lacks the statistics background to validate it.
2. A trader who wants a validated strategy to keep running without re-coding it.

## Assumptions

- Assumes the "raw strategy" can be expressed as explicit, backtestable rules.
- Assumes improved historical backtest metrics predict future profitability.

## Open unknowns

- What "long-term profitable" means quantitatively for this user.
- Which market/timeframe this tool should target first.

## Still missing before this stage can close

- A quantitative definition of success criteria.
`;

describe('parseAgentProposal — natural notes fallback (real repro)', () => {
  it('extracts Problem/Context/Users/Assumptions/Unknowns from a plain "## Field" notes doc', () => {
    const ideas = new IdeaService(temporary());
    const idea = ideas.create({ seedSentence: 'x' });
    const { actions, unparsed } = parseAgentProposal(AGENT_NOTES, 'understand', idea);

    expect(unparsed).toEqual([]);
    const byType = Object.fromEntries(actions.map((a) => [a.type, a]));
    expect(byType.set_problem).toMatchObject({ type: 'set_problem' });
    expect((byType.set_problem as { value: string }).value).toMatch(/genuinely profitable/);
    expect((byType.set_context as { value: string }).value).toMatch(/independent trader/i);
    expect(actions.filter((a) => a.type === 'add_user')).toHaveLength(2);
    expect(actions.filter((a) => a.type === 'add_assumption')).toHaveLength(2);
    expect(actions.filter((a) => a.type === 'add_unknown')).toHaveLength(2);
  });

  it('round-trips through IdeaService.importAgentProposal end to end', () => {
    const root = temporary();
    const ideas = new IdeaService(root);
    const created = ideas.create({ seedSentence: 'x' });
    const { idea, unparsed } = ideas.importAgentProposal(created.id, created.ideaRevision, 'understand', AGENT_NOTES, USER);
    expect(unparsed).toEqual([]);
    expect(idea.understand.users).toHaveLength(2);
    expect(idea.understand.assumptions).toHaveLength(2);
    expect(idea.understand.unknowns).toHaveLength(2);
    // Problem/Context are high-impact — queued for approval, not applied outright.
    expect(idea.understand.problem).toBe('');
    expect(idea.pendingActions.map((p) => p.actionType).sort()).toEqual(['set_context', 'set_problem']);
  });

  it('still prefers the strict "### action_type" format when present', () => {
    const ideas = new IdeaService(temporary());
    const idea = ideas.create({ seedSentence: 'x' });
    const strict = '### add_assumption\nStrict format assumption.';
    const { actions } = parseAgentProposal(strict, 'understand', idea);
    expect(actions).toEqual([{ type: 'add_assumption', value: 'Strict format assumption.' }]);
  });
});
