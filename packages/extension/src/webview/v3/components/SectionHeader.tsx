// v3/components/SectionHeader.tsx — §5 #14
import React from 'react';

export function SectionHeader({
  label, count, caret, onToggle, right, className = '',
}: {
  label: React.ReactNode;
  count?: number;
  /** '▾' (mở) | '▸' (gập) — bỏ qua nếu không gập được */
  caret?: '▾' | '▸';
  onToggle?: () => void;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-[6px] ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        disabled={!onToggle}
        className="flex-1 min-w-0 flex items-center gap-[6px] text-left"
      >
        {caret && <span className="flex-none text-[10px] text-txt3">{caret}</span>}
        <span className="flex-none text-[10px] uppercase tracking-[.09em] font-semibold text-txt3">{label}</span>
        {count !== undefined && <span className="flex-none text-[10px] text-txt3">{count}</span>}
      </button>
      {right}
    </div>
  );
}
