import { nowIso } from '../contracts/common';
import type { Idea, IdeaDecision, IdeaResearch, IdeaStage, IdeaUnderstand } from '../contracts/idea';
import { emptyDecision, emptyExplore, emptyResearch, emptyUnderstand } from './stageContent';

const LEGACY_CHECKPOINTS = new Set(['preparing', 'awaiting_human', 'intent_drafted', 'route_proposed']);

const LEGACY_PHASE_TO_STAGE: Record<string, IdeaStage> = {
  spark: 'understand',
  research: 'research',
  // The "rewrite" phase produced a problem/outcome/appetite/no-gos draft —
  // pre-decision content, so Decide is the closest honest landing stage; its
  // (stricter) Definition of Done will naturally list what is still missing.
  rewrite: 'decide',
  ready: 'ready',
};

/** Same heuristic `journal.ts`'s `inferJournalPhase` used pre-migration, for records old enough to lack `journalPhase` entirely. */
function inferLegacyPhase(idea: Idea): 'spark' | 'research' | 'rewrite' | 'ready' {
  if (idea.checkpoint === 'in_delivery' || idea.checkpoint === 'completed') return 'ready';
  if (idea.checkpoint === 'route_proposed' || idea.checkpoint === 'intent_drafted') return 'ready';
  if (idea.prep.status === 'done' && idea.prep.questions.length > 0) return 'rewrite';
  if (idea.prep.selfAnswered.length > 0) return 'research';
  return 'spark';
}

/**
 * Runs on every `IdeaStore.load()` (see `IdeaStore.ts`) — lazy, no batch
 * migration script, exactly like the legacy-checkpoint fix it now also
 * absorbs. Converts:
 *  1. A legacy provider-managed checkpoint (`preparing`/`awaiting_human`/
 *     `intent_drafted`/`route_proposed`) back to `captured`.
 *  2. `schemaVersion: 1` records (the old 4-phase journal, or older still)
 *     into the `schemaVersion: 2` Understand/Research/Explore/Decide shape,
 *     best-effort. No data is dropped: `seedSentence` is untouched, sources
 *     and notes carry over, and everything that cannot be mapped cleanly
 *     just starts empty for the human to fill in — the stage's own
 *     Definition of Done (`workflow.ts`) then honestly reports what is
 *     still missing.
 */
export function migrateIdea(idea: Idea): Idea {
  let next = idea;
  if (LEGACY_CHECKPOINTS.has(next.checkpoint)) {
    next = { ...next, checkpoint: 'captured', blockedReason: undefined };
  }
  if (next.schemaVersion === 2) return next;

  const legacyPhase = next.journalPhase ?? inferLegacyPhase(next);
  const j = next.journal;
  const stage = LEGACY_PHASE_TO_STAGE[legacyPhase] ?? 'understand';

  const understand: IdeaUnderstand = emptyUnderstand();
  if (j?.rewrite.problem.trim()) understand.problem = j.rewrite.problem.trim();

  const research: IdeaResearch = emptyResearch();
  research.sources = j?.sources ?? [];
  research.findings = (j?.notes ?? []).map((note) => ({
    id: note.id,
    text: note.text,
    // Never inherited as `fact` — an unreviewed old note is, at best, an
    // unverified inference (spec §5: never present an AI note as verified fact).
    type: 'inference' as const,
    sourceIds: [],
    createdBy: note.origin === 'ai' ? 'ai' as const : 'user' as const,
    createdAt: note.at,
  }));

  const explore = emptyExplore();

  const decision: IdeaDecision = emptyDecision();
  if (j?.rewrite.problem.trim()) decision.finalIdea = j.rewrite.problem.trim();
  if (j?.rewrite.outcome.trim()) decision.recommendation = j.rewrite.outcome.trim();
  if (j?.rewrite.appetite.trim()) decision.scope = [j.rewrite.appetite.trim()];
  if (j?.rewrite.noGos.trim()) decision.outOfScope = [j.rewrite.noGos.trim()];

  // A "ready"/in-delivery idea had already been treated as concluded under
  // the old, looser rules. If the new (stricter) Decide requirements are not
  // met, flag it — don't silently claim it still satisfies today's bar.
  // An idea still mid-flight (spark/research/rewrite) is not "wrong", just
  // unfinished — that is exactly what the stage's own missing-requirements
  // list already communicates, so it gets no extra flag here.
  const wasConcluded = legacyPhase === 'ready' || next.checkpoint === 'in_delivery' || next.checkpoint === 'completed';
  const decideDodMet = !!decision.status && !!decision.recommendation && !!decision.finalIdea && !!decision.nextStep;
  const needsReview = wasConcluded && !decideDodMet
    ? { reason: 'Migrated from the old 4-phase journal — re-check against the new Decide requirements.', since: nowIso() }
    : undefined;

  return {
    ...next,
    schemaVersion: 2,
    stage,
    understand,
    research,
    explore,
    decision,
    readyRecipeId: j?.readyRecipeId,
    readyEpicTitle: j?.readyEpicTitle,
    needsReview,
    pendingActions: next.pendingActions ?? [],
    journalPhase: undefined,
    journal: undefined,
  };
}
