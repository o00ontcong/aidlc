import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  pickAndReadFile,
  pickBugImages,
  savePastedBugImage,
  type BugImageResult,
} from '@/lib/pickFile';
import { useHostAction } from '@/hooks/useHostAction';
import { Btn, Mono, SectionLabel } from './epic-v3/primitives';
import { V3Callout, V3Label, V3Modal, V3ModalFooter, V3ModalHeader } from './epic-v3/V3Modal';

const MAX_BUG_IMAGES = 10;

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
 * posts `runStepWithFeedback`) are all unchanged. The user can also attach or
 * paste multiple screenshots for the agent to read.
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
  const [images, setImages] = useState<BugImageResult[]>([]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [loading, setLoading] = useState(false);
  const [loadInfo, setLoadInfo] = useState<{ kind: 'loaded' | 'error'; text: string } | null>(
    null,
  );
  const { pending: submitting, run: runSubmit } = useHostAction({ onSettled: onClose });

  const remaining = MAX_BUG_IMAGES - images.length;

  const addImages = (next: BugImageResult[]) => {
    if (next.length === 0) { return; }
    setImages((cur) => {
      const seen = new Set(cur.map((img) => img.relativePath));
      const extra = next.filter((img) => !seen.has(img.relativePath));
      return [...cur, ...extra].slice(0, MAX_BUG_IMAGES);
    });
  };

  const onLoadFromFile = async () => {
    setLoading(true);
    setLoadInfo(null);
    try {
      const result = await pickAndReadFile();
      if (!result) { return; }
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

  const onAttachImages = async () => {
    if (remaining <= 0) { return; }
    setLoading(true);
    setLoadInfo(null);
    try {
      const picked = await pickBugImages(runId, remaining);
      if (!picked || picked.length === 0) { return; }
      addImages(picked);
      setLoadInfo({
        kind: 'loaded',
        text: picked.length === 1 ? `Đã chèn ${picked[0].fileName}` : `Đã chèn ${picked.length} ảnh`,
      });
    } catch (err) {
      setLoadInfo({
        kind: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const ingestBlobImages = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/')).slice(0, remaining);
    if (imageFiles.length === 0) { return; }
    setLoading(true);
    setLoadInfo(null);
    try {
      const saved: BugImageResult[] = [];
      for (const file of imageFiles) {
        const base64 = await blobToBase64(file);
        saved.push(await savePastedBugImage(
          runId,
          file.name || 'paste.png',
          file.type || 'image/png',
          base64,
        ));
      }
      addImages(saved);
      setLoadInfo({
        kind: 'loaded',
        text: saved.length === 1 ? `Đã chèn ${saved[0].fileName}` : `Đã chèn ${saved.length} ảnh`,
      });
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
    if (ref.current) {
      ref.current.setSelectionRange(feedback.length, feedback.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.items ?? [])]
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => !!file);
      if (files.length === 0) { return; }
      e.preventDefault();
      void ingestBlobImages(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // remaining/runId are read at paste time via closure; re-bind when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, runId]);

  const trimmed = feedback.trim();
  const submit = () => {
    if (submitting) { return; }
    const screenshotMd = screenshotSection(images.map((img) => img.relativePath));
    const body = [
      trimmed || (images.length > 0 ? 'See attached screenshots.' : ''),
      screenshotMd,
    ].filter(Boolean).join('\n\n');
    runSubmit(() => onSubmit(body));
  };

  const previewPrompt = trimmed || images.length > 0
    ? `${slashCommand} ${runId} — Update artifact per feedback: "${trimmed || 'See attached screenshots.'}"${images.length ? ` + ${images.length} ảnh` : ''}`
    : `${slashCommand} ${runId}`;

  return (
    <V3Modal
      width={660}
      paddingTop={90}
      onClose={onClose}
      busy={submitting}
      header={
        <V3ModalHeader
          title="Run with feedback"
          sub={`${agent} · run ${runId}`}
          onClose={onClose}
          disabled={submitting}
        />
      }
      footer={
        <V3ModalFooter cli={`${slashCommand} ${runId}`}>
          <Btn label="Huỷ" onClick={onClose} pad="9px 14px" fs={12.5} disabled={submitting} />
          <Btn
            label="Run in Claude"
            variant="primary"
            onClick={submit}
            loading={submitting}
            loadingLabel="Starting…"
            pad="9px 16px"
            fs={12.5}
          />
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
            style={ghostBtn(loading)}
          >
            {loading ? 'Đang nạp…' : 'Load from file…'}
          </button>
        </div>
        <textarea
          ref={ref}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={'ví dụ: thêm rate-limit policy theo PRD §4.2; trình bày dạng checklist.\nDán screenshot (⌘V / Ctrl+V) hoặc nhấn Chèn ảnh…'}
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

      <div
          onDragOver={(e) => {
            if ([...e.dataTransfer.types].includes('Files')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={(e) => {
            const files = [...e.dataTransfer.files];
            if (files.length === 0) { return; }
            e.preventDefault();
            void ingestBlobImages(files);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <V3Label hint={`(tối đa ${MAX_BUG_IMAGES})`}>Ảnh minh họa</V3Label>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => void onAttachImages()}
              disabled={loading || remaining <= 0}
              title="Chọn nhiều file PNG/JPG/GIF/WebP — agent sẽ đọc các ảnh này"
              style={ghostBtn(loading || remaining <= 0)}
            >
              {remaining <= 0 ? 'Đã đủ ảnh' : 'Chèn ảnh…'}
            </button>
          </div>
          {images.length === 0 ? (
            <div
              style={{
                border: '1px dashed var(--bd)', borderRadius: 6, padding: '12px 12px',
                fontSize: 11.5, color: 'var(--txt3)', lineHeight: 1.5,
              }}
            >
              Chèn nhiều ảnh, kéo thả vào đây, hoặc dán screenshot. Agent đọc trực tiếp file ảnh.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {images.map((img) => (
                <div
                  key={img.relativePath}
                  style={{
                    position: 'relative', width: 96, border: '1px solid var(--bd)',
                    borderRadius: 6, overflow: 'hidden', background: 'var(--panel)',
                  }}
                >
                  {img.previewDataUrl ? (
                    <img
                      src={img.previewDataUrl}
                      alt={img.fileName}
                      style={{ display: 'block', width: 96, height: 72, objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 96, height: 72, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 10.5, color: 'var(--txt3)',
                        padding: 6, textAlign: 'center',
                      }}
                    >
                      Ảnh
                    </div>
                  )}
                  <div
                    title={img.relativePath}
                    style={{
                      fontSize: 9.5, color: 'var(--txt3)', padding: '3px 22px 4px 6px',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {img.fileName}
                  </div>
                  <button
                    type="button"
                    title={`Gỡ ${img.fileName}`}
                    onClick={() => setImages((cur) => cur.filter((x) => x.relativePath !== img.relativePath))}
                    style={{
                      position: 'absolute', top: 4, right: 4, width: 18, height: 18,
                      borderRadius: 9, border: '1px solid var(--bd)', background: 'var(--panel)',
                      color: 'var(--txt2)', cursor: 'pointer', fontSize: 11, lineHeight: '16px',
                      padding: 0, fontFamily: 'inherit',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
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

function screenshotSection(relativePaths: string[]): string {
  if (relativePaths.length === 0) { return ''; }
  return [
    '## Screenshots',
    '',
    'Read each image file below — they show the reported problem:',
    '',
    ...relativePaths.map((rel, i) => `${i + 1}. \`${rel}\``),
  ].join('\n');
}

function ghostBtn(disabled: boolean): CSSProperties {
  return {
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 5,
    border: '1px solid var(--bd)',
    background: 'transparent',
    color: 'var(--txt2)',
    opacity: disabled ? 0.5 : 1,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  };
}

async function blobToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
