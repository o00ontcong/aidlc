/* Small shared helpers for the Discover tab. Nothing here touches the host —
 * everything is derived from the state payload the extension already sent.
 */

import type { DiscoverDoc, DiscoverSummary, DiscoverStep } from '@/lib/types';

/** Same token shape the core parser uses — `FR-01`, `NFR-PERF-02`. */
const ID_TOKEN = /\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{2,})\b/g;

export function extractIds(text: string): string[] {
  return [...new Set([...text.matchAll(ID_TOKEN)].map((m) => m[1]!))];
}

export type StepGlyph = 'done' | 'current' | 'upcoming' | 'review';

export function stepGlyph(step: DiscoverStep, discover: DiscoverSummary): StepGlyph {
  const currentOrder = discover.steps.find((s) => s.id === discover.currentStep)?.order ?? 1;
  if (stepIsStale(step, discover)) { return 'review'; }
  if (step.id === discover.currentStep) { return 'current'; }
  return step.order < currentOrder ? 'done' : 'upcoming';
}

export const GLYPH_CHAR: Record<StepGlyph, string> = {
  done: '✓',
  current: '●',
  upcoming: '○',
  review: '⚠',
};

/** A step is flagged when one of its docs was left behind by an upstream edit. */
export function stepIsStale(step: DiscoverStep, discover: DiscoverSummary): boolean {
  return discover.issues.some((i) => i.code === 'stale-doc' && !!i.file && step.files.includes(i.file));
}

export function missingRequirements(step: DiscoverStep) {
  return step.requirements.filter((r) => r.level === 'required' && !r.notApplicable && !r.passed);
}

export function docsForStep(discover: DiscoverSummary, stepId: string): DiscoverDoc[] {
  return discover.docs.filter((d) => d.step === stepId);
}

export function issuesFor(discover: DiscoverSummary, file: string, id?: string) {
  return discover.issues.filter((i) => i.file === file && (id === undefined || i.id === id));
}

export interface EntryRef {
  file: string;
  id: string;
  text: string;
}

/** Every item/record in the blueprint, flattened — the basis of every link view. */
export function allEntries(discover: DiscoverSummary): EntryRef[] {
  return discover.docs.flatMap((doc) =>
    doc.sections.flatMap((section) => [
      ...section.items.map((i) => ({ file: doc.path, id: i.id, text: i.text })),
      ...section.records.map((r) => ({
        file: doc.path,
        id: r.id,
        text: [r.title, ...r.fields.map((f) => `${f.value} ${f.items.join(' ')}`)].join(' '),
      })),
    ]),
  );
}

export interface Trace {
  /** Ids this entry cites. */
  cites: EntryRef[];
  /** Entries that cite this one. */
  citedBy: EntryRef[];
  /** Ids cited that no document declares. */
  dangling: string[];
}

export function traceFor(discover: DiscoverSummary, id: string, text: string): Trace {
  const entries = allEntries(discover);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const cited = extractIds(text).filter((ref) => ref !== id);
  return {
    cites: cited.map((ref) => byId.get(ref)).filter((e): e is EntryRef => !!e),
    dangling: cited.filter((ref) => !byId.has(ref)),
    citedBy: entries.filter((e) => e.id !== id && extractIds(e.text).includes(id)),
  };
}

/** `2026-09-01T10:00:00Z` → `10:00 01/09`. Blank when absent. */
export function shortTime(iso?: string): string {
  if (!iso) { return ''; }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) { return ''; }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Group prefix of a grouped id: `F-VIDEO-01` → `VIDEO`. */
export function groupOf(id: string): string {
  const parts = id.split('-');
  return parts.length >= 3 ? parts.slice(1, -1).join('-') : '';
}

/** Groups already in use in a section, so "add" can offer them instead of asking for free text. */
export function groupsInSection(ids: string[]): string[] {
  return [...new Set(ids.map(groupOf).filter(Boolean))];
}
