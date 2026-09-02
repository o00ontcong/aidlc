/* The agent side of the tab: the history of what agents did — each run still
 * undoable for as long as its snapshot exists — and the checks list.
 */

import { Check, FileCog, RotateCcw } from 'lucide-react';
import type { DiscoverSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import type { DiscoverCopy } from '@/lib/discoverI18n';
import { shortTime } from './lib';

export function AgentPanel({
  discover, copy, onOpenDiff,
}: {
  discover: DiscoverSummary;
  copy: DiscoverCopy;
  onOpenDiff: (runId: string) => void;
}) {
  const errors = discover.issues.filter((i) => i.level === 'error').length;

  return (
    <aside className="flex h-full flex-col gap-3 overflow-y-auto border-l border-border px-3 py-3">
      <p className="text-[9.5px] font-bold tracking-[0.09em] text-muted-foreground">{copy.agent}</p>

      <section className="rounded-lg border border-border bg-card p-2.5">
        <h4 className="text-[11px] font-semibold text-foreground">{copy.history}</h4>
        {discover.runs.length === 0 && <p className="mt-1 text-[10.5px] text-muted-foreground">{copy.noRuns}</p>}
        <ul className="mt-1 divide-y divide-border/50">
          {discover.runs.slice(0, 8).map((run) => (
            <li key={run.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 py-1 text-[10.5px]">
              <span className="font-mono text-[9.5px] text-muted-foreground">{run.id}</span>
              <span className="text-muted-foreground">{run.step}</span>
              <span className="text-success">+{run.diff.added.length}</span>
              <span className="text-warning">~{run.diff.updated.length}</span>
              <span className="text-destructive">−{run.diff.removed.length}</span>
              <span className="ml-auto flex items-center gap-1.5">
                {run.status === 'review' && (
                  <button type="button" title={copy.hints.openRunDiff} onClick={() => onOpenDiff(run.id)} className="text-primary hover:underline">{copy.viewDiff}</button>
                )}
                {run.revertable && run.status !== 'reverted' && (
                  <button
                    type="button"
                    onClick={() => postMessage({ type: 'revertDiscoverRun', runId: run.id })}
                    title={copy.hints.undoRun}
                    className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />{copy.undo}
                  </button>
                )}
                {run.status === 'kept' && <Check className="h-3 w-3 text-success" />}
                <span className="text-muted-foreground/70">{shortTime(run.finishedAt ?? run.startedAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-card p-2.5">
        <h4 className="text-[11px] font-semibold text-foreground">
          {copy.checks} · {discover.issues.length}{errors ? ` (${errors})` : ''}
        </h4>
        <ul className="mt-1 space-y-0.5">
          {discover.issues.slice(0, 8).map((issue, idx) => (
            <li key={`${issue.code}-${issue.id ?? idx}`} className={`text-[10.5px] ${issue.level === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
              {issue.message}
            </li>
          ))}
          {discover.issues.length === 0 && <li className="text-[10.5px] text-success">✓</li>}
        </ul>
      </section>

      <button
        type="button"
        onClick={() => postMessage({ type: 'runDiscoverDevDocs' })}
        title={copy.hints.generateDevDocs}
        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-[10.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <FileCog className="h-3 w-3" /> {copy.generateDevDocs}
      </button>
    </aside>
  );
}
