// v3/components/Button.tsx — §5 #1
import React from 'react';
import type { ButtonVariant } from '../data/types';
import { mock } from './MockBoundary';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'none';

const VARIANT_CLS: Record<ButtonVariant, string> = {
  primary: 'bg-acc text-on-acc font-semibold',
  default: 'border border-bd text-txt bg-transparent',
  danger: 'border border-err-bd text-err bg-transparent',
  ghost: 'border-0 text-acc-txt bg-transparent',
};

// 'none' = caller fully controls padding/font-size via `className` (e.g. a
// bespoke size not in this scale) — never mix SIZE_CLS utilities with a
// conflicting padding/text-size className on the same element: Tailwind
// gives both equal specificity, so which one wins depends on generated
// stylesheet order, not JSX class-string order.
const SIZE_CLS: Record<ButtonSize, string> = {
  xs: 'px-[9px] py-[4px] text-[11px]',
  sm: 'px-[10px] py-[5px] text-[11.5px]',
  md: 'px-[11px] py-[6px] text-[11.5px]',
  lg: 'px-[14px] py-[9px] text-[12.5px]',
  xl: 'px-[16px] py-[9px] text-[12.5px]',
  none: '',
};

export function Button({
  label, variant = 'default', size = 'md', onClick, disabled, className = '', mockId, title,
}: {
  label: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  mockId?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      {...(mockId ? mock(mockId) : {})}
      className={`flex-none whitespace-nowrap rounded-[6px] disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLS[variant]} ${SIZE_CLS[size]} ${className}`}
    >
      {label}
    </button>
  );
}
