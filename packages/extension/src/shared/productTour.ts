/**
 * Contract shared by the extension host and the Workspace webview.
 *
 * Tour progress is deliberately *not* project data: the host persists it in
 * VS Code memento storage, never under the workspace.  The runtime snapshot
 * below is read-only evidence used to advance a tour after an actual project
 * action; a click on a highlighted control is never considered completion.
 *
 * Fixed tours (3 scenarios) keep a full step list. Dynamic tour asks what the
 * user wants, compares project state, and plans only remaining steps.
 */

/** Bump when step order/identity or progress shape changes. */
export const PRODUCT_TOUR_VERSION = 7;

/** Classic fixed scenarios shown as three rows in the Hướng dẫn menu. */
export const PRODUCT_TOUR_IDS = [
  'lifecycle-basics',
  'safe-scan',
  'rejection-recovery',
] as const;
export type ProductTourId = (typeof PRODUCT_TOUR_IDS)[number];

/** Goals offered inside the Dynamic tour popup. */
export const PRODUCT_TOUR_GOAL_IDS = [
  'publish-context',
  'start-delivery',
  'finish-change',
  'safe-scan',
  'close-context',
  'rejection-recovery',
] as const;
export type ProductTourGoalId = (typeof PRODUCT_TOUR_GOAL_IDS)[number];

export type ProductTourScenarioId = ProductTourId | ProductTourGoalId;

export type ProductTourAnchor =
  | 'topbar-help'
  | 'project-new-change'
  | 'change-route-explore'
  | 'change-route-start-epic'
  | 'discover-publish-context'
  | 'project-scan'
  | 'discover-scan'
  | 'context-proposal-review'
  | 'context-proposal-rebase'
  | 'epic-delivery-review'
  | 'epic-delivery-pipeline'
  | 'epic-context-closeout';

export type ProductTourView = 'project' | 'discover' | 'epics';
export type ProductTourStatus = 'active' | 'paused' | 'completed' | 'exited';

/** Discover Context readiness for CoFoFo delivery; `not-required` when the project has no Discover. */
export type ProductTourDiscoverContextStatus =
  | 'missing'
  | 'draft'
  | 'ready'
  | 'stale'
  | 'conflict'
  | 'not-required';

export interface ProductTourRuntimeChange {
  id: string;
  epicId?: string;
  /** True when epicLink.state === 'linked'. */
  epicLinked: boolean;
  /** True when epicLink.state === 'pending' (Start Epic saga mid-flight). */
  epicLinkPending: boolean;
  derivedState: string;
  contextSyncStatus: 'not-evaluated' | 'pending' | 'proposed' | 'applied' | 'not-required';
}

export interface ProductTourRuntimeScan {
  id: string;
  hasPinnedSource: boolean;
  status: 'running' | 'review' | 'kept' | 'reverted';
}

export interface ProductTourRuntimeProposal {
  id: string;
  status: string;
}

export interface ProductTourRuntimeSnapshot {
  changes: readonly ProductTourRuntimeChange[];
  scans: readonly ProductTourRuntimeScan[];
  proposals: readonly ProductTourRuntimeProposal[];
  /** Gate for cofofo-feature / cofofo-bugfix Start Epic — never inferred from clicks. */
  discoverContextStatus: ProductTourDiscoverContextStatus;
}

/** The only durable personal state for one workspace. */
export interface ProductTourProgress {
  version: number;
  kind: 'fixed' | 'dynamic';
  /** Fixed tour id or dynamic goal id. */
  scenarioId: ProductTourScenarioId;
  status: ProductTourStatus;
  /** Planned step ids for this run. */
  stepIds: string[];
  stepIndex: number;
  boundChangeId?: string;
  boundProposalId?: string;
  acknowledgedStepIds: string[];
  updatedAt: string;
}

export interface ProductTourStepUi {
  id: string;
  title: string;
  body: string;
  target?: ProductTourAnchor;
  targetView?: ProductTourView;
  state: 'complete' | 'current' | 'upcoming';
  requires: 'evidence' | 'change-binding' | 'proposal-binding' | 'acknowledgement';
}

export interface ProductTourActiveUi {
  id: ProductTourScenarioId;
  title: string;
  kind: 'fixed' | 'dynamic';
  status: ProductTourStatus;
  currentStepIndex: number;
  boundChangeId?: string;
  boundProposalId?: string;
  steps: ProductTourStepUi[];
  /** Steps the dynamic planner skipped because project evidence was already satisfied. */
  skippedStepTitles?: string[];
}

/** Goal card for the Dynamic tour popup — planned against current project state. */
export interface ProductTourGoalOffer {
  id: ProductTourGoalId;
  title: string;
  detail: string;
  recommended: boolean;
  /** True when the goal cannot be completed with current project capabilities/evidence. */
  blocked?: boolean;
  reason?: string;
  remainingCount: number;
  skippedCount: number;
  remainingTitles: string[];
}

export interface ProductTourUiState {
  version: number;
  active?: ProductTourActiveUi;
  /** Dynamic goal offers recomputed from the latest snapshot (for the popup). */
  goals: ProductTourGoalOffer[];
  /** Global personal preference; never shared with collaborators. */
  seenVersion?: number;
}
