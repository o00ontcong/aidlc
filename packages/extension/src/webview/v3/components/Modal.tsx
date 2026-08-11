// v3/components/Modal.tsx — §5 #12, §11
import React from 'react';

const WIDTH = { 620: 'w-[620px]', 780: 'w-[780px]', 820: 'w-[820px]' } as const;
const MAX_H = { 770: 'max-h-[770px]', 790: 'max-h-[790px]' } as const;
const PAD_TOP = { 56: 'pt-[56px]', 60: 'pt-[60px]', 90: 'pt-[90px]' } as const;
const Z = { 30: 'z-30', 32: 'z-32', 34: 'z-34', 36: 'z-36' } as const;

export function Modal({
  width, maxHeight, paddingTop, z = 30, title, sub, onClose, children, footerCli, footerActions,
  danger = false,
}: {
  width: keyof typeof WIDTH;
  maxHeight?: keyof typeof MAX_H;
  paddingTop: keyof typeof PAD_TOP;
  z?: keyof typeof Z;
  title: React.ReactNode;
  sub?: React.ReactNode;
  onClose?: () => void;
  children: React.ReactNode;
  footerCli?: string;
  footerActions?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className={`absolute inset-0 ${Z[z]} bg-black/50 flex justify-center items-start ${PAD_TOP[paddingTop]}`}>
      <div
        className={`flex flex-col ${WIDTH[width]} ${maxHeight ? MAX_H[maxHeight] : ''} bg-panel2 rounded-[9px] shadow-v3-modal overflow-hidden ${
          danger ? 'border-[2px] border-err-bd' : 'border border-bd'
        }`}
      >
        <div className={`flex-none flex items-start gap-[10px] p-[14px_16px] border-b border-bd ${danger ? 'bg-err-bg' : ''}`}>
          {danger && <span className="flex-none text-[15px] leading-[1.4]">🔒</span>}
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-bold text-txt">{title}</div>
            {sub && <div className="text-[11.5px] text-txt2 mt-[2px]">{sub}</div>}
          </div>
          <button type="button" onClick={onClose} className="flex-none text-[11px] border border-bd rounded-[5px] px-[8px] py-[3px] text-txt2">esc</button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-[16px] flex flex-col gap-[14px]">{children}</div>
        {(footerCli || footerActions) && (
          <div className="flex-none flex items-center gap-[8px] p-[12px_16px] border-t border-bd">
            {footerCli && <span className="flex-1 min-w-0 font-v3-mono text-[11px] text-txt3 whitespace-nowrap overflow-hidden text-ellipsis">{footerCli}</span>}
            {!footerCli && <span className="flex-1 min-w-0" />}
            <div className="flex-none flex items-center gap-[8px]">{footerActions}</div>
          </div>
        )}
      </div>
    </div>
  );
}
