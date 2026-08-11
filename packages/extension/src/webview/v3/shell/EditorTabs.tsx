// v3/shell/EditorTabs.tsx — §3. Editor tab strip chrome mock (2 tabs).
import React from 'react';
import { MOCK_EDITOR_TABS } from '../data/mock-data';
import { mock } from '../components';

export function EditorTabs() {
  return (
    <div className="h-[34px] flex-none flex items-stretch bg-side border-b border-bd" {...mock('shell.editorTabs', 'block')}>
      <div
        className="flex items-center px-[14px] gap-[8px] bg-bg text-txt text-[12px] border-r border-bd border-t"
        style={{ borderTopColor: 'var(--acc)' }}
      >
        <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{MOCK_EDITOR_TABS[0]}</span>
      </div>
      <div className="flex items-center px-[14px] text-txt3 text-[12px] border-r border-bd">
        <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis font-v3-mono">{MOCK_EDITOR_TABS[1]}</span>
      </div>
    </div>
  );
}
