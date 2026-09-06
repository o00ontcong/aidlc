/**
 * `ProjectChangeReadModel` — the one shared DTO Project, Discover, Sprint
 * and Epic all render from (Master Rule §0.3; implementation plan §7,
 * §D18). Types only, per this file's module ownership ("DTO dung chung
 * cho cac view", plan §5.1) — the builder that composes a `ProjectChange` +
 * optional `ChangeShape`/Epic status into one of these lives in
 * `change/buildProjectChangeReadModel.ts`, alongside `deriveProjectChangeState`,
 * so this file (like every other file in `contracts/`) stays free of any
 * dependency on the `change/` domain-logic layer.
 *
 * §7 also lists "tab projections (project, discover, sprint, epic)" — but
 * those are explicitly "chi la filter/fields tren cung record", i.e. each
 * tab reads a subset of fields off this same object; there is no separate
 * per-tab shape to define here.
 */

import type { ActorKind } from './common';
import type { ChangeShape, ProjectChange } from './change';
import type { EpicStatus } from './epic';

// ── Warnings ───────────────────────────────────────────────────────

/**
 * Well-known warning codes this read model can carry. Not a closed set —
 * `code` stays a plain string so a later module can add its own (e.g. a
 * future "Shape stale" or "needs-rebase" warning once M4's Context
 * revision comparison exists) without a contract change here.
 */
export const WELL_KNOWN_PROJECT_CHANGE_WARNING_CODES = ['change.problem_missing'] as const;

export const PROJECT_CHANGE_WARNING_SEVERITIES = ['info', 'warning', 'error'] as const;
export type ProjectChangeWarningSeverity = (typeof PROJECT_CHANGE_WARNING_SEVERITIES)[number];

export interface ProjectChangeWarning {
  code: string;
  message: string;
  severity: ProjectChangeWarningSeverity;
}

// ── AvailableAction ────────────────────────────────────────────────

/**
 * The `change.*` command surface (plan §8) that can plausibly apply to a
 * *single* `ProjectChange` record — i.e. every command whose payload starts
 * with `{changeId, ...}`. `context.*`/`sprint.*`/`migration.*` commands
 * operate on a different aggregate and are out of scope for this DTO.
 */
export const CHANGE_COMMAND_NAMES = [
  'change.requirement.update',
  'change.scope.propose',
  'change.scope.feedback',
  'change.explore.start',
  'change.shape.update',
  'change.shape.ready',
  'change.shape.accept',
  'change.shape.reopen',
  'change.shelve',
  'change.reopen',
  'change.cancel',
  'change.split',
  'change.merge',
  'change.epic.start',
  'change.epic.pending.resume',
  'change.epic.pending.rollback',
  'change.context.notrequired',
] as const;
export type ChangeCommandName = (typeof CHANGE_COMMAND_NAMES)[number];

/**
 * One human-meaningful next step (plan §8, §11: "Human so huu decision;
 * AIDLC thuc hien transition co hoc"). Advisory only — per §8, "UI disable
 * button chi la convenience, khong phai security boundary"; the command
 * handler (M2's `ChangeService`) is what actually enforces preconditions.
 */
export interface AvailableAction {
  command: ChangeCommandName;
  label: string;
  requiresActor: ActorKind;
}

// ── Derived lifecycle state vocabulary ─────────────────────────────
//
// The *vocabulary* of possible states is a contract (part of this DTO's
// shape) and lives here; the *derivation function* (the fixed precedence
// rules that pick one) is domain logic and lives in
// `change/deriveProjectChangeState.ts`, which imports this type rather than
// redeclaring it — keeping this file the single source of truth for it.

export const PROJECT_CHANGE_DISPLAY_STATES = [
  'shelved',
  'cancelled',
  'superseded',
  'done',
  'delivered',
  'delivery-review',
  'in-delivery',
  'planned',
  'ready',
  'understanding',
  'captured',
] as const;
export type ProjectChangeDisplayState = (typeof PROJECT_CHANGE_DISPLAY_STATES)[number];

export interface ProjectChangeDerivedState {
  state: ProjectChangeDisplayState;
  /** Stable, machine-readable cause of the derived state — for tests, telemetry and UI copy. */
  reasonCode: string;
  /**
   * Freshness/attention badges (analysis stale, Shape stale, Context
   * Proposal needs-rebase, ...) — advisory only, never consulted to pick
   * `state` (plan §7).
   */
  badges: readonly string[];
}

// ── ProjectChangeReadModel ─────────────────────────────────────────

export interface ProjectChangeReadModel {
  schemaVersion: 1;
  change: ProjectChange;
  shape?: ChangeShape;
  /** Absent until `change.epic.start` links an Epic. */
  epicStatus?: EpicStatus;
  derived: ProjectChangeDerivedState;
  availableActions: AvailableAction[];
  warnings: ProjectChangeWarning[];
}
