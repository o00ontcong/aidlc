// v3/screens/builder/PresetCard.tsx — Preset · Redraw Design card.
import React from 'react';
import { Card, Button, Chip } from '../../components';
import { PRESET_HEADER, PRESET_SKILLS, PRESET_STEPS } from '../../data/mock-data';
import { useUiStore } from '../../state/store';

export default function PresetCard() {
  const { state, update } = useUiStore();

  return (
    <Card className="border-acc-bd">
      <div className="flex-none flex flex-wrap items-center gap-[9px] p-[10px_14px] border-b border-bd">
        <div className="text-[12.5px] font-semibold text-txt whitespace-nowrap">{PRESET_HEADER.title}</div>
        <Chip label={PRESET_HEADER.chip} tone="acc" mono />
        <div className="flex-1 min-w-0 text-[11px] text-txt3">{PRESET_HEADER.desc}</div>
        <Button
          label={state.presetApplied ? 'Đã cài · Xem pipeline' : 'Apply preset'}
          variant="primary"
          size="sm"
          onClick={() => update({ presetApplied: true, toastOpen: true, builderTab: 'Workflows' })}
        />
        <Button
          label={state.presetOpen ? 'Ẩn chi tiết' : 'Xem chi tiết'}
          variant="default"
          size="sm"
          onClick={() => update({ presetOpen: !state.presetOpen })}
        />
      </div>

      {state.presetOpen && (
        <div className="p-[12px_14px] grid grid-cols-2 gap-[12px]">
          {/* left: skills preset */}
          <div className="flex flex-col gap-[8px] min-w-0">
            <div className="text-[10.5px] uppercase tracking-[.09em] font-semibold text-txt3">
              Skills preset cài vào
            </div>
            {PRESET_SKILLS.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-[8px] p-[7px_10px] rounded-[6px] border border-acc-bd bg-panel2 min-w-0"
              >
                <span className="flex-none text-acc-txt text-[11.5px]">✓</span>
                <span className="flex-none font-v3-mono text-[11.5px] text-txt">{s.id}</span>
                <span className="flex-1 min-w-0 text-[11px] text-txt3 whitespace-nowrap overflow-hidden text-ellipsis">
                  {s.desc}
                </span>
              </div>
            ))}
          </div>

          {/* right: steps của redraw-design */}
          <div className="flex flex-col gap-[8px] min-w-0">
            <div className="text-[10.5px] uppercase tracking-[.09em] font-semibold text-txt3">
              Step của redraw-design
            </div>
            {PRESET_STEPS.map((step) => (
              <div
                key={step.i}
                className={`flex flex-col gap-[4px] p-[7px_10px] rounded-[6px] border ${
                  step.tag === 'human gate' ? 'border-err-bd' : 'border-bd'
                }`}
              >
                <div className="flex items-center gap-[8px]">
                  <span className="flex-none w-[14px] font-v3-mono text-[11.5px] text-txt3">{step.i}</span>
                  <span className="flex-1 min-w-0 font-v3-mono text-[11.5px] text-txt">{step.name}</span>
                  <span
                    className={`flex-none text-[10px] p-[2px_6px] rounded-[4px] ${
                      step.tag === 'human gate' ? 'bg-err-bg text-err' : 'bg-hover text-txt2'
                    }`}
                  >
                    {step.tag}
                  </span>
                </div>
                <div className="text-[11px] text-txt3">{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
