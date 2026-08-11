// v3/shell/sidebar/RecentEpics.tsx — §4.2. Recent epics (top 3).
import React from 'react';
import { MOCK_EPICS } from '../../data/mock-data';
import { useUiStore } from '../../state/store';
import { IconDot, SectionHeader, mock } from '../../components';

export function RecentEpics() {
  const { state, update } = useUiStore();
  const recent = MOCK_EPICS.slice(0, 3);

  return (
    <div className="flex flex-col gap-[8px]" {...mock('sidebar.recent', 'block')}>
      <SectionHeader
        label="Recent epics"
        right={
          <button
            type="button"
            onClick={() => update({ tab: 'Epics' })}
            className="flex-none text-[11px] text-acc-txt"
          >
            Tất cả
          </button>
        }
      />
      <div className="flex flex-col gap-[6px]">
        {recent.map((epic) => {
          const starred = !!state.follow[epic.id];
          return (
            <div
              key={epic.id}
              onClick={() => update({ tab: 'Epics', selectedEpicId: epic.id })}
              className="flex items-center p-[6px_8px] rounded-[6px] bg-panel2 border border-bd gap-[8px] cursor-pointer"
            >
              <IconDot tone={epic.tone} size={7} />
              <span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[12px] text-txt">
                {epic.title}
              </span>
              <span className="flex-none text-[11px] text-acc-txt">{starred ? '★' : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
