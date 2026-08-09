import { describe, it, expect } from 'vitest';

import {
  EPIC_ID_PATTERN,
  RUN_ID_PATTERN,
  EVENT_ID_PATTERN,
  isEpicId,
  toEpicId,
  isRunId,
  toRunId,
  formatRunId,
  epicIdOfRun,
  isEventId,
  toEventId,
  formatEventId,
  runIdOfEvent,
  EpicIdSchema,
  RunIdSchema,
  EventIdSchema,
} from '../src/contracts/ids';

describe('EpicId', () => {
  it('accepts the design doc examples', () => {
    expect(isEpicId('EPIC-001')).toBe(true);
    expect(isEpicId('EPIC-2100')).toBe(true);
    expect(isEpicId('EPIC-ADD-PORTFOLIO-ALERTS')).toBe(true);
  });

  it('rejects malformed ids', () => {
    expect(isEpicId('epic-001')).toBe(false); // lowercase prefix
    expect(isEpicId('EPIC_001')).toBe(false); // underscore, not dash
    expect(isEpicId('EPIC-')).toBe(false); // empty segment
    expect(isEpicId('EPIC')).toBe(false); // no id body
    expect(isEpicId('WORK-001')).toBe(false); // wrong prefix — Epic terminology must be kept (design doc §0.6)
  });

  it('toEpicId throws on a malformed value, and matches the exported pattern', () => {
    expect(() => toEpicId('not-an-epic')).toThrow(/Invalid EpicId/);
    expect(EPIC_ID_PATTERN.test('EPIC-001')).toBe(true);
  });

  it('EpicIdSchema parses a valid id and rejects an invalid one', () => {
    expect(EpicIdSchema.parse('EPIC-042')).toBe('EPIC-042');
    expect(EpicIdSchema.safeParse('bogus').success).toBe(false);
  });
});

describe('RunId', () => {
  it('formatRunId builds a run id that stays valid and traceable to its Epic', () => {
    const epicId = toEpicId('EPIC-001');
    const runId = formatRunId(epicId, 1);
    expect(runId).toBe('EPIC-001--run-001');
    expect(isRunId(runId)).toBe(true);
    expect(RUN_ID_PATTERN.test(runId)).toBe(true);
    expect(epicIdOfRun(runId)).toBe('EPIC-001');
  });

  it('rejects a non-positive or non-integer sequence', () => {
    const epicId = toEpicId('EPIC-001');
    expect(() => formatRunId(epicId, 0)).toThrow();
    expect(() => formatRunId(epicId, -1)).toThrow();
    expect(() => formatRunId(epicId, 1.5)).toThrow();
  });

  it('RunIdSchema round-trips through toRunId', () => {
    const parsed = RunIdSchema.parse('EPIC-2100--run-007');
    expect(parsed).toBe('EPIC-2100--run-007');
    expect(() => toRunId('EPIC-2100')).toThrow(/Invalid RunId/);
  });
});

describe('EventId', () => {
  it('formatEventId builds an event id traceable to its Run and Epic', () => {
    const epicId = toEpicId('EPIC-001');
    const runId = formatRunId(epicId, 1);
    const eventId = formatEventId(runId, 1);
    expect(eventId).toBe('EPIC-001--run-001--evt-0001');
    expect(isEventId(eventId)).toBe(true);
    expect(EVENT_ID_PATTERN.test(eventId)).toBe(true);
    expect(runIdOfEvent(eventId)).toBe(runId);
  });

  it('EventIdSchema rejects a value missing the evt segment', () => {
    expect(EventIdSchema.safeParse('EPIC-001--run-001').success).toBe(false);
    expect(() => toEventId('EPIC-001--run-001')).toThrow(/Invalid EventId/);
  });
});
