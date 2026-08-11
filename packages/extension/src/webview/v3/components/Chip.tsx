// v3/components/Chip.tsx — §5 #3
import React from 'react';
import type { Tone } from '../data/types';
import { toneBg, toneColor } from '../lib/tone';

export function Chip({
  label, tone = 'default', mono = false, className = '', pill = false, weight = 'normal',
}: {
  label: React.ReactNode;
  tone?: 'default' | Tone;
  mono?: boolean;
  className?: string;
  /** r999 thay vì r5 — dùng cho các badge tự do (published · rev-7, waiting-for-user...) không thuộc StatusBadge. */
  pill?: boolean;
  weight?: 'normal' | 'semibold';
}) {
  const style: React.CSSProperties = tone === 'default'
    ? { background: 'var(--hover)', color: 'var(--txt2)' }
    : { background: toneBg(tone), color: toneColor(tone) };
  return (
    <span
      style={style}
      className={`flex-none whitespace-nowrap ${pill ? 'rounded-full px-[9px] py-[3px]' : 'rounded-[5px] px-[8px] py-[2px]'} text-[10.5px] ${weight === 'semibold' ? 'font-semibold' : ''} ${mono ? 'font-v3-mono' : ''} ${className}`}
    >
      {label}
    </span>
  );
}
