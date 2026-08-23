import { describe, expect, it } from 'vitest';

import type { TransitionEvent } from '@aidlc/core';

import {
  appendSubtask,
  appendTransition,
  describeTransitionOutcome,
  deriveTransitionEvent,
  emptyLedger,
  epicIdOf,
  ledgerHandled,
  parseLedger,
  ticketKeyFromInputs,
  type JiraLedger,
  type LedgerTransition,
  type RunStateLike,
} from '../src/v2/jiraStatusSyncLogic';

const run = (over: Partial<RunStateLike> = {}): RunStateLike => ({
  runId: 'RUN-1',
  status: 'running',
  context: { epic: 'ACME-4830' },
  steps: [{ status: 'awaiting_work' }, { status: 'pending' }],
  ...over,
});

const entry = (over: Partial<LedgerTransition> = {}): LedgerTransition => ({
  at: '2026-08-23T09:00:00.000Z',
  event: 'taskCreated',
  runId: 'RUN-1',
  from: 'To Do',
  to: 'In Progress',
  outcome: 'done',
  ...over,
});

const ledgerWith = (...entries: LedgerTransition[]): JiraLedger => ({
  ...emptyLedger('ACME-4830', 'silvertiger.atlassian.net'),
  transitions: entries,
});

describe('deriveTransitionEvent', () => {
  it('reports taskCreated for a fresh run', () => {
    expect(deriveTransitionEvent(run(), emptyLedger())).toBe('taskCreated');
  });

  it('reports review when a step is awaiting a human', () => {
    const state = run({ steps: [{ status: 'approved' }, { status: 'awaiting_review' }] });
    expect(deriveTransitionEvent(state, ledgerWith(entry()))).toBe('review');
  });

  it('reports review when a step is awaiting the auto-reviewer', () => {
    const state = run({ steps: [{ status: 'awaiting_auto_review' }] });
    expect(deriveTransitionEvent(state, ledgerWith(entry()))).toBe('review');
  });

  it('reports runCompleted for a completed run', () => {
    const state = run({ status: 'completed', steps: [{ status: 'approved' }] });
    expect(deriveTransitionEvent(state, ledgerWith(entry()))).toBe('runCompleted');
  });

  it('reports runFailed for a failed run', () => {
    expect(deriveTransitionEvent(run({ status: 'failed' }), ledgerWith(entry()))).toBe('runFailed');
  });

  it('reports the furthest event when several apply at once', () => {
    // A run we only see after it finished must not be walked through every
    // intermediate status.
    const state = run({ status: 'completed', steps: [{ status: 'awaiting_review' }] });
    expect(deriveTransitionEvent(state, emptyLedger())).toBe('runCompleted');
  });

  it('prefers failed over completed', () => {
    const state = run({ status: 'failed', steps: [{ status: 'awaiting_review' }] });
    expect(deriveTransitionEvent(state, emptyLedger())).toBe('runFailed');
  });

  it('returns null once every applicable event is handled — the common case', () => {
    const ledger = ledgerWith(entry());
    expect(deriveTransitionEvent(run(), ledger)).toBeNull();
  });

  it('is idempotent across repeated saves of the same state', () => {
    let ledger = emptyLedger();
    const first = deriveTransitionEvent(run(), ledger);
    ledger = appendTransition(ledger, entry({ event: first! }));
    expect(deriveTransitionEvent(run(), ledger)).toBeNull();
    expect(deriveTransitionEvent(run(), ledger)).toBeNull();
  });

  it('fires again for a genuinely new run of the same epic', () => {
    const ledger = ledgerWith(entry({ runId: 'RUN-1' }));
    expect(deriveTransitionEvent(run({ runId: 'RUN-2' }), ledger)).toBe('taskCreated');
  });

  it('advances past a handled event to the next one', () => {
    const ledger = ledgerWith(entry(), entry({ event: 'review', to: 'In Review' }));
    const state = run({ status: 'completed', steps: [{ status: 'approved' }] });
    expect(deriveTransitionEvent(state, ledger)).toBe('runCompleted');
  });

  it('handles a run with no steps', () => {
    expect(deriveTransitionEvent(run({ steps: [] }), emptyLedger())).toBe('taskCreated');
  });
});

describe('ledgerHandled', () => {
  it('treats done as handled', () => {
    expect(ledgerHandled(ledgerWith(entry({ outcome: 'done' })), 'taskCreated', 'RUN-1')).toBe(true);
  });

  it('treats skipped as handled — nothing more to try', () => {
    expect(ledgerHandled(ledgerWith(entry({ outcome: 'skipped' })), 'taskCreated', 'RUN-1')).toBe(true);
  });

  it('treats declined as handled, so we do not nag', () => {
    expect(ledgerHandled(ledgerWith(entry({ outcome: 'declined' })), 'taskCreated', 'RUN-1')).toBe(true);
  });

  it('does NOT treat failed as handled — a transient error deserves a retry', () => {
    expect(ledgerHandled(ledgerWith(entry({ outcome: 'failed' })), 'taskCreated', 'RUN-1')).toBe(false);
  });

  it('scopes by run id', () => {
    expect(ledgerHandled(ledgerWith(entry()), 'taskCreated', 'RUN-2')).toBe(false);
  });

  it('scopes by event', () => {
    expect(ledgerHandled(ledgerWith(entry()), 'review', 'RUN-1')).toBe(false);
  });
});

describe('appendTransition', () => {
  it('appends in order', () => {
    const ledger = appendTransition(emptyLedger(), entry());
    expect(ledger.transitions).toHaveLength(1);
    expect(appendTransition(ledger, entry({ event: 'review' })).transitions.map((e) => e.event))
      .toEqual(['taskCreated', 'review']);
  });

  it('caps the history so the file stays reviewable in a diff', () => {
    let ledger = emptyLedger();
    for (let i = 0; i < 60; i += 1) {
      ledger = appendTransition(ledger, entry({ runId: `RUN-${i}` }), 50);
    }
    expect(ledger.transitions).toHaveLength(50);
    // Oldest dropped, newest kept.
    expect(ledger.transitions[0].runId).toBe('RUN-10');
    expect(ledger.transitions[49].runId).toBe('RUN-59');
  });

  it('does not mutate the input ledger', () => {
    const ledger = emptyLedger();
    appendTransition(ledger, entry());
    expect(ledger.transitions).toEqual([]);
  });
});

describe('appendSubtask', () => {
  it('adds a subtask', () => {
    const ledger = appendSubtask(emptyLedger(), {
      domain: 'Backend', key: 'ACME-4855', createdAt: 'now',
    });
    expect(ledger.subtasks).toHaveLength(1);
  });

  it('replaces the entry for a domain rather than duplicating it', () => {
    let ledger = appendSubtask(emptyLedger(), { domain: 'Backend', key: 'OLD', createdAt: 'a' });
    ledger = appendSubtask(ledger, { domain: 'backend', key: 'NEW', createdAt: 'b' });
    expect(ledger.subtasks).toHaveLength(1);
    expect(ledger.subtasks[0].key).toBe('NEW');
  });

  it('keeps other domains', () => {
    let ledger = appendSubtask(emptyLedger(), { domain: 'Backend', key: 'B', createdAt: 'a' });
    ledger = appendSubtask(ledger, { domain: 'Testing', key: 'T', createdAt: 'b' });
    expect(ledger.subtasks.map((s) => s.domain).sort()).toEqual(['Backend', 'Testing']);
  });
});

describe('parseLedger', () => {
  it('round-trips a well-formed ledger', () => {
    const ledger = appendTransition(emptyLedger('ACME-1', 'site'), entry());
    expect(parseLedger(JSON.parse(JSON.stringify(ledger)))).toEqual(ledger);
  });

  it('degrades a corrupt file to an empty ledger instead of throwing', () => {
    // A broken audit file must not break a pipeline run.
    expect(parseLedger('not an object')).toEqual(emptyLedger());
    expect(parseLedger(null)).toEqual(emptyLedger());
    expect(parseLedger(42)).toEqual(emptyLedger());
  });

  it('drops malformed entries but keeps the good ones', () => {
    const parsed = parseLedger({
      ticket: 'ACME-1',
      subtasks: [{ domain: 'Backend', key: 'B' }, { domain: 'NoKey' }, null],
      transitions: [entry(), { event: 'review' }, 'junk'],
    });
    expect(parsed.subtasks).toHaveLength(1);
    expect(parsed.transitions).toHaveLength(1);
  });

  it('tolerates missing arrays', () => {
    expect(parseLedger({ ticket: 'ACME-1' })).toEqual({
      site: '', ticket: 'ACME-1', subtasks: [], transitions: [],
    });
  });

  it('keeps a numeric sprintId and drops a non-numeric one', () => {
    expect(parseLedger({ sprintId: 24 }).sprintId).toBe(24);
    expect(parseLedger({ sprintId: 'x' }).sprintId).toBeUndefined();
  });
});

describe('epicIdOf / ticketKeyFromInputs', () => {
  it('reads the epic from run context', () => {
    expect(epicIdOf({ context: { epic: ' ACME-4830 ' } })).toBe('ACME-4830');
  });

  it('returns empty when the run has no epic context', () => {
    expect(epicIdOf({ context: {} })).toBe('');
  });

  it('reads the jira key from inputs', () => {
    expect(ticketKeyFromInputs({ jira: ' ACME-1 ', files: 'src/**' })).toBe('ACME-1');
  });

  it('returns empty for inputs with no jira key', () => {
    expect(ticketKeyFromInputs({ files: 'src/**' })).toBe('');
    expect(ticketKeyFromInputs(null)).toBe('');
    expect(ticketKeyFromInputs({ jira: 42 })).toBe('');
  });
});

describe('describeTransitionOutcome', () => {
  it('logs a success', () => {
    expect(describeTransitionOutcome(entry())).toBe('[jira] taskCreated To Do → In Progress · OK');
  });

  it('logs why a transition was skipped', () => {
    expect(describeTransitionOutcome(entry({ outcome: 'skipped', detail: 'workflow thiếu transition' })))
      .toContain('bỏ qua (workflow thiếu transition)');
  });

  it('logs a decline without pretending it failed', () => {
    expect(describeTransitionOutcome(entry({ outcome: 'declined' }))).toContain('người dùng từ chối');
  });

  it('logs a failure with its detail', () => {
    expect(describeTransitionOutcome(entry({ outcome: 'failed', detail: '403' }))).toContain('LỖI: 403');
  });

  it('produces a line for every event and outcome', () => {
    const events: TransitionEvent[] = ['taskCreated', 'review', 'runCompleted', 'runFailed'];
    const outcomes: LedgerTransition['outcome'][] = ['done', 'skipped', 'declined', 'failed'];
    for (const event of events) {
      for (const outcome of outcomes) {
        expect(describeTransitionOutcome(entry({ event, outcome })).length).toBeGreaterThan(10);
      }
    }
  });
});
