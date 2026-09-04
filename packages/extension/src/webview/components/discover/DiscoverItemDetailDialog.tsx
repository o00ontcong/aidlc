/* Detail/history dialog shared by Requirement and Feature rows.
 * It edits canonical Markdown only; published history remains read-only. */

import { useEffect, useRef, useState } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import type { DiscoverHistoryEntitySnapshot, DiscoverItemDetail } from '@/lib/types';
import { postMessage } from '@/lib/bridge';

export interface DiscoverDetailTarget {
  id: string;
  text: string;
  detail?: DiscoverItemDetail;
}

type Tab = 'details' | 'history';

const STATUS_CLASS: Record<NonNullable<DiscoverItemDetail['status']>, string> = {
  draft: 'border-warning/50 bg-warning/10 text-warning',
  review: 'border-primary/50 bg-primary/10 text-primary',
  ready: 'border-success/50 bg-success/10 text-success',
  deprecated: 'border-border bg-secondary text-muted-foreground',
};

const EVIDENCE_CLASS: Record<DiscoverItemDetail['evidence']['status'], string> = {
  planned: 'border-warning/50 bg-warning/10 text-warning',
  implemented: 'border-success/50 bg-success/10 text-success',
  stale: 'border-destructive/50 bg-destructive/10 text-destructive',
  orphaned: 'border-destructive/50 bg-destructive/10 text-destructive',
  conflict: 'border-destructive/50 bg-destructive/10 text-destructive',
};

const EVIDENCE_LABEL: Record<DiscoverItemDetail['evidence']['status'], string> = {
  planned: 'Chưa có evidence code',
  implemented: 'Đã có trong code',
  stale: 'Docs lệch code',
  orphaned: 'Evidence mồ côi',
  conflict: 'Evidence conflict',
};

function label(value: string): string {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function allReferences(target: DiscoverDetailTarget): string[] {
  const ids = new Set<string>();
  for (const id of target.detail?.links.references ?? []) ids.add(id);
  for (const values of Object.values(target.detail?.fields ?? {})) {
    for (const value of values) {
      for (const id of value.match(/\b(?:FR|NFR|F|UC|FLOW|M|ADR|RULE)-[A-Z0-9-]+\b/gu) ?? []) ids.add(id);
    }
  }
  ids.delete(target.id);
  return [...ids].sort();
}

function formatPublishedAt(value?: string): string {
  if (!value) { return 'Chưa Publish'; }
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function recommendedAction(detail: DiscoverItemDetail): string {
  if (detail.readiness.missing.length > 0) {
    return 'Không cần quét lại để bổ sung thông tin này — hãy Sửa các field canonical còn thiếu trước.';
  }
  if (detail.publication.status === 'stale') {
    return 'Discover đã đổi sau lần Publish. Chỉ quét lại khi code hoặc scope đã đổi; nếu chỉ sửa tài liệu, hãy Publish revision mới.';
  }
  if (detail.evidence.status === 'stale' || detail.evidence.status === 'conflict') {
    return 'Code evidence không còn khớp. Quét lại khi source/scope đã đổi, rồi kiểm tra và Publish lại context.';
  }
  if (detail.evidence.sourcePaths.length === 0) {
    return 'Chưa tìm được code liên quan. Chỉ quét lại nếu source hiện tại chưa được đưa vào scope; nếu không, đây là hạng mục chưa triển khai.';
  }
  return 'Thông tin canonical và evidence đang đủ để review. Publish khi muốn chốt một revision cho task.';
}

function PathList({ paths, empty }: { paths: string[]; empty: string }) {
  if (paths.length === 0) { return <p className="text-[10.5px] text-muted-foreground">{empty}</p>; }
  return (
    <ul className="space-y-0.5">
      {paths.map((path) => <li key={path} className="break-all font-mono text-[10px] text-muted-foreground">{path}</li>)}
    </ul>
  );
}

function Snapshot({ value, empty = '—' }: { value?: DiscoverHistoryEntitySnapshot; empty?: string }) {
  if (!value) { return <p className="text-[10.5px] text-muted-foreground">{empty}</p>; }
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-foreground">{value.title}</p>
      {Object.entries(value.fields).map(([field, values]) => (
        <p key={field} className="text-[10.5px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">{label(field)}:</span> {values.join(' · ')}
        </p>
      ))}
    </div>
  );
}

function FieldDiff({ before, after }: { before?: DiscoverHistoryEntitySnapshot; after?: DiscoverHistoryEntitySnapshot }) {
  const fields = new Set([...Object.keys(before?.fields ?? {}), ...Object.keys(after?.fields ?? {})]);
  if (fields.size === 0) { return <p className="text-[10.5px] text-muted-foreground">Không có field-level diff khả dụng.</p>; }
  return (
    <div className="space-y-2">
      {[...fields].sort().map((field) => {
        const oldValue = (before?.fields[field] ?? []).join(' · ');
        const newValue = (after?.fields[field] ?? []).join(' · ');
        const changed = oldValue !== newValue;
        return (
          <div key={field} className="rounded border border-border/70 bg-background/50 px-2 py-1.5 text-[10.5px]">
            <p className="font-medium text-foreground">{label(field)}{changed ? '' : ' · không đổi'}</p>
            <p className="mt-0.5 break-words text-muted-foreground"><span className="font-medium">Trước:</span> {oldValue || '—'}</p>
            <p className="break-words text-foreground"><span className="font-medium">Sau:</span> {newValue || '—'}</p>
          </div>
        );
      })}
    </div>
  );
}

export function DiscoverItemDetailDialog({
  item: initialItem,
  items,
  onClose,
  returnFocus,
}: {
  item: DiscoverDetailTarget;
  items: DiscoverDetailTarget[];
  onClose: () => void;
  returnFocus?: HTMLElement | null;
}) {
  const [item, setItem] = useState(initialItem);
  const [tab, setTab] = useState<Tab>('details');
  const [selectedEvent, setSelectedEvent] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(initialItem.text);
  const [draftDescription, setDraftDescription] = useState(initialItem.detail?.editable?.description ?? '');
  const panelRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const priorFocus = useRef<HTMLElement | null>(returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  const detail = item.detail;
  const history = detail?.history ?? [];
  const editable = detail?.editable;

  useEffect(() => {
    const panel = panelRef.current;
    const focusable = () => [...(panel?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [])];
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (editing) {
          setDraftTitle(item.text);
          setDraftDescription(editable?.description ?? '');
          setEditing(false);
        } else {
          onClose();
        }
        return;
      }
      if (event.key !== 'Tab') { return; }
      const nodes = focusable();
      if (nodes.length === 0) { event.preventDefault(); return; }
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      (returnFocus ?? priorFocus.current)?.focus();
    };
  }, [editable?.description, editing, item.text, onClose, returnFocus]);

  useEffect(() => {
    if (editing) { titleInputRef.current?.focus(); }
  }, [editing]);

  const switchItem = (id: string) => {
    const next = items.find((candidate) => candidate.id === id);
    if (!next) { return; }
    setItem(next);
    setTab('details');
    setSelectedEvent(0);
    setEditing(false);
    setDraftTitle(next.text);
    setDraftDescription(next.detail?.editable?.description ?? '');
  };
  const cancelEdit = () => {
    setDraftTitle(item.text);
    setDraftDescription(editable?.description ?? '');
    setEditing(false);
  };
  const saveEdit = () => {
    const text = draftTitle.trim();
    if (!editable || !text) { return; }
    postMessage({
      type: 'applyDiscoverOps',
      docPath: editable.docPath,
      revision: editable.revision,
      ops: [{ op: 'updateItem', id: item.id, text, description: draftDescription.trim() }],
    });
    onClose();
  };
  const event = history[selectedEvent];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="discover-item-detail-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{item.id}</code>
              <span className={`rounded-full border px-1.5 py-px text-[9.5px] font-semibold ${STATUS_CLASS[detail?.status ?? 'draft']}`}>{detail?.status ?? 'draft'}</span>
            </div>
            <h2 id="discover-item-detail-title" className="mt-1 text-sm font-semibold text-foreground">{item.text}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {editable && tab === 'details' && !editing && (
              <button type="button" onClick={() => setEditing(true)} title="Sửa Feature/Requirement" aria-label="Sửa Feature hoặc Requirement" className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            <button type="button" onClick={onClose} title="Đóng (Esc)" aria-label="Đóng chi tiết" className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex shrink-0 gap-1 border-b border-border px-4 pt-2" role="tablist" aria-label="Nội dung chi tiết">
          {([['details', 'Chi tiết'], ['history', `Lịch sử${history.length ? ` · ${history.length}` : ''}`]] as const).map(([value, text]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`rounded-t px-2.5 py-1.5 text-[11px] font-medium ${tab === value ? 'border border-b-popover border-border bg-popover text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
            >{text}</button>
          ))}
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-3" role="tabpanel">
          {tab === 'details' && (
            <div className="space-y-3">
              {!detail && <p className="text-[11px] text-muted-foreground">Entity này chưa được xuất bản; chỉ có Markdown canonical hiện tại.</p>}
              {detail && editing && editable && <section className="space-y-3">
                <div>
                  <label htmlFor="discover-item-title" className="text-[11px] font-semibold text-foreground">Tiêu đề</label>
                  <input
                    id="discover-item-title"
                    ref={titleInputRef}
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    className="mt-1 w-full rounded border border-primary/50 bg-background px-2.5 py-1.5 text-[11.5px] text-foreground"
                  />
                </div>
                <div>
                  <label htmlFor="discover-item-description" className="text-[11px] font-semibold text-foreground">Nội dung chi tiết</label>
                  <textarea
                    id="discover-item-description"
                    value={draftDescription}
                    onChange={(event) => setDraftDescription(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                        event.preventDefault();
                        saveEdit();
                      }
                    }}
                    rows={12}
                    className="mt-1 w-full resize-y rounded border border-border bg-background px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground"
                  />
                  <p className="mt-1 text-[10.5px] text-muted-foreground">Lưu vào Markdown canonical. Publish Context sau đó mới tạo revision lịch sử mới.</p>
                </div>
              </section>}
              {detail && !editing && <>
                <section className="rounded border border-border bg-background/40 px-3 py-2.5">
                  <div className="grid gap-x-4 gap-y-1.5 text-[10.5px] text-muted-foreground sm:grid-cols-2">
                    <p><span className="font-medium text-foreground">Loại:</span> {detail.kind === 'feature' ? 'Feature' : 'Requirement'}</p>
                    <p><span className="font-medium text-foreground">Trạng thái:</span> {detail.status}</p>
                    <p className="break-all"><span className="font-medium text-foreground">Nguồn canonical:</span> <code>{detail.editable?.docPath ?? '—'}#{detail.editable?.section ?? '—'}</code></p>
                    <p><span className="font-medium text-foreground">Discover revision:</span> {detail.editable?.revision ?? '—'}</p>
                    <p><span className="font-medium text-foreground">Publish context:</span> {detail.publication.status}{detail.publication.discoverRevision ? ` · ${detail.publication.discoverRevision}` : ''}</p>
                    <p><span className="font-medium text-foreground">Lần Publish:</span> {formatPublishedAt(detail.publication.publishedAt)}</p>
                    {detail.editable?.updatedAt && <p><span className="font-medium text-foreground">Cập nhật tài liệu:</span> {formatPublishedAt(detail.editable.updatedAt)}</p>}
                    {detail.contextPreview && <p><span className="font-medium text-foreground">Context slice:</span> ~{detail.contextPreview.estimatedTokens} tokens</p>}
                  </div>
                </section>
                <section className={`rounded border px-3 py-2 text-[10.5px] ${detail.readiness.missing.length ? 'border-warning/50 bg-warning/10 text-warning' : 'border-success/40 bg-success/10 text-success'}`}>
                  <p className="font-semibold">Độ đầy đủ: {detail.readiness.required.length - detail.readiness.missing.length}/{detail.readiness.required.length} field bắt buộc</p>
                  {detail.readiness.missing.length > 0
                    ? <p className="mt-0.5">Còn thiếu: {detail.readiness.missing.join(' · ')}.</p>
                    : <p className="mt-0.5">Đủ field chính để review trước Publish.</p>}
                </section>
                <section className="space-y-2">
                  <h3 className="text-[11px] font-semibold text-foreground">Nội dung canonical hiện tại</h3>
                  {Object.entries(detail.fields).map(([field, values]) => (
                    <div key={field}>
                      <h3 className="text-[11px] font-semibold text-foreground">{label(field)}</h3>
                      <ul className="mt-0.5 space-y-0.5">
                        {values.map((value, index) => <li key={index} className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">{value}</li>)}
                      </ul>
                    </div>
                  ))}
                </section>
                <section className="space-y-1.5 rounded border border-border bg-background/30 px-3 py-2.5">
                  <h3 className="text-[11px] font-semibold text-foreground">Liên kết & truy vết</h3>
                  {detail.links.coveringFeatureIds.length > 0 && <p className="text-[10.5px] text-muted-foreground">Được Feature bao phủ: <span className="font-mono">{detail.links.coveringFeatureIds.join(', ')}</span></p>}
                  {detail.links.coveredRequirementIds.length > 0 && <p className="text-[10.5px] text-muted-foreground">Bao phủ Requirement: <span className="font-mono">{detail.links.coveredRequirementIds.join(', ')}</span></p>}
                  {allReferences(item).length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {allReferences(item).map((id) => (
                        <button key={id} type="button" onClick={() => switchItem(id)} className="rounded border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground hover:bg-accent hover:text-foreground">{id}</button>
                      ))}
                    </div>
                  ) : <p className="text-[10.5px] text-muted-foreground">Chưa có liên kết ID được khai báo.</p>}
                </section>
                <section className="space-y-2 rounded border border-border bg-background/30 px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[11px] font-semibold text-foreground">Evidence code</h3>
                    <span className={`rounded-full border px-1.5 py-px text-[9.5px] font-semibold ${EVIDENCE_CLASS[detail.evidence.status]}`}>{EVIDENCE_LABEL[detail.evidence.status]}</span>
                  </div>
                  <p className="text-[10.5px] text-muted-foreground">Đã đối chiếu trên {detail.evidence.sourceFileCount} file source{detail.evidence.discoverRevision ? ` · evidence ${detail.evidence.discoverRevision}` : ' · evidence live chưa Publish'}.</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div><p className="mb-0.5 text-[10px] font-medium text-foreground">Source</p><PathList paths={detail.evidence.sourcePaths} empty="Chưa có file khớp." /></div>
                    <div><p className="mb-0.5 text-[10px] font-medium text-foreground">Tests</p><PathList paths={detail.evidence.testPaths} empty="Chưa có test được gắn." /></div>
                    <div><p className="mb-0.5 text-[10px] font-medium text-foreground">Entry points</p><PathList paths={detail.evidence.entryPoints} empty="Chưa xác định entry point." /></div>
                  </div>
                </section>
                <section className="rounded border border-primary/30 bg-primary/5 px-3 py-2 text-[10.5px] text-muted-foreground">
                  <p className="font-semibold text-foreground">Hành động đề xuất</p>
                  <p className="mt-0.5 leading-relaxed">{recommendedAction(detail)}</p>
                </section>
              </>}
            </div>
          )}
          {tab === 'history' && (
            history.length === 0
              ? <p className="py-4 text-center text-[11px] text-muted-foreground">Chưa có revision đã Publish cho entity này.</p>
              : <div className="grid gap-3 md:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.2fr)]">
                  <ol className="space-y-1.5">
                    {history.map((entry, index) => (
                      <li key={`${entry.discoverRevision}-${entry.afterHash}`}>
                        <button type="button" onClick={() => setSelectedEvent(index)} className={`w-full rounded border p-2 text-left text-[10.5px] ${selectedEvent === index ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-accent'}`}>
                          <p className="font-mono text-[9.5px]">{entry.discoverRevision}</p>
                          <p className="mt-0.5 font-medium">{entry.changeType} · {new Date(entry.publishedAt).toLocaleString()}</p>
                          <p className="mt-0.5 line-clamp-2">{entry.reason}</p>
                          {entry.breaking && <span className="mt-1 inline-block rounded bg-destructive/15 px-1 py-px text-[9px] font-semibold text-destructive">breaking</span>}
                        </button>
                      </li>
                    ))}
                  </ol>
                  {event && <section className="space-y-2 rounded border border-border bg-background/40 p-2.5 text-[10.5px]">
                    <p><span className="font-medium text-foreground">Actor:</span> {event.actor.kind} · {event.actor.id}</p>
                    {event.source && <p><span className="font-medium text-foreground">Source:</span> {Object.entries(event.source).map(([key, value]) => `${key}=${value}`).join(' · ')}</p>}
                    <p><span className="font-medium text-foreground">Changed:</span> {event.changedFields.join(', ') || '—'}</p>
                    <p className="break-all text-muted-foreground"><span className="font-medium text-foreground">Before hash:</span> {event.beforeHash ?? '—'}</p>
                    <p className="break-all text-muted-foreground"><span className="font-medium text-foreground">After hash:</span> {event.afterHash}</p>
                    <FieldDiff before={event.before} after={event.after} />
                    {(!event.before || !event.after) && <details className="rounded border border-border p-2"><summary className="cursor-pointer text-muted-foreground">Snapshot khả dụng</summary><div className="mt-2 grid gap-2 sm:grid-cols-2"><Snapshot value={event.before} empty="Chưa có" /><Snapshot value={event.after} empty="Chưa có" /></div></details>}
                  </section>}
                </div>
          )}
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-2">
          {editing ? <>
            <button type="button" onClick={cancelEdit} className="rounded border border-border px-3 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">Hủy</button>
            <button type="button" onClick={saveEdit} disabled={!draftTitle.trim()} className="inline-flex items-center gap-1 rounded border border-primary/50 bg-primary/15 px-3 py-1 text-[11px] font-semibold text-primary hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-40"><Save className="h-3 w-3" />Lưu</button>
          </> : (
            <button type="button" onClick={onClose} className="rounded border border-border px-3 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">Đóng</button>
          )}
        </footer>
      </div>
    </div>
  );
}
