import { useEffect, useRef, useState } from 'react';
import { pickAndReadFile } from '@/lib/pickFile';
import { Btn, Mono, SectionLabel } from './epic-v3/primitives';
import { V3Callout, V3Label, V3Modal, V3ModalFooter, V3ModalHeader } from './epic-v3/V3Modal';

interface Props {
  agent: string;
  runId: string;
  slashCommand: string;
  /** Carried feedback from a prior reject — pre-fills the textarea so the
   * user can keep, edit, or clear it. */
  carriedFeedback?: string;
  onSubmit: (feedback: string) => void;
  onClose: () => void;
}

/**
 * Run with feedback. v3-styled; the load-from-file behaviour (append, not
 * overwrite), the prompt preview string, and the `onSubmit` contract (which
 * posts `runStepWithFeedback`) are all unchanged.
 */
export function RunWithFeedbackModal({
  agent,
  runId,
  slashCommand,
  carriedFeedback,
  onSubmit,
  onClose,
}: Props) {
  const [feedback, setFeedback] = useState(carriedFeedback ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  const [loading, setLoading] = useState(false);
  const [loadInfo, setLoadInfo] = useState<{ kind: 'loaded' | 'error'; text: string } | null>(
    null,
  );

  const onLoadFromFile = async () => {
    setLoading(true);
    setLoadInfo(null);
    try {
      const result = await pickAndReadFile();
      if (!result) { return; }
      // Append (rather than overwrite) when there's already typed feedback —
      // user is more often layering hints than swapping them.
      setFeedback((cur) => (cur.trim() ? `${cur.trimEnd()}\n\n${result.content}` : result.content));
      setLoadInfo({ kind: 'loaded', text: `Đã nạp ${result.fileName}` });
    } catch (err) {
      setLoadInfo({
        kind: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    ref.current?.focus();
    // Place caret at end so the user can keep typing additional feedback
    // without having to click into the textarea.
    if (ref.current) {
      ref.current.setSelectionRange(feedback.length, feedback.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trimmed = feedback.trim();
  const submit = () => {
    onSubmit(trimmed);
    onClose();
  };

  // Preview the prompt that will land in Claude's REPL so the user knows
  // exactly what's about to be sent.
  const previewPrompt = trimmed
    ? `${slashCommand} ${runId} — Update artifact per feedback: "${trimmed}"`
    : `${slashCommand} ${runId}`;

  return (
    <V3Modal
      width={620}
      paddingTop={90}
      onClose={onClose}
      header={
        <V3ModalHeader
          title="Run with feedback"
          sub={`${agent} · run ${runId}`}
          onClose={onClose}
        />
      }
      footer={
        <V3ModalFooter cli={`${slashCommand} ${runId}`}>
          <Btn label="Huỷ" onClick={onClose} pad="9px 14px" fs={12.5} />
          <Btn label="Run in Claude" variant="primary" onClick={submit} pad="9px 16px" fs={12.5} />
        </V3ModalFooter>
      }
    >
      {carriedFeedback && (
        <V3Callout tone="warn" label="Carried feedback">
          <Mono>↳ {carriedFeedback}</Mono>
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--txt3)' }}>
            Đã điền sẵn bên dưới — sửa hoặc xoá nếu bạn muốn gửi nội dung khác.
          </div>
        </V3Callout>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <V3Label hint="(tuỳ chọn)">Feedback cho agent</V3Label>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onLoadFromFile}
            disabled={loading}
            title="Nối nội dung một file text/markdown vào feedback"
            style={{
              cursor: loading ? 'default' : 'pointer', fontSize: 11, padding: '3px 8px',
              borderRadius: 5, border: '1px solid var(--bd)', background: 'transparent',
              color: 'var(--txt2)', opacity: loading ? 0.5 : 1, fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? 'Đang nạp…' : 'Load from file…'}
          </button>
        </div>
        <textarea
          ref={ref}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="ví dụ: thêm rate-limit policy theo PRD §4.2; trình bày dạng checklist"
          rows={5}
          style={{
            background: 'var(--panel)', border: '1px solid var(--bd)', borderRadius: 6,
            padding: '10px 12px', color: 'var(--txt)', fontSize: 12.5, fontFamily: 'inherit',
            lineHeight: 1.6, resize: 'vertical', outline: 'none',
          }}
        />
        {loadInfo && (
          <div
            style={{
              fontSize: 11,
              color: loadInfo.kind === 'loaded' ? 'var(--txt3)' : 'var(--err)',
            }}
          >
            {loadInfo.text}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SectionLabel fs={10.5} tracking=".09em">Sẽ chạy trong Claude</SectionLabel>
        <div
          className="v3-mono"
          style={{
            background: 'var(--panel)', border: '1px solid var(--bd)', borderRadius: 6,
            padding: '9px 11px', fontSize: 11, color: 'var(--txt2)', lineHeight: 1.8,
            wordBreak: 'break-all',
          }}
        >
          {previewPrompt}
        </div>
      </div>
    </V3Modal>
  );
}
