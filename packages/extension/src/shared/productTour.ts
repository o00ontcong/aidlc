/**
 * Contract shared by the extension host and the Workspace webview.
 *
 * Tour progress is deliberately *not* project data: the host persists it in
 * VS Code memento storage, never under the workspace.  The runtime snapshot
 * below is read-only evidence used to advance a tour after an actual project
 * action; a click on a highlighted control is never considered completion.
 */

export const PRODUCT_TOUR_VERSION = 1;

export const PRODUCT_TOUR_IDS = [
  'lifecycle-basics',
  'safe-scan',
  'rejection-recovery',
] as const;
export type ProductTourId = (typeof PRODUCT_TOUR_IDS)[number];

export type ProductTourAnchor =
  | 'topbar-help'
  | 'project-new-change'
  | 'change-route-explore'
  | 'change-route-start-epic'
  | 'discover-scan'
  | 'context-proposal-review'
  | 'context-proposal-rebase'
  | 'epic-delivery-review'
  | 'epic-context-closeout';

export type ProductTourView = 'project' | 'discover' | 'epics';
export type ProductTourStatus = 'active' | 'paused' | 'completed' | 'exited';

export interface ProductTourRuntimeChange {
  id: string;
  epicId?: string;
  epicLinked: boolean;
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
}

/** The only durable personal state for one workspace. */
export interface ProductTourProgress {
  version: number;
  tourId: ProductTourId;
  status: ProductTourStatus;
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
  id: ProductTourId;
  title: string;
  status: ProductTourStatus;
  currentStepIndex: number;
  boundChangeId?: string;
  boundProposalId?: string;
  steps: ProductTourStepUi[];
}

export interface ProductTourUiState {
  version: number;
  active?: ProductTourActiveUi;
  /** Global personal preferences; never shared with collaborators. */
  seenVersion?: number;
  dismissedCardVersion?: number;
}
