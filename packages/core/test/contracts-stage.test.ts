import { describe, it, expect } from 'vitest';

import { StageSchema, ActionSchema, STAGE_STATUSES, ACTION_STATUSES, type Stage, type Action } from '../src/contracts/stage';
import { STAGE_IDS, STAGE_LABELS } from '../src/contracts/stageId';

function sampleAction(overrides: Partial<Action> = {}): Action {
  return {
    id: 'implement-ios-alert',
    stageId: 'build',
    name: 'Implement iOS alert',
    status: 'running',
    capability: 'ios-development',
    modelTier: 'balanced',
    gate: 'destructive_changes',
    startedAt: '2026-08-09T10:00:00.000Z',
    evidence: [{ kind: 'git-diff', ref: 'sha256:abc' }],
    ...overrides,
  };
}

function sampleStage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: 'build',
    status: 'active',
    autonomy: 'auto',
    actions: [sampleAction()],
    startedAt: '2026-08-09T09:55:00.000Z',
    ...overrides,
  };
}

describe('StageId — canonical five-stage vocabulary (design doc §3)', () => {
  it('declares exactly Understand, Plan, Build, Verify, Ship', () => {
    expect(STAGE_IDS).toEqual(['understand', 'plan', 'build', 'verify', 'ship']);
    expect(STAGE_LABELS.understand).toBe('Understand');
    expect(STAGE_LABELS.ship).toBe('Ship');
  });
});

describe('Action — parse/serialize round-trip', () => {
  it('round-trips through JSON unchanged', () => {
    const original = sampleAction();
    const parsed = ActionSchema.parse(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });

  it('declares every documented ActionStatus', () => {
    expect(ACTION_STATUSES).toEqual([
      'pending',
      'running',
      'waiting-for-user',
      'blocked',
      'paused',
      'completed',
      'failed',
      'skipped',
    ]);
  });

  it('carries a structured AidlcError, not a raw exception, when failed', () => {
    const failed = sampleAction({
      status: 'failed',
      error: { code: 'provider.unavailable', summary: 'Model provider timed out.', recoveryActions: [], at: '2026-08-09T10:01:00.000Z' },
    });
    expect(ActionSchema.safeParse(failed).success).toBe(true);
  });
});

describe('Action — backward compatibility (new optional field does not break an older payload)', () => {
  it('parses an older payload missing capability/modelTier/gate/finishedAt/error (all optional)', () => {
    const legacy: Record<string, unknown> = { ...sampleAction() };
    delete legacy.capability;
    delete legacy.modelTier;
    delete legacy.gate;
    delete legacy.finishedAt;
    delete legacy.error;

    const parsed = ActionSchema.parse(legacy);
    expect(parsed.capability).toBeUndefined();
    expect(parsed.modelTier).toBeUndefined();
    expect(parsed.gate).toBeUndefined();
    expect(parsed.error).toBeUndefined();
  });

  it('parses an older payload with no evidence at all (defaults to [])', () => {
    const legacy: Record<string, unknown> = { ...sampleAction() };
    delete legacy.evidence;
    expect(ActionSchema.parse(legacy).evidence).toEqual([]);
  });
});

describe('Stage — parse/serialize round-trip', () => {
  it('round-trips through JSON unchanged', () => {
    const original = sampleStage();
    const parsed = StageSchema.parse(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });

  it('declares every documented StageStatus', () => {
    expect(STAGE_STATUSES).toEqual(['pending', 'active', 'waiting-for-user', 'blocked', 'paused', 'completed', 'skipped']);
  });

  it('rejects duplicate action ids within the same stage', () => {
    const bad = sampleStage({ actions: [sampleAction(), sampleAction()] });
    expect(StageSchema.safeParse(bad).success).toBe(false);
  });
});

describe('Stage — backward compatibility', () => {
  it('parses an older payload missing startedAt/finishedAt (optional)', () => {
    const legacy: Record<string, unknown> = { ...sampleStage() };
    delete legacy.startedAt;
    delete legacy.finishedAt;
    const parsed = StageSchema.parse(legacy);
    expect(parsed.startedAt).toBeUndefined();
    expect(parsed.finishedAt).toBeUndefined();
  });

  it('parses an older payload with no actions at all (defaults to [])', () => {
    const legacy: Record<string, unknown> = { ...sampleStage() };
    delete legacy.actions;
    expect(StageSchema.parse(legacy).actions).toEqual([]);
  });
});
