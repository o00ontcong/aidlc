// v3/screens/epics/GateBanner.tsx — §11 Gate banner (hard border err-bd, block ⑦)
import React from 'react';
import type { EpicDetailVM } from '../../data/types';
import { Button, mock } from '../../components';
import { useUiStore } from '../../state/store';

export function GateBanner({ gate }: { gate: EpicDetailVM['gate'] }) {
  const { update } = useUiStore();
  if (!gate) return null;

  return (
    <div
      {...mock('epic.gate', 'block')}
      className="flex-none flex flex-col gap-[11px] rounded-[8px] p-[14px_16px] border-2 border-err-bd bg-err-bg"
    >
      <div className="flex items-start gap-[9px]">
        <div className="flex-none text-[14px]">🔒</div>
        <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
          <div className="text-[13px] font-semibold text-txt">{gate.title}</div>
          <div className="text-[11.5px] text-txt2">{gate.sub}</div>
        </div>
        <span className="flex-none rounded-full px-[9px] py-[3px] text-[10.5px] font-semibold bg-warn-bg text-warn">
          {gate.badge}
        </span>
      </div>

      <div className="bg-panel2 border border-bd rounded-[6px] p-[11px_12px] text-[12.5px] leading-[1.6] text-txt2">
        {gate.consequence}
      </div>

      <div className="flex flex-wrap gap-[7px]">
        {gate.actions.map((act, i) => {
          const opensGate = act.label === 'Approve' || act.label === 'Reject';
          return (
            <Button
              key={i}
              label={act.label}
              variant={act.variant}
              size="lg"
              onClick={opensGate ? () => update({ gateOpen: true }) : () => {}}
            />
          );
        })}
      </div>
    </div>
  );
}
