/**
 * The generic single-aggregate CAS mutation primitive (implementation plan
 * §9.1): parse the current file, enforce the optimistic-concurrency guard
 * (or assert absence for a `create`), let the caller build the next value,
 * re-validate it, then write atomically. Idempotency (step 3: replay a
 * known `commandId`) and event-writing (step 6) are one layer up in
 * `change/ChangeStore.ts` — a single command can touch more than one
 * aggregate file (Change + Shape), so composing several
 * `mutateAggregateFile` calls plus one event write is the caller's job,
 * not this primitive's.
 *
 * Reused (not just Change-shaped): the same function will back
 * `ContextProposalStore` in M4 — hence living under `storage/`, not
 * `change/`, and taking a generic `AggregateAccessor<T>` rather than
 * anything ProjectChange-specific.
 */

import type { AidlcErrorMetadata, RecoveryAction } from '../contracts';
import { readJsonFile, writeJsonFileAtomic } from './atomicJson';

export interface VersionGuard {
  expectedRevision: number;
  expectedContentHash: string;
}

/**
 * The one error type a `mutateAggregateFile` failure throws. Shaped so
 * `CommandBus.dispatch`'s catch block (plan §18.6) already knows how to
 * surface `.code`/`.recoveryActions`/`.metadata` into a structured
 * `CommandResult.error` — no per-aggregate wrapper class is needed for
 * not-found/duplicate/revision-conflict.
 */
export class AggregateConflictError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly metadata?: AidlcErrorMetadata,
    readonly recoveryActions: RecoveryAction[] = [],
  ) {
    super(message);
    this.name = 'AggregateConflictError';
  }
}

/**
 * A mutation's aggregate write succeeded but its immutable audit event
 * could not be recorded (plan §9.1 step 6: "neu event write loi, mutation
 * tra recovery state va repair command, khong gia vo audit hoan chinh").
 * The aggregate write is not rolled back — the durable state is real and
 * already visible to a re-read; this only marks the *audit trail* as
 * incomplete and asks the caller to retry recording it.
 */
export class StorageRecoveryRequiredError extends Error {
  readonly code = 'storage.recovery_required';
  readonly recoveryActions: RecoveryAction[] = [{ kind: 'retry', label: 'Retry recording the event' }];

  constructor(message: string, readonly metadata?: AidlcErrorMetadata) {
    super(message);
    this.name = 'StorageRecoveryRequiredError';
  }
}

export interface AggregateAccessor<T> {
  parse(raw: unknown): T;
  getRevision(value: T): number;
  getContentHash(value: T): string;
}

export interface MutateAggregateFileOptions {
  /** Dotted-lowercase domain prefix used to build this call's error codes, e.g. `"change"` -> `change.not_found`/`change.duplicate`/`change.revision_conflict`. */
  errorDomain: string;
  /** Human-readable identifier used in error messages, e.g. `"Change CHG-01..."`. */
  displayId: string;
}

/**
 * Perform one CAS write. `guard === 'create'` asserts the file does not
 * yet exist; otherwise `guard` must match the current revision/contentHash
 * exactly or an `AggregateConflictError` is thrown with expected/actual
 * metadata (plan §9.1: "Conflict phai tra typed error chua expected/actual
 * revision/hash"). `mutate` receives the parsed current value (`null` on
 * create) and returns the next value, which is re-validated through
 * `accessor.parse` before it is written — a caller can never persist a
 * value its own contract would reject.
 */
export function mutateAggregateFile<T>(
  file: string,
  accessor: AggregateAccessor<T>,
  guard: VersionGuard | 'create',
  mutate: (current: T | null) => T,
  options: MutateAggregateFileOptions,
): { previous: T | null; next: T } {
  const raw = readJsonFile<unknown>(file);
  const current = raw === undefined ? null : accessor.parse(raw);

  if (guard === 'create') {
    if (current !== null) {
      throw new AggregateConflictError(`${options.errorDomain}.duplicate`, `${options.displayId} already exists.`);
    }
  } else {
    if (current === null) {
      throw new AggregateConflictError(`${options.errorDomain}.not_found`, `${options.displayId} was not found.`);
    }
    const actualRevision = accessor.getRevision(current);
    const actualContentHash = accessor.getContentHash(current);
    if (actualRevision !== guard.expectedRevision || actualContentHash !== guard.expectedContentHash) {
      throw new AggregateConflictError(
        `${options.errorDomain}.revision_conflict`,
        `${options.displayId} changed (expected revision ${guard.expectedRevision}, actual ${actualRevision}).`,
        {
          expectedRevision: guard.expectedRevision,
          expectedContentHash: guard.expectedContentHash,
          actualRevision,
          actualContentHash,
        },
        [
          { kind: 'reload', label: 'Reload the current version' },
          { kind: 'rebase', label: 'Rebase your edit onto the current version' },
        ],
      );
    }
  }

  const next = accessor.parse(mutate(current));
  writeJsonFileAtomic(file, next);
  return { previous: current, next };
}
