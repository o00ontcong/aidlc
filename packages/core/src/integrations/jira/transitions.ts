/**
 * Pick the Jira transition that lands an issue on a wanted status.
 *
 * The trap this file exists to avoid: a transition **id** belongs to a project's
 * workflow, not to a status. `31` is "Start Progress" on one project and
 * something else on the next, so an id cached anywhere is a latent bug. The only
 * portable key is the *destination status name*, matched against the transitions
 * Jira says are available for that specific issue right now.
 *
 * Everything here is pure — the caller fetches
 * `GET /rest/api/3/issue/{key}/transitions` and passes the list in.
 */

import type { JiraStatusCategory, JiraTransition, RawJiraTransition } from './JiraTypes';
import { statusCategoryOf } from './sprintQuery';

/** Comparison key for a status / transition name typed by a human into config. */
function norm(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Normalize the transitions payload, dropping entries with no usable id. */
export function parseTransitions(raw: readonly RawJiraTransition[]): JiraTransition[] {
  return (Array.isArray(raw) ? raw : [])
    .map((t) => {
      const id = (t?.id ?? '').trim();
      if (!id) { return null; }
      return {
        id,
        name: (t.name ?? '').trim(),
        toStatus: (t.to?.name ?? '').trim(),
        toCategory: statusCategoryOf(t.to?.statusCategory?.key),
      };
    })
    .filter((t): t is JiraTransition => t !== null);
}

export type TransitionOutcome =
  /** A transition lands on the wanted status. */
  | { kind: 'transition'; transition: JiraTransition }
  /** Already there — a no-op, not a failure. */
  | { kind: 'already'; status: string }
  /** No route from here. Carries what *was* offered, for the warning message. */
  | { kind: 'unavailable'; wanted: string; available: string[] }
  /** Nothing configured for this event. */
  | { kind: 'not_configured' };

export interface SelectTransitionInput {
  /** Destination status name from config, e.g. `In Progress`. Empty = disabled. */
  wantedStatus: string;
  /** The issue's current status name. */
  currentStatus: string;
  /** Transitions Jira offers for this issue. */
  available: readonly JiraTransition[];
}

/**
 * Choose the transition, or explain why there is none.
 *
 * Matching is case- and whitespace-insensitive because config is typed by hand
 * ("in progress" vs "In Progress"). We match on destination status first and
 * fall back to the transition's own name — some workflows label the transition
 * "Done" while the destination status is "Closed", and the user who typed
 * "Done" meant the button they see.
 */
export function selectTransition(input: SelectTransitionInput): TransitionOutcome {
  const wanted = norm(input.wantedStatus);
  if (!wanted) { return { kind: 'not_configured' }; }

  if (norm(input.currentStatus) === wanted) {
    return { kind: 'already', status: input.currentStatus };
  }

  const byStatus = input.available.filter((t) => norm(t.toStatus) === wanted);
  if (byStatus.length > 0) { return { kind: 'transition', transition: byStatus[0] }; }

  const byName = input.available.filter((t) => norm(t.name) === wanted);
  if (byName.length > 0) { return { kind: 'transition', transition: byName[0] }; }

  return {
    kind: 'unavailable',
    wanted: input.wantedStatus,
    available: input.available.map((t) => t.toStatus || t.name).filter(Boolean),
  };
}

/**
 * Would this transition move the issue into a done state?
 *
 * Used to force a confirmation prompt regardless of the user's "don't ask"
 * setting: closing someone else's ticket is visible to the whole team and
 * awkward to undo, so it is the one write we never do silently.
 */
export function isDestructiveTransition(transition: JiraTransition): boolean {
  return transition.toCategory === 'done';
}

/** Events on the AIDLC side that can drive a Jira status change. */
export type TransitionEvent = 'taskCreated' | 'review' | 'runCompleted' | 'runFailed';

/** Wanted status per event. Empty string = do nothing for that event. */
export interface TransitionMapping {
  taskCreated: string;
  review: string;
  runCompleted: string;
  runFailed: string;
}

export const DEFAULT_TRANSITION_MAPPING: TransitionMapping = {
  taskCreated: 'In Progress',
  review: 'In Review',
  // Deliberately empty: auto-closing a ticket is the write most likely to be
  // wrong, so it is opt-in even after the feature is enabled.
  runCompleted: '',
  runFailed: '',
};

export function wantedStatusFor(mapping: TransitionMapping, event: TransitionEvent): string {
  return (mapping[event] ?? '').trim();
}

/**
 * Is this transition worth doing given where the issue already is?
 *
 * Guards the common annoyance of a run re-emitting `taskCreated` and dragging a
 * ticket backwards from In Review to In Progress. Forward moves and moves within
 * the same bucket are fine; a move that regresses the status category is not.
 */
export function isForwardMove(
  current: JiraStatusCategory,
  target: JiraStatusCategory,
): boolean {
  const rank: Record<JiraStatusCategory, number> = { todo: 0, inprogress: 1, done: 2 };
  return rank[target] >= rank[current];
}
