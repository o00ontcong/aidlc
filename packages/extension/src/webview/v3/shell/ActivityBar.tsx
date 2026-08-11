// v3/shell/ActivityBar.tsx — §2. VS Code activity bar chrome mock (4 icons).
import React from 'react';

function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[34px] h-[34px] rounded-[6px] flex items-center justify-center" style={{ color: 'var(--txt3)' }}>
      {children}
    </div>
  );
}

export function ActivityBar() {
  return (
    <div className="w-[48px] flex-none flex flex-col bg-side border-r border-bd py-[8px] items-center gap-[4px]">
      <IconBox>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <path d="M3 5h6l2 2h10v12H3z" />
        </svg>
      </IconBox>
      <IconBox>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
      </IconBox>
      <IconBox>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <circle cx="7" cy="6" r="2.5" />
          <circle cx="7" cy="18" r="2.5" />
          <circle cx="17" cy="12" r="2.5" />
          <path d="M7 8.5v7M9.5 17l5-3.5" />
        </svg>
      </IconBox>
      <div className="relative w-[34px] h-[34px] rounded-[6px] flex items-center justify-center" style={{ background: 'var(--acc-bg)' }}>
        <span
          className="absolute rounded-[2px]"
          style={{ left: -7, top: 5, bottom: 5, width: 2, background: 'var(--acc)' }}
        />
        <span className="text-[13px] font-bold" style={{ color: 'var(--acc-txt)' }}>A</span>
      </div>
    </div>
  );
}
