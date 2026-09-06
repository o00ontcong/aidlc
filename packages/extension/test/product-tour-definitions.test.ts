import { describe, expect, it } from 'vitest';

import type { ProductTourRuntimeSnapshot } from '../src/shared/productTour';
import { listGoalOffers, planProductTour, PRODUCT_TOUR_FIXED } from '../src/v2/productTour/ProductTourPlanner';
import { ProductTourService } from '../src/v2/productTour/ProductTourService';

const empty: ProductTourRuntimeSnapshot = {
  changes: [],
  scans: [],
  proposals: [],
  discoverContextStatus: 'not-required',
};

describe('Fixed product tours', () => {
  it('starts lifecycle-basics with the full classic step list', () => {
    const service = new ProductTourService();
    service.startFixed('lifecycle-basics');
    const active = service.state(empty).active;
    expect(active?.kind).toBe('fixed');
    expect(active?.id).toBe('lifecycle-basics');
    expect(active?.steps.map((step) => step.id)).toEqual([...PRODUCT_TOUR_FIXED['lifecycle-basics'].stepIds]);
  });
});

describe('Dynamic product tour planner', () => {
  it('skips Discover Context when already ready for start-delivery', () => {
    const plan = planProductTour('start-delivery', { ...empty, discoverContextStatus: 'ready' });
    expect(plan.skipped.map((step) => step.id)).toContain('lifecycle.discover-context-ready');
    expect(plan.steps.map((step) => step.id)).toEqual([
      'lifecycle.bind-change',
      'lifecycle.link-epic',
    ]);
  });

  it('skips Discover Context when a published snapshot is stale', () => {
    const plan = planProductTour('start-delivery', { ...empty, discoverContextStatus: 'stale' });
    expect(plan.skipped.map((step) => step.id)).toContain('lifecycle.discover-context-ready');
    expect(plan.steps.map((step) => step.id)).toEqual([
      'lifecycle.bind-change',
      'lifecycle.link-epic',
    ]);
  });

  it('recommends publish-context when Context has never been published', () => {
    const offers = listGoalOffers({ ...empty, discoverContextStatus: 'draft' });
    expect(offers.find((goal) => goal.id === 'publish-context')?.recommended).toBe(true);
  });

  it('does not require republish when Context is stale', () => {
    const offers = listGoalOffers({ ...empty, discoverContextStatus: 'stale' });
    expect(offers.find((goal) => goal.id === 'publish-context')?.recommended).toBe(false);
  });

  it('starts a dynamic goal with only remaining steps', () => {
    const service = new ProductTourService();
    const snapshot: ProductTourRuntimeSnapshot = { ...empty, discoverContextStatus: 'ready' };
    service.startGoal('start-delivery', snapshot);
    const active = service.state(snapshot).active;
    expect(active?.kind).toBe('dynamic');
    expect(active?.steps.map((step) => step.id)).toEqual([
      'lifecycle.bind-change',
      'lifecycle.link-epic',
    ]);
    service.bindCreatedChange('CHG-NEW');
    expect(service.state(snapshot).active?.currentStepIndex).toBe(1);
  });

  it('advances safe-scan to review after pinned scan even without proposals', () => {
    const service = new ProductTourService();
    service.startFixed('safe-scan');
    const snapshot: ProductTourRuntimeSnapshot = {
      ...empty,
      scans: [{ id: 'run-1', hasPinnedSource: true, status: 'kept' }],
      proposals: [],
    };
    const active = service.state(snapshot).active;
    expect(active?.currentStepIndex).toBe(1);
    expect(active?.steps[1]?.id).toBe('scan.review-proposal');
  });

  it('advances safe-scan to proposal bind once an open proposal exists', () => {
    const service = new ProductTourService();
    service.startFixed('safe-scan');
    const snapshot: ProductTourRuntimeSnapshot = {
      ...empty,
      scans: [{ id: 'run-1', hasPinnedSource: true, status: 'kept' }],
      proposals: [{ id: 'CP-1', status: 'review' }],
    };
    const active = service.state(snapshot).active;
    expect(active?.currentStepIndex).toBe(1);
    expect(active?.steps[1]?.id).toBe('scan.review-proposal');
  });

  it('completes safe-scan via no-proposal acknowledgement after a pinned scan', () => {
    const service = new ProductTourService();
    service.startFixed('safe-scan');
    const snapshot: ProductTourRuntimeSnapshot = {
      ...empty,
      scans: [{ id: 'run-1', hasPinnedSource: true, status: 'kept' }],
      proposals: [],
    };
    expect(service.state(snapshot).active?.currentStepIndex).toBe(1);
    service.acknowledge('scan.no-proposal');
    const active = service.state(snapshot).active;
    expect(active?.status).toBe('completed');
  });

  it('recommends safe-scan when a pinned scan exists even without proposals', () => {
    const offers = listGoalOffers({
      ...empty,
      scans: [{ id: 'run-1', hasPinnedSource: true, status: 'kept' }],
    });
    const safeScan = offers.find((goal) => goal.id === 'safe-scan');
    expect(safeScan?.recommended).toBe(true);
    expect(safeScan?.reason).toMatch(/snapshot|proposal/i);
  });

  it('advances link-epic when the bound Change already has a pending Epic link', () => {
    const service = new ProductTourService();
    service.startFixed('lifecycle-basics');
    const snapshot: ProductTourRuntimeSnapshot = {
      ...empty,
      discoverContextStatus: 'ready',
      changes: [{
        id: 'CHG-PENDING',
        epicId: 'EPIC-1',
        epicLinked: false,
        epicLinkPending: true,
        derivedState: 'captured',
        contextSyncStatus: 'not-evaluated',
      }],
    };
    service.bindChange('CHG-PENDING');
    const active = service.state(snapshot).active;
    expect(active?.steps[active.currentStepIndex ?? -1]?.id).toBe('lifecycle.delivery-complete');
  });

  it('resumes an exited incomplete tour', () => {
    const service = new ProductTourService();
    service.startFixed('rejection-recovery');
    service.exit();
    expect(service.state(empty).active?.status).toBe('exited');
    service.resume();
    expect(service.state(empty).active?.status).toBe('active');
    expect(service.state(empty).active?.currentStepIndex).toBe(0);
  });
});
