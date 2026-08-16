/* FlowCanvas — dc.html:762-789.
 *
 * All geometry comes from flow-layout.ts (V3_HANDOFF §6.3: "TUYỆT ĐỐI không
 * hard-code toạ độ node/đường ở component"). The only literals here are the
 * typography/padding values transcribed from the design block.
 *
 * Canvas text is deliberately large (13 / 13.5 / 14 / 14.5px) because the whole
 * group is scaled by .628 — §6.3 says keep it, do not "fix" it to the type scale.
 */

import {
  NODE_STYLE, canvasMetrics, flowPaths, nodePosition,
  type FlowLoop, type FlowNode, type PathTone,
} from './flow-layout';
import { FAILED_NODE_STYLE, type FlowKindEx, type FlowNodeEx } from './adapt';

const STROKE: Record<PathTone, string> = {
  acc: 'var(--acc)',
  track: 'var(--track)',
  warn: 'var(--warn)',
};

type Node = FlowNodeEx;

function styleFor(kind: FlowKindEx) {
  return kind === 'failed' ? FAILED_NODE_STYLE : NODE_STYLE[kind];
}

export function FlowCanvas({
  nodes, loop, flowNote, nodeTitles, onNodeClick,
}: {
  nodes: Node[];
  loop?: FlowLoop;
  flowNote: string;
  /** Same recovery advice as the step list, supplied by the Epic screen. */
  nodeTitles?: string[];
  onNodeClick?: (idx: number) => void;
}) {
  // flow-layout's flowPaths types nodes as FlowNode with FlowKind; a 'failed'
  // node is not 'done', which is exactly how the path tone should treat it.
  const paths = flowPaths(nodes as FlowNode[], loop);
  const m = canvasMetrics(nodes as FlowNode[], loop);

  return (
    <div style={{ background: 'var(--panel2)', overflow: 'hidden', height: m.wrapperH }}>
      <div
        style={{
          position: 'relative',
          height: m.gridH,
          width: m.gridW,
          transform: `scale(${m.scale})`,
          transformOrigin: 'left top',
        }}
      >
        <svg
          viewBox={m.viewBox}
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <defs>
            {/* dc.html:765-767 */}
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
              stroke={STROKE[p.tone]}
              strokeWidth={p.width}
              strokeDasharray={p.dash === 'none' ? undefined : p.dash}
              fill="none"
              markerEnd={`url(#${p.marker})`}
            />
          ))}
        </svg>

        {nodes.map((n, i) => {
          const pos = nodePosition(i);
          const s = styleFor(n.kind);
          return (
            <div
              key={`${n.name}-${i}`}
              onClick={() => onNodeClick?.(i)}
              title={nodeTitles?.[i] ?? `${n.name} — ${n.meta}`}
              style={{
                position: 'absolute',
                left: pos.left,
                top: pos.top,
                width: pos.width,
                boxSizing: 'border-box',
                cursor: 'pointer',
                padding: '7px 11px',
                borderRadius: 7,
                border: s.border,
                background: s.bg,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ fontSize: 13, color: s.iconColor }}>{s.icon}</div>
                <div
                  className="v3-mono"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 14.5,
                    color: 'var(--txt)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {n.name}
                </div>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: s.metaColor,
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {n.meta}
              </div>
            </div>
          );
        })}

        {loop && m.loopLabel && (
          <div
            style={{
              position: 'absolute',
              left: m.loopLabel.left,
              top: m.loopLabel.top,
              fontSize: 14,
              color: 'var(--warn)',
              whiteSpace: 'nowrap',
            }}
          >
            {loop.label}
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            left: 12,
            top: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            fontSize: 13.5,
            color: 'var(--txt3)',
            whiteSpace: 'nowrap',
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
