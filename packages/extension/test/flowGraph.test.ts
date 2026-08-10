import { describe, it, expect } from 'vitest';
import { computeFlowGraph, type FlowNodeInput } from '../src/webview/lib/flowGraph';

describe('computeFlowGraph — grid-derived layout (IMPLEMENT.md §2 step 6)', () => {
  const REDRAW_FLOW: FlowNodeInput[] = [
    { id: 'design-analyzer', label: 'design-analyzer', kind: 'done' },
    { id: 'design-recreator', label: 'design-recreator', kind: 'done' },
    { id: 'visual-reviewer', label: 'visual-reviewer', kind: 'done' },
    { id: 'human-review', label: 'human-review', kind: 'gate' },
  ];

  it('positions nodes on the 224x128 grid, 208x52 each, wrapping every 5 columns', () => {
    const { nodes } = computeFlowGraph(REDRAW_FLOW);
    expect(nodes.map((n) => [n.x, n.y])).toEqual([
      [12, 40],
      [236, 40],
      [460, 40],
      [684, 40],
    ]);
    expect(nodes.every((n) => n.width === 208 && n.height === 52)).toBe(true);
  });

  it('wraps to a new row after 5 nodes using the same grid formula', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, label: `s${i}`, kind: 'todo' as const }));
    const { nodes } = computeFlowGraph(six);
    expect(nodes[4]).toMatchObject({ x: 12 + 224 * 4, y: 40 });
    expect(nodes[5]).toMatchObject({ x: 12, y: 40 + 128 });
  });

  it('draws a plain horizontal connector between same-row nodes: M x+208,y+26 -> x prime,y+26', () => {
    const { connectors } = computeFlowGraph(REDRAW_FLOW);
    expect(connectors[0]!.d).toBe('M220,66 L236,66');
    expect(connectors[1]!.d).toBe('M444,66 L460,66');
  });

  it('marks a connector done once either endpoint is done', () => {
    const { connectors } = computeFlowGraph(REDRAW_FLOW);
    // design-analyzer(done) -> design-recreator(done): done
    expect(connectors[0]!.done).toBe(true);
    // visual-reviewer(done) -> human-review(gate): done because the left side is done
    expect(connectors[2]!.done).toBe(true);
  });

  it('routes a row-wrap connector through the y+88 corridor', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, label: `s${i}`, kind: 'todo' as const }));
    const { connectors } = computeFlowGraph(six);
    // Connector from node 4 (last of row 0) to node 5 (first of row 1).
    const wrap = connectors[4]!;
    expect(wrap.d).toContain(`${40 + 88}`); // corridor y
  });

  it('routes the reject loop through the y+76 corridor between the two named nodes', () => {
    const { loop } = computeFlowGraph(REDRAW_FLOW, { from: 'human-review', to: 'design-recreator' });
    expect(loop).toBeDefined();
    const fromY = 40; // row 0
    expect(loop!.d).toContain(`${fromY + 76}`);
    expect(loop!.label.y).toBe(fromY + 76 - 20);
  });

  it('omits the loop entirely when either named node does not exist', () => {
    const { loop } = computeFlowGraph(REDRAW_FLOW, { from: 'nope', to: 'design-recreator' });
    expect(loop).toBeUndefined();
  });

  it('canvas height fits every row, and grows to fit the reject loop when it runs lower than the grid', () => {
    const { height } = computeFlowGraph(REDRAW_FLOW);
    expect(height).toBe(40 + 128 * 1 + 12);

    const { height: heightWithLoop } = computeFlowGraph(REDRAW_FLOW, { from: 'human-review', to: 'design-recreator' });
    expect(heightWithLoop).toBeGreaterThanOrEqual(40 + 76 + 20);
  });
});
