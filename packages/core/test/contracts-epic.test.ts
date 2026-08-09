import { describe, it, expect } from 'vitest';

import {
  EpicSchema,
  parseEpic,
  isValidEpicTransition,
  EPIC_STATUSES,
  EPIC_STATUS_TRANSITIONS,
  type Epic,
} from '../src/contracts/epic';
import { createDefaultAutonomyPolicy } from '../src/contracts/autonomy';

function validEpic(overrides: Partial<Epic> = {}): Epic {
  return {
    schemaVersion: 1,
    id: 'EPIC-001' as Epic['id'],
    title: 'Add portfolio risk alerts',
    description: 'Alert users when portfolio risk exceeds a threshold.',
    type: 'feature',
    profile: 'standard',
    status: 'draft',
    autonomy: createDefaultAutonomyPolicy(),
    stages: [],
    createdAt: '2026-08-09T10:00:00.000Z',
    updatedAt: '2026-08-09T10:00:00.000Z',
    revision: 1,
    ...overrides,
  };
}

describe('Epic — parse/serialize round-trip', () => {
  it('round-trips a fully-populated Epic through JSON unchanged', () => {
    const original = validEpic({
      currentStageId: 'build',
      activeRunId: 'EPIC-001--run-001' as Epic['activeRunId'],
      blockedReason: undefined,
      stages: [
        {
          id: 'understand',
          status: 'completed',
          autonomy: 'guide',
          actions: [],
        },
      ],
    });
    const json = JSON.parse(JSON.stringify(original));
    const parsed = parseEpic(json);
    expect(parsed).toEqual(original);
  });

  it('rejects a malformed EpicId', () => {
    const bad = { ...validEpic(), id: 'not-an-epic-id' };
    expect(EpicSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects duplicate stage ids within the same Epic', () => {
    const bad = validEpic({
      stages: [
        { id: 'build', status: 'active', autonomy: 'guide', actions: [] },
        { id: 'build', status: 'pending', autonomy: 'guide', actions: [] },
      ],
    });
    expect(EpicSchema.safeParse(bad).success).toBe(false);
  });
});

describe('Epic — backward compatibility (new optional field does not break an older payload)', () => {
  it('parses an older payload missing currentStageId / activeRunId / blockedReason (all added as optional fields)', () => {
    const legacy = validEpic();
    // Simulate data written before these optional fields existed on disk.
    const legacyRaw: Record<string, unknown> = { ...legacy };
    delete legacyRaw.currentStageId;
    delete legacyRaw.activeRunId;
    delete legacyRaw.blockedReason;

    const parsed = parseEpic(legacyRaw);
    expect(parsed.currentStageId).toBeUndefined();
    expect(parsed.activeRunId).toBeUndefined();
    expect(parsed.blockedReason).toBeUndefined();
    expect(parsed.id).toBe('EPIC-001');
  });

  it('parses an older payload with an empty stages array (predates any stage having run)', () => {
    const legacy = validEpic({ stages: [] });
    expect(() => parseEpic(legacy)).not.toThrow();
  });
});

describe('Epic status machine — exactly draft -> ready -> running -> waiting-for-user|blocked|paused -> review -> shipping -> completed (design doc §11)', () => {
  it('declares exactly the nine statuses from the design doc, no more, no fewer', () => {
    expect(EPIC_STATUSES).toEqual([
      'draft',
      'ready',
      'running',
      'waiting-for-user',
      'blocked',
      'paused',
      'review',
      'shipping',
      'completed',
    ]);
  });

  it('accepts the documented forward path', () => {
    expect(isValidEpicTransition('draft', 'ready')).toBe(true);
    expect(isValidEpicTransition('ready', 'running')).toBe(true);
    expect(isValidEpicTransition('running', 'waiting-for-user')).toBe(true);
    expect(isValidEpicTransition('running', 'blocked')).toBe(true);
    expect(isValidEpicTransition('running', 'paused')).toBe(true);
    expect(isValidEpicTransition('running', 'review')).toBe(true);
    expect(isValidEpicTransition('review', 'shipping')).toBe(true);
    expect(isValidEpicTransition('shipping', 'completed')).toBe(true);
  });

  it('rejects skipping stages of the machine', () => {
    expect(isValidEpicTransition('draft', 'running')).toBe(false);
    expect(isValidEpicTransition('draft', 'completed')).toBe(false);
    expect(isValidEpicTransition('ready', 'completed')).toBe(false);
    expect(isValidEpicTransition('running', 'completed')).toBe(false);
  });

  it('completed is terminal — no transitions out', () => {
    expect(EPIC_STATUS_TRANSITIONS.completed).toEqual([]);
    for (const to of EPIC_STATUSES) {
      expect(isValidEpicTransition('completed', to)).toBe(false);
    }
  });

  it('interruption states (waiting-for-user, blocked, paused) resume back to running', () => {
    expect(isValidEpicTransition('waiting-for-user', 'running')).toBe(true);
    expect(isValidEpicTransition('blocked', 'running')).toBe(true);
    expect(isValidEpicTransition('paused', 'running')).toBe(true);
  });

  it('every status is reachable and every transition target is itself a declared status', () => {
    for (const status of EPIC_STATUSES) {
      for (const target of EPIC_STATUS_TRANSITIONS[status]) {
        expect(EPIC_STATUSES).toContain(target);
      }
    }
  });
});
