import { describe, it, expect } from 'vitest';

import {
  ErrorCodeSchema,
  CORE_ERROR_CODES,
  RecoveryActionSchema,
  RECOVERY_ACTION_KINDS,
  AidlcErrorSchema,
  type AidlcError,
} from '../src/contracts/errors';

function sampleError(overrides: Partial<AidlcError> = {}): AidlcError {
  return {
    code: 'epic.invalid_transition',
    summary: 'Cannot move Epic EPIC-001 from draft to completed.',
    detail: 'Valid transitions from draft are: ready.',
    recoveryActions: [
      { kind: 'ask-user', label: 'Choose a valid next status' },
      { kind: 'retry', label: 'Retry', command: 'epic.transition' },
    ],
    at: '2026-08-09T10:00:00.000Z',
    ...overrides,
  };
}

describe('ErrorCode', () => {
  it('accepts dotted lowercase codes, including every CORE_ERROR_CODES entry', () => {
    for (const code of Object.values(CORE_ERROR_CODES)) {
      expect(ErrorCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('rejects a code with no dot or with uppercase letters', () => {
    expect(ErrorCodeSchema.safeParse('epicnotfound').success).toBe(false);
    expect(ErrorCodeSchema.safeParse('Epic.NotFound').success).toBe(false);
  });
});

describe('RecoveryAction — structured recovery, never a raw exception (design doc §8.2)', () => {
  it('covers every documented recovery kind (Retry, Apply fix, Open diff, Change policy, Skip with reason, ...)', () => {
    expect(RECOVERY_ACTION_KINDS).toEqual([
      'retry',
      'apply-fix',
      'open-diff',
      'change-policy',
      'skip-with-reason',
      'ask-user',
      'refresh-context',
      'escalate',
    ]);
  });

  it('round-trips through JSON unchanged', () => {
    const original = { kind: 'skip-with-reason' as const, label: 'Skip with reason', requiresReason: true };
    expect(RecoveryActionSchema.parse(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });
});

describe('AidlcError — parse/serialize round-trip', () => {
  it('round-trips through JSON unchanged', () => {
    const original = sampleError();
    const parsed = AidlcErrorSchema.parse(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });

  it('always carries code + summary + recoveryActions, never just a message', () => {
    const parsed = AidlcErrorSchema.parse(sampleError());
    expect(parsed.code).toBeTruthy();
    expect(parsed.summary).toBeTruthy();
    expect(Array.isArray(parsed.recoveryActions)).toBe(true);
  });
});

describe('AidlcError — backward compatibility (new optional field does not break an older payload)', () => {
  it('parses an older payload missing detail (optional) and recoveryActions (defaults to [])', () => {
    const legacy: Record<string, unknown> = { ...sampleError() };
    delete legacy.detail;
    delete legacy.recoveryActions;

    const parsed = AidlcErrorSchema.parse(legacy);
    expect(parsed.detail).toBeUndefined();
    expect(parsed.recoveryActions).toEqual([]);
  });
});
