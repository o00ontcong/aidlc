// v3/components/Pill.tsx — §5 #4
import React from 'react';

export function Pill({
  label, count, active = false, onClick, className = '',
}: {
  label: React.ReactNode;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-none whitespace-nowrap rounded-full border px-[7px] py-[3px] text-[10.5px] ${
        active ? 'bg-acc-bg border-acc-bd text-acc-txt' : 'bg-transparent border-bd text-txt2'
      } ${className}`}
    >
      {label}
      {count !== undefined && <span className="opacity-65"> {count}</span>}
    </button>
  );
}
