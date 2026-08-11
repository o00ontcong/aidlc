// v3/screens/AnalyzeScreen.tsx — Tab Analyze: form phân tích requirement + recent analyses.
import React from 'react';
import { Card } from '../components';
import { CATALOG_PLATFORMS, MOCK_ANALYZE_FORM, MOCK_ANALYSES } from '../data/mock-data';
import { useUiStore } from '../state/store';

export default function AnalyzeScreen() {
  const { state, update } = useUiStore();

  return (
    <div className="overflow-auto p-[20px_22px] flex gap-[16px]">
      {/* Left: analyze requirement form */}
      <Card
        className="w-[520px] flex-none"
        bodyClassName="p-[16px] flex flex-col gap-[13px]"
        mockId="analyze.form"
        mockLevel="block"
      >
        <div className="text-[13px] font-semibold text-txt">Analyze requirement</div>

        <div className="bg-panel2 min-h-[64px] rounded-[6px] p-[9px_11px] text-[12px] text-txt3">
          Paste content, a file path, or a ticket URL…
        </div>

        <div className="flex gap-[8px]">
          {CATALOG_PLATFORMS.map((p) => {
            const active = state.platform === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => update({ platform: p })}
                className={`flex-1 text-center p-[9px_6px] rounded-[6px] text-[11.5px] border ${
                  active ? 'bg-acc-bg border-acc-bd text-acc-txt' : 'bg-panel2 border-bd text-txt2'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-[10px]">
          <div className="flex flex-col gap-[4px] min-w-0">
            <div className="text-[10.5px] text-txt3">Parent task</div>
            <div className="bg-panel2 border border-bd rounded-[6px] p-[8px_10px] font-v3-mono text-[12px] text-txt min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
              {MOCK_ANALYZE_FORM.parentTask}
            </div>
          </div>
          <div className="flex flex-col gap-[4px] min-w-0">
            <div className="text-[10.5px] text-txt3">Project key</div>
            <div className="bg-panel2 border border-bd rounded-[6px] p-[8px_10px] font-v3-mono text-[12px] text-txt min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
              {MOCK_ANALYZE_FORM.projectKey}
            </div>
          </div>
        </div>

        <div className="bg-acc-bg border border-acc-bd rounded-[6px] p-[9px_11px] flex flex-col gap-[4px]">
          <div className="text-[10px] uppercase tracking-[.09em] font-semibold text-acc-txt">
            XÁC NHẬN TRƯỚC KHI TẠO
          </div>
          <div className="text-[12px] text-txt">{MOCK_ANALYZE_FORM.confirm}</div>
        </div>

        <button
          type="button"
          onClick={() => {}}
          className="w-full p-[10px] rounded-[6px] bg-acc text-on-acc font-semibold text-[12.5px] text-center"
        >
          Proceed
        </button>
      </Card>

      {/* Right: recent analyses */}
      <Card title="RECENT ANALYSES" className="flex-1" mockId="analyze.list" mockLevel="block">
        {MOCK_ANALYSES.map((a) => (
          <div key={a.id} className="flex items-center p-[11px_14px] gap-[11px] border-b border-bd2 last:border-b-0">
            <span className="flex-none font-v3-mono text-[11px] text-txt3">{a.id}</span>
            <span className="flex-1 min-w-0 text-[12.5px] text-txt whitespace-nowrap overflow-hidden text-ellipsis">
              {a.title}
            </span>
            <span className="flex-none text-[11px] text-txt3">{a.meta}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
