export {
  deriveProjectChangeState,
  PROJECT_CHANGE_DISPLAY_STATES,
} from './deriveProjectChangeState';
export type {
  ProjectChangeDisplayState,
  ChangeShapeStatusForDerive,
  DeriveProjectChangeStateInput,
  ProjectChangeDerivedState,
} from './deriveProjectChangeState';

export { buildProjectChangeReadModel, isShapeFreshForChange } from './buildProjectChangeReadModel';
export type { BuildProjectChangeReadModelInput } from './buildProjectChangeReadModel';

export { ChangeStore } from './ChangeStore';

export { ChangeService, SCOPE_FEEDBACK_NEXT_ROUTES } from './ChangeService';
export type {
  CreateChangeInput,
  UpdateChangeRequirementInput,
  ProposeScopeAnalysisInput,
  ScopeFeedbackNextRoute,
  RecordScopeFeedbackInput,
  StartExploreInput,
  ChangeShapeDraftInput,
  UpdateShapeInput,
  ShapeTwoGuardInput,
  ReopenShapeInput,
  ChangeDispositionInput,
  SplitChangeChildInput,
  SplitChangeInput,
  MergeChangesInput,
} from './ChangeService';

export {
  ChangeHumanRequiredError,
  ChangeAgentRequiredError,
  ChangeInvalidStateError,
  ChangeRelationCycleError,
  ShapeNotReadyError,
} from './errors';

export { ChangeEpicCoordinator } from './ChangeEpicCoordinator';
export type { StartEpicInput, StartEpicOutput, PendingEpicLinkInput } from './ChangeEpicCoordinator';

export {
  composeRequirementWithUserNote,
  extractUserNoteFromComposedRequirement,
  extractSourceRequirementFromComposed,
  splitComposedRequirement,
  formatUserNoteBlock,
  userNoteCoverageIssues,
  USER_NOTE_HEADING,
  USER_NOTE_PREAMBLE,
  USER_NOTE_PRIORITY_RULE,
  USER_NOTE_FILENAME,
  SOURCE_REQUIREMENT_HEADING,
} from './composeRequirementWithUserNote';

export { resolveEpicUserNote, writeEpicUserNoteFile } from './epicUserNote';
