import type * as vscode from 'vscode';
import {
  PRODUCT_TOUR_IDS,
  PRODUCT_TOUR_VERSION,
  type ProductTourActiveUi,
  type ProductTourId,
  type ProductTourProgress,
  type ProductTourRuntimeSnapshot,
  type ProductTourUiState,
} from '../../shared/productTour';
import { PRODUCT_TOUR_DEFINITIONS } from './ProductTourDefinitions';

const WORKSPACE_KEY = 'aidlc.productTour.progress.v1';
const GLOBAL_SEEN_KEY = 'aidlc.productTour.seenVersion';
const GLOBAL_DISMISSED_KEY = 'aidlc.productTour.dismissedCardVersion';

/**
 * Personal, resumable product-tour state. It has no repository writes and
 * only advances from immutable/read-model facts supplied by the host.
 */
export class ProductTourService {
  private context: vscode.ExtensionContext | undefined;
  private progress: ProductTourProgress | undefined;

  init(context: vscode.ExtensionContext): void {
    this.context = context;
    const saved = context.workspaceState.get<ProductTourProgress>(WORKSPACE_KEY);
    this.progress = saved && saved.version === PRODUCT_TOUR_VERSION && PRODUCT_TOUR_IDS.includes(saved.tourId)
      ? saved
      : undefined;
  }

  state(snapshot: ProductTourRuntimeSnapshot): ProductTourUiState {
    this.advanceFromEvidence(snapshot);
    const active = this.progress ? this.toActiveUi() : undefined;
    return {
      version: PRODUCT_TOUR_VERSION,
      active,
      seenVersion: this.context?.globalState.get<number>(GLOBAL_SEEN_KEY),
      dismissedCardVersion: this.context?.globalState.get<number>(GLOBAL_DISMISSED_KEY),
    };
  }

  start(tourId: ProductTourId): void {
    this.progress = {
      version: PRODUCT_TOUR_VERSION,
      tourId,
      status: 'active',
      stepIndex: 0,
      acknowledgedStepIds: [],
      updatedAt: new Date().toISOString(),
    };
    void this.context?.globalState.update(GLOBAL_SEEN_KEY, PRODUCT_TOUR_VERSION);
    this.persist();
  }

  /** Starts a demo only when that workspace has no existing personal progress. */
  ensureStarted(tourId: ProductTourId): void {
    if (!this.progress) this.start(tourId);
  }

  /** A verified demo may switch scenarios; retain same-tour progress intact. */
  ensureDemoTour(tourId: ProductTourId): void {
    if (!this.progress || this.progress.tourId !== tourId) this.start(tourId);
  }

  resume(): void {
    if (!this.progress || this.progress.status === 'completed' || this.progress.status === 'exited') return;
    this.progress = { ...this.progress, status: 'active', updatedAt: new Date().toISOString() };
    this.persist();
  }

  pause(): void {
    if (!this.progress || this.progress.status !== 'active') return;
    this.progress = { ...this.progress, status: 'paused', updatedAt: new Date().toISOString() };
    this.persist();
  }

  restart(): void {
    if (!this.progress) return;
    this.start(this.progress.tourId);
  }

  exit(): void {
    if (!this.progress) return;
    this.progress = { ...this.progress, status: 'exited', updatedAt: new Date().toISOString() };
    void this.context?.globalState.update(GLOBAL_DISMISSED_KEY, PRODUCT_TOUR_VERSION);
    this.persist();
  }

  dismissCard(): void {
    void this.context?.globalState.update(GLOBAL_DISMISSED_KEY, PRODUCT_TOUR_VERSION);
  }

  bindChange(changeId: string): void {
    if (!this.progress || !changeId.trim()) return;
    this.progress = { ...this.progress, boundChangeId: changeId, updatedAt: new Date().toISOString() };
    this.persist();
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

  private advanceFromEvidence(snapshot: ProductTourRuntimeSnapshot): void {
    if (!this.progress || this.progress.status !== 'active') return;
    const definition = PRODUCT_TOUR_DEFINITIONS[this.progress.tourId];
    const acknowledged = new Set(this.progress.acknowledgedStepIds);
    let next = this.progress.stepIndex;
    while (next < definition.steps.length && definition.steps[next].complete(snapshot, {
      changeId: this.progress.boundChangeId,
      proposalId: this.progress.boundProposalId,
    }, acknowledged)) {
      next += 1;
    }
    if (next === this.progress.stepIndex) return;
    this.progress = {
      ...this.progress,
      stepIndex: next,
      status: next === definition.steps.length ? 'completed' : 'active',
      updatedAt: new Date().toISOString(),
    };
    this.persist();
  }

  private toActiveUi(): ProductTourActiveUi {
    const progress = this.progress!;
    const definition = PRODUCT_TOUR_DEFINITIONS[progress.tourId];
    return {
      id: definition.id,
      title: definition.title,
      status: progress.status,
      currentStepIndex: progress.stepIndex,
      boundChangeId: progress.boundChangeId,
      boundProposalId: progress.boundProposalId,
      steps: definition.steps.map((step, index) => ({
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
