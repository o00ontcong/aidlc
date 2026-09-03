/* Where a blueprint stops being a document and becomes work.
 *
 * One remaining Implementation Plan phase → one CoFoFo delivery epic
 * (`cofofo-feature` or `cofofo-bugfix`). Foundation lifecycle recipes are not
 * a choice here. Phases whose features already exist on disk are not proposed.
 */

import { useState } from 'react';
import { ArrowRight, CheckCircle2, PackagePlus } from 'lucide-react';
import { DISCOVER_HANDOFF_RECIPE_IDS, type CofofoRecipeId, type DiscoverPhase, type DiscoverSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import type { DiscoverCopy } from '@/lib/discoverI18n';
import { shortTime } from './lib';

function deliveryRecipe(phase: DiscoverPhase): CofofoRecipeId {
  return DISCOVER_HANDOFF_RECIPE_IDS.includes(phase.suggestedRecipe)
    ? phase.suggestedRecipe
    : 'cofofo-feature';
}

export function HandoffPanel({ discover, copy }: { discover: DiscoverSummary; copy: DiscoverCopy }) {
  const planReady = discover.phases.length >= 3;
  const handedOff = discover.phases.filter((p) => p.handoff);
  const built = discover.phases.filter((p) => !p.handoff && p.alreadyBuilt);
  const pending = discover.phases.filter((p) => !p.handoff && !p.alreadyBuilt);

  return (
    <section className="rounded-lg border border-primary/30 bg-primary/[0.03]">
      <header className="flex items-center gap-2 border-b border-primary/20 px-3 py-1.5">
        <PackagePlus className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-[11.5px] font-semibold text-foreground">{copy.handoffTitle}</h3>
        <span className="ml-auto text-[10.5px] text-muted-foreground">
          {copy.handoffCounts(handedOff.length, built.length, pending.length)}
        </span>
      </header>

      <p className="px-3 pt-2 text-[10.5px] leading-relaxed text-muted-foreground">{copy.handoffHint}</p>
      {!planReady && <p className="px-3 pt-1 text-[10.5px] text-warning">{copy.handoffPlanIncomplete}</p>}

      {discover.phases.length === 0 && (
        <p className="px-3 py-2 text-[11px] italic text-muted-foreground">{copy.handoffNoPhases}</p>
      )}
      {discover.phases.length > 0 && pending.length === 0 && handedOff.length === 0 && (
        <p className="px-3 py-2 text-[11px] text-success">{copy.handoffAllBuilt}</p>
      )}

      {pending.length > 0 && (
        <ul className="divide-y divide-border/40 px-1 py-1">
          {pending.map((phase) => (
            <PendingRow key={phase.id} phase={phase} discover={discover} copy={copy} />
          ))}
        </ul>
      )}

      {handedOff.length > 0 && (
        <ul className="divide-y divide-border/40 border-t border-border/40 px-1 py-1">
          {handedOff.map((phase) => (
            <HandedOffRow key={phase.id} phase={phase} copy={copy} />
          ))}
        </ul>
      )}

      {built.length > 0 && (
        <details className="border-t border-border/40 px-3 py-2">
          <summary className="cursor-pointer text-[10.5px] text-muted-foreground">
            {copy.handoffBuiltSummary(built.length)}
          </summary>
          <ul className="mt-1 space-y-1">
            {built.map((phase) => (
              <li key={phase.id} className="text-[11px] text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="shrink-0 rounded border border-border bg-secondary/60 px-1.5 font-mono text-[9.5px]">{phase.id}</code>
                  <span className="min-w-0 flex-1 truncate">{phase.title}</span>
                </div>
                {phase.builtFiles && phase.builtFiles.length > 0 && (
                  <p className="truncate pl-1 font-mono text-[10px] text-muted-foreground/80">
                    {phase.builtFiles.slice(0, 3).join(' · ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function HandedOffRow({ phase, copy }: { phase: DiscoverPhase; copy: DiscoverCopy }) {
  return (
    <li className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-[11px]">
      <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
      <code className="shrink-0 rounded border border-border bg-secondary/60 px-1.5 font-mono text-[9.5px] text-muted-foreground">{phase.id}</code>
      <span className="min-w-0 flex-1 truncate text-foreground">{phase.title}</span>
      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
      <button
        type="button"
        onClick={() => postMessage({ type: 'openEpicsList' })}
        title={copy.hints.openEpic}
        className="shrink-0 rounded border border-success/40 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] text-success hover:bg-success/20"
      >
        {phase.handoff!.epicId}
      </button>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {phase.handoff!.recipeId.replace('cofofo-', '')} · {shortTime(phase.handoff!.at)}
      </span>
    </li>
  );
}

function PendingRow({ phase, discover, copy }: { phase: DiscoverPhase; discover: DiscoverSummary; copy: DiscoverCopy }) {
  const [open, setOpen] = useState(false);
  const [recipe, setRecipe] = useState<CofofoRecipeId>(deliveryRecipe(phase));
  const [title, setTitle] = useState(`${phase.id} — ${phase.title}`);
  const blocked = phase.dependsOn.filter((id) => {
    const dep = discover.phases.find((p) => p.id === id);
    return dep && !dep.handoff && !dep.alreadyBuilt;
  });
  const tokens = (phase.searchTokens ?? []).slice(0, 8).join(', ');
  const why = phase.builtFiles && phase.builtFiles.length > 0
    ? copy.handoffPartialMatch(phase.builtFiles.slice(0, 4).join(', '))
    : copy.handoffNoMatch(tokens, phase.scannedFileCount ?? 0);

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
          title={copy.hints.configureEpic}
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
          <p className="text-[10.5px] leading-relaxed text-warning">{copy.handoffWhy}: {why}</p>
          {phase.goal && (
            <p className="text-[11px] leading-relaxed text-foreground">
              <span className="text-[10px] font-semibold text-muted-foreground">{copy.handoffGoal}: </span>
              {phase.goal}
            </p>
          )}
          {phase.deliverables.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground">{copy.deliverables}</p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                {phase.deliverables.map((d) => (
                  <li key={d} className="text-[11px] leading-relaxed text-foreground">{d}</li>
                ))}
              </ul>
            </div>
          )}
          {phase.definitionOfDone.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground">{copy.handoffDod}</p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                {phase.definitionOfDone.map((d) => (
                  <li key={d} className="text-[11px] leading-relaxed text-foreground">{d}</li>
                ))}
              </ul>
            </div>
          )}
          {phase.cites.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground">{copy.handoffInScope}</p>
              <ul className="mt-0.5 space-y-0.5">
                {phase.cites.map((c) => (
                  <li key={`${c.file}-${c.id}`} className="text-[11px] leading-relaxed text-foreground">
                    <code className="mr-1 font-mono text-[9.5px] text-muted-foreground">{c.id}</code>
                    {c.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {phase.missingFeatureIds && phase.missingFeatureIds.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Feature chưa khớp: {phase.missingFeatureIds.join(', ')}
            </p>
          )}
          <label className="block">
            <span className="text-[10px] text-muted-foreground">{copy.epicTitle}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              title={copy.hints.epicTitleInput}
              className="mt-0.5 w-full rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-muted-foreground">{copy.recipe}</span>
            <select
              value={recipe}
              onChange={(e) => setRecipe(e.target.value as CofofoRecipeId)}
              title={copy.hints.recipeSelect}
              className="mt-0.5 w-full rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
            >
              {DISCOVER_HANDOFF_RECIPE_IDS.map((id) => (
                <option key={id} value={id}>{id} — {copy.recipeHint(id)}</option>
              ))}
            </select>
          </label>
          <p className="text-[10px] text-muted-foreground">{copy.handoffIntentNote}</p>
          <div className="flex justify-end gap-1.5">
            <button type="button" title={copy.hints.cancelEdit} onClick={() => setOpen(false)} className="rounded border border-border px-2 py-1 text-[10.5px] text-muted-foreground hover:bg-accent">
              {copy.cancel}
            </button>
            <button
              type="button"
              disabled={!title.trim()}
              title={copy.hints.createEpic}
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
