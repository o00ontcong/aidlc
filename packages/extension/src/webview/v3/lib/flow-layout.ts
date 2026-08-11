// v3/lib/flow-layout.ts
// Toán học của FlowCanvas — trích đúng từ "AIDLC Workspace v3.dc.html".
// TUYỆT ĐỐI không hard-code toạ độ node/đường ở component. Chỉ gọi các hàm dưới đây.

export type FlowKind = 'done' | 'active' | 'gate' | 'todo';
export interface FlowNode { name: string; meta: string; kind: FlowKind }
export interface FlowLoop { from: number; to: number; label: string }

export const NODE_W = 208;
export const NODE_H = 52;
export const PITCH_X = 224;
export const PITCH_Y = 128;
export const X0 = 12;
export const Y0 = 40;
export const COLS = 5;
export const GRID_W = 1120;
export const SCALE = 0.628;

export const nx = (i: number) => X0 + PITCH_X * (i % COLS);
export const ny = (i: number) => Y0 + PITCH_Y * Math.floor(i / COLS);
export const cx = (i: number) => nx(i) + NODE_W / 2;   // +104
export const cy = (i: number) => ny(i) + NODE_H / 2;   // +26

export type PathTone = 'acc' | 'track' | 'warn';
export interface FlowPath { d: string; tone: PathTone; width: number; dash: string | 'none'; marker: 'ar' | 'ara' | 'arw' }

/**
 * Quy tắc "done" trong v3: một đoạn nối được tô xanh nếu node NGUỒN hoặc node ĐÍCH có kind==='done'.
 * (trong file gốc: `const done = activeFlow[i+1].icon === '✓' || activeFlow[i].icon === '✓'`)
 */
export function flowPaths(nodes: FlowNode[], loop?: FlowLoop): FlowPath[] {
  const out: FlowPath[] = [];
  nodes.forEach((n, i) => {
    if (i === nodes.length - 1) return;
    const done = nodes[i].kind === 'done' || nodes[i + 1].kind === 'done';
    const tone: PathTone = done ? 'acc' : 'track';
    const marker = done ? 'ara' : 'ar';
    const dash = done ? 'none' : '5 4';
    if ((i + 1) % COLS === 0) {
      const c = ny(i) + 88;                      // hành lang xuống hàng
      out.push({
        d: `M${cx(i)},${ny(i) + NODE_H} L${cx(i)},${c} L${cx(i + 1)},${c} L${cx(i + 1)},${ny(i + 1)}`,
        tone, width: 2, dash, marker,
      });
    } else {
      out.push({
        d: `M${nx(i) + NODE_W},${cy(i)} L${nx(i + 1)},${cy(i)}`,
        tone, width: 2, dash, marker,
      });
    }
  });
  if (loop) {
    const y = loopY(loop);
    out.push({
      d: `M${cx(loop.from)},${ny(loop.from) + NODE_H} L${cx(loop.from)},${y} L${cx(loop.to)},${y} L${cx(loop.to)},${ny(loop.to) + NODE_H}`,
      tone: 'warn', width: 1.6, dash: '4 4', marker: 'arw',
    });
  }
  return out;
}

export const loopY = (loop: FlowLoop) => ny(loop.from) + 76;

export function canvasMetrics(nodes: FlowNode[], loop?: FlowLoop) {
  const rows = Math.ceil(nodes.length / COLS);
  const ly = loop ? loopY(loop) : 0;
  const gridH = Math.max(ly + 20, Y0 + PITCH_Y * rows + 12);
  return {
    gridH,
    wrapperH: Math.round(gridH * SCALE),      // container ngoài, overflow:hidden
    viewBox: `0 0 ${GRID_W} ${gridH}`,
    gridW: GRID_W,
    scale: SCALE,
    loopLabel: loop ? { left: nx(loop.to) + 116, top: ly - 20 } : null,
  };
}

export function nodePosition(i: number) {
  return { left: nx(i), top: ny(i), width: NODE_W };
}

/** Style theo trạng thái node — dùng đúng bảng này, không tự chế. */
export const NODE_STYLE: Record<FlowKind, { icon: string; border: string; bg: string; iconColor: string; metaColor: string }> = {
  done:   { icon: '✓',  border: '1.5px solid var(--acc)',    bg: 'var(--acc-bg)',  iconColor: 'var(--acc-txt)', metaColor: 'var(--txt3)' },
  active: { icon: '●',  border: '2px solid var(--warn)',     bg: 'var(--warn-bg)', iconColor: 'var(--warn)',    metaColor: 'var(--warn)' },
  gate:   { icon: '🔒', border: '2px solid var(--err-bd)',   bg: 'var(--err-bg)',  iconColor: 'var(--warn)',    metaColor: 'var(--err)'  },
  todo:   { icon: '○',  border: '1.5px dashed var(--bd)',    bg: 'var(--panel)',   iconColor: 'var(--txt3)',    metaColor: 'var(--txt3)' },
};

/** Loop mặc định theo pipeline (v3): redraw-design 3→1, cohesive-feature 8→6. */
export const DEFAULT_LOOP: Record<string, FlowLoop> = {
  'redraw-design':    { from: 3, to: 1, label: 'reject + feedback → design-recreator' },
  'cohesive-feature': { from: 8, to: 6, label: 'cohesion-review reject → Run again with Claude → implement' },
};
