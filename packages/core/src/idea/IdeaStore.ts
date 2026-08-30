import * as fs from 'fs';
import * as path from 'path';

import { parseIdea, parseIdeaEvent, type Idea, type IdeaEvent } from '../contracts/idea';
import { writeFileAtomic } from '../epic/EpicStore';

const IDEAS_DIR = '.aidlc/ideas';
const STATE_FILE = 'state.json';
const EVENTS_FILE = 'events.ndjson';

export class IdeaNotFoundError extends Error {
  constructor(readonly ideaId: string) {
    super(`Idea ${ideaId} does not exist.`);
    this.name = 'IdeaNotFoundError';
  }
}

/** One sibling under `.aidlc/ideas/` whose `state.json` exists but fails schema validation. */
export interface IdeaLoadError {
  id: string;
  error: string;
}

export class IdeaRevisionConflictError extends Error {
  constructor(readonly ideaId: string, readonly expectedRevision: number | null, readonly actualRevision: number | null) {
    super(`Idea ${ideaId} revision changed while writing (expected ${expectedRevision ?? 'missing'}, actual ${actualRevision ?? 'missing'}).`);
    this.name = 'IdeaRevisionConflictError';
  }
}

function withExclusiveLock<T>(lockFile: string, onLocked: () => T): T {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  let fd: number;
  try {
    fd = fs.openSync(lockFile, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new IdeaRevisionConflictError(path.basename(path.dirname(lockFile)), null, null);
    }
    throw error;
  }
  try {
    return onLocked();
  } finally {
    fs.closeSync(fd);
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
  }
}

/**
 * Durable state and append-only audit log for pre-Epic Ideas. Mirrors
 * `ShapeStore` exactly (same lock-file exclusion, same append-with-dedupe
 * event log) — only the directory and contract differ.
 */
export class IdeaStore {
  constructor(readonly workspaceRoot: string) {}

  ideasDir(): string { return path.join(this.workspaceRoot, IDEAS_DIR); }
  ideaDir(ideaId: string): string { return path.join(this.ideasDir(), ideaId); }
  stateFile(ideaId: string): string { return path.join(this.ideaDir(ideaId), STATE_FILE); }
  eventsFile(ideaId: string): string { return path.join(this.ideaDir(ideaId), EVENTS_FILE); }

  load(ideaId: string): Idea | null {
    const file = this.stateFile(ideaId);
    if (!fs.existsSync(file)) return null;
    try {
      return parseIdea(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (error) {
      throw new Error(`Invalid Idea state at ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  require(ideaId: string): Idea {
    const idea = this.load(ideaId);
    if (!idea) throw new IdeaNotFoundError(ideaId);
    return idea;
  }

  /** Removes `.aidlc/ideas/<id>` outright — no validation, so it also works on a corrupted Idea `load()` can't parse. */
  delete(ideaId: string): void {
    fs.rmSync(this.ideaDir(ideaId), { recursive: true, force: true });
  }

  list(): Idea[] {
    const root = this.ideasDir();
    if (!fs.existsSync(root)) return [];
    const ideas: Idea[] = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const idea = this.load(entry.name);
        if (idea) ideas.push(idea);
      } catch (error) {
        // Keep the Ideas tab usable when an old/corrupt sibling needs
        // repair — but never *silently*: listLoadErrors() below surfaces
        // exactly this Idea to the UI instead of letting it vanish with no
        // trace, and this warning covers callers (e.g. nextId()) that only
        // ever call list().
        console.warn(`[IdeaStore] Idea ${entry.name} failed to load: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return ideas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * Ideas whose `state.json` exists on disk but fails `parseIdea` — e.g. a
   * provider-managed agent wrote a checkpoint that drifted from the schema.
   * `list()` drops these to keep the tab usable; this is how the UI still
   * tells the human something needs repair instead of the Idea just
   * disappearing despite its `docs/ideas/<id>/` output existing.
   */
  listLoadErrors(): IdeaLoadError[] {
    const root = this.ideasDir();
    if (!fs.existsSync(root)) return [];
    const errors: IdeaLoadError[] = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        this.load(entry.name);
      } catch (error) {
        errors.push({ id: entry.name, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return errors;
  }

  save(idea: Idea, expectedRevision: number | null): void {
    const validated = parseIdea(idea);
    const file = this.stateFile(validated.id);
    withExclusiveLock(`${file}.lock`, () => {
      const current = this.load(validated.id);
      const actual = current?.ideaRevision ?? null;
      if (actual !== expectedRevision) {
        throw new IdeaRevisionConflictError(validated.id, expectedRevision, actual);
      }
      writeFileAtomic(file, `${JSON.stringify(validated, null, 2)}\n`);
    });
  }

  appendEvent(ideaId: string, event: IdeaEvent): void {
    const validated = parseIdeaEvent(event);
    const file = this.eventsFile(ideaId);
    withExclusiveLock(`${file}.lock`, () => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      const lines = current.split(/\r?\n/).filter(Boolean);
      if (lines.some((line) => {
        try { return parseIdeaEvent(JSON.parse(line)).id === validated.id; } catch { return false; }
      })) return;
      writeFileAtomic(file, `${current}${JSON.stringify(validated)}\n`);
    });
  }

  readEvents(ideaId: string): IdeaEvent[] {
    const file = this.eventsFile(ideaId);
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => parseIdeaEvent(JSON.parse(line)));
  }
}
