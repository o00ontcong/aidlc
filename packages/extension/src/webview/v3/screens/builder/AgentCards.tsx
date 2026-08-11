// v3/screens/builder/AgentCards.tsx — Builder → Agents.
import React from 'react';
import { mock, Chip } from '../../components';
import { MOCK_AGENTS } from '../../data/mock-data';

export default function AgentCards() {
  return (
    <div {...mock('builder.agents', 'block')} className="grid grid-cols-2 gap-[12px]">
      {MOCK_AGENTS.map((agent) => (
        <div key={agent.name} className="bg-panel border border-bd rounded-[8px] p-[13px] flex flex-col gap-[9px]">
          <div className="flex items-center gap-[8px]">
            <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-txt whitespace-nowrap overflow-hidden text-ellipsis">
              {agent.name}
            </span>
            <Chip label={agent.tier} tone="acc" mono />
          </div>

          {agent.desc && <div className="text-[11.5px] text-txt3">{agent.desc}</div>}

          <div className="font-v3-mono text-[11px] text-txt3 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
            {agent.model}
          </div>

          <div className="flex flex-wrap gap-[6px]">
            {agent.skills.map((s) => (
              <span key={s} className="flex-none rounded-[5px] px-[8px] py-[2px] text-[11px] bg-hover text-txt2 whitespace-nowrap">
                {s}
              </span>
            ))}
          </div>

          {agent.capabilities && (
            <div className="flex flex-col gap-[6px]">
              <div className="flex flex-wrap items-center gap-[6px]">
                <span className="flex-none text-[11px] text-txt3">capabilities</span>
                {agent.capabilities.map((c) => (
                  <span key={c} className="flex-none rounded-[5px] px-[8px] py-[2px] text-[11px] bg-acc-bg text-acc-txt whitespace-nowrap">
                    {c}
                  </span>
                ))}
              </div>
              <div className="bg-panel2 rounded-[6px] p-[6px_9px] font-v3-mono text-[10.5px] text-txt3 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                {agent.frontmatter}
              </div>
            </div>
          )}

          <div className="flex items-center gap-[12px]">
            <button type="button" onClick={() => {}} className="text-[11.5px] text-txt2">Edit</button>
            <button type="button" onClick={() => {}} className="text-[11.5px] text-txt2">Rename</button>
            <button type="button" onClick={() => {}} className="text-[11.5px] text-err">Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
