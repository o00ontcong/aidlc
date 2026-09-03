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
import {
  DOC_ARCHITECTURE,
  DOC_DATA_MODEL,
  DOC_FEATURES,
  DOC_IDEA,
  DOC_IMPLEMENTATION_PLAN,
  DOC_MODULES,
  DOC_PRODUCT,
  DOC_PROJECT_STRUCTURE,
  DOC_SKELETON,
  DOC_TECH_STACK,
} from './DocSpec';
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
 * True when the phase is about materializing the project skeleton — used by
 * Kiểm tra, not by the handoff recipe picker. Avoids the word "nền tảng"
 * because product phases use it for domain layers (session platform, etc.).
 */
export function isSkeletonPhase(phase: DiscoverPhase, isFirst: boolean): boolean {
  const text = `${phase.title} ${phase.goal} ${phase.deliverables.join(' ')}`.toLowerCase();
  if (/\b(skeleton|scaffold|bootstrap|khởi tạo|dựng khung|generate skeleton)\b/.test(text)) {
    return true;
  }
  return isFirst && /\b(project setup|cấu hình dự án)\b/.test(text);
}

/**
 * A Discover phase hands off to a delivery recipe: feature (new behaviour) or
 * bugfix (wrong behaviour). Foundation lifecycle recipes are not a choice here
 * — "nền tảng" in a product phase title means a domain layer, not cofofo-bootstrap.
 */
export function suggestRecipeForPhase(phase: DiscoverPhase, _isFirst?: boolean): CofofoRecipeId {
  const text = `${phase.title} ${phase.goal} ${phase.deliverables.join(' ')}`.toLowerCase();
  if (/\b(bugfix|hotfix|regression|sửa lỗi|vá lỗi|fix bug)\b/.test(text)) {
    return 'cofofo-bugfix';
  }
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

  pushSharedBlueprintContext(lines, ctx);
  pushBlueprintFooter(lines, ctx, index);
  return finalizeIntent(lines);
}

export interface BootstrapIntentInput {
  missingPaths?: string[];
  foundationReady?: boolean;
}

/**
 * INTENT.md for a cofofo-bootstrap epic started from Kiểm tra.
 *
 * After Discover's 12 steps the skeleton spec already lives in the blueprint
 * (`SKELETON.md`, `PROJECT_STRUCTURE.md`, `TECH_STACK.md`, phase 1). This
 * snapshot is that spec — not a complaint that the files do not exist yet.
 */
export function renderBootstrapIntent(
  ctx: BlueprintContext,
  index: DiscoverIndex,
  input: BootstrapIntentInput = {},
): string {
  const phases = listPhases(ctx);
  const phase1 = phases[0];
  const skFiles = items(ctx, DOC_SKELETON, 'files');
  const skInterfaces = items(ctx, DOC_SKELETON, 'interfaces');
  const skConfig = items(ctx, DOC_SKELETON, 'config');
  const skTests = items(ctx, DOC_SKELETON, 'tests');
  const deliverables = [
    ...skFiles,
    ...skInterfaces,
    ...skConfig,
    ...skTests,
    ...(phase1?.deliverables ?? []),
    'CoFoFo foundation: scan-stack → map-system → publish-context',
    'CONTEXT-MANIFEST.json published, foundation status = ready',
  ];
  const dod = [
    ...(phase1?.definitionOfDone ?? []),
    'Mọi mục trong plans/SKELETON.md tồn tại trên disk',
    'Cây thư mục khớp architecture/PROJECT_STRUCTURE.md',
    'CoFoFo foundation status = ready',
    'CONTEXT-MANIFEST.json published',
  ];
  const filled = [...ctx.docs.entries()]
    .filter(([, doc]) => doc.exists)
    .map(([file]) => file);

  const lines: string[] = [
    '# Generate Skeleton & CoFoFo Foundation',
    '',
    `- **Blueprint:** ${index.id} — ${index.title}`,
    `- **Blueprint revision:** ${index.revision}`,
    `- **Source:** Kiểm tra ← Discover (${filled.length} documents)`,
    `- **Recipe:** cofofo-bootstrap`,
    '',
    '## Goal',
    '',
    phase1?.goal
      || 'Materialize the Discover blueprint onto disk: folder tree, skeleton files, interfaces, config, tests, and CoFoFo foundation.',
    '',
    '## Deliverables',
    '',
    ...bullets(deliverables),
    '',
    '## Definition of done',
    '',
    ...bullets(dod),
    '',
  ];

  if (phase1) {
    lines.push(
      '## Implementation plan — phase 1',
      '',
      `- **${phase1.id}** — ${phase1.title}`,
      ...(phase1.goal ? [`- Goal: ${phase1.goal}`] : []),
      ...phase1.deliverables.map((d) => `- ${d}`),
      '',
    );
    if (phases.length > 1) {
      lines.push('## Later phases (out of scope for this epic)', '');
      for (const p of phases.slice(1)) {
        lines.push(`- **${p.id}** — ${p.title}${p.goal ? `: ${p.goal}` : ''}`);
      }
      lines.push('');
    }
  }

  const features = items(ctx, DOC_FEATURES, 'features');
  if (features.length) {
    lines.push('## Features in scope for the skeleton', '', ...features.map((f) => `- ${f}`), '');
  }

  const overview = prose(ctx, DOC_DATA_MODEL, 'overview');
  const entities = items(ctx, DOC_DATA_MODEL, 'entities');
  if (overview || entities.length) {
    lines.push('## Data model', '');
    if (overview) { lines.push(overview, ''); }
    if (entities.length) { lines.push(...entities.map((e) => `- ${e}`), ''); }
  }

  pushSharedBlueprintContext(lines, ctx);

  const mapping = items(ctx, DOC_PROJECT_STRUCTURE, 'mapping');
  if (mapping.length) {
    lines.push('## Module mapping', '', ...mapping.map((m) => `- ${m}`), '');
  }

  if (skFiles.length || skInterfaces.length || skConfig.length || skTests.length) {
    lines.push('## Skeleton (plans/SKELETON.md)', '');
    if (skFiles.length) { lines.push('### Files and folders', '', ...skFiles.map((s) => `- ${s}`), ''); }
    if (skInterfaces.length) { lines.push('### Interfaces', '', ...skInterfaces.map((s) => `- ${s}`), ''); }
    if (skConfig.length) { lines.push('### Config', '', ...skConfig.map((s) => `- ${s}`), ''); }
    if (skTests.length) { lines.push('### Tests', '', ...skTests.map((s) => `- ${s}`), ''); }
  }

  if (input.missingPaths?.length) {
    lines.push(
      '## Docs vs disk',
      '',
      `${input.missingPaths.length} path declared in the blueprint are not on disk yet — this epic creates them:`,
      '',
      ...input.missingPaths.slice(0, 24).map((p) => `- \`${p}\``),
      '',
    );
  }

  if (input.foundationReady === false) {
    lines.push(
      '## CoFoFo foundation',
      '',
      'Foundation is not published yet. That is expected on a greenfield workspace: this bootstrap epic is what produces it (scan-stack, map-system, publish-context). It is not a Discover failure.',
      '',
    );
  }

  pushBlueprintFooter(lines, ctx, index);
  return finalizeIntent(lines);
}

function pushSharedBlueprintContext(lines: string[], ctx: BlueprintContext): void {
  const problem = prose(ctx, DOC_PRODUCT, 'problem') || prose(ctx, DOC_IDEA, 'problem');
  const value = prose(ctx, DOC_PRODUCT, 'value') || prose(ctx, DOC_IDEA, 'value');
  const mvp = prose(ctx, DOC_IDEA, 'mvp');
  if (problem || value || mvp) {
    lines.push('## Product context', '');
    if (problem) { lines.push('### Problem', '', problem, ''); }
    if (value) { lines.push('### Core value', '', value, ''); }
    if (mvp) { lines.push('### Minimum MVP', '', mvp, ''); }
  }

  const layers = items(ctx, DOC_ARCHITECTURE, 'layers');
  const rationale = prose(ctx, DOC_ARCHITECTURE, 'rationale');
  const modules = records(ctx, DOC_MODULES, 'modules');
  if (layers.length || rationale || modules.length) {
    lines.push('## Architecture', '');
    if (layers.length) { lines.push('### Layers', '', ...layers.map((l) => `- ${l}`), ''); }
    if (modules.length) { lines.push('### Modules', '', ...modules.map((m) => `- ${m}`), ''); }
    if (rationale) { lines.push('### Why', '', rationale, ''); }
  }

  const stack = records(ctx, DOC_TECH_STACK, 'stack');
  if (stack.length) { lines.push('## Tech stack', '', ...stack.map((t) => `- ${t}`), ''); }

  const tree = prose(ctx, DOC_PROJECT_STRUCTURE, 'tree');
  if (tree) { lines.push('## Project structure', '', tree, ''); }
}

function pushBlueprintFooter(lines: string[], ctx: BlueprintContext, index: DiscoverIndex): void {
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
}

function finalizeIntent(lines: string[]): string {
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
