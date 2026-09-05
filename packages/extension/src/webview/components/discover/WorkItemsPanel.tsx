import { useState } from 'react';
import { Plus } from 'lucide-react';

import type { DiscoverSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';

type WorkType = 'feature' | 'bug' | 'refactor' | 'spike' | 'maintenance';
type Priority = 'critical' | 'high' | 'normal' | 'low';

const types: WorkType[] = ['feature', 'bug', 'maintenance', 'refactor', 'spike'];

/**
 * Project work is intentionally separate from the product blueprint: a new
 * request gets its own requirement and later one Epic, instead of causing a
 * broad scan to rewrite the team's shared system description.
 */
export function WorkItemsPanel({ discover }: { discover: DiscoverSummary }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [outcome, setOutcome] = useState('');
  const [workType, setWorkType] = useState<WorkType>('feature');
  const [priority, setPriority] = useState<Priority>('normal');
  const [criteria, setCriteria] = useState('');

  const submit = () => {
    if (!title.trim() || !outcome.trim()) { return; }
    postMessage({
      type: 'createProjectWorkItem', title, outcome, workType, priority,
      acceptanceCriteria: criteria.split('\n').map((line) => line.replace(/^[-*]\s*/, '').trim()).filter(Boolean),
    });
    setOpen(false);
    setTitle(''); setOutcome(''); setCriteria(''); setWorkType('feature'); setPriority('normal');
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">Công việc dự án</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Mỗi requirement phải xác nhận những node Project Context bị tác động trước khi tạo Epic; chỉ các node đó mới nhận Context Patch sau delivery.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90">
          <Plus className="h-3.5 w-3.5" />Thêm yêu cầu
        </button>
      </div>

      {open && (
        <form className="mt-4 grid max-w-3xl gap-3 rounded-lg border border-primary/40 bg-card p-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <label className="grid gap-1 text-xs font-medium text-foreground">Tên công việc
            <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Cảnh báo khi danh mục vượt ngưỡng" className="rounded border border-border bg-background px-2 py-1.5 text-xs font-normal" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-foreground">Kết quả mong muốn / vấn đề cần giải quyết
            <textarea required rows={3} value={outcome} onChange={(event) => setOutcome(event.target.value)} className="resize-y rounded border border-border bg-background px-2 py-1.5 text-xs font-normal" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-foreground">Loại
              <select value={workType} onChange={(event) => setWorkType(event.target.value as WorkType)} className="rounded border border-border bg-background px-2 py-1.5 text-xs font-normal">
                {types.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-foreground">Ưu tiên
              <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)} className="rounded border border-border bg-background px-2 py-1.5 text-xs font-normal">
                {(['critical', 'high', 'normal', 'low'] as Priority[]).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-xs font-medium text-foreground">Acceptance criteria <span className="font-normal text-muted-foreground">(mỗi dòng một tiêu chí)</span>
            <textarea rows={3} value={criteria} onChange={(event) => setCriteria(event.target.value)} placeholder="Người dùng nhận một cảnh báo cho mỗi lần vượt ngưỡng" className="resize-y rounded border border-border bg-background px-2 py-1.5 text-xs font-normal" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent">Huỷ</button>
            <button type="submit" className="rounded bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">Lưu requirement</button>
          </div>
        </form>
      )}

      <div className="mt-4 grid gap-2">
        {discover.workItems.length === 0 && <p className="rounded border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">Chưa có yêu cầu nào. Scan chỉ đồng bộ context; bắt đầu phát triển bằng một requirement.</p>}
        {discover.workItems.map((item) => (
          <article key={item.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-[10px] text-muted-foreground">{item.id}</code>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold">{item.type}</span>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">{item.priority}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{item.status}{item.epicId ? ` · ${item.epicId}` : ''}</span>
            </div>
            <h3 className="mt-2 text-xs font-semibold text-foreground">{item.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.requirement.outcome}</p>
            {item.requirement.acceptanceCriteria.length > 0 && <p className="mt-2 text-[11px] text-muted-foreground">{item.requirement.acceptanceCriteria.length} acceptance criteria</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${item.impact.status === 'confirmed' ? 'bg-success/15 text-success' : item.impact.status === 'proposed' ? 'bg-warning/15 text-warning' : 'bg-secondary text-muted-foreground'}`}>
                Impact · {item.impact.status}
              </span>
              {item.impact.contextIds.length > 0 && <span className="text-[10px] text-muted-foreground">{item.impact.contextIds.join(', ')}</span>}
              {item.impact.status === 'not-analyzed' && (
                <button type="button" onClick={() => postMessage({ type: 'analyzeProjectWorkItemImpact', id: item.id, revision: item.revision })} className="rounded border border-border px-2 py-1 text-[10px] hover:bg-accent">Phân tích impact</button>
              )}
              {item.impact.status === 'proposed' && (
                <button type="button" disabled={item.impact.contextIds.length === 0} onClick={() => postMessage({ type: 'confirmProjectWorkItemImpact', id: item.id, revision: item.revision })} className="rounded border border-primary/50 px-2 py-1 text-[10px] text-primary hover:bg-primary/10 disabled:opacity-40">Xác nhận impact</button>
              )}
            </div>
            {item.impact.status === 'proposed' && item.impact.contextIds.length === 0 && <p className="mt-2 text-[10px] text-warning">Chưa tìm thấy node context phù hợp — bổ sung mapping trước khi tạo Epic.</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
