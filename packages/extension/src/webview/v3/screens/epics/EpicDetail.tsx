// v3/screens/epics/EpicDetail.tsx — right column, 11 blocks in fixed order.
// EpicsScreen already supplies the `gap-[14px] flex-col` wrapper, so this
// component renders a flat fragment of `flex-none` blocks.
import React from 'react';
import type { EpicRowVM, EpicDetailVM, ExecutionMode } from '../../data/types';
import { MOCK_ARTIFACT_POLICY_COUNT } from '../../data/mock-data';
import { useUiStore } from '../../state/store';
import { toneColor } from '../../lib/tone';
import {
  Button, Card, Chip, StatusBadge, ProgressBar, KVRow, RadioRow, mock,
} from '../../components';
import { GateBanner } from './GateBanner';
import { FlowCanvas } from './FlowCanvas';
import { LifecycleStrip } from './LifecycleStrip';
import { StepList } from './StepList';

const MODE_ORDER: ExecutionMode[] = ['guide', 'assist', 'auto', 'unattended'];
const MODE_DESCRIPTIONS: Record<ExecutionMode, string> = {
  guide: 'Giải thích, không mutate — mặc định',
  assist: 'AI dựng plan/diff, bạn duyệt trước khi ghi',
  auto: 'Tự chạy stage, dừng ở gate cấu hình',
  unattended: 'Chạy xuyên stage, chỉ dừng ở hard gate',
};

export function EpicDetail({ epic, detail }: { epic: EpicRowVM; detail: EpicDetailVM }) {
  const { state, update } = useUiStore();
  const pctNum = parseInt(detail.header.pct, 10) || 0;

  return (
    <>
      {/* ① charter alignment strip */}
      {detail.alignmentWarning && (
        <div
          {...mock('epic.alignment', 'block')}
          className="flex-none flex items-center gap-[10px] rounded-[7px] p-[9px_12px] border border-warn-bd bg-warn-bg"
        >
          <div className="flex-none text-[12px] text-warn">▲</div>
          <div className="flex-1 min-w-0 text-[12px] text-txt leading-[1.5]">{detail.alignmentWarning}</div>
          <span
            onClick={() => update({ tab: 'Guide' })}
            className="flex-none text-[11.5px] font-semibold text-warn cursor-pointer"
          >
            Xem xung đột
          </span>
        </div>
      )}

      {/* ② header epic */}
      <div className="flex-none flex items-start gap-[14px]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[9px]">
            <span className="flex-none font-v3-mono text-[11.5px] text-txt3">{detail.header.id}</span>
            <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[17px] font-bold text-txt">
              {detail.header.title}
            </span>
            <StatusBadge state={epic.state} />
          </div>
          <div className="flex items-center gap-[10px] mt-[9px]">
            <ProgressBar height={6} tone="acc" pct={pctNum} className="flex-1" />
            <span className="flex-none font-v3-mono text-[11.5px] text-txt2">{detail.header.pct}</span>
            <span {...mock('epic.tokens')} className="flex-none font-v3-mono text-[11.5px] text-txt3">
              {detail.header.tokens}
            </span>
          </div>
        </div>

        <div className="relative flex-none">
          <button
            type="button"
            onClick={() => update({ autonomyOpen: !state.autonomyOpen })}
            className="flex items-center gap-[6px] rounded-full p-[7px_11px] border border-acc-bd bg-acc-bg text-acc-txt text-[12px] font-semibold font-v3-mono"
          >
            <span>{state.mode}</span>
            <span className="text-[9px]">▾</span>
          </button>
          {state.autonomyOpen && (
            <div className="absolute right-0 top-[38px] w-[280px] z-10 bg-panel2 border border-bd rounded-[7px] shadow-v3-dropdown">
              {MODE_ORDER.map((m) => (
                <div
                  key={m}
                  onClick={() => update({ mode: m, autonomyOpen: false })}
                  className="p-[9px_11px] border-b border-bd2 cursor-pointer"
                >
                  <div className="font-v3-mono text-[12px] font-semibold text-txt">{m}</div>
                  <div className="text-[11px] text-txt2">{MODE_DESCRIPTIONS[m]}</div>
                </div>
              ))}
              <div className="p-[9px_11px] text-[11px] text-warn bg-warn-bg rounded-b-[7px]">
                Đổi sang unattended sẽ chạy liên tiếp nhiều stage — vẫn dừng ở hard gate.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ③ Project Context card */}
      <Card
        mockId="epic.context"
        title="Project Context"
        chips={[{ label: `project-context · ${detail.contextSteps.length} step`, mono: true }]}
        right={
          <>
            <Chip label={detail.contextBadge} tone="acc" weight="semibold" pill />
            <span className="flex-none text-[11px] text-txt3 whitespace-nowrap">
              baseline chung — mỗi feature epic capture snapshot để chạy độc lập
            </span>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-[5px] p-[10px_14px]">
          {detail.contextSteps.map((s) => (
            <span key={s} className="flex-none flex items-center gap-[5px] p-[4px_9px] rounded-[6px] border border-acc-bd bg-acc-bg">
              <span className="text-[10.5px] text-acc-txt">✓</span>
              <span className="font-v3-mono text-[11px] text-acc-txt">{s}</span>
            </span>
          ))}
          <div className="flex-1 min-w-0" />
          <Button label="Mở context" size="sm" variant="default" />
          <Button label="Refresh context" size="sm" variant="default" className="border-warn-bd text-warn" />
        </div>
      </Card>

      {/* ④ Parallel epics card */}
      <Card
        mockId="epic.parallel"
        title="Feature epic đang chạy song song"
        right={
          <>
            <span className="flex-none text-[11px] text-txt3 whitespace-nowrap">mỗi epic một terminal Claude, một branch, một PR</span>
            <Button label="Kiểm tra độc lập" size="sm" variant="default" />
          </>
        }
        footer={
          <div {...mock('epic.independence')} className="flex-none flex flex-col gap-[5px] p-[10px_14px]">
            {detail.independence.map((ind, i) => (
              <div key={i} className="flex items-center gap-[8px]">
                <span className="flex-none text-[11px]" style={{ color: toneColor(ind.tone) }}>{ind.mark}</span>
                <span className="text-[11.5px] text-txt2">{ind.label}</span>
              </div>
            ))}
          </div>
        }
      >
        <div>
          {detail.parallel.map((p) => (
            <div key={p.id} className="flex items-center gap-[10px] p-[9px_14px] border-b border-bd2">
              <span className="flex-none text-[11px]" style={{ color: toneColor(p.tone) }}>{p.mark}</span>
              <span className="flex-none w-[130px] min-w-0 whitespace-nowrap overflow-hidden text-ellipsis font-v3-mono text-[11.5px] text-txt">
                {p.id}
              </span>
              <span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[12px] text-txt2">
                {p.title}
              </span>
              <span className="flex-none font-v3-mono text-[11px] text-txt3">{p.branch}</span>
              <span className="flex-none w-[52px] text-right font-v3-mono text-[11px] text-txt3">{p.pr}</span>
              <span className="flex-none w-[98px] text-right font-v3-mono text-[11px]" style={{ color: toneColor(p.tone) }}>
                {p.state}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* ⑤ Flow card */}
      <Card
        title="Flow của Feature Epic"
        headerWrap
        chips={[{ label: detail.pipelineLabel, mono: true }]}
        right={
          <span className="flex-none flex items-center gap-[5px] rounded-full px-[9px] py-[3px] text-[10.5px] font-semibold bg-warn-bg text-warn">
            <span
              className="w-[6px] h-[6px] rounded-full bg-warn inline-block"
              style={{ animation: 'aidlcPulse 1.3s ease-in-out infinite' }}
            />
            {detail.atLabel}
          </span>
        }
        footer={<LifecycleStrip lifecycle={detail.lifecycle} />}
      >
        <FlowCanvas nodes={detail.flow.nodes} loop={detail.flow.loop} flowNote={detail.flowNote} />
      </Card>

      {/* ⑥ Epic config card */}
      <Card
        mockId="epic.config"
        title="Cấu hình của Epic này"
        chips={[{ label: 'ghi đè mặc định project', tone: 'acc' }]}
        right={
          <>
            <Button label="Sửa tất cả" size="sm" variant="default" />
            <Button label="Đặt lại theo project" size="sm" variant="default" className="text-txt2" />
          </>
        }
        footer={
          <div className="flex-none flex flex-col gap-[7px] p-[10px_14px]">
            <div className="text-[11px] uppercase tracking-[.08em] text-txt3">Cách vận hành epic này</div>
            <div className="flex gap-[8px]">
              {detail.runModes.map((mode) => (
                <RadioRow
                  key={mode.label}
                  label={mode.label}
                  desc={mode.desc}
                  selected={state.runMode === mode.label}
                  onClick={() => update({ runMode: mode.label })}
                  className="flex-1"
                />
              ))}
            </div>
            <div className="text-[11px] text-txt3">
              Không có CLI cohesive chạy ngầm — mọi thao tác đều mở lệnh nhìn thấy được trong terminal Claude.
            </div>
          </div>
        }
      >
        <div>
          {detail.config.map((row, i) => (
            <KVRow
              key={i}
              kWidth={96}
              pad="9_14"
              k={row.k}
              v={row.v}
              src={
                <span className={row.fromEpic ? 'text-acc-txt' : 'text-txt3'} style={{ fontSize: '10.5px' }}>
                  {row.src}
                </span>
              }
              action={<button className="text-[11.5px] text-acc-txt">Sửa</button>}
            />
          ))}
        </div>
      </Card>

      {/* ⑦ Gate banner */}
      <GateBanner gate={detail.gate} />

      {/* ⑧ Step list card */}
      <Card
        mockId="epic.steps"
        title="Step của epic"
        footer={
          <div className="flex-none flex flex-wrap items-center gap-[6px] p-[10px_14px]">
            <Button label="Run again with Claude" size="md" variant="default" onClick={() => {}} />
            <Button label="Resume interrupted delivery" size="md" variant="default" onClick={() => {}} />
            <Button label="Help & guide" size="md" variant="default" onClick={() => {}} />
            <div className="flex-1 min-w-0" />
            <span className="flex-none font-v3-mono text-[11px] text-txt3">resume từ checkpoint · giữ phase đã approve</span>
          </div>
        }
      >
        <div>
          <StepList steps={detail.steps} />
        </div>
      </Card>

      {/* ⑨ Step detail + History */}
      <div className="grid grid-cols-[1.35fr_1fr] gap-[14px]">
        <Card
          mockId="epic.stepDetail"
          title="Chi tiết step · implement"
          right={<span className="flex-none font-v3-mono text-[11px] text-txt3">/aidlc epic next EPIC-142</span>}
          footer={
            <div {...mock('epic.artifacts')} className="flex-none flex flex-wrap gap-[6px] p-[10px_13px]">
              {detail.artifacts.map((art) => (
                <span key={art} className="font-v3-mono text-[11px] bg-panel2 border border-bd rounded-[5px] px-[7px] py-[3px]">
                  {art}
                </span>
              ))}
            </div>
          }
        >
          <div>
            {detail.stepDetail.map((row, i) => (
              <KVRow
                key={i}
                k={row.k}
                v={row.v}
                kWidth={70}
                kMono
                kSize="11"
                vSize="12"
                vColor="txt2"
                vMono={false}
                vLeading="leading-[1.6]"
                pad="9_13"
              />
            ))}
          </div>
        </Card>

        <Card mockId="epic.history" headerPad="p10" title={<span className="text-[10.5px] uppercase tracking-[.09em]">History</span>}>
          <div>
            {detail.history.map((h, i) => (
              <div key={i} className="flex items-center gap-[9px] p-[8px_13px] border-b border-bd2">
                <span className="flex-none font-v3-mono text-[11px] text-txt3">{h.at}</span>
                <div className="flex-1 min-w-0 flex items-center gap-[7px]">
                  <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis text-[11.5px]" style={{ color: toneColor(h.tone) }}>
                    {h.what}
                  </span>
                  <span className="flex-none font-v3-mono text-[10.5px] text-txt3">{h.actor}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ⑩ Ship strip */}
      <div {...mock('epic.ship', 'block')} className="flex-none flex items-center gap-[12px] rounded-[8px] p-[11px_14px] border border-bd bg-panel">
        <span className="flex-none text-[10px] uppercase tracking-[.08em] text-txt3">SHIP</span>
        {detail.ship.map((m, i) => (
          <React.Fragment key={m.label}>
            <div className="flex-none flex items-center gap-[6px]">
              <span
                className="w-[8px] h-[8px] rounded-full inline-block"
                style={{ background: m.active ? toneColor(m.tone) : 'var(--track)' }}
              />
              <span className="text-[11.5px] text-txt2">{m.label}</span>
            </div>
            {i < detail.ship.length - 1 && <span className="flex-none w-[18px] h-[1px] bg-bd inline-block" />}
          </React.Fragment>
        ))}
        <div className="flex-1 min-w-0" />
        <span className="flex-none font-v3-mono text-[11.5px] text-txt3">{MOCK_ARTIFACT_POLICY_COUNT}</span>
      </div>

      {/* ⑪ Action bar */}
      <div className="flex-none flex flex-wrap gap-[7px] pb-[6px]">
        {detail.actionBar.map((act, i) => (
          <Button
            key={i}
            label={act.label}
            variant={act.variant}
            size="none"
            className="p-[8px_13px] text-[12px] rounded-[6px]"
            onClick={() => {}}
          />
        ))}
      </div>
    </>
  );
}
