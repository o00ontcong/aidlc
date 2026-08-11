// v3/shell/sidebar/McpList.tsx — §4.4. MCP servers list.
import React from 'react';
import { MOCK_MCP } from '../../data/mock-data';
import { SectionHeader, mock } from '../../components';

export function McpList() {
  return (
    <div className="flex flex-col gap-[8px]" {...mock('sidebar.mcp', 'block')}>
      <SectionHeader
        label="MCP servers"
        right={
          <button type="button" onClick={() => {}} className="flex-none text-[11px] text-txt3">
            ⟳
          </button>
        }
      />
      <div className="flex flex-col gap-[6px]">
        {MOCK_MCP.map((srv) => (
          <div
            key={srv.name}
            className="flex items-center p-[5px_8px] rounded-[6px] bg-panel2 border border-bd gap-[6px]"
          >
            <span className={srv.healthy ? 'text-acc' : 'text-txt3'}>{srv.healthy ? '●' : '○'}</span>
            <span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis font-v3-mono text-[11.5px] text-txt">
              {srv.name}
            </span>
            <span className="flex-none text-[10.5px] text-txt3">{srv.state}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
