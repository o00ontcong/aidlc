/**
 * Composes one `ProjectChangeReadModel` (contract in
 * `contracts/projectReadModel.ts`) out of a `ProjectChange`, its optional
 * `ChangeShape`, and its Epic's status if one is linked — the single
 * function Project/Discover/Sprint/Epic all call so none of them derives
 * its own reading of the same Change (Master Rule §0.3, plan §7, §D18).
 *
 * Pure and I/O-free: it does not read `.aidlc/**`, resolve the current
 * Context revision, or evaluate policy. `warnings`/`availableActions` are
 * therefore a first pass over static facts only —
 *   - `warnings` covers exactly the one warning the locked contract names
 *     (`change.problem_missing`, §18.5).
 *   - one badge — `shape.stale` — is computed here too: a Shape pins the
 *     exact Change revision/hash it was based on (`basedOnChange`, §6.2),
 *     so comparing that against the Change's *current* revision/hash needs
 *     no Context module at all (plan §D10 "fail closed" — the whole
 *     content hash is treated as the semantic slice here, deliberately
 *     coarser than the per-entity dependency-closure hashing M4's Context
 *     revisions will use). Context-Proposal-driven freshness
 *     (needs-rebase, ...) *does* need a live Context revision and stays
 *     out of scope until M4; callers surface that via
 *     `deriveProjectChangeState`'s `badges` passthrough, same as before.
 *   - `availableActions` is advisory UI guidance, not authorization — per
 *     §8, "UI disable button chi la convenience, khong phai security
 *     boundary". The real preconditions are enforced by `ChangeService`
 *     (M2)/`ChangeEpicCoordinator` (M3) when a command actually runs; this
 *     list may be a superset of what a given command handler will accept.
 */

import { computeChangeRequirementSliceHash, type ChangeEpicLink, type ChangeShape, type ProjectChange } from '../contracts/change';
import type { EpicStatus } from '../contracts/epic';
import type {
  AvailableAction,
  ChangeCommandName,
  ProjectChangeReadModel,
  ProjectChangeWarning,
} from '../contracts/projectReadModel';
import { deriveProjectChangeState, type ProjectChangeDisplayState } from './deriveProjectChangeState';

export interface BuildProjectChangeReadModelInput {
  change: ProjectChange;
  shape?: ChangeShape;
  /** Absent until `change.epic.start` links an Epic. */
  epicStatus?: EpicStatus;
  /** Passed straight through to `deriveProjectChangeState`'s `badges` — see that function's doc. */
  badges?: readonly string[];
}

function action(command: ChangeCommandName, label: string, requiresActor: AvailableAction['requiresActor'] = 'user'): AvailableAction {
  return { command, label, requiresActor };
}

/**
 * First-pass, advisory next-action list (see module doc). Ordered roughly
 * by how prominently a UI would want to offer them, not by any contract
 * requirement.
 */
function computeAvailableActions(params: {
  change: ProjectChange;
  epicLink: ChangeEpicLink | undefined;
  shapeStatus: ChangeShape['status'] | undefined;
  derivedState: ProjectChangeDisplayState;
}): AvailableAction[] {
  const { change, epicLink, shapeStatus, derivedState } = params;

  if (change.disposition === 'cancelled' || change.disposition === 'superseded') return [];
  if (change.disposition === 'shelved') return [action('change.reopen', 'Reopen')];

  const hasUnreviewedAnalysis =
    change.latestScopeAnalysisId !== undefined &&
    (!change.scopeReview || change.scopeReview.analysisId !== change.latestScopeAnalysisId);

  if (!epicLink) {
    const actions: AvailableAction[] = [
      action('change.requirement.update', 'Edit requirement'),
      action('change.split', 'Split into separate Changes'),
      action('change.merge', 'Merge with an existing Change'),
      action('change.shelve', 'Shelve for later'),
      action('change.cancel', 'Cancel'),
    ];
    if (hasUnreviewedAnalysis) actions.push(action('change.scope.feedback', 'Review scope analysis'));

    if (!shapeStatus) {
      actions.push(action('change.explore.start', 'Explore in Discover'));
    } else if (shapeStatus === 'exploring') {
      actions.push(action('change.shape.update', 'Update Shape'), action('change.shape.ready', 'Mark Shape ready'));
    } else if (shapeStatus === 'ready') {
      actions.push(action('change.shape.update', 'Update Shape'), action('change.shape.accept', 'Accept Shape'));
    } else if (shapeStatus === 'accepted') {
      actions.push(action('change.shape.reopen', 'Reopen Shape'));
    }

    actions.push(action('change.epic.start', 'Start Epic'));
    return actions;
  }

  if (epicLink.state === 'pending') {
    return [action('change.epic.pending.resume', 'Resume creating Epic'), action('change.epic.pending.rollback', 'Roll back pending Epic link')];
  }

  // epicLink.state === 'linked'
  const actions: AvailableAction[] = [];
  if (derivedState !== 'done') actions.push(action('change.requirement.update', 'Edit requirement'));
  if (derivedState === 'delivered') actions.push(action('change.context.notrequired', 'Mark context not required'));
  return actions;
}

/**
 * True when `shape` still reflects the Change's current title/type/priority/
 * requirement. Compares `computeChangeRequirementSliceHash`, not
 * `change.revision`/`change.contentHash` — a Shape write itself bumps the
 * Change's revision (via `shapeRef`), so comparing the *whole* record would
 * make a Shape look stale the instant it is created (see that function's
 * doc in `contracts/change.ts`).
 */
export function isShapeFreshForChange(change: ProjectChange, shape: ChangeShape): boolean {
  return shape.basedOnChange.contentHash === computeChangeRequirementSliceHash(change);
}

function computeWarnings(change: ProjectChange): ProjectChangeWarning[] {
  const warnings: ProjectChangeWarning[] = [];
  if (!change.requirement.problem.trim()) {
    warnings.push({
      code: 'change.problem_missing',
      message: 'Problem is blank — likely migrated from a source that could not supply it.',
      severity: 'info',
    });
  }
  return warnings;
}

export function buildProjectChangeReadModel(input: BuildProjectChangeReadModelInput): ProjectChangeReadModel {
  const { change, shape, epicStatus, badges = [] } = input;
  const allBadges = shape && !isShapeFreshForChange(change, shape) ? [...badges, 'shape.stale'] : badges;

  const derived = deriveProjectChangeState({
    disposition: change.disposition,
    epicStatus,
    contextSyncStatus: change.contextSync.status,
    shapeStatus: shape?.status,
    badges: allBadges,
  });

  return {
    schemaVersion: 1,
    change,
    shape,
    epicStatus,
    derived,
    availableActions: computeAvailableActions({ change, epicLink: change.epicLink, shapeStatus: shape?.status, derivedState: derived.state }),
    warnings: computeWarnings(change),
  };
}
