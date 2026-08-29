/**
 * Turning the routing agent's raw stdout into a `IdeaRouteDraft`. Mirrors
 * `ideaPrepResult.ts`'s narrowing style — drop what's malformed, throw only
 * when nothing usable survives.
 */

const RECIPE_IDS = [
  'cofofo-bootstrap',
  'cofofo-refresh-context',
  'cofofo-update-rules',
  'cofofo-repin-bundle',
  'cofofo-feature',
  'cofofo-bugfix',
] as const;

export type IdeaRouteRecipeId = typeof RECIPE_IDS[number];

export interface IdeaRouteResultStep {
  recipeId: IdeaRouteRecipeId;
  epicTitle: string;
  rationale: string;
}

export interface IdeaRouteResult {
  outcome: 'epics' | 'close';
  steps: IdeaRouteResultStep[];
  evidence?: string;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecipeId(value: unknown): value is IdeaRouteRecipeId {
  return typeof value === 'string' && (RECIPE_IDS as readonly string[]).includes(value);
}

/**
 * Narrow untrusted agent output to what `IdeaService.generateRoute` accepts.
 * Deliberately does NOT decide whether `cofofo-bootstrap` needs prepending —
 * that is a fact about the current Foundation, checked deterministically by
 * `IdeaService` itself, not something this parser or the agent should get to
 * assert on its own.
 */
export function readIdeaRouteResult(raw: unknown): IdeaRouteResult {
  const record = raw as Record<string, unknown>;

  if (record.outcome === 'close') {
    if (!isString(record.evidence)) {
      throw new Error('A close outcome requires non-empty research evidence.');
    }
    return { outcome: 'close', steps: [], evidence: record.evidence.trim() };
  }

  const stepsRaw = Array.isArray(record.steps) ? record.steps : [];
  const steps: IdeaRouteResultStep[] = stepsRaw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const e = entry as Record<string, unknown>;
    if (!isRecipeId(e.recipeId) || !isString(e.epicTitle) || !isString(e.rationale)) return [];
    return [{ recipeId: e.recipeId, epicTitle: e.epicTitle.trim(), rationale: e.rationale.trim() }];
  });
  if (steps.length === 0) {
    throw new Error('The agent response named no valid recipe steps and did not choose to close.');
  }
  return { outcome: 'epics', steps };
}
