/**
 * The parse <-> render bridge between the canonical, content-addressed
 * Project Context (`contracts/projectContext.ts`) and the 14 managed
 * Markdown files (implementation plan §10, §18.1, §18.2).
 *
 * Reuses `discover/DocSpec.ts` (the one registry of file/section shape),
 * `discover/mdParse.ts` (structured parse) and `discover/mdPatch.ts`
 * (surgical, format-preserving edits) rather than duplicating them — this
 * file adds exactly one new capability neither had: building/reconstructing
 * a *whole* document from pure structured data, in both directions. Nothing
 * in `discover/*` is modified.
 *
 * Render strategy: `mdPatch.applyOps` already knows how to grow an empty
 * skeleton (`renderEmptyDoc`) into a full document via `addItem`/`addRecord`/
 * `setProse` ops, inserting each declared section in spec order regardless
 * of the order ops arrive in (`ensureSection` locates the correct anchor by
 * scanning for the next *already-present* declared section) — so the
 * renderer here is just "turn each `ContextObject` into the matching op,
 * batch them, run `applyOps` once against empty content." Two things
 * `applyOps` cannot express are handled as an explicit second pass:
 * per-record `trailingMarkdown` (an unrecognized field/content — `addRecord`
 * has no such input) and `unmanagedBlocks`/`preambleMarkdown` (content the
 * DocSpec does not own at all).
 */

import type { DocFileSpec, SectionKind } from '../discover/DocSpec';
import { findRecord, findSection, parseDoc, type DocModel } from '../discover/mdParse';
import { applyOps, type DocOp } from '../discover/mdPatch';
import type {
  ContextObject,
  ItemContextObject,
  ManagedDocumentMetaObject,
  ProseContextObject,
  RecordContextObject,
} from '../contracts/projectContext';

export interface ExtractedManagedSection {
  kind: SectionKind;
  /** In document order — this order is exactly what `ManagedDocumentSectionManifest.entityKeys` should record. */
  objects: ContextObject[];
}

export interface ExtractedManagedDocument {
  meta: ManagedDocumentMetaObject;
  sections: Record<string, ExtractedManagedSection>;
  /** Non-empty means "this document's current content cannot round-trip" — a bootstrap blocker (plan §18.2), never silently dropped. */
  blockers: string[];
}

function proseEntityKey(documentPath: string, sectionKey: string): string {
  return `SEC:${documentPath}#${sectionKey}`;
}

function recordFieldValues(record: { fields: { label: string; value: string; items: string[] }[] }, label: string): string[] {
  const found = record.fields.find((field) => field.label.toLowerCase() === label.toLowerCase());
  if (!found) return [];
  return found.items.length > 0 ? found.items : found.value ? [found.value] : [];
}

/** Content before the first `## ` heading, with the `# Title` line itself removed. */
function extractPreamble(doc: DocModel): string {
  const firstHeadingLine = doc.sections[0]?.headingLine ?? doc.lines.length;
  const titleLineIsH1 = /^#\s+/.test(doc.lines[0] ?? '') && !/^##/.test(doc.lines[0] ?? '');
  const start = titleLineIsH1 ? 1 : 0;
  return doc.lines.slice(start, firstHeadingLine).join('\n').trim();
}

/** Parse an existing (or absent) managed file into content-addressable objects, one per declared section entry, plus whatever the DocSpec does not own. */
export function extractManagedDocument(fileSpec: DocFileSpec, content: string): ExtractedManagedDocument {
  const doc = parseDoc(content, fileSpec, content.length > 0);
  const blockers: string[] = [];
  const sections: Record<string, ExtractedManagedSection> = {};

  for (const sectionSpec of fileSpec.sections) {
    const parsed = findSection(doc, sectionSpec.key);

    if (sectionSpec.kind === 'prose') {
      const object: ProseContextObject = {
        schemaVersion: 1,
        kind: 'prose',
        entityKey: proseEntityKey(fileSpec.path, sectionSpec.key),
        documentPath: fileSpec.path,
        sectionKey: sectionSpec.key,
        markdown: parsed?.prose ?? '',
      };
      sections[sectionSpec.key] = { kind: 'prose', objects: [object] };
      continue;
    }

    if (parsed?.stray.length) {
      blockers.push(`"${sectionSpec.heading}" in ${fileSpec.path} has content that does not match its declared shape and cannot round-trip: ${parsed.stray.join(' | ')}`);
    }

    if (sectionSpec.kind === 'items') {
      const objects: ItemContextObject[] = (parsed?.items ?? []).map((item) => ({
        schemaVersion: 1,
        kind: 'item',
        entityKey: item.id,
        documentPath: fileSpec.path,
        sectionKey: sectionSpec.key,
        title: item.text,
        description: item.description ?? '',
      }));
      sections[sectionSpec.key] = { kind: 'items', objects };
      continue;
    }

    // records
    const objects: RecordContextObject[] = (parsed?.records ?? []).map((record) => ({
      schemaVersion: 1,
      kind: 'record',
      entityKey: record.id,
      documentPath: fileSpec.path,
      sectionKey: sectionSpec.key,
      title: record.title,
      fields: (sectionSpec.fields ?? []).map((fieldSpec) => ({ label: fieldSpec.label, values: recordFieldValues(record, fieldSpec.label) })),
      trailingMarkdown: record.extra.join('\n'),
    }));
    sections[sectionSpec.key] = { kind: 'records', objects };
  }

  const knownKeys = new Set(fileSpec.sections.map((section) => section.key));
  let lastKnownKey: string | undefined;
  const unmanagedBlocks: ManagedDocumentMetaObject['unmanagedBlocks'] = [];
  for (const section of doc.sections) {
    if (knownKeys.has(section.key)) {
      lastKnownKey = section.key;
      continue;
    }
    unmanagedBlocks.push({
      afterSectionKey: lastKnownKey,
      markdown: doc.lines.slice(section.headingLine, section.endLine).join('\n'),
    });
  }

  const meta: ManagedDocumentMetaObject = {
    schemaVersion: 1,
    title: doc.title,
    preambleMarkdown: extractPreamble(doc),
    unmanagedBlocks,
  };

  return { meta, sections, blockers };
}

function isListField(fileSpec: DocFileSpec, sectionKey: string, label: string): boolean {
  const sectionSpec = fileSpec.sections.find((section) => section.key === sectionKey);
  const fieldSpec = sectionSpec?.fields?.find((field) => field.label.toLowerCase() === label.toLowerCase());
  return fieldSpec?.list ?? false;
}

/** Splice a record's preserved `trailingMarkdown` back in — `addRecord` has no input for it, so this runs as a small second pass, reusing `mdParse.findRecord` read-only (never editing `mdPatch.ts`). */
function appendRecordTrailing(content: string, fileSpec: DocFileSpec, recordId: string, trailing: string): string {
  if (!trailing.trim()) return content;
  const lines = content.split('\n');
  const doc = parseDoc(content, fileSpec);
  const found = findRecord(doc, recordId);
  if (!found) return content;
  lines.splice(found.record.endLine, 0, '', ...trailing.split('\n'));
  return lines.join('\n');
}

/**
 * Re-insert `preambleMarkdown` and every `unmanagedBlocks` entry. Processed
 * in reverse document order: each insertion re-parses to find its anchor
 * fresh, and since every remaining block anchors at or before the position
 * just inserted, working backwards means a later insertion never shifts an
 * earlier block's anchor out from under it (and two blocks sharing the same
 * anchor land back in their original relative order — see module doc).
 */
function insertUnmanagedContent(content: string, fileSpec: DocFileSpec, meta: ManagedDocumentMetaObject): string {
  let lines = content.split('\n');

  for (let i = meta.unmanagedBlocks.length - 1; i >= 0; i -= 1) {
    const block = meta.unmanagedBlocks[i]!;
    const doc = parseDoc(lines.join('\n'), fileSpec);
    const insertAt = block.afterSectionKey ? (findSection(doc, block.afterSectionKey)?.endLine ?? lines.length) : (doc.sections[0]?.headingLine ?? lines.length);
    lines.splice(insertAt, 0, '', ...block.markdown.split('\n'));
  }

  if (meta.preambleMarkdown.trim()) {
    lines.splice(1, 0, '', ...meta.preambleMarkdown.split('\n'));
  }

  return lines.join('\n');
}

/** Build the complete file content from structured objects — deterministic, and independent of whatever the file previously contained. */
export function renderManagedDocument(fileSpec: DocFileSpec, meta: ManagedDocumentMetaObject, sections: Record<string, ContextObject[]>): string {
  const ops: DocOp[] = [];
  const recordTrailing: Array<{ id: string; trailing: string }> = [];

  for (const sectionSpec of fileSpec.sections) {
    const objects = sections[sectionSpec.key] ?? [];
    if (sectionSpec.kind === 'prose') {
      const prose = objects[0] as ProseContextObject | undefined;
      ops.push({ op: 'setProse', section: sectionSpec.key, value: prose?.markdown ?? '' });
      continue;
    }
    if (sectionSpec.kind === 'items') {
      for (const object of objects as ItemContextObject[]) {
        ops.push({ op: 'addItem', section: sectionSpec.key, id: object.entityKey, text: object.title, description: object.description || undefined });
      }
      continue;
    }
    for (const object of objects as RecordContextObject[]) {
      ops.push({
        op: 'addRecord',
        section: sectionSpec.key,
        id: object.entityKey,
        title: object.title,
        fields: object.fields.map((field) => ({
          label: field.label,
          value: isListField(fileSpec, sectionSpec.key, field.label) ? undefined : (field.values[0] ?? ''),
          items: isListField(fileSpec, sectionSpec.key, field.label) ? field.values : undefined,
        })),
      });
      if (object.trailingMarkdown.trim()) recordTrailing.push({ id: object.entityKey, trailing: object.trailingMarkdown });
    }
  }

  const patch = applyOps('', fileSpec, ops);
  if (patch.issues.length > 0) {
    throw new Error(`Rendering ${fileSpec.path} produced issues: ${patch.issues.join('; ')}`);
  }

  let content = patch.content;
  const titleLine = `# ${meta.title}`;
  const firstNewline = content.indexOf('\n');
  content = /^#\s+/.test(content.slice(0, firstNewline < 0 ? content.length : firstNewline)) ? titleLine + content.slice(firstNewline < 0 ? content.length : firstNewline) : content;

  for (const { id, trailing } of recordTrailing) {
    content = appendRecordTrailing(content, fileSpec, id, trailing);
  }

  content = insertUnmanagedContent(content, fileSpec, meta);

  return `${content.replace(/\n+$/, '')}\n`;
}
