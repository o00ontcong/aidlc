/**
 * ADF → markdown.
 *
 * Jira's API v3 returns rich text as Atlassian Document Format — a nested JSON
 * tree, not text. Every ticket description we show, and every brief we hand to
 * an agent, comes through here, so the one rule that matters is: **never lose
 * text**. An unknown node type still gets recursed into and its text kept;
 * a malformed node is skipped, not thrown on.
 *
 * The mapping is deliberately lossy in the other direction (formatting), since
 * the output is read by humans in a webview and by an LLM as a brief — neither
 * needs Jira's panel/expand/layout chrome preserved.
 */

import type { AdfDoc, AdfNode } from './JiraTypes';

/** Inline marks we render. Anything else is passed through as plain text. */
const MARK_WRAP: Record<string, [string, string]> = {
  strong: ['**', '**'],
  em: ['_', '_'],
  code: ['`', '`'],
  strike: ['~~', '~~'],
};

/**
 * Flatten an ADF document (or a plain string, which API v2 returns) to
 * markdown. Returns '' for null / undefined / empty input — callers treat an
 * empty description as "nothing to show", never as an error.
 */
export function adfToMarkdown(input: AdfDoc | AdfNode | string | null | undefined): string {
  if (input === null || input === undefined) { return ''; }
  // API v2, or a site that stores plain text: already markdown-ish.
  if (typeof input === 'string') { return input.trim(); }
  if (typeof input !== 'object') { return ''; }

  const blocks = renderNodes(asArray(input.content), { listDepth: 0 });
  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

interface Ctx {
  /** Nesting level for list indentation. */
  listDepth: number;
}

function asArray(v: AdfNode[] | undefined): AdfNode[] {
  return Array.isArray(v) ? v.filter((n) => n && typeof n === 'object') : [];
}

/** Render a list of block-level nodes into markdown blocks. */
function renderNodes(nodes: AdfNode[], ctx: Ctx): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    const block = renderBlock(node, ctx);
    if (block.trim()) { out.push(block); }
  }
  return out;
}

function renderBlock(node: AdfNode, ctx: Ctx): string {
  switch (node.type) {
    case 'paragraph':
      return renderInline(asArray(node.content));

    case 'heading': {
      const level = clampLevel(node.attrs?.level);
      return `${'#'.repeat(level)} ${renderInline(asArray(node.content))}`.trim();
    }

    case 'bulletList':
      return renderList(node, ctx, () => '-');

    case 'orderedList': {
      // Jira lets a list start at an arbitrary number.
      const start = numberOr(node.attrs?.order, 1);
      let n = start;
      return renderList(node, ctx, () => `${n++}.`);
    }

    case 'taskList':
      return renderTaskList(node, ctx);

    case 'codeBlock': {
      const lang = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
      return `\`\`\`${lang}\n${plainText(node)}\n\`\`\``;
    }

    case 'blockquote':
      return renderNodes(asArray(node.content), ctx)
        .join('\n\n')
        .split('\n')
        .map((line) => `> ${line}`.trimEnd())
        .join('\n');

    case 'rule':
      return '---';

    case 'panel':
      // Info/warning/note panels: keep the content, drop the chrome.
      return renderNodes(asArray(node.content), ctx).join('\n\n');

    case 'table':
      return renderTable(node);

    case 'mediaSingle':
    case 'mediaGroup':
    case 'media':
      return mediaPlaceholder(node);

    case 'text':
      // A bare text node at block level — rare, but keep it.
      return renderInline([node]);

    default:
      // Unknown node (expand, layoutSection, bodiedExtension, …): keep whatever
      // text is inside it rather than dropping the user's content silently.
      return renderNodes(asArray(node.content), ctx).join('\n\n');
  }
}

/** `listItem` children are blocks; indent them under the item marker. */
function renderList(node: AdfNode, ctx: Ctx, marker: () => string): string {
  const indent = '  '.repeat(ctx.listDepth);
  const lines: string[] = [];
  for (const item of asArray(node.content)) {
    if (item.type !== 'listItem') { continue; }
    const inner = renderNodes(asArray(item.content), { listDepth: ctx.listDepth + 1 });
    if (inner.length === 0) { continue; }
    const [first, ...rest] = inner.join('\n').split('\n');
    lines.push(`${indent}${marker()} ${first}`);
    for (const line of rest) {
      lines.push(line.startsWith(indent) ? line : `${indent}  ${line}`);
    }
  }
  return lines.join('\n');
}

/** ADF task lists are real Jira checkboxes; render them as markdown checkboxes. */
function renderTaskList(node: AdfNode, ctx: Ctx): string {
  const indent = '  '.repeat(ctx.listDepth);
  const lines: string[] = [];
  for (const item of asArray(node.content)) {
    if (item.type === 'taskList') {
      const nested = renderTaskList(item, { listDepth: ctx.listDepth + 1 });
      if (nested) { lines.push(nested); }
      continue;
    }
    if (item.type !== 'taskItem') { continue; }
    const done = item.attrs?.state === 'DONE';
    lines.push(`${indent}- [${done ? 'x' : ' '}] ${renderInline(asArray(item.content))}`);
  }
  return lines.join('\n');
}

/**
 * Tables become pipe tables when they are rectangular enough to read, and a
 * flat list of cell text otherwise. Jira tables carry colspans and nested
 * blocks that a strict converter would choke on.
 */
function renderTable(node: AdfNode): string {
  const rows: string[][] = [];
  for (const row of asArray(node.content)) {
    if (row.type !== 'tableRow') { continue; }
    const cells = asArray(row.content)
      .filter((c) => c.type === 'tableCell' || c.type === 'tableHeader')
      .map((c) => renderNodes(asArray(c.content), { listDepth: 0 }).join(' ').replace(/\|/g, '\\|').trim());
    if (cells.length > 0) { rows.push(cells); }
  }
  if (rows.length === 0) { return ''; }
  const width = rows[0].length;
  if (!rows.every((r) => r.length === width)) {
    return rows.map((r) => `- ${r.join(' · ')}`).join('\n');
  }
  const header = `| ${rows[0].join(' | ')} |`;
  const sep = `| ${rows[0].map(() => '---').join(' | ')} |`;
  const body = rows.slice(1).map((r) => `| ${r.join(' | ')} |`);
  return [header, sep, ...body].join('\n');
}

function mediaPlaceholder(node: AdfNode): string {
  const media = node.type === 'media'
    ? node
    : asArray(node.content).find((c) => c.type === 'media') ?? node;
  const alt = typeof media.attrs?.alt === 'string' && media.attrs.alt ? media.attrs.alt : 'ảnh';
  return `[${alt}]`;
}

/** Render inline content (text + marks + mentions + emoji + breaks). */
function renderInline(nodes: AdfNode[]): string {
  let out = '';
  for (const node of nodes) {
    switch (node.type) {
      case 'text': {
        out += applyMarks(node);
        break;
      }
      case 'hardBreak':
        out += '\n';
        break;
      case 'mention': {
        const name = String(node.attrs?.text ?? node.attrs?.displayName ?? '').replace(/^@/, '');
        out += name ? `@${name}` : '';
        break;
      }
      case 'emoji': {
        // `text` is the actual glyph; `shortName` (":smile:") is the fallback.
        out += String(node.attrs?.text ?? node.attrs?.shortName ?? '');
        break;
      }
      case 'inlineCard':
      case 'blockCard': {
        const url = String(node.attrs?.url ?? '');
        out += url;
        break;
      }
      case 'status': {
        const text = String(node.attrs?.text ?? '');
        out += text ? `\`${text}\`` : '';
        break;
      }
      case 'date': {
        const ts = Number(node.attrs?.timestamp);
        out += Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : '';
        break;
      }
      default:
        // Nested inline container, or an unknown inline node: keep its text.
        out += node.content ? renderInline(asArray(node.content)) : (node.text ?? '');
    }
  }
  return out;
}

function applyMarks(node: AdfNode): string {
  let text = node.text ?? '';
  if (!text) { return ''; }
  const marks = Array.isArray(node.marks) ? node.marks : [];

  // Links wrap outermost so `**[text](url)**` reads correctly.
  let href = '';
  for (const mark of marks) {
    if (!mark || typeof mark !== 'object') { continue; }
    if (mark.type === 'link') {
      const url = mark.attrs?.href;
      if (typeof url === 'string') { href = url; }
      continue;
    }
    const wrap = MARK_WRAP[String(mark.type)];
    if (wrap) { text = `${wrap[0]}${text}${wrap[1]}`; }
  }
  return href ? `[${text}](${href})` : text;
}

/** Every text node under a subtree, concatenated. Used for code blocks. */
function plainText(node: AdfNode): string {
  if (node.type === 'text') { return node.text ?? ''; }
  if (node.type === 'hardBreak') { return '\n'; }
  return asArray(node.content).map(plainText).join('');
}

function clampLevel(v: unknown): number {
  const n = numberOr(v, 1);
  return Math.min(6, Math.max(1, n));
}

function numberOr(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Pull acceptance criteria out of a flattened description.
 *
 * Teams write them under a heading whose wording varies ("Acceptance
 * Criteria", "AC", "Tiêu chí hoàn thành", "Definition of Done"), followed by a
 * bullet or checkbox list. We take the first such section and return its list
 * items; no heading, no criteria — an empty array, never a guess, because a
 * wrong AC list is worse than none in a subtask's Completion Criteria.
 */
export function extractAcceptanceCriteria(markdown: string): string[] {
  if (!markdown.trim()) { return []; }
  const HEADING = /^\s{0,3}(?:#{1,6}\s*|\*\*)?\s*(?:acceptance\s+criteria|acceptance|\bac\b|definition\s+of\s+done|dod|tiêu\s+chí(?:\s+hoàn\s+thành)?)\s*:?\s*\**\s*$/i;
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => HEADING.test(line));
  if (start === -1) { return []; }

  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (!trimmed) {
      // Blank line ends the section only once we have something.
      if (items.length > 0) { break; }
      continue;
    }
    const bullet = trimmed.match(/^(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?(.*)$/);
    if (!bullet) { break; }
    const text = bullet[1].trim();
    if (text) { items.push(text); }
  }
  return items;
}
