import { describe, expect, it } from 'vitest';

import { readIdeaRouteResult } from '../src/v2/ideaRouteResult';

describe('readIdeaRouteResult', () => {
  it('reads a single-recipe epics outcome', () => {
    const result = readIdeaRouteResult({
      outcome: 'epics',
      steps: [{ recipeId: 'cofofo-feature', epicTitle: 'Heat alert', rationale: 'New behavior.' }],
    });
    expect(result).toEqual({
      outcome: 'epics',
      steps: [{ recipeId: 'cofofo-feature', epicTitle: 'Heat alert', rationale: 'New behavior.' }],
    });
  });

  it('reads a multi-epic split', () => {
    const result = readIdeaRouteResult({
      outcome: 'epics',
      steps: [
        { recipeId: 'cofofo-feature', epicTitle: 'A', rationale: 'x' },
        { recipeId: 'cofofo-bugfix', epicTitle: 'B', rationale: 'y' },
      ],
    });
    expect(result.steps).toHaveLength(2);
  });

  it('reads a close outcome with evidence', () => {
    const result = readIdeaRouteResult({ outcome: 'close', evidence: 'Already supported, no build needed.' });
    expect(result).toEqual({ outcome: 'close', steps: [], evidence: 'Already supported, no build needed.' });
  });

  it('rejects a close outcome with no evidence', () => {
    expect(() => readIdeaRouteResult({ outcome: 'close' })).toThrow(/evidence/);
  });

  it('drops a step naming an unknown recipe id instead of failing the whole route', () => {
    const result = readIdeaRouteResult({
      outcome: 'epics',
      steps: [
        { recipeId: 'cofofo-feature', epicTitle: 'Good', rationale: 'x' },
        { recipeId: 'made-up-recipe', epicTitle: 'Bad', rationale: 'y' },
      ],
    });
    expect(result.steps.map((s) => s.epicTitle)).toEqual(['Good']);
  });

  it('never accepts cofofo-bootstrap from the agent as a valid recipe id — it is not in the classification set', () => {
    // cofofo-bootstrap IS a real recipe id, so this documents the contract at
    // the parser level: the parser itself does not forbid it (that would
    // duplicate IdeaService's deterministic check), it merely passes through
    // whatever the agent said. The prompt is what tells the agent never to
    // propose it, and IdeaService.generateRoute is what actually enforces
    // freshness — this test exists so a future reader does not "fix" the
    // parser into rejecting it and silently break that layering.
    const result = readIdeaRouteResult({
      outcome: 'epics',
      steps: [{ recipeId: 'cofofo-bootstrap', epicTitle: 'x', rationale: 'y' }],
    });
    expect(result.steps[0]!.recipeId).toBe('cofofo-bootstrap');
  });

  it('throws when no outcome is recognizable', () => {
    expect(() => readIdeaRouteResult({})).toThrow(/no valid recipe steps/);
    expect(() => readIdeaRouteResult({ outcome: 'epics', steps: [] })).toThrow(/no valid recipe steps/);
  });
});
