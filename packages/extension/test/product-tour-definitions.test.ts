import { describe, expect, it } from 'vitest';

import type { ProductTourRuntimeSnapshot } from '../src/shared/productTour';
import { PRODUCT_TOUR_DEFINITIONS } from '../src/v2/productTour/ProductTourDefinitions';
import { parseDemoMarker } from '../src/v2/productTour/ProductTourDemoMarker';

const empty: ProductTourRuntimeSnapshot = { changes: [], scans: [], proposals: [] };

describe('Product Tour evidence predicates', () => {
  it('tracks the explicitly bound Change rather than any Change in the project', () => {
    const steps = PRODUCT_TOUR_DEFINITIONS['lifecycle-basics'].steps;
    const snapshot: ProductTourRuntimeSnapshot = {
      ...empty,
      changes: [
        { id: 'CHANGE-A', epicLinked: false, derivedState: 'captured', contextSyncStatus: 'not-evaluated' },
        { id: 'CHANGE-B', epicId: 'EPIC-B', epicLinked: true, derivedState: 'in-delivery', contextSyncStatus: 'not-evaluated' },
      ],
    };
    expect(steps[0].complete(snapshot, {}, new Set())).toBe(false);
    expect(steps[0].complete(snapshot, { changeId: 'CHANGE-A' }, new Set())).toBe(true);
    expect(steps[1].complete(snapshot, { changeId: 'CHANGE-A' }, new Set())).toBe(false);
    expect(steps[1].complete(snapshot, { changeId: 'CHANGE-B' }, new Set())).toBe(true);
  });

  it('does not call a lifecycle complete until the same Change has Context closeout and Done evidence', () => {
    const steps = PRODUCT_TOUR_DEFINITIONS['lifecycle-basics'].steps;
    const deliveryAwaitingContext: ProductTourRuntimeSnapshot = {
      ...empty,
      changes: [{ id: 'CHANGE-A', epicId: 'EPIC-A', epicLinked: true, derivedState: 'delivery-review', contextSyncStatus: 'pending' }],
    };
    expect(steps[2].complete(deliveryAwaitingContext, { changeId: 'CHANGE-A' }, new Set())).toBe(true);
    expect(steps[3].complete(deliveryAwaitingContext, { changeId: 'CHANGE-A' }, new Set())).toBe(false);
    expect(steps[4].complete(deliveryAwaitingContext, { changeId: 'CHANGE-A' }, new Set())).toBe(false);

    const done: ProductTourRuntimeSnapshot = {
      ...empty,
      changes: [{ id: 'CHANGE-A', epicId: 'EPIC-A', epicLinked: true, derivedState: 'done', contextSyncStatus: 'not-required' }],
    };
    expect(steps[3].complete(done, { changeId: 'CHANGE-A' }, new Set())).toBe(true);
    expect(steps[4].complete(done, { changeId: 'CHANGE-A' }, new Set())).toBe(true);
  });

  it('only accepts safe-scan evidence with an immutable source snapshot', () => {
    const step = PRODUCT_TOUR_DEFINITIONS['safe-scan'].steps[0];
    expect(step.complete({ ...empty, scans: [{ id: 'SCAN-1', hasPinnedSource: false, status: 'review' }] }, {}, new Set())).toBe(false);
    expect(step.complete({ ...empty, scans: [{ id: 'SCAN-1', hasPinnedSource: true, status: 'review' }] }, {}, new Set())).toBe(true);
  });

  it('recognizes only an explicitly versioned extension-owned demo marker', () => {
    expect(parseDemoMarker({ kind: 'aidlc-product-tour-demo', version: 1, tourId: 'lifecycle-basics' })).toEqual({
      kind: 'aidlc-product-tour-demo', version: 1, tourId: 'lifecycle-basics',
    });
    expect(parseDemoMarker({ kind: 'aidlc-product-tour-demo', version: 2, tourId: 'lifecycle-basics' })).toBeUndefined();
    expect(parseDemoMarker({ kind: 'something-else', version: 1, tourId: 'lifecycle-basics' })).toBeUndefined();
  });
});
