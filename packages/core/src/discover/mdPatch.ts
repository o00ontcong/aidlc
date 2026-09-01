/**
 * Structured edits applied back onto a Discover doc.
 *
 * Every op is applied against a fresh parse and spliced into the exact line
 * range it owns, so anything the op does not name — other sections, a user's
 * own notes, a fenced diagram — comes out of the patch byte-for-byte
 * identical. That property is what lets `.md` be the source of truth while an
 * agent and a person edit the same file (plan §2.2).
 */

import type { DocFileSpec, RecordFieldSpec, SectionSpec } from './DocSpec';
import { findItem, findRecord, findSection, nextId, parseDoc, type DocModel, type DocSection } from './mdParse';

export interface RecordFieldInput {
  label: string;
  value?: string;
  items?: string[];
}

export type DocOp =
  | { op: 'setProse'; section: string; value: string }
  | { op: 'addItem'; section: string; id?: string; group?: string; text: string }
  | { op: 'updateItem'; id: string; text: string }
  | { op: 'removeItem'; id: string }
  | { op: 'addRecord'; section: string; id?: string; group?: string; title: string; fields?: RecordFieldInput[] }
  | { op: 'updateRecord'; id: string; title?: string; fields?: RecordFieldInput[] }
  | { op: 'removeRecord'; id: string };

export interface PatchResult {
  content: string;
  /** Ids touched, in the order the ops ran — the caller's diff/provenance key. */
  applied: { op: DocOp['op']; id: string }[];
  /** Ops that could not be applied, with the reason. Never thrown: a bad op must not lose a good one. */
  issues: string[];
}

export function renderItemLine(id: string, text: string): string {
  return `- **${id}** — ${text.trim()}`;
}

function renderFieldLines(field: RecordFieldInput, spec?: RecordFieldSpec): string[] {
  const wantsList = spec?.list ?? (field.items ?? []).length > 0;
  if (wantsList && (field.items ?? []).length > 0) {
    return [`- **${field.label}:**`, ...field.items!.map((i) => `  - ${i.trim()}`)];
  }
  return [`- **${field.label}:** ${(field.value ?? '').trim()}`.trimEnd()];
}

export function renderRecordLines(
  id: string,
  title: string,
  fields: RecordFieldInput[],
  spec?: SectionSpec,
): string[] {
  const specByLabel = new Map((spec?.fields ?? []).map((f) => [f.label.toLowerCase(), f]));
  const head = title.trim() ? `### ${id} — ${title.trim()}` : `### ${id}`;
  const body = fields.flatMap((f) => renderFieldLines(f, specByLabel.get(f.label.toLowerCase())));
  return body.length ? [head, '', ...body] : [head];
}

/** Splice `block` in at `at`, adding only the blank lines the seam actually needs. */
function insertBlock(lines: string[], at: number, block: string[], blankBefore: boolean): void {
  const out = [...block];
  if (blankBefore && at > 0 && lines[at - 1]!.trim() !== '') { out.unshift(''); }
  if (at < lines.length && lines[at]!.trim() !== '') { out.push(''); }
  lines.splice(at, 0, ...out);
}

/** Drop a blank line only where the removal itself created a doubled one. */
function healSeam(lines: string[], at: number): void {
  while (at > 0 && at < lines.length && lines[at - 1]!.trim() === '' && lines[at]!.trim() === '') {
    lines.splice(at, 1);
  }
}

function renderEmptySection(spec: SectionSpec): string[] {
  return [`## ${spec.heading}`, ''];
}

/** Create the file's skeleton: title plus every declared section, all empty. */
export function renderEmptyDoc(spec: DocFileSpec): string {
  const lines = [`# ${spec.title}`, ''];
  for (const section of spec.sections) { lines.push(...renderEmptySection(section)); }
  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Make sure the declared section exists, inserting it in spec order so a
 * partially-written doc grows in the shape the spec describes rather than in
 * the order ops happen to arrive.
 */
function ensureSection(lines: string[], spec: DocFileSpec, sectionKey: string): void {
  const doc = parseDoc(lines.join('\n'), spec);
  if (findSection(doc, sectionKey)) { return; }
  const sectionSpec = spec.sections.find((s) => s.key === sectionKey);
  if (!sectionSpec) { return; }
  const order = spec.sections.map((s) => s.key);
  const myIdx = order.indexOf(sectionKey);
  const followingKey = order.slice(myIdx + 1).find((key) => !!findSection(doc, key));
  const at = followingKey
    ? findSection(doc, followingKey)!.headingLine
    : lines.length;
  insertBlock(lines, at, renderEmptySection(sectionSpec), true);
}

/** Where a new entry goes: after the section's last entry, else right under its heading. */
function appendPoint(section: DocSection): { at: number; blankBefore: boolean } {
  const last = [...section.items, ...section.records].reduce<number | undefined>(
    (acc, e) => (acc === undefined || e.endLine > acc ? e.endLine : acc),
    undefined,
  );
  if (last !== undefined) { return { at: last, blankBefore: false }; }
  return { at: section.startLine, blankBefore: true };
}

function applyOne(lines: string[], spec: DocFileSpec, op: DocOp, result: PatchResult): void {
  const reparse = (): DocModel => parseDoc(lines.join('\n'), spec);

  switch (op.op) {
    case 'setProse': {
      ensureSection(lines, spec, op.section);
      const section = findSection(reparse(), op.section);
      if (!section) { result.issues.push(`Unknown section "${op.section}".`); return; }
      const body = op.value.trim() ? op.value.trim().split('\n') : [];
      lines.splice(section.startLine, section.endLine - section.startLine, ...body);
      if (body.length > 0 && lines[section.startLine - 1]!.trim() !== '') { lines.splice(section.startLine, 0, ''); }
      healSeam(lines, section.startLine + body.length);
      result.applied.push({ op: op.op, id: op.section });
      return;
    }
    case 'addItem': {
      ensureSection(lines, spec, op.section);
      const doc = reparse();
      const section = findSection(doc, op.section);
      const sectionSpec = spec.sections.find((s) => s.key === op.section);
      if (!section || !sectionSpec) { result.issues.push(`Unknown section "${op.section}".`); return; }
      const id = op.id ?? nextId(section, sectionSpec, op.group);
      if (findItem(doc, id) || findRecord(doc, id)) { result.issues.push(`Id ${id} already exists — not re-used.`); return; }
      const { at, blankBefore } = appendPoint(section);
      insertBlock(lines, at, [renderItemLine(id, op.text)], blankBefore);
      result.applied.push({ op: op.op, id });
      return;
    }
    case 'updateItem': {
      const found = findItem(reparse(), op.id);
      if (!found) { result.issues.push(`Item ${op.id} not found.`); return; }
      lines.splice(found.item.startLine, found.item.endLine - found.item.startLine, renderItemLine(op.id, op.text));
      result.applied.push({ op: op.op, id: op.id });
      return;
    }
    case 'removeItem': {
      const found = findItem(reparse(), op.id);
      if (!found) { result.issues.push(`Item ${op.id} not found.`); return; }
      lines.splice(found.item.startLine, found.item.endLine - found.item.startLine);
      healSeam(lines, found.item.startLine);
      result.applied.push({ op: op.op, id: op.id });
      return;
    }
    case 'addRecord': {
      ensureSection(lines, spec, op.section);
      const doc = reparse();
      const section = findSection(doc, op.section);
      const sectionSpec = spec.sections.find((s) => s.key === op.section);
      if (!section || !sectionSpec) { result.issues.push(`Unknown section "${op.section}".`); return; }
      const id = op.id ?? nextId(section, sectionSpec, op.group);
      if (findItem(doc, id) || findRecord(doc, id)) { result.issues.push(`Id ${id} already exists — not re-used.`); return; }
      const { at } = appendPoint(section);
      insertBlock(lines, at, renderRecordLines(id, op.title, op.fields ?? [], sectionSpec), true);
      result.applied.push({ op: op.op, id });
      return;
    }
    case 'updateRecord': {
      const doc = reparse();
      const found = findRecord(doc, op.id);
      if (!found) { result.issues.push(`Record ${op.id} not found.`); return; }
      const sectionSpec = spec.sections.find((s) => s.key === found.section.key);
      const merged = new Map<string, RecordFieldInput>();
      for (const field of found.record.fields) {
        merged.set(field.label.toLowerCase(), { label: field.label, value: field.value, items: field.items });
      }
      for (const field of op.fields ?? []) { merged.set(field.label.toLowerCase(), field); }
      const ordered = (sectionSpec?.fields ?? [])
        .map((f) => merged.get(f.label.toLowerCase()))
        .filter((f): f is RecordFieldInput => !!f);
      for (const [key, field] of merged) {
        if (!ordered.some((f) => f.label.toLowerCase() === key)) { ordered.push(field); }
      }
      const block = renderRecordLines(op.id, op.title ?? found.record.title, ordered, sectionSpec);
      // The record's own free content (a mermaid block, a note) is not ours to drop.
      if (found.record.extra.length) { block.push('', ...found.record.extra); }
      lines.splice(found.record.startLine, found.record.endLine - found.record.startLine, ...block);
      result.applied.push({ op: op.op, id: op.id });
      return;
    }
    case 'removeRecord': {
      const found = findRecord(reparse(), op.id);
      if (!found) { result.issues.push(`Record ${op.id} not found.`); return; }
      lines.splice(found.record.startLine, found.record.endLine - found.record.startLine);
      healSeam(lines, found.record.startLine);
      result.applied.push({ op: op.op, id: op.id });
      return;
    }
    default: {
      result.issues.push(`Unsupported op ${(op as { op: string }).op}.`);
    }
  }
}

export function applyOps(content: string, spec: DocFileSpec, ops: DocOp[]): PatchResult {
  const source = content.trim().length === 0 ? renderEmptyDoc(spec) : content;
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const result: PatchResult = { content: '', applied: [], issues: [] };
  for (const op of ops) { applyOne(lines, spec, op, result); }
  result.content = `${lines.join('\n').replace(/\n+$/, '')}\n`;
  return result;
}
