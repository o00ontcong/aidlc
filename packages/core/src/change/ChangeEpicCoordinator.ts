/**
 * `change.epic.start` / `change.epic.pending.resume` / `change.epic.pending.rollback`
 * (implementation plan §8, §9.2, §18.6) — the saga that turns an active,
 * unlinked Change into a Change with exactly one owning Epic (§D4), pinning
 * an immutable `EpicStartSnapshot` (§18.3) along the way.
 *
 * Epic facade decision (this milestone's flagged decision point, plan
 * §13 M3 "Phu thuoc: M2 va Epic facade decision"): the codebase currently
 * has *two* separate Epic-creation paths —
 *   - `epic/EpicService.ts` + `EpicStore.ts` (`.aidlc/epics/<id>/state.json`),
 *     wired into `AidlcApplication` but with zero callers in the extension
 *     today;
 *   - `runs/EpicScaffold.ts` (`docs/epics/<id>/...`), what the *current* UI
 *     ("Start Epic" modal, Discover handoff, Shape→Epic convert) actually
 *     calls.
 * This coordinator drives the former (`EpicService`) — it is the one no
 * live UI path depends on, so extending it (via a new sibling `start.json`,
 * not by editing `EpicSchema`) carries no risk of breaking anything a user
 * exercises today. `EpicScaffold`'s `docs/epics` path is left completely
 * untouched; unifying the two facades in the UI's eyes is explicitly M6
 * work (needs the UI rewire), not this one.
 *
 * Saga (plan §9.2), each step crash-safe and idempotent by `commandId`:
 *   1. Validate the Change is active and not linked to a different Epic.
 *   2. Write `epicLink = pending` (pins the Change revision/hash and the
 *      caller-supplied Context reference) — durable before anything else
 *      is attempted.
 *   3. `EpicService.start(...)` — already idempotent by id, so a retry
 *      here never creates a second Epic.
 *   4. Write the immutable `start.json` (create-only) if it is not already
 *      there; if it *is* there for a different Change/commandId, that is a
 *      genuine conflict, not a resume.
 *   5. Write `epicLink = linked`.
 * A crash between any two steps leaves `epicLink = pending` durably on the
 * Change; `resumePending`/`startEpic` with the same `commandId` continue
 * from wherever the saga actually got to (steps re-check what already
 * exists rather than blindly redoing work), and `rollbackPending` clears
 * the pending link without deleting anything the saga may have already
 * created (plan §D16: a broken/abandoned reference is marked, never
 * silently deleted).
 */

import * as path from 'path';

import {
  computeChangeContentHash,
  computeEpicStartSnapshotHash,
  generateDomainEventId,
  nowIso,
  parseEpicStartSnapshot,
  type ActorRef,
  type ChangeEpicLink,
  type ChangeId,
  type ChangeType,
  type ContextRevisionId,
  type DomainEvent,
  type Epic,
  type EpicId,
  type EpicProfile,
  type EpicStartSnapshot,
  type EpicType,
  type ProjectChange,
  type ProjectChangeDraft,
  type ProjectChangeReadModel,
  type SourceSnapshot,
} from '../contracts';
import { epicIdFromChangeId } from '../contracts/ids';
import { EpicService } from '../epic';
import { createJsonFileIfAbsent, readJsonFile } from '../storage/atomicJson';
import { AggregateConflictError, type VersionGuard } from '../storage/WorkspaceTransaction';
import { buildProjectChangeReadModel } from './buildProjectChangeReadModel';
import { ChangeStore } from './ChangeStore';
import { ChangeHumanRequiredError, ChangeInvalidStateError } from './errors';

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

/** `EpicType` has `spike` but no `other`; `ChangeType` is the mirror image. `other` maps to `maintenance` — the closest neutral bucket. */
function mapChangeTypeToEpicType(type: ChangeType): EpicType {
  return type === 'other' ? 'maintenance' : type;
}

export interface StartEpicInput {
  commandId: string;
  actor: ActorRef;
  changeId: ChangeId;
  guard: VersionGuard;
  pipeline: { id: string; runMode: 'guided' | 'autonomous'; extraProjects?: string[] };
  source: SourceSnapshot;
  context: { baseRevisionId: ContextRevisionId; baseRootHash: string; entityObjectHashes?: Record<string, string>; contextSliceHash: string };
  epicProfile?: EpicProfile;
  /**
   * Optional delivery id. Defaults to {@link epicIdFromChangeId}. When the
   * New change composer leaves Task id empty, the host supplies the next
   * sequenced `EPIC-NNN` instead of a fresh ULID suffix.
   */
  epicId?: EpicId;
}

export interface StartEpicOutput {
  change: ProjectChange;
  epic: Epic;
  startSnapshot: EpicStartSnapshot;
  readModel: ProjectChangeReadModel;
  /** True when this call did no work — an Epic was already linked (§D2: "Start lan hai" navigates, it does not re-run the saga). */
  alreadyLinked: boolean;
}

export interface PendingEpicLinkInput {
  commandId: string;
  actor: ActorRef;
  changeId: ChangeId;
  guard: VersionGuard;
}

export class ChangeEpicCoordinator {
  readonly changeStore: ChangeStore;
  readonly epics: EpicService;
  private readonly clock: () => string;

  constructor(readonly workspaceRoot: string, options: { clock?: () => string; changeStore?: ChangeStore; epics?: EpicService } = {}) {
    this.clock = options.clock ?? nowIso;
    this.changeStore = options.changeStore ?? new ChangeStore(workspaceRoot);
    this.epics = options.epics ?? new EpicService(workspaceRoot, this.clock);
  }

  startSnapshotFile(epicId: EpicId): string {
    return path.join(this.workspaceRoot, '.aidlc', 'epics', epicId, 'start.json');
  }

  readStartSnapshot(epicId: EpicId): EpicStartSnapshot | undefined {
    const raw = readJsonFile<unknown>(this.startSnapshotFile(epicId));
    return raw === undefined ? undefined : parseEpicStartSnapshot(raw);
  }

  startEpic(input: StartEpicInput): StartEpicOutput {
    if (input.actor.kind !== 'user') throw new ChangeHumanRequiredError('change.epic.start requires a human user.');
    const before = this.changeStore.require(input.changeId);

    if (before.epicLink?.state === 'linked') {
      // D2: a second Start Epic never opens a second Epic — it just returns the one that already exists.
      const epic = this.epics.require(before.epicLink.epicId);
      const startSnapshot = this.readStartSnapshot(before.epicLink.epicId);
      if (!startSnapshot) {
        throw new AggregateConflictError('storage.recovery_required', `Change ${input.changeId} is linked to ${before.epicLink.epicId} but its start snapshot is missing.`, { changeId: input.changeId, epicId: before.epicLink.epicId });
      }
      return { change: before, epic, startSnapshot, alreadyLinked: true, readModel: buildProjectChangeReadModel({ change: before, epicStatus: epic.status }) };
    }

    if (before.epicLink?.state === 'pending') {
      if (before.epicLink.commandId === input.commandId) {
        return this.continueSaga(before, input);
      }
      throw pendingRecoveryConflict(input.changeId, before.epicLink);
    }

    if (before.disposition !== 'active') {
      throw new ChangeInvalidStateError(`change.epic.start requires the Change to be active (current: ${before.disposition}).`);
    }
    assertGuardMatches('change', `Change ${input.changeId}`, before, input.guard);

    const epicId = input.epicId ?? epicIdFromChangeId(before.id);
    const now = this.clock();
    const pending = this.changeStore.update(input.changeId, input.guard, (current) => {
      const epicLink: ChangeEpicLink = {
        state: 'pending',
        commandId: input.commandId,
        epicId,
        changeRevision: current.revision,
        changeContentHash: current.contentHash,
        contextRevisionId: input.context.baseRevisionId,
        contextRootHash: input.context.baseRootHash,
        startedAt: now,
      };
      const { contentHash: _ignored, ...rest } = current;
      const next: ProjectChangeDraft = { ...rest, epicLink, updatedAt: now, revision: current.revision + 1 };
      return { ...next, contentHash: computeChangeContentHash(next) };
    });
    this.recordEvent(input.changeId, {
      commandId: input.commandId,
      type: 'change.epic.start.pending',
      actor: input.actor,
      beforeHash: before.contentHash,
      afterHash: pending.contentHash,
      evidence: { epicId },
    });

    return this.continueSaga(pending, input);
  }

  /**
   * `change.epic.pending.resume` deliberately takes no pipeline/source/context
   * (plan §18.6 payload: `{changeId,guard,pendingCommandId}`) — it can only
   * push the saga forward using what is *already durable*. If the crash
   * happened before `start.json` was ever written, there is nothing here to
   * resume from (the original pipeline/source/context selection was never
   * persisted anywhere): the caller must retry `change.epic.start` itself
   * with the original commandId and full payload — that path is already
   * idempotent from any point in the saga (see `startEpic`). This keeps
   * "resume" honest rather than fabricating placeholder pipeline/source data.
   */
  resumePending(input: PendingEpicLinkInput): StartEpicOutput {
    if (input.actor.kind !== 'user') throw new ChangeHumanRequiredError('change.epic.pending.resume requires a human user.');
    const change = this.changeStore.require(input.changeId);
    if (change.epicLink?.state !== 'pending') {
      throw new ChangeInvalidStateError(`Change ${input.changeId} has no pending Start Epic to resume.`);
    }
    if (change.epicLink.commandId !== input.commandId) {
      throw pendingRecoveryConflict(input.changeId, change.epicLink);
    }
    assertGuardMatches('change', `Change ${input.changeId}`, change, input.guard);

    const startSnapshot = this.readStartSnapshot(change.epicLink.epicId);
    if (!startSnapshot) {
      throw new ChangeInvalidStateError(
        `Change ${input.changeId}'s pending Start Epic has no recorded start snapshot yet. Retry change.epic.start with the same commandId and the original pipeline/source payload, or roll it back.`,
      );
    }
    return this.linkEpic(change, change.epicLink, startSnapshot, input.actor);
  }

  rollbackPending(input: { commandId: string; actor: ActorRef; changeId: ChangeId; guard: VersionGuard; reason: string }): { change: ProjectChange; readModel: ProjectChangeReadModel } {
    if (input.actor.kind !== 'user') throw new ChangeHumanRequiredError('change.epic.pending.rollback requires a human user.');
    if (!input.reason.trim()) throw new ChangeInvalidStateError('change.epic.pending.rollback requires a non-blank reason.');
    const before = this.changeStore.require(input.changeId);
    if (before.epicLink?.state !== 'pending') {
      throw new ChangeInvalidStateError(`Change ${input.changeId} has no pending Start Epic to roll back.`);
    }
    if (before.epicLink.commandId !== input.commandId) {
      throw pendingRecoveryConflict(input.changeId, before.epicLink);
    }
    const now = this.clock();
    const change = this.changeStore.update(input.changeId, input.guard, (current) => {
      const { contentHash: _ignored, epicLink: _epicLink, ...rest } = current;
      const next: ProjectChangeDraft = { ...rest, updatedAt: now, revision: current.revision + 1 };
      return { ...next, contentHash: computeChangeContentHash(next) };
    });
    this.recordEvent(input.changeId, {
      commandId: input.commandId,
      type: 'change.epic.pending.rolled_back',
      actor: input.actor,
      beforeHash: before.contentHash,
      afterHash: change.contentHash,
      evidence: { reason: input.reason },
    });
    return { change, readModel: buildProjectChangeReadModel({ change, shape: this.changeStore.readShape(input.changeId) ?? undefined }) };
  }

  /** Steps 3-5 of the saga (plan §9.2), for a *fresh* start — `change.epicLink` must already be `pending` for `input.commandId`, with full pipeline/source/context available to build `start.json` if it doesn't exist yet. */
  private continueSaga(change: ProjectChange, input: StartEpicInput): StartEpicOutput {
    const epicLink = change.epicLink;
    if (!epicLink || epicLink.state !== 'pending' || epicLink.commandId !== input.commandId) {
      throw new ChangeInvalidStateError(`Cannot continue the Start Epic saga for Change ${change.id}: no matching pending link.`);
    }
    const startSnapshot = this.ensureStartSnapshot(change, epicLink, input);
    return this.linkEpic(change, epicLink, startSnapshot, input.actor, input.epicProfile);
  }

  /** Read the existing immutable `start.json` if present (validating it belongs to this saga), else build and persist it from `input`. */
  private ensureStartSnapshot(change: ProjectChange, epicLink: Extract<ChangeEpicLink, { state: 'pending' }>, input: StartEpicInput): EpicStartSnapshot {
    const epicId = epicLink.epicId;
    const existing = this.readStartSnapshot(epicId);
    if (existing) {
      if (existing.change.id !== change.id || existing.commandId !== input.commandId) {
        throw new AggregateConflictError(
          'epic.provenance_conflict',
          `Epic ${epicId} already has a start snapshot for a different Change or command.`,
          { epicId, expectedChangeId: change.id, actualChangeId: existing.change.id, expectedCommandId: input.commandId, actualCommandId: existing.commandId },
          [{ kind: 'open-item', label: 'Open the conflicting Epic', command: 'epic.status' }],
        );
      }
      return existing;
    }

    const shape = this.changeStore.readShape(change.id) ?? undefined;
    const scopeAnalysis = change.latestScopeAnalysisId ? (this.changeStore.readAnalysis(change.id, change.latestScopeAnalysisId) ?? undefined) : undefined;
    const draft = {
      schemaVersion: 1 as const,
      commandId: input.commandId,
      epicId,
      change: {
        id: change.id,
        revision: epicLink.changeRevision,
        contentHash: epicLink.changeContentHash,
        title: change.title,
        type: change.type,
        requirement: change.requirement,
        externalRefs: change.externalRefs,
      },
      shape,
      scopeAnalysis,
      context: {
        baseRevisionId: epicLink.contextRevisionId,
        baseRootHash: epicLink.contextRootHash,
        entityObjectHashes: input.context.entityObjectHashes ?? {},
        contextSliceHash: input.context.contextSliceHash,
      },
      pipeline: { id: input.pipeline.id, runMode: input.pipeline.runMode, extraProjects: input.pipeline.extraProjects ?? [] },
      source: input.source,
      createdAt: this.clock(),
      createdBy: input.actor,
    };
    const startSnapshot = parseEpicStartSnapshot(draft);
    createJsonFileIfAbsent(this.startSnapshotFile(epicId), startSnapshot);
    return startSnapshot;
  }

  /** Steps 3 + 5 of the saga: idempotently ensure the Epic exists, then transition the Change's `epicLink` to `linked`. Never needs pipeline/source — `startSnapshot` is already final. */
  private linkEpic(
    change: ProjectChange,
    epicLink: Extract<ChangeEpicLink, { state: 'pending' }>,
    startSnapshot: EpicStartSnapshot,
    actor: ActorRef,
    epicProfile?: EpicProfile,
  ): StartEpicOutput {
    const epicId = epicLink.epicId;
    const { epic } = this.epics.start({
      id: epicId,
      title: change.title,
      description: change.requirement.desiredOutcome,
      type: mapChangeTypeToEpicType(change.type),
      profile: epicProfile,
    });

    const startSnapshotHash = computeEpicStartSnapshotHash(startSnapshot);
    const now = this.clock();
    const linked = this.changeStore.update(change.id, { expectedRevision: change.revision, expectedContentHash: change.contentHash }, (current) => {
      const nextEpicLink: ChangeEpicLink = {
        state: 'linked',
        commandId: epicLink.commandId,
        epicId,
        changeRevision: epicLink.changeRevision,
        changeContentHash: epicLink.changeContentHash,
        changeSnapshotHash: startSnapshotHash,
        contextRevisionId: epicLink.contextRevisionId,
        contextRootHash: epicLink.contextRootHash,
        linkedAt: now,
      };
      const { contentHash: _ignored, ...rest } = current;
      const next: ProjectChangeDraft = { ...rest, epicLink: nextEpicLink, updatedAt: now, revision: current.revision + 1 };
      return { ...next, contentHash: computeChangeContentHash(next) };
    });
    this.recordEvent(change.id, {
      commandId: epicLink.commandId,
      type: 'change.epic.start.linked',
      actor,
      beforeHash: change.contentHash,
      afterHash: linked.contentHash,
      evidence: { epicId },
    });

    return { change: linked, epic, startSnapshot, alreadyLinked: false, readModel: buildProjectChangeReadModel({ change: linked, epicStatus: epic.status }) };
  }

  private recordEvent(id: ChangeId, params: { commandId: string; type: string; actor: ActorRef; beforeHash?: string; afterHash?: string; evidence?: Record<string, unknown> }): void {
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
    this.changeStore.appendEvent(id, event);
  }
}

function pendingRecoveryConflict(changeId: ChangeId, epicLink: Extract<ChangeEpicLink, { state: 'pending' }>): AggregateConflictError {
  return new AggregateConflictError(
    'epic.pending_recovery',
    `Change ${changeId} has a pending Start Epic saga (commandId ${epicLink.commandId}) from a different command; resume or roll it back before starting a new one.`,
    { changeId, pendingCommandId: epicLink.commandId, pendingEpicId: epicLink.epicId },
    [
      { kind: 'resume', label: 'Resume the pending Start Epic', command: 'change.epic.pending.resume' },
      { kind: 'rollback', label: 'Roll back the pending Start Epic', command: 'change.epic.pending.rollback', requiresReason: true },
    ],
  );
}
