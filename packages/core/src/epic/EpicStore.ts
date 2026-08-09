/**
 * Durable filesystem store for the unified Epic model.
 *
 * New state deliberately lives under `.aidlc/epics` and `.aidlc/runs`; it
 * neither reads nor mutates the legacy `docs/epics`, `.aidlc/deliveries`, or
 * flat `.aidlc/runs/*.json` layouts. Migration is explicitly owned by W2B.
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  EPIC_STATUSES,
  parseEpicEvent,
  parseEpic,
  parseEpicRun,
  parseRunEvent,
  toEpicId,
  toRunId,
  type Epic,
  type EpicEvent,
  type EpicId,
  type EpicRun,
  type RunEvent,
  type RunId,
} from '../contracts';
import { redactSecrets } from '../release/ReleaseVerification';

const AIDLC_DIR = '.aidlc';
const EPICS_DIR = 'epics';
const RUNS_DIR = 'runs';
const STATE_FILE = 'state.json';
const EVENTS_FILE = 'events.ndjson';
const TEMP_SUFFIX = '.tmp';

/** Thrown when durable state exists but cannot be safely read. */
export class EpicStorageError extends Error {
  constructor(message: string, public readonly file: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EpicStorageError';
  }
}

export class EpicStoreRevisionConflictError extends Error {
  constructor(readonly epicId: EpicId, readonly expectedRevision: number | null, readonly actualRevision: number | null) {
    super(`Epic ${epicId} revision changed while writing (expected ${expectedRevision ?? 'missing'}, actual ${actualRevision ?? 'missing'}).`);
    this.name = 'EpicStoreRevisionConflictError';
  }
}

export class EpicRunRevisionConflictError extends Error {
  constructor(readonly runId: RunId, readonly expectedRevision: number | null, readonly actualRevision: number | null) {
    super(`Run ${runId} revision changed while writing (expected ${expectedRevision ?? 'missing'}, actual ${actualRevision ?? 'missing'}).`);
    this.name = 'EpicRunRevisionConflictError';
  }
}

export class RunEventConflictError extends Error {
  constructor(readonly runId: RunId, message: string) {
    super(message);
    this.name = 'RunEventConflictError';
  }
}

/**
 * Write a complete file through a sibling temporary file and atomic rename.
 *
 * A process crash can leave `<file>.tmp`. `recoverAtomicWrite` promotes that
 * file only when the canonical target is absent, so a completed canonical
 * write always wins over a stale temporary file.
 */
export function writeFileAtomic(file: string, content: string): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const temp = `${file}${TEMP_SUFFIX}`;
  let fd: number | undefined;
  try {
    fd = fs.openSync(temp, 'w');
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  fs.renameSync(temp, file);
}

/** Recover a completed temporary write left by a crash before `rename`. */
export function recoverAtomicWrite(file: string): void {
  const temp = `${file}${TEMP_SUFFIX}`;
  if (!fs.existsSync(temp)) return;
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.renameSync(temp, file);
    return;
  }
  // A canonical file means the previous write finished; the temp is stale.
  fs.unlinkSync(temp);
}

function readJson(file: string): unknown | null {
  recoverAtomicWrite(file);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new EpicStorageError(`Unable to parse durable state at ${file}`, file, { cause: error });
  }
}

function writeJson(file: string, value: unknown): void {
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Filesystem layout and read/write operations for W1A. */
export class EpicStore {
  constructor(readonly workspaceRoot: string) {}

  epicsDir(): string {
    return path.join(this.workspaceRoot, AIDLC_DIR, EPICS_DIR);
  }

  runsDir(): string {
    return path.join(this.workspaceRoot, AIDLC_DIR, RUNS_DIR);
  }

  epicDir(id: EpicId | string): string {
    return path.join(this.epicsDir(), toEpicId(String(id)));
  }

  epicStateFile(id: EpicId | string): string {
    return path.join(this.epicDir(id), STATE_FILE);
  }

  epicEventsFile(id: EpicId | string): string {
    return path.join(this.epicDir(id), EVENTS_FILE);
  }

  runDir(id: RunId | string): string {
    return path.join(this.runsDir(), toRunId(String(id)));
  }

  runStateFile(id: RunId | string): string {
    return path.join(this.runDir(id), STATE_FILE);
  }

  runEventsFile(id: RunId | string): string {
    return path.join(this.runDir(id), EVENTS_FILE);
  }

  loadEpic(id: EpicId | string): Epic | null {
    const raw = readJson(this.epicStateFile(id));
    if (raw === null) return null;
    return this.recoverProjection(parseEpic(raw));
  }

  saveEpic(epic: Epic, expectedRevision?: number | null): void {
    const validated = parseEpic(epic);
    if (expectedRevision === undefined) {
      writeJson(this.epicStateFile(validated.id), validated);
      return;
    }
    const stateFile = this.epicStateFile(validated.id);
    const lockFile = `${stateFile}.lock`;
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    let lock: number;
    try {
      lock = fs.openSync(lockFile, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new EpicStoreRevisionConflictError(validated.id, expectedRevision, null);
      throw error;
    }
    try {
      const raw = readJson(stateFile);
      const currentRevision = raw === null ? null : parseEpic(raw).revision;
      if (currentRevision !== expectedRevision) throw new EpicStoreRevisionConflictError(validated.id, expectedRevision, currentRevision);
      writeJson(stateFile, validated);
    } finally {
      fs.closeSync(lock);
      if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    }
  }

  listEpics(): Epic[] {
    const dir = this.epicsDir();
    if (!fs.existsSync(dir)) return [];
    const epics: Epic[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const epic = this.loadEpic(entry.name);
        if (epic) epics.push(epic);
      } catch {
        // Listing should remain useful if a single old/corrupt directory is
        // present. Loading that id directly still returns the diagnostic.
      }
    }
    return epics.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  loadRun(id: RunId | string): EpicRun | null {
    const raw = readJson(this.runStateFile(id));
    return raw === null ? null : parseEpicRun(raw);
  }

  saveRun(run: EpicRun, expectedRevision?: number | null): void {
    const validated = parseEpicRun(run);
    if (expectedRevision === undefined) {
      writeJson(this.runStateFile(validated.id), validated);
      return;
    }
    const stateFile = this.runStateFile(validated.id);
    const lockFile = `${stateFile}.lock`;
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    let lock: number;
    try { lock = fs.openSync(lockFile, 'wx'); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new EpicRunRevisionConflictError(validated.id, expectedRevision, null);
      throw error;
    }
    try {
      const raw = readJson(stateFile);
      const currentRevision = raw === null ? null : parseEpicRun(raw).revision;
      if (currentRevision !== expectedRevision) throw new EpicRunRevisionConflictError(validated.id, expectedRevision, currentRevision);
      writeJson(stateFile, validated);
    } finally {
      fs.closeSync(lock);
      if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    }
  }

  listRunsForEpic(epicId: EpicId): EpicRun[] {
    const dir = this.runsDir();
    if (!fs.existsSync(dir)) return [];
    const runs: EpicRun[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const run = this.loadRun(entry.name);
        if (run?.epicId === epicId) runs.push(run);
      } catch {
        // See listEpics: retain valid sibling state rather than failing the
        // entire status view because one record needs repair.
      }
    }
    return runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  appendEvent(runId: RunId, event: RunEvent): void {
    const file = this.runEventsFile(runId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const lockFile = `${file}.lock`;
    let lock: number;
    try {
      lock = fs.openSync(lockFile, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new RunEventConflictError(runId, `Run ${runId} event log is being written concurrently.`);
      throw error;
    }
    try {
      const validated = parseRunEvent(redactSecrets(event));
      if (this.readEvents(runId).some((existing) => existing.id === validated.id)) {
        throw new RunEventConflictError(runId, `Run event ${validated.id} already exists.`);
      }
      const fd = fs.openSync(file, 'a');
      try {
        fs.writeFileSync(fd, `${JSON.stringify(validated)}\n`, 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    } finally {
      fs.closeSync(lock);
      if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    }
  }

  appendEpicEvent(epicId: EpicId, event: EpicEvent): void {
    const file = this.epicEventsFile(epicId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const lockFile = `${file}.lock`;
    let lock: number;
    try { lock = fs.openSync(lockFile, 'wx'); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Epic ${epicId} event log is being written concurrently.`);
      throw error;
    }
    try {
      const validated = parseEpicEvent(redactSecrets(event));
      if (this.readEpicEvents(epicId).some((existing) => existing.id === validated.id)) throw new Error(`Epic event ${validated.id} already exists.`);
      const fd = fs.openSync(file, 'a');
      try { fs.writeFileSync(fd, `${JSON.stringify(validated)}\n`, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    } finally {
      fs.closeSync(lock);
      if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    }
  }

  readEpicEvents(epicId: EpicId): EpicEvent[] {
    const file = this.epicEventsFile(epicId);
    if (!fs.existsSync(file)) return [];
    try {
      return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => parseEpicEvent(JSON.parse(line)));
    } catch (error) {
      throw new EpicStorageError(`Unable to parse append-only Epic event log at ${file}`, file, { cause: error });
    }
  }

  readEvents(runId: RunId): RunEvent[] {
    const file = this.runEventsFile(runId);
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    try {
      return lines.map((line) => parseRunEvent(JSON.parse(line)));
    } catch (error) {
      throw new EpicStorageError(`Unable to parse append-only event log at ${file}`, file, { cause: error });
    }
  }

  /**
   * Event records are written before their two read projections. If a process
   * dies between those writes, promote the append-only event's final durable
   * status back into `Epic`/`EpicRun` on the next load. This is intentionally
   * small recovery logic, not legacy migration or workflow interpretation.
   */
  private recoverProjection(epic: Epic): Epic {
    const epicEvents = this.readEpicEvents(epic.id);
    const lastEpicEvent = epicEvents.at(-1);
    if (!epic.activeRunId && lastEpicEvent?.to && epic.status !== lastEpicEvent.to) {
      const repaired = { ...epic, status: lastEpicEvent.to, updatedAt: lastEpicEvent.at, revision: epic.revision + 1 };
      this.saveEpic(repaired);
      epic = repaired;
    }
    let run: EpicRun | null = epic.activeRunId ? this.loadRun(epic.activeRunId) : null;

    // `startRun` writes the run before it writes the Epic. A crash in that
    // narrow window leaves a ready Epic plus exactly one unlinked running
    // run; safely reattach it rather than creating a duplicate run.
    if (!run && epic.status === 'ready') {
      const candidates = this.listRunsForEpic(epic.id).filter((candidate) => candidate.status === 'running');
      if (candidates.length === 1) {
        run = candidates[0];
        const repaired: Epic = {
          ...epic,
          status: 'running',
          activeRunId: run.id,
          stages: run.stages,
          updatedAt: run.updatedAt,
          revision: epic.revision + 1,
        };
        this.saveEpic(repaired);
        return repaired;
      }
    }
    if (!run) return epic;

    const events = this.readEvents(run.id);
    const last = events.at(-1);
    if (!last || !(EPIC_STATUSES as readonly string[]).includes(last.to ?? '')) return epic;
    const status = last.to as Epic['status'];
    const eventStages = last.stages ?? run.stages;
    const projectionCurrent = last.currentStageId ?? epic.currentStageId;
    if (epic.status === status && run.status === status
      && JSON.stringify(epic.stages) === JSON.stringify(eventStages)
      && epic.currentStageId === projectionCurrent) return epic;

    const repairedRun: EpicRun = {
      ...run,
      status,
      stages: eventStages,
      updatedAt: last.at,
      completedAt: status === 'completed' ? last.at : run.completedAt,
      revision: run.revision + 1,
    };
    const repairedEpic: Epic = {
      ...epic,
      status,
      stages: repairedRun.stages,
      currentStageId: projectionCurrent,
      blockedReason: status === 'blocked' ? last.detail ?? epic.blockedReason : undefined,
      updatedAt: last.at,
      revision: epic.revision + 1,
    };
    this.saveRun(repairedRun);
    this.saveEpic(repairedEpic);
    return repairedEpic;
  }
}
