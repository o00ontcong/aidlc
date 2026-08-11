// v3/components/ValidationPanel.tsx — §5 #11, §11.3
import React from 'react';
import type { CheckVM } from '../data/types';
import { Chip } from './Chip';

export function ValidationPanel({ checks, className = '' }: { checks: CheckVM[]; className?: string }) {
  const failCount = checks.filter((c) => !c.ok).length;
  return (
    <div className={`border border-bd rounded-[7px] overflow-hidden ${className}`}>
      <div className="flex items-center gap-[9px] p-[10px_14px] border-b border-bd">
        <div className="text-[12.5px] font-semibold text-txt">Validation</div>
        <div className="flex-1 min-w-0" />
        {failCount > 0
          ? <Chip pill weight="semibold" tone="err" label={`${failCount} lỗi cần sửa`} />
          : <Chip pill weight="semibold" tone="acc" label="Hợp lệ" />}
      </div>
      <div>
        {checks.map((c, i) => (
          <div key={i} className="flex items-center gap-[8px] p-[8px_12px] border-b border-bd2 last:border-b-0">
            <span style={{ color: c.ok ? 'var(--acc-txt)' : 'var(--err)' }} className="flex-none text-[11.5px]">{c.ok ? '✓' : '✕'}</span>
            <span className="flex-1 min-w-0 text-[11.5px] text-txt2">{c.label}</span>
            {c.fix && <button type="button" className="flex-none text-[11px] text-acc-txt">{c.fix}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
