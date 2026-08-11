// v3/screens/HomeScreen.tsx — Tab Home: Project readiness · Current epic · Blocked banner.
import React from 'react';
import { Card, Button, ProgressBar, mock } from '../components';
import { toneColor, toneBorder } from '../lib/tone';
import { MOCK_READINESS, MOCK_HOME_CURRENT, MOCK_HOME_BLOCKED, MOCK_RECOVERY } from '../data/mock-data';
import { useUiStore } from '../state/store';

export default function HomeScreen() {
  const { state, update } = useUiStore();

  return (
    <div className="overflow-auto p-[20px_22px] flex flex-col gap-[16px]">
      <div className="grid grid-cols-[1fr_1.25fr] gap-[16px]">
        {/* Project readiness */}
        <Card title="Project readiness" mockId="home.readiness" mockLevel="block">
          {MOCK_READINESS.map((r, i) => (
            <div
              key={i}
              className="flex items-center p-[11px_14px] gap-[11px] border-b border-bd2 last:border-b-0"
            >
              <span className="flex-none text-[12px]" style={{ color: toneColor(r.tone) }}>{r.mark}</span>
              <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
                <div className="text-[12.5px] text-txt min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{r.label}</div>
                <div className="text-[11px] font-v3-mono text-txt3 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{r.value}</div>
              </div>
              <button
                type="button"
                onClick={() => {}}
                style={{ borderColor: toneBorder(r.actionTone), color: toneColor(r.actionTone) }}
                className="flex-none whitespace-nowrap rounded-[6px] px-[10px] py-[5px] text-[11.5px] border bg-transparent"
              >
                {r.action}
              </button>
            </div>
          ))}
        </Card>

        {/* Current epic */}
        <div
          {...mock('home.current', 'block')}
          className="bg-panel border border-acc-bd rounded-[8px] p-[16px] flex flex-col gap-[12px]"
        >
          <div className="text-[10.5px] uppercase tracking-[.09em] font-semibold text-acc-txt">Current epic</div>
          <div className="text-[16px] font-bold text-txt min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
            {MOCK_HOME_CURRENT.title}
          </div>
          <div className="text-[12.5px] text-txt2">{MOCK_HOME_CURRENT.body}</div>
          <div className="flex items-center gap-[10px]">
            <ProgressBar height={6} tone="acc" pct={62} className="flex-1" />
            <span className="flex-none text-[11.5px] font-v3-mono text-txt3">{MOCK_HOME_CURRENT.pct}</span>
            <span className="flex-none rounded-full p-[7px_11px] border border-acc-bd bg-acc-bg text-acc-txt text-[12px] font-semibold font-v3-mono">
              {state.mode}
            </span>
          </div>
          <div className="flex gap-[8px]">
            <Button label="Mở Epic" variant="primary" onClick={() => update({ tab: 'Epics' })} />
            <Button label="Duyệt gate" variant="default" onClick={() => update({ gateOpen: true })} />
          </div>
        </div>
      </div>

      {/* Blocked banner */}
      <div
        {...mock('home.blocked', 'block')}
        className="bg-panel border border-err-bd rounded-[8px] p-[16px] flex flex-col gap-[11px]"
      >
        <div className="flex items-center gap-[9px]">
          <span className="flex-none text-[13px] text-err">■</span>
          <span className="text-[13px] font-semibold text-txt min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
            {MOCK_HOME_BLOCKED}
          </span>
        </div>
        <div className="flex flex-wrap gap-[8px]">
          {MOCK_RECOVERY.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {}}
              className="text-[12px] p-[7px_12px] rounded-[6px] border border-bd bg-panel2 text-txt2"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
