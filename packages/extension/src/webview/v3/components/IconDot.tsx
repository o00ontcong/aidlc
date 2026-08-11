// v3/components/IconDot.tsx — §5 #15. 5 / 7 / 8px tròn
import React from 'react';
import type { Tone } from '../data/types';
import { toneColor } from '../lib/tone';

const SIZE = { 5: 'w-[5px] h-[5px]', 7: 'w-[7px] h-[7px]', 8: 'w-[8px] h-[8px]' } as const;

export function IconDot({ tone, size = 7, className = '' }: { tone: Tone; size?: 5 | 7 | 8; className?: string }) {
  return <span style={{ background: toneColor(tone) }} className={`flex-none rounded-full inline-block ${SIZE[size]} ${className}`} />;
}
