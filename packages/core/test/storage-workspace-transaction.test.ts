import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { readJsonFile } from '../src/storage/atomicJson';
import { AggregateConflictError, mutateAggregateFile, type AggregateAccessor } from '../src/storage/WorkspaceTransaction';

interface Counter {
  revision: number;
  contentHash: string;
  value: number;
}

const counterAccessor: AggregateAccessor<Counter> = {
  parse: (raw) => raw as Counter,
  getRevision: (c) => c.revision,
  getContentHash: (c) => c.contentHash,
};

function hashOf(value: number, revision: number): string {
  return `hash-${value}-${revision}`;
}

const roots: string[] = [];
function newFile(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-workspace-txn-'));
  roots.push(root);
  return path.join(root, 'aggregate.json');
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('mutateAggregateFile — create', () => {
  it('creates the file when absent', () => {
    const file = newFile();
    const { next } = mutateAggregateFile(file, counterAccessor, 'create', () => ({ revision: 0, contentHash: hashOf(0, 0), value: 0 }), {
      errorDomain: 'counter',
      displayId: 'Counter test',
    });
    expect(next).toEqual({ revision: 0, contentHash: hashOf(0, 0), value: 0 });
    expect(readJsonFile(file)).toEqual(next);
  });

  it('throws counter.duplicate when the file already exists', () => {
    const file = newFile();
    mutateAggregateFile(file, counterAccessor, 'create', () => ({ revision: 0, contentHash: hashOf(0, 0), value: 0 }), {
      errorDomain: 'counter',
      displayId: 'Counter test',
    });
    expect(() =>
      mutateAggregateFile(file, counterAccessor, 'create', () => ({ revision: 0, contentHash: hashOf(0, 0), value: 0 }), {
        errorDomain: 'counter',
        displayId: 'Counter test',
      }),
    ).toThrow(AggregateConflictError);
    try {
      mutateAggregateFile(file, counterAccessor, 'create', () => ({ revision: 0, contentHash: hashOf(0, 0), value: 0 }), {
        errorDomain: 'counter',
        displayId: 'Counter test',
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateConflictError);
      expect((error as AggregateConflictError).code).toBe('counter.duplicate');
    }
  });
});

describe('mutateAggregateFile — update', () => {
  function create(file: string): Counter {
    return mutateAggregateFile(file, counterAccessor, 'create', () => ({ revision: 0, contentHash: hashOf(0, 0), value: 0 }), {
      errorDomain: 'counter',
      displayId: 'Counter test',
    }).next;
  }

  it('throws counter.not_found when updating a missing aggregate', () => {
    const file = newFile();
    try {
      mutateAggregateFile(file, counterAccessor, { expectedRevision: 0, expectedContentHash: hashOf(0, 0) }, () => ({ revision: 1, contentHash: hashOf(1, 1), value: 1 }), {
        errorDomain: 'counter',
        displayId: 'Counter test',
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateConflictError);
      expect((error as AggregateConflictError).code).toBe('counter.not_found');
    }
  });

  it('succeeds when the guard matches the current revision/contentHash exactly', () => {
    const file = newFile();
    const current = create(file);
    const { next } = mutateAggregateFile(
      file,
      counterAccessor,
      { expectedRevision: current.revision, expectedContentHash: current.contentHash },
      (prev) => ({ revision: prev!.revision + 1, contentHash: hashOf(prev!.value + 1, prev!.revision + 1), value: prev!.value + 1 }),
      { errorDomain: 'counter', displayId: 'Counter test' },
    );
    expect(next).toEqual({ revision: 1, contentHash: hashOf(1, 1), value: 1 });
    expect(readJsonFile(file)).toEqual(next);
  });

  it('two updates from the same starting revision: exactly one succeeds, the other gets a typed conflict with expected/actual metadata', () => {
    const file = newFile();
    const current = create(file);
    const guard = { expectedRevision: current.revision, expectedContentHash: current.contentHash };
    const bump = (prev: Counter | null) => ({ revision: prev!.revision + 1, contentHash: hashOf(prev!.value + 1, prev!.revision + 1), value: prev!.value + 1 });

    const first = mutateAggregateFile(file, counterAccessor, guard, bump, { errorDomain: 'counter', displayId: 'Counter test' });
    expect(first.next.revision).toBe(1);

    // second caller still holds the *original* (now-stale) guard.
    try {
      mutateAggregateFile(file, counterAccessor, guard, bump, { errorDomain: 'counter', displayId: 'Counter test' });
      expect.unreachable('expected a revision conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateConflictError);
      const conflict = error as AggregateConflictError;
      expect(conflict.code).toBe('counter.revision_conflict');
      expect(conflict.metadata).toEqual({
        expectedRevision: 0,
        expectedContentHash: hashOf(0, 0),
        actualRevision: 1,
        actualContentHash: hashOf(1, 1),
      });
      expect(conflict.recoveryActions.map((a) => a.kind)).toEqual(['reload', 'rebase']);
    }

    // Exactly one mutation is durable — the file reflects only the first writer's result.
    expect(readJsonFile(file)).toEqual({ revision: 1, contentHash: hashOf(1, 1), value: 1 });
  });

  it('re-validates the next value through accessor.parse before writing (a caller cannot persist a value its own contract rejects)', () => {
    const file = newFile();
    const current = create(file);
    const strictAccessor: AggregateAccessor<Counter> = {
      parse: (raw) => {
        const value = raw as Counter;
        if (value.value < 0) throw new Error('value must be non-negative');
        return value;
      },
      getRevision: (c) => c.revision,
      getContentHash: (c) => c.contentHash,
    };
    expect(() =>
      mutateAggregateFile(
        file,
        strictAccessor,
        { expectedRevision: current.revision, expectedContentHash: current.contentHash },
        () => ({ revision: 1, contentHash: hashOf(-1, 1), value: -1 }),
        { errorDomain: 'counter', displayId: 'Counter test' },
      ),
    ).toThrow(/non-negative/);
    // Rejected before ever touching disk.
    expect(readJsonFile(file)).toEqual(current);
  });
});
