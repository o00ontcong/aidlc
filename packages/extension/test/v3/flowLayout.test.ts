import { describe, expect, it } from 'vitest';

import {
  flowPaths, canvasMetrics, nx, ny, GRID_W, NODE_W, COLS,
  DEFAULT_LOOP, type FlowNode,
} from '../../src/webview/v3/lib/flow-layout';

const REDRAW_NODES: FlowNode[] = [
  { name: 'design-analyzer', meta: '', kind: 'done' },
  { name: 'design-recreator', meta: '', kind: 'done' },
  { name: 'visual-reviewer', meta: '', kind: 'done' },
  { name: 'human-review', meta: '', kind: 'gate' },
];

const COHESIVE_NODES: FlowNode[] = [
  { name: 'capture-context', meta: '', kind: 'done' },
  { name: 'specify', meta: '', kind: 'done' },
  { name: 'clarify', meta: '', kind: 'done' },
  { name: 'plan', meta: '', kind: 'done' },
  { name: 'plan-tasks', meta: '', kind: 'done' },
  { name: 'analyze-contract', meta: '', kind: 'done' },
  { name: 'implement', meta: '', kind: 'active' },
  { name: 'impl-context', meta: '', kind: 'todo' },
  { name: 'cohesion-review', meta: '', kind: 'todo' },
  { name: 'system-test', meta: '', kind: 'todo' },
  { name: 'open-pr', meta: '', kind: 'gate' },
  { name: 'await-merge', meta: '', kind: 'gate' },
  { name: 'project-sync', meta: '', kind: 'todo' },
];

function rightEdgeFitsGrid(nodes: FlowNode[]) {
  for (let i = 0; i < nodes.length; i += 1) {
    expect(nx(i) + NODE_W).toBeLessThanOrEqual(GRID_W);
  }
}

function noRowOverlap(nodes: FlowNode[]) {
  // Nodes in the same row must not overlap horizontally, and the pitch must
  // exceed the node width (otherwise adjacent nodes in a row would collide).
  const rows = new Map<number, number[]>();
  nodes.forEach((_, i) => {
    const row = Math.floor(i / COLS);
    const list = rows.get(row) ?? [];
    list.push(nx(i));
    rows.set(row, list);
  });
  for (const xs of rows.values()) {
    const sorted = [...xs].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(NODE_W);
    }
  }
}

describe('flow-layout — redraw-design (4 node, single row, loop 3→1)', () => {
  const loop = DEFAULT_LOOP['redraw-design'];

  it('fits every node inside the 1120px grid with no row overlap', () => {
    rightEdgeFitsGrid(REDRAW_NODES);
    noRowOverlap(REDRAW_NODES);
  });

  it('produces exactly nodes.length paths: 3 connectors + 1 reject loop', () => {
    const paths = flowPaths(REDRAW_NODES, loop);
    expect(paths).toHaveLength(4);
    const loopPath = paths[paths.length - 1];
    expect(loopPath.tone).toBe('warn');
    expect(loopPath.dash).toBe('4 4');
  });

  it('computes gridH/wrapperH tall enough to contain the loop corridor', () => {
    const metrics = canvasMetrics(REDRAW_NODES, loop);
    // Loop from index 3 sits in row 0 (Y0=40); loopY = ny(3)+76 = 116.
    expect(metrics.gridH).toBeGreaterThanOrEqual(116 + 20);
    expect(metrics.wrapperH).toBe(Math.round(metrics.gridH * metrics.scale));
    expect(metrics.loopLabel).not.toBeNull();
  });

  it('marks the done→gate connector at index 2 as accent (done source)', () => {
    const paths = flowPaths(REDRAW_NODES, loop);
    expect(paths[2].tone).toBe('acc');
    expect(paths[2].marker).toBe('ara');
  });
});

describe('flow-layout — cohesive-feature (13 node, 3 rows, loop 8→6)', () => {
  const loop = DEFAULT_LOOP['cohesive-feature'];

  it('fits every node inside the 1120px grid with no row overlap across all 3 rows', () => {
    rightEdgeFitsGrid(COHESIVE_NODES);
    noRowOverlap(COHESIVE_NODES);
    expect(Math.floor((COHESIVE_NODES.length - 1) / COLS)).toBe(2); // 3rd row (index 2) is used
  });

  it('produces exactly nodes.length paths: 12 connectors + 1 reject loop', () => {
    const paths = flowPaths(COHESIVE_NODES, loop);
    expect(paths).toHaveLength(13);
  });

  it('routes row-wrap connectors (index 4→5, 9→10) through the down-corridor path shape', () => {
    const paths = flowPaths(COHESIVE_NODES, loop);
    // Connector from the last column of a row (index 4, 9) wraps down to the
    // next row's first column — path 'd' has 4 points (L-shape via a corridor),
    // not the simple 2-point horizontal segment used within a row.
    const wrapPath = paths[4]; // connects node 4 -> node 5
    const pointCount = (wrapPath.d.match(/[ML]/g) ?? []).length;
    expect(pointCount).toBe(4);
    const inRowPath = paths[0]; // connects node 0 -> node 1, same row
    const inRowPointCount = (inRowPath.d.match(/[ML]/g) ?? []).length;
    expect(inRowPointCount).toBe(2);
  });

  it('computes a gridH tall enough for 3 rows and keeps the loop corridor clear of row boundaries', () => {
    const metrics = canvasMetrics(COHESIVE_NODES, loop);
    const rows = 3;
    const rowsFloor = 40 + 128 * rows + 12; // Y0 + PITCH_Y*rows + 12
    expect(metrics.gridH).toBe(rowsFloor);
    // loop.from = 8 -> row 1 (ny(8) = 40 + 128*1 = 168) -> loopY = 168+76 = 244.
    const loopY = ny(8) + 76;
    expect(loopY + 20).toBeLessThanOrEqual(metrics.gridH);
    // The loop corridor (row 1 -> row 1, y=244) must not sit exactly on a row's
    // node top/bottom edge (would visually cut through boxes): row 1 spans
    // [ny(8), ny(8)+52] = [168, 220]; row 2 starts at ny(10) = 296.
    expect(loopY).toBeGreaterThan(ny(8) + 52);
    expect(loopY).toBeLessThan(ny(10));
  });
});
