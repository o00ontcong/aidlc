/**
 * The subtask template: schema, loading, and placeholder resolution.
 *
 * The team's convention for a Jira subtask lives on a Confluence page — prose,
 * written for humans. That page is imported ONCE into a YAML file in the repo
 * (`.aidlc/jira-subtask-template.yaml`, seeded from
 * `packages/core/templates/jira/subtask-template.yaml`) and every subtask is
 * built from the YAML, not from the page. Two reasons:
 *
 *   - a wiki page's structure is loose, while creating an issue must be exact;
 *   - the YAML is committed, so a change to the team's convention shows up in
 *     review like any other change.
 *
 * `source.contentHash` records what the page looked like at import time, so a
 * later fetch can say "the page moved on" without silently changing behaviour.
 *
 * Placeholder resolution is allowlist-only. Ticket text and wiki text are
 * external input; a template token that is not in `placeholders:` is left
 * verbatim rather than resolved against arbitrary context.
 */

import { createHash } from 'crypto';
import * as jsYaml from 'js-yaml';
import { z } from 'zod';

import type { SubtaskSectionKind } from './adfBuilder';

export class SubtaskTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubtaskTemplateError';
  }
}

// ─── schema ─────────────────────────────────────────────────────────────────

const SECTION_KINDS = ['prose', 'bulletList', 'taskList', 'inlineCode'] as const;

/**
 * Where a section's content comes from when AIDLC fills it. Unknown source ids
 * are rejected at load time rather than ignored at render time — a typo in
 * `from:` would otherwise show up as a silently empty section.
 */
const CONTENT_SOURCES = [
  'ticket.description',
  'ticket.acceptanceCriteria',
  'task.description',
  'steps.producesContains',
  'steps.names',
] as const;

export type SubtaskContentSource = (typeof CONTENT_SOURCES)[number];

const SectionSchema = z.object({
  key: z.string().min(1),
  heading: z.string().min(1),
  kind: z.enum(SECTION_KINDS),
  required: z.boolean().default(false),
  /** Content sources, tried in order until one yields something. */
  from: z.array(z.enum(CONTENT_SOURCES)).default([]),
  /** Literal lines (placeholders allowed) used instead of `from`. */
  autofill: z.array(z.string()).default([]),
});

/**
 * When to suggest a domain, evaluated against the ticket's labels:
 *
 *     match = hasAny(ticketLabelsAny) || (orNoneOf non-empty && !hasAny(orNoneOf))
 *
 * `orNoneOf` is an OR *fallback*, not an exclusion — it reads "…or when the
 * ticket carries none of these". That is what makes Backend the assumed default
 * on an unlabelled ticket while still standing down on a purely `frontend` one.
 * Both lists empty = always suggest.
 */
const WhenSchema = z.object({
  ticketLabelsAny: z.array(z.string()).default([]),
  orNoneOf: z.array(z.string()).default([]),
});

const PlanEntrySchema = z.object({
  domain: z.string().min(1),
  what: z.string().min(1),
  /** Pipeline step ids this subtask stands for, shown as provenance in the UI. */
  fromSteps: z.array(z.string()).default([]),
  when: WhenSchema.optional(),
  /** Pre-ticked in the preview panel. */
  default: z.boolean().default(true),
});

export const SubtaskTemplateSchema = z.object({
  version: z.literal(1),
  source: z.object({
    confluence: z.string().default(''),
    importedAt: z.string().default(''),
    contentHash: z.string().default(''),
  }).default({ confluence: '', importedAt: '', contentHash: '' }),
  title: z.object({
    format: z.string().min(1),
    domains: z.array(z.string().min(1)).min(1),
    maxLength: z.number().int().positive().max(255).default(255),
  }),
  body: z.object({
    separator: z.enum(['rule', 'none']).default('rule'),
    sections: z.array(SectionSchema).min(1),
  }),
  fields: z.object({
    issueTypeName: z.string().default('auto'),
    assignee: z.enum(['currentUser', 'parent', 'unassigned']).default('currentUser'),
    labels: z.array(z.string()).default([]),
    inheritParentLabels: z.boolean().default(true),
  }).default({ issueTypeName: 'auto', assignee: 'currentUser', labels: [], inheritParentLabels: true }),
  plan: z.array(PlanEntrySchema).min(1),
  placeholders: z.array(z.string()).default([]),
});

export type SubtaskTemplate = z.infer<typeof SubtaskTemplateSchema>;
export type SubtaskTemplateSection = z.infer<typeof SectionSchema>;
export type SubtaskPlanEntry = z.infer<typeof PlanEntrySchema>;

// ─── loading ────────────────────────────────────────────────────────────────

/**
 * Validate a parsed object. Throws {@link SubtaskTemplateError} listing the
 * first few issues — the file is hand-edited, so the message has to be
 * actionable without reading the schema.
 */
export function validateSubtaskTemplate(raw: unknown, path = 'jira-subtask-template.yaml'): SubtaskTemplate {
  const result = SubtaskTemplateSchema.safeParse(raw);
  if (!result.success) {
    const summary = result.error.issues
      .slice(0, 5)
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    const more = result.error.issues.length > 5 ? `\n  … and ${result.error.issues.length - 5} more` : '';
    throw new SubtaskTemplateError(`[${path}] không hợp lệ:\n${summary}${more}`);
  }
  const template = result.data;

  // Cross-field checks the schema cannot express.
  for (const entry of template.plan) {
    if (!template.title.domains.includes(entry.domain)) {
      throw new SubtaskTemplateError(
        `[${path}] plan có domain "${entry.domain}" không nằm trong title.domains `
        + `(${template.title.domains.join(', ')}).`,
      );
    }
  }
  const dupes = template.plan
    .map((e) => e.domain)
    .filter((d, i, all) => all.indexOf(d) !== i);
  if (dupes.length > 0) {
    throw new SubtaskTemplateError(
      `[${path}] plan có domain trùng: ${[...new Set(dupes)].join(', ')}. `
      + 'Một domain chỉ được một entry — dedupe dựa vào domain.',
    );
  }
  const sectionKeys = template.body.sections.map((s) => s.key);
  const dupeKeys = sectionKeys.filter((k, i) => sectionKeys.indexOf(k) !== i);
  if (dupeKeys.length > 0) {
    throw new SubtaskTemplateError(`[${path}] body.sections có key trùng: ${[...new Set(dupeKeys)].join(', ')}.`);
  }
  return template;
}

/** Parse YAML text, then validate. */
export function loadSubtaskTemplate(yamlText: string, path?: string): SubtaskTemplate {
  let raw: unknown;
  try {
    raw = jsYaml.load(yamlText);
  } catch (err) {
    throw new SubtaskTemplateError(
      `[${path ?? 'jira-subtask-template.yaml'}] không parse được YAML: `
      + (err instanceof Error ? err.message : String(err)),
    );
  }
  if (raw === null || raw === undefined) {
    throw new SubtaskTemplateError(`[${path ?? 'jira-subtask-template.yaml'}] file rỗng.`);
  }
  return validateSubtaskTemplate(raw, path);
}

/**
 * Content hash of a Confluence page body, for `source.contentHash`. Whitespace
 * is normalized first so a reflow in the editor does not read as a change.
 */
export function hashTemplateSource(pageBody: string): string {
  const normalized = pageBody.replace(/\s+/g, ' ').trim();
  return `sha256:${createHash('sha256').update(normalized, 'utf8').digest('hex')}`;
}

/**
 * True when the live page no longer matches what we imported. An empty stored
 * hash means "never imported", which is not staleness — it is just a default
 * template, so callers should not nag about it.
 */
export function isTemplateStale(template: SubtaskTemplate, livePageBody: string): boolean {
  const stored = template.source.contentHash.trim();
  if (!stored) { return false; }
  return stored !== hashTemplateSource(livePageBody);
}

// ─── placeholders ───────────────────────────────────────────────────────────

export type PlaceholderValue = string | string[];
export type PlaceholderContext = Record<string, PlaceholderValue | undefined>;

const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Substitute `{{token}}` in a single string.
 *
 * Rules, in priority order:
 *   1. token not in `allowed` → left verbatim. The allowlist is the security
 *      boundary: template files are reviewed, but the values they interpolate
 *      come from Jira and Confluence.
 *   2. token allowed but absent from context → replaced with ''.
 *   3. array value → joined with ', '.
 */
export function resolvePlaceholders(
  text: string,
  context: PlaceholderContext,
  allowed: readonly string[],
): string {
  const allowSet = new Set(allowed);
  return text.replace(TOKEN_RE, (match, token: string) => {
    if (!allowSet.has(token)) { return match; }
    const value = context[token];
    if (value === undefined) { return ''; }
    return Array.isArray(value) ? value.join(', ') : value;
  });
}

/**
 * Resolve a list of template lines.
 *
 * A line that is *exactly* one allowlisted token whose value is an array
 * expands to one line per element — that is what makes `autofill: ['{{labels}}']`
 * produce a chip per label instead of one comma-joined blob. Every other line
 * goes through {@link resolvePlaceholders}. Lines that resolve to nothing are
 * dropped, so an absent value leaves no empty bullet behind.
 */
export function resolveLines(
  lines: readonly string[],
  context: PlaceholderContext,
  allowed: readonly string[],
): string[] {
  const allowSet = new Set(allowed);
  const out: string[] = [];
  for (const line of lines) {
    const solo = line.trim().match(/^\{\{\s*([\w.]+)\s*\}\}$/);
    if (solo && allowSet.has(solo[1])) {
      const value = context[solo[1]];
      if (Array.isArray(value)) {
        out.push(...value.map((v) => String(v).trim()).filter(Boolean));
        continue;
      }
    }
    const resolved = resolvePlaceholders(line, context, allowed).trim();
    if (resolved) { out.push(resolved); }
  }
  return out;
}

/**
 * Tokens present in a string, whether or not they are allowlisted. Used by the
 * importer to warn about a template that references something we will not
 * resolve.
 */
export function referencedPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(TOKEN_RE)) { found.add(match[1]); }
  return [...found];
}

/**
 * Build a subtask summary from `title.format`, clamped to `title.maxLength`.
 * Jira rejects a summary over 255 chars, and truncating on a word boundary
 * reads better than a hard cut mid-word.
 */
export function formatSubtaskSummary(
  template: SubtaskTemplate,
  context: PlaceholderContext,
): string {
  const raw = resolvePlaceholders(template.title.format, context, template.placeholders)
    .replace(/\s+/g, ' ')
    .trim();
  const max = template.title.maxLength;
  if (raw.length <= max) { return raw; }
  const cut = raw.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}
