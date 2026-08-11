// v3/screens/builder/FlowCards.tsx — Builder → Workflows.
import React from 'react';
import { mock } from '../../components';
import { MOCK_FLOWS } from '../../data/mock-data';

export default function FlowCards() {
  return (
    <div {...mock('builder.flows', 'block')} className="grid grid-cols-2 gap-[12px]">
      {MOCK_FLOWS.map((flow) => (
        <div key={flow.id} className="bg-panel border border-bd rounded-[8px] p-[13px] flex flex-col gap-[10px]">
          <div className="flex items-center gap-[8px]">
            <span className="flex-1 min-w-0 font-v3-mono text-[12.5px] font-semibold text-txt whitespace-nowrap overflow-hidden text-ellipsis">
              {flow.id}
            </span>
            <span className="flex-none text-[11px] text-txt3">{flow.steps} step</span>
          </div>

          <div className="flex items-center">
            {flow.nodes.map((node, i) => (
              <div key={i} className="flex-1 flex items-center min-w-0">
                <div className="flex-1 h-[1px] bg-bd" />
                <span className="flex-none p-[3px_8px] rounded-[5px] border border-bd bg-panel2 text-[10.5px] text-txt2 whitespace-nowrap">
                  {node}
                </span>
                <div className="flex-1 h-[1px] bg-bd" />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-[12px]">
            <button type="button" onClick={() => {}} className="text-[11.5px] text-txt2">Edit</button>
            <button type="button" onClick={() => {}} className="text-[11.5px] text-txt2">Generate from recipe</button>
            <button type="button" onClick={() => {}} className="text-[11.5px] text-err">Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
