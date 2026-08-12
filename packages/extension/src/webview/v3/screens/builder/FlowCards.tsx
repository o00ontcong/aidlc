// v3/screens/builder/FlowCards.tsx — Builder → Workflows.
import React from 'react';
import { useUiStore } from '../../state/store';
import { useApplicationClient, type RegistryPipeline } from '../../applicationClient';

export default function FlowCards() {
  const { registry, command } = useApplicationClient();
  const { update } = useUiStore();
  const edit = (pipeline: RegistryPipeline) => update({ addOpen: true, addSrc: 'Workflows', addId: pipeline.id });
  const remove = async (pipeline: RegistryPipeline) => {
    if (pipeline.source === 'bundled' || !window.confirm(`Delete project pipeline "${pipeline.id}"?`)) return;
    const result = await command('registry.pipeline.delete', { id: pipeline.id });
    if (result.status === 'error') window.alert(String((result.data as { message?: string })?.message ?? 'Unable to delete pipeline.'));
  };
  return (
    <div className="grid grid-cols-2 gap-[12px]">
      {registry.pipelines.map((flow) => (
        <div key={flow.id} className="bg-panel border border-bd rounded-[8px] p-[13px] flex flex-col gap-[10px]">
          <div className="flex items-center gap-[8px]">
            <span className="flex-1 min-w-0 font-v3-mono text-[12.5px] font-semibold text-txt whitespace-nowrap overflow-hidden text-ellipsis">
              {flow.id}
            </span>
            <span className="flex-none text-[11px] text-txt3">{flow.steps.length} step · {flow.source}</span>
          </div>

          <div className="flex items-center">
            {flow.steps.map((step, i) => (
              <div key={i} className="flex-1 flex items-center min-w-0">
                <div className="flex-1 h-[1px] bg-bd" />
                <span className="flex-none p-[3px_8px] rounded-[5px] border border-bd bg-panel2 text-[10.5px] text-txt2 whitespace-nowrap">
                  {step.id}
                </span>
                <div className="flex-1 h-[1px] bg-bd" />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-[12px]">
            <button type="button" onClick={() => edit(flow)} className="text-[11.5px] text-txt2">{flow.source === 'bundled' ? 'Copy to project' : 'Edit'}</button>
            <button type="button" onClick={() => void command('registry.pipeline.generateFromRecipe', {}).then((result) => { if (result.status === 'error') window.alert(String((result.data as { message?: string })?.message ?? 'Unable to open recipe generator.')); })} className="text-[11.5px] text-txt2">Generate from recipe</button>
            {flow.source !== 'bundled' && <button type="button" onClick={() => void remove(flow)} className="text-[11.5px] text-err">Delete</button>}
          </div>
        </div>
      ))}
      {!registry.pipelines.length && <div className="col-span-2 p-[13px] border border-bd rounded-[8px] text-[12px] text-txt3">No pipelines yet. Add one to create a project pipeline.</div>}
    </div>
  );
}
