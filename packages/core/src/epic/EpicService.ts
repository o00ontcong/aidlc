/** Unified Epic state machine, idempotent lifecycle operations, and audit log. */

import {
  CORE_ERROR_CODES,
  createDefaultAutonomyPolicy,
  formatEventId,
  formatEpicEventId,
  formatRunId,
  isValidEpicTransition,
  nowIso,
  parseEpic,
  parseGateDecision,
  toEpicId,
  type ActorRef,
  type AutonomyPolicy,
  type Epic,
  type EpicEvent,
  type EpicId,
  type EpicProfile,
  type EpicRun,
  type EpicStatus,
  type EpicType,
  type EvidenceRef,
  type GateDecision,
  type GatePreview,
  type NextAction,
  type PendingGate,
  type RunEvent,
  type Stage,
} from '../contracts';
import { EpicStore } from './EpicStore';

export class EpicNotFoundError extends Error {
  readonly code = CORE_ERROR_CODES.EPIC_NOT_FOUND;
  constructor(readonly epicId: EpicId) {
    super(`Epic ${epicId} does not exist.`);
    this.name = 'EpicNotFoundError';
  }
}

export class EpicAlreadyExistsError extends Error {
  readonly code = CORE_ERROR_CODES.EPIC_DUPLICATE;
  constructor(readonly epicId: EpicId) {
    super(`Epic ${epicId} already exists. Resume it instead of creating a duplicate.`);
    this.name = 'EpicAlreadyExistsError';
  }
}

export class EpicRevisionConflictError extends Error {
  constructor(readonly epicId: EpicId, readonly expectedRevision: number, readonly actualRevision: number) {
    super(`Epic ${epicId} changed from revision ${expectedRevision} to ${actualRevision}; reload before writing.`);
    this.name = 'EpicRevisionConflictError';
  }
}

export class EpicTransitionError extends Error {
  readonly code = CORE_ERROR_CODES.EPIC_INVALID_TRANSITION;
  constructor(readonly epicId: EpicId, readonly from: EpicStatus, readonly to: EpicStatus) {
    super(`Epic ${epicId} cannot transition from ${from} to ${to}.`);
    this.name = 'EpicTransitionError';
  }
}

export interface CreateEpicInput {
  id: EpicId | string;
  title: string;
  description?: string;
  type?: EpicType;
  profile?: EpicProfile;
  autonomy?: AutonomyPolicy;
  stages?: Stage[];
}

/** Mutable Epic fields. Status, active run, revision and timestamps are service-owned. */
export type EpicUpdate = Partial<Pick<Epic, 'title' | 'description' | 'type' | 'profile' | 'autonomy' | 'stages' | 'currentStageId' | 'blockedReason'>>;

export interface EpicLifecycleOptions {
  expectedRevision?: number;
  actor?: ActorRef;
  command?: string;
  detail?: string;
  evidence?: EvidenceRef[];
  pendingGate?: PendingGate | null;
  gateId?: string;
  gatePreview?: GatePreview;
  gateDecision?: GateDecision;
}

export interface StartRunOptions extends EpicLifecycleOptions {
  /** W1E replaces this placeholder with the deterministic compiled-workflow hash. */
  workflowHash: string;
  stages?: Stage[];
}

export interface StartEpicResult {
  epic: Epic;
  created: boolean;
  nextAction?: NextAction;
}

export interface RunProgressOptions {
  stages: Stage[];
  currentStageId?: Stage['id'];
  expectedEpicRevision: number;
  expectedRunRevision: number;
  actor?: ActorRef;
  command?: string;
  actionId?: string;
  detail?: string;
  evidence?: EvidenceRef[];
}

export interface ResumeEpicResult {
  epic: Epic;
  resumed: boolean;
  nextAction?: NextAction;
}

const SYSTEM_ACTOR: ActorRef = { kind: 'system', id: 'aidlc' };

function defaultActor(actor?: ActorRef): ActorRef {
  return actor ?? SYSTEM_ACTOR;
}

/** The application-neutral next action used by CLI/UI command adapters in W2. */
export function nextActionForEpic(epic: Epic): NextAction | undefined {
  switch (epic.status) {
    case 'draft':
      return { summary: 'Review the Epic details and prepare its workflow.', command: 'epic.prepare' };
    case 'ready':
      return { summary: 'Compile the workflow and start the Epic run.', command: 'epic.run' };
    case 'running':
      return { summary: 'Continue the current stage action.', command: 'epic.next' };
    case 'waiting-for-user':
      return epic.pendingGate
        ? { summary: 'Review the pending gate and explicitly approve or reject it.', command: 'epic.explain', reason: `Pending gate: ${epic.pendingGate.preview.gate}.` }
        : { summary: 'Provide the requested input, then resume the Epic.', command: 'epic.resume' };
    case 'blocked':
      return { summary: 'Review the blocker and choose a recovery action.', command: 'epic.explain' };
    case 'paused':
      return { summary: 'Resume the paused Epic when ready.', command: 'epic.resume' };
    case 'review':
      return { summary: 'Review the accumulated evidence and decide whether to ship.', command: 'epic.review' };
    case 'shipping':
      return { summary: 'Complete the approved ship action.', command: 'epic.ship' };
    case 'completed':
      return undefined;
  }
}

/**
 * W1A service. It is intentionally application-neutral: no CLI, VS Code,
 * workflow compiler, provider, or legacy migration dependency is allowed.
 */
export class EpicService {
  readonly store: EpicStore;

  constructor(workspaceRoot: string, private readonly clock: () => string = nowIso) {
    this.store = new EpicStore(workspaceRoot);
  }

  create(input: CreateEpicInput): Epic {
    const id = toEpicId(String(input.id));
    if (this.store.loadEpic(id)) throw new EpicAlreadyExistsError(id);
    if (!input.title.trim()) throw new Error('Epic title must not be empty.');
    const at = this.clock();
    const epic: Epic = {
      schemaVersion: 1,
      id,
      title: input.title.trim(),
      description: input.description ?? '',
      type: input.type ?? 'feature',
      profile: input.profile ?? 'standard',
      status: 'draft',
      autonomy: input.autonomy ?? createDefaultAutonomyPolicy(),
      stages: input.stages ?? [],
      createdAt: at,
      updatedAt: at,
      revision: 0,
    };
    const validated = parseEpic(epic);
    this.store.saveEpic(validated, null);
    return validated;
  }

  /** Idempotent start: an existing id is returned unchanged, never duplicated. */
  start(input: CreateEpicInput): StartEpicResult {
    const id = toEpicId(String(input.id));
    const existing = this.store.loadEpic(id);
    if (existing) return { epic: existing, created: false, nextAction: nextActionForEpic(existing) };
    const epic = this.create(input);
    return { epic, created: true, nextAction: nextActionForEpic(epic) };
  }

  load(id: EpicId | string): Epic | null {
    return this.store.loadEpic(id);
  }

  require(id: EpicId | string): Epic {
    const epicId = toEpicId(String(id));
    const epic = this.store.loadEpic(epicId);
    if (!epic) throw new EpicNotFoundError(epicId);
    return epic;
  }

  list(): Epic[] {
    return this.store.listEpics();
  }

  update(id: EpicId | string, patch: EpicUpdate, expectedRevision: number): Epic {
    const current = this.require(id);
    this.assertRevision(current, expectedRevision);
    if (patch.stages && current.activeRunId) {
      throw new Error('Cannot replace stages while an Epic run is active; update the active run through the workflow engine.');
    }
    if (patch.title !== undefined && !patch.title.trim()) throw new Error('Epic title must not be empty.');
    const next: Epic = {
      ...current,
      ...patch,
      title: patch.title === undefined ? current.title : patch.title.trim(),
      updatedAt: this.clock(),
      revision: current.revision + 1,
    };
    const validated = parseEpic(next);
    this.store.saveEpic(validated, current.revision);
    return validated;
  }

  /** Move an Epic through its one, explicit top-level state machine. */
  transition(id: EpicId | string, to: EpicStatus, options: EpicLifecycleOptions = {}): Epic {
    const current = this.require(id);
    if (options.expectedRevision !== undefined) this.assertRevision(current, options.expectedRevision);
    if (!isValidEpicTransition(current.status, to)) throw new EpicTransitionError(current.id, current.status, to);
    if (current.pendingGate && to === 'running') {
      const decision = options.gateDecision ? parseGateDecision(options.gateDecision) : undefined;
      const correlatedApproval = options.pendingGate === null
        && decision?.outcome === 'approved'
        && decision.gate === current.pendingGate.preview.gate
        && JSON.stringify(decision.preview) === JSON.stringify(current.pendingGate.preview);
      if (!correlatedApproval) throw new Error(`Epic ${current.id} cannot resume until pending gate ${current.pendingGate.id} is explicitly approved.`);
    }
    if (current.status === 'ready' && to === 'running') {
      throw new Error('Use startRun() to move a ready Epic to running so its durable run projection and event log are created together.');
    }

    const at = this.clock();
    const next: Epic = {
      ...current,
      status: to,
      blockedReason: to === 'blocked' ? options.detail ?? current.blockedReason : undefined,
      pendingGate: options.pendingGate === null ? undefined : options.pendingGate ?? current.pendingGate,
      updatedAt: at,
      revision: current.revision + 1,
    };
    const run = this.syncRunForTransition(current, next, at, options);
    if (!current.activeRunId) this.appendEpicTransitionEvent(current, next, at, options);
    this.store.saveEpic(next, current.revision);
    if (run) this.store.saveRun(run, run.revision - 1);
    return next;
  }

  /**
   * Creates the first durable run for a ready Epic. Repeating the call after
   * the run is already active is idempotent and returns the same projection.
   */
  startRun(id: EpicId | string, options: StartRunOptions): { epic: Epic; run: EpicRun; started: boolean; nextAction?: NextAction } {
    const current = this.require(id);
    if (options.expectedRevision !== undefined) this.assertRevision(current, options.expectedRevision);
    if (current.status === 'running' && current.activeRunId) {
      const run = this.store.loadRun(current.activeRunId);
      if (!run) throw new Error(`Epic ${current.id} references missing active run ${current.activeRunId}.`);
      return { epic: current, run, started: false, nextAction: nextActionForEpic(current) };
    }
    if (current.status !== 'ready') throw new EpicTransitionError(current.id, current.status, 'running');
    if (!options.workflowHash.trim()) throw new Error('workflowHash must not be empty.');

    const at = this.clock();
    const sequence = this.nextRunSequence(current.id);
    const runId = formatRunId(current.id, sequence);
    const stages = options.stages ?? current.stages;
    const run: EpicRun = {
      schemaVersion: 1,
      id: runId,
      epicId: current.id,
      workflowHash: options.workflowHash,
      profile: current.profile,
      status: 'running',
      stages,
      startedAt: at,
      updatedAt: at,
      revision: 0,
    };
    const next: Epic = {
      ...current,
      status: 'running',
      activeRunId: runId,
      stages,
      updatedAt: at,
      revision: current.revision + 1,
    };

    this.store.saveRun(run, null);
    this.appendTransitionEvent(run, current.status, 'running', at, options);
    this.store.saveEpic(next, current.revision);
    return { epic: next, run, started: true, nextAction: nextActionForEpic(next) };
  }

  /** Persist action/stage progress as append-only audit first, then both projections. */
  updateRunProgress(id: EpicId | string, options: RunProgressOptions): { epic: Epic; run: EpicRun } {
    const current = this.require(id);
    this.assertRevision(current, options.expectedEpicRevision);
    if (!current.activeRunId) throw new Error(`Epic ${current.id} has no active run.`);
    const run = this.store.loadRun(current.activeRunId);
    if (!run) throw new Error(`Epic ${current.id} references missing active run ${current.activeRunId}.`);
    if (run.revision !== options.expectedRunRevision) throw new Error(`Run ${run.id} changed from revision ${options.expectedRunRevision} to ${run.revision}; reload before writing.`);
    const at = this.clock();
    const nextRun: EpicRun = { ...run, stages: options.stages, updatedAt: at, revision: run.revision + 1 };
    const nextEpic: Epic = { ...current, stages: options.stages, currentStageId: options.currentStageId, updatedAt: at, revision: current.revision + 1 };
    this.store.appendEvent(run.id, {
      schemaVersion: 1,
      id: formatEventId(run.id, this.store.readEvents(run.id).length + 1),
      at,
      actor: defaultActor(options.actor),
      epicId: current.id,
      runId: run.id,
      command: options.command ?? 'epic.next',
      stageId: options.currentStageId,
      actionId: options.actionId,
      from: current.status,
      to: current.status,
      evidence: options.evidence ?? [],
      detail: options.detail,
      stages: options.stages,
      currentStageId: options.currentStageId,
    });
    this.store.saveRun(nextRun, run.revision);
    this.store.saveEpic(nextEpic, current.revision);
    return { epic: nextEpic, run: nextRun };
  }

  /**
   * Resume is safe to invoke repeatedly. Only an interrupted Epic changes
   * state; all other states are returned with their current next action.
   */
  resume(id: EpicId | string, options: EpicLifecycleOptions = {}): ResumeEpicResult {
    const current = this.require(id);
    if (options.expectedRevision !== undefined) this.assertRevision(current, options.expectedRevision);
    // A generic resume must never stand in for an explicit human gate
    // decision. Only AutonomyRunCoordinator.decide() may clear the durable
    // gate and resume the run with a correlated approval audit event.
    if (current.pendingGate && options.gateDecision?.outcome !== 'approved') {
      return { epic: current, resumed: false, nextAction: nextActionForEpic(current) };
    }
    if (current.status === 'waiting-for-user' || current.status === 'blocked' || current.status === 'paused') {
      const epic = this.transition(current.id, 'running', options);
      return { epic, resumed: true, nextAction: nextActionForEpic(epic) };
    }
    return { epic: current, resumed: false, nextAction: nextActionForEpic(current) };
  }

  events(id: EpicId | string): Array<EpicEvent | RunEvent> {
    const epic = this.require(id);
    return [...this.store.readEpicEvents(epic.id), ...(epic.activeRunId ? this.store.readEvents(epic.activeRunId) : [])];
  }

  /** Append a non-transition audit record such as structured review feedback. */
  record(id: EpicId | string, options: EpicLifecycleOptions & { command: string; stageId?: Stage['id']; actionId?: string }): EpicEvent | RunEvent {
    const epic = this.require(id);
    const at = this.clock();
    if (epic.activeRunId) {
      const run = this.store.loadRun(epic.activeRunId);
      if (!run) throw new Error(`Epic ${epic.id} references missing active run ${epic.activeRunId}.`);
      const event: RunEvent = {
        schemaVersion: 1,
        id: formatEventId(run.id, this.store.readEvents(run.id).length + 1),
        at,
        actor: defaultActor(options.actor),
        epicId: epic.id,
        runId: run.id,
        command: options.command,
        stageId: options.stageId,
        actionId: options.actionId,
        from: epic.status,
        to: epic.status,
        evidence: options.evidence ?? [],
        detail: options.detail,
      };
      this.store.appendEvent(run.id, event);
      return event;
    }
    const event: EpicEvent = {
      schemaVersion: 1,
      id: formatEpicEventId(epic.id, this.store.readEpicEvents(epic.id).length + 1),
      at,
      actor: defaultActor(options.actor),
      epicId: epic.id,
      command: options.command,
      from: epic.status,
      to: epic.status,
      evidence: options.evidence ?? [],
      detail: options.detail,
    };
    this.store.appendEpicEvent(epic.id, event);
    return event;
  }

  private appendEpicTransitionEvent(current: Epic, next: Epic, at: string, options: EpicLifecycleOptions): void {
    const sequence = this.store.readEpicEvents(current.id).length + 1;
    this.store.appendEpicEvent(current.id, {
      schemaVersion: 1,
      id: formatEpicEventId(current.id, sequence),
      at,
      actor: defaultActor(options.actor),
      epicId: current.id,
      command: options.command ?? 'epic.transition',
      from: current.status,
      to: next.status,
      evidence: options.evidence ?? [],
      detail: options.detail,
    });
  }

  private syncRunForTransition(current: Epic, next: Epic, at: string, options: EpicLifecycleOptions): EpicRun | null {
    if (!current.activeRunId) return null;
    const run = this.store.loadRun(current.activeRunId);
    if (!run) throw new Error(`Epic ${current.id} references missing active run ${current.activeRunId}.`);
    const nextRun: EpicRun = {
      ...run,
      status: next.status,
      stages: next.stages,
      updatedAt: at,
      completedAt: next.status === 'completed' ? at : run.completedAt,
      pendingGate: next.pendingGate,
      revision: run.revision + 1,
    };
    this.appendTransitionEvent(nextRun, current.status, next.status, at, options);
    return nextRun;
  }

  private appendTransitionEvent(run: EpicRun, from: EpicStatus, to: EpicStatus, at: string, options: EpicLifecycleOptions): void {
    const event: RunEvent = {
      schemaVersion: 1,
      id: formatEventId(run.id, this.store.readEvents(run.id).length + 1),
      at,
      actor: defaultActor(options.actor),
      epicId: run.epicId,
      runId: run.id,
      command: options.command ?? 'epic.transition',
      from,
      to,
      evidence: options.evidence ?? [],
      detail: options.detail,
      gateId: options.gateId,
      gatePreview: options.gatePreview,
      gateDecision: options.gateDecision,
    };
    this.store.appendEvent(run.id, event);
  }

  private nextRunSequence(epicId: EpicId): number {
    const sequence = this.store.listRunsForEpic(epicId)
      .map((run) => Number(run.id.slice(run.id.lastIndexOf('--run-') + '--run-'.length)))
      .filter(Number.isFinite);
    return (sequence.length ? Math.max(...sequence) : 0) + 1;
  }

  private assertRevision(epic: Epic, expectedRevision: number): void {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new Error(`expectedRevision must be a non-negative integer, got ${expectedRevision}.`);
    }
    if (epic.revision !== expectedRevision) {
      throw new EpicRevisionConflictError(epic.id, expectedRevision, epic.revision);
    }
  }
}
