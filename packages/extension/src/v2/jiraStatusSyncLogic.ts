/**
 * Pure logic for pushing AIDLC run progress back to Jira as status transitions.
 *
 * {@link ./jiraStatusSync} owns the VS Code side (config, client, confirmation
 * prompts, file I/O). Everything decidable without those lives here so it can be
 * tested as a table rather than against a live board.
 *
 * ## The ledger is the memory, not a `prev` state
 *
 * `saveRun()` hands us only the new {@link RunState}. Rather than diffing
 * against a previous copy — which would need an extra read, and would still
 * double-fire whenever the same state is saved twice — the decision is made
 * against `docs/epics/<ID>/jira.json`, which records what we already did.
 *
 * That makes the whole thing idempotent by construction: repeated saves, a
 * window reload, or a second run for the same epic cannot re-fire a transition
 * that already happened.
 */

import type { RunState, StepRecord } from '@aidlc/core';

import type { TransitionEvent } from '@aidlc/core';

/** One recorded transition attempt — successes and non-events alike. */
export interface LedgerTransition {
  /** ISO timestamp. */
  at: string;
  event: TransitionEvent;
  runId: string;
  /** Status the ticket was in. */
  from: string;
  /** Status we asked for. */
  to: string;
  outcome: 'done' | 'skipped' | 'declined' | 'failed';
  /** Why, for anything other than `done`. */
  detail?: string;
}

/** One subtask we created, so we never create it twice. */
export interface LedgerSubtask {
  domain: string;
  key: string;
  createdAt: string;
  /** Template hash at creation time, to explain a later mismatch. */
  templateHash?: string;
}

/**
 * `docs/epics/<ID>/jira.json` — the audit trail for everything we wrote to Jira
 * on this epic's behalf. Deliberately a sidecar rather than more keys in
 * `inputs.json`: that file means "capability inputs at start time", not a log.
 */
export interface JiraLedger {
  site: string;
  ticket: string;
  sprintId?: number;
  subtasks: LedgerSubtask[];
  transitions: LedgerTransition[];
}

export function emptyLedger(ticket = '', site = ''): JiraLedger {
  return { site, ticket, subtasks: [], transitions: [] };
}

/**
 * Parse a ledger read off disk. Anything malformed degrades to an empty ledger
 * rather than throwing — a corrupt audit file must not break a pipeline run.
 * Losing history is bad; blocking work is worse.
 */
export function parseLedger(raw: unknown): JiraLedger {
  if (!raw || typeof raw !== 'object') { return emptyLedger(); }
  const source = raw as Partial<JiraLedger>;
  return {
    site: typeof source.site === 'string' ? source.site : '',
    ticket: typeof source.ticket === 'string' ? source.ticket : '',
    ...(typeof source.sprintId === 'number' ? { sprintId: source.sprintId } : {}),
    subtasks: Array.isArray(source.subtasks)
      ? source.subtasks.filter(isLedgerSubtask)
      : [],
    transitions: Array.isArray(source.transitions)
      ? source.transitions.filter(isLedgerTransition)
      : [],
  };
}

function isLedgerSubtask(value: unknown): value is LedgerSubtask {
  const entry = value as Partial<LedgerSubtask> | null;
  return Boolean(entry && typeof entry.domain === 'string' && typeof entry.key === 'string');
}

function isLedgerTransition(value: unknown): value is LedgerTransition {
  const entry = value as Partial<LedgerTransition> | null;
  return Boolean(entry && typeof entry.event === 'string' && typeof entry.runId === 'string');
}

/**
 * Has this event already been handled for this run?
 *
 * A `declined` outcome counts as handled: the user said "not this time", and
 * asking again on the next save would be nagging. `failed` does not count, so a
 * transient Jira failure gets another chance on the next step.
 */
export function ledgerHandled(ledger: JiraLedger, event: TransitionEvent, runId: string): boolean {
  return ledger.transitions.some((entry) =>
    entry.event === event
    && entry.runId === runId
    && (entry.outcome === 'done' || entry.outcome === 'skipped' || entry.outcome === 'declined'));
}

/** Append an entry, keeping the ledger bounded so it stays reviewable in a diff. */
export function appendTransition(
  ledger: JiraLedger,
  entry: LedgerTransition,
  limit = 50,
): JiraLedger {
  const transitions = [...ledger.transitions, entry];
  return {
    ...ledger,
    transitions: transitions.length > limit ? transitions.slice(-limit) : transitions,
  };
}

export function appendSubtask(ledger: JiraLedger, entry: LedgerSubtask): JiraLedger {
  const others = ledger.subtasks.filter(
    (existing) => existing.domain.toLowerCase() !== entry.domain.toLowerCase(),
  );
  return { ...ledger, subtasks: [...others, entry] };
}

/** The subset of {@link RunState} this module reads. */
export type RunStateLike = Pick<RunState, 'runId' | 'status' | 'context'> & {
  steps: Array<Pick<StepRecord, 'status'>>;
};

/**
 * Which event, if any, this run state represents.
 *
 * Checked most-progressed first, so a state that satisfies several (a run that
 * completed before we ever saw it start) reports the furthest one instead of
 * walking the ticket through every intermediate status.
 *
 * Returns null when nothing new happened — the common case, since `saveRun` is
 * called on every step action.
 */
export function deriveTransitionEvent(
  state: RunStateLike,
  ledger: JiraLedger,
): TransitionEvent | null {
  const unhandled = (event: TransitionEvent) => !ledgerHandled(ledger, event, state.runId);

  if (state.status === 'failed' && unhandled('runFailed')) { return 'runFailed'; }
  if (state.status === 'completed' && unhandled('runCompleted')) { return 'runCompleted'; }
  if (isAwaitingReview(state) && unhandled('review')) { return 'review'; }
  // A run exists at all, so the work has started.
  if (unhandled('taskCreated')) { return 'taskCreated'; }
  return null;
}

/** Any step paused for a human or the auto-reviewer. */
function isAwaitingReview(state: RunStateLike): boolean {
  return state.steps.some(
    (step) => step.status === 'awaiting_review' || step.status === 'awaiting_auto_review',
  );
}

/** The epic id a run belongs to, by the `epic` context convention. */
export function epicIdOf(state: Pick<RunState, 'context'>): string {
  return (state.context?.epic ?? '').trim();
}

/** The Jira key an epic is linked to, from its `inputs.json`. */
export function ticketKeyFromInputs(inputs: unknown): string {
  if (!inputs || typeof inputs !== 'object') { return ''; }
  const value = (inputs as Record<string, unknown>).jira;
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * One line for the Output channel. Every write attempt gets one, including the
 * ones that did nothing — "why didn't it move" is the question people actually
 * have, and silence is the worst possible answer to it.
 */
export function describeTransitionOutcome(entry: LedgerTransition): string {
  const head = `[jira] ${entry.event} ${entry.from || '?'} → ${entry.to || '?'}`;
  switch (entry.outcome) {
    case 'done':
      return `${head} · OK`;
    case 'skipped':
      return `${head} · bỏ qua${entry.detail ? ` (${entry.detail})` : ''}`;
    case 'declined':
      return `${head} · người dùng từ chối`;
    case 'failed':
      return `${head} · LỖI${entry.detail ? `: ${entry.detail}` : ''}`;
  }
}
