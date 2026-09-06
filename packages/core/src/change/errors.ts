/**
 * Domain errors specific to Change/Shape business rules — as opposed to the
 * generic not-found/duplicate/revision-conflict family thrown by
 * `storage/WorkspaceTransaction.ts`'s `AggregateConflictError`. Each still
 * carries a dotted-lowercase `.code` from the plan §18.6 vocabulary so
 * `CommandBus` surfaces it into a structured `CommandResult.error` without
 * any special-casing.
 */

export class ChangeHumanRequiredError extends Error {
  readonly code = 'change.human_required';
  constructor(message: string) {
    super(message);
    this.name = 'ChangeHumanRequiredError';
  }
}

/**
 * The mirror image of {@link ChangeHumanRequiredError}: `change.scope.propose`
 * is analysis, not a human decision (plan §18.6 — "actor agent/system"),
 * so a `user` actor is rejected here instead. Not in the plan's minimum
 * vocabulary list (§18.6 only spells out the human-required direction) but
 * consistent with it — `change.<reason>` — and needed since the two
 * directions are not interchangeable.
 */
export class ChangeAgentRequiredError extends Error {
  readonly code = 'change.agent_required';
  constructor(message: string) {
    super(message);
    this.name = 'ChangeAgentRequiredError';
  }
}

export class ChangeInvalidStateError extends Error {
  readonly code = 'change.invalid_state';
  constructor(message: string) {
    super(message);
    this.name = 'ChangeInvalidStateError';
  }
}

export class ChangeRelationCycleError extends Error {
  readonly code = 'change.relation_cycle';
  constructor(message: string) {
    super(message);
    this.name = 'ChangeRelationCycleError';
  }
}

export class ShapeNotReadyError extends Error {
  readonly code = 'shape.not_ready';
  constructor(message: string, readonly blockers: string[]) {
    super(message);
    this.name = 'ShapeNotReadyError';
  }
}
