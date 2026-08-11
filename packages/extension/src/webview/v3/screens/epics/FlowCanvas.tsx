// v3/screens/epics/FlowCanvas.tsx — §11 block ⑤ body. TUYỆT ĐỐI không tự tính
// toạ độ ở đây — mọi số học đến từ lib/flow-layout.ts (canvasMetrics/flowPaths/
// nodePosition/NODE_STYLE). Click node hiện tại chỉ chuyển sang tab Guide —
// đúng hành vi placeholder của bản gốc, không tự chế mở step detail.
import React from 'react';
import { canvasMetrics, flowPaths, nodePosition, NODE_STYLE } from '../../lib/flow-layout';
import type { FlowNode, FlowLoop } from '../../lib/flow-layout';
import { useUiStore } from '../../state/store';
import { mock } from '../../components';

export function FlowCanvas({
  nodes, loop, flowNote,
}: {
  nodes: FlowNode[];
  loop?: FlowLoop;
  flowNote: string;
}) {
  const { update } = useUiStore();
  const { gridH, wrapperH, viewBox, gridW, scale, loopLabel } = canvasMetrics(nodes, loop);
  const paths = flowPaths(nodes, loop);

  return (
    <div {...mock('epic.flow', 'block')} className="overflow-hidden bg-panel2" style={{ height: wrapperH }}>
      <div style={{ position: 'relative', width: gridW, height: gridH, transform: `scale(${scale})`, transformOrigin: 'left top' }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox={viewBox} preserveAspectRatio="none">
          <defs>
            <marker id="ar" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 z" fill="var(--txt3)" />
            </marker>
            <marker id="ara" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 z" fill="var(--acc)" />
            </marker>
            <marker id="arw" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 z" fill="var(--warn)" />
            </marker>
          </defs>
          {paths.map((p, i) => (
            <path
              key={i}
              d={p.d}
              stroke={`var(--${p.tone})`}
              strokeWidth={p.width}
              strokeDasharray={p.dash === 'none' ? undefined : p.dash}
              fill="none"
              markerEnd={`url(#${p.marker})`}
            />
          ))}
        </svg>

        {nodes.map((n, i) => {
          const pos = nodePosition(i);
          const style = NODE_STYLE[n.kind];
          return (
            <div
              key={i}
              onClick={() => update({ tab: 'Guide' })}
              style={{
                position: 'absolute',
                left: pos.left,
                top: pos.top,
                width: pos.width,
                boxSizing: 'border-box',
                cursor: 'pointer',
                padding: '7px 11px',
                borderRadius: 7,
                border: style.border,
                background: style.bg,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ fontSize: 13, color: style.iconColor }}>{style.icon}</div>
                <div
                  className="flex-1 min-w-0 font-v3-mono font-semibold text-txt whitespace-nowrap overflow-hidden text-ellipsis"
                  style={{ fontSize: 14.5 }}
                >
                  {n.name}
                </div>
              </div>
              <div
                style={{ fontSize: 13, color: style.metaColor, marginTop: 2 }}
                className="whitespace-nowrap overflow-hidden text-ellipsis"
              >
                {n.meta}
              </div>
            </div>
          );
        })}

        {loop && loopLabel && (
          <div style={{ position: 'absolute', left: loopLabel.left, top: loopLabel.top, fontSize: 14, color: 'var(--warn)', whiteSpace: 'nowrap' }}>
            {loop.label}
          </div>
        )}

        <div
          style={{
            position: 'absolute', left: 12, top: 6, display: 'flex', alignItems: 'center',
            gap: 14, fontSize: 13.5, color: 'var(--txt3)', whiteSpace: 'nowrap',
          }}
        >
          <div>{flowNote}</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div>✓ xong</div>
            <div style={{ color: 'var(--warn)' }}>● đang chạy</div>
            <div>○ chưa tới</div>
            <div>🔒 human gate</div>
          </div>
        </div>
      </div>
    </div>
  );
}
