import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  FileText,
  FolderKanban,
  ListTodo,
  Plus,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { EpicSummary, WorkspaceState } from '@/lib/types';
import { cn } from '@/lib/utils';
import { postMessage } from '@/lib/bridge';

interface ProjectOverviewProps {
  state: WorkspaceState;
  onOpenTask: (taskId?: string) => void;
  onNewTask: () => void;
  onOpenDiscover: () => void;
}

export function ProjectOverview({ state, onOpenTask, onNewTask, onOpenDiscover }: ProjectOverviewProps) {
  const context = state.projectWorkspace;
  const counts = taskCounts(state.epics);
  const active = [...state.epics]
    .filter((task) => task.status !== 'done')
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.id.localeCompare(b.id))
    .slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
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
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            New task
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
        <Stat label="Total tasks" value={state.epics.length} icon={<ListTodo className="h-4 w-4" />} />
        <Stat label="In progress" value={counts.inProgress} tone="primary" icon={<Circle className="h-4 w-4 fill-current" />} />
        <Stat label="Completed" value={counts.done} tone="success" icon={<CheckCircle2 className="h-4 w-4" />} />
        <Stat label="Needs attention" value={counts.failed} tone="warning" icon={<AlertTriangle className="h-4 w-4" />} />
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
              <h2 className="text-sm font-bold text-foreground">Active tasks</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Open a task to see its work, artifacts, and verification state.</p>
            </div>
            <button type="button" onClick={() => onOpenTask()} className="text-[11px] font-semibold text-primary hover:underline">
              View all
            </button>
          </div>

          {active.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center p-6 text-center">
              <ListTodo className="h-7 w-7 text-muted-foreground/60" />
              <div className="mt-3 text-xs font-semibold text-foreground">
                {state.epics.length === 0 ? 'No tasks yet' : 'All tasks are complete'}
              </div>
              <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-muted-foreground">
                Create a focused task with its own acceptance criteria and execution pipeline.
              </p>
              <button type="button" onClick={onNewTask} className="mt-3 text-[11px] font-semibold text-primary hover:underline">
                Create the first task
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {active.map((task) => (
                <TaskRow key={task.id} task={task} onOpen={() => onOpenTask(task.id)} />
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

function taskCounts(tasks: EpicSummary[]): { inProgress: number; done: number; failed: number } {
  return {
    inProgress: tasks.filter((task) => task.status === 'in_progress').length,
    done: tasks.filter((task) => task.status === 'done').length,
    failed: tasks.filter((task) => task.status === 'failed').length,
  };
}

function statusRank(status: EpicSummary['status']): number {
  return status === 'failed' ? 0 : status === 'in_progress' ? 1 : status === 'pending' ? 2 : 3;
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

function TaskRow({ task, onOpen }: { task: EpicSummary; onOpen: () => void }) {
  const statusClass = task.status === 'failed'
    ? 'bg-destructive/10 text-destructive'
    : task.status === 'in_progress'
      ? 'bg-primary/10 text-primary'
      : 'bg-secondary text-muted-foreground';
  const statusLabel = task.status === 'in_progress'
    ? 'In progress'
    : task.status === 'failed'
      ? 'Needs attention'
      : task.status;
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-accent/50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="text-[10px] font-semibold text-primary">{task.id}</code>
          <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold capitalize', statusClass)}>{statusLabel}</span>
        </div>
        <div className="mt-1 truncate text-xs font-semibold text-foreground">{task.title || 'Untitled task'}</div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary" style={{ width: `${task.progress}%` }} />
        </div>
      </div>
      <div className="text-[10px] font-medium text-muted-foreground">{task.progress}%</div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
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
