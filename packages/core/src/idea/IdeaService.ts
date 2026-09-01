import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { ActorRef } from '../contracts/common';
import { nowIso } from '../contracts/common';
import {
  parseIdea,
  type CofofoRecipeId,
  type Idea,
  type IdeaChild,
  type IdeaDecision,
  type IdeaEvent,
  type IdeaExplore,
  type IdeaFoundationSnapshot,
  type IdeaResearch,
  type IdeaRouteDraft,
  type IdeaStage,
  type IdeaTranslation,
  type IdeaUnderstand,
  type PendingIdeaAction,
} from '../contracts/idea';
import { epicsRoot, scaffoldEpic, type ScaffoldEpicArgs, type ScaffoldEpicResult } from '../runs/EpicScaffold';
import { RunStateStore } from '../runs/RunStateStore';
import { CofofoFoundationService } from '../cofofo/FoundationService';
import type { PipelineConfig } from '../schema/WorkspaceSchema';
import {
  emptyDecision,
  emptyExplore,
  emptyResearch,
  emptyUnderstand,
  renderIntentFromIdea,
  renderResearchMarkdown,
  suggestRecipeFromIdea,
} from './stageContent';
import { advanceStage as advancePureStage, canAdvance, getMissingRequirements, isStageBehind } from './workflow';
import { describeAction, isHighImpact, IdeaAgentActionSchema, type IdeaAgentAction } from './agentActions';
import { parseAgentProposal } from './agentProposal';
import {
  mergeDecisionTranslation,
  mergeExploreTranslation,
  mergeResearchTranslation,
  mergeUnderstandTranslation,
} from './ideaTranslation';
import { IdeaRevisionConflictError, IdeaStore } from './IdeaStore';
import { writeFileAtomic } from '../epic/EpicStore';

const LEGACY_CHECKPOINTS = new Set(['preparing', 'awaiting_human', 'intent_drafted', 'route_proposed']);

export interface CreateIdeaInput {
  id?: string;
  seedSentence: string;
  title?: string;
  outputLanguage?: 'en' | 'vi';
  actor?: ActorRef;
}

/** One route step already resolved to a startable pipeline by the caller. */
export interface ResolvedRouteStep {
  recipeId: IdeaRouteDraft['steps'][number]['recipeId'];
  epicId: string;
  epicTitle: string;
  pipeline: PipelineConfig;
  scaffold: Omit<ScaffoldEpicArgs, 'workspaceRoot' | 'epicId' | 'title' | 'description' | 'target' | 'pipeline' | 'ideaProvenance' | 'doc'>;
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

export function docsIdeaDir(workspaceRoot: string, ideaId: string): string {
  return path.join(workspaceRoot, 'docs', 'ideas', ideaId);
}

/**
 * Idea Research Workflow lifecycle: capture → Understand → Research →
 * Explore → Decide → Ready → scaffold epic. The app (this class + `workflow.ts`)
 * is the workflow controller — AI never advances a stage or marks an Idea
 * Ready on its own (see `agentActions.ts`'s `mark_ready`, Task 3).
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

  private captureFoundationSnapshot(): IdeaFoundationSnapshot | null {
    try {
      const inspection = this.foundation.inspect();
      return inspection.status === 'ready' && inspection.snapshot ? inspection.snapshot : null;
    } catch {
      return null;
    }
  }

  list(): Idea[] { return this.store.list(); }
  listLoadErrors() { return this.store.listLoadErrors(); }
  get(id: string): Idea | null { return this.store.load(id); }
  require(id: string): Idea { return this.store.require(id); }

  nextId(): string {
    const largest = this.list().reduce((max, idea) => Math.max(max, Number(idea.id.slice('IDEA-'.length)) || 0), 0);
    return `IDEA-${String(largest + 1).padStart(3, '0')}`;
  }

  create(input: CreateIdeaInput): Idea {
    const seedSentence = input.seedSentence.trim();
    if (!seedSentence) throw new IdeaStateError('An Idea needs at least one sentence.');
    const id = input.id?.trim() || this.nextId();
    if (!/^IDEA-\d{3,}$/.test(id)) throw new IdeaStateError('Idea id must use IDEA-nnn format.');
    if (this.store.load(id)) throw new IdeaStateError(`Idea ${id} already exists.`);
    const now = this.clock();
    const idea: Idea = {
      schemaVersion: 2,
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
      stage: 'understand',
      understand: emptyUnderstand(),
      research: emptyResearch(),
      explore: emptyExplore(),
      decision: emptyDecision(),
      pendingActions: [],
      createdAt: now,
      updatedAt: now,
    };
    this.store.save(idea, null);
    this.record(idea, 'created', actorOrSystem(input.actor));
    this.syncIdeaDocs(idea);
    return idea;
  }

  private syncIdeaDocs(idea: Idea): void {
    const dir = docsIdeaDir(this.workspaceRoot, idea.id);
    fs.mkdirSync(dir, { recursive: true });
    writeFileAtomic(path.join(dir, 'RESEARCH.md'), renderResearchMarkdown(idea));
    if (idea.stage === 'ready' || idea.checkpoint === 'in_delivery') {
      writeFileAtomic(path.join(dir, 'INTENT.md'), renderIntentFromIdea(idea));
    }
  }

  private assertEditable(idea: Idea): void {
    if (['in_delivery', 'completed', 'closed'].includes(idea.checkpoint)) {
      throw new IdeaStateError('This Idea has already been scaffolded — its content is read-only.');
    }
  }

  /** Loads `id`, checks the optimistic-concurrency revision, and asserts it is still editable. */
  private requireEditable(id: string, expectedRevision: number): Idea {
    const current = this.require(id);
    if (current.ideaRevision !== expectedRevision) {
      throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    }
    this.assertEditable(current);
    return current;
  }

  /** Merges a single stage's field patch, flags `needsReview` if a later stage already relied on it, persists, and logs. */
  private commitStagePatch(
    current: Idea,
    fieldPatch: Partial<Pick<Idea, 'understand' | 'research' | 'explore' | 'decision'>>,
    changedStage: IdeaStage,
    eventType: IdeaEvent['type'],
    actor: ActorRef,
  ): Idea {
    const behind = isStageBehind(current, changedStage);
    const next: Idea = {
      ...current,
      ...fieldPatch,
      needsReview: behind
        ? { reason: `"${changedStage}" changed after the Idea had already moved on to "${current.stage}".`, since: this.clock() }
        : current.needsReview,
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.syncIdeaDocs(next);
    this.record(next, eventType, actor);
    return next;
  }

  /**
   * Same persistence/doc-sync/event-log plumbing as `commitStagePatch`, but
   * deliberately skips its `needsReview`-behind check: a translation doesn't
   * introduce new information for a later stage to re-check against, it's
   * the same content in another language, so flagging "this stage changed
   * after the idea moved on" for it would be a false alarm.
   */
  private commitTranslationPatch(
    current: Idea,
    fieldPatch: Partial<Pick<Idea, 'understand' | 'research' | 'explore' | 'decision'>>,
    actor: ActorRef,
    detail: string,
  ): Idea {
    const next: Idea = {
      ...current,
      ...fieldPatch,
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.syncIdeaDocs(next);
    this.record(next, 'translated', actor, detail);
    return next;
  }

  /**
   * Applies `/aidlc-idea-translate`'s output in place — a pure language
   * rewrite of whichever stages the translation covers, replacing the
   * current text without going through the additive agent-proposal pipeline
   * (that pipeline is built for *adding* newly-researched content one bullet
   * at a time; running a translation through it would pile the translated
   * bullets on top of the originals instead of replacing them). Every stage
   * in `translation` is validated against the idea's current shape before
   * anything is written — if any of them don't line up (an id vanished, a
   * list's length no longer matches), the whole call throws and nothing is
   * applied, rather than landing some stages and silently skipping others.
   */
  applyTranslation(id: string, translation: IdeaTranslation, actor: ActorRef): Idea {
    const current = this.require(id);
    this.assertEditable(current);

    const issues: string[] = [];
    const understand = translation.understand
      ? mergeUnderstandTranslation(current.understand, translation.understand, issues) : null;
    const research = translation.research
      ? mergeResearchTranslation(current.research, translation.research, issues) : null;
    const explore = translation.explore
      ? mergeExploreTranslation(current.explore, translation.explore, issues) : null;
    const decision = translation.decision
      ? mergeDecisionTranslation(current.decision, translation.decision, issues) : null;

    if (issues.length > 0) {
      throw new IdeaStateError(`Translation does not match ${id}'s current content: ${issues.join('; ')}`);
    }

    const detail = `Translated to ${translation.language}`;
    let next = current;
    if (understand) next = this.commitTranslationPatch(next, { understand }, actor, detail);
    if (research) next = this.commitTranslationPatch(next, { research }, actor, detail);
    if (explore) next = this.commitTranslationPatch(next, { explore }, actor, detail);
    if (decision) next = this.commitTranslationPatch(next, { decision }, actor, detail);
    return next;
  }

  updateUnderstand(id: string, expectedRevision: number, patch: Partial<IdeaUnderstand>, actor: ActorRef): Idea {
    const current = this.requireEditable(id, expectedRevision);
    const understand: IdeaUnderstand = { ...current.understand, ...patch };
    return this.commitStagePatch(current, { understand }, 'understand', 'understand_updated', actor);
  }

  updateResearch(id: string, expectedRevision: number, patch: Partial<IdeaResearch>, actor: ActorRef): Idea {
    const current = this.requireEditable(id, expectedRevision);
    const research: IdeaResearch = { ...current.research, ...patch };
    return this.commitStagePatch(current, { research }, 'research', 'research_updated', actor);
  }

  updateExplore(id: string, expectedRevision: number, patch: Partial<IdeaExplore>, actor: ActorRef): Idea {
    const current = this.requireEditable(id, expectedRevision);
    const explore: IdeaExplore = { ...current.explore, ...patch };
    return this.commitStagePatch(current, { explore }, 'explore', 'explore_updated', actor);
  }

  updateDecision(id: string, expectedRevision: number, patch: Partial<IdeaDecision>, actor: ActorRef): Idea {
    const current = this.requireEditable(id, expectedRevision);
    const decision: IdeaDecision = { ...current.decision, ...patch };
    return this.commitStagePatch(current, { decision }, 'decide', 'decision_updated', actor);
  }

  /**
   * Parses a human-pasted AI proposal (spec §22's flow: validate schema →
   * validate allowed-in-stage → validate payload → execute) and applies it:
   * low-impact actions (additive — a new finding, source, option, ...) are
   * applied immediately; high-impact ones (overwriting Problem, Decision,
   * Final Idea, ...) and every `ask_user` are queued in `pendingActions` for
   * an explicit Accept/Reject (spec §24) via `resolvePendingAction`. Never
   * calls an LLM — `markdown` is whatever the human decided to paste back.
   */
  importAgentProposal(id: string, expectedRevision: number, stage: IdeaStage, markdown: string, actor: ActorRef): { idea: Idea; unparsed: string[] } {
    const current = this.requireEditable(id, expectedRevision);
    const { actions, unparsed } = parseAgentProposal(markdown, stage, current);
    if (actions.length === 0) return { idea: current, unparsed };

    let understand = current.understand;
    let research = current.research;
    let explore = current.explore;
    const pendingActions: PendingIdeaAction[] = [...current.pendingActions];
    const applyIssues: string[] = [];

    for (const action of actions) {
      if (action.type === 'ask_user' || isHighImpact(action.type)) {
        pendingActions.push({
          id: eventId(), stage, actionType: action.type, summary: describeAction(action),
          payload: action as unknown as Record<string, unknown>, createdAt: this.clock(),
        });
        continue;
      }
      switch (action.type) {
        case 'add_user':
          understand = { ...understand, users: [...understand.users, action.value] };
          break;
        case 'add_assumption':
          understand = { ...understand, assumptions: [...understand.assumptions, action.value] };
          break;
        case 'add_unknown':
          if (stage === 'understand') understand = { ...understand, unknowns: [...understand.unknowns, action.value] };
          else research = { ...research, unknowns: [...research.unknowns, action.value] };
          break;
        case 'add_finding':
          research = {
            ...research,
            findings: [...research.findings, {
              id: eventId(), text: action.text, type: action.findingType, sourceIds: action.sourceIds, createdBy: 'ai', createdAt: this.clock(),
            }],
          };
          break;
        case 'add_source':
          research = { ...research, sources: [...research.sources, { id: eventId(), source: action.source, type: action.sourceType, question: action.question, read: false }] };
          break;
        case 'add_existing_solution':
          research = { ...research, existingSolutions: [...research.existingSolutions, { id: eventId(), text: action.text, createdBy: 'ai', createdAt: this.clock() }] };
          break;
        case 'add_option':
          explore = {
            ...explore,
            options: [...explore.options, {
              id: eventId(), title: action.title, description: action.description,
              pros: action.pros, cons: action.cons, risks: action.risks, tradeoffs: action.tradeoffs, validation: action.validation,
            }],
          };
          break;
        case 'update_option': {
          const idx = explore.options.findIndex((o) => o.title.trim().toLowerCase() === action.title.trim().toLowerCase());
          if (idx < 0) { applyIssues.push(`Option "${action.title}" no longer exists — update skipped.`); break; }
          const target = explore.options[idx]!;
          const merged = {
            ...target,
            description: action.description ?? target.description,
            pros: action.pros ?? target.pros,
            cons: action.cons ?? target.cons,
            risks: action.risks ?? target.risks,
            tradeoffs: action.tradeoffs ?? target.tradeoffs,
            validation: action.validation ?? target.validation,
          };
          explore = { ...explore, options: explore.options.map((o, i) => (i === idx ? merged : o)) };
          break;
        }
        case 'add_validation':
          explore = { ...explore, validations: [...explore.validations, action.value] };
          break;
        case 'add_risk': {
          const idx = explore.options.findIndex((o) => o.title.trim().toLowerCase() === action.optionTitle.trim().toLowerCase());
          if (idx < 0) { applyIssues.push(`Option "${action.optionTitle}" not found — risk skipped.`); break; }
          explore = { ...explore, options: explore.options.map((o, i) => (i === idx ? { ...o, risks: [...o.risks, action.value] } : o)) };
          break;
        }
        default:
          break; // every other type is high-impact and was queued above
      }
    }

    const behind = isStageBehind(current, stage);
    const next: Idea = {
      ...current,
      understand, research, explore, pendingActions,
      needsReview: behind
        ? { reason: `"${stage}" changed after the Idea had already moved on to "${current.stage}".`, since: this.clock() }
        : current.needsReview,
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.syncIdeaDocs(next);
    this.record(next, 'ai_proposal_imported', actor, `${actions.length} action(s) parsed, ${unparsed.length} skipped`);
    return { idea: next, unparsed: [...unparsed, ...applyIssues] };
  }

  /** Accept or reject one queued AI proposal (spec §24). `mark_ready`/`ask_user` have no field effect to apply — accepting just clears them; the human still uses `markReady()` or answers outside persisted state. */
  resolvePendingAction(id: string, expectedRevision: number, actionId: string, verdict: 'accept' | 'reject', actor: ActorRef): Idea {
    const current = this.requireEditable(id, expectedRevision);
    const pending = current.pendingActions.find((p) => p.id === actionId);
    if (!pending) throw new IdeaStateError(`No pending action ${actionId} on ${id}.`);
    const pendingActions = current.pendingActions.filter((p) => p.id !== actionId);

    let decision = current.decision;
    let understand = current.understand;

    if (verdict === 'accept') {
      const parsed = IdeaAgentActionSchema.safeParse(pending.payload);
      if (!parsed.success) throw new IdeaStateError(`Pending action ${actionId} payload no longer matches the expected shape.`);
      const action: IdeaAgentAction = parsed.data;
      switch (action.type) {
        case 'set_problem': understand = { ...understand, problem: action.value }; break;
        case 'set_context': understand = { ...understand, context: action.value }; break;
        case 'propose_decision': decision = { ...decision, status: action.status, recommendation: action.recommendation }; break;
        case 'set_recommendation': decision = { ...decision, recommendation: action.value }; break;
        case 'rewrite_final_idea': decision = { ...decision, finalIdea: action.value }; break;
        case 'set_scope': decision = { ...decision, scope: action.value }; break;
        case 'set_out_of_scope': decision = { ...decision, outOfScope: action.value }; break;
        case 'set_success_criteria': decision = { ...decision, successCriteria: action.value }; break;
        case 'set_next_step': decision = { ...decision, nextStep: action.value }; break;
        default: break; // mark_ready / ask_user: no field to apply
      }
    }

    const next: Idea = {
      ...current,
      understand, decision, pendingActions,
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.syncIdeaDocs(next);
    this.record(next, verdict === 'accept' ? 'ai_action_accepted' : 'ai_action_rejected', actor, pending.summary);
    return next;
  }

  /** Advances to the next stage. Reaching "ready" from "decide" is a separate, explicit action — see `markReady()`. */
  advanceStage(id: string, expectedRevision: number, actor: ActorRef): Idea {
    const current = this.requireEditable(id, expectedRevision);
    if (current.stage === 'decide') {
      throw new IdeaStateError('Reaching "ready" requires markReady() with a chosen recipe and epic title, not advanceStage().');
    }
    if (!canAdvance(current)) {
      const missing = getMissingRequirements(current).map((r) => r.label).join(', ');
      throw new IdeaStateError(`Cannot advance from "${current.stage}" — missing: ${missing}.`);
    }
    const advanced = advancePureStage(current);
    const next: Idea = { ...advanced, updatedAt: this.clock(), ideaRevision: current.ideaRevision + 1 };
    this.store.save(next, current.ideaRevision);
    this.syncIdeaDocs(next);
    this.record(next, 'stage_advanced', actor, `${current.stage} -> ${next.stage}`);
    return next;
  }

  /** Explicit, human-only transition into "ready" — spec §10/§15: AI can never mark an Idea Ready by itself. */
  markReady(id: string, expectedRevision: number, recipeId: CofofoRecipeId, epicTitle: string, actor: ActorRef): Idea {
    if (actor.kind !== 'user') throw new IdeaStateError('Only a human user may mark an Idea ready.');
    const title = epicTitle.trim();
    if (!title) throw new IdeaStateError('Epic title is required before scaffold.');
    const current = this.requireEditable(id, expectedRevision);
    if (current.stage !== 'decide') {
      throw new IdeaStateError(`Cannot mark ready from stage "${current.stage}" — must be at "decide".`);
    }
    if (!canAdvance(current)) {
      const missing = getMissingRequirements(current).map((r) => r.label).join(', ');
      throw new IdeaStateError(`Decide is not complete yet — missing: ${missing}.`);
    }
    const next: Idea = {
      ...current,
      stage: 'ready',
      readyRecipeId: recipeId,
      readyEpicTitle: title,
      needsReview: undefined,
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.syncIdeaDocs(next);
    this.record(next, 'marked_ready', actor);
    return next;
  }

  scaffoldFromIdea(
    id: string,
    expectedRevision: number,
    resolved: ResolvedRouteStep[],
    doc: { state?: unknown } | null,
    actor: ActorRef,
  ): Idea {
    if (actor.kind !== 'user') throw new IdeaStateError('Only a human user may scaffold from an Idea.');
    const current = this.require(id);
    if (current.ideaRevision !== expectedRevision) {
      throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    }
    if (current.stage !== 'ready') {
      throw new IdeaStateError(`Cannot scaffold: stage is "${current.stage}", expected "ready".`);
    }
    const recipeId = current.readyRecipeId ?? suggestRecipeFromIdea(current);
    if (resolved.length === 0) throw new IdeaStateError('At least one resolved pipeline is required.');
    if (resolved[0]!.recipeId !== recipeId) {
      throw new IdeaStateError(`Resolved recipe ${resolved[0]!.recipeId} does not match idea recipe ${recipeId}.`);
    }

    const brief = renderIntentFromIdea(current);
    writeFileAtomic(path.join(docsIdeaDir(this.workspaceRoot, id), 'INTENT.md'), brief);
    this.syncIdeaDocs(current);

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

    const primary = children[0]!;
    const primaryRun = RunStateStore.load(this.workspaceRoot, primary.epicId);
    const stepRevision = primaryRun?.steps[primaryRun.currentStepIdx]?.revision ?? 1;
    const next: Idea = {
      ...current,
      children,
      checkpoint: 'in_delivery',
      inDelivery: { epicId: primary.epicId, runId: primary.epicId, stepRevision },
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.record(next, 'scaffolded', actor, children.map((c) => c.epicId).join(', '));
    return next;
  }

  patchSeed(id: string, expectedRevision: number, seedSentence: string, actor: ActorRef): Idea {
    const current = this.require(id);
    if (current.ideaRevision !== expectedRevision) {
      throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    }
    if (['in_delivery', 'completed', 'closed'].includes(current.checkpoint)) {
      throw new IdeaStateError('This Idea is already in delivery — use restart() to begin a fresh revision.');
    }
    const trimmed = seedSentence.trim();
    if (!trimmed) throw new IdeaStateError('An Idea needs at least one sentence.');
    const seedChanged = trimmed !== current.seedSentence;
    const next: Idea = {
      ...current,
      seedSentence: trimmed,
      title: derivedTitle(trimmed),
      checkpoint: 'captured',
      stage: seedChanged ? 'understand' : current.stage,
      understand: seedChanged ? emptyUnderstand() : current.understand,
      research: seedChanged ? emptyResearch() : current.research,
      explore: seedChanged ? emptyExplore() : current.explore,
      decision: seedChanged ? emptyDecision() : current.decision,
      needsReview: seedChanged ? undefined : current.needsReview,
      pendingActions: seedChanged ? [] : current.pendingActions,
      blockedReason: undefined,
      shelvedFromCheckpoint: undefined,
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.syncIdeaDocs(next);
    this.record(next, 'seed_edited', actor, seedChanged ? 'Seed changed — research workflow reset to Understand.' : undefined);
    return next;
  }

  shelve(id: string, expectedRevision: number, actor: ActorRef): Idea {
    if (actor.kind !== 'user') throw new IdeaStateError('Only a human user may shelve an Idea.');
    const current = this.require(id);
    if (current.checkpoint === 'completed') throw new IdeaStateError('A completed Idea cannot be shelved.');
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    const next: Idea = {
      ...current,
      checkpoint: 'shelved',
      shelvedFromCheckpoint: current.checkpoint === 'shelved' ? current.shelvedFromCheckpoint : current.checkpoint,
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.record(next, 'shelved', actor);
    return next;
  }

  reopen(id: string, expectedRevision: number, actor: ActorRef): Idea {
    if (actor.kind !== 'user') throw new IdeaStateError('Only a human user may reopen an Idea.');
    const current = this.require(id);
    if (current.checkpoint !== 'shelved') throw new IdeaStateError('Only a shelved Idea can be reopened.');
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    const resumeAt = current.shelvedFromCheckpoint ?? 'captured';
    const checkpoint = LEGACY_CHECKPOINTS.has(resumeAt) ? 'captured' : resumeAt;
    const next: Idea = {
      ...current,
      checkpoint,
      shelvedFromCheckpoint: undefined,
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.record(next, 'reopened', actor);
    return next;
  }

  restart(id: string, expectedRevision: number, actor: ActorRef): Idea {
    const current = this.require(id);
    if (current.checkpoint === 'completed') throw new IdeaStateError('A completed Idea cannot be restarted.');
    if (current.checkpoint === 'in_delivery') {
      throw new IdeaStateError('An Idea in delivery cannot be restarted — finish or delete the linked epic first.');
    }
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    const next: Idea = {
      ...current,
      checkpoint: 'captured',
      stage: 'understand',
      understand: emptyUnderstand(),
      research: emptyResearch(),
      explore: emptyExplore(),
      decision: emptyDecision(),
      needsReview: undefined,
      pendingActions: [],
      readyRecipeId: undefined,
      readyEpicTitle: undefined,
      children: [],
      inDelivery: undefined,
      routeDraft: undefined,
      routeConfirmed: false,
      blockedReason: undefined,
      shelvedFromCheckpoint: undefined,
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.syncIdeaDocs(next);
    this.record(next, 'restarted', actor);
    return next;
  }

  delete(id: string, expectedRevision: number, actor: ActorRef): void {
    if (actor.kind !== 'user') throw new IdeaStateError('Only a human user may delete an Idea.');
    const current = this.require(id);
    if (current.ideaRevision !== expectedRevision) throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    this.store.delete(id);
    const docsDir = docsIdeaDir(this.workspaceRoot, id);
    if (fs.existsSync(docsDir)) fs.rmSync(docsDir, { recursive: true, force: true });
  }

  repairCorrupted(id: string, actor: ActorRef): Idea {
    if (actor.kind !== 'user') throw new IdeaStateError('Only a human user may repair a corrupted Idea.');
    const file = this.store.stateFile(id);
    if (!fs.existsSync(file)) throw new IdeaStateError(`No state.json exists for ${id}.`);
    try {
      this.store.load(id);
      throw new IdeaStateError(`${id} already loads successfully — nothing to repair.`);
    } catch (error) {
      if (error instanceof IdeaStateError) throw error;
    }

    let raw: Record<string, unknown> = {};
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    } catch { /* unparsable */ }

    const now = this.clock();
    fs.copyFileSync(file, `${file}.broken-${now.replace(/[:.]/g, '-')}`);

    const seedSentence = typeof raw.seedSentence === 'string' && raw.seedSentence.trim()
      ? raw.seedSentence.trim()
      : '(Đã khôi phục từ trạng thái hỏng — hãy sửa lại câu ý tưởng này.)';
    const outputLanguage = raw.outputLanguage === 'en' ? 'en' : 'vi';
    const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : now;
    const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : derivedTitle(seedSentence);

    const repaired: Idea = {
      schemaVersion: 2,
      id,
      checkpoint: 'captured',
      ideaRevision: 0,
      seedSentence,
      title,
      outputLanguage,
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
      stage: 'understand',
      understand: emptyUnderstand(),
      research: emptyResearch(),
      explore: emptyExplore(),
      decision: emptyDecision(),
      pendingActions: [],
      createdAt,
      updatedAt: now,
    };
    const validated = parseIdea(repaired);
    writeFileAtomic(file, `${JSON.stringify(validated, null, 2)}\n`);
    this.syncIdeaDocs(validated);
    this.record(validated, 'restarted', actor, 'Repaired from a corrupted state.json — the broken file was kept alongside it as a backup.');
    return validated;
  }

  /** True when CoFoFo Foundation changed since this Idea was captured. */
  isFoundationStale(idea: Idea): boolean {
    const inspection = this.foundation.inspect();
    const current = inspection.status === 'ready' ? inspection.snapshot : undefined;
    if (!current) return true;
    if (!idea.foundationHashAtCapture) return true;
    return current.revision !== idea.foundationHashAtCapture.revision
      || current.manifestHash !== idea.foundationHashAtCapture.manifestHash;
  }

  inboxBucket(idea: Idea): 'awaiting_you' | 'blocked' | 'done' | 'shelved' {
    if (idea.checkpoint === 'shelved') return 'shelved';
    if (idea.blockedReason) return 'blocked';
    if (idea.checkpoint === 'closed' || idea.checkpoint === 'completed' || idea.checkpoint === 'in_delivery') return 'done';
    return 'awaiting_you';
  }

  private record(idea: Idea, type: IdeaEvent['type'], actor: ActorRef, detail?: string): void {
    this.store.appendEvent(idea.id, { id: eventId(), at: this.clock(), type, actor, revision: idea.ideaRevision, detail });
  }
}
