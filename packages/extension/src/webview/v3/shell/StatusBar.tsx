// v3/shell/StatusBar.tsx — §... bottom status bar (accent background, VS Code style).
import React from 'react';
import { useUiStore } from '../state/store';
import { statusBarFor } from '../state/selectors';
import { MOCK_EPICS } from '../data/mock-data';

export function StatusBar() {
  const { state } = useUiStore();
  const epicState = MOCK_EPICS.find((e) => e.id === state.selectedEpicId)?.state;
  const { branch, status, cmdHint } = statusBarFor(state.tab, {
    epicId: state.selectedEpicId,
    epicState,
    builderTab: state.builderTab,
    platform: state.platform,
    pack: state.pack,
  });
  return (
    <div className="h-[24px] flex-none flex items-center bg-acc px-[12px] gap-[14px] text-on-acc text-[11px] font-medium">
      <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{`⎇ ${branch}`}</span>
      <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{`AIDLC · ${status}`}</span>
      <div className="flex-1" />
      <span className="font-v3-mono min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{cmdHint}</span>
    </div>
  );
}
