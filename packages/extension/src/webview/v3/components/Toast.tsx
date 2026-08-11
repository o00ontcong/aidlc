// v3/components/Toast.tsx — §5 #13, §11.4
import React from 'react';
import { Button } from './Button';

export function Toast({
  title, body, onReload, onLater, onClose,
}: {
  title: React.ReactNode;
  body: React.ReactNode;
  onReload?: () => void;
  onLater?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="absolute right-[18px] bottom-[38px] z-36 w-[352px] bg-panel2 border border-acc-bd rounded-[8px] shadow-v3-toast p-[12px_13px] flex flex-col gap-[9px]">
      <div className="flex items-start gap-[9px]">
        <span className="flex-none text-[12px] text-acc-txt">✓</span>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-txt">{title}</div>
          <div className="text-[11.5px] text-txt2 mt-[2px]">{body}</div>
        </div>
        <button type="button" onClick={onClose} className="flex-none text-[11px] text-txt3">✕</button>
      </div>
      <div className="flex items-center gap-[8px]">
        <Button label="Reload VS Code" variant="primary" size="sm" onClick={onReload} />
        <Button label="Để sau" variant="default" size="sm" onClick={onLater} />
      </div>
    </div>
  );
}
