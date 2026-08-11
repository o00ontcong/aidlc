// v3/shell/TitleBar.tsx — §1. macOS-style title bar chrome mock.
import React from 'react';
import { MOCK_WORKSPACE_NAME } from '../data/mock-data';
import { mock } from '../components';

export function TitleBar() {
  return (
    <div className="h-[36px] flex-none flex items-center bg-chrome border-b border-bd px-[13px] gap-[12px]">
      <div className="flex-none flex items-center gap-[7px]">
        <span className="w-[10px] h-[10px] rounded-full inline-block" style={{ background: '#FF5F57' }} />
        <span className="w-[10px] h-[10px] rounded-full inline-block" style={{ background: '#FEBC2E' }} />
        <span className="w-[10px] h-[10px] rounded-full inline-block" style={{ background: '#28C840' }} />
      </div>
      <div className="flex-1 text-center min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[11.5px] text-txt2">
        <span {...mock('shell.workspaceName')}>{`${MOCK_WORKSPACE_NAME} — Visual Studio Code`}</span>
      </div>
      <div className="flex-none w-[56px]" />
    </div>
  );
}
