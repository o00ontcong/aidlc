// v3/components/RadioRow.tsx — §5 #8
import React from 'react';

const PAD = { p7: 'p-[7px_10px]', p8: 'p-[8px_11px]' } as const;

export function RadioRow({
  label, desc, selected, onClick, pad = 'p7', mono = false, className = '',
}: {
  label: React.ReactNode;
  desc?: React.ReactNode;
  selected: boolean;
  onClick?: () => void;
  pad?: keyof typeof PAD;
  mono?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-[8px] text-left rounded-[6px] border ${PAD[pad]} ${
        selected ? 'bg-acc-bg border-acc-bd' : 'bg-panel border-bd'
      } ${className}`}
    >
      <span className={`flex-none text-[11px] leading-[1.4] ${selected ? 'text-acc-txt' : 'text-txt3'}`}>{selected ? '◉' : '○'}</span>
      <span className="min-w-0 flex flex-col gap-[2px]">
        <span className={`text-[12px] font-semibold text-txt ${mono ? 'font-v3-mono' : ''}`}>{label}</span>
        {desc && <span className="text-[11px] text-txt2">{desc}</span>}
      </span>
    </button>
  );
}
