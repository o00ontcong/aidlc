// v3/screens/builder/BuilderScreen.tsx — Tab Builder: preset · sub-tabs · Workflows/Agents/Skills.
import React from 'react';
import { Button } from '../../components';
import type { BuilderTabId } from '../../data/types';
import { useUiStore } from '../../state/store';
import PresetCard from './PresetCard';
import FlowCards from './FlowCards';
import AgentCards from './AgentCards';
import SkillTable from './SkillTable';

const SUB_TABS: BuilderTabId[] = ['Workflows', 'Agents', 'Skills'];

const ADD_LABEL: Record<BuilderTabId, string> = {
  Workflows: 'pipeline',
  Agents: 'agent',
  Skills: 'skill',
};

export default function BuilderScreen() {
  const { state, update } = useUiStore();
  const tab = state.builderTab;

  return (
    <div className="overflow-auto p-[18px_20px] flex flex-col gap-[14px]">
      <PresetCard />

      <div className="flex items-center gap-[5px]">
        {SUB_TABS.map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => update({ builderTab: t })}
              className={`p-[7px_13px] rounded-[6px] text-[12px] border ${
                active ? 'border-acc-bd bg-acc-bg text-acc-txt' : 'border-bd text-txt2'
              }`}
            >
              {t}
            </button>
          );
        })}
        <div className="flex-1 min-w-0" />
        <Button
          label={`+ Add ${ADD_LABEL[tab]}`}
          variant="primary"
          onClick={() => update({ addOpen: true, addSrc: tab })}
        />
      </div>

      {tab === 'Workflows' && <FlowCards />}
      {tab === 'Agents' && <AgentCards />}
      {tab === 'Skills' && <SkillTable />}
    </div>
  );
}
