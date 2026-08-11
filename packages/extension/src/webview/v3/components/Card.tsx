// v3/components/Card.tsx — §5 #2
import React from 'react';
import { mock } from './MockBoundary';
import type { ActionVM, Tone } from '../data/types';
import { Button } from './Button';
import { Chip } from './Chip';

export interface CardChip { label: string; tone?: 'default' | Tone; mono?: boolean }

const HEADER_PAD = {
  p10: 'p-[10px_14px]',
  p11: 'p-[11px_14px]',
} as const;

export function Card({
  title, chips, right, actions, footer, children, className = '', bodyClassName = '',
  headerPad = 'p10', mockId, mockLevel = 'block', noHeaderBorder = false, headerWrap = false,
}: {
  title?: React.ReactNode;
  chips?: CardChip[];
  right?: React.ReactNode;
  actions?: ActionVM[];
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  headerPad?: keyof typeof HEADER_PAD;
  mockId?: string;
  mockLevel?: 'inline' | 'block';
  noHeaderBorder?: boolean;
  /** true khi header cần `flex-wrap` (vd Flow card §6.2 ⑤) */
  headerWrap?: boolean;
}) {
  const hasHeader = Boolean(title || chips?.length || right || actions?.length);
  return (
    <div
      {...(mockId ? mock(mockId, mockLevel) : {})}
      className={`flex flex-col min-w-0 bg-panel border border-bd rounded-[8px] ${className}`}
    >
      {hasHeader && (
        <div
          className={`flex-none flex items-center gap-[9px] ${headerWrap ? 'flex-wrap' : ''} ${noHeaderBorder ? '' : 'border-b border-bd'} ${HEADER_PAD[headerPad]}`}
        >
          {title && <div className="text-[12.5px] font-semibold text-txt min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{title}</div>}
          {chips?.map((c, i) => <Chip key={i} label={c.label} tone={c.tone} mono={c.mono} />)}
          <div className="flex-1 min-w-0" />
          {right}
          {actions?.map((act, i) => (
            <Button key={i} label={act.label} variant={act.variant} size="sm" />
          ))}
        </div>
      )}
      {children && <div className={`flex-1 min-h-0 ${bodyClassName}`}>{children}</div>}
      {footer}
    </div>
  );
}
