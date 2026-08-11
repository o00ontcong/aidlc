// v3/components/CodeBlock.tsx — §5 #10
import React from 'react';
import type { CodeLineVM } from '../data/types';
import { toneColor } from '../lib/tone';

const PAD = {
  '9_11': 'p-[9px_11px]',
  '13_14': 'p-[13px_14px]',
} as const;
const BG = { panel: 'bg-panel', panel2: 'bg-panel2' } as const;

export function CodeBlock({
  lines, bg = 'panel2', pad = '9_11', className = '', whiteSpacePre = false,
}: {
  lines: CodeLineVM[];
  bg?: keyof typeof BG;
  pad?: keyof typeof PAD;
  className?: string;
  whiteSpacePre?: boolean;
}) {
  return (
    <pre
      className={`font-v3-mono text-[11px] leading-[1.8] ${BG[bg]} border border-bd rounded-[6px] ${PAD[pad]} m-0 overflow-auto ${
        whiteSpacePre ? 'whitespace-pre' : 'whitespace-pre-wrap'
      } ${className}`}
    >
      {lines.map((line, i) => (
        <div key={i} style={{ color: line.tone === 'muted' ? 'var(--txt3)' : line.tone === 'txt' ? 'var(--txt)' : toneColor(line.tone) }}>
          {line.t || ' '}
        </div>
      ))}
    </pre>
  );
}
