/* Gate modal — dc.html:58-88 / V3_HANDOFF §11.1.
 *
 * Wiring keeps the existing protocol exactly:
 *   Approve  → postMessage('approveStep',      { runId, stepIdx })
 *   Reject   → postMessage('rejectStepInline', { runId, reason, targetIdx, stepIdx })
 *
 * `targetIdx` defaults to the gated step itself — the same default the existing
 * RejectModal ships with. Sending a rejection back to an UPSTREAM step is a
 * capability the v3 gate modal has no control for, so it stays reachable from
 * the step list's per-step Reject action (which still opens RejectModal with
 * its target picker). No existing capability is lost.
 */

import { useState } from 'react';
import { postMessage } from '@/lib/bridge';
import { Btn, Mono } from './primitives';
import { V3Input, V3Modal, V3ModalFooter, V3ModalHeader } from './V3Modal';
import { mock } from './mock';

export function GateModal({
  runId,
  stepIdx,
  stepName,
  gateName,
  consequence,
  onClose,
}: {
  runId: string;
  stepIdx: number;
  stepName: string;
  /** The gate's identity, e.g. `merge_default_branch`. */
  gateName: string;
  /** What approving does. Host does not yet emit this — see `consequenceIsMock`. */
  consequence: { headline: string; scope: string; isMock: boolean };
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const canReject = reason.trim().length > 0;

  const approve = () => {
    postMessage({ type: 'approveStep', runId, stepIdx });
    onClose();
  };

  const reject = () => {
    if (!canReject) { return; }
    postMessage({
      type: 'rejectStepInline',
      runId,
      reason: reason.trim(),
      targetIdx: stepIdx,
      stepIdx,
    });
    onClose();
  };

  return (
    <V3Modal
      width={620}
      danger
      onClose={onClose}
      paddingTop={90}
      header={
        <V3ModalHeader
          icon="🔒"
          tone="err"
          title={`Hard gate · ${gateName}`}
          sub="Không mode nào bỏ qua được, kể cả unattended"
          onClose={onClose}
        />
      }
      footer={
        <V3ModalFooter>
          <Btn label="Huỷ" onClick={onClose} pad="9px 14px" fs={12.5} />
          <Btn
            label="Reject"
            variant="danger"
            onClick={reject}
            disabled={!canReject}
            title={canReject ? undefined : 'Nhập lý do trước khi reject'}
            pad="9px 14px"
            fs={12.5}
          />
          <Btn label="Approve & tiếp tục" variant="primary" onClick={approve} pad="9px 16px" fs={12.5} />
        </V3ModalFooter>
      }
    >
      <div style={{ fontSize: 12.5, color: 'var(--txt2)', lineHeight: 1.65 }}>
        Vì sao cần duyệt: hành động này ghi vào nhánh mặc định và mở giao tiếp ra ngoài repo — hai việc không
        thể hoàn tác bằng retry.
      </div>

      <div
        {...(consequence.isMock ? mock('epic.gate.consequence', 'block') : {})}
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--bd)',
          borderRadius: 6,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            letterSpacing: '.09em',
            textTransform: 'uppercase',
            color: 'var(--txt3)',
            fontWeight: 600,
          }}
        >
          Nếu approve
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--txt)', lineHeight: 1.6 }}>{consequence.headline}</div>
        <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.6 }}>{consequence.scope}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>Lý do (bắt buộc khi reject)</div>
        <V3Input value={reason} onChange={setReason} placeholder="Ghi lại quyết định cho audit log…" />
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--err)', lineHeight: 1.5 }}>
        Hard gate không có tuỳ chọn "đừng hỏi lại". Step đang chờ: <Mono>{stepName}</Mono>.
      </div>
    </V3Modal>
  );
}
