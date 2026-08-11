// v3/shell/ViewTabs.tsx — §... top-level view tab strip (Home/Epics/Builder/...).
import React from 'react';
import type { TabId } from '../data/types';
import { useUiStore } from '../state/store';

const TABS: TabId[] = ['Home', 'Epics', 'Builder', 'Analyze', 'Tests', 'Guide', 'Studio'];

export function ViewTabs() {
  const { state, update } = useUiStore();
  return (
    <div className="flex-none flex items-center px-[10px] border-b border-bd bg-panel gap-[2px]">
      {TABS.map((t) => {
        const active = state.tab === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => update({ tab: t })}
            className={`py-[11px] px-[13px] text-[12.5px] font-medium border-b-2 ${
              active ? 'text-txt' : 'text-txt3'
            }`}
            style={{ borderBottomColor: active ? 'var(--acc)' : 'transparent' }}
          >
            {t}
          </button>
        );
      })}
      <div className="flex-1" />
      <div className="flex-none flex items-center gap-[6px]">
        <span
          className="w-[7px] h-[7px] rounded-full inline-block"
          style={{ background: 'var(--acc)', animation: 'aidlcPulse 1.6s ease-in-out infinite' }}
        />
        <span className="text-[11px] text-txt2">Live</span>
      </div>
    </div>
  );
}
