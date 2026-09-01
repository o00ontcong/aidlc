/**
 * Markdown → structured doc model, for the files Discover owns.
 *
 * The parser is deliberately forgiving in one direction only: it recognizes
 * the shapes declared in `DocSpec.ts` and keeps EVERYTHING else verbatim, with
 * the line ranges needed to splice a change back in without reformatting the
 * rest of the file (`mdPatch.ts`). A doc that has been hand-edited into a
 * shape we do not recognize still parses — the unrecognized parts simply show
 * up as `unknown` sections or `stray` lines, never as data loss.
 */

import type { DocFileSpec, SectionKind, SectionSpec } from './DocSpec';

export interface DocItem {
  id: string;
  text: string;
  /** 0-based, inclusive. */
  startLine: number;
  /** 0-based, exclusive. */
  endLine: number;
}

export interface DocRecordField {
  label: string;
  /** Inline value (`- **Actor:** someone`). Empty when the field is a list. */
  value: string;
  /** Nested bullets/numbers under the label. */
  items: string[];
  startLine: number;
  endLine: number;
}

export interface DocRecord {
  id: string;
  title: string;
  fields: DocRecordField[];
  /** Lines inside the record that are neither its heading nor a known field. */
  extra: string[];
  startLine: number;
  endLine: number;
}

export interface DocSection {
  /** Spec key, or `unknown:<slug>` for a heading the spec does not declare. */
  key: string;
  heading: string;
  kind: SectionKind | 'unknown';
  prose: string;
  items: DocItem[];
  records: DocRecord[];
  /** Lines in an items/records section the parser did not recognize. */
  stray: string[];
  headingLine: number;
  /** First body line (0-based, inclusive). */
  startLine: number;
  /** One past the last body line (0-based, exclusive). */
  endLine: number;
}

export interface DocModel {
  /** Path relative to `docsRoot`. */
  path: string;
  title: string;
  lines: string[];
  sections: DocSection[];
  /** Whether the file existed at all. */
  exists: boolean;
}

const ITEM_RE = /^-\s+\*\*([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+)\*\*\s*(?:[—–-]\s*)?(.*)$/;
const RECORD_RE = /^###\s+([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+)\s*(?:[—–-]\s*(.*))?$/;
const FIELD_RE = /^-\s+\*\*([^:*]+):\*\*\s*(.*)$/;
const NESTED_RE = /^\s+(?:[-*+]|\d+[.)])\s+(.*)$/;
const H2_RE = /^##\s+(.*)$/;
const H1_RE = /^#\s+(.*)$/;
const FENCE_RE = /^\s*(```|~~~)/;

/** Any `ABC-01` / `NFR-PERF-02` token — how cross-doc references are detected. */
export const ID_TOKEN_RE = /\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{2,})\b/g;

/** Every id mentioned anywhere in `text` — the whole traceability mechanism. */
export function extractIds(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(ID_TOKEN_RE)) { out.add(match[1]!); }
  return [...out];
}

function normalizeHeading(heading: string): string {
  return heading.trim().replace(/[:.]+$/, '').replace(/\s+/g, ' ').toLowerCase();
}

function slugify(heading: string): string {
  return normalizeHeading(heading).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
}

/** Line indexes that sit inside a fenced code block — never parsed as content. */
function fencedLines(lines: string[]): Set<number> {
  const inside = new Set<number>();
  let fence: string | null = null;
  lines.forEach((line, idx) => {
    const match = FENCE_RE.exec(line);
    if (fence) {
      inside.add(idx);
      if (match && line.trim().startsWith(fence)) { fence = null; }
      return;
    }
    if (match) { fence = match[1]!; inside.add(idx); }
  });
  return inside;
}

function trimBlockEnd(lines: string[], start: number, end: number): number {
  let last = end;
  while (last > start && lines[last - 1]!.trim() === '') { last -= 1; }
  return last;
}

function parseRecord(lines: string[], start: number, end: number, spec: SectionSpec, fenced: Set<number>): DocRecord {
  const match = RECORD_RE.exec(lines[start]!)!;
  const known = new Set((spec.fields ?? []).map((f) => f.label.toLowerCase()));
  const fields: DocRecordField[] = [];
  const extra: string[] = [];
  let idx = start + 1;
  while (idx < end) {
    const line = lines[idx]!;
    const field = fenced.has(idx) ? null : FIELD_RE.exec(line);
    if (field && known.has(field[1]!.trim().toLowerCase())) {
      const fieldStart = idx;
      const items: string[] = [];
      idx += 1;
      while (idx < end) {
        const nested = fenced.has(idx) ? null : NESTED_RE.exec(lines[idx]!);
        if (!nested) { break; }
        items.push(nested[1]!.trim());
        idx += 1;
      }
      fields.push({
        label: field[1]!.trim(),
        value: field[2]!.trim(),
        items,
        startLine: fieldStart,
        endLine: idx,
      });
      continue;
    }
    if (line.trim() !== '') { extra.push(line); }
    idx += 1;
  }
  return {
    id: match[1]!,
    title: (match[2] ?? '').trim(),
    fields,
    extra,
    startLine: start,
    endLine: trimBlockEnd(lines, start, end),
  };
}

function parseSectionBody(
  lines: string[],
  section: DocSection,
  spec: SectionSpec | undefined,
  fenced: Set<number>,
): void {
  const { startLine, endLine } = section;
  if (!spec || spec.kind === 'prose') {
    section.prose = lines.slice(startLine, endLine).join('\n').trim();
    return;
  }
  if (spec.kind === 'items') {
    for (let idx = startLine; idx < endLine; idx += 1) {
      const line = lines[idx]!;
      if (fenced.has(idx)) { section.stray.push(line); continue; }
      const match = ITEM_RE.exec(line);
      if (match) {
        section.items.push({ id: match[1]!, text: match[2]!.trim(), startLine: idx, endLine: idx + 1 });
        continue;
      }
      if (line.trim() !== '') { section.stray.push(line); }
    }
    return;
  }
  // records
  const starts: number[] = [];
  for (let idx = startLine; idx < endLine; idx += 1) {
    if (!fenced.has(idx) && RECORD_RE.test(lines[idx]!)) { starts.push(idx); }
  }
  for (let i = 0; i < starts.length; i += 1) {
    const from = starts[i]!;
    const to = i + 1 < starts.length ? starts[i + 1]! : endLine;
    section.records.push(parseRecord(lines, from, to, spec, fenced));
  }
  const firstRecord = starts[0] ?? endLine;
  for (let idx = startLine; idx < firstRecord; idx += 1) {
    if (lines[idx]!.trim() !== '') { section.stray.push(lines[idx]!); }
  }
}

export function parseDoc(content: string, spec: DocFileSpec, exists = true): DocModel {
  const lines = content.length === 0 ? [] : content.replace(/\r\n/g, '\n').split('\n');
  const fenced = fencedLines(lines);
  const specByHeading = new Map(spec.sections.map((s) => [normalizeHeading(s.heading), s]));

  const headingIdx: number[] = [];
  lines.forEach((line, idx) => { if (!fenced.has(idx) && H2_RE.test(line)) { headingIdx.push(idx); } });

  let title = spec.title;
  for (let idx = 0; idx < (headingIdx[0] ?? lines.length); idx += 1) {
    if (fenced.has(idx)) { continue; }
    const h1 = H1_RE.exec(lines[idx]!);
    if (h1) { title = h1[1]!.trim(); break; }
  }

  const sections: DocSection[] = headingIdx.map((headingLine, i) => {
    const heading = H2_RE.exec(lines[headingLine]!)![1]!.trim();
    const bodyEnd = i + 1 < headingIdx.length ? headingIdx[i + 1]! : lines.length;
    const sectionSpec = specByHeading.get(normalizeHeading(heading));
    const section: DocSection = {
      key: sectionSpec?.key ?? `unknown:${slugify(heading)}`,
      heading,
      kind: sectionSpec?.kind ?? 'unknown',
      prose: '',
      items: [],
      records: [],
      stray: [],
      headingLine,
      startLine: headingLine + 1,
      endLine: trimBlockEnd(lines, headingLine + 1, bodyEnd),
    };
    parseSectionBody(lines, section, sectionSpec, fenced);
    return section;
  });

  return { path: spec.path, title, lines, sections, exists };
}

export function findSection(doc: DocModel, sectionKey: string): DocSection | undefined {
  return doc.sections.find((s) => s.key === sectionKey);
}

export function findItem(doc: DocModel, id: string): { section: DocSection; item: DocItem } | undefined {
  for (const section of doc.sections) {
    const item = section.items.find((i) => i.id === id);
    if (item) { return { section, item }; }
  }
  return undefined;
}

export function findRecord(doc: DocModel, id: string): { section: DocSection; record: DocRecord } | undefined {
  for (const section of doc.sections) {
    const record = section.records.find((r) => r.id === id);
    if (record) { return { section, record }; }
  }
  return undefined;
}

/** Every id the doc declares (items and records), in document order. */
export function docIds(doc: DocModel): string[] {
  return doc.sections.flatMap((s) => [...s.items.map((i) => i.id), ...s.records.map((r) => r.id)]);
}

/** The text an item/record hashes to — what "did this change?" is answered against. */
export function itemSignature(entry: DocItem | DocRecord): string {
  if ('fields' in entry) {
    const fields = entry.fields
      .map((f) => `${f.label}:${f.value}|${f.items.join('|')}`)
      .join('\n');
    return `${entry.title}\n${fields}\n${entry.extra.join('\n')}`.trim();
  }
  return entry.text.trim();
}

/** Next free id for a section, e.g. `FR-03`; `group` fills the middle segment of a grouped id. */
export function nextId(section: DocSection | undefined, spec: SectionSpec, group?: string): string {
  const prefix = spec.idPrefix ?? 'ID';
  const head = spec.grouped ? `${prefix}-${(group ?? 'GEN').toUpperCase()}` : prefix;
  const used = [
    ...(section?.items.map((i) => i.id) ?? []),
    ...(section?.records.map((r) => r.id) ?? []),
  ];
  let max = 0;
  for (const id of used) {
    if (!id.startsWith(`${head}-`)) { continue; }
    const n = Number(id.slice(head.length + 1));
    if (Number.isInteger(n) && n > max) { max = n; }
  }
  return `${head}-${String(max + 1).padStart(2, '0')}`;
}
