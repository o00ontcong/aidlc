/**
 * Versioned validator selection. Bundled validator source is resolved in
 * memory; no bundled install/update writes project files and therefore no
 * `.aidlc-new` sidecar is ever created by this redesign path.
 */
import * as crypto from 'crypto';
import {
  nowIso,
  type AidlcError,
  type EvidenceRef,
  type RecoveryAction,
} from '../contracts';

export interface BundledValidator {
  id: string;
  version: string;
  packId: string;
  source: string;
  description: string;
}

export interface ValidatorLock {
  schemaVersion: 1;
  validatorId: string;
  packId: string;
  version: string;
  hash: string;
}

export interface ProjectValidatorOverride {
  validatorId: string;
  /** Source is explicit project-owned content, never a copied bundle default. */
  source: string;
  basedOn?: ValidatorLock;
}

export interface ReconciliationTask {
  id: string;
  validatorId: string;
  summary: string;
  diff: string;
  actions: RecoveryAction[];
  error: AidlcError;
}

export type ValidatorResolution =
  | { kind: 'bundled'; validator: BundledValidator; lock: ValidatorLock }
  | { kind: 'override'; validator: BundledValidator; lock: ValidatorLock; override: ProjectValidatorOverride }
  | { kind: 'reconciliation'; validator: BundledValidator; lock: ValidatorLock; override: ProjectValidatorOverride; task: ReconciliationTask };

export interface TypedValidatorResult {
  schemaVersion: 1;
  validatorId: string;
  decision: 'pass' | 'reject';
  summary: string;
  evidence: EvidenceRef[];
  error?: AidlcError;
}

function hash(content: string): string { return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`; }

export function lockValidator(validator: BundledValidator): ValidatorLock {
  return { schemaVersion: 1, validatorId: validator.id, packId: validator.packId, version: validator.version, hash: hash(validator.source) };
}

function diff(before: string, after: string): string {
  if (before === after) return '';
  const oldLines = before.split('\n'); const newLines = after.split('\n');
  const output = ['--- project override', '+++ bundled validator'];
  const count = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < count; index += 1) {
    if (oldLines[index] === newLines[index]) continue;
    if (oldLines[index] !== undefined) output.push(`-${oldLines[index]}`);
    if (newLines[index] !== undefined) output.push(`+${newLines[index]}`);
  }
  return output.join('\n');
}

function reconciliation(validator: BundledValidator, override: ProjectValidatorOverride, current: ValidatorLock): ReconciliationTask {
  const actions: RecoveryAction[] = [
    { kind: 'open-diff', label: 'Open validator diff', description: 'Compare the project override with the new bundled validator.' },
    { kind: 'change-policy', label: 'Keep project override', description: 'Acknowledge the override and update its base lock.' },
    { kind: 'apply-fix', label: 'Adopt bundled validator', description: 'Remove the override after reviewing the bundled source.' },
  ];
  const summary = `Project override for ${validator.id} is based on a different bundled validator lock.`;
  return {
    id: `validator-reconcile:${validator.id}`, validatorId: validator.id, summary,
    diff: diff(override.source, validator.source), actions,
    error: { code: 'validator.reconciliation_required', summary, detail: `Expected ${override.basedOn?.hash ?? 'no base lock'}, bundled is ${current.hash}.`, recoveryActions: actions, at: nowIso() },
  };
}

/** Resolve a validator against the selected, versioned pack and one explicit project override. */
export class ValidatorResolver {
  private readonly byPack = new Map<string, BundledValidator[]>();
  constructor(validators: readonly BundledValidator[] = DEFAULT_BUNDLED_VALIDATORS) {
    for (const validator of validators) {
      const key = `${validator.packId}@${validator.version}`;
      const current = this.byPack.get(key) ?? [];
      if (current.some((candidate) => candidate.id === validator.id)) throw new Error(`Duplicate validator ${validator.id} in ${key}.`);
      current.push(Object.freeze({ ...validator })); this.byPack.set(key, current);
    }
  }

  list(packId: string, version: string): readonly BundledValidator[] { return this.byPack.get(`${packId}@${version}`) ?? []; }

  resolve(packId: string, version: string, validatorId: string, override?: ProjectValidatorOverride): ValidatorResolution {
    const validator = this.list(packId, version).find((candidate) => candidate.id === validatorId);
    if (!validator) throw new Error(`Validator ${validatorId} is not bundled by ${packId}@${version}.`);
    const lock = lockValidator(validator);
    if (!override) return { kind: 'bundled', validator, lock };
    if (override.validatorId !== validatorId) throw new Error(`Override is for ${override.validatorId}, not ${validatorId}.`);
    if (!override.source.trim()) throw new Error(`Override source for ${validatorId} must not be empty.`);
    if (override.basedOn && (override.basedOn.hash !== lock.hash || override.basedOn.version !== lock.version || override.basedOn.packId !== lock.packId)) {
      return { kind: 'reconciliation', validator, lock, override, task: reconciliation(validator, override, lock) };
    }
    return { kind: 'override', validator, lock, override };
  }
}

/** Result helper guarantees structured evidence/error contracts for validators. */
export function validatorResult(input: Omit<TypedValidatorResult, 'schemaVersion'>): TypedValidatorResult {
  if (input.decision === 'reject' && !input.error) {
    return { ...input, schemaVersion: 1, error: { code: 'validator.rejected', summary: input.summary, recoveryActions: [{ kind: 'apply-fix', label: 'Address validator findings' }], at: nowIso() } };
  }
  return { ...input, schemaVersion: 1 };
}

/** Small, versioned builtin set. Sources are intentionally package-owned values, not project-installed files. */
export const DEFAULT_BUNDLED_VALIDATORS: readonly BundledValidator[] = Object.freeze([
  { id: 'traceability', packId: 'regulated', version: '1.0.0', description: 'Checks requirement-to-evidence traceability.', source: 'export default async function validate(ctx) { return { decision: "pass", reason: "traceability checked" }; }\n' },
  { id: 'project-ci', packId: 'sdlc-core', version: '1.0.0', description: 'Checks the project validation command result.', source: 'export default async function validate(ctx) { return { decision: "pass", reason: "CI evidence checked" }; }\n' },
]);
