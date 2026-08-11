// v3/screens/epics/EpicRail.tsx — left column, "rail" collapsed state (46px)
import React from 'react';
import { MOCK_EPICS } from '../../data/mock-data';
import { useUiStore } from '../../state/store';
import { IconDot } from '../../components';

export function EpicRail() {
  const { state, update } = useUiStore();
  return (
    <div className="flex-none w-[46px] h-full min-h-0 flex flex-col items-center gap-[8px] py-[10px] bg-panel border-r border-bd">
      <button
        type="button"
        onClick={() => update({ listCollapsed: false })}
        className="flex-none w-[26px] h-[26px] rounded-[6px] border border-bd flex items-center justify-center text-[12px] text-txt2"
      >
        ›
      </button>
      <div className="flex-none h-[6px]" />
      {MOCK_EPICS.map((epic) => {
        const selected = epic.id === state.selectedEpicId;
        const followed = Boolean(state.follow[epic.id]);
        return (
          <button
            key={epic.id}
            type="button"
            onClick={() => update({ selectedEpicId: epic.id })}
            className={`relative flex-none w-[26px] h-[26px] rounded-[6px] border flex items-center justify-center ${
              selected ? 'border-acc-bd bg-acc-bg' : 'border-bd bg-panel2'
            }`}
          >
            <IconDot tone={epic.tone} size={7} />
            {followed && (
              <span className="absolute text-[8px] text-acc-txt" style={{ top: -1, right: -1 }}>★</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
