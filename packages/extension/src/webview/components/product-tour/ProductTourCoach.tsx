import { Check, Eye, Loader2, Pause, Play, Plus, X } from 'lucide-react';
import type { ContextProposal, ProjectChangeReadModel } from '@/lib/types';
import type { ProductTourActiveUi, ProductTourAnchor } from '../../../shared/productTour';
import { postMessage } from '@/lib/bridge';
import { useHostAction } from '@/hooks/useHostAction';
import { useHostBusy } from '@/hooks/useHostBusy';

export function ProductTourCoach({
  active, changes, proposals, composerOpen = false, discoverContextStatus, onOpenComposer, onOpenBoundStartEpic, onFocus,
}: {
  active?: ProductTourActiveUi;
  changes: ProjectChangeReadModel[];
  proposals: ContextProposal[];
  /** True while the shared Change Composer (New change) modal is open. */
  composerOpen?: boolean;
  discoverContextStatus?: string;
  onOpenComposer?: () => void;
  /** Open Start Epic composer for the tour-bound Change (link-epic step). */
  onOpenBoundStartEpic?: (changeId: string) => void;
  onFocus: (anchor: ProductTourAnchor | undefined) => void;
}) {
  const { pending, pendingKey, run, isPending } = useHostAction({ timeoutMs: 15_000 });
  const hostBusy = useHostBusy();
  const showWorking = pending || hostBusy;

  if (!active || active.status === 'exited') return null;
  if (active.status === 'completed') {
    return (
      <aside className="fixed bottom-5 right-5 z-50 w-[330px] rounded-xl border border-success/40 bg-popover p-4 shadow-2xl" aria-busy={showWorking || undefined}>
        <div className="flex items-center gap-2 text-xs font-bold text-foreground"><Check className="h-4 w-4 text-success" />Đã hoàn tất: {active.title}</div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Bạn có thể mở lại tour bất cứ lúc nào từ Hướng dẫn.</p>
        {hostBusy && (
          <div className="mt-2 flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-[10px] font-semibold text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            Đang cập nhật workspace…
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={showWorking}
            onClick={() => run(() => postMessage({ type: 'productTourRestart' }), 'restart')}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-accent disabled:cursor-wait disabled:opacity-70"
          >
            {isPending('restart') && <Loader2 className="h-3 w-3 animate-spin" />}
            {isPending('restart') ? 'Đang mở…' : 'Làm lại'}
          </button>
          <button
            type="button"
            disabled={showWorking}
            onClick={() => run(() => postMessage({ type: 'productTourExit' }), 'exit')}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent disabled:cursor-wait disabled:opacity-70"
          >
            {isPending('exit') && <Loader2 className="h-3 w-3 animate-spin" />}
            {isPending('exit') ? 'Đang đóng…' : 'Đóng'}
          </button>
        </div>
      </aside>
    );
  }
  const step = active.steps[active.currentStepIndex];
  if (!step) return null;
  const paused = active.status === 'paused';
  const bindingInComposer = step.requires === 'change-binding' && composerOpen;
  const onDiscoverContextStep = step.id === 'lifecycle.discover-context-ready';
  const navigateAndFocus = () => {
    if (step.targetView) postMessage({ type: 'productTourNavigate', view: step.targetView });
    // Clear first so FocusLayer remounts and scrolls once even if the same
    // anchor is already active (otherwise scroll is trapped / skipped).
    onFocus(undefined);
    window.setTimeout(() => onFocus(step.target), 80);
  };
  return (
    <aside className="fixed bottom-5 right-5 z-50 w-[340px] rounded-xl border border-primary/35 bg-popover p-4 shadow-2xl" aria-live="polite" aria-busy={showWorking || undefined}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-wider text-primary">{active.title} · {active.currentStepIndex + 1}/{active.steps.length}</div><div className="mt-1 text-xs font-bold text-foreground">{bindingInComposer ? 'Tạo Change trong form' : step.title}</div></div>
        <button
          type="button"
          disabled={showWorking}
          onClick={() => run(() => postMessage({ type: 'productTourExit' }), 'exit')}
          title="Ẩn tour — mở lại từ Hướng dẫn → Tiếp tục"
          className="rounded p-1 text-muted-foreground hover:bg-accent disabled:cursor-wait disabled:opacity-70"
        >
          {isPending('exit') ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        </button>
      </div>
      {hostBusy && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-[10px] font-semibold text-primary">
          <Loader2 className="h-3 w-3 animate-spin" />
          Đang cập nhật workspace… tour sẽ chuyển bước khi xong
        </div>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {bindingInComposer
          ? 'Điền title hoặc description, chọn Save for later / Explore / Start Epic, rồi bấm nút xác nhận. Tour sẽ gắn đúng Change vừa tạo — không cần chọn lại trong danh sách.'
          : step.body}
      </p>
      {active.skippedStepTitles && active.skippedStepTitles.length > 0 && active.currentStepIndex === 0 && step.state === 'current' && (
        <p className="mt-2 text-[9.5px] leading-relaxed text-muted-foreground">
          Đã bỏ qua vì project đã có: {active.skippedStepTitles.join(' · ')}
        </p>
      )}
      {onDiscoverContextStep && discoverContextStatus && (
        <div className="mt-2 rounded-md border border-border px-2 py-1.5 text-[10px]">
          <span className="text-muted-foreground">Hiện tại: </span>
          <code className="font-semibold text-foreground">Context · {discoverContextStatus}</code>
          {discoverContextStatus !== 'ready' && discoverContextStatus !== 'not-required' && (
            <button
              type="button"
              onClick={() => { postMessage({ type: 'productTourNavigate', view: 'discover' }); window.setTimeout(() => onFocus('discover-publish-context'), 80); }}
              className="ml-2 inline-flex items-center gap-1 rounded border border-primary/45 px-1.5 py-0.5 font-semibold text-primary hover:bg-primary/10"
            >
              Tới Publish
            </button>
          )}
        </div>
      )}
      {step.requires === 'change-binding' && !composerOpen && (
        <BindingList
          label="Chọn Change"
          empty="Chưa có Change. Nhấn New change, điền requirement rồi lưu — tour sẽ gắn Change vừa tạo."
          values={changes.map((change) => ({ id: change.change.id, title: change.change.title }))}
          selected={active.boundChangeId}
          busy={showWorking}
          busyId={pendingKey?.startsWith('bind:') ? pendingKey.slice(5) : undefined}
          onSelect={(changeId) => run(() => postMessage({ type: 'productTourBindChange', changeId }), `bind:${changeId}`)}
          emptyAction={onOpenComposer ? { label: 'Mở New change', onClick: onOpenComposer } : undefined}
        />
      )}
      {step.requires === 'proposal-binding' && (
        <div className="mt-3 space-y-2">
          <BindingList
            label="Chọn Context Proposal"
            empty="Chưa có Context Proposal. Nếu scan không đổi gì (hoặc Keep/Undo chưa tạo CP), xác nhận bên dưới — đó vẫn là kết quả an toàn."
            values={proposals
              .filter((proposal) => !['applied', 'discarded'].includes(proposal.status))
              .map((proposal) => ({ id: proposal.id, title: `${proposal.origin} · ${proposal.status}` }))}
            selected={active.boundProposalId}
            busy={showWorking}
            busyId={pendingKey?.startsWith('bind:') ? pendingKey.slice(5) : undefined}
            onSelect={(proposalId) => run(() => postMessage({ type: 'productTourBindProposal', proposalId }), `bind:${proposalId}`)}
            emptyAction={{
              label: 'Tới Scan',
              onClick: () => {
                postMessage({ type: 'productTourNavigate', view: 'project' });
                window.setTimeout(() => onFocus('project-scan'), 80);
              },
            }}
          />
          {!proposals.some((proposal) => !['applied', 'discarded'].includes(proposal.status)) && (
            <button
              type="button"
              disabled={showWorking}
              onClick={() => run(() => postMessage({ type: 'productTourAcknowledge', stepId: 'scan.no-proposal' }), 'ack')}
              className="inline-flex w-full items-center justify-center gap-1 rounded bg-primary px-2.5 py-1.5 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
            >
              {isPending('ack') ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {isPending('ack') ? 'Đang xác nhận…' : 'Xác nhận: không có proposal (scan không đổi)'}
            </button>
          )}
        </div>
      )}
      {step.id === 'scan.pinned-source' && (
        <p className="mt-2 rounded-md border border-border px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
          Sau scan: có proposal thì chọn để review; không có thay đổi thì xác nhận “không có proposal” ở bước 2.
        </p>
      )}
      {step.id === 'lifecycle.link-epic' && active.boundChangeId && !composerOpen && onOpenBoundStartEpic && (() => {
        const bound = changes.find((rm) => rm.change.id === active.boundChangeId);
        const linkState = bound?.change.epicLink?.state;
        if (linkState === 'linked' || linkState === 'pending') return null;
        return (
          <button
            type="button"
            disabled={showWorking}
            onClick={() => {
              onFocus(undefined);
              onOpenBoundStartEpic(active.boundChangeId!);
              window.setTimeout(() => onFocus('change-route-start-epic'), 120);
            }}
            className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded bg-primary px-2.5 py-1.5 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
          >
            Mở Start Epic · {active.boundChangeId}
          </button>
        );
      })()}
      {step.id === 'lifecycle.link-epic' && composerOpen && (
        <p className="mt-2 rounded-md border border-border px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
          Trong form: chọn pipeline rồi bấm <span className="font-semibold text-foreground">Start linked Epic</span>. Tour Pass khi Change đã gắn Epic (hoặc đang pending khởi tạo).
        </p>
      )}
      {step.requires === 'acknowledgement' && (
        <button
          type="button"
          disabled={showWorking}
          onClick={() => run(() => postMessage({ type: 'productTourAcknowledge', stepId: step.id }), 'ack')}
          className="mt-3 inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1.5 text-[10.5px] font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-70"
        >
          {isPending('ack') ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {isPending('ack') ? 'Đang ghi…' : 'Đã hiểu'}
        </button>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {step.target && !bindingInComposer && (
          <button type="button" onClick={navigateAndFocus} className="inline-flex items-center gap-1 rounded border border-primary/45 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10">
            <Eye className="h-3 w-3" />Chỉ vị trí
          </button>
        )}
        <button
          type="button"
          disabled={showWorking}
          onClick={() => run(() => postMessage({ type: paused ? 'productTourResume' : 'productTourPause' }), 'pause')}
          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent disabled:cursor-wait disabled:opacity-70"
        >
          {isPending('pause')
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          {isPending('pause') ? 'Đang cập nhật…' : paused ? 'Tiếp tục' : 'Tạm dừng'}
        </button>
        <span className="ml-auto text-[9.5px] text-muted-foreground">Esc tắt spotlight · vẫn scroll được</span>
      </div>
    </aside>
  );
}

function BindingList({
  label, empty, values, selected, onSelect, emptyAction, busy, busyId,
}: {
  label: string;
  empty: string;
  values: Array<{ id: string; title: string }>;
  selected?: string;
  onSelect: (id: string) => void;
  emptyAction?: { label: string; onClick: () => void };
  busy?: boolean;
  busyId?: string;
}) {
  return (
    <div className="mt-3 rounded-md border border-border p-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-foreground">
        {label}
        {busy && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
      </div>
      {values.length === 0 ? (
        <div className="mt-1 space-y-2">
          <p className="text-[10px] leading-relaxed text-muted-foreground">{empty}</p>
          {emptyAction && (
            <button
              type="button"
              onClick={emptyAction.onClick}
              className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3 w-3" />
              {emptyAction.label}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-1.5 max-h-24 space-y-1 overflow-y-auto">
          {values.map((value) => (
            <button
              key={value.id}
              type="button"
              disabled={busy}
              onClick={() => onSelect(value.id)}
              className={`flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[10px] disabled:cursor-wait disabled:opacity-70 ${selected === value.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'}`}
            >
              {busyId === value.id && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
              <span className="min-w-0 truncate"><code>{value.id}</code> · {value.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
