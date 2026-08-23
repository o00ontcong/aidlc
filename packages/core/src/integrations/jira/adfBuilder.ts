/**
 * Build the ADF body of a subtask from the template model.
 *
 * Writing to Jira API v3 means sending Atlassian Document Format, not text. We
 * deliberately do NOT write a general markdown → ADF converter: the subtask
 * template is a closed structure (five known sections, one node kind each), so
 * emitting ADF straight from that model is both smaller and exact.
 *
 * The payoff is the Checklist section: it becomes a real ADF `taskList`, which
 * renders as tickable checkboxes in Jira — not `- [ ]` text that looks like a
 * checkbox and does nothing.
 *
 * One invariant holds this file together: {@link buildSubtaskAdf} and
 * {@link renderSubtaskMarkdown} consume the *same* {@link RenderedSection[]}.
 * The preview a user approves is therefore generated from the same model as the
 * payload we send — they cannot drift.
 */

import type { AdfDoc, AdfNode } from './JiraTypes';

/**
 * How a section's lines turn into nodes.
 *
 *   - `prose`        — blank-line-separated paragraphs; single newlines break.
 *   - `bulletList`   — one bullet per line.
 *   - `taskList`     — one unchecked Jira checkbox per line.
 *   - `inlineCode`   — one paragraph, each line as an inline code chip.
 */
export type SubtaskSectionKind = 'prose' | 'bulletList' | 'taskList' | 'inlineCode';

export interface RenderedSection {
  /** Heading text as the template spells it, emoji included. */
  heading: string;
  kind: SubtaskSectionKind;
  /** Already-resolved content. Empty array = section is skipped entirely. */
  lines: string[];
}

export interface BuildAdfOptions {
  /** Put an ADF `rule` between sections (the template's `---`). Default true. */
  separator?: boolean;
  /** Heading level for section headings. Default 3, matching `###` in the template. */
  headingLevel?: number;
}

/**
 * Assemble the ADF document. Sections with no lines are dropped rather than
 * emitted as an empty heading — an optional Checklist that resolved to nothing
 * should leave no trace.
 */
export function buildSubtaskAdf(sections: RenderedSection[], options: BuildAdfOptions = {}): AdfDoc {
  const separator = options.separator !== false;
  const level = options.headingLevel ?? 3;
  // Deterministic localIds: Jira only requires uniqueness within the document,
  // and a counter keeps the payload snapshot-testable.
  let taskSeq = 0;

  const content: AdfNode[] = [];
  const filled = sections.filter((s) => s.lines.some((l) => l.trim()));

  filled.forEach((section, index) => {
    if (separator && index > 0) { content.push({ type: 'rule' }); }
    content.push(heading(section.heading, level));
    switch (section.kind) {
      case 'prose':
        content.push(...prose(section.lines));
        break;
      case 'bulletList':
        content.push(bulletList(section.lines));
        break;
      case 'taskList':
        content.push(taskList(section.lines, () => `aidlc-${++taskSeq}`));
        break;
      case 'inlineCode':
        content.push(inlineCodeParagraph(section.lines));
        break;
    }
  });

  return { type: 'doc', version: 1, content };
}

/**
 * The same model as markdown, for the preview panel and for logs. Mirrors the
 * template's own copy-paste block: `### heading`, `---` between sections.
 */
export function renderSubtaskMarkdown(sections: RenderedSection[], options: BuildAdfOptions = {}): string {
  const separator = options.separator !== false;
  const hashes = '#'.repeat(options.headingLevel ?? 3);
  const blocks: string[] = [];

  for (const section of sections.filter((s) => s.lines.some((l) => l.trim()))) {
    const lines = section.lines.filter((l) => l.trim());
    let body: string;
    switch (section.kind) {
      case 'prose':
        body = lines.join('\n');
        break;
      case 'bulletList':
        body = lines.map((l) => `- ${l}`).join('\n');
        break;
      case 'taskList':
        body = lines.map((l) => `- [ ] ${l}`).join('\n');
        break;
      case 'inlineCode':
        body = lines.map((l) => `\`${l}\``).join(', ');
        break;
    }
    blocks.push(`${hashes} ${section.heading}\n${body}`);
  }

  return blocks.join(separator ? '\n\n---\n\n' : '\n\n');
}

// ─── node builders ──────────────────────────────────────────────────────────

function heading(text: string, level: number): AdfNode {
  return {
    type: 'heading',
    attrs: { level: Math.min(6, Math.max(1, level)) },
    content: [{ type: 'text', text }],
  };
}

/**
 * Blank lines split paragraphs; a single newline inside a paragraph becomes a
 * `hardBreak` so a two-line note stays two lines in Jira.
 */
function prose(lines: string[]): AdfNode[] {
  const paragraphs: string[][] = [[]];
  for (const line of lines) {
    if (!line.trim()) {
      if (paragraphs[paragraphs.length - 1].length > 0) { paragraphs.push([]); }
      continue;
    }
    paragraphs[paragraphs.length - 1].push(line);
  }

  return paragraphs
    .filter((p) => p.length > 0)
    .map((p) => {
      const content: AdfNode[] = [];
      p.forEach((line, i) => {
        if (i > 0) { content.push({ type: 'hardBreak' }); }
        content.push({ type: 'text', text: line });
      });
      return { type: 'paragraph', content };
    });
}

function bulletList(lines: string[]): AdfNode {
  return {
    type: 'bulletList',
    content: lines.filter((l) => l.trim()).map((line) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: line }] }],
    })),
  };
}

/**
 * A `taskList` needs a `localId` on itself and on every `taskItem`; Jira
 * rejects the payload without them. `state: 'TODO'` is an unchecked box.
 */
function taskList(lines: string[], nextId: () => string): AdfNode {
  return {
    type: 'taskList',
    attrs: { localId: nextId() },
    content: lines.filter((l) => l.trim()).map((line) => ({
      type: 'taskItem',
      attrs: { localId: nextId(), state: 'TODO' },
      content: [{ type: 'text', text: line }],
    })),
  };
}

/** `backend`, `db-migration` — one paragraph of comma-separated code chips. */
function inlineCodeParagraph(lines: string[]): AdfNode {
  const content: AdfNode[] = [];
  lines.filter((l) => l.trim()).forEach((line, i) => {
    if (i > 0) { content.push({ type: 'text', text: ', ' }); }
    content.push({ type: 'text', text: line, marks: [{ type: 'code' }] });
  });
  return { type: 'paragraph', content };
}
