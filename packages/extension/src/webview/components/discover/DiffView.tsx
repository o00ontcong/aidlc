/* What an agent run changed, entry by entry, in a dialog.
 *
 * Not a whole-file text diff: the unit is the item, because the item is what
 * the user reasons about and what `revertEntries` can undo on its own. A
 * whole-file diff would make "keep this one, drop that one" impossible. Each
 * changed entry still gets a real word-level diff (see `wordDiff.ts`), so an
 * edit reads the way a code-diff tool shows it — only the changed words
 * highlighted, not the whole line struck through.
 */

import { AlertTriangle, Check, RotateCcw } from 'lucide-react';
import type { DiscoverDiffRow, DiscoverSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import type { DiscoverCopy } from '@/lib/discoverI18n';
import { Modal, ModalFooter } from '../Modal';
import { type DiffToken, wordDiff } from './wordDiff';

export function DiffView({
  discover, copy, onClose,
}: { discover: DiscoverSummary; copy: DiscoverCopy; onClose: () => void }) {
  const active = discover.activeRun;

  if (!active) {
    return (
      <Modal title={copy.diffTitle} onClose={onClose} maxWidth="max-w-md">
        <p className="text-xs text-muted-foreground">{copy.noDiff}</p>
      </Modal>
    );
  }

  const total = active.added.length + active.updated.length + active.removed.length;
  const stepLabel = active.run.kind === 'scan' ? copy.scanPassBadge(active.run.scanPass) : active.run.step;

  return (
    <Modal
      title={copy.diffTitle}
      subtitle={(
        <span className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {copy.runLabel(active.run.id, stepLabel)}
          </code>
          <span className="text-[11px] text-muted-foreground">
            <span className="text-success">+{active.added.length}</span>{' '}
            <span className="text-warning">~{active.updated.length}</span>{' '}
            <span className="text-destructive">−{active.removed.length}</span>
          </span>
        </span>
      )}
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
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

      <p className="mt-4 text-[10.5px] text-muted-foreground">{copy.snapshotNote}</p>

      <ModalFooter>
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
          onClick={() => { postMessage({ type: 'keepDiscoverRun', runId: active.run.id }); onClose(); }}
          title={copy.hints.keepAll}
          className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {copy.keepAll}
        </button>
      </ModalFooter>
    </Modal>
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
            <code className="mt-px shrink-0 rounded border border-border bg-secondary/60 px-1.5 font-mono text-[9.5px] text-muted-foreground">{displayId(row.id)}</code>
            <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-foreground">
              <EntryText row={row} />
              <span className="mt-0.5 block font-mono text-[9.5px] text-muted-foreground/70">{row.file}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => postMessage({ type: 'keepDiscoverItems', runId, keys: [row.key] })}
                title={copy.hints.keepEntry}
                className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Check className="h-2.5 w-2.5" />{copy.keep}
              </button>
              <button
                type="button"
                onClick={() => postMessage({ type: 'revertDiscoverItems', runId, keys: [row.key] })}
                title={copy.hints.undoEntry}
                className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <RotateCcw className="h-2.5 w-2.5" />{copy.undo}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** `prose:problem` reads as an internal key; show just the section name. */
function displayId(id: string): string {
  return id.startsWith('prose:') ? id.slice('prose:'.length) : id;
}

/** Plain text for an added/removed entry; a real word diff when there's a before AND an after to compare. */
function EntryText({ row }: { row: DiscoverDiffRow }) {
  if (!row.before) { return <>{row.text}</>; }
  const diff = wordDiff(row.before, row.text);
  return (
    <span className="block space-y-0.5">
      <span className="block text-muted-foreground">
        <DiffTokens tokens={diff.before} />
      </span>
      <span className="block text-foreground">
        <DiffTokens tokens={diff.after} />
      </span>
    </span>
  );
}

function DiffTokens({ tokens }: { tokens: DiffToken[] }) {
  return (
    <>
      {tokens.map((t, idx) => {
        if (t.type === 'same') { return <span key={idx}>{t.text}</span>; }
        if (t.type === 'del') {
          return <span key={idx} className="rounded-sm bg-destructive/15 text-destructive line-through">{t.text}</span>;
        }
        return <span key={idx} className="rounded-sm bg-success/15 text-success">{t.text}</span>;
      })}
    </>
  );
}
