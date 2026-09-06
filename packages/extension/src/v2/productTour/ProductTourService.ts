import type * as vscode from 'vscode';
import {
  PRODUCT_TOUR_GOAL_IDS,
  PRODUCT_TOUR_IDS,
  PRODUCT_TOUR_VERSION,
  type ProductTourActiveUi,
  type ProductTourGoalId,
  type ProductTourId,
  type ProductTourProgress,
  type ProductTourRuntimeSnapshot,
  type ProductTourUiState,
} from '../../shared/productTour';
import {
  listGoalOffers,
  planProductTour,
  PRODUCT_TOUR_FIXED,
  PRODUCT_TOUR_GOALS,
  PRODUCT_TOUR_STEP_CATALOG,
  type ProductTourCatalogStep,
} from './ProductTourPlanner';

const WORKSPACE_KEY = 'aidlc.productTour.progress.v4';
const GLOBAL_SEEN_KEY = 'aidlc.productTour.seenVersion';

function isGoalId(value: string): value is ProductTourGoalId {
  return (PRODUCT_TOUR_GOAL_IDS as readonly string[]).includes(value);
}

function isFixedId(value: string): value is ProductTourId {
  return (PRODUCT_TOUR_IDS as readonly string[]).includes(value);
}

/**
 * Personal, resumable product-tour state. Fixed scenarios use the full step
 * list; dynamic goals plan remaining steps from the current project snapshot.
 */
export class ProductTourService {
  private context: vscode.ExtensionContext | undefined;
  private progress: ProductTourProgress | undefined;
  private skippedTitles: string[] = [];

  init(context: vscode.ExtensionContext): void {
    this.context = context;
    const saved = context.workspaceState.get<ProductTourProgress>(WORKSPACE_KEY);
    this.progress = saved
      && saved.version === PRODUCT_TOUR_VERSION
      && (saved.kind === 'fixed' || saved.kind === 'dynamic')
      && Array.isArray(saved.stepIds)
      && (saved.kind === 'fixed' ? isFixedId(saved.scenarioId) : isGoalId(saved.scenarioId))
      ? saved
      : undefined;
  }

  state(snapshot: ProductTourRuntimeSnapshot): ProductTourUiState {
    this.advanceFromEvidence(snapshot);
    const active = this.progress ? this.toActiveUi() : undefined;
    return {
      version: PRODUCT_TOUR_VERSION,
      active,
      goals: listGoalOffers(snapshot),
      seenVersion: this.context?.globalState.get<number>(GLOBAL_SEEN_KEY),
    };
  }

  /** Classic fixed scenario — full step list, no plan-time skip. */
  startFixed(tourId: ProductTourId): void {
    if (!isFixedId(tourId)) return;
    const fixed = PRODUCT_TOUR_FIXED[tourId];
    this.skippedTitles = [];
    this.progress = {
      version: PRODUCT_TOUR_VERSION,
      kind: 'fixed',
      scenarioId: tourId,
      status: 'active',
      stepIds: [...fixed.stepIds],
      stepIndex: 0,
      acknowledgedStepIds: [],
      updatedAt: new Date().toISOString(),
    };
    void this.context?.globalState.update(GLOBAL_SEEN_KEY, PRODUCT_TOUR_VERSION);
    this.persist();
  }

  /** Dynamic goal — skip steps already satisfied by current project evidence. */
  startGoal(goalId: ProductTourGoalId, snapshot: ProductTourRuntimeSnapshot): void {
    if (!isGoalId(goalId)) return;
    const plan = planProductTour(goalId, snapshot);
    this.skippedTitles = plan.skipped.map((step) => step.title);
    this.progress = {
      version: PRODUCT_TOUR_VERSION,
      kind: 'dynamic',
      scenarioId: goalId,
      status: plan.steps.length === 0 ? 'completed' : 'active',
      stepIds: plan.steps.map((step) => step.id),
      stepIndex: 0,
      acknowledgedStepIds: [],
      updatedAt: new Date().toISOString(),
    };
    void this.context?.globalState.update(GLOBAL_SEEN_KEY, PRODUCT_TOUR_VERSION);
    this.persist();
  }

  resume(): void {
    if (!this.progress || this.progress.status === 'completed') return;
    // paused + exited incomplete tours are both resumable — X/dismiss must not
    // permanently kill a mid-run session.
    this.progress = { ...this.progress, status: 'active', updatedAt: new Date().toISOString() };
    this.persist();
  }

  pause(): void {
    if (!this.progress || this.progress.status !== 'active') return;
    this.progress = { ...this.progress, status: 'paused', updatedAt: new Date().toISOString() };
    this.persist();
  }

  restart(snapshot: ProductTourRuntimeSnapshot): void {
    if (!this.progress) return;
    if (this.progress.kind === 'fixed' && isFixedId(this.progress.scenarioId)) {
      this.startFixed(this.progress.scenarioId);
      return;
    }
    if (this.progress.kind === 'dynamic' && isGoalId(this.progress.scenarioId)) {
      this.startGoal(this.progress.scenarioId, snapshot);
    }
  }

  /**
   * Hide the coach without discarding progress. Menu still offers Resume until
   * the user starts a different tour or completes this one.
   */
  exit(): void {
    if (!this.progress || this.progress.status === 'completed') return;
    this.progress = { ...this.progress, status: 'exited', updatedAt: new Date().toISOString() };
    this.persist();
  }

  bindChange(changeId: string): void {
    if (!this.progress || !changeId.trim()) return;
    this.progress = { ...this.progress, boundChangeId: changeId, updatedAt: new Date().toISOString() };
    this.persist();
  }

  bindCreatedChange(changeId: string): void {
    if (!this.progress || this.progress.status !== 'active' || this.progress.boundChangeId) return;
    this.bindChange(changeId);
  }

  bindProposal(proposalId: string): void {
    if (!this.progress || !proposalId.trim()) return;
    this.progress = { ...this.progress, boundProposalId: proposalId, updatedAt: new Date().toISOString() };
    this.persist();
  }

  acknowledge(stepId: string): void {
    if (!this.progress || !stepId.trim()) return;
    const acknowledgedStepIds = Array.from(new Set([...this.progress.acknowledgedStepIds, stepId]));
    this.progress = { ...this.progress, acknowledgedStepIds, updatedAt: new Date().toISOString() };
    this.persist();
  }

  private plannedSteps(): ProductTourCatalogStep[] {
    const progress = this.progress!;
    return progress.stepIds.map((id) => {
      const step = PRODUCT_TOUR_STEP_CATALOG[id];
      if (!step) throw new Error(`Product tour progress references unknown step ${id}`);
      return step;
    });
  }

  private advanceFromEvidence(snapshot: ProductTourRuntimeSnapshot): void {
    if (!this.progress || this.progress.status !== 'active') return;
    const steps = this.plannedSteps();
    const acknowledged = new Set(this.progress.acknowledgedStepIds);
    const bound = {
      changeId: this.progress.boundChangeId,
      proposalId: this.progress.boundProposalId,
    };

    let next = this.progress.stepIndex;
    while (next < steps.length && steps[next].complete(snapshot, bound, acknowledged)) {
      next += 1;
    }
    if (next === this.progress.stepIndex) return;
    this.progress = {
      ...this.progress,
      stepIndex: next,
      status: next === steps.length ? 'completed' : 'active',
      updatedAt: new Date().toISOString(),
    };
    this.persist();
  }

  private toActiveUi(): ProductTourActiveUi {
    const progress = this.progress!;
    const steps = this.plannedSteps();
    const title = progress.kind === 'fixed' && isFixedId(progress.scenarioId)
      ? PRODUCT_TOUR_FIXED[progress.scenarioId].title
      : isGoalId(progress.scenarioId)
        ? PRODUCT_TOUR_GOALS[progress.scenarioId].title
        : progress.scenarioId;
    return {
      id: progress.scenarioId,
      title,
      kind: progress.kind,
      status: progress.status,
      currentStepIndex: Math.min(progress.stepIndex, Math.max(steps.length - 1, 0)),
      boundChangeId: progress.boundChangeId,
      boundProposalId: progress.boundProposalId,
      skippedStepTitles: this.skippedTitles.length ? [...this.skippedTitles] : undefined,
      steps: steps.map((step, index) => ({
        id: step.id,
        title: step.title,
        body: step.body,
        target: step.target,
        targetView: step.targetView,
        requires: step.requires,
        state: index < progress.stepIndex ? 'complete' : index === progress.stepIndex ? 'current' : 'upcoming',
      })),
    };
  }

  private persist(): void {
    void this.context?.workspaceState.update(WORKSPACE_KEY, this.progress);
  }
}

export const productTourService = new ProductTourService();
