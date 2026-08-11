// v3/modals/GateModal.tsx — §11.1 Hard gate modal (không mode nào bỏ qua được).
import React from 'react';
import { Modal, Button } from '../components';
import { MOCK_HARD_GATE } from '../data/mock-data';
import { useUiStore } from '../state/store';

export function GateModal() {
  const { state, update } = useUiStore();
  if (!state.gateOpen) return null;

  const close = () => update({ gateOpen: false });

  return (
    <Modal
      width={620}
      paddingTop={90}
      z={30}
      title={MOCK_HARD_GATE.title}
      sub={MOCK_HARD_GATE.sub}
      onClose={close}
      danger
      footerActions={
        <>
          <Button label="Huỷ" variant="default" onClick={close} />
          <Button label="Reject" variant="danger" onClick={close} />
          <Button label="Approve & tiếp tục" variant="primary" size="xl" onClick={close} />
        </>
      }
    >
      <p className="text-[12.5px] text-txt2 leading-[1.65] m-0">{MOCK_HARD_GATE.why}</p>

      <div className="flex flex-col gap-[7px] bg-panel border border-bd rounded-[6px] p-[12px]">
        <div className="text-[10.5px] uppercase tracking-[.09em] font-semibold text-txt3">Nếu approve</div>
        <div className="text-[12.5px] text-txt2">{MOCK_HARD_GATE.ifApprove}</div>
        <div className="text-[12px] text-txt2">{MOCK_HARD_GATE.scope}</div>
      </div>

      <div className="flex flex-col gap-[6px]">
        <label className="text-[11.5px] text-txt2">Lý do (bắt buộc khi reject)</label>
        <input
          value={state.gateReason}
          onChange={(e) => update({ gateReason: e.target.value })}
          placeholder="Ghi lại quyết định cho audit log…"
          className="bg-panel border border-bd rounded-[6px] p-[9px_11px] text-[12.5px] text-txt w-full outline-none font-v3-sans"
        />
      </div>

      <div className="text-[11.5px] text-err">{MOCK_HARD_GATE.note}</div>
    </Modal>
  );
}
