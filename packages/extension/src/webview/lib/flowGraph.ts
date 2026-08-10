/**
 * Pure pipeline flow-graph layout (IMPLEMENT.md §2 step 6): node positions
 * and connector paths derived from a fixed 5-column grid, never hard-coded
 * per pipeline. Matches the design mock's own formula exactly (`AIDLC
 * Workspace v2.dc.html`, the `flowNodes`/`flowPaths`/`gridH` computation):
 *
 *   x = 12 + 224 * (i % 5), y = 40 + 128 * floor(i / 5), node 208×52
 *   horizontal connector:  M x+208,y+26 -> x',y+26
 *   row-wrap connector:    down through the y+88 corridor
 *   reject-loop connector: through the y+76 corridor between the two nodes
 *   canvas height:         max(loopY+20, 40 + 128*rows + 12)
 *
 * No React/DOM here — this only computes numbers/path strings so it's
 * testable without a browser and reusable by both the SVG component and any
 * future canvas/export renderer.
 */

export type FlowNodeKind = 'done' | 'active' | 'gate' | 'todo';

export interface FlowNodeInput {
  id: string;
  label: string;
  meta?: string;
  kind: FlowNodeKind;
}

export interface PositionedFlowNode extends FlowNodeInput {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlowConnector {
  /** SVG `<path d>` value. */
  d: string;
  /** `true` once both endpoints are past `todo` — drawn solid, not dashed. */
  done: boolean;
}

export interface RejectLoop {
  from: string;
  to: string;
}

export interface FlowGraphLayout {
  nodes: PositionedFlowNode[];
  connectors: FlowConnector[];
  loop?: { d: string; label: { x: number; y: number } };
  /** Total SVG canvas height needed to fit every node and the reject loop. */
  height: number;
}

const COLS = 5;
const COL_WIDTH = 224;
const ROW_HEIGHT = 128;
const NODE_X0 = 12;
const NODE_Y0 = 40;
const NODE_WIDTH = 208;
const NODE_HEIGHT = 52;
const ROW_WRAP_CORRIDOR_OFFSET = 88;
const LOOP_CORRIDOR_OFFSET = 76;

function nodeX(i: number): number {
  return NODE_X0 + COL_WIDTH * (i % COLS);
}
function nodeY(i: number): number {
  return NODE_Y0 + ROW_HEIGHT * Math.floor(i / COLS);
}

/** `true` once either endpoint of the i -> i+1 connector has finished (`done` on either side, matching the mock's own `done` rule). */
function isDone(nodes: FlowNodeInput[], i: number): boolean {
  return nodes[i]!.kind === 'done' || nodes[i + 1]!.kind === 'done';
}

export function computeFlowGraph(nodes: FlowNodeInput[], rejectLoop?: RejectLoop): FlowGraphLayout {
  const positioned: PositionedFlowNode[] = nodes.map((node, i) => ({
    ...node,
    x: nodeX(i),
    y: nodeY(i),
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  }));

  const connectors: FlowConnector[] = [];
  nodes.forEach((_, i) => {
    if (i === nodes.length - 1) return;
    const done = isDone(nodes, i);
    if ((i + 1) % COLS === 0) {
      // Row wrap: down through the corridor below this row, across, then down into the next row's node.
      const cx = nodeX(i) + NODE_WIDTH / 2;
      const cx2 = nodeX(i + 1) + NODE_WIDTH / 2;
      const corridorY = nodeY(i) + ROW_WRAP_CORRIDOR_OFFSET;
      connectors.push({
        d: `M${cx},${nodeY(i) + NODE_HEIGHT} L${cx},${corridorY} L${cx2},${corridorY} L${cx2},${nodeY(i + 1)}`,
        done,
      });
    } else {
      connectors.push({
        d: `M${nodeX(i) + NODE_WIDTH},${nodeY(i) + NODE_HEIGHT / 2} L${nodeX(i + 1)},${nodeY(i) + NODE_HEIGHT / 2}`,
        done,
      });
    }
  });

  let loop: FlowGraphLayout['loop'];
  let loopY = 0;
  if (rejectLoop) {
    const from = nodes.findIndex((n) => n.id === rejectLoop.from);
    const to = nodes.findIndex((n) => n.id === rejectLoop.to);
    if (from >= 0 && to >= 0) {
      const cxFrom = nodeX(from) + NODE_WIDTH / 2;
      const cxTo = nodeX(to) + NODE_WIDTH / 2;
      loopY = nodeY(from) + LOOP_CORRIDOR_OFFSET;
      loop = {
        d: `M${cxFrom},${nodeY(from) + NODE_HEIGHT} L${cxFrom},${loopY} L${cxTo},${loopY} L${cxTo},${nodeY(to) + NODE_HEIGHT}`,
        label: { x: cxTo + 12, y: loopY - 20 },
      };
    }
  }

  const rows = Math.ceil(nodes.length / COLS);
  const height = Math.max(loopY + 20, NODE_Y0 + ROW_HEIGHT * rows + 12);

  return { nodes: positioned, connectors, loop, height };
}
