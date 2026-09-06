/**
 * Canonical atomic single-file JSON read/write for the redesigned
 * lifecycle stores (implementation plan §9.1 step 5: "Ghi temp file cung
 * directory, fsync khi platform ho tro, atomic rename").
 *
 * `epic/EpicStore.ts` already has an equivalent `writeFileAtomic` — this is
 * a fresh, domain-agnostic home for the same discipline rather than a
 * migration of that one (plan §D19: new writes use the new model; existing
 * domains are not forced to re-point at it just for this redesign). Change/
 * Context Proposal storage (M2+) is the first consumer.
 */

import * as fs from 'fs';
import * as path from 'path';

const TEMP_SUFFIX = '.tmp';

/** Thrown when a durable JSON file exists but cannot be parsed. */
export class JsonStorageError extends Error {
  constructor(message: string, readonly file: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'JsonStorageError';
  }
}

/**
 * Promote a crash-orphaned temp file if the canonical file is still
 * missing (the write reached disk but not the rename); discard the temp
 * file as stale if the canonical file already exists (a completed write
 * always wins over a stale temp file, so this is never destructive of a
 * successful write).
 */
export function recoverAtomicJsonWrite(file: string): void {
  const temp = `${file}${TEMP_SUFFIX}`;
  if (!fs.existsSync(temp)) return;
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.renameSync(temp, file);
    return;
  }
  fs.unlinkSync(temp);
}

/** Write raw text to `file` through a sibling temp file, fsync, then atomic rename. Creates the parent directory if missing. */
export function writeTextFileAtomic(file: string, content: string): void {
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

/** Write `value` to `file` through a sibling temp file, fsync, then atomic rename. Creates the parent directory if missing. */
export function writeJsonFileAtomic(file: string, value: unknown): void {
  writeTextFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Read+parse one JSON file, or `undefined` if it does not exist. Runs crash recovery first. */
export function readJsonFile<T = unknown>(file: string): T | undefined {
  recoverAtomicJsonWrite(file);
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (error) {
    throw new JsonStorageError(`Unable to parse durable state at ${file}`, file, { cause: error });
  }
}

/**
 * Create a file only if it does not already exist — the write primitive
 * for immutable, append-only records (events, analyses, approvals): a
 * retry with the same target path is a no-op rather than a second write.
 */
export function createJsonFileIfAbsent(file: string, value: unknown): { created: boolean } {
  recoverAtomicJsonWrite(file);
  if (fs.existsSync(file)) return { created: false };
  writeJsonFileAtomic(file, value);
  return { created: true };
}

/** Sorted `.json` file names (not full paths) directly inside `dir`, or `[]` if `dir` does not exist. */
export function listJsonFileNames(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();
}
