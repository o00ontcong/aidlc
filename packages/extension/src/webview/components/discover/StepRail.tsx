/* The 12-step rail. Selecting a step changes what you are looking at and
 * nothing else — advancing the blueprint is a separate, explicit action, the
 * same rule the Ideas tab's stage bar had and the one thing about it worth
 * keeping.
 */

import type { DiscoverStep, DiscoverSummary } from '@/lib/types';
import type { DiscoverCopy } from '@/lib/discoverI18n';
import { GLYPH_CHAR, missingRequirements, pct, stepGlyph } from './lib';

const GLYPH_CLASS: Record<string, string> = {
  done: 'text-success',
  current: 'text-primary',
  upcoming: 'text-muted-foreground/50',
  review: 'text-warning',
};

export function StepRail({
  discover, viewing, copy, onSelect,
}: {
  discover: DiscoverSummary;
  viewing: string;
  copy: DiscoverCopy;
  onSelect: (stepId: DiscoverStep['id']) => void;
}) {
  return (
    <nav className="flex h-full flex-col overflow-y-auto border-r border-border px-2 py-3">
      <p className="px-1.5 pb-2 text-[9.5px] font-bold tracking-[0.09em] text-muted-foreground">{copy.steps}</p>
      <ol className="space-y-px">
        {discover.steps.map((step) => {
          const glyph = stepGlyph(step, discover);
          const isViewing = step.id === viewing;
          const missing = missingRequirements(step).length;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                className={`flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition ${
                  isViewing ? 'bg-primary/10 outline outline-1 outline-primary/40' : 'hover:bg-accent/50'
                }`}
              >
                <span className={`mt-px w-3.5 shrink-0 text-center text-[11px] ${GLYPH_CLASS[glyph]}`}>{GLYPH_CHAR[glyph]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] text-foreground">{step.order} · {step.label}</span>
                  <span className="block truncate font-mono text-[9.5px] text-muted-foreground">{step.files[0]}</span>
                </span>
                <span className={`shrink-0 text-[10px] ${missing === 0 ? 'text-success' : 'text-muted-foreground'}`}>
                  {pct(step.completion)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
