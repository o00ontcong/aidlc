import { useEffect, useRef, useState } from 'react';
import { CircleHelp, Play, RotateCcw } from 'lucide-react';
import type { ProductTourUiState } from '../../../shared/productTour';
import { onHostMessage, postMessage } from '@/lib/bridge';
import type { DiscoverLanguage } from '@/lib/discoverI18n';

const TOURS = [
  { id: 'lifecycle-basics', title: 'Vòng đời Change → Epic → Context', detail: 'Theo một Change thật đến khi khép Context.' },
  { id: 'safe-scan', title: 'Quét an toàn như Git', detail: 'Scan có snapshot, proposal riêng và rebase khi Context đổi.' },
  { id: 'rejection-recovery', title: 'Khi impact không phù hợp', detail: 'Không có confirmation gate hoặc dead-end sau feedback.' },
] as const;

export function ProductTourMenu({ tour, language }: { tour: ProductTourUiState; language: DiscoverLanguage }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = tour.active;
  const resumable = active && (active.status === 'active' || active.status === 'paused');
  const vi = language === 'vi';
  const idleLabel = vi ? 'Hướng dẫn' : 'Product Tour';
  const progressLabel = resumable
    ? `Tour ${Math.min(active.currentStepIndex + 1, active.steps.length)}/${active.steps.length}`
    : idleLabel;

  useEffect(() => {
    return onHostMessage((msg) => {
      if (msg.type === 'openProductTourMenu') setOpen(true);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" data-tour-id="topbar-help" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={vi ? 'Hướng dẫn tính năng và Product Tour' : 'Feature guide and Product Tour'}
        aria-label={vi ? 'Hướng dẫn — Product Tour' : 'Product Tour'}
        aria-expanded={open}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 text-[10px] font-bold text-primary hover:bg-primary/15"
      >
        <CircleHelp className="h-3.5 w-3.5" />
        <span>{progressLabel}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 rounded-lg border border-border bg-popover p-3 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-foreground">Product Tour</div>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">Hướng dẫn không chặn thao tác. Một bước chỉ hoàn tất khi dữ liệu project thực sự thay đổi.</p>
            </div>
            <button type="button" onClick={() => postMessage({ type: 'productTourOpenWalkthrough' })} className="text-[10px] font-semibold text-primary hover:underline">VS Code guide</button>
          </div>
          {resumable && (
            <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-2.5">
              <div className="text-[11px] font-semibold text-foreground">Đang dở: {active.title}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">Bước {Math.min(active.currentStepIndex + 1, active.steps.length)}/{active.steps.length}</div>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => { postMessage({ type: 'productTourResume' }); setOpen(false); }} className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground"><Play className="h-3 w-3" />Tiếp tục</button>
                <button type="button" onClick={() => { postMessage({ type: 'productTourRestart' }); setOpen(false); }} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent"><RotateCcw className="h-3 w-3" />Làm lại</button>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => { postMessage({ type: 'productTourOpenDemo', tourId: active?.id ?? 'lifecycle-basics' }); setOpen(false); }}
            className="mt-3 w-full rounded-md border border-border px-2.5 py-2 text-left text-[10.5px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Mở demo riêng trong cửa sổ mới
            <span className="mt-0.5 block text-[9.5px] font-normal">Nằm trong extension storage, không đụng vào repository hiện tại.</span>
          </button>
          <div className="mt-3 space-y-1.5">
            {TOURS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { postMessage({ type: 'productTourStart', tourId: item.id }); setOpen(false); }}
                className="w-full rounded-md border border-border p-2.5 text-left hover:border-primary/40 hover:bg-accent/50"
              >
                <div className="text-[11px] font-semibold text-foreground">{item.title}</div>
                <div className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{item.detail}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
