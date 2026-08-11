// v3/components/StatusBadge.tsx — §5 #5, bảng map §6.2
import React from 'react';
import type { EpicStateLabel } from '../data/types';
import { EPIC_STATE_BADGE } from '../lib/badge';

export function StatusBadge({ state, className = '' }: { state: EpicStateLabel; className?: string }) {
  const m = EPIC_STATE_BADGE[state];
  return (
    <span
      style={{ background: m.bg, color: m.fg }}
      className={`flex-none inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] font-semibold ${className}`}
    >
      <span>{m.icon}</span>
      <span>{m.label}</span>
    </span>
  );
}
