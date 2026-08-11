// v3/screens/epics/StepList.tsx — §11 block ⑧ rows. Thin presentational
// component; EpicDetail owns the surrounding <Card> chrome + footer.
import React from 'react';
import type { StepRowVM } from '../../data/types';
import { Button } from '../../components';

const KIND_STYLE: Record<StepRowVM['kind'], { icon: string; color: string; rowBg?: string }> = {
  done: { icon: '✓', color: 'text-acc-txt' },
  active: { icon: '●', color: 'text-warn', rowBg: 'bg-acc-bg' },
  gate: { icon: '🔒', color: 'text-err' },
  todo: { icon: '○', color: 'text-txt3' },
  rerun: { icon: '↻', color: 'text-warn' },
  failed: { icon: '✕', color: 'text-err', rowBg: 'bg-err-bg' },
};

export function StepList({ steps }: { steps: StepRowVM[] }) {
  return (
    <>
      {steps.map((step, i) => {
        const s = KIND_STYLE[step.kind];
        return (
          <div key={i} className={`flex flex-col gap-[7px] p-[10px_14px] border-b border-bd2 ${s.rowBg ?? ''}`}>
            <div className="flex items-center gap-[10px]">
              <div className={`flex-none w-[18px] text-center text-[12px] ${s.color}`}>{s.icon}</div>
              <div className="flex-1 min-w-0 flex items-center gap-[8px]">
                <span className="text-[12.5px] text-txt min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{step.name}</span>
                <span className="flex-none font-v3-mono text-[11px] text-txt3">{step.meta}</span>
              </div>
              <div className="flex-none flex items-center gap-[5px]">
                {step.actions.map((act, j) => (
                  <Button key={j} label={act.label} variant={act.variant} size="xs" />
                ))}
              </div>
            </div>
            {step.error && (
              <div className="font-v3-mono text-[11.5px] text-err leading-[1.55] pl-[28px]">{step.error}</div>
            )}
          </div>
        );
      })}
    </>
  );
}
