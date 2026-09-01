import type { Idea, IdeaStage } from '../contracts/idea';
import { IDEA_STAGES } from '../contracts/idea';

/** One Definition-of-Done rule for a stage. `optional` rules never block `canAdvance`. */
export interface DoDRule {
  id: string;
  level: 'required' | 'optional';
  label: string;
  check: (idea: Idea) => boolean;
}

export interface DoDCheckResult {
  id: string;
  level: 'required' | 'optional';
  label: string;
  passed: boolean;
}

export interface StageStatus {
  stage: IdeaStage;
  requirements: DoDCheckResult[];
  /** Fraction of *required* rules passed, 0..1. */
  completion: number;
  canAdvance: boolean;
  needsReview: boolean;
}

function nonEmpty(value: string | undefined): boolean {
  return !!value && value.trim().length > 0;
}

function hasAnyFactFinding(idea: Idea): boolean {
  return idea.research.findings.some((f) => f.type === 'fact');
}

/**
 * Centralized Definition of Done — spec §8. Every stage-completion question
 * in the UI or `IdeaService` must route through here; nothing hardcodes a
 * field-presence check anywhere else.
 */
export const STAGE_DOD: Record<IdeaStage, DoDRule[]> = {
  understand: [
    { id: 'problem', level: 'required', label: 'Problem', check: (i) => nonEmpty(i.understand.problem) },
    { id: 'context', level: 'required', label: 'Context', check: (i) => nonEmpty(i.understand.context) },
    { id: 'users', level: 'required', label: 'At least one user/use case', check: (i) => i.understand.users.length >= 1 },
    { id: 'assumptions', level: 'optional', label: 'Assumptions', check: (i) => i.understand.assumptions.length >= 1 },
    { id: 'unknowns', level: 'optional', label: 'Unknowns', check: (i) => i.understand.unknowns.length >= 1 },
  ],
  research: [
    { id: 'findings', level: 'required', label: 'At least 2 meaningful findings', check: (i) => i.research.findings.length >= 2 },
    { id: 'existingSolutions', level: 'required', label: 'At least one existing approach', check: (i) => i.research.existingSolutions.length >= 1 },
    {
      id: 'sources',
      level: 'required',
      label: 'At least one source/evidence when a finding claims a fact',
      check: (i) => !hasAnyFactFinding(i) || i.research.sources.length >= 1,
    },
  ],
  explore: [
    { id: 'options', level: 'required', label: 'At least 2 realistic options', check: (i) => i.explore.options.length >= 2 },
    {
      id: 'prosCons',
      level: 'required',
      label: 'Pros and cons for each option',
      check: (i) => i.explore.options.length > 0 && i.explore.options.every((o) => o.pros.length >= 1 && o.cons.length >= 1),
    },
    {
      id: 'validation',
      level: 'required',
      label: 'At least one validation idea',
      check: (i) => i.explore.validations.length >= 1 || i.explore.options.some((o) => nonEmpty(o.validation)),
    },
  ],
  decide: [
    { id: 'status', level: 'required', label: 'Decision', check: (i) => !!i.decision.status },
    { id: 'recommendation', level: 'required', label: 'Recommendation', check: (i) => nonEmpty(i.decision.recommendation) },
    { id: 'finalIdea', level: 'required', label: 'Final rewritten idea', check: (i) => nonEmpty(i.decision.finalIdea) },
    { id: 'nextStep', level: 'required', label: 'Next step', check: (i) => nonEmpty(i.decision.nextStep) },
  ],
  // Ready has no Definition of Done of its own — it is reached only via
  // IdeaService.markReady(), gated on the Decide stage's DoD (see canAdvance).
  ready: [],
};

function checkStage(idea: Idea, stage: IdeaStage): DoDCheckResult[] {
  return STAGE_DOD[stage].map((rule) => ({ id: rule.id, level: rule.level, label: rule.label, passed: rule.check(idea) }));
}

/** Which stage's Definition of Done gates leaving `idea.stage` forward — `ready` is a destination, not a gate. */
function gatingStage(stage: IdeaStage): IdeaStage {
  return stage === 'ready' ? 'decide' : stage;
}

export function getStageStatus(idea: Idea, stage: IdeaStage = idea.stage): StageStatus {
  const requirements = checkStage(idea, gatingStage(stage));
  const required = requirements.filter((r) => r.level === 'required');
  const completion = required.length === 0 ? 1 : required.filter((r) => r.passed).length / required.length;
  return {
    stage,
    requirements,
    completion,
    canAdvance: required.every((r) => r.passed),
    needsReview: !!idea.needsReview,
  };
}

export function getMissingRequirements(idea: Idea, stage: IdeaStage = idea.stage): DoDCheckResult[] {
  return checkStage(idea, gatingStage(stage)).filter((r) => r.level === 'required' && !r.passed);
}

export function getCompletion(idea: Idea, stage: IdeaStage = idea.stage): number {
  return getStageStatus(idea, stage).completion;
}

/** True when every required rule for the CURRENT stage passes — i.e. the idea may move to the next stage. */
export function canAdvance(idea: Idea): boolean {
  if (idea.stage === 'ready') return false;
  return getMissingRequirements(idea, idea.stage).length === 0;
}

export function getNextStage(idea: Idea): IdeaStage | null {
  const idx = IDEA_STAGES.indexOf(idea.stage);
  if (idx < 0 || idx >= IDEA_STAGES.length - 1) return null;
  return IDEA_STAGES[idx + 1]!;
}

/** Pure stage transform — advances `idea.stage` by one. Callers persist and gate with `canAdvance` first. */
export function advanceStage(idea: Idea): Idea {
  const next = getNextStage(idea);
  if (!next) return idea;
  return { ...idea, stage: next };
}

/**
 * True when editing `changedStage`'s data should flag the idea for review —
 * i.e. `idea.stage` has already moved past `changedStage` (spec §9: "Decision
 * may need review because the Problem changed").
 */
export function isStageBehind(idea: Idea, changedStage: IdeaStage): boolean {
  return IDEA_STAGES.indexOf(idea.stage) > IDEA_STAGES.indexOf(changedStage);
}
