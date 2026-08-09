import { describe, it, expect } from 'vitest';

import { EpicRunSchema, parseEpicRun, RunEventSchema, parseRunEvent, type EpicRun, type RunEvent } from '../src/contracts/run';
import { formatRunId, formatEventId, toEpicId } from '../src/contracts/ids';

const EPIC_ID = toEpicId('EPIC-001');
const RUN_ID = formatRunId(EPIC_ID, 1);

function validRun(overrides: Partial<EpicRun> = {}): EpicRun {
  return {
    schemaVersion: 1,
    id: RUN_ID,
    epicId: EPIC_ID,
    workflowHash: 'sha256:deadbeef',
    profile: 'standard',
    status: 'running',
    stages: [{ id: 'build', status: 'active', autonomy: 'guide', actions: [] }],
    startedAt: '2026-08-09T10:00:00.000Z',
    updatedAt: '2026-08-09T10:05:00.000Z',
    revision: 1,
    ...overrides,
  };
}

function validEvent(overrides: Partial<RunEvent> = {}): RunEvent {
  return {
    schemaVersion: 1,
    id: formatEventId(RUN_ID, 1),
    at: '2026-08-09T10:30:00.000Z',
    actor: { kind: 'agent', id: 'senior-ios-developer' },
    epicId: EPIC_ID,
    runId: RUN_ID,
    command: 'aidlc.action.execute',
    stageId: 'build',
    actionId: 'implement-ios-alert',
    from: 'running',
    to: 'validating',
    evidence: [
      { kind: 'git-diff', ref: 'sha256:abc123' },
      { kind: 'test', ref: 'xcodebuild-test', status: 'passed' },
    ],
    ...overrides,
  };
}

describe('EpicRun — parse/serialize round-trip', () => {
  it('round-trips through JSON unchanged', () => {
    const original = validRun();
    const parsed = parseEpicRun(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });

  it('EpicRun.status reuses EpicStatus verbatim — no competing Run-only status vocabulary', () => {
    // "completed" and "blocked" are Epic statuses; an invented Run-only
    // status like "succeeded" must be rejected.
    expect(EpicRunSchema.safeParse(validRun({ status: 'completed' })).success).toBe(true);
    expect(EpicRunSchema.safeParse({ ...validRun(), status: 'succeeded' }).success).toBe(false);
  });

  it('rejects duplicate stage ids within the same run', () => {
    const bad = validRun({
      stages: [
        { id: 'build', status: 'active', autonomy: 'guide', actions: [] },
        { id: 'build', status: 'pending', autonomy: 'guide', actions: [] },
      ],
    });
    expect(EpicRunSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a runId that does not match the RunId convention', () => {
    const bad = { ...validRun(), id: 'not-a-run-id' };
    expect(EpicRunSchema.safeParse(bad).success).toBe(false);
  });
});

describe('EpicRun — backward compatibility', () => {
  it('parses an older payload missing completedAt (added as an optional field)', () => {
    const legacy: Record<string, unknown> = { ...validRun() };
    delete legacy.completedAt;
    const parsed = parseEpicRun(legacy);
    expect(parsed.completedAt).toBeUndefined();
  });
});

describe('RunEvent — parse/serialize round-trip', () => {
  it('round-trips through JSON unchanged, matching the design doc §11 example shape', () => {
    const original = validEvent();
    const parsed = parseRunEvent(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
    expect(parsed.from).toBe('running');
    expect(parsed.to).toBe('validating'); // a transient execution phase, not a member of the closed EpicStatus/StageStatus/ActionStatus enums
  });

  it('id is traceable back to its run and epic', () => {
    const event = validEvent();
    expect(event.id).toBe('EPIC-001--run-001--evt-0001');
  });

  it('rejects an event whose id does not belong to a run id at all', () => {
    const bad = { ...validEvent(), id: 'not-an-event-id' };
    expect(RunEventSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a command that is not a dotted lowercase command name', () => {
    const bad = { ...validEvent(), command: 'Aidlc.Action.Execute' };
    expect(RunEventSchema.safeParse(bad).success).toBe(false);
  });
});

describe('RunEvent — backward compatibility (new optional field does not break an older payload)', () => {
  it('parses an older event missing stageId/actionId/from/to/detail (all optional)', () => {
    const legacy: Record<string, unknown> = { ...validEvent() };
    delete legacy.stageId;
    delete legacy.actionId;
    delete legacy.from;
    delete legacy.to;
    delete legacy.detail;

    const parsed = parseRunEvent(legacy);
    expect(parsed.stageId).toBeUndefined();
    expect(parsed.actionId).toBeUndefined();
    expect(parsed.from).toBeUndefined();
    expect(parsed.to).toBeUndefined();
    expect(parsed.evidence).toHaveLength(2);
  });

  it('parses an older event with no evidence at all (evidence defaults to [])', () => {
    const legacy: Record<string, unknown> = { ...validEvent() };
    delete legacy.evidence;
    const parsed = parseRunEvent(legacy);
    expect(parsed.evidence).toEqual([]);
  });
});
