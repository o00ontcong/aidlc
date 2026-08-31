import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { ActorRef } from '../contracts/common';
import { nowIso } from '../contracts/common';
import {
  parseIdea,
  type Idea,
  type IdeaChild,
  type IdeaEvent,
  type IdeaFoundationSnapshot,
  type IdeaRouteDraft,
} from '../contracts/idea';
import { epicsRoot, scaffoldEpic, type ScaffoldEpicArgs, type ScaffoldEpicResult } from '../runs/EpicScaffold';
import { RunStateStore } from '../runs/RunStateStore';
import { CofofoFoundationService } from '../cofofo/FoundationService';
import type { PipelineConfig } from '../schema/WorkspaceSchema';
import {
  emptyJournal,
  renderIntentFromJournal,
  renderJournalMarkdown,
  suggestRecipeFromJournal,
} from './journal';
import type { CofofoRecipeId, IdeaJournal, IdeaJournalPhase } from '../contracts/idea';
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

/** One journal step already resolved to a startable pipeline by the caller. */
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
 * Journal-first Idea lifecycle: capture → human research journal → scaffold epic.
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
      journalPhase: 'spark',
      journal: emptyJournal(),
      createdAt: now,
      updatedAt: now,
    };
    this.store.save(idea, null);
    this.record(idea, 'created', actorOrSystem(input.actor));
    this.syncJournalFiles(idea);
    return idea;
  }

  private syncJournalFiles(idea: Idea): void {
    const dir = docsIdeaDir(this.workspaceRoot, idea.id);
    fs.mkdirSync(dir, { recursive: true });
    writeFileAtomic(path.join(dir, 'journal.md'), renderJournalMarkdown(idea));
    if (idea.journalPhase === 'ready' || idea.checkpoint === 'in_delivery') {
      writeFileAtomic(path.join(dir, 'INTENT.md'), renderIntentFromJournal(idea));
    }
  }

  private assertJournalEditable(idea: Idea): void {
    if (['in_delivery', 'completed', 'closed'].includes(idea.checkpoint)) {
      throw new IdeaStateError('This Idea has already been scaffolded — journal is read-only.');
    }
  }

  saveJournal(
    id: string,
    expectedRevision: number,
    patch: {
      seedSentence?: string;
      journalPhase?: IdeaJournalPhase;
      journal?: Partial<IdeaJournal> & { rewrite?: Partial<IdeaJournal['rewrite']> };
    },
    actor: ActorRef,
  ): Idea {
    const current = this.require(id);
    if (current.ideaRevision !== expectedRevision) {
      throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    }
    this.assertJournalEditable(current);

    const journal = current.journal ?? emptyJournal();
    const mergedRewrite = patch.journal?.rewrite
      ? { ...journal.rewrite, ...patch.journal.rewrite }
      : journal.rewrite;
    const nextJournal: IdeaJournal = {
      sources: patch.journal?.sources ?? journal.sources,
      notes: patch.journal?.notes ?? journal.notes,
      rewrite: mergedRewrite,
      readyRecipeId: patch.journal?.readyRecipeId ?? journal.readyRecipeId,
      readyEpicTitle: patch.journal?.readyEpicTitle ?? journal.readyEpicTitle,
    };

    const seedSentence = patch.seedSentence !== undefined ? patch.seedSentence.trim() : current.seedSentence;
    if (!seedSentence) throw new IdeaStateError('An Idea needs at least one sentence.');

    const next: Idea = {
      ...current,
      seedSentence,
      title: derivedTitle(seedSentence),
      journalPhase: patch.journalPhase ?? current.journalPhase ?? 'spark',
      journal: nextJournal,
      dirty: false,
      saveStatus: 'saved',
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.syncJournalFiles(next);
    this.record(next, 'journal_saved', actor);
    return next;
  }

  appendJournalNote(id: string, expectedRevision: number, text: string, origin: 'human' | 'ai', actor: ActorRef): Idea {
    const trimmed = text.trim();
    if (!trimmed) throw new IdeaStateError('Note text cannot be empty.');
    const current = this.require(id);
    const journal = current.journal ?? emptyJournal();
    return this.saveJournal(id, expectedRevision, {
      journal: {
        notes: [
          ...journal.notes,
          { id: eventId(), at: this.clock(), text: trimmed, origin },
        ],
      },
    }, actor);
  }

  advanceJournalPhase(id: string, expectedRevision: number, phase: IdeaJournalPhase, actor: ActorRef): Idea {
    return this.saveJournal(id, expectedRevision, { journalPhase: phase }, actor);
  }

  markJournalReady(
    id: string,
    expectedRevision: number,
    readyRecipeId: CofofoRecipeId,
    readyEpicTitle: string,
    actor: ActorRef,
  ): Idea {
    const title = readyEpicTitle.trim();
    if (!title) throw new IdeaStateError('Epic title is required before scaffold.');
    const current = this.require(id);
    const j = current.journal ?? emptyJournal();
    if (!j.rewrite.problem.trim() || !j.rewrite.outcome.trim()) {
      throw new IdeaStateError('Problem and outcome must be filled before marking ready.');
    }
    return this.saveJournal(id, expectedRevision, {
      journalPhase: 'ready',
      journal: {
        ...j,
        readyRecipeId,
        readyEpicTitle: title,
      },
    }, actor);
  }

  scaffoldFromJournal(
    id: string,
    expectedRevision: number,
    resolved: ResolvedRouteStep[],
    doc: { state?: unknown } | null,
    actor: ActorRef,
  ): Idea {
    if (actor.kind !== 'user') throw new IdeaStateError('Only a human user may scaffold from a journal.');
    const current = this.require(id);
    if (current.ideaRevision !== expectedRevision) {
      throw new IdeaRevisionConflictError(id, expectedRevision, current.ideaRevision);
    }
    if (current.journalPhase !== 'ready') {
      throw new IdeaStateError(`Cannot scaffold: journal phase is "${current.journalPhase ?? 'spark'}", expected "ready".`);
    }
    const recipeId = current.journal?.readyRecipeId ?? suggestRecipeFromJournal(current);
    if (resolved.length === 0) throw new IdeaStateError('At least one resolved pipeline is required.');
    if (resolved[0]!.recipeId !== recipeId) {
      throw new IdeaStateError(`Resolved recipe ${resolved[0]!.recipeId} does not match journal recipe ${recipeId}.`);
    }

    const brief = renderIntentFromJournal(current);
    writeFileAtomic(path.join(docsIdeaDir(this.workspaceRoot, id), 'INTENT.md'), brief);
    this.syncJournalFiles(current);

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
    this.record(next, 'journal_scaffolded', actor, children.map((c) => c.epicId).join(', '));
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
      journalPhase: seedChanged ? 'spark' : (current.journalPhase ?? 'spark'),
      journal: seedChanged ? emptyJournal() : (current.journal ?? emptyJournal()),
      blockedReason: undefined,
      shelvedFromCheckpoint: undefined,
      updatedAt: this.clock(),
      ideaRevision: current.ideaRevision + 1,
    };
    this.store.save(next, current.ideaRevision);
    this.syncJournalFiles(next);
    this.record(next, 'seed_edited', actor, seedChanged ? 'Seed changed — journal reset to spark.' : undefined);
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
      journalPhase: 'spark',
      journal: emptyJournal(),
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
    this.syncJournalFiles(next);
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
      schemaVersion: 1,
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
      journalPhase: 'spark',
      journal: emptyJournal(),
      createdAt,
      updatedAt: now,
    };
    const validated = parseIdea(repaired);
    writeFileAtomic(file, `${JSON.stringify(validated, null, 2)}\n`);
    this.syncJournalFiles(validated);
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
