import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleHelp,
  FileText,
  FolderKanban,
  ListTodo,
  Plus,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { PRODUCT_TOUR_VERSION } from '../../shared/productTour';
import type { ProjectChangeReadModel, WorkspaceState } from '@/lib/types';
import { cn } from '@/lib/utils';
import { postMessage } from '@/lib/bridge';

interface ProjectOverviewProps {
  state: WorkspaceState;
  onOpenTask: (taskId?: string) => void;
  onNewTask: () => void;
  onStartEpicForChange: (change: ProjectChangeReadModel) => void;
  onOpenDiscover: () => void;
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

export function ProjectOverview({ state, onOpenTask, onNewTask, onStartEpicForChange, onOpenDiscover }: ProjectOverviewProps) {
  const context = state.projectWorkspace;
  const counts = changeCounts(state.changes);
  const activeChanges = [...state.changes]
    .filter((rm) => changeBucket(rm) !== 'other')
    .sort((a, b) => {
      const rank = (rm: ProjectChangeReadModel) => (changeBucket(rm) === 'attention' ? 0 : changeBucket(rm) === 'active' ? 1 : 2);
      return rank(a) - rank(b) || b.change.updatedAt.localeCompare(a.change.updatedAt);
    })
    .slice(0, 6);

  const tour = state.productTour;
  const showTourCard = Boolean(tour)
    && (tour.dismissedCardVersion ?? 0) < PRODUCT_TOUR_VERSION
    && (tour.seenVersion ?? 0) < PRODUCT_TOUR_VERSION
    && (!tour.active || tour.active.status === 'exited');
  const vi = state.displayLanguage === 'vi';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {showTourCard && (
        <section className="flex flex-col gap-3 rounded-xl border border-primary/35 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <CircleHelp className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground">Product Tour</div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {vi
                  ? 'Theo một Change thật từ yêu cầu, qua Epic, đến khi khép Context. Nút Hướng dẫn trên thanh trên luôn mở lại tour.'
                  : 'Follow a real Change from requirement through Epic until Context is closed. The Guide button in the top bar always reopens the tour.'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => postMessage({ type: 'productTourStart', tourId: 'lifecycle-basics' })}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {vi ? 'Bắt đầu Product Tour' : 'Start Product Tour'}
            </button>
            <button
              type="button"
              onClick={() => postMessage({ type: 'productTourDismissCard' })}
              title={vi ? 'Để sau' : 'Dismiss'}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      )}
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderKanban className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Shared workspace</div>
            <h1 className="mt-1 text-xl font-bold text-foreground">{state.workspaceName || 'Project overview'}</h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Shared context lives here. Each task has its own work area, while project status and decisions remain visible to every task.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenDiscover}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            <Plus className="h-3.5 w-3.5" />
            Open Discover
          </button>
          <button
            type="button"
            onClick={onNewTask}
            data-tour-id="project-new-change"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            New change
          </button>
          <button
            type="button"
            onClick={() => onOpenTask()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
          >
            All tasks
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total changes" value={state.changes.length} icon={<ListTodo className="h-4 w-4" />} />
        <Stat label="Active" value={counts.active} tone="primary" icon={<Circle className="h-4 w-4 fill-current" />} />
        <Stat label="Delivered" value={counts.delivered} tone="success" icon={<CheckCircle2 className="h-4 w-4" />} />
        <Stat label="Needs attention" value={counts.attention} tone="warning" icon={<AlertTriangle className="h-4 w-4" />} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">Shared project context</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Durable memory that survives across providers and task conversations.
              </p>
            </div>
            {context && (
              <span className={cn(
                'rounded-full px-2 py-1 text-[10px] font-semibold',
                context.initialized ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
              )}>
                {context.readyCount}/{context.totalCount} ready
              </span>
            )}
          </div>

          {!context?.initialized && (
            <div className="m-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
              <div className="text-xs font-semibold text-foreground">Initialize shared project memory</div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Creates only missing files: AGENTS.md, PROJECT.md, STATUS.md, and DECISIONS.md. Existing content is never overwritten.
              </p>
              <button
                type="button"
                onClick={() => postMessage({ type: 'initializeProjectWorkspace' })}
                className="mt-3 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Create missing files
              </button>
            </div>
          )}

          <div className="divide-y divide-border">
            {(context?.documents ?? []).map((document) => (
              <button
                key={document.id}
                type="button"
                disabled={!document.exists}
                onClick={() => document.exists && postMessage({ type: 'openPath', path: document.path })}
                className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors enabled:hover:bg-accent/50 disabled:cursor-default"
              >
                <div className={cn(
                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                  document.exists ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground',
                )}>
                  <FileText className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">{document.label}</span>
                    <code className="text-[10px] text-muted-foreground">{basename(document.path)}</code>
                  </div>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
                    {document.excerpt || document.description}
                  </p>
                </div>
                <span className={cn(
                  'mt-1 text-[9px] font-bold uppercase tracking-wide',
                  document.exists ? 'text-success' : 'text-muted-foreground',
                )}>
                  {document.exists ? 'Ready' : 'Missing'}
                </span>
              </button>
            ))}
          </div>
        </section>

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
            <div className="divide-y divide-border">
              {activeChanges.map((rm) => (
                <ChangeRow
                  key={rm.change.id}
                  readModel={rm}
                  onOpen={rm.change.epicLink?.state === 'linked' ? () => onOpenTask(rm.change.epicLink!.epicId) : undefined}
                  onStartEpic={rm.change.epicLink ? undefined : rm.availableActions.some((action) => action.command === 'change.epic.start') ? () => onStartEpicForChange(rm) : undefined}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold text-foreground">How work moves through this workspace</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <FlowStep number="1" title="Read shared context" detail="Every task starts from the same brief, status, decisions, and working agreement." />
          <FlowStep number="2" title="Work in one task" detail="The task owns its scope, artifacts, code changes, and acceptance criteria." />
          <FlowStep number="3" title="Review and verify" detail="Inspect the diff and artifacts, then run the relevant application and tests." />
          <FlowStep number="4" title="Update shared state" detail="Record completed work, blockers, decisions, and the next priority before handoff." />
        </div>
      </section>
    </div>
  );
}

function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
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

function ChangeRow({ readModel, onOpen, onStartEpic }: { readModel: ProjectChangeReadModel; onOpen?: () => void; onStartEpic?: () => void }) {
  const bucket = changeBucket(readModel);
  const statusClass = bucket === 'attention'
    ? 'bg-warning/10 text-warning'
    : bucket === 'delivered'
      ? 'bg-success/10 text-success'
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
  if (onStartEpic) {
    return (
      <div className="flex w-full items-center gap-3 px-5 py-3.5">
        {content}
        <button type="button" onClick={onStartEpic} data-tour-id="change-route-start-epic" className="shrink-0 rounded border border-primary/40 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10">
          Start Epic
        </button>
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
