// v3/screens/GuideScreen.tsx — Tab Guide: help step · ví dụ cấu hình · test redraw · doctor · log.
import React from 'react';
import { Card, KVRow, CodeBlock, Chip, mock } from '../components';
import { toneColor } from '../lib/tone';
import { MOCK_HELP, EXAMPLE_LINES, MOCK_REDRAW_TESTS, MOCK_DOCTOR, MOCK_EVENTS } from '../data/mock-data';
import { useUiStore } from '../state/store';

export default function GuideScreen() {
  const { state, update } = useUiStore();

  return (
    <div className="overflow-auto p-[20px_22px] grid grid-cols-[1.1fr_1fr] gap-[16px] content-start">
      {/* Left: help của step đang chọn */}
      <Card title="Build · destructive migration" mockId="guide.help" mockLevel="block">
        {MOCK_HELP.map((h) => (
          <KVRow
            key={h.k}
            k={h.k}
            v={h.k === 'why' ? <span className="text-acc-txt">{h.v}</span> : h.v}
            kWidth={80}
            kMono={false}
            kSize="11"
          />
        ))}
      </Card>

      {/* Right column */}
      <div className="flex flex-col gap-[14px] min-w-0">
        {/* Ví dụ cấu hình */}
        <Card
          title="Ví dụ cấu hình · Redraw Design"
          className="border-acc-bd"
          bodyClassName="p-[12px_14px]"
          right={
            <button type="button" onClick={() => {}} className="flex-none text-[11.5px] text-acc-txt">
              Copy
            </button>
          }
        >
          <CodeBlock lines={EXAMPLE_LINES} bg="panel2" whiteSpacePre />
        </Card>

        {/* Test cho Redraw Design */}
        <Card
          title="Test cho Redraw Design"
          chips={[{ label: '7 test · pass', tone: 'acc' }]}
          mockId="guide.redrawTests"
          mockLevel="block"
        >
          {MOCK_REDRAW_TESTS.map((t, i) => (
            <div
              key={i}
              className="flex items-center gap-[9px] p-[9px_14px] border-b border-bd2 last:border-b-0"
            >
              <span className="flex-none text-[11.5px]" style={{ color: toneColor(t.tone) }}>{t.mark}</span>
              <span className="flex-1 min-w-0 text-[11.5px] text-txt2 whitespace-nowrap overflow-hidden text-ellipsis">
                {t.label}
              </span>
              <span className="flex-none font-v3-mono text-[10.5px] text-txt3">{t.file}</span>
            </div>
          ))}
        </Card>

        {/* Doctor */}
        <Card
          title="Doctor"
          mockId="guide.doctor"
          mockLevel="block"
          right={
            <button type="button" onClick={() => {}} className="flex-none text-[11.5px] text-acc-txt">
              Chạy --fix
            </button>
          }
        >
          {MOCK_DOCTOR.map((d, i) => (
            <div key={i} className="flex items-center gap-[11px] p-[11px_14px] border-b border-bd2 last:border-b-0">
              <span className="flex-none text-[12px]" style={{ color: toneColor(d.tone) }}>{d.mark}</span>
              <span className="flex-1 min-w-0 text-[12.5px] text-txt whitespace-nowrap overflow-hidden text-ellipsis">
                {d.label}
              </span>
              {d.action === 'Fix' && <span className="flex-none text-[11.5px] text-warn">{d.action}</span>}
            </div>
          ))}
        </Card>

        {/* Log nâng cao */}
        <div
          {...mock('guide.events', 'block')}
          className="flex flex-col gap-[10px] p-[11px_14px] rounded-[8px] border border-bd"
        >
          <button
            type="button"
            onClick={() => update({ logsOpen: !state.logsOpen })}
            className="flex items-center gap-[8px] text-left w-full"
          >
            <span className="flex-none text-[10px] text-txt3">{state.logsOpen ? '▾' : '▸'}</span>
            <span className="flex-1 min-w-0 text-[12px] text-txt2 whitespace-nowrap overflow-hidden text-ellipsis">
              Log nâng cao · 20 event gần nhất
            </span>
            <Chip label="debug" />
          </button>
          {state.logsOpen && (
            <CodeBlock lines={MOCK_EVENTS.slice(0, 5).map((t) => ({ t, tone: 'muted' as const }))} bg="panel" />
          )}
        </div>
      </div>
    </div>
  );
}
