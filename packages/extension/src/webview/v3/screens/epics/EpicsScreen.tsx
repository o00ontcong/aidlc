// v3/screens/epics/EpicsScreen.tsx — top-level Epics tab. Self-contained via
// useUiStore(); App.tsx just renders <EpicsScreen /> when tab === 'Epics'.
import React from 'react';
import { useUiStore } from '../../state/store';
import { findEpic, buildEpicDetail } from '../../state/epicDetail';
import { EpicList } from './EpicList';
import { EpicRail } from './EpicRail';
import { EpicDetail } from './EpicDetail';

export function EpicsScreen() {
  const { state } = useUiStore();
  const selectedEpic = findEpic(state.selectedEpicId);
  const detail = buildEpicDetail(selectedEpic);

  return (
    <div className="h-full flex min-h-0">
      {state.listCollapsed ? <EpicRail /> : <EpicList />}
      <div className="flex-1 min-w-0 overflow-auto p-[16px_18px] flex flex-col gap-[14px]">
        <EpicDetail epic={selectedEpic} detail={detail} />
      </div>
    </div>
  );
}
