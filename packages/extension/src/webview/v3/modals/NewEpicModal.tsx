// v3/modals/NewEpicModal.tsx — §11.2 tạo epic mới (title, type, pipeline, pack, mode, lock).
import React from 'react';
import { Modal, Button, Chip, RadioRow, KVRow } from '../components';
import {
  CATALOG_EPIC_TYPES, CATALOG_PROFILES, CATALOG_COMPILED, CATALOG_MODES,
  CATALOG_NEW_PACKS, MOCK_NEW_LOCK, MOCK_NEW_CONTEXT_BANNER,
} from '../data/mock-data';
import type { ExecutionMode } from '../data/types';
import { useUiStore } from '../state/store';

export function NewEpicModal() {
  const { state, update } = useUiStore();
  if (!state.newEpicOpen) return null;

  const close = () => update({ newEpicOpen: false });

  const footerCli =
    state.newProfile === 'project-context'
      ? '/aidlc-project-context  · hoặc Run with Claude từng step'
      : state.newMode === 'unattended'
        ? `/aidlc-autonomous-delivery <delivery-id>`
        : `/aidlc-${state.newProfile} <epic-id>`;

  return (
    <Modal
      width={820}
      paddingTop={56}
      maxHeight={790}
      z={32}
      title="New Epic"
      sub="Tạo epic mới, chạy độc lập trên snapshot Project Context hiện tại"
      onClose={close}
      footerCli={footerCli}
      footerActions={
        <>
          <Button label="Huỷ" variant="default" onClick={close} />
          <Button label="Tạo draft" variant="default" onClick={close} />
          <Button
            label="Tạo & chạy"
            variant="primary"
            size="xl"
            onClick={() => update({ newEpicOpen: false, toastOpen: true })}
          />
        </>
      }
    >
      {/* 1. Tiêu đề */}
      <div className="flex flex-col gap-[6px]">
        <label className="text-[11.5px] text-txt2">Tiêu đề</label>
        <input
          value={state.newTitle}
          onChange={(e) => update({ newTitle: e.target.value })}
          placeholder="vd: Partial refunds for split payments"
          className="bg-panel border border-bd rounded-[6px] p-[9px_11px] text-[13px] text-txt w-full"
        />
      </div>

      {/* 2. Mô tả / acceptance criteria */}
      <div className="flex flex-col gap-[6px]">
        <label className="text-[11.5px] text-txt2">Mô tả / acceptance criteria</label>
        <textarea
          placeholder="Mô tả vấn đề, phạm vi, và tiêu chí chấp nhận…"
          className="bg-panel border border-bd rounded-[6px] p-[9px_11px] text-[12.5px] text-txt w-full min-h-[62px] resize-none"
        />
        <div className="flex gap-[6px]">
          <Chip label="Từ REQ-018" />
          <Chip label="Từ Jira PAY-884" />
          <Chip label="Từ selection trong editor" />
        </div>
      </div>

      {/* 3. Loại công việc */}
      <div className="flex flex-col gap-[6px]">
        <label className="text-[11.5px] text-txt2">Loại công việc</label>
        <div className="flex gap-[6px]">
          {CATALOG_EPIC_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => update({ newType: t })}
              className={`flex-1 text-center rounded-[6px] border p-[7px_0] text-[12px] font-semibold ${
                state.newType === t ? 'bg-acc-bg border-acc-bd text-acc-txt' : 'border-bd text-txt2'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Context banner */}
      <div className="flex items-start gap-[8px] border border-acc-bd bg-acc-bg rounded-[6px] p-[10px_12px]">
        <span className="flex-none text-acc-txt text-[12px] leading-[1.4]">◉</span>
        <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
          <div className="text-[12px] text-txt">{MOCK_NEW_CONTEXT_BANNER}</div>
          <div className="text-[11px] text-txt3 font-v3-mono">Project Context: rev-7</div>
        </div>
        <Button label="Đổi revision" size="xs" variant="default" onClick={() => {}} />
      </div>

      {/* 5. Pipeline */}
      <div className="flex flex-col gap-[8px]">
        <div className="flex items-center gap-[8px]">
          <label className="text-[11.5px] text-txt2">Pipeline</label>
          <Chip label={`đề xuất: ${state.newType === 'Bug' ? 'quick-fix' : 'cohesive-feature'}`} tone="acc" mono />
        </div>
        <div className="grid grid-cols-4 gap-[6px]">
          {CATALOG_PROFILES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => update({ newProfile: p.id })}
              className={`flex flex-col gap-[3px] text-left rounded-[6px] border p-[8px_10px] ${
                state.newProfile === p.id ? 'bg-acc-bg border-acc-bd' : 'border-bd bg-panel'
              }`}
            >
              <span className={`text-[12px] font-semibold font-v3-mono ${state.newProfile === p.id ? 'text-acc-txt' : 'text-txt'}`}>
                {p.id}
              </span>
              <span className="text-[10.5px] text-txt2">{p.desc}</span>
            </button>
          ))}
        </div>
        <div className="bg-panel border border-bd rounded-[6px] p-[9px_11px] font-v3-mono text-[11.5px] text-txt2">
          {CATALOG_COMPILED[state.newProfile]}
        </div>
      </div>

      {/* 6. Workflow pack / Autonomy khởi điểm */}
      <div className="grid grid-cols-2 gap-[12px]">
        <div className="flex flex-col gap-[6px]">
          <label className="text-[11.5px] text-txt2">Workflow pack</label>
          {CATALOG_NEW_PACKS.map(([id, note]) => (
            <RadioRow key={id} label={id} desc={note} mono selected={state.newPack === id} onClick={() => update({ newPack: id })} />
          ))}
        </div>
        <div className="flex flex-col gap-[6px]">
          <label className="text-[11.5px] text-txt2">Autonomy khởi điểm</label>
          {CATALOG_MODES.map(([mode, desc]) => (
            <RadioRow
              key={mode}
              label={mode}
              desc={desc}
              selected={state.newMode === mode}
              onClick={() => update({ newMode: mode as ExecutionMode })}
            />
          ))}
        </div>
      </div>

      {/* 7. Sẽ được lock cho Epic này */}
      <div className="flex flex-col gap-[6px]">
        <div className="flex items-center gap-[8px]">
          <label className="flex-1 min-w-0 text-[11.5px] text-txt2">Sẽ được lock cho Epic này</label>
          <button type="button" className="flex-none text-[11px] text-acc-txt">Override</button>
        </div>
        <div className="border border-bd rounded-[6px] overflow-hidden">
          {MOCK_NEW_LOCK.map((row) => (
            <KVRow key={row.k} k={row.k} v={row.v} src={row.why} kWidth={80} vSize="12" />
          ))}
        </div>
      </div>

      {/* 8. Warning box */}
      <div className="flex items-center gap-[8px] border border-warn-bd bg-warn-bg rounded-[6px] p-[10px_12px]">
        <span className="flex-1 min-w-0 text-[11.5px] text-warn">{MOCK_NEW_CONTEXT_BANNER}</span>
        <button type="button" className="flex-none text-[11px] text-acc-txt">Refresh trước</button>
      </div>
    </Modal>
  );
}
