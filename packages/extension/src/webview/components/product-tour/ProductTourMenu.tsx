import { useEffect, useRef, useState } from 'react';
import { CircleHelp, Loader2, Play, RotateCcw, Route, Sparkles } from 'lucide-react';
import type { ProductTourGoalOffer, ProductTourId, ProductTourUiState } from '../../../shared/productTour';
import { onHostMessage, postMessage } from '@/lib/bridge';
import { useHostAction } from '@/hooks/useHostAction';
import { useHostBusy } from '@/hooks/useHostBusy';
import type { DiscoverLanguage } from '@/lib/discoverI18n';
import { cn } from '@/lib/utils';
import { Modal, ModalCancelButton, ModalConfirmButton, ModalFooter } from '../Modal';

const FIXED_TOURS: { id: ProductTourId; title: string; detail: string }[] = [
  { id: 'lifecycle-basics', title: 'Vòng đời Change → Epic → Context', detail: 'Theo một Change thật đến khi khép Context.' },
  { id: 'safe-scan', title: 'Quét an toàn như Git', detail: 'Scan trên tab Dự án → proposal → resolve. Không cần xong cả 3 pass.' },
  { id: 'rejection-recovery', title: 'Khi impact không phù hợp', detail: 'Không có confirmation gate hoặc dead-end sau feedback.' },
];

export function ProductTourMenu({ tour, language }: { tour: ProductTourUiState; language: DiscoverLanguage }) {
  const [open, setOpen] = useState(false);
  const [dynamicOpen, setDynamicOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { pending, run, isPending } = useHostAction({
    timeoutMs: 15_000,
    onSettled: () => setOpen(false),
  });
  const hostBusy = useHostBusy();
  const showWorking = pending || hostBusy;
  const active = tour.active;
  const incomplete = Boolean(
    active
    && active.status !== 'completed'
    && active.steps.length > 0
    && active.currentStepIndex < active.steps.length,
  );
  const resumable = incomplete && (active!.status === 'active' || active!.status === 'paused' || active!.status === 'exited');
  const vi = language === 'vi';
  const idleLabel = vi ? 'Hướng dẫn' : 'Product Tour';
  const progressLabel = resumable
    ? `Tour ${Math.min(active!.currentStepIndex + 1, Math.max(active!.steps.length, 1))}/${Math.max(active!.steps.length, 1)}`
    : idleLabel;

  useEffect(() => {
    return onHostMessage((msg) => {
      if (msg.type === 'openProductTourMenu') setOpen(true);
    });
  }, []);

  useEffect(() => {
    if (!open || dynamicOpen || pending) return;
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
  }, [open, dynamicOpen, pending]);

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
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : hostBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleHelp className="h-3.5 w-3.5" />}
        <span>{showWorking ? (vi ? 'Đang tải…' : 'Loading…') : progressLabel}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 rounded-lg border border-border bg-popover p-3 shadow-xl" aria-busy={pending || undefined}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-foreground">Product Tour</div>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
                {vi
                  ? 'Hướng dẫn không chặn thao tác. Một bước chỉ hoàn tất khi dữ liệu project thực sự thay đổi.'
                  : 'Guidance never blocks actions. A step completes only when project data actually changes.'}
              </p>
            </div>
            <button type="button" onClick={() => postMessage({ type: 'productTourOpenWalkthrough' })} className="text-[10px] font-semibold text-primary hover:underline">VS Code guide</button>
          </div>
          {resumable && active && (
            <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-2.5">
              <div className="text-[11px] font-semibold text-foreground">{vi ? 'Đang dở:' : 'In progress:'} {active.title}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {vi ? 'Bước' : 'Step'} {Math.min(active.currentStepIndex + 1, Math.max(active.steps.length, 1))}/{Math.max(active.steps.length, 1)}
                {active.status === 'paused' || active.status === 'exited'
                  ? (vi ? ' · đã tạm dừng' : ' · paused')
                  : ''}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => postMessage({ type: 'productTourResume' }), 'resume')}
                  className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-70"
                >
                  {isPending('resume') ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  {isPending('resume') ? (vi ? 'Đang mở…' : 'Opening…') : (vi ? 'Tiếp tục' : 'Resume')}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => postMessage({ type: 'productTourRestart' }), 'restart')}
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent disabled:cursor-wait disabled:opacity-70"
                >
                  {isPending('restart') ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                  {isPending('restart') ? (vi ? 'Đang mở…' : 'Restarting…') : (vi ? 'Làm lại' : 'Restart')}
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => { setOpen(false); setDynamicOpen(true); }}
            className="mt-3 w-full rounded-md border border-primary/40 bg-primary/5 px-2.5 py-2 text-left hover:border-primary/55 hover:bg-primary/10 disabled:opacity-70"
          >
            <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-primary">
              <Route className="h-3.5 w-3.5" />
              {vi ? 'Dynamic tour trên project này' : 'Dynamic tour on this project'}
            </div>
            <span className="mt-0.5 block text-[9.5px] font-normal text-muted-foreground">
              {vi
                ? 'Hỏi bạn muốn làm gì, đối chiếu state hiện tại, rồi lên plan các bước còn thiếu.'
                : 'Ask what you want, compare current project state, then plan remaining steps.'}
            </span>
          </button>
          <div className="mt-3 space-y-1.5">
            {FIXED_TOURS.map((item) => {
              const goal = (tour.goals ?? []).find((offer) => offer.id === item.id);
              const starting = isPending(`start:${item.id}`);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => postMessage({ type: 'productTourStart', tourId: item.id }), `start:${item.id}`)}
                  className="w-full rounded-md border border-border p-2.5 text-left hover:border-primary/40 hover:bg-accent/50 disabled:cursor-wait disabled:opacity-70"
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                    {starting && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                    {starting ? (vi ? 'Đang bắt đầu…' : 'Starting…') : item.title}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{item.detail}</div>
                  {goal?.reason && !goal.recommended && (
                    <p className="mt-1 text-[10px] text-warning">{goal.reason}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {dynamicOpen && (
        <DynamicTourModal
          goals={tour.goals ?? []}
          vi={vi}
          onClose={() => setDynamicOpen(false)}
        />
      )}
    </div>
  );
}

function DynamicTourModal({
  goals, vi, onClose,
}: {
  goals: ProductTourGoalOffer[];
  vi: boolean;
  onClose: () => void;
}) {
  const selectable = goals.filter((goal) => goal.remainingCount > 0);
  const recommended = selectable.find((goal) => goal.recommended) ?? selectable[0];
  const [selectedId, setSelectedId] = useState<ProductTourGoalOffer['id'] | null>(recommended?.id ?? null);
  const selected = goals.find((goal) => goal.id === selectedId) ?? null;
  const canStart = Boolean(selected && selected.remainingCount > 0);
  const { pending, run } = useHostAction({
    timeoutMs: 15_000,
    onSettled: onClose,
  });

  const submit = () => {
    if (!canStart || !selected || pending) { return; }
    run(() => postMessage({ type: 'productTourStartGoal', goalId: selected.id }));
  };

  return (
    <Modal
      title={vi ? 'Dynamic tour — chọn mục tiêu' : 'Dynamic tour — pick a goal'}
      subtitle={vi
        ? 'Chọn một hàng trong bảng. AIDLC chỉ đưa các bước còn thiếu vào plan.'
        : 'Select a row. AIDLC only plans the steps still missing.'}
      maxWidth="max-w-4xl"
      maxHeight="max-h-[88vh]"
      onClose={onClose}
      onSubmit={submit}
      closeOnBackdrop={false}
      busy={pending}
    >
      {goals.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {vi ? 'Chưa có dữ liệu project để lập plan.' : 'No project state available to plan from.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full border-collapse text-left">
            <thead className="bg-muted/40 text-[10.5px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2 font-semibold" aria-label="select" />
                <th className="px-3 py-2 font-semibold">{vi ? 'Mục tiêu' : 'Goal'}</th>
                <th className="hidden px-3 py-2 font-semibold md:table-cell">{vi ? 'Mô tả' : 'Detail'}</th>
                <th className="whitespace-nowrap px-3 py-2 font-semibold">{vi ? 'Plan' : 'Plan'}</th>
                <th className="whitespace-nowrap px-3 py-2 font-semibold">{vi ? 'Trạng thái' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((goal) => {
                const done = goal.remainingCount === 0;
                const isSelected = goal.id === selectedId;
                return (
                  <tr
                    key={goal.id}
                    onClick={() => { if (!done && !pending) setSelectedId(goal.id); }}
                    className={cn(
                      'border-t border-border align-top text-[11.5px]',
                      done || pending ? 'cursor-default opacity-55' : 'cursor-pointer hover:bg-accent/40',
                      isSelected && !done && 'bg-primary/10',
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="radio"
                        name="dynamic-tour-goal"
                        checked={isSelected}
                        disabled={done || pending}
                        onChange={() => setSelectedId(goal.id)}
                        className="accent-primary"
                        aria-label={goal.title}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-foreground">{goal.title}</span>
                        {goal.recommended && !done && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                            <Sparkles className="h-2.5 w-2.5" />
                            {vi ? 'Gợi ý' : 'Suggested'}
                          </span>
                        )}
                      </div>
                      {goal.reason && !done && (
                        <p className="mt-1 text-[10.5px] text-primary/90">{goal.reason}</p>
                      )}
                      {!done && goal.remainingTitles.length > 0 && (
                        <p className="mt-1 text-[10.5px] text-muted-foreground md:hidden">
                          {goal.remainingTitles.join(' → ')}
                        </p>
                      )}
                    </td>
                    <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">
                      <p>{goal.detail}</p>
                      {!done && goal.remainingTitles.length > 0 && (
                        <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-[10.5px] leading-snug">
                          {goal.remainingTitles.map((title) => <li key={title}>{title}</li>)}
                        </ol>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                      {done
                        ? (vi ? '0 bước' : '0 steps')
                        : (vi
                          ? `${goal.remainingCount} bước${goal.skippedCount ? ` · −${goal.skippedCount}` : ''}`
                          : `${goal.remainingCount} left${goal.skippedCount ? ` · −${goal.skippedCount}` : ''}`)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {done
                        ? <span className="text-muted-foreground">{vi ? 'Đã xong' : 'Done'}</span>
                        : <span className="font-medium text-primary">{vi ? 'Còn thiếu' : 'Remaining'}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ModalFooter>
        <ModalCancelButton onClick={onClose} disabled={pending} />
        <ModalConfirmButton
          onClick={submit}
          label={vi ? 'Bắt đầu' : 'Start'}
          disabled={!canStart}
          loading={pending}
          loadingLabel={vi ? 'Đang bắt đầu…' : 'Starting…'}
        />
      </ModalFooter>
    </Modal>
  );
}
