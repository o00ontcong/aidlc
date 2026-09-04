/* Read-only detail dialog for structured Discover records. */

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { DiscoverRecord } from '@/lib/types';

export function DiscoverRecordDetailDialog({
  record,
  onClose,
  returnFocus,
}: {
  record: DiscoverRecord;
  onClose: () => void;
  returnFocus?: HTMLElement | null;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const priorFocus = useRef<HTMLElement | null>(returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  const title = record.title.trim() || 'Chưa đặt tiêu đề';

  useEffect(() => {
    const panel = panelRef.current;
    const focusable = () => [...(panel?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [])];
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
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
  }, [onClose, returnFocus]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="discover-record-detail-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{record.id}</code>
            <h2 id="discover-record-detail-title" className="mt-1 text-sm font-semibold text-foreground">{title}</h2>
          </div>
          <button type="button" onClick={onClose} title="Đóng (Esc)" aria-label="Đóng chi tiết" className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-4 py-3">
          <section className="space-y-3" aria-label="Nội dung chi tiết">
            {record.fields.map((field) => (
              <div key={field.label}>
                <h3 className="text-[11px] font-semibold text-foreground">{field.label}</h3>
                {field.items.length > 0 ? (
                  <ol className="mt-0.5 list-inside list-decimal space-y-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {field.items.map((item, index) => <li key={index}>{item}</li>)}
                  </ol>
                ) : (
                  <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">{field.value || '—'}</p>
                )}
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
