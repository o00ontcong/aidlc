import { useState } from 'react';
import { postMessage } from '@/lib/bridge';
import { useHostAction } from '@/hooks/useHostAction';
import { Btn, Ellipsis, SectionLabel } from './epic-v3/primitives';
import { V3Field, V3Modal, V3ModalFooter, V3ModalHeader, V3Textarea } from './epic-v3/V3Modal';

interface Props {
  runId: string;
  currentStepIdx: number;
  stepAgents: string[];
  onClose: () => void;
}

/**
 * Reject step. v3-styled; the send-back target picker is retained — it is the
 * only place in the UI that can rewind a rejection to an UPSTREAM step, and the
 * v3 gate modal has no control for it. The emitted message is unchanged:
 * `rejectStepInline { runId, reason, targetIdx, stepIdx }`.
 */
export function RejectModal({ runId, currentStepIdx, stepAgents, onClose }: Props) {
  const [reason, setReason] = useState('');
  const [targetIdx, setTargetIdx] = useState(currentStepIdx);
  const { pending, run } = useHostAction({ onSettled: onClose });

  const submit = () => {
    if (pending) { return; }
    run(() => {
      postMessage({
        type: 'rejectStepInline',
        runId,
        reason: reason.trim(),
        targetIdx,
        stepIdx: currentStepIdx,
      });
    });
  };

  const currentAgent = stepAgents[currentStepIdx] ?? '';
  const upstreamOptions = stepAgents
    .map((agent, i) => ({ idx: i, agent }))
    .filter((s) => s.idx < currentStepIdx);

  return (
    <V3Modal
      width={560}
      paddingTop={110}
      onClose={onClose}
      busy={pending}
      header={
        <V3ModalHeader
          icon="✕"
          tone="err"
          title={`Reject step ${currentStepIdx + 1}`}
          sub={`${currentAgent} · run ${runId}`}
          onClose={onClose}
          disabled={pending}
        />
      }
      footer={
        <V3ModalFooter cli={`aidlc step reject ${runId} --target ${targetIdx}`}>
          <Btn label="Huỷ" onClick={onClose} pad="9px 14px" fs={12.5} disabled={pending} />
          <Btn
            label="Reject"
            variant="danger"
            onClick={submit}
            loading={pending}
            loadingLabel="Rejecting…"
            pad="9px 16px"
            fs={12.5}
          />
        </V3ModalFooter>
      }
    >
      <V3Field label="Lý do" hint="(tuỳ chọn)">
        <V3Textarea
          value={reason}
          onChange={setReason}
          placeholder="ví dụ: PRD thiếu acceptance criteria về performance"
          autoFocus
          disabled={pending}
        />
      </V3Field>

      {upstreamOptions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SectionLabel fs={10.5} tracking=".09em">Gửi việc về đâu</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <RadioRow
              checked={targetIdx === currentStepIdx}
              onSelect={() => !pending && setTargetIdx(currentStepIdx)}
              label={`Ở lại step ${currentStepIdx + 1}`}
              detail={`Rerun tại chỗ — ${currentAgent}`}
              hint="Mặc định"
            />
            {upstreamOptions
              .slice()
              .reverse()
              .map((s) => (
                <RadioRow
                  key={s.idx}
                  checked={targetIdx === s.idx}
                  onSelect={() => !pending && setTargetIdx(s.idx)}
                  label={`Gửi về step ${s.idx + 1}`}
                  detail={s.agent}
                  hint={`Reset ${s.idx + 2}–${currentStepIdx + 1} về pending`}
                />
              ))}
          </div>
        </div>
      )}
    </V3Modal>
  );
}

/** dc.html:840 — RadioRow: mark ◉/○ + label + note, acc-tinted when selected. */
function RadioRow({
  checked, onSelect, label, detail, hint,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  detail: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 11px', borderRadius: 6,
        border: `1px solid ${checked ? 'var(--acc-bd)' : 'var(--bd)'}`,
        background: checked ? 'var(--acc-bg)' : 'var(--panel)',
        cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit',
      }}
    >
      <div style={{ fontSize: 11, color: checked ? 'var(--acc-txt)' : 'var(--txt3)', flex: 'none' }}>
        {checked ? '◉' : '○'}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span style={{ fontSize: 12, color: 'var(--txt)', fontWeight: 600 }}>{label}</span>
          {hint && (
            <span
              style={{
                fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase',
                color: 'var(--txt3)',
              }}
            >
              {hint}
            </span>
          )}
        </div>
        <Ellipsis mono style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{detail}</Ellipsis>
      </div>
    </button>
  );
}
