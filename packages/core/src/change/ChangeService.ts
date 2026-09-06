/**
 * Business-rule layer for the Change aggregate (implementation plan §8,
 * §18.6) — every `change.*` command except the three deferred to M3
 * (`change.epic.start`, `change.epic.pending.resume/rollback`, which need
 * `ChangeEpicCoordinator` + an Epic facade decision).  Delivery close-out
 * lives here too: execution reports a completed linked Epic, then a human
 * either applies its Context Proposal or explicitly records why no Context
 * update is required.  Those are deliberately distinct facts.
 *
 * `ChangeStore` is the low-level repository (CAS + file layout); this file
 * owns actor enforcement, idempotent replay, and which fields a given
 * command may touch.
 *
 * Idempotent replay (plan §9.1 step 3, §D16) is implemented per Change: a
 * retry with the same `commandId` never re-runs the mutation or appends a
 * second event — it returns the *current* Change/Shape state instead of a
 * byte-exact historical snapshot (no separate per-revision snapshot store
 * exists), which is correct for the realistic case this guards against (a
 * lost response, retried before anything else touches the same Change) and
 * deliberately does not attempt full time-travel replay after unrelated
 * later edits. `change.create` and `change.merge` create a brand-new
 * aggregate id, so they rely on ULID collision-resistance instead of
 * commandId-keyed replay (there is no pre-existing aggregate to scan) —
 * every other command targets an aggregate that already exists and gets
 * full idempotent replay.
 */

import {
  computeChangeContentHash,
  computeChangeRequirementSliceHash,
  computeChangeShapeContentHash,
  nowIso,
  parseScopeAnalysis,
  type ActorRef,
  type ChangeDisposition,
  type ChangeId,
  type ChangeOrigin,
  type ChangePriority,
  type ChangeRequirement,
  type ChangeShape,
  type ChangeShapeDraft,
  type ChangeShapeOption,
  type ChangeType,
  type ContextProposalId,
  type ContextRevisionId,
  type DomainEvent,
  type EpicId,
  type ExternalReference,
  type ProjectChange,
  type ProjectChangeDraft,
  type ProjectChangeReadModel,
  type ScopeAnalysis,
  type ScopeAnalysisReview,
  type ScopeAnalysisReviewOutcome,
} from '../contracts';
import { generateChangeId, generateDomainEventId, generateScopeAnalysisId } from '../contracts/ids';
import { buildProjectChangeReadModel } from './buildProjectChangeReadModel';
import { ChangeStore } from './ChangeStore';
import { ChangeAgentRequiredError, ChangeHumanRequiredError, ChangeInvalidStateError, ChangeRelationCycleError, ShapeNotReadyError } from './errors';
import { AggregateConflictError, type VersionGuard } from '../storage/WorkspaceTransaction';

function actorRequiresUser(actor: ActorRef, action: string): void {
  if (actor.kind !== 'user') throw new ChangeHumanRequiredError(`${action} requires a human user (actor was "${actor.kind}").`);
}

function actorRequiresAgentOrSystem(actor: ActorRef, action: string): void {
  if (actor.kind === 'user') throw new ChangeAgentRequiredError(`${action} must be recorded by an agent or system, not a user directly.`);
}

function assertNotTerminal(change: ProjectChange, action: string): void {
  if (change.disposition === 'cancelled' || change.disposition === 'superseded') {
    throw new ChangeInvalidStateError(`${action} is not allowed once a Change is ${change.disposition}.`);
  }
}

function assertGuardMatches(domain: string, displayId: string, actual: { revision: number; contentHash: string }, guard: VersionGuard): void {
  if (actual.revision !== guard.expectedRevision || actual.contentHash !== guard.expectedContentHash) {
    throw new AggregateConflictError(
      `${domain}.revision_conflict`,
      `${displayId} changed (expected revision ${guard.expectedRevision}, actual ${actual.revision}).`,
      { expectedRevision: guard.expectedRevision, expectedContentHash: guard.expectedContentHash, actualRevision: actual.revision, actualContentHash: actual.contentHash },
      [
        { kind: 'reload', label: 'Reload the current version' },
        { kind: 'rebase', label: 'Rebase your edit onto the current version' },
      ],
    );
  }
}

function dedupeIds<T extends string>(ids: readonly T[]): T[] {
  return Array.from(new Set(ids));
}

function dedupeExternalRefs(refs: readonly ExternalReference[]): ExternalReference[] {
  const seen = new Set<string>();
  const result: ExternalReference[] = [];
  for (const ref of refs) {
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    result.push(ref);
  }
  return result;
}

// ── Command input shapes ────────────────────────────────────────────

export interface CreateChangeInput {
  commandId: string;
  actor: ActorRef;
  title: string;
  type: ChangeType;
  priority?: ChangePriority;
  requirement: ChangeRequirement;
  origin: ChangeOrigin;
  externalRefs?: ExternalReference[];
}

export interface UpdateChangeRequirementInput {
  commandId: string;
  actor: ActorRef;
  changeId: ChangeId;
  guard: VersionGuard;
  requirement: ChangeRequirement;
  title?: string;
  type?: ChangeType;
  priority?: ChangePriority;
}

export interface ProposeScopeAnalysisInput {
  commandId: string;
  actor: ActorRef;
  changeId: ChangeId;
  guard: VersionGuard;
  contextEntityKeys?: string[];
  files?: ScopeAnalysis['files'];
  symbols?: ScopeAnalysis['symbols'];
  dependencies?: string[];
  risks?: string[];
  unknowns?: string[];
  confidence: ScopeAnalysis['confidence'];
  legacyImpactStatus?: ScopeAnalysis['legacyImpactStatus'];
  contextRevisionId: ContextRevisionId;
  contextRootHash: string;
  sourceSnapshotHash: string;
}

export const SCOPE_FEEDBACK_NEXT_ROUTES = ['edit-requirement', 'analyze-again', 'explore', 'start-epic', 'shelve'] as const;
export type ScopeFeedbackNextRoute = (typeof SCOPE_FEEDBACK_NEXT_ROUTES)[number];

export interface RecordScopeFeedbackInput {
  commandId: string;
  actor: ActorRef;
  changeId: ChangeId;
  guard: VersionGuard;
  analysisId: string;
  feedback?: string;
  nextRoute: ScopeFeedbackNextRoute;
}

const SCOPE_FEEDBACK_OUTCOME: Partial<Record<ScopeFeedbackNextRoute, ScopeAnalysisReviewOutcome>> = {
  'analyze-again': 'feedback-recorded',
  explore: 'used-for-exploration',
  'start-epic': 'bypassed-for-delivery',
};

export interface StartExploreInput {
  commandId: string;
  actor: ActorRef;
  changeId: ChangeId;
  guard: VersionGuard;
}

export interface ChangeShapeDraftInput {
  appetite?: string;
  constraints?: string[];
  options?: ChangeShapeOption[];
  selectedOptionId?: string;
  rationale?: string;
  risks?: string[];
  noGos?: string[];
  openQuestions?: string[];
  architectureImpact?: string[];
}

export interface UpdateShapeInput {
  commandId: string;
  actor: ActorRef;
  changeId: ChangeId;
  changeGuard: VersionGuard;
  shapeGuard: VersionGuard;
  shapeDraft: ChangeShapeDraftInput;
}

export interface ShapeTwoGuardInput {
  commandId: string;
  actor: ActorRef;
  changeId: ChangeId;
  changeGuard: VersionGuard;
  shapeGuard: VersionGuard;
}

export interface ReopenShapeInput extends ShapeTwoGuardInput {
  reason: string;
}

export interface ChangeDispositionInput {
  commandId: string;
  actor: ActorRef;
  changeId: ChangeId;
  guard: VersionGuard;
  reason?: string;
}

export interface SplitChangeChildInput {
  title: string;
  type: ChangeType;
  priority?: ChangePriority;
  requirement: ChangeRequirement;
}

export interface SplitChangeInput {
  commandId: string;
  actor: ActorRef;
  changeId: ChangeId;
  guard: VersionGuard;
  children: SplitChangeChildInput[];
  reason: string;
}

export interface MergeChangesInput {
  commandId: string;
  actor: ActorRef;
  sourceIds: ChangeId[];
  sourceGuards: VersionGuard[];
  target: { title: string; type: ChangeType; priority?: ChangePriority; requirement: ChangeRequirement };
  reason: string;
}

/** System/agent evidence that the linked delivery finished. Never marks a Change done. */
export interface RecordDeliveryCompletedInput {
  commandId: string;
  actor: ActorRef;
  changeId: ChangeId;
  guard: VersionGuard;
  epicId: EpicId;
  completedAt?: string;
}

/** Human decision that a completed delivery intentionally has no Context delta. */
export interface MarkContextNotRequiredInput {
  commandId: string;
  actor: ActorRef;
  changeId: ChangeId;
  guard: VersionGuard;
  epicId: EpicId;
  reason: string;
}

/** Human Apply of a delivery-originated Context Proposal. */
export interface MarkContextAppliedInput {
  commandId: string;
  actor: ActorRef;
  changeId: ChangeId;
  guard: VersionGuard;
  epicId: EpicId;
  proposalIds: ContextProposalId[];
  contextRevisionIds: ContextRevisionId[];
}

// ── Service ──────────────────────────────────────────────────────────

export class ChangeService {
  readonly store: ChangeStore;
  private readonly clock: () => string;

  constructor(readonly workspaceRoot: string, options: { clock?: () => string; store?: ChangeStore } = {}) {
    this.clock = options.clock ?? nowIso;
    this.store = options.store ?? new ChangeStore(workspaceRoot);
  }

  list(): ProjectChange[] {
    return this.store.list();
  }
  get(id: ChangeId): ProjectChange | null {
    return this.store.read(id);
  }
  require(id: ChangeId): ProjectChange {
    return this.store.require(id);
  }
  getShape(id: ChangeId): ChangeShape | null {
    return this.store.readShape(id);
  }
  readModel(id: ChangeId): ProjectChangeReadModel {
    const change = this.store.require(id);
    return buildProjectChangeReadModel({ change, shape: this.store.readShape(id) ?? undefined });
  }

  // ── change.create ────────────────────────────────────────────────

  create(input: CreateChangeInput): { change: ProjectChange; readModel: ProjectChangeReadModel } {
    if (input.actor.kind === 'agent') {
      throw new ChangeHumanRequiredError('change.create must be invoked by a user, or by system for an explicit import/migration action.');
    }
    const id = generateChangeId();
    const now = this.clock();
    const draft: ProjectChangeDraft = {
      schemaVersion: 1,
      id,
      revision: 0,
      title: input.title.trim(),
      type: input.type,
      priority: input.priority ?? 'unset',
      disposition: 'active',
      requirement: input.requirement,
      origin: input.origin,
      externalRefs: input.externalRefs ?? [],
      contextSync: { status: 'not-evaluated' },
      relations: { mergedFrom: [], relatesTo: [] },
      createdAt: now,
      updatedAt: now,
    };
    const change = this.store.create(id, () => ({ ...draft, contentHash: computeChangeContentHash(draft) }));
    this.recordEvent(id, { commandId: input.commandId, type: 'change.created', actor: input.actor, afterHash: change.contentHash });
    return { change, readModel: buildProjectChangeReadModel({ change }) };
  }

  // ── change.requirement.update ────────────────────────────────────

  updateRequirement(input: UpdateChangeRequirementInput): { change: ProjectChange; readModel: ProjectChangeReadModel; staleFacts: string[] } {
    actorRequiresUser(input.actor, 'change.requirement.update');
    return this.replayOrRun(
      input.changeId,
      input.commandId,
      () => {
        const before = this.store.require(input.changeId);
        assertNotTerminal(before, 'change.requirement.update');
        const change = this.store.update(input.changeId, input.guard, (current) => {
          const next: ProjectChangeDraft = {
            ...current,
            requirement: input.requirement,
            title: input.title?.trim() ?? current.title,
            type: input.type ?? current.type,
            priority: input.priority ?? current.priority,
            updatedAt: this.clock(),
            revision: current.revision + 1,
          };
          return { ...next, contentHash: computeChangeContentHash(next) };
        });
        const staleFacts: string[] = [];
        if (before.shapeRef) staleFacts.push('shape');
        if (before.latestScopeAnalysisId) staleFacts.push('scopeAnalysis');
        this.recordEvent(input.changeId, {
          commandId: input.commandId,
          type: 'change.requirement.updated',
          actor: input.actor,
          beforeHash: before.contentHash,
          afterHash: change.contentHash,
          evidence: { staleFacts },
        });
        return { change, readModel: buildProjectChangeReadModel({ change, shape: this.store.readShape(input.changeId) ?? undefined }), staleFacts };
      },
      (event) => {
        const change = this.store.require(input.changeId);
        const staleFacts = (event.evidence?.staleFacts as string[] | undefined) ?? [];
        return { change, readModel: buildProjectChangeReadModel({ change, shape: this.store.readShape(input.changeId) ?? undefined }), staleFacts };
      },
    );
  }

  // ── change.scope.propose ─────────────────────────────────────────

  proposeScope(input: ProposeScopeAnalysisInput): { change: ProjectChange; analysis: ScopeAnalysis; readModel: ProjectChangeReadModel } {
    actorRequiresAgentOrSystem(input.actor, 'change.scope.propose');
    return this.replayOrRun(
      input.changeId,
      input.commandId,
      () => {
        const before = this.store.require(input.changeId);
        assertNotTerminal(before, 'change.scope.propose');
        // Validated up front (before writing the immutable analysis file) so a stale guard never
        // leaves an orphaned analysis behind — `store.update` below re-checks it authoritatively.
        assertGuardMatches('change', `Change ${input.changeId}`, before, input.guard);
        const analysisId = generateScopeAnalysisId();
        const analysis = parseScopeAnalysis({
          schemaVersion: 1,
          id: analysisId,
          changeId: input.changeId,
          supersedesAnalysisId: before.latestScopeAnalysisId,
          analyzedAgainst: {
            changeRevision: before.revision,
            changeContentHash: before.contentHash,
            contextRevisionId: input.contextRevisionId,
            contextRootHash: input.contextRootHash,
            sourceSnapshotHash: input.sourceSnapshotHash,
          },
          contextEntityKeys: input.contextEntityKeys ?? [],
          files: input.files ?? [],
          symbols: input.symbols ?? [],
          dependencies: input.dependencies ?? [],
          risks: input.risks ?? [],
          unknowns: input.unknowns ?? [],
          confidence: input.confidence,
          legacyImpactStatus: input.legacyImpactStatus,
          producedBy: input.actor,
          createdAt: this.clock(),
        });
        this.store.writeAnalysis(input.changeId, analysis);
        const change = this.store.update(input.changeId, input.guard, (current) => {
          const next: ProjectChangeDraft = { ...current, latestScopeAnalysisId: analysisId, updatedAt: this.clock(), revision: current.revision + 1 };
          return { ...next, contentHash: computeChangeContentHash(next) };
        });
        this.recordEvent(input.changeId, {
          commandId: input.commandId,
          type: 'change.scope.proposed',
          actor: input.actor,
          beforeHash: before.contentHash,
          afterHash: change.contentHash,
          evidence: { analysisId },
        });
        return { change, analysis, readModel: buildProjectChangeReadModel({ change, shape: this.store.readShape(input.changeId) ?? undefined }) };
      },
      (event) => {
        const change = this.store.require(input.changeId);
        const analysisId = event.evidence?.analysisId as string;
        const analysis = this.store.readAnalysis(input.changeId, analysisId as ScopeAnalysis['id']);
        if (!analysis) throw new ChangeInvalidStateError(`Replay of ${input.commandId} could not find analysis ${analysisId} for Change ${input.changeId}.`);
        return { change, analysis, readModel: buildProjectChangeReadModel({ change, shape: this.store.readShape(input.changeId) ?? undefined }) };
      },
    );
  }

  // ── change.scope.feedback ────────────────────────────────────────

  recordScopeFeedback(input: RecordScopeFeedbackInput): { change: ProjectChange; readModel: ProjectChangeReadModel } {
    actorRequiresUser(input.actor, 'change.scope.feedback');
    if (!SCOPE_FEEDBACK_NEXT_ROUTES.includes(input.nextRoute)) {
      throw new ChangeInvalidStateError(`change.scope.feedback nextRoute must be one of [${SCOPE_FEEDBACK_NEXT_ROUTES.join(', ')}], got "${input.nextRoute}".`);
    }
    return this.replayOrRun(
      input.changeId,
      input.commandId,
      () => {
        const before = this.store.require(input.changeId);
        const outcome = SCOPE_FEEDBACK_OUTCOME[input.nextRoute];
        let change = before;
        if (outcome) {
          change = this.store.update(input.changeId, input.guard, (current) => {
            const scopeReview: ScopeAnalysisReview = {
              analysisId: input.analysisId,
              outcome,
              feedback: input.feedback,
              at: this.clock(),
              actor: input.actor,
            };
            const next: ProjectChangeDraft = { ...current, scopeReview, updatedAt: this.clock(), revision: current.revision + 1 };
            return { ...next, contentHash: computeChangeContentHash(next) };
          });
        } else {
          // 'edit-requirement' / 'shelve': the UI dispatches a *second* command for the actual
          // route (plan §18.6); this call only records why, so it must not mutate the Change.
          assertGuardMatches('change', `Change ${input.changeId}`, before, input.guard);
        }
        this.recordEvent(input.changeId, {
          commandId: input.commandId,
          type: 'change.scope.feedback.recorded',
          actor: input.actor,
          beforeHash: before.contentHash,
          afterHash: change.contentHash,
          evidence: { nextRoute: input.nextRoute, analysisId: input.analysisId },
        });
        return { change, readModel: buildProjectChangeReadModel({ change, shape: this.store.readShape(input.changeId) ?? undefined }) };
      },
      () => {
        const change = this.store.require(input.changeId);
        return { change, readModel: buildProjectChangeReadModel({ change, shape: this.store.readShape(input.changeId) ?? undefined }) };
      },
    );
  }

  // ── change.explore.start ─────────────────────────────────────────

  startExplore(input: StartExploreInput): { change: ProjectChange; shape: ChangeShape; readModel: ProjectChangeReadModel } {
    actorRequiresUser(input.actor, 'change.explore.start');
    return this.replayOrRun(
      input.changeId,
      input.commandId,
      () => {
        const before = this.store.require(input.changeId);
        if (before.shapeRef) {
          // Re-entering Explore on an already-shaped Change is not an error (§D2) — it just opens the existing Shape.
          const shape = this.store.requireShape(input.changeId);
          return { change: before, shape, readModel: buildProjectChangeReadModel({ change: before, shape }) };
        }
        assertNotTerminal(before, 'change.explore.start');
        const now = this.clock();
        const shapeDraft: ChangeShapeDraft = {
          schemaVersion: 1,
          changeId: input.changeId,
          revision: 0,
          status: 'exploring',
          constraints: [],
          options: [],
          risks: [],
          noGos: [],
          openQuestions: [],
          architectureImpact: [],
          basedOnChange: { revision: before.revision, contentHash: computeChangeRequirementSliceHash(before) },
        };
        const shape = this.store.createShape(input.changeId, () => ({ ...shapeDraft, contentHash: computeChangeShapeContentHash(shapeDraft) }));
        const change = this.store.update(input.changeId, input.guard, (current) => {
          const next: ProjectChangeDraft = {
            ...current,
            shapeRef: { revision: shape.revision, contentHash: shape.contentHash },
            updatedAt: now,
            revision: current.revision + 1,
          };
          return { ...next, contentHash: computeChangeContentHash(next) };
        });
        this.recordEvent(input.changeId, {
          commandId: input.commandId,
          type: 'change.explore.started',
          actor: input.actor,
          beforeHash: before.contentHash,
          afterHash: change.contentHash,
        });
        return { change, shape, readModel: buildProjectChangeReadModel({ change, shape }) };
      },
      () => this.replayChangeAndShape(input.changeId),
    );
  }

  // ── change.shape.update ──────────────────────────────────────────

  updateShape(input: UpdateShapeInput): { change: ProjectChange; shape: ChangeShape; readModel: ProjectChangeReadModel } {
    if (input.actor.kind === 'system') {
      throw new ChangeHumanRequiredError('change.shape.update may be called by a user or an agent (policy permitting), not system.');
    }
    return this.replayOrRun(
      input.changeId,
      input.commandId,
      () => {
        const beforeChange = this.store.require(input.changeId);
        const beforeShape = this.store.requireShape(input.changeId);
        const wasFinalized = beforeShape.status === 'ready' || beforeShape.status === 'accepted';
        const shape = this.store.updateShape(input.changeId, input.shapeGuard, (current) => {
          const next: ChangeShapeDraft = {
            ...current,
            appetite: input.shapeDraft.appetite ?? current.appetite,
            constraints: input.shapeDraft.constraints ?? current.constraints,
            options: input.shapeDraft.options ?? current.options,
            selectedOptionId: input.shapeDraft.selectedOptionId ?? current.selectedOptionId,
            rationale: input.shapeDraft.rationale ?? current.rationale,
            risks: input.shapeDraft.risks ?? current.risks,
            noGos: input.shapeDraft.noGos ?? current.noGos,
            openQuestions: input.shapeDraft.openQuestions ?? current.openQuestions,
            architectureImpact: input.shapeDraft.architectureImpact ?? current.architectureImpact,
            status: wasFinalized ? 'exploring' : current.status,
            acceptedBy: wasFinalized ? undefined : current.acceptedBy,
            acceptedAt: wasFinalized ? undefined : current.acceptedAt,
            revision: current.revision + 1,
          };
          return { ...next, contentHash: computeChangeShapeContentHash(next) };
        });
        const change = this.store.update(input.changeId, input.changeGuard, (current) => {
          const next: ProjectChangeDraft = {
            ...current,
            shapeRef: { revision: shape.revision, contentHash: shape.contentHash },
            updatedAt: this.clock(),
            revision: current.revision + 1,
          };
          return { ...next, contentHash: computeChangeContentHash(next) };
        });
        this.recordEvent(input.changeId, {
          commandId: input.commandId,
          type: 'change.shape.updated',
          actor: input.actor,
          beforeHash: beforeChange.contentHash,
          afterHash: change.contentHash,
        });
        return { change, shape, readModel: buildProjectChangeReadModel({ change, shape }) };
      },
      () => this.replayChangeAndShape(input.changeId),
    );
  }

  // ── change.shape.ready ────────────────────────────────────────────

  markShapeReady(input: ShapeTwoGuardInput): { change: ProjectChange; shape: ChangeShape; readModel: ProjectChangeReadModel; blockers: string[] } {
    actorRequiresUser(input.actor, 'change.shape.ready');
    return this.replayOrRun(
      input.changeId,
      input.commandId,
      () => {
        const beforeChange = this.store.require(input.changeId);
        const beforeShape = this.store.requireShape(input.changeId);
        assertGuardMatches('change', `Change ${input.changeId}`, beforeChange, input.changeGuard);
        assertGuardMatches('shape', `Shape for Change ${input.changeId}`, beforeShape, input.shapeGuard);
        const blockers = shapeReadinessBlockers(beforeShape);
        if (blockers.length > 0) {
          return {
            change: beforeChange,
            shape: beforeShape,
            readModel: buildProjectChangeReadModel({ change: beforeChange, shape: beforeShape }),
            blockers,
          };
        }
        const shape = this.store.updateShape(input.changeId, input.shapeGuard, (current) => {
          const next: ChangeShapeDraft = { ...current, status: 'ready', revision: current.revision + 1 };
          return { ...next, contentHash: computeChangeShapeContentHash(next) };
        });
        const change = this.store.update(input.changeId, input.changeGuard, (current) => {
          const next: ProjectChangeDraft = {
            ...current,
            shapeRef: { revision: shape.revision, contentHash: shape.contentHash },
            updatedAt: this.clock(),
            revision: current.revision + 1,
          };
          return { ...next, contentHash: computeChangeContentHash(next) };
        });
        this.recordEvent(input.changeId, {
          commandId: input.commandId,
          type: 'change.shape.ready',
          actor: input.actor,
          beforeHash: beforeChange.contentHash,
          afterHash: change.contentHash,
        });
        return { change, shape, readModel: buildProjectChangeReadModel({ change, shape }), blockers: [] };
      },
      // A replay only ever matches the success path — the blocked path returns without recording an event.
      () => ({ ...this.replayChangeAndShape(input.changeId), blockers: [] }),
    );
  }

  // ── change.shape.accept ───────────────────────────────────────────

  acceptShape(input: ShapeTwoGuardInput): { change: ProjectChange; shape: ChangeShape; readModel: ProjectChangeReadModel } {
    if (input.actor.kind !== 'user') throw new ChangeHumanRequiredError('change.shape.accept requires a human user.');
    return this.replayOrRun(
      input.changeId,
      input.commandId,
      () => {
        const beforeChange = this.store.require(input.changeId);
        const beforeShape = this.store.requireShape(input.changeId);
        assertGuardMatches('change', `Change ${input.changeId}`, beforeChange, input.changeGuard);
        if (beforeShape.status !== 'ready') {
          throw new ShapeNotReadyError(
            `Shape for Change ${input.changeId} must be ready before it can be accepted (current status: ${beforeShape.status}).`,
            shapeReadinessBlockers(beforeShape),
          );
        }
        const now = this.clock();
        const shape = this.store.updateShape(input.changeId, input.shapeGuard, (current) => {
          const next: ChangeShapeDraft = { ...current, status: 'accepted', acceptedBy: input.actor, acceptedAt: now, revision: current.revision + 1 };
          return { ...next, contentHash: computeChangeShapeContentHash(next) };
        });
        const change = this.store.update(input.changeId, input.changeGuard, (current) => {
          const next: ProjectChangeDraft = {
            ...current,
            shapeRef: { revision: shape.revision, contentHash: shape.contentHash },
            updatedAt: now,
            revision: current.revision + 1,
          };
          return { ...next, contentHash: computeChangeContentHash(next) };
        });
        this.recordEvent(input.changeId, {
          commandId: input.commandId,
          type: 'change.shape.accepted',
          actor: input.actor,
          beforeHash: beforeChange.contentHash,
          afterHash: change.contentHash,
        });
        return { change, shape, readModel: buildProjectChangeReadModel({ change, shape }) };
      },
      () => this.replayChangeAndShape(input.changeId),
    );
  }

  // ── change.shape.reopen ───────────────────────────────────────────

  reopenShape(input: ReopenShapeInput): { change: ProjectChange; shape: ChangeShape; readModel: ProjectChangeReadModel } {
    if (input.actor.kind !== 'user') throw new ChangeHumanRequiredError('change.shape.reopen requires a human user.');
    if (!input.reason.trim()) throw new ChangeInvalidStateError('change.shape.reopen requires a non-blank reason.');
    return this.replayOrRun(
      input.changeId,
      input.commandId,
      () => {
        const beforeChange = this.store.require(input.changeId);
        const now = this.clock();
        const shape = this.store.updateShape(input.changeId, input.shapeGuard, (current) => {
          const next: ChangeShapeDraft = { ...current, status: 'exploring', acceptedBy: undefined, acceptedAt: undefined, revision: current.revision + 1 };
          return { ...next, contentHash: computeChangeShapeContentHash(next) };
        });
        const change = this.store.update(input.changeId, input.changeGuard, (current) => {
          const next: ProjectChangeDraft = {
            ...current,
            shapeRef: { revision: shape.revision, contentHash: shape.contentHash },
            updatedAt: now,
            revision: current.revision + 1,
          };
          return { ...next, contentHash: computeChangeContentHash(next) };
        });
        this.recordEvent(input.changeId, {
          commandId: input.commandId,
          type: 'change.shape.reopened',
          actor: input.actor,
          beforeHash: beforeChange.contentHash,
          afterHash: change.contentHash,
          evidence: { reason: input.reason },
        });
        return { change, shape, readModel: buildProjectChangeReadModel({ change, shape }) };
      },
      () => this.replayChangeAndShape(input.changeId),
    );
  }

  // ── change.shelve / change.reopen / change.cancel ────────────────

  shelve(input: ChangeDispositionInput): { change: ProjectChange; readModel: ProjectChangeReadModel } {
    return this.transitionDisposition(input, ['active'], 'shelved', 'change.shelved');
  }
  reopen(input: ChangeDispositionInput): { change: ProjectChange; readModel: ProjectChangeReadModel } {
    return this.transitionDisposition(input, ['shelved'], 'active', 'change.reopened');
  }
  cancel(input: ChangeDispositionInput): { change: ProjectChange; readModel: ProjectChangeReadModel } {
    return this.transitionDisposition(input, ['active', 'shelved'], 'cancelled', 'change.cancelled');
  }

  private transitionDisposition(
    input: ChangeDispositionInput,
    from: ChangeDisposition[],
    to: ChangeDisposition,
    eventType: string,
  ): { change: ProjectChange; readModel: ProjectChangeReadModel } {
    actorRequiresUser(input.actor, eventType);
    return this.replayOrRun(
      input.changeId,
      input.commandId,
      () => {
        const before = this.store.require(input.changeId);
        if (!from.includes(before.disposition)) {
          throw new ChangeInvalidStateError(`${eventType} requires disposition to be one of [${from.join(', ')}] (current: ${before.disposition}).`);
        }
        const change = this.store.update(input.changeId, input.guard, (current) => {
          const next: ProjectChangeDraft = { ...current, disposition: to, updatedAt: this.clock(), revision: current.revision + 1 };
          return { ...next, contentHash: computeChangeContentHash(next) };
        });
        this.recordEvent(input.changeId, {
          commandId: input.commandId,
          type: eventType,
          actor: input.actor,
          beforeHash: before.contentHash,
          afterHash: change.contentHash,
          evidence: input.reason ? { reason: input.reason } : undefined,
        });
        return { change, readModel: buildProjectChangeReadModel({ change, shape: this.store.readShape(input.changeId) ?? undefined }) };
      },
      () => this.replayChangeOnly(input.changeId),
    );
  }

  // ── change.split ──────────────────────────────────────────────────

  split(input: SplitChangeInput): { source: ProjectChange; children: ProjectChange[]; readModels: ProjectChangeReadModel[] } {
    actorRequiresUser(input.actor, 'change.split');
    if (input.children.length < 2) throw new ChangeInvalidStateError('change.split requires at least two children.');
    if (!input.reason.trim()) throw new ChangeInvalidStateError('change.split requires a non-blank reason.');

    return this.replayOrRun(
      input.changeId,
      input.commandId,
      () => {
        const before = this.store.require(input.changeId);
        if (before.disposition !== 'active') {
          throw new ChangeInvalidStateError(`change.split requires the source Change to be active (current: ${before.disposition}).`);
        }
        if (before.epicLink) {
          throw new ChangeInvalidStateError('change.split is not allowed once an Epic has started; split before Start Epic.');
        }

        const now = this.clock();
        const children = input.children.map((childInput) => {
          const childId = generateChangeId();
          const draft: ProjectChangeDraft = {
            schemaVersion: 1,
            id: childId,
            revision: 0,
            title: childInput.title.trim(),
            type: childInput.type,
            priority: childInput.priority ?? before.priority,
            disposition: 'active',
            requirement: childInput.requirement,
            origin: { kind: 'user', entryPoint: before.origin.entryPoint, actor: input.actor, sourceChangeId: before.id },
            externalRefs: [],
            contextSync: { status: 'not-evaluated' },
            relations: { splitFrom: before.id, mergedFrom: [], relatesTo: [] },
            createdAt: now,
            updatedAt: now,
          };
          return this.store.create(childId, () => ({ ...draft, contentHash: computeChangeContentHash(draft) }));
        });

        const source = this.store.update(input.changeId, input.guard, (current) => {
          const next: ProjectChangeDraft = {
            ...current,
            disposition: 'superseded',
            relations: { ...current.relations, relatesTo: dedupeIds([...current.relations.relatesTo, ...children.map((c) => c.id)]) },
            updatedAt: now,
            revision: current.revision + 1,
          };
          return { ...next, contentHash: computeChangeContentHash(next) };
        });

        this.recordEvent(input.changeId, {
          commandId: input.commandId,
          type: 'change.split',
          actor: input.actor,
          beforeHash: before.contentHash,
          afterHash: source.contentHash,
          evidence: { reason: input.reason, childIds: children.map((c) => c.id) },
        });
        for (const child of children) {
          this.recordEvent(child.id, {
            commandId: input.commandId,
            type: 'change.split.created',
            actor: input.actor,
            afterHash: child.contentHash,
            evidence: { splitFrom: before.id },
          });
        }

        return { source, children, readModels: [source, ...children].map((change) => buildProjectChangeReadModel({ change })) };
      },
      (event) => {
        const source = this.store.require(input.changeId);
        const childIds = ((event.evidence?.childIds as ChangeId[] | undefined) ?? []).filter((id) => id !== undefined);
        const children = childIds.map((id) => this.store.require(id));
        return { source, children, readModels: [source, ...children].map((change) => buildProjectChangeReadModel({ change })) };
      },
    );
  }

  // ── change.merge ──────────────────────────────────────────────────

  merge(input: MergeChangesInput): { sources: ProjectChange[]; target: ProjectChange; readModels: ProjectChangeReadModel[] } {
    actorRequiresUser(input.actor, 'change.merge');
    if (input.sourceIds.length < 2) throw new ChangeInvalidStateError('change.merge requires at least two source Changes.');
    if (input.sourceIds.length !== input.sourceGuards.length) {
      throw new ChangeInvalidStateError('change.merge requires exactly one guard per source Change.');
    }
    if (!input.reason.trim()) throw new ChangeInvalidStateError('change.merge requires a non-blank reason.');
    if (new Set(input.sourceIds).size !== input.sourceIds.length) {
      throw new ChangeRelationCycleError('change.merge sourceIds must be unique.');
    }

    const primaryId = input.sourceIds[0];
    return this.replayOrRun(
      primaryId,
      input.commandId,
      () => {
        const befores = input.sourceIds.map((id) => this.store.require(id));
        for (const before of befores) {
          if (before.disposition !== 'active') {
            throw new ChangeInvalidStateError(`change.merge requires every source Change to be active (${before.id} is ${before.disposition}).`);
          }
          if (before.epicLink) {
            throw new ChangeInvalidStateError(`change.merge is not allowed once an Epic has started (${before.id} already has one).`);
          }
        }

        const now = this.clock();
        const targetId = generateChangeId();
        const targetDraft: ProjectChangeDraft = {
          schemaVersion: 1,
          id: targetId,
          revision: 0,
          title: input.target.title.trim(),
          type: input.target.type,
          priority: input.target.priority ?? befores[0].priority,
          disposition: 'active',
          requirement: input.target.requirement,
          origin: { kind: 'user', entryPoint: befores[0].origin.entryPoint, actor: input.actor },
          externalRefs: dedupeExternalRefs(befores.flatMap((before) => before.externalRefs)),
          contextSync: { status: 'not-evaluated' },
          relations: { mergedFrom: befores.map((before) => before.id), relatesTo: [] },
          createdAt: now,
          updatedAt: now,
        };
        const target = this.store.create(targetId, () => ({ ...targetDraft, contentHash: computeChangeContentHash(targetDraft) }));

        const sources = befores.map((before, index) =>
          this.store.update(before.id, input.sourceGuards[index], (current) => {
            const next: ProjectChangeDraft = {
              ...current,
              disposition: 'superseded',
              relations: { ...current.relations, supersededBy: targetId },
              updatedAt: now,
              revision: current.revision + 1,
            };
            return { ...next, contentHash: computeChangeContentHash(next) };
          }),
        );

        this.recordEvent(targetId, {
          commandId: input.commandId,
          type: 'change.merge.created',
          actor: input.actor,
          afterHash: target.contentHash,
          evidence: { reason: input.reason, sourceIds: befores.map((before) => before.id) },
        });
        for (const source of sources) {
          this.recordEvent(source.id, {
            commandId: input.commandId,
            type: 'change.merge.superseded',
            actor: input.actor,
            afterHash: source.contentHash,
            evidence: { reason: input.reason, targetId },
          });
        }

        return { sources, target, readModels: [target, ...sources].map((change) => buildProjectChangeReadModel({ change })) };
      },
      (event) => {
        const targetId = event.evidence?.targetId as ChangeId;
        const target = this.store.require(targetId);
        const sources = input.sourceIds.map((id) => this.store.require(id));
        return { sources, target, readModels: [target, ...sources].map((change) => buildProjectChangeReadModel({ change })) };
      },
    );
  }

  // ── delivery → Context close-out ───────────────────────────────

  /**
   * Record the independently-observed fact that a linked Epic completed.
   * This moves Context sync to `pending`; it intentionally does not move the
   * Change to `done`, because only a later human Context decision can do so.
   */
  recordDeliveryCompleted(input: RecordDeliveryCompletedInput): { change: ProjectChange; readModel: ProjectChangeReadModel } {
    actorRequiresAgentOrSystem(input.actor, 'change.delivery.complete');
    return this.replayOrRun(
      input.changeId,
      input.commandId,
      () => {
        const before = this.store.require(input.changeId);
        assertNotTerminal(before, 'change.delivery.complete');
        if (before.epicLink?.state !== 'linked' || before.epicLink.epicId !== input.epicId) {
          throw new ChangeInvalidStateError(`Change ${input.changeId} is not linked to completed Epic ${input.epicId}.`);
        }
        if (before.contextSync.status !== 'not-evaluated') {
          assertGuardMatches('change', `Change ${input.changeId}`, before, input.guard);
          return this.replayChangeOnly(input.changeId);
        }
        const completedAt = input.completedAt ?? this.clock();
        const change = this.store.update(input.changeId, input.guard, (current) => {
          const next: ProjectChangeDraft = {
            ...current,
            contextSync: { status: 'pending', epicId: input.epicId, deliveryCompletedAt: completedAt },
            updatedAt: this.clock(),
            revision: current.revision + 1,
          };
          return { ...next, contentHash: computeChangeContentHash(next) };
        });
        this.recordEvent(input.changeId, {
          commandId: input.commandId,
          type: 'change.delivery.completed',
          actor: input.actor,
          beforeHash: before.contentHash,
          afterHash: change.contentHash,
          evidence: { epicId: input.epicId, completedAt },
        });
        return { change, readModel: buildProjectChangeReadModel({ change, shape: this.store.readShape(input.changeId) ?? undefined }) };
      },
      () => this.replayChangeOnly(input.changeId),
    );
  }

  markContextNotRequired(input: MarkContextNotRequiredInput): { change: ProjectChange; readModel: ProjectChangeReadModel } {
    actorRequiresUser(input.actor, 'change.context.notrequired');
    const reason = input.reason.trim();
    if (!reason) throw new ChangeInvalidStateError('change.context.notrequired requires a non-blank rationale.');
    return this.replayOrRun(
      input.changeId,
      input.commandId,
      () => {
        const before = this.store.require(input.changeId);
        if (before.epicLink?.state !== 'linked' || before.epicLink.epicId !== input.epicId) {
          throw new ChangeInvalidStateError(`Change ${input.changeId} is not linked to Epic ${input.epicId}.`);
        }
        if (before.contextSync.status !== 'pending' && before.contextSync.status !== 'proposed') {
          throw new ChangeInvalidStateError(`Context sync for Change ${input.changeId} is ${before.contextSync.status}; it is not awaiting a close-out decision.`);
        }
        const now = this.clock();
        const change = this.store.update(input.changeId, input.guard, (current) => {
          const next: ProjectChangeDraft = {
            ...current,
            contextSync: { status: 'not-required', epicId: input.epicId, reason, resolvedAt: now, resolvedBy: input.actor },
            updatedAt: now,
            revision: current.revision + 1,
          };
          return { ...next, contentHash: computeChangeContentHash(next) };
        });
        this.recordEvent(input.changeId, {
          commandId: input.commandId,
          type: 'change.context.notrequired',
          actor: input.actor,
          beforeHash: before.contentHash,
          afterHash: change.contentHash,
          evidence: { epicId: input.epicId, reason },
        });
        return { change, readModel: buildProjectChangeReadModel({ change, shape: this.store.readShape(input.changeId) ?? undefined }) };
      },
      () => this.replayChangeOnly(input.changeId),
    );
  }

  markContextApplied(input: MarkContextAppliedInput): { change: ProjectChange; readModel: ProjectChangeReadModel } {
    actorRequiresUser(input.actor, 'change.context.applied');
    if (!input.proposalIds.length || !input.contextRevisionIds.length) {
      throw new ChangeInvalidStateError('change.context.applied requires at least one proposal and resulting Context revision.');
    }
    return this.replayOrRun(
      input.changeId,
      input.commandId,
      () => {
        const before = this.store.require(input.changeId);
        if (before.epicLink?.state !== 'linked' || before.epicLink.epicId !== input.epicId) {
          throw new ChangeInvalidStateError(`Change ${input.changeId} is not linked to Epic ${input.epicId}.`);
        }
        if (before.contextSync.status !== 'pending' && before.contextSync.status !== 'proposed') {
          throw new ChangeInvalidStateError(`Context sync for Change ${input.changeId} is ${before.contextSync.status}; it cannot be applied.`);
        }
        const now = this.clock();
        const change = this.store.update(input.changeId, input.guard, (current) => {
          const next: ProjectChangeDraft = {
            ...current,
            contextSync: {
              status: 'applied', epicId: input.epicId, proposalIds: [...new Set(input.proposalIds)],
              contextRevisionIds: [...new Set(input.contextRevisionIds)], resolvedAt: now, resolvedBy: input.actor,
            },
            updatedAt: now,
            revision: current.revision + 1,
          };
          return { ...next, contentHash: computeChangeContentHash(next) };
        });
        this.recordEvent(input.changeId, {
          commandId: input.commandId,
          type: 'change.context.applied',
          actor: input.actor,
          beforeHash: before.contentHash,
          afterHash: change.contentHash,
          evidence: { epicId: input.epicId, proposalIds: input.proposalIds, contextRevisionIds: input.contextRevisionIds },
        });
        return { change, readModel: buildProjectChangeReadModel({ change, shape: this.store.readShape(input.changeId) ?? undefined }) };
      },
      () => this.replayChangeOnly(input.changeId),
    );
  }

  // ── shared helpers ────────────────────────────────────────────────

  private replayOrRun<TResult>(primaryChangeId: ChangeId, commandId: string, run: () => TResult, replay: (event: DomainEvent) => TResult): TResult {
    const existing = this.store.findEventByCommandId(primaryChangeId, commandId);
    return existing ? replay(existing) : run();
  }

  private replayChangeOnly(id: ChangeId): { change: ProjectChange; readModel: ProjectChangeReadModel } {
    const change = this.store.require(id);
    return { change, readModel: buildProjectChangeReadModel({ change, shape: this.store.readShape(id) ?? undefined }) };
  }

  private replayChangeAndShape(id: ChangeId): { change: ProjectChange; shape: ChangeShape; readModel: ProjectChangeReadModel } {
    const change = this.store.require(id);
    const shape = this.store.requireShape(id);
    return { change, shape, readModel: buildProjectChangeReadModel({ change, shape }) };
  }

  private recordEvent(
    id: ChangeId,
    params: { commandId: string; type: string; actor: ActorRef; beforeHash?: string; afterHash?: string; evidence?: Record<string, unknown> },
  ): void {
    const event: DomainEvent = {
      schemaVersion: 1,
      id: generateDomainEventId(),
      aggregateType: 'change',
      aggregateId: id,
      commandId: params.commandId,
      type: params.type,
      actor: params.actor,
      at: this.clock(),
      beforeHash: params.beforeHash,
      afterHash: params.afterHash,
      evidence: params.evidence,
    };
    this.store.appendEvent(id, event);
  }
}

function shapeReadinessBlockers(shape: ChangeShape): string[] {
  const blockers: string[] = [];
  if (!shape.appetite?.trim()) blockers.push('Appetite is required.');
  if (!shape.selectedOptionId) blockers.push('Select one option before marking the Shape ready.');
  if (!shape.rationale?.trim()) blockers.push('Rationale for the selected option is required.');
  if (shape.noGos.filter((item) => item.trim()).length === 0) blockers.push('At least one no-go is required.');
  if (shape.openQuestions.filter((item) => item.trim()).length > 0) blockers.push('Resolve or remove all open questions.');
  return blockers;
}
