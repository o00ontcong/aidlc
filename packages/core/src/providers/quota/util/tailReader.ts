/**
 * Incremental line reader for append-only log files. Provider log files
 * (Codex rollout logs, Claude transcripts) can grow to hundreds of MB over a
 * long session — re-reading the whole file on every poll would make the
 * sidebar refresh slower over time. `readNewLines` remembers how far it read
 * last time (in-memory, per process) and only reads the bytes appended since.
 *
 * On the very first read of a file, it seeds from the tail (last
 * `maxInitialBytes`) rather than the start, since adapters only need the most
 * recent state (e.g. the latest rate-limit snapshot), not full history.
 */

import * as fs from 'fs';

interface TailState {
  offset: number;
}

const tailStates = new Map<string, TailState>();

export function readNewLines(filePath: string, maxInitialBytes = 256 * 1024): string[] {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return [];
  }

  const prior = tailStates.get(filePath);
  const fileWasTruncated = !!prior && stat.size < prior.offset;
  const isFirstRead = !prior || fileWasTruncated;
  const start = isFirstRead ? Math.max(0, stat.size - maxInitialBytes) : prior!.offset;
  const length = stat.size - start;

  if (length <= 0) {
    tailStates.set(filePath, { offset: stat.size });
    return [];
  }

  const buf = Buffer.alloc(length);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, length, start);
  } finally {
    fs.closeSync(fd);
  }
  tailStates.set(filePath, { offset: stat.size });

  const lines = buf.toString('utf8').split('\n').filter((l) => l.length > 0);
  // A tail-seeded (or mid-file) read likely starts mid-line; drop the partial
  // first fragment. A read that started at byte 0 keeps every line.
  return start > 0 ? lines.slice(1) : lines;
}

/** Test/tooling helper: forget cached offsets so a fixture file can be re-read from scratch. */
export function resetTailState(filePath?: string): void {
  if (filePath) tailStates.delete(filePath);
  else tailStates.clear();
}
