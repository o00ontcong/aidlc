import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { ActorRef } from '../contracts/common';
import { nowIso } from '../contracts/common';
import {
  type Idea,
  type IdeaAssumption,
  type IdeaChild,
  type IdeaEvent,
  type IdeaFoundationSnapshot,
  type IdeaQuestion,
  type IdeaRouteDraft,
  type IdeaSelfAnswered,
} from '../contracts/idea';
import { epicsRoot, scaffoldEpic, type ScaffoldEpicArgs, type ScaffoldEpicResult } from '../runs/EpicScaffold';
import { CofofoFoundationService } from '../cofofo/FoundationService';
import type { PipelineConfig } from '../schema/WorkspaceSchema';
import { renderIdeaBrief } from './renderIdeaBrief';
import { IdeaRevisionConflictError, IdeaStore } from './IdeaStore';
import { writeFileAtomic } from '../epic/EpicStore';

/** Batch size cap from the flow graph's "ngân sách hiển thị" mechanism. */
const MAX_BATCH_SIZE = 5;
/** At most one supplementary batch for questions unblocked by the first round. */
const MAX_BATCH_ROUNDS = 2;
/** Gate rule from `discovery-gate.md`, reused verbatim for the same reason it exists there. */
const MIN_QUESTIONS_TO_ASK = 3;

export interface CreateIdeaInput {
  id?: string;
  seedSentence: string;
  title?: string;
  outputLanguage?: 'en' | 'vi';
  actor?: ActorRef;
}

/** One route step already resolved to a startable pipeline by the caller — the
 * one piece of this flow that is extension-only glue today (recipe id → real
 * pipeline via `assemblePipeline`, see `workspaceWebview.ts`'s
 * `assembleRecipeForEpic`). Core cannot do this step itself: it has no
 * workspace.yaml-mutation capability. */
export interface ResolvedRouteStep {
  recipeId: IdeaRouteDraft['steps'][number]['recipeId'];
  epicId: string;
  epicTitle: string;
  pipeline: PipelineConfig;
  scaffold: Omit<ScaffoldEpicArgs, 'workspaceRoot' | 'epicId' | 'title' | 'description' | 'target' | 'pipeline' | 'ideaProvenance'>;
}

export class IdeaStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdeaStateError';
  }
}

function eventId(): string { return crypto.randomUUID(); }

function actorOrSystem(actor: ActorRef | undefined): ActorRef {
  return actor ?? { kind: 'system', id: 'aidlc-ideas' };
}

function derivedTitle(seedSentence: string): string {
  const trimmed = seedSentence.trim();
  return trimmed.length <= 72 ? trimmed : `${trimmed.slice(0, 69)}...`;
}

/** `docs/ideas/<id>/` — human-readable artifacts, separate from `.aidlc/ideas/<id>/`'s
 * machine state (see docs/design/ideas-tab/ideas-redesign-cofofo.canvas.tsx). */
function docsIdeaDir(workspaceRoot: string, ideaId: string): string {
  return path.join(workspaceRoot, 'docs', 'ideas', ideaId);
}

/**
 * Coordinates the Idea lifecycle: one sentence → agent-assisted question
 * batch → routed handoff into exactly one of the six CoFoFo recipes, or a
 * clean close with no epic. Every transition here is one row of the
 * checkpoint table in docs/design/ideas-tab/ideas-tab-wireframe.canvas.tsx.
 */
export class IdeaService {
  readonly foundation: CofofoFoundationService;
  readonly store: IdeaStore;

  constructor(
    readonly workspaceRoot: string,
    options: { clock?: () => string; foundation?: CofofoFoundationService; store?: IdeaStore } = {},
  ) {
    this.clock = options.clock ?? nowIso;
    this.foundation = options.foundation ?? new CofofoFoundationService(workspaceRoot);
    this.store = options.store ?? new IdeaStore(workspaceRoot);
  }
  private readonly clock: () => string;

  /** `null` when no CoFoFo Foundation has ever published — capture never blocks on this (F01/C01). */
  private captureFoundationSnapshot(): IdeaFoundationSnapshot | null {
    try {
      const inspection = this.foundation.inspect();
      return inspection.status === 'ready' && inspection.snapshot ? inspection.snapshot : null;
    } catch {
      return null;
    }
  }

  list(): Idea[] { return this.store.list(); }
  get(id: string): Idea | null { return this.store.load(id); }
  require(id: string): Idea { return this.store.require(id); }

  nextId(): string {
    const largest = this.list().reduce((max, idea) => Math.max(max, Number(idea.id.slice('IDEA-'.length)) || 0), 0);
    return `IDEA-${String(largest + 1).padStart(3, '0')}`;
  }

  /** Capture is unconditional — no Foundation, no provider, no workspace.yaml required (F01/C01/X03). */
  create(input: CreateIdeaInput): Idea {
    const seedSentence = input.seedSentence.trim();
    if (!seedSentence) throw new IdeaStateError('An Idea needs at least one sentence.');
    const id = input.id?.trim() || this.nextId();
    if (!/^IDEA-\d{3,}$/.test(id)) throw new IdeaStateError('Idea id must use IDEA-nnn format.');
    if (this.store.load(id)) throw new IdeaStateError(`Idea ${id} already exists.`);
    const now = this.clock();
    const idea: Idea = {
      schemaVersion: 1,
      id,
      checkpoint: 'captured',
      ideaRevision: 0,
      seedSentence,
      title: input.title?.trim() || derivedTitle(seedSentence),
      outputLanguage: input.outputLanguage ?? 'vi',
      foundationHashAtCapture: this.captureFoundationSnapshot(),
      answers: {},
      batchIndex: 0,
      batchSubmitted: false,
      prep: { status: 'idle', selfAnswered: [], questions: [] },
      routeConfirmed: false,
      assumptions: [],
      children: [],
      saveStatus: 'saved',
      dirty: false,
      createdAt: now,
      updatedAt: now,
    };
    this.store.save(idea, null);
    this.record(idea, 'created', actorOrSystem(input.actor));
    return idea;
  }

  /**
   * Free while nothing depends on the seed yet; once prep has run, editing
   * resets to `captured` so prep reruns against the new sentence rather than
   * silently keeping stale self-answers (E03). Refused once routing has
   * started — `restart()` is the tool for that, since a route or epic may
   * already exist by then.
   */
  patchSeed(id: string, expectedRevision: number, seedSentence: string, actor: ActorRef): Idea {
    const current = this.require(id);
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    if (current.checkpoint === 'intent_drafted' || current.checkpoint === 'route_proposed'
      || current.checkpoint === 'in_delivery' || current.checkpoint === 'completed' || current.checkpoint === 'closed') {
      throw new IdeaStateError('Routing has already started for this Idea; use restart() to begin a fresh revision instead of editing the seed.');
    }
    const trimmed = seedSentence.trim();
    if (!trimmed) throw new IdeaStateError('An Idea needs at least one sentence.');
    const rerunsPrep = current.checkpoint !== 'captured';
    const next: Idea = {
      ...current,
      seedSentence: trimmed,
      checkpoint: 'captured',
      prep: rerunsPrep ? { status: 'idle', selfAnswered: [], questions: [] } : current.prep,
      answers: {},
      batchIndex: 0,
      batchSubmitted: false,
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.record(next, 'seed_edited', actor, rerunsPrep ? 'Seed changed after prep — prep will run again.' : undefined);
    return next;
  }

  startPrep(id: string, expectedRevision: number, jobId: string, actor: ActorRef): Idea {
    const current = this.require(id);
    if (current.checkpoint !== 'captured') {
      throw new IdeaStateError(`Cannot start prep: checkpoint is "${current.checkpoint}", expected "captured".`);
    }
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    const next: Idea = {
      ...current,
      checkpoint: 'preparing',
      prep: { status: 'running', jobId, selfAnswered: [], questions: [] },
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.record(next, 'prep_started', actor);
    return next;
  }

  failPrep(id: string, expectedRevision: number, error: string, actor: ActorRef): Idea {
    const current = this.require(id);
    if (current.checkpoint !== 'preparing') {
      throw new IdeaStateError(`Cannot fail prep: checkpoint is "${current.checkpoint}", expected "preparing".`);
    }
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    // Stays at `preparing` with status `failed` — R02's retry button re-calls
    // `startPrep`, it does not reset to `captured` and lose the job context.
    const next: Idea = {
      ...current,
      prep: { ...current.prep, status: 'failed', error },
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.record(next, 'prep_failed', actor, error);
    return next;
  }

  /**
   * Prep finished: self-answers are recorded, and the surviving questions
   * (already self-answer-filtered and impact-filtered by the agent) are
   * gated exactly as `discovery-gate.md` gates a phase's open questions — 0
   * offered questions skips straight to `intent_drafted`.
   */
  completePrep(
    id: string,
    expectedRevision: number,
    result: { selfAnswered: IdeaSelfAnswered[]; questions: IdeaQuestion[] },
    actor: ActorRef,
  ): Idea {
    const current = this.require(id);
    if (current.checkpoint !== 'preparing') {
      throw new IdeaStateError(`Cannot complete prep: checkpoint is "${current.checkpoint}", expected "preparing".`);
    }
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    const done: Idea = {
      ...current,
      prep: { status: 'done', jobId: current.prep.jobId, selfAnswered: result.selfAnswered, questions: result.questions },
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(done, current.ideaRevision);
    this.record(done, 'prep_completed', actor, `${result.questions.length} question(s) survived filtering.`);

    if (result.questions.length === 0) {
      return this.advanceToIntentDrafted(done, actor);
    }
    const next: Idea = { ...done, checkpoint: 'awaiting_human', updatedAt: this.clock(), ideaRevision: done.ideaRevision + 1 };
    this.store.save(next, done.ideaRevision);
    return next;
  }

  /** F02 — a self-answer the human says is wrong. Excluded from confirmed facts on the next prep pass. */
  flagSelfAnswer(id: string, expectedRevision: number, index: number, actor: ActorRef): Idea {
    const current = this.require(id);
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    if (!current.prep.selfAnswered[index]) throw new IdeaStateError(`No self-answered question at index ${index}.`);
    const selfAnswered = current.prep.selfAnswered.map((entry, i) => (i === index ? { ...entry, flagged: true } : entry));
    const next: Idea = { ...current, prep: { ...current.prep, selfAnswered }, updatedAt: this.clock(), ideaRevision: current.ideaRevision + 1 };
    this.store.save(next, current.ideaRevision);
    this.record(next, 'self_answer_flagged', actor, current.prep.selfAnswered[index]!.question);
    return next;
  }

  /** Autosave — persists immediately, never waits for batch submit (R01/E01). */
  saveAnswer(id: string, expectedRevision: number, questionId: string, choiceId: string, actor: ActorRef): Idea {
    const current = this.require(id);
    if (current.checkpoint !== 'awaiting_human') {
      throw new IdeaStateError(`Cannot save an answer: checkpoint is "${current.checkpoint}", expected "awaiting_human".`);
    }
    if (current.batchSubmitted) throw new IdeaStateError('This batch was already submitted.');
    const question = current.prep.questions.find((q) => q.id === questionId);
    if (!question) throw new IdeaStateError(`Question "${questionId}" is not part of this Idea's current batch.`);
    if (!question.options.some((option) => option.id === choiceId)) {
      throw new IdeaStateError(`"${choiceId}" is not an option for question "${questionId}".`);
    }
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    const next: Idea = {
      ...current,
      answers: { ...current.answers, [questionId]: choiceId },
      saveStatus: 'saved',
      dirty: false,
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.record(next, 'answer_saved', actor, questionId);
    return next;
  }

  /** Which of the current batch's questions are answerable right now — `dependsOn` fully satisfied. */
  private eligibleQuestions(idea: Idea): IdeaQuestion[] {
    return idea.prep.questions
      .filter((question) => question.dependsOn.every((dep) => Boolean(idea.answers[dep])))
      .slice(0, MAX_BATCH_SIZE);
  }

  /**
   * Closes the current batch. Any eligible-but-unanswered question becomes a
   * labeled assumption using its recommended option — the implicit form of
   * "Bạn quyết hết" for whatever the human skipped rather than answered.
   * Newly-unblocked dependent questions open at most one more batch
   * (mechanism #4/#5); after that, everything left becomes an assumption too.
   */
  submitBatch(id: string, expectedRevision: number, actor: ActorRef): Idea {
    const current = this.require(id);
    if (current.checkpoint !== 'awaiting_human') {
      throw new IdeaStateError(`Cannot submit a batch: checkpoint is "${current.checkpoint}", expected "awaiting_human".`);
    }
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);

    const eligible = this.eligibleQuestions(current);
    const unanswered = eligible.filter((question) => !current.answers[question.id]);
    const assumptions = [...current.assumptions, ...this.assumptionsFor(unanswered)];
    const submitted: Idea = {
      ...current,
      assumptions,
      batchSubmitted: true,
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(submitted, current.ideaRevision);
    this.record(submitted, 'batch_submitted', actor, `batch ${current.batchIndex}`);

    const nowAnswered = { ...submitted.answers };
    for (const question of unanswered) nowAnswered[question.id] = question.options.find((o) => o.recommended)?.id ?? question.options[0]!.id;
    const stillUnopened = submitted.prep.questions.filter((question) => !this.eligibleQuestions({ ...submitted, answers: nowAnswered }).some((q) => q.id === question.id) && !nowAnswered[question.id]);

    if (stillUnopened.length > 0 && submitted.batchIndex + 1 < MAX_BATCH_ROUNDS) {
      const next: Idea = {
        ...submitted,
        answers: nowAnswered,
        batchIndex: submitted.batchIndex + 1,
        batchSubmitted: false,
        updatedAt: this.clock(),
        ideaRevision: submitted.ideaRevision + 1,
      };
      this.store.save(next, submitted.ideaRevision);
      return next;
    }

    const finalAssumptions = [...assumptions, ...this.assumptionsFor(stillUnopened)];
    return this.advanceToIntentDrafted({ ...submitted, assumptions: finalAssumptions, answers: nowAnswered }, actor);
  }

  private assumptionsFor(questions: IdeaQuestion[]): IdeaAssumption[] {
    return questions.map((question) => ({
      id: question.id,
      label: `${question.text} → ${question.options.find((o) => o.recommended)?.label ?? question.options[0]!.label} (chưa trả lời, dùng khuyến nghị)`,
      source: 'agent',
    }));
  }

  /** The "Bạn quyết hết" exit door — available at any point in the question loop (E02/mechanism #7). */
  decideRest(id: string, expectedRevision: number, actor: ActorRef): Idea {
    if (actor.kind !== 'user') throw new IdeaStateError('Only a human user may decide the rest.');
    const current = this.require(id);
    if (current.checkpoint !== 'awaiting_human') {
      throw new IdeaStateError(`Cannot decide the rest: checkpoint is "${current.checkpoint}", expected "awaiting_human".`);
    }
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    const unanswered = current.prep.questions.filter((question) => !current.answers[question.id]);
    const assumptions = [...current.assumptions, ...unanswered.map((question) => ({
      id: question.id,
      label: `${question.text} → ${question.options.find((o) => o.recommended)?.label ?? question.options[0]!.label}`,
      source: 'human' as const,
    }))];
    const decided: Idea = { ...current, assumptions, batchSubmitted: true, updatedAt: this.clock(), ideaRevision: current.ideaRevision + 1 };
    this.store.save(decided, current.ideaRevision);
    this.record(decided, 'decided_rest', actor);
    return this.advanceToIntentDrafted(decided, actor);
  }

  private advanceToIntentDrafted(idea: Idea, actor: ActorRef): Idea {
    const next: Idea = { ...idea, checkpoint: 'intent_drafted', updatedAt: this.clock(), ideaRevision: idea.ideaRevision + 1 };
    this.store.save(next, idea.ideaRevision);
    writeFileAtomic(path.join(docsIdeaDir(this.workspaceRoot, next.id), 'INTENT.md'), renderIdeaBrief(next));
    return next;
  }

  /**
   * The routing agent's light research produced a decision. `outcome: 'close'`
   * finalizes immediately with no human confirmation — the flow graph routes
   * `kind → close` directly, bypassing the confirm screen entirely, because
   * there is no epic and no irreversible action to confirm.
   */
  generateRoute(id: string, expectedRevision: number, routeDraft: IdeaRouteDraft, actor: ActorRef): Idea {
    const current = this.require(id);
    if (current.checkpoint !== 'intent_drafted') {
      throw new IdeaStateError(`Cannot generate a route: checkpoint is "${current.checkpoint}", expected "intent_drafted".`);
    }
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);

    if (routeDraft.outcome === 'close') {
      if (!routeDraft.evidence?.trim()) throw new IdeaStateError('A close outcome requires research evidence to write as EVIDENCE.md.');
      const closed: Idea = { ...current, routeDraft, checkpoint: 'closed', updatedAt: this.clock(), ideaRevision: current.ideaRevision + 1 };
      this.store.save(closed, current.ideaRevision);
      writeFileAtomic(path.join(docsIdeaDir(this.workspaceRoot, id), 'EVIDENCE.md'), `${routeDraft.evidence.trim()}\n`);
      this.record(closed, 'closed', actor, 'Routing found no build was needed.');
      return closed;
    }

    if (routeDraft.steps.length === 0) throw new IdeaStateError('An epics-outcome route needs at least one step.');
    const next: Idea = { ...current, routeDraft, checkpoint: 'route_proposed', routeConfirmed: false, updatedAt: this.clock(), ideaRevision: current.ideaRevision + 1 };
    this.store.save(next, current.ideaRevision);
    writeFileAtomic(path.join(docsIdeaDir(this.workspaceRoot, id), 'ROUTE.md'), renderRouteMarkdown(next));
    this.record(next, 'route_generated', actor);
    return next;
  }

  /**
   * Confirms the route and scaffolds every step's epic. Idempotent and
   * crash-safe like `ShapeService.convertToEpic`: `resolved` must already
   * carry an assembled `PipelineConfig` per step (the one piece of work only
   * the extension can do — turning a recipe id into a pipeline via
   * `assemblePipeline`), and re-entry after a partial crash verifies rather
   * than re-scaffolds an epic dir that already exists for this Idea.
   */
  confirmRouteAndScaffold(id: string, expectedRevision: number, resolved: ResolvedRouteStep[], doc: { state?: unknown } | null, actor: ActorRef): Idea {
    if (actor.kind !== 'user') throw new IdeaStateError('Only a human user may confirm a route.');
    let current = this.require(id);
    if (current.checkpoint !== 'route_proposed' || !current.routeDraft) {
      throw new IdeaStateError(`Cannot confirm a route: checkpoint is "${current.checkpoint}", expected "route_proposed".`);
    }
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    if (resolved.length !== current.routeDraft.steps.length) {
      throw new IdeaStateError('Resolved pipelines do not match the confirmed route\'s step count.');
    }

    if (!current.routeConfirmed) {
      current = { ...current, routeConfirmed: true, updatedAt: this.clock(), ideaRevision: current.ideaRevision + 1 };
      this.store.save(current, this.require(id).ideaRevision);
      this.record(current, 'route_confirmed', actor);
    }

    const brief = renderIdeaBrief(current);
    const children: IdeaChild[] = [];
    for (const step of resolved) {
      const target = path.join(epicsRoot(this.workspaceRoot, doc), step.epicId);
      let result: ScaffoldEpicResult;
      if (fs.existsSync(target)) {
        const inputsPath = path.join(target, 'inputs.json');
        try {
          const existing = JSON.parse(fs.readFileSync(inputsPath, 'utf8')) as { source_idea?: { id?: unknown } };
          if (existing.source_idea?.id !== current.id) {
            throw new IdeaStateError(`Epic ${step.epicId} already exists and is not this Idea's scaffold.`);
          }
        } catch (error) {
          if (error instanceof IdeaStateError) throw error;
          throw new IdeaStateError(`Epic ${step.epicId} already exists and cannot be verified as this Idea's conversion.`);
        }
        result = { epicDir: target, artifactsDir: path.join(target, 'artifacts') };
      } else {
        result = scaffoldEpic({
          ...step.scaffold,
          workspaceRoot: this.workspaceRoot,
          doc,
          epicId: step.epicId,
          title: step.epicTitle,
          description: brief,
          target: { kind: 'pipeline', id: step.pipeline.id },
          pipeline: step.pipeline,
          ideaProvenance: current.foundationHashAtCapture
            ? { id: current.id, revision: current.ideaRevision, foundation: current.foundationHashAtCapture, brief }
            : undefined,
        });
      }
      children.push({ epicId: step.epicId, recipeId: step.recipeId, runStatus: result.runState?.status ?? 'pending' });
    }

    const reloaded = this.require(id);
    const primary = children[0]!;
    const next: Idea = {
      ...reloaded,
      children,
      checkpoint: 'in_delivery',
      inDelivery: { epicId: primary.epicId, runId: primary.epicId, stepRevision: 1 },
      updatedAt: this.clock(),
      ideaRevision: reloaded.ideaRevision + 1,
    };
    this.store.save(next, reloaded.ideaRevision);
    this.record(next, 'scaffolded', actor, children.map((c) => c.epicId).join(', '));
    return next;
  }

  shelve(id: string, expectedRevision: number, actor: ActorRef): Idea {
    if (actor.kind !== 'user') throw new IdeaStateError('Only a human user may shelve an Idea.');
    const current = this.require(id);
    if (current.checkpoint === 'completed') throw new IdeaStateError('A completed Idea cannot be shelved.');
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    const next: Idea = { ...current, checkpoint: 'shelved', updatedAt: this.clock(), ideaRevision: current.ideaRevision + 1 };
    this.store.save(next, current.ideaRevision);
    this.record(next, 'shelved', actor);
    return next;
  }

  /** Reopens to `captured` — a shelved Idea always resumes at the start, never mid-batch (simplicity over precision here). */
  reopen(id: string, expectedRevision: number, actor: ActorRef): Idea {
    if (actor.kind !== 'user') throw new IdeaStateError('Only a human user may reopen an Idea.');
    const current = this.require(id);
    if (current.checkpoint !== 'shelved') throw new IdeaStateError('Only a shelved Idea can be reopened.');
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    const next: Idea = { ...current, checkpoint: 'captured', updatedAt: this.clock(), ideaRevision: current.ideaRevision + 1 };
    this.store.save(next, current.ideaRevision);
    this.record(next, 'reopened', actor);
    return next;
  }

  /**
   * "Bắt đầu lại" — only reachable from the ⋯ menu, never the default action
   * (wireframe screen 2). Resets to `captured` under a bumped revision; the
   * prior attempt's seed/answers/prep are not erased, only superseded —
   * `events.ndjson` keeps every one of them for audit.
   */
  restart(id: string, expectedRevision: number, actor: ActorRef): Idea {
    const current = this.require(id);
    if (current.checkpoint === 'completed') throw new IdeaStateError('A completed Idea cannot be restarted.');
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    const next: Idea = {
      ...current,
      checkpoint: 'captured',
      prep: { status: 'idle', selfAnswered: [], questions: [] },
      answers: {},
      batchIndex: 0,
      batchSubmitted: false,
      routeDraft: undefined,
      routeConfirmed: false,
      assumptions: [],
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.record(next, 'restarted', actor);
    return next;
  }

  /** Which inbox bucket this Idea sits in right now — audit's INBOX_RULES table, verbatim. */
  inboxBucket(idea: Idea): 'awaiting_you' | 'agent_running' | 'blocked' | 'done' | 'shelved' {
    if (idea.checkpoint === 'shelved') return 'shelved';
    if (idea.blockedReason) return 'blocked';
    if (idea.checkpoint === 'closed' || idea.checkpoint === 'completed') return 'done';
    if (idea.prep.status === 'running') return 'agent_running';
    if (idea.checkpoint === 'awaiting_human' || idea.checkpoint === 'route_proposed') return 'awaiting_you';
    return 'awaiting_you';
  }

  private record(idea: Idea, type: IdeaEvent['type'], actor: ActorRef, detail?: string): void {
    this.store.appendEvent(idea.id, { id: eventId(), at: this.clock(), type, actor, revision: idea.ideaRevision, detail });
  }
}

function renderRouteMarkdown(idea: Idea): string {
  const draft = idea.routeDraft!;
  const lines = [`# Route — ${idea.id}`, ''];
  draft.steps.forEach((step, i) => {
    lines.push(`## ${i + 1}. ${step.recipeId} — ${step.epicTitle}`, '', step.rationale, '');
  });
  if (idea.assumptions.length) {
    lines.push('## Assumptions', '', ...idea.assumptions.map((a) => `- ${a.label} (${a.source})`), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
