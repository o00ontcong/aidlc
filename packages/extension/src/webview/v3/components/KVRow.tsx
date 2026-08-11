// v3/components/KVRow.tsx — §5 #9. k w96 (epic config) / w80 (lock, help) / w70 (step detail)
import React from 'react';

const K_WIDTH = { 96: 'w-[96px]', 80: 'w-[80px]', 70: 'w-[70px]' } as const;
const PAD = { '9_14': 'p-[9px_14px]', '9_13': 'p-[9px_13px]' } as const;
const V_SIZE = { '12': 'text-[12px]', '12.5': 'text-[12.5px]' } as const;
const V_COLOR = { txt: 'text-txt', txt2: 'text-txt2' } as const;
const K_SIZE = { '11': 'text-[11px]', '11.5': 'text-[11.5px]' } as const;

export function KVRow({
  k, v, src, action, kWidth = 96, kMono = false, kSize = '11.5',
  vSize = '12.5', vColor = 'txt', vMono = true, vLeading = '',
  pad = '9_14', className = '',
}: {
  k: React.ReactNode;
  v: React.ReactNode;
  src?: React.ReactNode;
  action?: React.ReactNode;
  kWidth?: keyof typeof K_WIDTH;
  kMono?: boolean;
  kSize?: keyof typeof K_SIZE;
  vSize?: keyof typeof V_SIZE;
  vColor?: keyof typeof V_COLOR;
  vMono?: boolean;
  /** vd 'leading-[1.6]' cho step detail — mặc định không set (single-line ellipsis) */
  vLeading?: string;
  pad?: keyof typeof PAD;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-[11px] border-b border-bd2 ${PAD[pad]} ${className}`}>
      <div className={`flex-none ${K_WIDTH[kWidth]} ${K_SIZE[kSize]} text-txt3 ${kMono ? 'font-v3-mono' : ''}`}>{k}</div>
      <div
        className={`flex-1 min-w-0 ${vMono ? 'font-v3-mono' : ''} ${V_SIZE[vSize]} ${V_COLOR[vColor]} ${
          vLeading ? vLeading : 'whitespace-nowrap overflow-hidden text-ellipsis'
        }`}
      >
        {v}
      </div>
      {src && <div className="flex-none text-[10.5px] text-txt3">{src}</div>}
      {action}
    </div>
  );
}
