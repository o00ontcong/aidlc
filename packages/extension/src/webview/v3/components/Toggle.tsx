// v3/components/Toggle.tsx — §5 #7. quota 26×15 knob 11 · capability 34×19 knob 15
import React from 'react';

const SIZE = {
  quota: { w: 26, h: 15, knob: 11 },
  capability: { w: 34, h: 19, knob: 15 },
} as const;

export function Toggle({
  on, size = 'quota', onClick, className = '',
}: {
  on: boolean;
  size?: keyof typeof SIZE;
  onClick?: () => void;
  className?: string;
}) {
  const s = SIZE[size];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{ width: s.w, height: s.h, background: on ? 'var(--acc)' : 'var(--track)' }}
      className={`flex-none rounded-full p-[2px] box-border flex items-center transition-colors ${on ? 'justify-end' : 'justify-start'} ${className}`}
    >
      <span
        style={{ width: s.knob, height: s.knob, background: on ? 'var(--on-acc)' : 'var(--txt3)' }}
        className="rounded-full block"
      />
    </button>
  );
}
