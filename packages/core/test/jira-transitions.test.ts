import { describe, it, expect } from 'vitest';

import {
  DEFAULT_TRANSITION_MAPPING,
  isDestructiveTransition,
  isForwardMove,
  parseTransitions,
  selectTransition,
  wantedStatusFor,
} from '../src/integrations/jira/transitions';
import type { JiraTransition } from '../src/integrations/jira/JiraTypes';

const t = (id: string, name: string, toStatus: string, category = 'indeterminate'): JiraTransition => ({
  id, name, toStatus, toCategory: category === 'done' ? 'done' : category === 'new' ? 'todo' : 'inprogress',
});

describe('parseTransitions', () => {
  it('normalizes destination status and category', () => {
    expect(parseTransitions([
      { id: '31', name: 'Start Progress', to: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } },
    ])).toEqual([
      { id: '31', name: 'Start Progress', toStatus: 'In Progress', toCategory: 'inprogress' },
    ]);
  });

  it('drops an entry with no id — there is nothing to POST', () => {
    expect(parseTransitions([{ name: 'Done', to: { name: 'Done' } }])).toEqual([]);
  });

  it('tolerates a missing to block', () => {
    expect(parseTransitions([{ id: '5', name: 'Weird' }])).toEqual([
      { id: '5', name: 'Weird', toStatus: '', toCategory: 'todo' },
    ]);
  });

  it('tolerates a non-array payload', () => {
    expect(parseTransitions(undefined as unknown as [])).toEqual([]);
  });
});

describe('selectTransition', () => {
  const available = [
    t('11', 'Start Progress', 'In Progress'),
    t('21', 'Send to Review', 'In Review'),
    t('31', 'Close', 'Done', 'done'),
  ];

  it('matches on destination status, never on a cached id', () => {
    const out = selectTransition({ wantedStatus: 'In Progress', currentStatus: 'To Do', available });
    expect(out).toEqual({ kind: 'transition', transition: available[0] });
  });

  it('matches case-insensitively, since config is typed by hand', () => {
    const out = selectTransition({ wantedStatus: 'in progress', currentStatus: 'To Do', available });
    expect(out.kind).toBe('transition');
  });

  it('tolerates sloppy whitespace in config', () => {
    const out = selectTransition({ wantedStatus: '  In   Progress ', currentStatus: 'To Do', available });
    expect(out.kind).toBe('transition');
  });

  it('reports already when the issue is there', () => {
    expect(selectTransition({ wantedStatus: 'In Review', currentStatus: 'In Review', available }))
      .toEqual({ kind: 'already', status: 'In Review' });
  });

  it('reports not_configured for an empty wanted status', () => {
    expect(selectTransition({ wantedStatus: '', currentStatus: 'To Do', available }).kind)
      .toBe('not_configured');
    expect(selectTransition({ wantedStatus: '   ', currentStatus: 'To Do', available }).kind)
      .toBe('not_configured');
  });

  it('reports unavailable with what the workflow does offer', () => {
    const out = selectTransition({ wantedStatus: 'Deployed', currentStatus: 'To Do', available });
    expect(out).toEqual({
      kind: 'unavailable',
      wanted: 'Deployed',
      available: ['In Progress', 'In Review', 'Done'],
    });
  });

  it('falls back to the transition name when the destination status differs', () => {
    // Workflow labels the button "Done" but the status is "Closed" — the user
    // who typed "Done" meant the button.
    const out = selectTransition({
      wantedStatus: 'Done',
      currentStatus: 'In Review',
      available: [t('41', 'Done', 'Closed', 'done')],
    });
    expect(out.kind).toBe('transition');
    expect(out.kind === 'transition' && out.transition.id).toBe('41');
  });

  it('prefers a destination-status match over a name match', () => {
    const out = selectTransition({
      wantedStatus: 'Done',
      currentStatus: 'To Do',
      available: [t('1', 'Done', 'Closed', 'done'), t('2', 'Finish', 'Done', 'done')],
    });
    expect(out.kind === 'transition' && out.transition.id).toBe('2');
  });

  it('takes the first of two transitions to the same status, deterministically', () => {
    const out = selectTransition({
      wantedStatus: 'Done',
      currentStatus: 'To Do',
      available: [t('7', 'Close as fixed', 'Done', 'done'), t('8', 'Close as wontfix', 'Done', 'done')],
    });
    expect(out.kind === 'transition' && out.transition.id).toBe('7');
  });

  it('reports unavailable when the workflow offers nothing', () => {
    expect(selectTransition({ wantedStatus: 'Done', currentStatus: 'To Do', available: [] }))
      .toEqual({ kind: 'unavailable', wanted: 'Done', available: [] });
  });
});

describe('isDestructiveTransition', () => {
  it('flags a move into a done category', () => {
    expect(isDestructiveTransition(t('1', 'Close', 'Done', 'done'))).toBe(true);
  });

  it('does not flag an in-progress move', () => {
    expect(isDestructiveTransition(t('1', 'Start', 'In Progress'))).toBe(false);
  });
});

describe('the default mapping', () => {
  it('starts work but never auto-closes', () => {
    expect(DEFAULT_TRANSITION_MAPPING.taskCreated).toBe('In Progress');
    expect(DEFAULT_TRANSITION_MAPPING.review).toBe('In Review');
    expect(DEFAULT_TRANSITION_MAPPING.runCompleted).toBe('');
    expect(DEFAULT_TRANSITION_MAPPING.runFailed).toBe('');
  });

  it('reads a wanted status per event, trimmed', () => {
    const mapping = { ...DEFAULT_TRANSITION_MAPPING, runCompleted: '  Done  ' };
    expect(wantedStatusFor(mapping, 'runCompleted')).toBe('Done');
    expect(wantedStatusFor(mapping, 'runFailed')).toBe('');
  });
});

describe('isForwardMove', () => {
  it('allows moving forward', () => {
    expect(isForwardMove('todo', 'inprogress')).toBe(true);
    expect(isForwardMove('inprogress', 'done')).toBe(true);
  });

  it('allows staying in the same bucket', () => {
    expect(isForwardMove('inprogress', 'inprogress')).toBe(true);
  });

  it('refuses to drag a reviewed ticket back to in-progress', () => {
    expect(isForwardMove('done', 'inprogress')).toBe(false);
    expect(isForwardMove('inprogress', 'todo')).toBe(false);
  });
});
