/**
 * Filesystem repository for the Change aggregate family — `change.json`,
 * the optional `shape.json`, immutable `analyses/ANL-*.json`, and immutable
 * `events/EVT-*.json` (plan §D1, §D13, §12.1 layout).
 *
 * This is the low-level repository: CAS writes and file layout only. The
 * command-level business rules (actor checks, idempotent replay, which
 * fields a given command may touch) live in `ChangeService.ts`, one layer
 * up — mirroring the split already established by
 * `storage/WorkspaceTransaction.ts` (generic CAS primitive) vs. this file
 * (Change-shaped repository built on it).
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  isChangeId,
  parseChangeShape,
  parseDomainEvent,
  parseProjectChange,
  parseScopeAnalysis,
  toChangeId,
  type ChangeId,
  type ChangeShape,
  type DomainEvent,
  type ProjectChange,
  type ScopeAnalysis,
  type ScopeAnalysisId,
} from '../contracts';
import { createJsonFileIfAbsent, listJsonFileNames, readJsonFile } from '../storage/atomicJson';
import { AggregateConflictError, StorageRecoveryRequiredError, mutateAggregateFile, type VersionGuard } from '../storage/WorkspaceTransaction';

const AIDLC_DIR = '.aidlc';
const CHANGES_DIR = 'changes';
const CHANGE_FILE = 'change.json';
const SHAPE_FILE = 'shape.json';
const ANALYSES_DIR = 'analyses';
const EVENTS_DIR = 'events';

export class ChangeStore {
  constructor(readonly workspaceRoot: string) {}

  changesRoot(): string {
    return path.join(this.workspaceRoot, AIDLC_DIR, CHANGES_DIR);
  }
  changeDir(id: ChangeId): string {
    return path.join(this.changesRoot(), id);
  }
  changeFile(id: ChangeId): string {
    return path.join(this.changeDir(id), CHANGE_FILE);
  }
  shapeFile(id: ChangeId): string {
    return path.join(this.changeDir(id), SHAPE_FILE);
  }
  analysesDir(id: ChangeId): string {
    return path.join(this.changeDir(id), ANALYSES_DIR);
  }
  analysisFile(id: ChangeId, analysisId: ScopeAnalysisId): string {
    return path.join(this.analysesDir(id), `${analysisId}.json`);
  }
  eventsDir(id: ChangeId): string {
    return path.join(this.changeDir(id), EVENTS_DIR);
  }
  eventFile(id: ChangeId, eventId: string): string {
    return path.join(this.eventsDir(id), `${eventId}.json`);
  }

  // ── Change ─────────────────────────────────────────────────────

  list(): ProjectChange[] {
    if (!fs.existsSync(this.changesRoot())) return [];
    return fs
      .readdirSync(this.changesRoot())
      .filter((name) => isChangeId(name))
      .map((name) => this.read(toChangeId(name)))
      .filter((change): change is ProjectChange => change !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  read(id: ChangeId): ProjectChange | null {
    const raw = readJsonFile<unknown>(this.changeFile(id));
    return raw === undefined ? null : parseProjectChange(raw);
  }

  require(id: ChangeId): ProjectChange {
    const change = this.read(id);
    if (!change) throw new AggregateConflictError('change.not_found', `Change ${id} was not found.`);
    return change;
  }

  /** Create-only CAS write for a brand-new Change. */
  create(id: ChangeId, build: () => ProjectChange): ProjectChange {
    return mutateAggregateFile(
      this.changeFile(id),
      changeAccessor,
      'create',
      build,
      { errorDomain: 'change', displayId: `Change ${id}` },
    ).next;
  }

  /** CAS update of an existing Change. */
  update(id: ChangeId, guard: VersionGuard, mutate: (current: ProjectChange) => ProjectChange): ProjectChange {
    return mutateAggregateFile(
      this.changeFile(id),
      changeAccessor,
      guard,
      (current) => mutate(current as ProjectChange),
      { errorDomain: 'change', displayId: `Change ${id}` },
    ).next;
  }

  // ── Shape ──────────────────────────────────────────────────────

  readShape(id: ChangeId): ChangeShape | null {
    const raw = readJsonFile<unknown>(this.shapeFile(id));
    return raw === undefined ? null : parseChangeShape(raw);
  }

  requireShape(id: ChangeId): ChangeShape {
    const shape = this.readShape(id);
    if (!shape) throw new AggregateConflictError('shape.not_found', `Shape for Change ${id} was not found.`);
    return shape;
  }

  createShape(id: ChangeId, build: () => ChangeShape): ChangeShape {
    return mutateAggregateFile(
      this.shapeFile(id),
      shapeAccessor,
      'create',
      build,
      { errorDomain: 'shape', displayId: `Shape for Change ${id}` },
    ).next;
  }

  updateShape(id: ChangeId, guard: VersionGuard, mutate: (current: ChangeShape) => ChangeShape): ChangeShape {
    return mutateAggregateFile(
      this.shapeFile(id),
      shapeAccessor,
      guard,
      (current) => mutate(current as ChangeShape),
      { errorDomain: 'shape', displayId: `Shape for Change ${id}` },
    ).next;
  }

  // ── ScopeAnalysis (immutable) ──────────────────────────────────

  readAnalysis(id: ChangeId, analysisId: ScopeAnalysisId): ScopeAnalysis | null {
    const raw = readJsonFile<unknown>(this.analysisFile(id, analysisId));
    return raw === undefined ? null : parseScopeAnalysis(raw);
  }

  listAnalyses(id: ChangeId): ScopeAnalysis[] {
    return listJsonFileNames(this.analysesDir(id)).map((name) => parseScopeAnalysis(readJsonFile(path.join(this.analysesDir(id), name))));
  }

  /** Immutable create — a retry with the same analysis id is a no-op, never a second write. */
  writeAnalysis(id: ChangeId, analysis: ScopeAnalysis): void {
    createJsonFileIfAbsent(this.analysisFile(id, analysis.id), analysis);
  }

  // ── Events (immutable, one file each) ─────────────────────────

  listEvents(id: ChangeId): DomainEvent[] {
    return listJsonFileNames(this.eventsDir(id))
      .map((name) => parseDomainEvent(readJsonFile(path.join(this.eventsDir(id), name))))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Linear scan of this Change's own event log — the idempotency check for a retried command (plan §9.1 step 3, §D16). */
  findEventByCommandId(id: ChangeId, commandId: string): DomainEvent | null {
    for (const name of listJsonFileNames(this.eventsDir(id))) {
      const raw = readJsonFile<unknown>(path.join(this.eventsDir(id), name));
      if (raw === undefined) continue;
      const event = parseDomainEvent(raw);
      if (event.commandId === commandId) return event;
    }
    return null;
  }

  /**
   * Append one immutable event. If the aggregate write already succeeded
   * but this fails (or a same-id event with *different* content is somehow
   * already on disk — a ULID collision, astronomically unlikely), the
   * caller must not pretend the audit trail is complete (plan §9.1 step 6).
   */
  appendEvent(id: ChangeId, event: DomainEvent): void {
    const { created } = createJsonFileIfAbsent(this.eventFile(id, event.id), event);
    if (created) return;
    const existingRaw = readJsonFile<unknown>(this.eventFile(id, event.id));
    const existing = existingRaw === undefined ? undefined : parseDomainEvent(existingRaw);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(event)) {
      throw new StorageRecoveryRequiredError(`Event ${event.id} could not be durably recorded for Change ${id}.`, {
        changeId: id,
        eventId: event.id,
      });
    }
  }
}

const changeAccessor = {
  parse: parseProjectChange,
  getRevision: (change: ProjectChange) => change.revision,
  getContentHash: (change: ProjectChange) => change.contentHash,
};

const shapeAccessor = {
  parse: parseChangeShape,
  getRevision: (shape: ChangeShape) => shape.revision,
  getContentHash: (shape: ChangeShape) => shape.contentHash,
};
