import * as fs from 'fs';
import * as path from 'path';

import { parseShape, parseShapeEvent, type Shape, type ShapeEvent } from '../contracts/shape';
import { writeFileAtomic } from '../epic/EpicStore';

const SHAPES_DIR = '.aidlc/shapes';
const STATE_FILE = 'state.json';
const EVENTS_FILE = 'events.ndjson';

export class ShapeNotFoundError extends Error {
  constructor(readonly shapeId: string) {
    super(`Shape ${shapeId} does not exist.`);
    this.name = 'ShapeNotFoundError';
  }
}

export class ShapeRevisionConflictError extends Error {
  constructor(readonly shapeId: string, readonly expectedRevision: number | null, readonly actualRevision: number | null) {
    super(`Shape ${shapeId} revision changed while writing (expected ${expectedRevision ?? 'missing'}, actual ${actualRevision ?? 'missing'}).`);
    this.name = 'ShapeRevisionConflictError';
  }
}

function withExclusiveLock<T>(lockFile: string, onLocked: () => T): T {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  let fd: number;
  try {
    fd = fs.openSync(lockFile, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new ShapeRevisionConflictError(path.basename(path.dirname(lockFile)), null, null);
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

/** Durable state and append-only audit log for pre-Epic Shapes. */
export class ShapeStore {
  constructor(readonly workspaceRoot: string) {}

  shapesDir(): string { return path.join(this.workspaceRoot, SHAPES_DIR); }
  shapeDir(shapeId: string): string { return path.join(this.shapesDir(), shapeId); }
  stateFile(shapeId: string): string { return path.join(this.shapeDir(shapeId), STATE_FILE); }
  eventsFile(shapeId: string): string { return path.join(this.shapeDir(shapeId), EVENTS_FILE); }

  load(shapeId: string): Shape | null {
    const file = this.stateFile(shapeId);
    if (!fs.existsSync(file)) return null;
    try {
      return parseShape(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (error) {
      throw new Error(`Invalid Shape state at ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  require(shapeId: string): Shape {
    const shape = this.load(shapeId);
    if (!shape) throw new ShapeNotFoundError(shapeId);
    return shape;
  }

  list(): Shape[] {
    const root = this.shapesDir();
    if (!fs.existsSync(root)) return [];
    const shapes: Shape[] = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const shape = this.load(entry.name);
        if (shape) shapes.push(shape);
      } catch {
        // Keep Discovery usable when an old/corrupt sibling needs repair.
      }
    }
    return shapes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  save(shape: Shape, expectedRevision: number | null): void {
    const validated = parseShape(shape);
    const file = this.stateFile(validated.id);
    withExclusiveLock(`${file}.lock`, () => {
      const current = this.load(validated.id);
      const actual = current?.revision ?? null;
      if (actual !== expectedRevision) {
        throw new ShapeRevisionConflictError(validated.id, expectedRevision, actual);
      }
      writeFileAtomic(file, `${JSON.stringify(validated, null, 2)}\n`);
    });
  }

  appendEvent(shapeId: string, event: ShapeEvent): void {
    const validated = parseShapeEvent(event);
    const file = this.eventsFile(shapeId);
    withExclusiveLock(`${file}.lock`, () => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      const lines = current.split(/\r?\n/).filter(Boolean);
      if (lines.some((line) => {
        try { return parseShapeEvent(JSON.parse(line)).id === validated.id; } catch { return false; }
      })) return;
      writeFileAtomic(file, `${current}${JSON.stringify(validated)}\n`);
    });
  }

  readEvents(shapeId: string): ShapeEvent[] {
    const file = this.eventsFile(shapeId);
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => parseShapeEvent(JSON.parse(line)));
  }
}
