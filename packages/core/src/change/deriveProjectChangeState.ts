/**
 * The one display lifecycle shared by Project, Discover, Sprint and Epic
 * (Master Rule §0.3; implementation plan §7, §D14, §D18).
 *
 * `ProjectChange`, `ChangeShape` and an Epic each own an independent fact
 * (disposition / shape status / epic status); Context owns a fifth
 * (context-sync status). Nothing stores a combined "display status" — this
 * pure function derives it every time, with a fixed, tested precedence, so
 * Discover/Sprint/Epic/Project can never drift into their own reading of the
 * same Change.
 */

import type { ChangeDisposition, ContextSyncStatus } from '../contracts/change';
import type { EpicStatus } from '../contracts/epic';
import { PROJECT_CHANGE_DISPLAY_STATES, type ProjectChangeDerivedState } from '../contracts/projectReadModel';

// Re-exported so existing importers of this module keep working — the
// vocabulary's source of truth is `contracts/projectReadModel.ts` (a
// contracts file must own it, not this domain-logic module), but this file
// is where the pure derivation lives, so both are reachable from here too.
export { PROJECT_CHANGE_DISPLAY_STATES };
export type { ProjectChangeDerivedState, ProjectChangeDisplayState } from '../contracts/projectReadModel';

/** The subset of `ChangeShape['status']` this derivation cares about (plan §6.2). */
export type ChangeShapeStatusForDerive = 'exploring' | 'ready' | 'accepted';

export interface DeriveProjectChangeStateInput {
  disposition: ChangeDisposition;
  /** Absent until `change.epic.start` links an Epic (§D4: at most one Epic per Change). */
  epicStatus?: EpicStatus;
  contextSyncStatus: ContextSyncStatus;
  /** Absent until `change.explore.start` creates the optional Shape component (§D13). */
  shapeStatus?: ChangeShapeStatusForDerive;
  /**
   * Freshness/attention badges — analysis stale, Shape stale, Context
   * Proposal needs-rebase, external ticket unavailable, Epic blocked detail,
   * ... (plan §7: "chỉ là badge/freshness, không được biến thành lifecycle
   * song song"). Passed straight through; never consulted to pick `state`.
   */
  badges?: readonly string[];
}

const EPIC_DELIVERY_REVIEW_STATUSES: ReadonlySet<EpicStatus> = new Set(['review', 'shipping']);
const EPIC_IN_DELIVERY_STATUSES: ReadonlySet<EpicStatus> = new Set(['running', 'waiting-for-user', 'blocked', 'paused']);
const EPIC_PLANNED_STATUSES: ReadonlySet<EpicStatus> = new Set(['draft', 'ready']);
const CONTEXT_SYNC_RESOLVED: ReadonlySet<ContextSyncStatus> = new Set(['applied', 'not-required']);

/**
 * Derive the shared display lifecycle. Precedence (plan §7, highest first):
 *
 *   1. `disposition` shelved/cancelled/superseded — a terminal/paused fact
 *      that always wins, regardless of Epic/Shape/context state.
 *   2. Epic `completed` + context resolved (`applied`/`not-required`) → `done`.
 *   3. Epic `completed` but context not yet resolved → `delivered`.
 *   4. Epic `review`/`shipping` → `delivery-review`.
 *   5. Epic `running`/`waiting-for-user`/`blocked`/`paused` → `in-delivery`
 *      (the exact status is only in `reasonCode`, never a separate bucket).
 *   6. Epic `draft`/`ready` → `planned`.
 *   7. No Epic yet, Shape `ready`/`accepted` → `ready`.
 *   8. No Epic yet, Shape `exploring` → `understanding`.
 *   9. Otherwise → `captured`.
 *
 * Every branch is covered by an exhaustive precedence test in
 * `derive-project-change-state.test.ts`.
 */
export function deriveProjectChangeState(input: DeriveProjectChangeStateInput): ProjectChangeDerivedState {
  const { disposition, epicStatus, contextSyncStatus, shapeStatus, badges = [] } = input;

  if (disposition === 'shelved') return { state: 'shelved', reasonCode: 'change.disposition.shelved', badges };
  if (disposition === 'cancelled') return { state: 'cancelled', reasonCode: 'change.disposition.cancelled', badges };
  if (disposition === 'superseded') return { state: 'superseded', reasonCode: 'change.disposition.superseded', badges };

  if (epicStatus === 'completed') {
    return CONTEXT_SYNC_RESOLVED.has(contextSyncStatus)
      ? { state: 'done', reasonCode: 'epic.completed.context-resolved', badges }
      : { state: 'delivered', reasonCode: 'epic.completed.context-pending', badges };
  }
  if (epicStatus && EPIC_DELIVERY_REVIEW_STATUSES.has(epicStatus)) {
    return { state: 'delivery-review', reasonCode: `epic.status.${epicStatus}`, badges };
  }
  if (epicStatus && EPIC_IN_DELIVERY_STATUSES.has(epicStatus)) {
    return { state: 'in-delivery', reasonCode: `epic.status.${epicStatus}`, badges };
  }
  if (epicStatus && EPIC_PLANNED_STATUSES.has(epicStatus)) {
    return { state: 'planned', reasonCode: `epic.status.${epicStatus}`, badges };
  }

  if (shapeStatus === 'ready' || shapeStatus === 'accepted') {
    return { state: 'ready', reasonCode: `shape.status.${shapeStatus}`, badges };
  }
  if (shapeStatus === 'exploring') {
    return { state: 'understanding', reasonCode: 'shape.status.exploring', badges };
  }

  return { state: 'captured', reasonCode: 'change.captured', badges };
}
