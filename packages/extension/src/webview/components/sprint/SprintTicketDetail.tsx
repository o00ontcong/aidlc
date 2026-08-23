/**
 * Detail pane for the selected ticket — right column of the Sprint tab.
 *
 * The action bar is the point of the whole tab: one primary move ("start a task
 * from this ticket"), and it changes shape rather than lying when that move is
 * unavailable. A ticket that already has a task offers to open it; a ticket read
 * from a stale cache offers nothing, because acting on tickets we could not
 * re-verify is how you create a task against a ticket someone else already closed.
 */

import { ArrowRight, Copy, ExternalLink, Link2, ListChecks, Play } from 'lucide-react';

import type { SprintTicket } from '@/lib/types';
import { cn } from '@/lib/utils';

import { StatusPill } from './SprintEmptyStates';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="pt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </dt>
      <dd className="m-0 min-w-0 text-[11.5px] text-foreground">{children}</dd>
    </>
  );
}

function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
      {children}
      {hint && <span className="ml-2 normal-case tracking-normal opacity-80">{hint}</span>}
    </div>
  );
}

export interface SprintTicketDetailProps {
  ticket: SprintTicket | null;
  /** Tickets are from cache — writes and task creation are blocked. */
  stale: boolean;
  subtasksEnabled: boolean;
  transitionsEnabled: boolean;
  onStartTask: (ticket: SprintTicket) => void;
  onOpenLinked: (epicId: string) => void;
  onOpenExternal: (url: string) => void;
  onCopyKey: (key: string) => void;
  onOpenTransitionSettings: () => void;
  onOpenSubtasks: () => void;
}

export function SprintTicketDetail({
  ticket,
  stale,
  subtasksEnabled,
  transitionsEnabled,
  onStartTask,
  onOpenLinked,
  onOpenExternal,
  onCopyKey,
  onOpenTransitionSettings,
  onOpenSubtasks,
}: SprintTicketDetailProps) {
  if (!ticket) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
        Chọn một ticket để xem chi tiết.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3.5">
        <div className="font-mono text-[11px] text-muted-foreground">
          {ticket.key} · {ticket.type || 'Issue'}
          {ticket.isSubtask && ' · subtask'}
        </div>
        <h2 className="mt-1.5 mb-2.5 text-[15px] font-semibold leading-snug text-foreground">
          {ticket.summary || '(không có tiêu đề)'}
        </h2>
        <dl className="grid grid-cols-[88px_1fr] gap-x-2.5 gap-y-1.5">
          <Field label="Status">
            <StatusPill status={ticket.status} category={ticket.statusCategory} />
          </Field>
          <Field label="Assignee">
            {ticket.assigneeName || 'chưa assign'}
            {ticket.isMine && <span className="ml-1.5 text-primary">· bạn</span>}
          </Field>
          <Field label="Points">
            {ticket.points === null ? '—' : ticket.points}
            {ticket.priority && <span className="text-muted-foreground"> · {ticket.priority}</span>}
          </Field>
          {ticket.parentKey && (
            <Field label="Parent">
              <span className="font-mono">{ticket.parentKey}</span>
              {ticket.parentSummary && (
                <span className="text-muted-foreground"> — {ticket.parentSummary}</span>
              )}
            </Field>
          )}
          {ticket.labels.length > 0 && (
            <Field label="Labels">
              <span className="flex flex-wrap gap-1">
                {ticket.labels.map((label) => (
                  <span
                    key={label}
                    className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground"
                  >
                    {label}
                  </span>
                ))}
              </span>
            </Field>
          )}
        </dl>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
        <SectionLabel hint="ADF đã dẹp về markdown">Description</SectionLabel>
        {ticket.descriptionMd ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-muted-foreground">
            {ticket.descriptionMd}
          </pre>
        ) : (
          <p className="text-[12px] italic text-muted-foreground/70">Ticket này không có description.</p>
        )}

        {ticket.acceptanceCriteria.length > 0 && (
          <div className="mt-4">
            <SectionLabel>Acceptance criteria</SectionLabel>
            <ul className="m-0 list-none p-0 text-[12px] text-muted-foreground">
              {ticket.acceptanceCriteria.map((criterion, index) => (
                <li key={`${index}-${criterion}`} className="flex gap-2 py-0.5">
                  <span className="text-muted-foreground/60">□</span>
                  <span>{criterion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {ticket.existingSubtasks.length > 0 && (
          <div className="mt-4">
            <SectionLabel>Subtask đã có trên Jira</SectionLabel>
            <ul className="m-0 list-none space-y-1 p-0">
              {ticket.existingSubtasks.map((subtask) => (
                <li key={subtask.key} className="flex items-center gap-2 text-[11.5px]">
                  <span className="font-mono text-muted-foreground">{subtask.key}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{subtask.summary}</span>
                  <span className="shrink-0 text-muted-foreground">{subtask.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-card px-4 py-3">
        {ticket.linkedEpicId ? (
          <button
            type="button"
            onClick={() => onOpenLinked(ticket.linkedEpicId!)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Link2 className="h-3.5 w-3.5" />
            Mở {ticket.linkedEpicId}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            disabled={stale}
            title={stale ? 'Danh sách đang là bản cache — làm mới trước khi tạo task.' : undefined}
            onClick={() => onStartTask(ticket)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold',
              stale
                ? 'cursor-not-allowed border border-border bg-secondary text-muted-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            <Play className="h-3.5 w-3.5" />
            Start task in AIDLC
          </button>
        )}
        <button
          type="button"
          disabled={stale || ticket.isSubtask}
          title={
            ticket.isSubtask
              ? 'Jira không cho subtask lồng nhau.'
              : stale ? 'Danh sách đang là bản cache — làm mới trước.' : undefined
          }
          onClick={onOpenSubtasks}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium',
            stale || ticket.isSubtask
              ? 'cursor-not-allowed border-border bg-secondary text-muted-foreground'
              : 'border-primary/40 bg-primary/15 text-primary hover:bg-primary/25',
          )}
        >
          <ListChecks className="h-3.5 w-3.5" />
          Subtask…
        </button>
        <button
          type="button"
          onClick={() => onOpenExternal(ticket.url)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Mở trên Jira
        </button>
        <button
          type="button"
          onClick={() => onCopyKey(ticket.key)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy key
        </button>

        <button
          type="button"
          onClick={onOpenTransitionSettings}
          className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
        >
          Ghi ngược trạng thái:{' '}
          <b className={transitionsEnabled ? 'text-primary' : 'text-muted-foreground'}>
            {transitionsEnabled ? 'bật' : 'tắt'}
          </b>
          {subtasksEnabled && <span className="text-primary"> · subtask bật</span>}
        </button>
      </div>
    </div>
  );
}
