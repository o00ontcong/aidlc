// v3/shell/sidebar/TemplateChips.tsx — §4.3. Workflow template chips (CATALOG, không mock).
import React from 'react';
import { CATALOG_TEMPLATES } from '../../data/mock-data';
import { SectionHeader } from '../../components';

export function TemplateChips() {
  return (
    <div className="flex flex-col gap-[8px]">
      <SectionHeader label="Workflow templates" />
      <div className="flex flex-wrap gap-[5px]">
        {CATALOG_TEMPLATES.map((tpl) => (
          <span
            key={tpl}
            className="font-v3-mono text-[11px] p-[4px_8px] rounded-[5px] bg-panel2 border border-bd text-txt2"
          >
            {tpl}
          </span>
        ))}
      </div>
    </div>
  );
}
