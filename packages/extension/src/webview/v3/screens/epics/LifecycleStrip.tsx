// v3/screens/epics/LifecycleStrip.tsx — §11 block ⑤ footer, "Vòng đời của step
// đang chạy". Toạ độ ở đây là HARD-CODED theo đặc tả (khác FlowCanvas), vì
// đây là một mini-diagram cố định, không phải bảng node động.
// Marker #ar/#ara/#arw dùng chung với <defs> đã khai báo trong FlowCanvas —
// đúng theo đặc tả (LifecycleStrip luôn render ngay dưới FlowCanvas, cùng
// Flow card, nên marker id toàn cục vẫn resolve được).
import React from 'react';
import type { LifecycleVM } from '../../data/types';
import { mock } from '../../components';

const BOX_STYLE: Record<LifecycleVM['kind'], { border: string; bg: string; icon: string; iconColor: string }> = {
  done: { border: 'var(--acc)', bg: 'var(--acc-bg)', icon: '✓', iconColor: 'var(--acc-txt)' },
  active: { border: 'var(--warn)', bg: 'var(--warn-bg)', icon: '●', iconColor: 'var(--warn)' },
  todo: { border: 'var(--track)', bg: 'var(--panel)', icon: '○', iconColor: 'var(--txt3)' },
};

export function LifecycleStrip({ lifecycle }: { lifecycle: LifecycleVM[] }) {
  return (
    <div {...mock('epic.lifecycle', 'block')} className="flex-none flex flex-col gap-[8px] p-[11px_14px] border-t border-bd">
      <div className="text-[11px] uppercase tracking-[.08em] text-txt3">Vòng đời của step đang chạy</div>
      <div className="overflow-hidden" style={{ height: 97 }}>
        <div style={{ position: 'relative', width: 1000, height: 136, transform: 'scale(0.705)', transformOrigin: 'left top' }}>
          <svg viewBox="0 0 1000 136" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <path d="M148,46 L196,46" stroke="var(--acc)" strokeWidth={2} fill="none" markerEnd="url(#ara)" />
            <path d="M332,46 L392,46" stroke="var(--track)" strokeWidth={2} strokeDasharray="5 4" fill="none" markerEnd="url(#ar)" />
            <path d="M524,46 L588,46" stroke="var(--track)" strokeWidth={2} strokeDasharray="5 4" fill="none" markerEnd="url(#ar)" />
            <path d="M736,46 L800,46" stroke="var(--track)" strokeWidth={2} strokeDasharray="5 4" fill="none" markerEnd="url(#ar)" />
            <path d="M264,74 C264,120 196,120 196,80" stroke="var(--warn)" strokeWidth={1.6} strokeDasharray="4 4" fill="none" markerEnd="url(#arw)" />
            <path d="M660,74 C660,126 90,128 90,74" stroke="var(--err)" strokeWidth={1.6} strokeDasharray="4 4" fill="none" markerEnd="url(#arw)" />
          </svg>

          {lifecycle.map((l) => {
            const s = BOX_STYLE[l.kind];
            return (
              <div
                key={l.name}
                style={{
                  position: 'absolute',
                  top: 30,
                  left: l.x,
                  width: l.w,
                  boxSizing: 'border-box',
                  padding: '6px 9px',
                  borderRadius: 6,
                  border: `1.5px solid ${s.border}`,
                  background: s.bg,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 13.5, color: s.iconColor }}>{s.icon}</span>
                <span className="font-v3-mono font-semibold" style={{ fontSize: 15, color: 'var(--txt)' }}>{l.name}</span>
              </div>
            );
          })}

          <div style={{ position: 'absolute', left: 208, top: 100, fontSize: 13.5, color: 'var(--warn)' }}>Rerun</div>
          <div style={{ position: 'absolute', left: 420, top: 110, fontSize: 13.5, color: 'var(--err)' }}>Reject → về AwaitingWork</div>
          <div style={{ position: 'absolute', left: 152, top: 2, fontSize: 13.5, color: 'var(--txt3)' }}>Run with Claude</div>
          <div style={{ position: 'absolute', left: 340, top: 2, fontSize: 13.5, color: 'var(--txt3)' }}>Mark step done</div>
          <div style={{ position: 'absolute', left: 530, top: 2, fontSize: 13.5, color: 'var(--txt3)' }}>pass + cần approve</div>
          <div style={{ position: 'absolute', left: 744, top: 2, fontSize: 13.5, color: 'var(--txt3)' }}>Approve</div>
        </div>
      </div>
    </div>
  );
}
