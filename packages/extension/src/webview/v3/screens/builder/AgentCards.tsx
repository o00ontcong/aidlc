// v3/screens/builder/AgentCards.tsx — Builder → Agents.
import React from 'react';
import { Chip } from '../../components';
import { useUiStore } from '../../state/store';
import { useApplicationClient, type RegistryAgent } from '../../applicationClient';

export default function AgentCards() {
  const { registry, command } = useApplicationClient();
  const { update } = useUiStore();
  const remove = async (agent: RegistryAgent) => {
    if (!agent.scope || !window.confirm(`Delete ${agent.scope} agent "${agent.id}"?`)) return;
    const result = await command('registry.agent.delete', { id: agent.id, scope: agent.scope });
    if (result.status === 'error') window.alert(String((result.data as { message?: string })?.message ?? 'Unable to delete agent.'));
  };
  return (
    <div className="grid grid-cols-2 gap-[12px]">
      {registry.agents.map((agent) => (
        <div key={agent.id} className="bg-panel border border-bd rounded-[8px] p-[13px] flex flex-col gap-[9px]">
          <div className="flex items-center gap-[8px]">
            <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-txt whitespace-nowrap overflow-hidden text-ellipsis">
              {agent.name} <span className="font-v3-mono text-txt3">({agent.id})</span>
            </span>
            <Chip label={agent.tier} tone="acc" mono />
          </div>

          <div className="text-[11.5px] text-txt3">{agent.description}</div>

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
                scope: {agent.scope ?? 'unknown'} · skills: [{agent.skills.join(', ')}]
              </div>
            </div>
          )}

          <div className="flex items-center gap-[12px]">
            <button type="button" onClick={() => update({ addOpen: true, addSrc: 'Agents', addId: agent.id })} className="text-[11.5px] text-txt2">Edit</button>
            <button type="button" onClick={() => update({ addOpen: true, addSrc: 'Agents', addId: agent.id })} className="text-[11.5px] text-txt2">Rename</button>
            <button type="button" onClick={() => void remove(agent)} className="text-[11.5px] text-err">Delete</button>
          </div>
        </div>
      ))}
      {!registry.agents.length && <div className="col-span-2 p-[13px] border border-bd rounded-[8px] text-[12px] text-txt3">No agents found in project or global scope.</div>}
    </div>
  );
}
