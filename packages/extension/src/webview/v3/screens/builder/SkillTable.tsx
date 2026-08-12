// v3/screens/builder/SkillTable.tsx — Builder → Skills.
import React from 'react';
import { Card } from '../../components';
import { useUiStore } from '../../state/store';
import { useApplicationClient, type RegistrySkill } from '../../applicationClient';

const SOURCE_CLS: Record<RegistrySkill['source'], string> = {
  design: 'bg-acc-bg text-acc-txt',
  custom: 'bg-warn-bg text-warn',
  bundled: 'bg-hover text-txt2',
};

export default function SkillTable() {
  const { registry, command } = useApplicationClient();
  const { update } = useUiStore();
  const remove = async (skill: RegistrySkill) => {
    if (!skill.scope || !window.confirm(`Delete ${skill.scope} skill "${skill.id}"?`)) return;
    const result = await command('registry.skill.delete', { id: skill.id, scope: skill.scope });
    if (result.status === 'error') window.alert(String((result.data as { message?: string })?.message ?? 'Unable to delete skill.'));
  };
  return (
    <Card
      footer={
        <div className="p-[9px_14px] border-t border-bd2 text-[11.5px] text-txt3">
          Thêm skill bằng 4 cách: chọn template · dán nội dung · upload file · tạo blank.
        </div>
      }
    >
      {registry.skills.map((skill, i) => (
        <div
          key={skill.id}
          className={`flex items-center p-[9px_14px] gap-[11px] ${i < registry.skills.length - 1 ? 'border-b border-bd2' : ''}`}
        >
          <span className="flex-none w-[150px] font-v3-mono text-[12.5px] text-txt whitespace-nowrap overflow-hidden text-ellipsis">
            {skill.id}
          </span>
          <span className="flex-1 min-w-0 text-[11.5px] text-txt3 whitespace-nowrap overflow-hidden text-ellipsis">
            {skill.description}
          </span>
          <span className={`flex-none rounded-[5px] px-[8px] py-[2px] text-[10.5px] whitespace-nowrap ${SOURCE_CLS[skill.source]}`}>
            {skill.source}
          </span>
          <span className="text-[10.5px] text-txt3">{skill.scope}</span>
          <button type="button" onClick={() => update({ addOpen: true, addSrc: 'Skills', addId: skill.id })} className="flex-none text-[11.5px] text-txt2">Edit</button>
          <button type="button" onClick={() => void remove(skill)} className="flex-none text-[11.5px] text-err">Delete</button>
        </div>
      ))}
      {!registry.skills.length && <div className="p-[14px] text-[12px] text-txt3">No skills found in project or global scope.</div>}
    </Card>
  );
}
