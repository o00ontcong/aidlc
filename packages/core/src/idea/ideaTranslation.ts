import type {
  Idea,
  IdeaDecision,
  IdeaExplore,
  IdeaResearch,
  IdeaTranslation,
  IdeaUnderstand,
} from '../contracts/idea';

/**
 * Pure merge helpers behind `IdeaService.applyTranslation()` — kept apart
 * from `IdeaService` so the "does this translation actually match the
 * idea's current shape" logic is unit-testable without a workspace on disk.
 * Every replacement is validated (matched by `id` where the field carries
 * one, matched by array length otherwise) and mismatches are collected into
 * `issues` rather than thrown immediately, so the caller can validate every
 * stage up front and apply nothing at all if any one of them doesn't match —
 * a translation must never partially land.
 */

function replaceIndexed(current: string[], translated: string[] | undefined, label: string, issues: string[]): string[] {
  if (translated === undefined) return current;
  if (translated.length !== current.length) {
    issues.push(`${label}: expected ${current.length} item(s), got ${translated.length}`);
    return current;
  }
  return translated;
}

function replaceById<T extends { id: string }, P extends { id: string }>(
  current: T[],
  translated: P[] | undefined,
  label: string,
  issues: string[],
  merge: (item: T, patch: P) => T,
): T[] {
  if (translated === undefined) return current;
  const currentIds = new Set(current.map((item) => item.id));
  for (const patch of translated) {
    if (!currentIds.has(patch.id)) issues.push(`${label}: no item with id "${patch.id}"`);
  }
  const patchById = new Map(translated.map((patch) => [patch.id, patch] as const));
  return current.map((item) => {
    const patch = patchById.get(item.id);
    return patch ? merge(item, patch) : item;
  });
}

export function mergeUnderstandTranslation(
  current: IdeaUnderstand,
  t: NonNullable<IdeaTranslation['understand']>,
  issues: string[],
): IdeaUnderstand {
  return {
    problem: t.problem ?? current.problem,
    context: t.context ?? current.context,
    users: replaceIndexed(current.users, t.users, 'understand.users', issues),
    assumptions: replaceIndexed(current.assumptions, t.assumptions, 'understand.assumptions', issues),
    unknowns: replaceIndexed(current.unknowns, t.unknowns, 'understand.unknowns', issues),
  };
}

export function mergeResearchTranslation(
  current: IdeaResearch,
  t: NonNullable<IdeaTranslation['research']>,
  issues: string[],
): IdeaResearch {
  return {
    findings: replaceById(current.findings, t.findings, 'research.findings', issues, (item, patch) => ({ ...item, text: patch.text })),
    sources: replaceById(current.sources, t.sources, 'research.sources', issues, (item, patch) => ({ ...item, question: patch.question })),
    existingSolutions: replaceById(
      current.existingSolutions,
      t.existingSolutions,
      'research.existingSolutions',
      issues,
      (item, patch) => ({ ...item, text: patch.text }),
    ),
    unknowns: replaceIndexed(current.unknowns, t.unknowns, 'research.unknowns', issues),
  };
}

export function mergeExploreTranslation(
  current: IdeaExplore,
  t: NonNullable<IdeaTranslation['explore']>,
  issues: string[],
): IdeaExplore {
  return {
    options: replaceById(current.options, t.options, 'explore.options', issues, (item, patch) => ({
      ...item,
      title: patch.title ?? item.title,
      description: patch.description ?? item.description,
      pros: replaceIndexed(item.pros, patch.pros, `explore.options[${item.id}].pros`, issues),
      cons: replaceIndexed(item.cons, patch.cons, `explore.options[${item.id}].cons`, issues),
      risks: replaceIndexed(item.risks, patch.risks, `explore.options[${item.id}].risks`, issues),
      tradeoffs: replaceIndexed(item.tradeoffs, patch.tradeoffs, `explore.options[${item.id}].tradeoffs`, issues),
      validation: patch.validation ?? item.validation,
    })),
    validations: replaceIndexed(current.validations, t.validations, 'explore.validations', issues),
  };
}

function nonEmpty(s: string | undefined): string | undefined { return s && s.trim() ? s : undefined; }
function nonEmptyArray(a: string[]): string[] | undefined { return a.length ? a : undefined; }

/**
 * The counterpart the translate agent actually reads: a snapshot of every
 * currently non-empty translatable field, in the exact shape
 * `applyTranslation()` expects back (see `IdeaAgentCommand.ts`'s
 * `ideaTranslateCommandBody()`) — ids kept so the agent can echo them back
 * unchanged, empty fields omitted so there's nothing pointless to translate.
 * Returns `null` when the idea has no translatable content at all yet.
 */
export function buildIdeaTranslationSnapshot(idea: Idea, language: 'en' | 'vi'): IdeaTranslation | null {
  const understand: NonNullable<IdeaTranslation['understand']> = {};
  if (nonEmpty(idea.understand.problem)) understand.problem = idea.understand.problem;
  if (nonEmpty(idea.understand.context)) understand.context = idea.understand.context;
  if (idea.understand.users.length) understand.users = idea.understand.users;
  if (idea.understand.assumptions.length) understand.assumptions = idea.understand.assumptions;
  if (idea.understand.unknowns.length) understand.unknowns = idea.understand.unknowns;

  const research: NonNullable<IdeaTranslation['research']> = {};
  if (idea.research.findings.length) research.findings = idea.research.findings.map((f) => ({ id: f.id, text: f.text }));
  const sourcesWithQuestions = idea.research.sources.filter((s) => s.question.trim());
  if (sourcesWithQuestions.length) research.sources = sourcesWithQuestions.map((s) => ({ id: s.id, question: s.question }));
  if (idea.research.existingSolutions.length) {
    research.existingSolutions = idea.research.existingSolutions.map((s) => ({ id: s.id, text: s.text }));
  }
  if (idea.research.unknowns.length) research.unknowns = idea.research.unknowns;

  const explore: NonNullable<IdeaTranslation['explore']> = {};
  if (idea.explore.options.length) {
    explore.options = idea.explore.options.map((o) => ({
      id: o.id,
      title: o.title,
      description: nonEmpty(o.description),
      pros: nonEmptyArray(o.pros),
      cons: nonEmptyArray(o.cons),
      risks: nonEmptyArray(o.risks),
      tradeoffs: nonEmptyArray(o.tradeoffs),
      validation: nonEmpty(o.validation),
    }));
  }
  if (idea.explore.validations.length) explore.validations = idea.explore.validations;

  const decision: NonNullable<IdeaTranslation['decision']> = {};
  if (nonEmpty(idea.decision.recommendation)) decision.recommendation = idea.decision.recommendation;
  if (nonEmpty(idea.decision.finalIdea)) decision.finalIdea = idea.decision.finalIdea;
  if (idea.decision.scope.length) decision.scope = idea.decision.scope;
  if (idea.decision.outOfScope.length) decision.outOfScope = idea.decision.outOfScope;
  if (nonEmpty(idea.decision.validation)) decision.validation = idea.decision.validation;
  if (idea.decision.successCriteria.length) decision.successCriteria = idea.decision.successCriteria;
  if (nonEmpty(idea.decision.nextStep)) decision.nextStep = idea.decision.nextStep;

  const hasUnderstand = Object.keys(understand).length > 0;
  const hasResearch = Object.keys(research).length > 0;
  const hasExplore = Object.keys(explore).length > 0;
  const hasDecision = Object.keys(decision).length > 0;
  if (!hasUnderstand && !hasResearch && !hasExplore && !hasDecision) return null;

  return {
    language,
    ...(hasUnderstand ? { understand } : {}),
    ...(hasResearch ? { research } : {}),
    ...(hasExplore ? { explore } : {}),
    ...(hasDecision ? { decision } : {}),
  };
}

export function mergeDecisionTranslation(
  current: IdeaDecision,
  t: NonNullable<IdeaTranslation['decision']>,
  issues: string[],
): IdeaDecision {
  return {
    ...current,
    recommendation: t.recommendation ?? current.recommendation,
    finalIdea: t.finalIdea ?? current.finalIdea,
    scope: replaceIndexed(current.scope, t.scope, 'decision.scope', issues),
    outOfScope: replaceIndexed(current.outOfScope, t.outOfScope, 'decision.outOfScope', issues),
    validation: t.validation ?? current.validation,
    successCriteria: replaceIndexed(current.successCriteria, t.successCriteria, 'decision.successCriteria', issues),
    nextStep: t.nextStep ?? current.nextStep,
  };
}
