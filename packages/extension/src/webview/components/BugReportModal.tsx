import { useState } from 'react';
import { Modal, ModalCancelButton, ModalConfirmButton, ModalFooter } from './Modal';

interface Props {
  onSubmit: (fields: { did: string; observed: string; expected: string }) => void;
  onClose: () => void;
}

/** Collect symptoms, never workflow routing. CoFoFo diagnosis owns that choice. */
export function BugReportModal({ onSubmit, onClose }: Props) {
  const [did, setDid] = useState('');
  const [observed, setObserved] = useState('');
  const [expected, setExpected] = useState('');
  const ready = Boolean(did.trim() && observed.trim() && expected.trim());

  const submit = () => {
    if (!ready) return;
    onSubmit({ did: did.trim(), observed: observed.trim(), expected: expected.trim() });
    onClose();
  };

  return (
    <Modal
      title="Báo lỗi CoFoFo"
      subtitle="Chỉ mô tả triệu chứng. Phase diagnose sẽ xác định cần quay lại đâu."
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="space-y-3">
        <ReportField label="Bạn đã làm gì?" value={did} onChange={setDid} placeholder="Ví dụ: Bấm Refresh ở trang thời tiết." />
        <ReportField label="Bạn thấy gì?" value={observed} onChange={setObserved} placeholder="Ví dụ: Dữ liệu vẫn là của hôm qua." />
        <ReportField label="Bạn mong đợi gì?" value={expected} onChange={setExpected} placeholder="Ví dụ: Hiển thị dữ liệu mới nhất." />
      </div>
      <ModalFooter>
        <ModalCancelButton onClick={onClose} />
        <ModalConfirmButton onClick={submit} label="Gửi báo lỗi" disabled={!ready} />
      </ModalFooter>
    </Modal>
  );
}

function ReportField({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11.5px] font-medium text-foreground/90">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-[12px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
      />
    </label>
  );
}
