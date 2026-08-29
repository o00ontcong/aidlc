import { describe, expect, it } from 'vitest';

import { historyRows } from '../src/webview/components/epic-v3/adapt';

describe('Epic v3 history rows', () => {
  it('renders Canvas and aggregate review events instead of returning undefined rows', () => {
    const rows = historyRows({
      history: [
        {
          kind: 'canvas_verdict',
          at: '2026-08-29T09:00:00.000Z',
          revision: 1,
          verdict: 'approve',
          reviewer: 'Demo Reviewer',
          bundleHash: 'sha256:0123456789abcdef',
        },
        {
          kind: 'aggregate_defer',
          at: '2026-08-29T09:01:00.000Z',
          revision: 1,
          reviewBundleRevision: 2,
        },
      ],
    } as never);

    expect(rows).toHaveLength(2);
    expect(rows.every(Boolean)).toBe(true);
    expect(rows[0]?.what).toContain('Review deferred');
    expect(rows[1]?.what).toContain('Canvas approved');
  });
});
