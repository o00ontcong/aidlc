/**
 * Turning a finished blueprint into work.
 *
 * The unit of hand-off is one **phase** of the Implementation Plan, not the
 * whole blueprint — that is the entire point of step 11 ("don't give the whole
 * project to an agent at once"). Each phase becomes one CoFoFo epic, and the
 * `INTENT.md` this module renders is the only thing that epic gets from
 * Discover: a snapshot, not a live link back into the docs.
 */

import type { CofofoRecipeId, DiscoverIndex } from '../contracts/discover';
import { DOC_IMPLEMENTATION_PLAN } from './DocSpec';
import { extractIds, findSection, type DocRecord } from './mdParse';
import type { Blueprint, BlueprintContext } from './validate';

export interface PhaseCitation {
  id: string;
  file: string;
  text: string;
}

export interface DiscoverPhase {
  id: string;
  title: string;
  goal: string;
  dependsOn: string[];
  deliverables: string[];
  definitionOfDone: string[];
  /** Entries from earlier documents this phase names, resolved to their text. */
  cites: PhaseCitation[];
}

function field(record: DocRecord, label: string): { value: string; items: string[] } {
  const found = record.fields.find((f) => f.label.toLowerCase() === label.toLowerCase());
  return { value: found?.value.trim() ?? '', items: found?.items ?? [] };
}

function entryIndex(docs: Blueprint): Map<string, PhaseCitation> {
  const out = new Map<string, PhaseCitation>();
  for (const [file, doc] of docs) {
    for (const section of doc.sections) {
      for (const item of section.items) { out.set(item.id, { id: item.id, file, text: item.text }); }
      for (const record of section.records) {
        out.set(record.id, {
          id: record.id,
          file,
          text: record.title || record.fields.map((f) => `${f.label}: ${f.value}`).join(' · '),
        });
      }
    }
  }
  return out;
}

export function listPhases(ctx: BlueprintContext): DiscoverPhase[] {
  const doc = ctx.docs.get(DOC_IMPLEMENTATION_PLAN);
  const section = doc ? findSection(doc, 'phases') : undefined;
  if (!section) { return []; }
  const known = entryIndex(ctx.docs);
  return section.records.map((record) => {
    const goal = field(record, 'Goal');
    const deliverables = field(record, 'Deliverables');
    const dod = field(record, 'Definition of done');
    const depends = field(record, 'Depends on');
    const body = [
      record.title,
      goal.value, ...goal.items,
      ...deliverables.items, deliverables.value,
      ...dod.items, dod.value,
    ].join(' ');
    return {
      id: record.id,
      title: record.title,
      goal: goal.value || goal.items.join(' '),
      dependsOn: [...new Set([...depends.items, depends.value].flatMap((v) => extractIds(v)))],
      deliverables: deliverables.items.length ? deliverables.items : (deliverables.value ? [deliverables.value] : []),
      definitionOfDone: dod.items.length ? dod.items : (dod.value ? [dod.value] : []),
      cites: extractIds(body)
        .filter((id) => id !== record.id && !id.startsWith('PH-'))
        .map((id) => known.get(id))
        .filter((c): c is PhaseCitation => !!c),
    };
  });
}

export function getPhase(ctx: BlueprintContext, phaseId: string): DiscoverPhase | undefined {
  return listPhases(ctx).find((p) => p.id === phaseId);
}

/**
 * A phase that lays the ground rather than adding behaviour wants the
 * foundation recipe. Everything else is a feature — a person can override,
 * and the tab makes them confirm either way.
 */
export function suggestRecipeForPhase(phase: DiscoverPhase, isFirst: boolean): CofofoRecipeId {
  const text = `${phase.title} ${phase.goal} ${phase.deliverables.join(' ')}`.toLowerCase();
  if (/\b(skeleton|scaffold|bootstrap|foundation|khởi tạo|nền tảng|dựng khung)\b/.test(text)) {
    return 'cofofo-bootstrap';
  }
  if (isFirst && /\b(project setup|setup|cấu hình dự án)\b/.test(text)) { return 'cofofo-bootstrap'; }
  return 'cofofo-feature';
}

function bullets(values: string[]): string[] {
  return values.length ? values.map((v) => `- ${v}`) : ['_(none)_'];
}

function prose(ctx: BlueprintContext, file: string, sectionKey: string): string {
  const doc = ctx.docs.get(file);
  const section = doc ? findSection(doc, sectionKey) : undefined;
  return section?.prose.trim() ?? '';
}

function items(ctx: BlueprintContext, file: string, sectionKey: string): string[] {
  const doc = ctx.docs.get(file);
  const section = doc ? findSection(doc, sectionKey) : undefined;
  return section?.items.map((i) => `**${i.id}** — ${i.text}`) ?? [];
}

function records(ctx: BlueprintContext, file: string, sectionKey: string): string[] {
  const doc = ctx.docs.get(file);
  const section = doc ? findSection(doc, sectionKey) : undefined;
  return section?.records.map((r) => {
    const detail = r.fields
      .filter((f) => f.value.trim() || f.items.length)
      .map((f) => `${f.label}: ${f.value.trim() || f.items.join('; ')}`)
      .join(' · ');
    return `**${r.id}** — ${r.title}${detail ? ` (${detail})` : ''}`;
  }) ?? [];
}

/**
 * The brief the epic is born with. Deliberately a snapshot: the epic's
 * `requirement` gate reads this file, and it must not change under it when
 * somebody edits the blueprint afterwards.
 */
export function renderPhaseIntent(ctx: BlueprintContext, index: DiscoverIndex, phase: DiscoverPhase): string {
  const all = listPhases(ctx);
  const byId = new Map(all.map((p) => [p.id, p]));
  const lines: string[] = [
    `# ${phase.id} · ${phase.title || index.title}`,
    '',
    `- **Blueprint:** ${index.id} — ${index.title}`,
    `- **Blueprint revision:** ${index.revision}`,
    `- **Phase:** ${phase.id} of ${all.length}`,
    `- **Source:** ${index.docsRoot}/${DOC_IMPLEMENTATION_PLAN}`,
    '',
    '## Goal',
    '',
    phase.goal || '_(not stated)_',
    '',
    '## Deliverables',
    '',
    ...bullets(phase.deliverables),
    '',
    '## Definition of done',
    '',
    ...bullets(phase.definitionOfDone),
    '',
  ];

  if (phase.dependsOn.length) {
    lines.push(
      '## Depends on',
      '',
      ...phase.dependsOn.map((id) => `- ${id}${byId.get(id)?.title ? ` — ${byId.get(id)!.title}` : ''}`),
      '',
    );
  }

  if (phase.cites.length) {
    lines.push('## In scope for this phase', '');
    for (const cite of phase.cites) { lines.push(`- **${cite.id}** — ${cite.text}  \`${cite.file}\``); }
    lines.push('');
  }

  const problem = prose(ctx, 'product/PRODUCT.md', 'problem') || prose(ctx, 'product/IDEA.md', 'problem');
  const value = prose(ctx, 'product/PRODUCT.md', 'value') || prose(ctx, 'product/IDEA.md', 'value');
  if (problem || value) {
    lines.push('## Product context', '');
    if (problem) { lines.push('### Problem', '', problem, ''); }
    if (value) { lines.push('### Core value', '', value, ''); }
  }

  const layers = items(ctx, 'architecture/ARCHITECTURE.md', 'layers');
  const rationale = prose(ctx, 'architecture/ARCHITECTURE.md', 'rationale');
  const modules = records(ctx, 'architecture/MODULES.md', 'modules');
  if (layers.length || rationale || modules.length) {
    lines.push('## Architecture', '');
    if (layers.length) { lines.push('### Layers', '', ...layers.map((l) => `- ${l}`), ''); }
    if (modules.length) { lines.push('### Modules', '', ...modules.map((m) => `- ${m}`), ''); }
    if (rationale) { lines.push('### Why', '', rationale, ''); }
  }

  const stack = records(ctx, 'architecture/TECH_STACK.md', 'stack');
  if (stack.length) { lines.push('## Tech stack', '', ...stack.map((t) => `- ${t}`), ''); }

  const tree = prose(ctx, 'architecture/PROJECT_STRUCTURE.md', 'tree');
  if (tree) { lines.push('## Project structure', '', tree, ''); }

  lines.push(
    '## Blueprint documents',
    '',
    ...[...ctx.docs.entries()]
      .filter(([, doc]) => doc.exists)
      .map(([file]) => `- \`${index.docsRoot}/${file}\``),
    '',
    '---',
    '',
    '_Snapshot taken when this epic was created. Editing the blueprint afterwards does not change this file._',
  );

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
