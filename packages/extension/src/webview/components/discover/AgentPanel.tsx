/* The agent side of the tab: what the current step still needs, the control
 * that hands it to an agent, and the history of what agents did — each run
 * still undoable for as long as its snapshot exists.
 */

import { useState } from 'react';
import { AlertTriangle, Check, FileCog, Play, RotateCcw } from 'lucide-react';
import type { DiscoverStep, DiscoverSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import type { DiscoverCopy } from '@/lib/discoverI18n';
import { missingRequirements, pct, shortTime } from './lib';

export function AgentPanel({
  discover, step, copy, onOpenDiff,
}: {
  discover: DiscoverSummary;
  step: DiscoverStep;
  copy: DiscoverCopy;
  onOpenDiff: (runId: string) => void;
}) {
  const [note, setNote] = useState('');
  const missing = missingRequirements(step);
  const stepDocs = discover.docs.filter((d) => d.step === step.id);
  const isEmpty = stepDocs.every((doc) =>
    doc.sections.every((s) => s.prose.trim() === '' && s.items.length === 0 && s.records.length === 0));
  const active = discover.activeRun;
  const errors = discover.issues.filter((i) => i.level === 'error').length;

  return (
    <aside className="flex h-full flex-col gap-3 overflow-y-auto border-l border-border px-3 py-3">
      <p className="text-[9.5px] font-bold tracking-[0.09em] text-muted-foreground">{copy.agent}</p>

      <section className="rounded-lg border border-border bg-card p-2.5">
        <h4 className="text-[11.5px] font-semibold text-foreground">{step.order} · {step.label}</h4>
        <div className="my-1.5 h-1 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: pct(step.completion) }} />
        </div>
        {missing.length === 0 ? (
          <p className="text-[10.5px] text-success">{copy.doneWhen}: ✓</p>
        ) : (
          <ul className="space-y-0.5">
            {missing.map((m) => (
              <li key={m.id} className="text-[10.5px] text-muted-foreground">
                • {m.label}{m.detail ? ` (${m.detail})` : ''}
              </li>
            ))}
          </ul>
        )}

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={copy.notePlaceholder}
          className="mt-2 w-full rounded border border-border bg-background px-2 py-1 text-[10.5px] text-foreground placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={() => postMessage({ type: 'runDiscoverStep', step: step.id, note })}
          className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Play className="h-3 w-3" /> {copy.runStep}
        </button>
        <button
          type="button"
          onClick={() => postMessage({ type: 'runDiscoverPipeline', note })}
          className="mt-1 w-full rounded-md border border-border bg-secondary/40 px-2 py-1 text-[10.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {copy.runPipeline}
        </button>
        <p className="mt-1.5 text-[10px] text-muted-foreground/80">
          {isEmpty ? copy.modeFillHint : copy.modeRefineHint}
        </p>
      </section>

      {active && active.run.guardrail.length > 0 && (
        <section className="rounded-lg border border-warning/40 bg-warning/5 p-2.5">
          <h4 className="text-[11px] font-semibold text-warning">{copy.guardrail}</h4>
          <ul className="mt-1 space-y-0.5">
            {active.run.guardrail.map((g) => (
              <li key={g} className="flex items-start gap-1 text-[10.5px] text-warning">
                <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />{g}
              </li>
            ))}
          </ul>
        </section>
      )}

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
                  <button type="button" onClick={() => onOpenDiff(run.id)} className="text-primary hover:underline">{copy.viewDiff}</button>
                )}
                {run.revertable && run.status !== 'reverted' && (
                  <button
                    type="button"
                    onClick={() => postMessage({ type: 'revertDiscoverRun', runId: run.id })}
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
        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-[10.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <FileCog className="h-3 w-3" /> {copy.generateDevDocs}
      </button>
    </aside>
  );
}
