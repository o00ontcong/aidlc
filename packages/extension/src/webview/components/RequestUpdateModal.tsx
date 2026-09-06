import { useState } from 'react';
import { useHostAction } from '@/hooks/useHostAction';
import { Btn } from './epic-v3/primitives';
import {
  V3Callout, V3Field, V3Modal, V3ModalFooter, V3ModalHeader, V3Textarea,
} from './epic-v3/V3Modal';

interface Props {
  agent: string;
  runId: string;
  stepIdx: number;
  /** How many steps will be reset to pending downstream. Surfaced so the
   * user knows the blast radius before submitting. */
  downstreamCount: number;
  onSubmit: (feedback: string) => void;
  onClose: () => void;
}

/**
 * Request update — rewinds an approved step. v3-styled; the required-feedback
 * guard and the `onSubmit` contract (which posts `requestStepUpdate`) are
 * unchanged.
 */
export function RequestUpdateModal({
  agent,
  runId,
  stepIdx,
  downstreamCount,
  onSubmit,
  onClose,
}: Props) {
  const [feedback, setFeedback] = useState('');
  const { pending, run } = useHostAction({ onSettled: onClose });

  const trimmed = feedback.trim();
  const submit = () => {
    if (!trimmed || pending) { return; }
    run(() => onSubmit(trimmed));
  };

  return (
    <V3Modal
      width={560}
      paddingTop={110}
      onClose={onClose}
      busy={pending}
      header={
        <V3ModalHeader
          title={`Request update — step ${stepIdx + 1}`}
          sub={`${agent} · run ${runId}`}
          onClose={onClose}
          disabled={pending}
        />
      }
      footer={
        <V3ModalFooter cli={`aidlc step request-update ${runId} --step ${stepIdx}`}>
          <Btn label="Huỷ" onClick={onClose} pad="9px 14px" fs={12.5} disabled={pending} />
          <Btn
            label="Request update"
            variant="primary"
            onClick={submit}
            disabled={!trimmed}
            loading={pending}
            loadingLabel="Requesting…"
            title={trimmed ? undefined : 'Bắt buộc ghi rõ thay đổi'}
            pad="9px 16px"
            fs={12.5}
          />
        </V3ModalFooter>
      }
    >
      <V3Callout tone="warn" label="Hậu quả">
        <div style={{ fontWeight: 600 }}>Step này quay lại "awaiting work" và revision++.</div>
        {downstreamCount > 0 && (
          <div style={{ marginTop: 3, color: 'var(--txt2)' }}>
            {downstreamCount} step phía sau sẽ reset về pending — history của chúng được giữ lại nên bạn
            vẫn thấy được là "trước đó đã xong".
          </div>
        )}
      </V3Callout>
      <V3Field label="Thay đổi gì?" hint="(bắt buộc)">
        <V3Textarea
          value={feedback}
          onChange={setFeedback}
          placeholder="ví dụ: PRD phải bổ sung rate-limit policy theo requirements doc mới"
          rows={4}
          autoFocus
          disabled={pending}
        />
      </V3Field>
    </V3Modal>
  );
}
