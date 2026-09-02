/* What an agent run changed, entry by entry.
 *
 * Not a text diff: the unit is the item, because the item is what the user
 * reasons about and what `revertEntries` can undo on its own. A whole-file
 * diff would make "keep this one, drop that one" impossible.
 */

import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { DiscoverDiffRow, DiscoverSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import type { DiscoverCopy } from '@/lib/discoverI18n';

export function DiffView({
  discover, copy, onBack,
}: { discover: DiscoverSummary; copy: DiscoverCopy; onBack: () => void }) {
  const active = discover.activeRun;
  if (!active) {
    return (
      <div className="p-6">
        <p className="text-xs text-muted-foreground">{copy.noDiff}</p>
        <button type="button" title={copy.hints.back} onClick={onBack} className="mt-3 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent">{copy.back}</button>
      </div>
    );
  }

  const total = active.added.length + active.updated.length + active.removed.length;

  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      <header className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-bold text-foreground">{copy.diffTitle}</h2>
        <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {copy.runLabel(active.run.id, active.run.step)}
        </code>
        <span className="text-[11px] text-muted-foreground">
          <span className="text-success">+{active.added.length}</span>{' '}
          <span className="text-warning">~{active.updated.length}</span>{' '}
          <span className="text-destructive">−{active.removed.length}</span>
        </span>
        <button type="button" title={copy.hints.back} onClick={onBack} className="ml-auto rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent">{copy.back}</button>
      </header>

      {total === 0 && <p className="text-xs text-muted-foreground">{copy.noDiff}</p>}

      <Group rows={active.added} sign="+" tone="text-success" label={copy.added} runId={active.run.id} copy={copy} />
      <Group rows={active.updated} sign="~" tone="text-warning" label={copy.updated} runId={active.run.id} copy={copy} />
      <Group rows={active.removed} sign="−" tone="text-destructive" label={copy.removed} runId={active.run.id} copy={copy} />

      {active.run.guardrail.length > 0 && (
        <section className="mt-4 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <h3 className="text-[11px] font-semibold text-warning">{copy.guardrail}</h3>
          <ul className="mt-1 space-y-0.5">
            {active.run.guardrail.map((g) => (
              <li key={g} className="flex items-start gap-1.5 text-[11px] text-warning">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{g}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <p className="text-[10.5px] text-muted-foreground">{copy.snapshotNote}</p>
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => postMessage({ type: 'revertDiscoverRun', runId: active.run.id })}
            title={copy.hints.undoAll}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {copy.undoAll}
          </button>
          <button
            type="button"
            onClick={() => { postMessage({ type: 'keepDiscoverRun', runId: active.run.id }); onBack(); }}
            title={copy.hints.keepAll}
            className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {copy.keepAll}
          </button>
        </span>
      </footer>
    </div>
  );
}

function Group({
  rows, sign, tone, label, runId, copy,
}: {
  rows: DiscoverDiffRow[]; sign: string; tone: string; label: string; runId: string; copy: DiscoverCopy;
}) {
  if (rows.length === 0) { return null; }
  return (
    <section className="mb-3 overflow-hidden rounded-lg border border-border">
      <header className="border-b border-border/70 bg-secondary/40 px-3 py-1.5 text-[11px] font-semibold text-foreground">
        {label} · {rows.length}
      </header>
      <ul>
        {rows.map((row) => (
          <li key={row.key} className="flex items-start gap-2 border-b border-border/40 px-3 py-1.5 last:border-b-0">
            <span className={`w-3 shrink-0 text-center font-mono text-xs ${tone}`}>{sign}</span>
            <code className="mt-px shrink-0 rounded border border-border bg-secondary/60 px-1.5 font-mono text-[9.5px] text-muted-foreground">{row.id}</code>
            <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-foreground">
              {row.text}
              {row.before && (
                <span className="mt-0.5 block text-[10.5px] text-muted-foreground line-through">{row.before}</span>
              )}
              <span className="mt-0.5 block font-mono text-[9.5px] text-muted-foreground/70">{row.file}</span>
            </span>
            <button
              type="button"
              onClick={() => postMessage({ type: 'revertDiscoverItems', runId, keys: [row.key] })}
              title={copy.hints.undoEntry}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RotateCcw className="h-2.5 w-2.5" />{copy.undo}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
