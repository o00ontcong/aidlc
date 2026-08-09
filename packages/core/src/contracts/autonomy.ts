/**
 * Autonomy policy, gates and recovery (design doc §4; TODO W1C).
 *
 * Product decisions this file must never let a config (or a hand-built
 * object) silently violate (design doc §0 / TODO §0):
 *
 *   1. A NEW project's default autonomy is `guide` — see
 *      {@link createDefaultAutonomyPolicy}. (An *existing*, already-configured
 *      project may legitimately have moved its `default` off `guide`, so
 *      this is a constructor-time guarantee, not a parse-time one.)
 *   2. `external_communication` is a hard gate, even in `unattended` mode —
 *      enforced *twice*, independently, so neither a malformed config file
 *      nor a hand-built policy object (bypassing the schema) can weaken it:
 *        a) {@link AutonomyPolicySchema} REJECTS a parsed config that sets
 *           `gates.external_communication` to anything other than `always`
 *           (it may be omitted — that just means "use the hard default").
 *        b) {@link resolveGatePolicy} ignores whatever `policy.gates`
 *           contains for a hard gate and always returns `enforcement:
 *           'always'` — this is the actual enforcement point a later
 *           autonomy engine calls, independent of whether the policy object
 *           in hand was ever validated by the schema.
 */

import { z } from 'zod';
import { STAGE_IDS, type StageId } from './stageId';
import { ActorRefSchema, IsoTimestampSchema, parseContract } from './common';

// ── AutonomyMode ───────────────────────────────────────────────────

/**
 * `guide`: no mutation; explains exactly what the user must do and why.
 * `assist`: AI proposes a plan/diff/command; user confirms before mutation.
 * `auto`: runs the stage automatically with retry/validate; stops at a
 * configured gate. `unattended`: runs end-to-end; stops only at a hard
 * safety gate or an unrecoverable blocker (design doc §4).
 */
export const AUTONOMY_MODES = ['guide', 'assist', 'auto', 'unattended'] as const;
export const AutonomyModeSchema = z.enum(AUTONOMY_MODES);
export type AutonomyMode = z.infer<typeof AutonomyModeSchema>;

// ── Gates ──────────────────────────────────────────────────────────

/** Gate kinds named explicitly by the design doc's `.aidlc/autonomy.yaml` example (§4). */
export const WELL_KNOWN_GATE_KINDS = [
  'destructive_changes',
  'dependency_changes',
  'external_communication',
  'merge_default_branch',
] as const;
export type WellKnownGateKind = (typeof WELL_KNOWN_GATE_KINDS)[number];

/**
 * Gate kind — open string (lower_snake_case) so later lanes/packs can add
 * project- or pack-specific gates without a W0 change. Widened with
 * `(string & {})` so editors still autocomplete the well-known literals
 * instead of collapsing the union to plain `string`.
 */
export type GateKind = WellKnownGateKind | (string & {});

export const GATE_KIND_PATTERN = /^[a-z][a-z0-9_]*$/;
export const GateKindSchema = z.string().regex(GATE_KIND_PATTERN, 'Gate kind must be lower_snake_case');

export const GATE_ENFORCEMENTS = ['always', 'risk-based', 'never'] as const;
export const GateEnforcementSchema = z.enum(GATE_ENFORCEMENTS);
export type GateEnforcement = z.infer<typeof GateEnforcementSchema>;

/**
 * Gate kinds that are non-negotiable: no project config and no
 * {@link AutonomyMode} — including `unattended` — can weaken these below
 * `always`. Design doc §0.7 puts exactly one gate here today; additional
 * hard gates can be appended later without a breaking change to
 * `GatePolicy`/`AutonomyPolicy`.
 */
export const HARD_GATE_KINDS: readonly GateKind[] = ['external_communication'];

export function isHardGate(gate: GateKind): boolean {
  return (HARD_GATE_KINDS as readonly string[]).includes(gate);
}

/** Resolved, effective policy for one gate — the shape a later autonomy engine should branch on (rather than reading `AutonomyPolicy.gates` directly). */
export interface GatePolicy {
  gate: GateKind;
  enforcement: GateEnforcement;
  /** True when no config/mode can move `enforcement` off `'always'`. */
  hard: boolean;
}

/**
 * Resolve the effective {@link GatePolicy} for `gate` given `policy`. Hard
 * gates (see {@link HARD_GATE_KINDS}) always resolve to `enforcement:
 * 'always'`, regardless of what `policy.gates` contains — this function,
 * not the schema refinement below, is the actual enforcement point.
 */
export function resolveGatePolicy(policy: Pick<AutonomyPolicy, 'gates'>, gate: GateKind): GatePolicy {
  if (isHardGate(gate)) {
    return { gate, enforcement: 'always', hard: true };
  }
  return { gate, enforcement: policy.gates[gate] ?? 'risk-based', hard: false };
}

/**
 * Can `gate` be skipped without an explicit human {@link GateDecision} while
 * running in `mode`? Hard gates always answer `false`. This is the single
 * predicate a later autonomy engine (W1C) should call before letting
 * `unattended` (or any mode) proceed past a gate without a decision —
 * in particular this is what proves `unattended` cannot bypass
 * `external_communication` (TODO acceptance matrix row "External
 * communication gate").
 */
export function isGateBypassableInMode(
  policy: Pick<AutonomyPolicy, 'gates'>,
  gate: GateKind,
  mode: AutonomyMode,
): boolean {
  const resolved = resolveGatePolicy(policy, gate);
  if (resolved.hard) return false;
  switch (resolved.enforcement) {
    case 'always':
      return false;
    case 'never':
      return true;
    case 'risk-based':
      // Guide/assist never mutate without a human turn anyway. Only the
      // fully-autonomous modes are ever *eligible* to bypass a risk-based
      // gate, and only once a later risk engine actually grants it — the
      // contract layer stays conservative and only says who is eligible,
      // it does not itself grant the bypass.
      return mode === 'auto' || mode === 'unattended';
    default:
      return false;
  }
}

// ── Gate preview / decision ────────────────────────────────────────

/**
 * What the user is shown before a gated mutation proceeds (design doc §4:
 * "he thong luon phai preview noi dung, dich den va cho xac nhan ro rang").
 */
export const GatePreviewSchema = z.object({
  gate: GateKindSchema,
  /** Where this would go — a PR's target repo, an email recipient, a package registry, ... */
  destination: z.string().optional(),
  /** Human-readable preview of what will be sent/communicated/changed. */
  contentSummary: z.string().min(1),
  /** Files/resources/systems this would mutate or reach. */
  mutationScope: z.array(z.string()).default([]),
});
export type GatePreview = z.infer<typeof GatePreviewSchema>;

export const GATE_DECISION_OUTCOMES = ['pending', 'approved', 'rejected'] as const;
export const GateDecisionOutcomeSchema = z.enum(GATE_DECISION_OUTCOMES);
export type GateDecisionOutcome = z.infer<typeof GateDecisionOutcomeSchema>;

/** The record of a human's approve/reject decision on a gate-guarded action. */
export const GateDecisionSchema = z.object({
  gate: GateKindSchema,
  outcome: GateDecisionOutcomeSchema,
  preview: GatePreviewSchema,
  /** Present once `outcome !== 'pending'`. */
  decidedBy: ActorRefSchema.optional(),
  decidedAt: IsoTimestampSchema.optional(),
  reason: z.string().optional(),
});
export type GateDecision = z.infer<typeof GateDecisionSchema>;

// ── Recovery policy ────────────────────────────────────────────────

export const RecoveryPolicySchema = z.object({
  maxAttempts: z.number().int().positive().default(3),
  onValidationFailure: z.enum(['repair-and-retry', 'ask', 'stop']).default('ask'),
  onAmbiguousRequirement: z.enum(['ask', 'stop', 'best-effort']).default('ask'),
});
export type RecoveryPolicy = z.infer<typeof RecoveryPolicySchema>;

// ── AutonomyPolicy (root, durable — .aidlc/autonomy.yaml) ─────────

/**
 * `stages`/`gates` are validated as open string-keyed records (not
 * `z.record` over an enum key — zod v4's enum-keyed records require *every*
 * enum member to be present, which is wrong here: both maps are meant to be
 * sparse overrides) and then refined to check the keys actually seen.
 */
const StageOverridesSchema = z
  .record(z.string(), AutonomyModeSchema)
  .default({})
  .refine((obj) => Object.keys(obj).every((k) => (STAGE_IDS as readonly string[]).includes(k)), {
    message: `stage override keys must be one of: ${STAGE_IDS.join(', ')}`,
  });

const GateOverridesSchema = z
  .record(z.string(), GateEnforcementSchema)
  .default({})
  .refine((obj) => Object.keys(obj).every((k) => GATE_KIND_PATTERN.test(k)), {
    message: 'gate keys must be lower_snake_case',
  });

export const AutonomyPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    /** Effective mode when a stage has no override in `stages`. */
    default: AutonomyModeSchema,
    stages: StageOverridesSchema,
    gates: GateOverridesSchema,
    recovery: RecoveryPolicySchema,
  })
  .refine(
    (policy) => {
      const configured = policy.gates.external_communication;
      return configured === undefined || configured === 'always';
    },
    {
      message:
        'gates.external_communication must be "always" (or omitted) — external communication is a hard gate that unattended mode cannot bypass (design doc §0.7)',
      path: ['gates', 'external_communication'],
    },
  );
export type AutonomyPolicy = z.infer<typeof AutonomyPolicySchema>;

export function parseAutonomyPolicy(raw: unknown): AutonomyPolicy {
  return parseContract(AutonomyPolicySchema, raw, 'AutonomyPolicy');
}

/** A brand-new project's autonomy policy — always starts at `guide` (design doc §0.1), no gate overrides, default recovery policy. */
export function createDefaultAutonomyPolicy(): AutonomyPolicy {
  return {
    schemaVersion: 1,
    default: 'guide',
    stages: {},
    gates: {},
    recovery: { maxAttempts: 3, onValidationFailure: 'ask', onAmbiguousRequirement: 'ask' },
  };
}

/** Effective mode for `stageId` under `policy` — the stage override if set, else `policy.default`. */
export function effectiveAutonomyMode(policy: AutonomyPolicy, stageId: StageId): AutonomyMode {
  return policy.stages[stageId] ?? policy.default;
}
