// v3/shell/Sidebar.tsx — §4. Left sidebar: project bar, actions, quota, recent,
// templates, mcp, footer.
import React from 'react';
import { MOCK_WORKSPACE_NAME } from '../data/mock-data';
import { mock } from '../components';
import { QuotaTracker, RecentEpics, TemplateChips, McpList } from './sidebar/index';

export function Sidebar() {
  return (
    <div className="w-[300px] flex-none flex flex-col min-h-0 bg-side border-r border-bd">
      {/* Project bar */}
      <div className="flex-none flex items-center pt-[11px] px-[12px] pb-[9px] border-b border-bd gap-[8px]">
        <span className="flex-none text-[10px] uppercase tracking-[.09em] font-semibold text-txt3">Project</span>
        <span
          className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[12.5px] font-semibold text-txt"
          {...mock('shell.workspaceName')}
        >
          {MOCK_WORKSPACE_NAME}
        </span>
        <button type="button" className="flex-none text-[11px] border border-bd rounded-[5px] p-[3px_7px] text-txt2">
          Đổi
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-[11px_12px] flex flex-col gap-[14px]">
        <div className="flex-none flex items-center gap-[8px]">
          <button
            type="button"
            className="flex-1 text-center p-[8px] rounded-[6px] text-[12px] font-semibold bg-acc text-on-acc"
          >
            Ask AIDLC
          </button>
          <button
            type="button"
            className="flex-1 text-center p-[8px] rounded-[6px] text-[12px] border border-bd text-txt"
          >
            Analyze
          </button>
        </div>

        <QuotaTracker />
        <RecentEpics />
        <TemplateChips />
        <McpList />
      </div>

      {/* Footer */}
      <div className="flex-none p-[11px_12px]">
        <button
          type="button"
          className="w-full p-[9px] rounded-[6px] border border-acc-bd text-acc-txt text-[12px] font-semibold text-center"
        >
          Mở Workspace
        </button>
      </div>
    </div>
  );
}
