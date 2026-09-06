import {
  AlertTriangle,
  ArrowRight,
  Beaker,
  CheckCircle2,
  Circle,
  FolderKanban,
  ListTodo,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { ProjectChangeReadModel, WorkspaceState } from '@/lib/types';
import { cn } from '@/lib/utils';
import { postMessage } from '@/lib/bridge';
import { useHostAction } from '@/hooks/useHostAction';
import type { DiscoverLanguage } from '@/lib/discoverI18n';
import { BugReportModal } from './BugReportModal';
import { CancelChangeModal } from './CancelChangeModal';
import { ProjectScanPanel } from './project/ProjectScanPanel';

interface ProjectOverviewProps {
  state: WorkspaceState;
  onOpenTask: (taskId?: string) => void;
  onNewTask: () => void;
  onStartEpicForChange: (change: ProjectChangeReadModel) => void;
  /** When set, only this Change's Start Epic control carries the tour spotlight id. */
  tourBoundChangeId?: string;
  /** Hide list Start Epic tour anchors while the composer modal owns the spotlight. */
  hideStartEpicTourAnchor?: boolean;
}

/** Buckets a Change's derived display state into the four stat tiles — a superset reading of the same states `deriveProjectChangeState` produces (Master Rule §0.3: the tiles must not invent their own status vocabulary). */
function changeBucket(rm: ProjectChangeReadModel): 'active' | 'delivered' | 'attention' | 'other' {
  if (rm.warnings.length > 0 || rm.derived.badges.length > 0) return 'attention';
  if (rm.derived.state === 'done' || rm.derived.state === 'delivered') return 'delivered';
  if (rm.derived.state === 'shelved' || rm.derived.state === 'cancelled' || rm.derived.state === 'superseded') return 'other';
  return 'active';
}

function changeCounts(changes: ProjectChangeReadModel[]): { active: number; delivered: number; attention: number } {
  let active = 0, delivered = 0, attention = 0;
  for (const rm of changes) {
    const bucket = changeBucket(rm);
    if (bucket === 'attention') attention += 1;
    else if (bucket === 'delivered') delivered += 1;
    else if (bucket === 'active') active += 1;
  }
  return { active, delivered, attention };
}

export function ProjectOverview({ state, onOpenTask, onNewTask, onStartEpicForChange, tourBoundChangeId, hideStartEpicTourAnchor }: ProjectOverviewProps) {
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ProjectChangeReadModel | null>(null);
  const { pending: doctorPending, run: runDoctor } = useHostAction();
  const counts = changeCounts(state.changes);
  const vi = state.displayLanguage === 'vi';
  const activeChanges = [...state.changes]
    .sort((a, b) => {
      const rank = (rm: ProjectChangeReadModel) => {
        const bucket = changeBucket(rm);
        return bucket === 'attention' ? 0 : bucket === 'active' ? 1 : bucket === 'delivered' ? 2 : 3;
      };
      return rank(a) - rank(b) || b.change.updatedAt.localeCompare(a.change.updatedAt);
    })
    .slice(0, 50);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderKanban className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Project</div>
            <h1 className="mt-1 text-xl font-bold text-foreground">{state.workspaceName || 'Project overview'}</h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {vi
                ? 'Quét an toàn và Change inventory. Mỗi Change có không gian riêng; scan chỉ tạo proposal, không ghi thẳng Context.'
                : 'Safe scan and Change inventory. Each Change has its own work area; scan stages proposals instead of writing Context.'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onNewTask}
            data-tour-id="project-new-change"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            New change
          </button>
          {state.configExists && (
            <>
              <button
                type="button"
                onClick={() => setBugReportOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
              >
                <Beaker className="h-3.5 w-3.5" />
                Báo lỗi CoFoFo
              </button>
              <button
                type="button"
                disabled={doctorPending}
                onClick={() => runDoctor(() => postMessage({ type: 'cofofoDoctor' }))}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent disabled:cursor-wait disabled:opacity-70"
              >
                {doctorPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {doctorPending ? 'Đang kiểm tra…' : 'Kiểm tra & sửa workspace'}
              </button>
            </>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total changes" value={state.changes.length} icon={<ListTodo className="h-4 w-4" />} />
        <Stat label="Active" value={counts.active} tone="primary" icon={<Circle className="h-4 w-4 fill-current" />} />
        <Stat label="Delivered" value={counts.delivered} tone="success" icon={<CheckCircle2 className="h-4 w-4" />} />
        <Stat label="Needs attention" value={counts.attention} tone="warning" icon={<AlertTriangle className="h-4 w-4" />} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <ProjectScanPanel
          discover={state.discover}
          proposals={state.contextProposals}
          contextHead={state.contextHead}
          language={(state.displayLanguage ?? 'en') as DiscoverLanguage}
        />

        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">Active work</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Every Change and where it stands — captured, exploring, running, or needing a decision.</p>
            </div>
            <button type="button" onClick={() => onOpenTask()} className="text-[11px] font-semibold text-primary hover:underline">
              View all tasks
            </button>
          </div>

          {activeChanges.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center p-6 text-center">
              <ListTodo className="h-7 w-7 text-muted-foreground/60" />
              <div className="mt-3 text-xs font-semibold text-foreground">
                {state.changes.length === 0 ? 'No changes yet' : 'Everything active is delivered'}
              </div>
              <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-muted-foreground">
                Capture a change with its own requirement, then explore it or start an Epic.
              </p>
              <button type="button" onClick={onNewTask} className="mt-3 text-[11px] font-semibold text-primary hover:underline">
                New change
              </button>
            </div>
          ) : (
            <div className="max-h-[26rem] divide-y divide-border overflow-y-auto">
              {activeChanges.map((rm) => (
                <ChangeRow
                  key={rm.change.id}
                  readModel={rm}
                  tourAnchor={!hideStartEpicTourAnchor && (Boolean(tourBoundChangeId) ? rm.change.id === tourBoundChangeId : true)}
                  onOpen={rm.change.epicLink?.state === 'linked' ? () => onOpenTask(rm.change.epicLink!.epicId) : undefined}
                  onStartEpic={rm.change.epicLink ? undefined : rm.availableActions.some((action) => action.command === 'change.epic.start') ? () => onStartEpicForChange(rm) : undefined}
                  onCancel={rm.availableActions.some((action) => action.command === 'change.cancel') ? () => setCancelTarget(rm) : undefined}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold text-foreground">{vi ? 'Cách làm việc trong workspace' : 'How work moves through this workspace'}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <FlowStep number="1" title={vi ? 'Quét an toàn' : 'Safe scan'} detail={vi ? 'Scan pin snapshot; kết quả vào Context Proposal, không ghi thẳng Context.' : 'Scan pins a snapshot; results become Context Proposals, not direct Context writes.'} />
          <FlowStep number="2" title={vi ? 'Làm trong một Change' : 'Work in one Change'} detail={vi ? 'Change giữ requirement, Epic, artifact và quyết định Context.' : 'The Change owns requirement, Epic, artifacts, and Context decisions.'} />
          <FlowStep number="3" title={vi ? 'Review và verify' : 'Review and verify'} detail={vi ? 'Duyệt diff/proposal, chạy app và test liên quan.' : 'Inspect diff/proposal, then run the relevant app and tests.'} />
          <FlowStep number="4" title={vi ? 'Khép Context' : 'Close Context'} detail={vi ? 'Apply / discard / không cần cập nhật Context trước khi Done.' : 'Apply, discard, or mark Context not-required before Done.'} />
        </div>
      </section>
      {bugReportOpen && (
        <BugReportModal
          onSubmit={(fields) => postMessage({ type: 'reportCofofoBug', fields })}
          onClose={() => setBugReportOpen(false)}
        />
      )}
      {cancelTarget && (
        <CancelChangeModal
          changeId={cancelTarget.change.id}
          title={cancelTarget.change.title}
          onConfirm={(reason) => postMessage({
            type: 'cancelChange',
            changeId: cancelTarget.change.id,
            guard: { expectedRevision: cancelTarget.change.revision, expectedContentHash: cancelTarget.change.contentHash },
            reason,
          })}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'warning';
}) {
  const tones = {
    default: 'bg-secondary text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
  };
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
      <div className={cn('flex h-8 w-8 items-center justify-center rounded-md', tones[tone])}>{icon}</div>
      <div>
        <div className="text-xl font-bold leading-none text-foreground">{value}</div>
        <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function ChangeRow({
  readModel, onOpen, onStartEpic, onCancel, tourAnchor = true,
}: {
  readModel: ProjectChangeReadModel;
  onOpen?: () => void;
  onStartEpic?: () => void;
  onCancel?: () => void;
  /** When false, omit tour spotlight id so querySelector targets the bound Change only. */
  tourAnchor?: boolean;
}) {
  const bucket = changeBucket(readModel);
  const statusClass = bucket === 'attention'
    ? 'bg-warning/10 text-warning'
    : bucket === 'delivered'
      ? 'bg-success/10 text-success'
      : bucket === 'other'
        ? 'bg-secondary text-muted-foreground'
        : 'bg-primary/10 text-primary';
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="text-[10px] font-semibold text-primary">{readModel.change.id}</code>
          <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold capitalize', statusClass)}>{readModel.derived.state.replace(/-/g, ' ')}</span>
        </div>
        <div className="mt-1 truncate text-xs font-semibold text-foreground">{readModel.change.title || 'Untitled change'}</div>
        {readModel.warnings.length > 0 && (
          <div className="mt-1 text-[10px] text-warning">{readModel.warnings[0].message}</div>
        )}
      </div>
      <div className="text-[10px] font-medium text-muted-foreground">
        {readModel.availableActions[0]?.label ?? ''}
      </div>
      {onOpen && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
    </>
  );
  if (onStartEpic || onCancel) {
    return (
      <div className="flex w-full items-center gap-3 px-5 py-3.5">
        {content}
        {onStartEpic && (
          <button
            type="button"
            onClick={onStartEpic}
            data-tour-id={tourAnchor ? 'change-route-start-epic' : undefined}
            className="shrink-0 rounded border border-primary/40 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10"
          >
            Start Epic
          </button>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} className="shrink-0 rounded border border-destructive/40 px-2 py-1 text-[10px] font-semibold text-destructive hover:bg-destructive/10">
            Cancel
          </button>
        )}
      </div>
    );
  }
  return onOpen ? (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-accent/50">
      {content}
    </button>
  ) : (
    <div className="flex w-full items-center gap-3 px-5 py-3.5">{content}</div>
  );
}

function FlowStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-lg bg-secondary/40 p-3.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{number}</div>
      <div>
        <div className="text-xs font-semibold text-foreground">{title}</div>
        <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
