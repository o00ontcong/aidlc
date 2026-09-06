import { Plus } from 'lucide-react';

import type { ProjectChangeReadModel } from '@/lib/types';
import { postMessage } from '@/lib/bridge';

/**
 * A Change projection (plan §12.4) — the same shared `ProjectChangeReadModel`
 * Project/Sprint/Epic all render, filtered to nothing (every Change is
 * relevant here) and shown with its requirement + next action. Creation goes
 * through the one shared Change Composer (`requestNewChange` asks the host to
 * reopen it) rather than a second, Discover-local form — there is exactly one
 * way to create a Change (plan §12.1).
 */
export function WorkItemsPanel({ changes }: { changes: ProjectChangeReadModel[] }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">Changes</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Every Change tracked for this project, with its requirement and next action.
          </p>
        </div>
        <button
          type="button"
          onClick={() => postMessage({ type: 'requestNewChange' })}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />New change
        </button>
      </div>

      <div className="mt-4 grid gap-2">
        {changes.length === 0 && (
          <p className="rounded border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            No changes yet. Capture one with its own requirement to start development.
          </p>
        )}
        {changes.map((rm) => (
          <article key={rm.change.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-[10px] text-muted-foreground">{rm.change.id}</code>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold">{rm.change.type}</span>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">{rm.change.priority}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {rm.derived.state.replace(/-/g, ' ')}{rm.change.epicLink?.state === 'linked' ? ` · ${rm.change.epicLink.epicId}` : ''}
              </span>
            </div>
            <h3 className="mt-2 text-xs font-semibold text-foreground">{rm.change.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{rm.change.requirement.desiredOutcome}</p>
            {rm.change.requirement.acceptanceCriteria.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">{rm.change.requirement.acceptanceCriteria.length} acceptance criteria</p>
            )}
            {rm.warnings.length > 0 && (
              <p className="mt-2 text-[10px] text-warning">{rm.warnings[0].message}</p>
            )}
            {rm.availableActions.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {rm.availableActions.slice(0, 3).map((action) => (
                  <span key={action.command} className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground">
                    {action.label}
                  </span>
                ))}
                {!rm.change.epicLink && rm.availableActions.some((action) => action.command === 'change.epic.start') && (
                  <button
                    type="button"
                    data-tour-id="change-route-start-epic"
                    onClick={() => postMessage({
                      type: 'startEpicForChange',
                      changeId: rm.change.id,
                      guard: { expectedRevision: rm.change.revision, expectedContentHash: rm.change.contentHash },
                    })}
                    className="rounded border border-primary/40 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10"
                  >
                    Start Epic
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
