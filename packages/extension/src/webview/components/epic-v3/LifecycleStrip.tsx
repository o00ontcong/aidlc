/* LifecycleStrip — "Vòng đời của step đang chạy". dc.html:791-817.
 *
 * V3_HANDOFF §6.4: this is a STATIC diagram — the 1000×136 coordinates are
 * hard-coded in the design and hard-coding them here is explicitly allowed.
 * Only the `kind` of the five boxes is data, and it comes from the focused
 * step's real run status (no mock).
 *
 * The arrow markers (#ar / #ara / #arw) are defined by FlowCanvas, which
 * always renders in the same Flow card — matching the design, where the defs
 * likewise live only in the canvas SVG.
 */

import type { StepStatus } from '@/lib/types';
import { SectionLabel } from './primitives';

type LcKind = 'done' | 'active' | 'todo';

/* dc.html:1594 — lc() */
function lcStyle(kind: LcKind) {
  return {
    icon: kind === 'done' ? '✓' : kind === 'active' ? '●' : '○',
    fg: kind === 'done' ? 'var(--acc-txt)' : kind === 'active' ? 'var(--warn)' : 'var(--txt3)',
    bd: kind === 'done' ? 'var(--acc)' : kind === 'active' ? 'var(--warn)' : 'var(--bd)',
    bg: kind === 'done' ? 'var(--acc-bg)' : kind === 'active' ? 'var(--warn-bg)' : 'var(--panel)',
  };
}

/* dc.html:1601 — fixed geometry. */
const BOXES: Array<{ name: string; x: number; w: number }> = [
  { name: 'AwaitingWork', x: 20, w: 128 },
  { name: 'Running', x: 196, w: 136 },
  { name: 'AutoReview', x: 392, w: 132 },
  { name: 'HumanReview', x: 588, w: 148 },
  { name: 'NextStep', x: 800, w: 110 },
];

/**
 * Which of the five lifecycle boxes is live, from the real run status of the
 * focused step. `null` runStatus falls back to the step's display status.
 */
export function lifecycleKinds(
  runStatus: StepStatus | null,
  displayStatus: 'pending' | 'in_progress' | 'done' | 'failed',
): LcKind[] {
  const at = (n: number): LcKind[] =>
    BOXES.map((_, i) => (i < n ? 'done' : i === n ? 'active' : 'todo'));
  switch (runStatus) {
    case 'awaiting_work':
      return at(0);
    case 'awaiting_auto_review':
      return at(2);
    case 'awaiting_review':
      return at(3);
    case 'approved':
      return at(4);
    case 'rejected':
      // Reject sends the step back to AwaitingWork (see the red edge at :800).
      return at(0);
    default:
      if (displayStatus === 'in_progress') { return at(1); }
      if (displayStatus === 'done') { return ['done', 'done', 'done', 'done', 'done']; }
      if (displayStatus === 'failed') { return at(0); }
      return BOXES.map(() => 'todo');
  }
}

export function LifecycleStrip({
  kinds,
  runStepHint = 'Run step',
}: {
  kinds: LcKind[];
  runStepHint?: string;
}) {
  return (
    <div
      style={{
        padding: '11px 14px',
        borderTop: '1px solid var(--bd)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <SectionLabel>Vòng đời của step đang chạy</SectionLabel>
      <div style={{ overflow: 'hidden', height: 97 }}>
        <div
          style={{
            position: 'relative',
            height: 136,
            width: 1000,
            transform: 'scale(0.705)',
            transformOrigin: 'left top',
          }}
        >
          <svg
            viewBox="0 0 1000 136"
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          >
            <path d="M148,46 L196,46" stroke="var(--acc)" strokeWidth="2" fill="none" markerEnd="url(#ara)" />
            <path d="M332,46 L392,46" stroke="var(--track)" strokeWidth="2" strokeDasharray="5 4" fill="none" markerEnd="url(#ar)" />
            <path d="M524,46 L588,46" stroke="var(--track)" strokeWidth="2" strokeDasharray="5 4" fill="none" markerEnd="url(#ar)" />
            <path d="M736,46 L800,46" stroke="var(--track)" strokeWidth="2" strokeDasharray="5 4" fill="none" markerEnd="url(#ar)" />
            <path d="M264,74 C264,120 196,120 196,80" stroke="var(--warn)" strokeWidth="1.6" strokeDasharray="4 4" fill="none" markerEnd="url(#arw)" />
            <path d="M660,74 C660,126 90,128 90,74" stroke="var(--err)" strokeWidth="1.6" strokeDasharray="4 4" fill="none" markerEnd="url(#arw)" />
          </svg>

          {BOXES.map((b, i) => {
            const s = lcStyle(kinds[i] ?? 'todo');
            return (
              <div
                key={b.name}
                style={{
                  position: 'absolute',
                  top: 30,
                  left: b.x,
                  width: b.w,
                  boxSizing: 'border-box',
                  padding: '6px 9px',
                  borderRadius: 6,
                  border: `1.5px solid ${s.bd}`,
                  background: s.bg,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 13.5, color: s.fg }}>{s.icon}</div>
                  <div className="v3-mono" style={{ fontSize: 15, color: 'var(--txt)', fontWeight: 600 }}>
                    {b.name}
                  </div>
                </div>
              </div>
            );
          })}

          <div style={{ position: 'absolute', left: 208, top: 100, fontSize: 14, color: 'var(--warn)' }}>Rerun</div>
          <div style={{ position: 'absolute', left: 420, top: 110, fontSize: 14, color: 'var(--err)' }}>Reject → về AwaitingWork</div>
          <div style={{ position: 'absolute', left: 152, top: 2, fontSize: 13.5, color: 'var(--txt3)' }}>{runStepHint}</div>
          <div style={{ position: 'absolute', left: 340, top: 2, fontSize: 13.5, color: 'var(--txt3)' }}>Mark step done</div>
          <div style={{ position: 'absolute', left: 530, top: 2, fontSize: 13.5, color: 'var(--txt3)' }}>pass + cần approve</div>
          <div style={{ position: 'absolute', left: 744, top: 2, fontSize: 13.5, color: 'var(--txt3)' }}>Approve</div>
        </div>
      </div>
    </div>
  );
}
