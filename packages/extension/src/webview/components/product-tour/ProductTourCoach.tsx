import { Check, Eye, Pause, Play, X } from 'lucide-react';
import type { ContextProposal, ProjectChangeReadModel } from '@/lib/types';
import type { ProductTourActiveUi, ProductTourAnchor, ProductTourView } from '../../../shared/productTour';
import { postMessage } from '@/lib/bridge';

export function ProductTourCoach({
  active, changes, proposals, onFocus,
}: {
  active?: ProductTourActiveUi;
  changes: ProjectChangeReadModel[];
  proposals: ContextProposal[];
  onFocus: (anchor: ProductTourAnchor | undefined) => void;
}) {
  if (!active || active.status === 'exited') return null;
  if (active.status === 'completed') {
    return (
      <aside className="fixed bottom-5 right-5 z-50 w-[330px] rounded-xl border border-success/40 bg-popover p-4 shadow-2xl">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground"><Check className="h-4 w-4 text-success" />Đã hoàn tất: {active.title}</div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Bạn có thể mở lại tour bất cứ lúc nào từ Hướng dẫn.</p>
        <div className="mt-3 flex gap-2"><button type="button" onClick={() => postMessage({ type: 'productTourRestart' })} className="rounded border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-accent">Làm lại</button><button type="button" onClick={() => postMessage({ type: 'productTourExit' })} className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent">Đóng</button></div>
      </aside>
    );
  }
  const step = active.steps[active.currentStepIndex];
  if (!step) return null;
  const paused = active.status === 'paused';
  const navigateAndFocus = () => {
    if (step.targetView) postMessage({ type: 'productTourNavigate', view: step.targetView });
    window.setTimeout(() => onFocus(step.target), 80);
  };
  return (
    <aside className="fixed bottom-5 right-5 z-50 w-[340px] rounded-xl border border-primary/35 bg-popover p-4 shadow-2xl" aria-live="polite">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-wider text-primary">{active.title} · {active.currentStepIndex + 1}/{active.steps.length}</div><div className="mt-1 text-xs font-bold text-foreground">{step.title}</div></div>
        <button type="button" onClick={() => postMessage({ type: 'productTourExit' })} title="Thoát tour" className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-3.5 w-3.5" /></button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{step.body}</p>
      {step.requires === 'change-binding' && (
        <BindingList label="Chọn Change" empty="Tạo Change trước, rồi quay lại chọn đúng bản ghi đó." values={changes.map((change) => ({ id: change.change.id, title: change.change.title }))} selected={active.boundChangeId} onSelect={(changeId) => postMessage({ type: 'productTourBindChange', changeId })} />
      )}
      {step.requires === 'proposal-binding' && (
        <BindingList label="Chọn Context Proposal" empty="Chưa có proposal để review. Tour sẽ không giả vờ rằng scan đã tạo proposal." values={proposals.map((proposal) => ({ id: proposal.id, title: `${proposal.origin} · ${proposal.status}` }))} selected={active.boundProposalId} onSelect={(proposalId) => postMessage({ type: 'productTourBindProposal', proposalId })} />
      )}
      {step.requires === 'acknowledgement' && (
        <button type="button" onClick={() => postMessage({ type: 'productTourAcknowledge', stepId: step.id })} className="mt-3 inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1.5 text-[10.5px] font-semibold text-primary-foreground"><Check className="h-3 w-3" />Đã hiểu</button>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {step.target && <button type="button" onClick={navigateAndFocus} className="inline-flex items-center gap-1 rounded border border-primary/45 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10"><Eye className="h-3 w-3" />Chỉ vị trí</button>}
        <button type="button" onClick={() => postMessage({ type: paused ? 'productTourResume' : 'productTourPause' })} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent">{paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}{paused ? 'Tiếp tục' : 'Tạm dừng'}</button>
        <span className="ml-auto text-[9.5px] text-muted-foreground">Esc chỉ tắt spotlight</span>
      </div>
    </aside>
  );
}

function BindingList({ label, empty, values, selected, onSelect }: { label: string; empty: string; values: Array<{ id: string; title: string }>; selected?: string; onSelect: (id: string) => void }) {
  return (
    <div className="mt-3 rounded-md border border-border p-2">
      <div className="text-[10px] font-semibold text-foreground">{label}</div>
      {values.length === 0 ? <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{empty}</p> : <div className="mt-1.5 max-h-24 space-y-1 overflow-y-auto">{values.map((value) => <button key={value.id} type="button" onClick={() => onSelect(value.id)} className={`block w-full rounded px-1.5 py-1 text-left text-[10px] ${selected === value.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'}`}><code>{value.id}</code> · {value.title}</button>)}</div>}
    </div>
  );
}
