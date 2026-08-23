/**
 * The sprint ticket list — left column of the Sprint tab.
 *
 * Presentation only: filtering, grouping and selection state live in
 * {@link ../SprintView}. Rows carry the ticket key in mono (it is an id, and
 * every other surface in this extension renders ids that way) and surface the
 * one piece of AIDLC-side information Jira does not have: whether a task already
 * exists for this ticket.
 */

import { Link2 } from 'lucide-react';

import type { SprintTicket } from '@/lib/types';
import { cn } from '@/lib/utils';

import { StatusPill } from './SprintEmptyStates';

/** Group label shown above each bucket. */
export const GROUP_LABEL: Record<string, string> = {
  in_progress: 'Đang làm',
  todo: 'Chưa bắt đầu',
  closing: 'Chờ review / đã xong',
};

/** One-letter type badge. Colour follows the type, not the status. */
function TypeBadge({ kind, type }: { kind: SprintTicket['typeKind']; type: string }) {
  const letter = kind === 'bug' ? 'B'
    : kind === 'story' ? 'S'
      : kind === 'spike' ? '?'
        : kind === 'subtask' ? '↳'
          : 'T';
  return (
    <span
      title={type}
      className={cn(
        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold',
        kind === 'bug' && 'border border-destructive/40 bg-destructive/15 text-destructive',
        kind === 'story' && 'border border-primary/40 bg-primary/15 text-primary',
        kind === 'spike' && 'border border-info/40 bg-info/15 text-info',
        (kind === 'task' || kind === 'subtask' || kind === 'other')
          && 'border border-border bg-secondary text-muted-foreground',
      )}
    >
      {letter}
    </span>
  );
}

function TicketRow({ ticket, selected, onSelect, onOpenLinked }: {
  ticket: SprintTicket;
  selected: boolean;
  onSelect: () => void;
  onOpenLinked: (epicId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'w-full border-b border-border/50 px-4 py-2.5 text-left hover:bg-accent/50',
        selected && 'bg-primary/10 shadow-[inset_2px_0_0_var(--color-primary)]',
        // A done ticket is context, not work — de-emphasise without hiding.
        ticket.statusCategory === 'done' && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-2.5">
        <TypeBadge kind={ticket.typeKind} type={ticket.type} />
        <span
          className={cn(
            'mt-0.5 shrink-0 font-mono text-[11px]',
            selected ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          {ticket.key}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] leading-snug text-foreground">{ticket.summary || '(không có tiêu đề)'}</div>
          {(ticket.linkedEpicId || ticket.labels.length > 0 || !ticket.isMine) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {ticket.linkedEpicId && (
                <span
                  role="link"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenLinked(ticket.linkedEpicId!);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.stopPropagation();
                      onOpenLinked(ticket.linkedEpicId!);
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/15 px-1.5 py-0.5 font-mono text-[9.5px] text-primary hover:bg-primary/25"
                >
                  <Link2 className="h-2.5 w-2.5" />
                  {ticket.linkedEpicId}
                  {ticket.linkedEpicProgress ? ` · ${ticket.linkedEpicProgress}` : ''}
                </span>
              )}
              {!ticket.isMine && ticket.assigneeName && (
                <span className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[9.5px] text-muted-foreground">
                  {ticket.assigneeName}
                </span>
              )}
              {ticket.labels.slice(0, 3).map((label) => (
                <span
                  key={label}
                  className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusPill status={ticket.status} category={ticket.statusCategory} />
          <span className="rounded-full border border-border px-1.5 font-mono text-[10px] text-muted-foreground">
            {ticket.points === null ? '—' : ticket.points}
          </span>
        </div>
      </div>
    </button>
  );
}

export interface SprintTicketListProps {
  groups: Array<{ id: string; tickets: SprintTicket[] }>;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onOpenLinked: (epicId: string) => void;
}

export function SprintTicketList({ groups, selectedKey, onSelect, onOpenLinked }: SprintTicketListProps) {
  return (
    <div className="h-full overflow-y-auto">
      {groups.filter((group) => group.tickets.length > 0).map((group) => (
        <div key={group.id}>
          <div className="bg-background/95 px-4 pb-1.5 pt-3 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
            {GROUP_LABEL[group.id] ?? group.id}
            <span className="ml-2 opacity-70">{group.tickets.length}</span>
          </div>
          {group.tickets.map((ticket) => (
            <TicketRow
              key={ticket.key}
              ticket={ticket}
              selected={ticket.key === selectedKey}
              onSelect={() => onSelect(ticket.key)}
              onOpenLinked={onOpenLinked}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
