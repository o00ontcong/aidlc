import * as fs from 'fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  JsonStorageError,
  createJsonFileIfAbsent,
  listJsonFileNames,
  readJsonFile,
  recoverAtomicJsonWrite,
  writeJsonFileAtomic,
} from '../src/storage/atomicJson';

const roots: string[] = [];
function newRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-atomic-json-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('writeJsonFileAtomic / readJsonFile', () => {
  it('writes then reads back the same value, creating the parent directory', () => {
    const file = path.join(newRoot(), 'nested', 'dir', 'thing.json');
    writeJsonFileAtomic(file, { a: 1, b: 'two' });
    expect(readJsonFile(file)).toEqual({ a: 1, b: 'two' });
  });

  it('readJsonFile returns undefined for a missing file', () => {
    expect(readJsonFile(path.join(newRoot(), 'missing.json'))).toBeUndefined();
  });

  it('leaves no .tmp file behind after a successful write', () => {
    const file = path.join(newRoot(), 'thing.json');
    writeJsonFileAtomic(file, { ok: true });
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  it('throws JsonStorageError for a file that exists but is not valid JSON', () => {
    const root = newRoot();
    const file = path.join(root, 'corrupt.json');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(file, 'not json{{{');
    expect(() => readJsonFile(file)).toThrow(JsonStorageError);
  });
});

describe('recoverAtomicJsonWrite — crash recovery', () => {
  it('promotes an orphaned temp file when the canonical file is missing (write reached disk, rename did not)', () => {
    const root = newRoot();
    const file = path.join(root, 'thing.json');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({ recovered: true }));
    recoverAtomicJsonWrite(file);
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
    expect(readJsonFile(file)).toEqual({ recovered: true });
  });

  it('discards a stale temp file when the canonical file already exists (a finished write always wins)', () => {
    const root = newRoot();
    const file = path.join(root, 'thing.json');
    writeJsonFileAtomic(file, { current: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({ stale: true }));
    recoverAtomicJsonWrite(file);
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
    expect(readJsonFile(file)).toEqual({ current: true });
  });

  it('simulated crash mid-rewrite (temp written, rename never happened) leaves the previous canonical content untouched and recoverable', () => {
    const root = newRoot();
    const file = path.join(root, 'thing.json');
    writeJsonFileAtomic(file, { version: 1 });
    // A real crash between fsync and rename leaves exactly this residue on disk.
    fs.writeFileSync(`${file}.tmp`, `${JSON.stringify({ version: 2 })}\n`);

    // The canonical file is untouched — the crashed write never became visible.
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ version: 1 });
    // A later read recovers deterministically: canonical already exists, so the orphaned temp is discarded, not promoted.
    expect(readJsonFile(file)).toEqual({ version: 1 });
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });
});

describe('createJsonFileIfAbsent — immutable append-only records', () => {
  it('creates once; a retry is a no-op and does not overwrite', () => {
    const file = path.join(newRoot(), 'events', 'EVT-1.json');
    const first = createJsonFileIfAbsent(file, { id: 'EVT-1', at: 1 });
    expect(first).toEqual({ created: true });
    const second = createJsonFileIfAbsent(file, { id: 'EVT-1', at: 999 });
    expect(second).toEqual({ created: false });
    expect(readJsonFile(file)).toEqual({ id: 'EVT-1', at: 1 });
  });
});

describe('listJsonFileNames', () => {
  it('returns sorted .json names only, [] for a missing directory', () => {
    const root = newRoot();
    expect(listJsonFileNames(path.join(root, 'missing'))).toEqual([]);
    const dir = path.join(root, 'events');
    writeJsonFileAtomic(path.join(dir, 'EVT-2.json'), {});
    writeJsonFileAtomic(path.join(dir, 'EVT-1.json'), {});
    fs.writeFileSync(path.join(dir, 'not-json.txt'), 'ignore me');
    expect(listJsonFileNames(dir)).toEqual(['EVT-1.json', 'EVT-2.json']);
  });
});
