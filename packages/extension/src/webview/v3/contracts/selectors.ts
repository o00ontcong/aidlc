import type { V3EpicSummary, V3WorkspaceState } from './types';

export function currentEpic(state: V3WorkspaceState): V3EpicSummary | undefined {
  return state.epics.find((epic) => epic.id === state.currentEpicId) ?? state.epics[0];
}

/** User-facing stage order is a product constraint: never expose internal steps here. */
export function visibleStages(epic: V3EpicSummary | undefined) {
  return epic?.stages.slice(0, 5) ?? [];
}

export function isProjectReady(state: V3WorkspaceState): boolean {
  return state.project.readiness === 'ready';
}
