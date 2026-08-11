// v3/screens/StudioScreen.tsx — Tab Studio: workflow pack · model provider · capabilities · artifact policy.
import React from 'react';
import { Card, Button, Toggle, CodeBlock } from '../components';
import { toneColor } from '../lib/tone';
import { CATALOG_PACKS, MOCK_PROVIDERS, MOCK_CAPABILITIES, MOCK_POLICY_LINES } from '../data/mock-data';
import { useUiStore } from '../state/store';

const KIND_CLS: Record<'bundled' | 'optional', string> = {
  bundled: 'bg-hover text-txt2',
  optional: 'bg-acc-bg text-acc-txt',
};

export default function StudioScreen() {
  const { state, update } = useUiStore();

  return (
    <div className="overflow-auto p-[20px_22px] flex flex-col gap-[16px]">
      {/* Workflow pack */}
      <div className="flex flex-col gap-[10px]">
        <div className="flex flex-col gap-[2px]">
          <div className="text-[13px] font-semibold text-txt">Workflow pack</div>
          <div className="text-[11px] text-txt3">Pack pipeline mặc định áp dụng cho toàn bộ project.</div>
        </div>
        <div className="grid grid-cols-4 gap-[10px]">
          {CATALOG_PACKS.map((p) => {
            const active = state.pack === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => update({ pack: p.id })}
                className={`text-left flex flex-col gap-[7px] p-[13px] rounded-[8px] border ${
                  active ? 'bg-acc-bg border-acc-bd' : 'bg-panel border-bd'
                }`}
              >
                <span className="font-v3-mono text-[12.5px] font-semibold text-txt">{p.id}</span>
                <span className="text-[11.5px] text-txt2">{p.desc}</span>
                <span className="text-[11px] text-txt3">{p.agents}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-[16px]">
        {/* Model provider */}
        <Card
          title="Model provider"
          mockId="studio.providers"
          mockLevel="block"
          right={<Button label="Check providers" variant="default" size="sm" onClick={() => {}} />}
        >
          {MOCK_PROVIDERS.map((p) => (
            <div key={p.id} className="flex items-center gap-[11px] p-[11px_14px] border-b border-bd2 last:border-b-0">
              <span className="flex-none text-[12px]" style={{ color: toneColor(p.tone) }}>{p.mark}</span>
              <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
                <span className="font-v3-mono text-[12.5px] text-txt whitespace-nowrap overflow-hidden text-ellipsis">
                  {p.id}
                </span>
                <span className="text-[11px] text-txt3 whitespace-nowrap overflow-hidden text-ellipsis">{p.note}</span>
              </div>
              <span className={`flex-none text-[11.5px] ${p.action === 'Đang dùng' ? 'text-txt3' : 'text-acc-txt'}`}>
                {p.action}
              </span>
            </div>
          ))}
        </Card>

        {/* Capabilities */}
        <Card title="Capabilities" mockId="studio.capabilities" mockLevel="block">
          {MOCK_CAPABILITIES.map((c) => {
            const on = Boolean(state.capsEnabled[c.name]);
            return (
              <div
                key={c.name}
                className="flex items-center gap-[11px] p-[11px_14px] border-b border-bd2 last:border-b-0"
              >
                <span className="flex-none text-[11px]" style={{ color: c.healthy ? 'var(--acc)' : 'var(--err)' }}>
                  {c.healthy ? '✓' : '✕'}
                </span>
                <div className="flex-1 min-w-0 flex items-center gap-[8px]">
                  <span className="font-v3-mono text-[12.5px] text-txt whitespace-nowrap overflow-hidden text-ellipsis">
                    {c.name}
                  </span>
                  <span className={`flex-none rounded-[4px] px-[6px] py-[2px] text-[10px] ${KIND_CLS[c.kind]}`}>
                    {c.kind}
                  </span>
                </div>
                <Toggle
                  size="capability"
                  on={on}
                  onClick={() =>
                    update((prev) => ({ capsEnabled: { ...prev.capsEnabled, [c.name]: !prev.capsEnabled[c.name] } }))
                  }
                />
              </div>
            );
          })}
        </Card>
      </div>

      {/* Artifact policy */}
      <Card
        title="Artifact policy"
        chips={[{ label: '.aidlc/artifacts.yaml', mono: true }]}
        right={<span className="flex-none text-[11.5px] text-acc-txt">✓ JSON hợp lệ</span>}
        actions={[{ label: 'Save', command: 'noop', variant: 'primary' }]}
        bodyClassName="p-[12px_14px]"
        footer={
          <div className="p-[9px_14px] border-t border-bd2 text-[11.5px] text-txt3">
            Áp dụng cho mọi artifact được tạo trong pipeline hiện tại.
          </div>
        }
        mockId="studio.policy"
        mockLevel="block"
      >
        <CodeBlock lines={MOCK_POLICY_LINES} bg="panel2" pad="13_14" whiteSpacePre />
      </Card>
    </div>
  );
}
