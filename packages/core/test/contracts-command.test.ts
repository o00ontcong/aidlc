import { describe, it, expect } from 'vitest';

import {
  ApplicationCommandEnvelopeSchema,
  parseApplicationCommand,
  CommandResultEnvelopeSchema,
  parseCommandResult,
  type ApplicationCommand,
  type CommandResult,
} from '../src/contracts/command';

function validCommand(overrides: Partial<ApplicationCommand> = {}): ApplicationCommand {
  return {
    schemaVersion: 1,
    id: 'cmd-0001',
    name: 'epic.start',
    issuedAt: '2026-08-09T10:00:00.000Z',
    actor: { kind: 'user', id: 'cong@silvertiger.ae' },
    payload: { title: 'Add portfolio risk alerts' },
    ...overrides,
  };
}

function validResult(overrides: Partial<CommandResult> = {}): CommandResult {
  return {
    schemaVersion: 1,
    commandId: 'cmd-0001',
    status: 'ok',
    data: { epicId: 'EPIC-001' },
    nextAction: { summary: 'Review the generated plan', command: 'epic.review' },
    evidence: [{ kind: 'file', ref: 'docs/epics/EPIC-001/plan.md' }],
    warnings: [],
    recoveryActions: [],
    ...overrides,
  };
}

describe('ApplicationCommand — parse/serialize round-trip', () => {
  it('round-trips through JSON unchanged', () => {
    const original = validCommand();
    const parsed = parseApplicationCommand(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });

  it('rejects a non-dotted command name', () => {
    const bad = { ...validCommand(), name: 'startEpic' };
    expect(ApplicationCommandEnvelopeSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts any payload shape — payload validation belongs to the concrete command, not this envelope', () => {
    expect(ApplicationCommandEnvelopeSchema.safeParse(validCommand({ payload: 42 })).success).toBe(true);
    expect(ApplicationCommandEnvelopeSchema.safeParse(validCommand({ payload: null })).success).toBe(true);
  });
});

describe('CommandResult — parse/serialize round-trip', () => {
  it('round-trips through JSON unchanged', () => {
    const original = validResult();
    const parsed = parseCommandResult(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });

  it('every command result status matches design doc §5 ("status, nextAction, evidence, warnings, recoveryActions")', () => {
    for (const status of ['ok', 'waiting-for-user', 'blocked', 'error'] as const) {
      expect(CommandResultEnvelopeSchema.safeParse(validResult({ status })).success).toBe(true);
    }
  });

  it('an error result carries a structured AidlcError, not a raw exception', () => {
    const errorResult = validResult({
      status: 'error',
      error: {
        code: 'epic.not_found',
        summary: 'Epic EPIC-999 does not exist.',
        recoveryActions: [{ kind: 'ask-user', label: 'Check the Epic id' }],
        at: '2026-08-09T10:01:00.000Z',
      },
    });
    const parsed = CommandResultEnvelopeSchema.parse(errorResult);
    expect(parsed.error?.code).toBe('epic.not_found');
    expect(parsed.error?.recoveryActions).toHaveLength(1);
  });
});

describe('CommandResult — backward compatibility (new optional field does not break an older payload)', () => {
  it('parses an older payload missing data/nextAction/error (all optional)', () => {
    const legacy: Record<string, unknown> = { ...validResult() };
    delete legacy.data;
    delete legacy.nextAction;
    delete legacy.error;

    const parsed = parseCommandResult(legacy);
    expect(parsed.data).toBeUndefined();
    expect(parsed.nextAction).toBeUndefined();
    expect(parsed.error).toBeUndefined();
  });

  it('parses an older payload missing evidence/warnings/recoveryActions entirely (all default to [])', () => {
    const legacy: Record<string, unknown> = { ...validResult() };
    delete legacy.evidence;
    delete legacy.warnings;
    delete legacy.recoveryActions;

    const parsed = parseCommandResult(legacy);
    expect(parsed.evidence).toEqual([]);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.recoveryActions).toEqual([]);
  });
});
