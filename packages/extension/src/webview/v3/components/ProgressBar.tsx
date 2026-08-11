// v3/components/ProgressBar.tsx — §5 #6. height 2 (row epic, w26) · 3 (quota) · 6 (header epic, home)
import React from 'react';
import type { Tone } from '../data/types';
import { toneColor } from '../lib/tone';

const HEIGHT_CLS = { 2: 'h-[2px]', 3: 'h-[3px]', 6: 'h-[6px]' } as const;

export function ProgressBar({
  pct, tone = 'acc', height = 6, className = '',
}: {
  /** 0-100 */
  pct: number;
  tone?: Tone;
  height?: 2 | 3 | 6;
  className?: string;
}) {
  return (
    <div className={`bg-track rounded-full overflow-hidden ${HEIGHT_CLS[height]} ${className}`}>
      <div
        className={`${HEIGHT_CLS[height]} rounded-full`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: toneColor(tone) }}
      />
    </div>
  );
}
