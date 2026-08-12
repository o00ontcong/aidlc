import { useState } from 'react';
import { Btn, Mono } from './epic-v3/primitives';
import {
  V3Callout, V3Field, V3Modal, V3ModalFooter, V3ModalHeader, V3Textarea,
} from './epic-v3/V3Modal';

interface Props {
  runId: string;
  agent: string;
  rejectReason?: string;
  initialFeedback?: string;
  onSubmit: (feedback: string) => void;
  onClose: () => void;
}

/**
 * Rerun step. v3-styled (V3_HANDOFF §11) — logic unchanged: the same trimmed
 * feedback string goes to the same `onSubmit` the caller passes, which still
 * posts `rerunStepInline`.
 *
 * Rendered inside the `.aidlc-v3` subtree, so the v3 tokens resolve. It no
 * longer uses the shared components/Modal.tsx shell — that shell is used by
 * 20 modals on other screens and must keep its current look.
 */
export function RerunModal({
  runId,
  agent,
  rejectReason,
  initialFeedback = '',
  onSubmit,
  onClose,
}: Props) {
  const [feedback, setFeedback] = useState(initialFeedback);

  const submit = () => {
    onSubmit(feedback.trim());
    onClose();
  };

  return (
    <V3Modal
      width={560}
      paddingTop={110}
      onClose={onClose}
      header={
        <V3ModalHeader
          title="Rerun step"
          sub={`${agent} · run ${runId}`}
          onClose={onClose}
        />
      }
      footer={
        <V3ModalFooter cli={`aidlc step rerun ${runId}`}>
          <Btn label="Huỷ" onClick={onClose} pad="9px 14px" fs={12.5} />
          <Btn label="Rerun" variant="primary" onClick={submit} pad="9px 16px" fs={12.5} />
        </V3ModalFooter>
      }
    >
      {rejectReason && (
        <V3Callout tone="err" label="Last reject reason">
          <Mono>↳ {rejectReason}</Mono>
        </V3Callout>
      )}
      <V3Field label="Feedback" hint="(tuỳ chọn — được giữ lại trên step)">
        <V3Textarea
          value={feedback}
          onChange={setFeedback}
          placeholder={rejectReason ?? 'ví dụ: xử lý phản hồi của reviewer về test coverage'}
          autoFocus
          selectOnFocus
        />
      </V3Field>
    </V3Modal>
  );
}
