/* Where a blueprint stops being a document and becomes work.
 *
 * One phase of the Implementation Plan → one CoFoFo epic. Not the whole
 * blueprint at once: splitting the build into phases is what step 11 exists
 * for, so the hand-off follows the same grain.
 */

import { useState } from 'react';
import { ArrowRight, CheckCircle2, PackagePlus } from 'lucide-react';
import { COFOFO_RECIPE_IDS, type CofofoRecipeId, type DiscoverPhase, type DiscoverSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import type { DiscoverCopy } from '@/lib/discoverI18n';
import { shortTime } from './lib';

export function HandoffPanel({ discover, copy }: { discover: DiscoverSummary; copy: DiscoverCopy }) {
  const planStep = discover.steps.find((s) => s.id === 'plan');
  const planReady = planStep?.canAdvance ?? false;

  return (
    <section className="rounded-lg border border-primary/30 bg-primary/[0.03]">
      <header className="flex items-center gap-2 border-b border-primary/20 px-3 py-1.5">
        <PackagePlus className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-[11.5px] font-semibold text-foreground">{copy.handoffTitle}</h3>
        <span className="ml-auto text-[10.5px] text-muted-foreground">
          {discover.phases.filter((p) => p.handoff).length}/{discover.phases.length}
        </span>
      </header>

      <p className="px-3 pt-2 text-[10.5px] leading-relaxed text-muted-foreground">{copy.handoffHint}</p>
      {!planReady && <p className="px-3 pt-1 text-[10.5px] text-warning">{copy.handoffPlanIncomplete}</p>}

      {discover.phases.length === 0 && (
        <p className="px-3 py-2 text-[11px] italic text-muted-foreground">{copy.handoffNoPhases}</p>
      )}

      <ul className="divide-y divide-border/40 px-1 py-1">
        {discover.phases.map((phase) => (
          <PhaseRow key={phase.id} phase={phase} discover={discover} copy={copy} />
        ))}
      </ul>
    </section>
  );
}

function PhaseRow({ phase, discover, copy }: { phase: DiscoverPhase; discover: DiscoverSummary; copy: DiscoverCopy }) {
  const [open, setOpen] = useState(false);
  const [recipe, setRecipe] = useState<CofofoRecipeId>(phase.suggestedRecipe);
  const [title, setTitle] = useState(`${phase.id} — ${phase.title}`);
  const blocked = phase.dependsOn.filter((id) => {
    const dep = discover.phases.find((p) => p.id === id);
    return dep && !dep.handoff;
  });

  if (phase.handoff) {
    return (
      <li className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-[11px]">
        <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
        <code className="shrink-0 rounded border border-border bg-secondary/60 px-1.5 font-mono text-[9.5px] text-muted-foreground">{phase.id}</code>
        <span className="min-w-0 flex-1 truncate text-foreground">{phase.title}</span>
        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        <button
          type="button"
          onClick={() => postMessage({ type: 'openEpicsList' })}
          className="shrink-0 rounded border border-success/40 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] text-success hover:bg-success/20"
        >
          {phase.handoff.epicId}
        </button>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {phase.handoff.recipeId.replace('cofofo-', '')} · {shortTime(phase.handoff.at)}
        </span>
      </li>
    );
  }

  return (
    <li className="px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <code className="shrink-0 rounded border border-border bg-secondary/60 px-1.5 font-mono text-[9.5px] text-muted-foreground">{phase.id}</code>
        <span className="min-w-0 flex-1 truncate text-foreground">{phase.title}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {phase.deliverables.length} {copy.deliverables}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-md bg-primary px-2 py-0.5 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {copy.createEpic}
        </button>
      </div>

      {blocked.length > 0 && (
        <p className="mt-0.5 text-[10px] text-warning">{copy.handoffBlocked(blocked.join(', '))}</p>
      )}

      {open && (
        <div className="mt-1.5 space-y-1.5 rounded-md border border-border bg-card p-2">
          <label className="block">
            <span className="text-[10px] text-muted-foreground">{copy.epicTitle}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-0.5 w-full rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-muted-foreground">{copy.recipe}</span>
            <select
              value={recipe}
              onChange={(e) => setRecipe(e.target.value as CofofoRecipeId)}
              className="mt-0.5 w-full rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
            >
              {COFOFO_RECIPE_IDS.map((id) => (
                <option key={id} value={id}>{id} — {copy.recipeHint(id)}</option>
              ))}
            </select>
          </label>
          <p className="text-[10px] text-muted-foreground">{copy.handoffIntentNote}</p>
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => setOpen(false)} className="rounded border border-border px-2 py-1 text-[10.5px] text-muted-foreground hover:bg-accent">
              {copy.cancel}
            </button>
            <button
              type="button"
              disabled={!title.trim()}
              onClick={() => {
                postMessage({ type: 'scaffoldEpicFromPhase', phaseId: phase.id, recipeId: recipe, title });
                setOpen(false);
              }}
              className="rounded bg-primary px-2.5 py-1 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {copy.createEpic}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
