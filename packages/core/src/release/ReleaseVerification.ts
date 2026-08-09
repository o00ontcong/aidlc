/**
 * Release-facing verification primitives.
 *
 * These helpers deliberately do not execute commands, send network requests,
 * or mutate an Epic. They make the safety and readiness assertions available
 * to the CLI, Extension, and a future release command without duplicating
 * policy logic in those hosts.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  createDefaultAutonomyPolicy,
  type ArtifactPolicy,
  type AutonomyPolicy,
} from '../contracts';
import {
  AutonomyController,
  EXTERNAL_COMMUNICATION_KINDS,
  planRecovery,
  type ExternalCommunicationKind,
  type GateSubject,
} from '../autonomy/AutonomyController';

export type VerificationSeverity = 'info' | 'warning' | 'error';

export interface VerificationCheck {
  id: string;
  ok: boolean;
  severity: VerificationSeverity;
  summary: string;
  detail?: string;
  recovery?: string;
}

export interface ExternalCommunicationMatrixEntry {
  kind: ExternalCommunicationKind;
  requiresApproval: boolean;
  hard: boolean;
  previewFields: Array<'destination' | 'contentSummary' | 'mutationScope'>;
}

/**
 * Exhaustive matrix used by release tests and UI diagnostics. The controller
 * is still the enforcement point; this makes coverage regression visible.
 */
export function verifyExternalCommunicationMatrix(
  policy: AutonomyPolicy = createDefaultAutonomyPolicy(),
): ExternalCommunicationMatrixEntry[] {
  const controller = new AutonomyController();
  return EXTERNAL_COMMUNICATION_KINDS.map((kind) => {
    const result = controller.evaluate(policy, 'unattended', {
      mutation: true,
      externalCommunication: kind,
      destination: `verification://${kind}`,
      contentSummary: `Release verification for ${kind}`,
      mutationScope: ['external destination'],
    });
    return {
      kind,
      requiresApproval: result.requiresApproval,
      hard: result.hard,
      previewFields: ['destination', 'contentSummary', 'mutationScope'],
    };
  });
}

/** A concise release check proving unattended runs cannot escape hard gates. */
export function verifyUnattendedExternalGate(policy: AutonomyPolicy = createDefaultAutonomyPolicy()): VerificationCheck {
  const matrix = verifyExternalCommunicationMatrix(policy);
  const missing = matrix.filter((entry) => !entry.requiresApproval || !entry.hard).map((entry) => entry.kind);
  return missing.length === 0
    ? { id: 'policy.external-communication', ok: true, severity: 'info', summary: 'All external communication types require human approval in unattended mode.' }
    : {
      id: 'policy.external-communication', ok: false, severity: 'error', summary: 'An external communication type can bypass approval.',
      detail: missing.join(', '), recovery: 'Restore external_communication as an always-enforced hard gate.',
    };
}

/** Checks destructive and default-branch operations use a gate preview. */
export function verifyMutationGates(policy: AutonomyPolicy = createDefaultAutonomyPolicy()): VerificationCheck[] {
  const controller = new AutonomyController();
  const subjects: Array<[string, GateSubject]> = [
    ['policy.destructive-change', { destructive: true, mutation: true, contentSummary: 'Delete generated state', mutationScope: ['.aidlc/epics/EPIC-1'] }],
    ['policy.merge-default-branch', { mergeDefaultBranch: true, mutation: true, contentSummary: 'Merge to main', mutationScope: ['refs/heads/main'] }],
  ];
  return subjects.map(([id, subject]) => {
    const result = controller.evaluate(policy, 'unattended', subject);
    const ok = Boolean(result.preview) && result.requiresApproval;
    return {
      id,
      ok,
      severity: ok ? 'info' : 'error',
      summary: ok ? `${result.gate} has an approval preview.` : `${result.gate} is not protected by an approval preview.`,
      recovery: ok ? undefined : 'Configure the gate to require approval before unattended mutation.',
    };
  });
}

const SECRET_KEY = /(?:token|secret|password|api[_-]?key|authorization|credential)/i;
const SECRET_VALUE = /(?:(?:api[_-]?key|token|secret|password|authorization|credential)\s*[:=]\s*["']?[A-Za-z0-9._\/-]{8,}["']?|sk-[A-Za-z0-9_-]{8,}|(?:Bearer\s+)[A-Za-z0-9._-]{8,}|(?:ghp|github_pat|xox[baprs])[_A-Za-z0-9-]{8,})/gi;

/** Redacts common credentials recursively before an event/evidence/log is persisted. */
export function redactSecrets<T>(value: T): T {
  if (typeof value === 'string') return value.replace(SECRET_VALUE, '[REDACTED]') as T;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item)) as T;
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SECRET_KEY.test(key) ? '[REDACTED]' : redactSecrets(nested);
    }
    return output as T;
  }
  return value;
}

function contained(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/**
 * Rejects traversal and symlink escapes. Missing leaf paths are allowed, but
 * every existing ancestor is lstat'ed so a future write cannot be redirected
 * through a symlink outside the workspace.
 */
export function verifyWorkspacePath(workspaceRoot: string, candidate: string): VerificationCheck {
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(root, candidate);
  if (!contained(root, target)) {
    return { id: 'security.path-containment', ok: false, severity: 'error', summary: 'Path escapes the workspace.', detail: candidate, recovery: 'Use a workspace-relative path without .. segments.' };
  }
  const rootPhysical = fs.existsSync(root) ? fs.realpathSync(root) : root;
  let cursor = root;
  const segments = path.relative(root, target).split(path.sep).filter(Boolean);
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    if (!fs.existsSync(cursor)) break;
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      const physical = fs.realpathSync(cursor);
      if (!contained(rootPhysical, physical)) {
        return { id: 'security.path-symlink', ok: false, severity: 'error', summary: 'Path enters a symlink outside the workspace.', detail: candidate, recovery: 'Replace the symlink with a workspace-local directory or choose another path.' };
      }
    }
  }
  return { id: 'security.path-containment', ok: true, severity: 'info', summary: 'Path remains inside the workspace.', detail: candidate };
}

export interface ParallelArtifactTarget { subrunId: string; path: string; }

/** Parallel Build subruns must own disjoint mutable artifact paths. */
export function verifyParallelArtifactIsolation(targets: ParallelArtifactTarget[]): VerificationCheck {
  const owners = new Map<string, string>();
  const collisions: string[] = [];
  for (const target of targets) {
    const normalized = path.posix.normalize(target.path.replace(/\\/g, '/'));
    const owner = owners.get(normalized);
    if (owner && owner !== target.subrunId) collisions.push(`${normalized} (${owner}, ${target.subrunId})`);
    owners.set(normalized, target.subrunId);
  }
  return collisions.length === 0
    ? { id: 'concurrency.parallel-artifacts', ok: true, severity: 'info', summary: 'Parallel subruns have isolated mutable artifact paths.' }
    : { id: 'concurrency.parallel-artifacts', ok: false, severity: 'error', summary: 'Parallel subruns share mutable artifact paths.', detail: collisions.join('; '), recovery: 'Give each Build subrun a distinct artifact path or serialize the write.' };
}

/** Verifies recovery becomes a human escalation exactly at the retry budget. */
export function verifyRetryBudget(policy: AutonomyPolicy): VerificationCheck {
  const beforeLimit = planRecovery(policy, 'execution-failure', Math.max(0, policy.recovery.maxAttempts - 1));
  const atLimit = planRecovery(policy, 'execution-failure', policy.recovery.maxAttempts);
  const ok = beforeLimit.retry && !atLimit.retry && atLimit.actions.some((action) => action.kind === 'escalate');
  return {
    id: 'policy.retry-budget', ok, severity: ok ? 'info' : 'error',
    summary: ok ? 'Unattended recovery has a bounded retry budget.' : 'Recovery can retry beyond its configured budget.',
    recovery: ok ? undefined : 'Set a positive maxAttempts and escalate once the budget is exhausted.',
  };
}

/** Ensures the safe default remains runtime-only and never auto-commits. */
export function verifyArtifactDefaultPolicy(policy: ArtifactPolicy): VerificationCheck {
  const ok = policy.defaults.persist === 'runtime' && policy.defaults.commit === false;
  return {
    id: 'policy.artifact-defaults', ok, severity: ok ? 'info' : 'error',
    summary: ok ? 'Default artifacts stay runtime-only and uncommitted.' : 'Default artifact lifecycle can commit or persist project files unexpectedly.',
    recovery: ok ? undefined : 'Set defaults.persist to runtime and defaults.commit to false.',
  };
}

/**
 * Provider subprocesses receive only their explicitly approved environment
 * variables. Callers should use this output instead of forwarding process.env.
 */
export function isolateProviderEnvironment(environment: Record<string, string | undefined>, allowedNames: readonly string[]): Record<string, string> {
  const allowed = new Set(allowedNames);
  const isolated: Record<string, string> = {};
  for (const [name, value] of Object.entries(environment)) if (allowed.has(name) && value !== undefined) isolated[name] = value;
  return isolated;
}

/** A small cancellation registry ensures all owned AbortControllers are released. */
export class RunCancellationRegistry {
  private readonly controllers = new Map<string, AbortController>();

  begin(id: string): AbortSignal {
    if (this.controllers.has(id)) throw new Error(`Run ${id} already has a registered process.`);
    const controller = new AbortController();
    this.controllers.set(id, controller);
    return controller.signal;
  }

  cancel(id: string, reason = 'Cancelled by user'): boolean {
    const controller = this.controllers.get(id);
    if (!controller) return false;
    controller.abort(new Error(reason));
    this.controllers.delete(id);
    return true;
  }

  finish(id: string): void { this.controllers.delete(id); }
  activeIds(): string[] { return [...this.controllers.keys()].sort(); }
}

export interface BenchmarkResult { elapsedMs: number; withinBudget: boolean; value?: unknown; error?: string; }

/** Measures a read-only analysis callback without prescribing its implementation. */
export async function benchmarkNonBlocking<T>(operation: () => Promise<T> | T, budgetMs: number): Promise<BenchmarkResult> {
  const started = performance.now();
  try {
    const value = await operation();
    const elapsedMs = performance.now() - started;
    return { elapsedMs, withinBudget: elapsedMs <= budgetMs, value };
  } catch (error) {
    const elapsedMs = performance.now() - started;
    return { elapsedMs, withinBudget: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Aggregates the release policy checks that can run without a host adapter. */
export function verifyCoreReleasePolicy(policy: AutonomyPolicy, artifacts?: ArtifactPolicy): VerificationCheck[] {
  const checks = [
    verifyUnattendedExternalGate(policy),
    ...verifyMutationGates(policy),
    verifyRetryBudget(policy),
  ];
  if (artifacts) checks.push(verifyArtifactDefaultPolicy(artifacts));
  return checks;
}
