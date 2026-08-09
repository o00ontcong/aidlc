import { describe, it, expect } from 'vitest';

import {
  AutonomyPolicySchema,
  createDefaultAutonomyPolicy,
  parseAutonomyPolicy,
  resolveGatePolicy,
  isGateBypassableInMode,
  isHardGate,
  effectiveAutonomyMode,
  HARD_GATE_KINDS,
  AUTONOMY_MODES,
  type AutonomyPolicy,
} from '../src/contracts/autonomy';

function validPolicy(overrides: Partial<AutonomyPolicy> = {}): AutonomyPolicy {
  return {
    schemaVersion: 1,
    default: 'guide',
    stages: { build: 'unattended', plan: 'assist' },
    gates: {
      destructive_changes: 'always',
      dependency_changes: 'risk-based',
      external_communication: 'always',
      merge_default_branch: 'always',
    },
    recovery: { maxAttempts: 3, onValidationFailure: 'repair-and-retry', onAmbiguousRequirement: 'ask' },
    ...overrides,
  };
}

describe('AutonomyPolicy — product decision: new projects default to guide (design doc §0.1)', () => {
  it('createDefaultAutonomyPolicy() always starts at guide', () => {
    const policy = createDefaultAutonomyPolicy();
    expect(policy.default).toBe('guide');
    expect(policy.stages).toEqual({});
    expect(policy.gates).toEqual({ destructive_changes: 'always', merge_default_branch: 'always', external_communication: 'always' });
  });

  it('guide is a member of AUTONOMY_MODES exactly as guide|assist|auto|unattended (design doc §4)', () => {
    expect(AUTONOMY_MODES).toEqual(['guide', 'assist', 'auto', 'unattended']);
  });
});

describe('AutonomyPolicy — parse/serialize round-trip', () => {
  it('round-trips through JSON unchanged', () => {
    const original = validPolicy();
    const json = JSON.parse(JSON.stringify(original));
    const parsed = parseAutonomyPolicy(json);
    expect(parsed).toEqual(original);
  });

  it('rejects an unknown stage override key', () => {
    const bad = { ...validPolicy(), stages: { ...validPolicy().stages, bogus_stage: 'auto' } };
    expect(AutonomyPolicySchema.safeParse(bad).success).toBe(false);
  });
});

describe('AutonomyPolicy — backward compatibility (new optional field does not break an older payload)', () => {
  it('accepts the user-facing snake_case YAML shape from the redesign contract', () => {
    const parsed = parseAutonomyPolicy({
      default: 'assist', stages: { build: 'auto' }, gates: { external_communication: 'always' },
      recovery: { max_attempts: 2, on_validation_failure: 'repair-and-retry', on_ambiguous_requirement: 'ask' },
    });
    expect(parsed).toMatchObject({ schemaVersion: 1, default: 'assist', stages: { build: 'auto' }, recovery: { maxAttempts: 2, onValidationFailure: 'repair-and-retry' } });
  });
  it('parses a minimal older payload that predates stages/gates overrides entirely', () => {
    // Simulates a payload written before `stages`/`gates` existed on disk —
    // both are optional-with-default on the schema, so an old file with
    // only `schemaVersion`/`default`/`recovery` must still parse.
    const legacyMinimal = {
      schemaVersion: 1,
      default: 'guide',
      recovery: { maxAttempts: 3, onValidationFailure: 'ask', onAmbiguousRequirement: 'ask' },
    };
    const parsed = parseAutonomyPolicy(legacyMinimal);
    expect(parsed.stages).toEqual({});
    expect(parsed.gates).toEqual({});
  });

  it('parses an older payload missing the `recovery` sub-fields (recovery itself present but bare)', () => {
    const legacy = { schemaVersion: 1, default: 'guide', recovery: {} };
    const parsed = parseAutonomyPolicy(legacy);
    expect(parsed.recovery.maxAttempts).toBe(3);
    expect(parsed.recovery.onValidationFailure).toBe('ask');
    expect(parsed.recovery.onAmbiguousRequirement).toBe('ask');
  });
});

describe('AutonomyPolicy — non-bypassable safety gates (design doc §0.7, §4; TODO acceptance matrix)', () => {
  it('declares destructive, default-branch merge, and external communication as hard gates', () => {
    expect(HARD_GATE_KINDS).toEqual(['destructive_changes', 'merge_default_branch', 'external_communication']);
    expect(isHardGate('external_communication')).toBe(true);
    expect(isHardGate('destructive_changes')).toBe(true);
  });

  it('AutonomyPolicySchema REJECTS a config that weakens external_communication below always', () => {
    const weakened = validPolicy({ gates: { ...validPolicy().gates, external_communication: 'risk-based' } });
    const result = AutonomyPolicySchema.safeParse(weakened);
    expect(result.success).toBe(false);

    const disabled = validPolicy({ gates: { ...validPolicy().gates, external_communication: 'never' } });
    expect(AutonomyPolicySchema.safeParse(disabled).success).toBe(false);
  });

  it('AutonomyPolicySchema accepts external_communication omitted entirely (hard default applies)', () => {
    const { external_communication, ...rest } = validPolicy().gates;
    const withoutKey = validPolicy({ gates: rest });
    expect(AutonomyPolicySchema.safeParse(withoutKey).success).toBe(true);
  });

  it('resolveGatePolicy forces always+hard for external_communication regardless of what a hand-built (unvalidated) policy object claims', () => {
    // Bypasses the schema entirely — simulates defensive-programming code
    // that built an AutonomyPolicy object by hand instead of parsing it.
    const handBuilt: Pick<AutonomyPolicy, 'gates'> = { gates: { external_communication: 'never' } };
    const resolved = resolveGatePolicy(handBuilt, 'external_communication');
    expect(resolved.enforcement).toBe('always');
    expect(resolved.hard).toBe(true);
  });

  it.each(AUTONOMY_MODES)(
    'isGateBypassableInMode(external_communication) is false in %s mode — unattended cannot bypass it either',
    (mode) => {
      const policy = validPolicy();
      expect(isGateBypassableInMode(policy, 'external_communication', mode)).toBe(false);
    },
  );

  it('a non-hard, risk-based gate IS eligible to bypass in auto/unattended but not guide/assist', () => {
    const policy = validPolicy(); // dependency_changes: risk-based
    expect(isGateBypassableInMode(policy, 'dependency_changes', 'guide')).toBe(false);
    expect(isGateBypassableInMode(policy, 'dependency_changes', 'assist')).toBe(false);
    expect(isGateBypassableInMode(policy, 'dependency_changes', 'auto')).toBe(true);
    expect(isGateBypassableInMode(policy, 'dependency_changes', 'unattended')).toBe(true);
  });

  it('a gate explicitly configured to always never bypasses, in any mode', () => {
    const policy = validPolicy(); // destructive_changes: always
    for (const mode of AUTONOMY_MODES) {
      expect(isGateBypassableInMode(policy, 'destructive_changes', mode)).toBe(false);
    }
  });
});

describe('effectiveAutonomyMode', () => {
  it('uses the stage override when present, else falls back to default', () => {
    const policy = validPolicy(); // default: guide, stages.build: unattended
    expect(effectiveAutonomyMode(policy, 'build')).toBe('unattended');
    expect(effectiveAutonomyMode(policy, 'ship')).toBe('guide');
  });

  it('switching a stage override does not require touching schemaVersion or any other field (mode changes mid-run without state migration, TODO W1C)', () => {
    const before = validPolicy();
    const after: AutonomyPolicy = { ...before, stages: { ...before.stages, ship: 'auto' } };
    expect(after.schemaVersion).toBe(before.schemaVersion);
    expect(effectiveAutonomyMode(after, 'ship')).toBe('auto');
  });
});
