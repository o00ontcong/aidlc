import { describe, it, expect } from 'vitest';

import { deriveProjectChangeState, PROJECT_CHANGE_DISPLAY_STATES } from '../src/change/deriveProjectChangeState';
import type { ChangeDisposition, ContextSyncStatus } from '../src/contracts/change';
import type { EpicStatus } from '../src/contracts/epic';
import type { ChangeShapeStatusForDerive } from '../src/change/deriveProjectChangeState';

const CONTEXT_SYNC_STATUSES: ContextSyncStatus[] = ['not-evaluated', 'pending', 'proposed', 'applied', 'not-required'];
const EPIC_STATUSES: EpicStatus[] = ['draft', 'ready', 'running', 'waiting-for-user', 'blocked', 'paused', 'review', 'shipping', 'completed'];
const SHAPE_STATUSES: ChangeShapeStatusForDerive[] = ['exploring', 'ready', 'accepted'];

describe('deriveProjectChangeState — precedence 1: disposition wins over everything else', () => {
  const nonActiveDispositions: Array<{ disposition: ChangeDisposition; state: string }> = [
    { disposition: 'shelved', state: 'shelved' },
    { disposition: 'cancelled', state: 'cancelled' },
    { disposition: 'superseded', state: 'superseded' },
  ];

  it.each(nonActiveDispositions)('$disposition always derives $state regardless of Epic/Shape/context', ({ disposition, state }) => {
    for (const epicStatus of [undefined, ...EPIC_STATUSES]) {
      for (const contextSyncStatus of CONTEXT_SYNC_STATUSES) {
        for (const shapeStatus of [undefined, ...SHAPE_STATUSES]) {
          const derived = deriveProjectChangeState({ disposition, epicStatus, contextSyncStatus, shapeStatus });
          expect(derived.state).toBe(state);
        }
      }
    }
  });
});

describe('deriveProjectChangeState — precedence 2-6: Epic status buckets (disposition active)', () => {
  it('completed Epic + context resolved (applied/not-required) => done', () => {
    for (const contextSyncStatus of ['applied', 'not-required'] as ContextSyncStatus[]) {
      const derived = deriveProjectChangeState({ disposition: 'active', epicStatus: 'completed', contextSyncStatus });
      expect(derived.state).toBe('done');
    }
  });

  it('completed Epic + context not yet resolved => delivered', () => {
    for (const contextSyncStatus of ['not-evaluated', 'pending', 'proposed'] as ContextSyncStatus[]) {
      const derived = deriveProjectChangeState({ disposition: 'active', epicStatus: 'completed', contextSyncStatus });
      expect(derived.state).toBe('delivered');
    }
  });

  it('review/shipping Epic => delivery-review, regardless of context sync', () => {
    for (const epicStatus of ['review', 'shipping'] as EpicStatus[]) {
      for (const contextSyncStatus of CONTEXT_SYNC_STATUSES) {
        const derived = deriveProjectChangeState({ disposition: 'active', epicStatus, contextSyncStatus });
        expect(derived.state).toBe('delivery-review');
      }
    }
  });

  it('running/waiting-for-user/blocked/paused Epic => in-delivery (one bucket, detail only in reasonCode)', () => {
    for (const epicStatus of ['running', 'waiting-for-user', 'blocked', 'paused'] as EpicStatus[]) {
      const derived = deriveProjectChangeState({ disposition: 'active', epicStatus, contextSyncStatus: 'not-evaluated' });
      expect(derived.state).toBe('in-delivery');
      expect(derived.reasonCode).toBe(`epic.status.${epicStatus}`);
    }
  });

  it('draft/ready Epic => planned', () => {
    for (const epicStatus of ['draft', 'ready'] as EpicStatus[]) {
      const derived = deriveProjectChangeState({ disposition: 'active', epicStatus, contextSyncStatus: 'not-evaluated' });
      expect(derived.state).toBe('planned');
    }
  });
});

describe('deriveProjectChangeState — precedence 7-9: no Epic yet, Shape-only, then captured', () => {
  it('Shape ready/accepted with no Epic => ready', () => {
    for (const shapeStatus of ['ready', 'accepted'] as ChangeShapeStatusForDerive[]) {
      const derived = deriveProjectChangeState({ disposition: 'active', contextSyncStatus: 'not-evaluated', shapeStatus });
      expect(derived.state).toBe('ready');
    }
  });

  it('Shape exploring with no Epic => understanding', () => {
    const derived = deriveProjectChangeState({ disposition: 'active', contextSyncStatus: 'not-evaluated', shapeStatus: 'exploring' });
    expect(derived.state).toBe('understanding');
  });

  it('no Epic, no Shape => captured', () => {
    const derived = deriveProjectChangeState({ disposition: 'active', contextSyncStatus: 'not-evaluated' });
    expect(derived.state).toBe('captured');
  });
});

describe('deriveProjectChangeState — every declared state is reachable and no other value is produced', () => {
  it('exhausts every disposition × epicStatus × shapeStatus × contextSyncStatus combination', () => {
    const seen = new Set<string>();
    for (const disposition of ['active', 'shelved', 'cancelled', 'superseded'] as ChangeDisposition[]) {
      for (const epicStatus of [undefined, ...EPIC_STATUSES]) {
        for (const shapeStatus of [undefined, ...SHAPE_STATUSES]) {
          for (const contextSyncStatus of CONTEXT_SYNC_STATUSES) {
            const derived = deriveProjectChangeState({ disposition, epicStatus, contextSyncStatus, shapeStatus });
            expect(PROJECT_CHANGE_DISPLAY_STATES).toContain(derived.state);
            seen.add(derived.state);
          }
        }
      }
    }
    // Every declared display state is actually produced by some combination of facts.
    expect([...seen].sort()).toEqual([...PROJECT_CHANGE_DISPLAY_STATES].sort());
  });
});

describe('deriveProjectChangeState — badges are advisory and never fork the lifecycle bucket', () => {
  it('passes badges straight through without ever changing `state`/`reasonCode`', () => {
    const scenarios: Array<Parameters<typeof deriveProjectChangeState>[0]> = [
      { disposition: 'active', contextSyncStatus: 'not-evaluated' },
      { disposition: 'active', contextSyncStatus: 'not-evaluated', shapeStatus: 'exploring' },
      { disposition: 'active', contextSyncStatus: 'not-evaluated', shapeStatus: 'ready' },
      { disposition: 'active', epicStatus: 'blocked', contextSyncStatus: 'not-evaluated' },
      { disposition: 'active', epicStatus: 'completed', contextSyncStatus: 'pending' },
      { disposition: 'active', epicStatus: 'completed', contextSyncStatus: 'applied' },
      { disposition: 'shelved', contextSyncStatus: 'not-evaluated' },
    ];

    for (const scenario of scenarios) {
      const withoutBadges = deriveProjectChangeState(scenario);
      const withBadges = deriveProjectChangeState({ ...scenario, badges: ['stale', 'needs-rebase'] });
      expect(withBadges.state).toBe(withoutBadges.state);
      expect(withBadges.reasonCode).toBe(withoutBadges.reasonCode);
      expect(withBadges.badges).toEqual(['stale', 'needs-rebase']);
      expect(withoutBadges.badges).toEqual([]);
    }
  });
});
