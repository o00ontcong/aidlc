/**
 * Everything the app knows about a blueprint's health, computed from the docs
 * themselves: Definition of Done per step, cross-doc traceability, and the
 * guardrails an agent run is checked against afterwards.
 *
 * All pure. The service supplies parsed docs; nothing here reads the disk, so
 * the same functions run over a snapshot (what the docs looked like before a
 * run) and over the working tree (what they look like now).
 */

import type { DiscoverIndex, DiscoverStepId } from '../contracts/discover';
import {
  DISCOVER_STEPS,
  getFileSpec,
  getStepSpec,
  type DiscoverStepSpec,
  type DodRule,
} from './DocSpec';
import { extractIds, findSection, itemSignature, type DocModel, type DocRecord, type DocSection } from './mdParse';

/** Parsed docs keyed by path relative to `docsRoot`. */
export type Blueprint = Map<string, DocModel>;

export interface BlueprintContext {
  docs: Blueprint;
  /** Files found in each step's `extraDir`, keyed by that dir's path. */
  extraFiles: Record<string, string[]>;
}

export interface DodCheckResult {
  id: string;
  level: 'required' | 'optional';
  label: string;
  passed: boolean;
  /**
   * The rule has nothing to check yet — a coverage rule whose upstream
   * section is still empty. Kept visible in the list but out of the
   * completion maths, so an untouched step reads 0%, not "half done".
   */
  notApplicable?: boolean;
  /** What is missing, when we can say it precisely (e.g. the uncovered ids). */
  detail?: string;
}

export interface StepStatus {
  step: DiscoverStepId;
  requirements: DodCheckResult[];
  /** Fraction of *required* rules passed, 0..1. */
  completion: number;
  canAdvance: boolean;
}

export interface ValidationIssue {
  level: 'error' | 'warn';
  code: string;
  message: string;
  file?: string;
  id?: string;
}

export interface GuardrailIssue {
  code: string;
  message: string;
  file?: string;
  id?: string;
}

export interface BlueprintDiff {
  /** `path#ID` keys. */
  added: string[];
  updated: string[];
  removed: string[];
}

// ── helpers ────────────────────────────────────────────────────────────────

function section(ctx: BlueprintContext, file: string, key: string): DocSection | undefined {
  const doc = ctx.docs.get(file);
  return doc ? findSection(doc, key) : undefined;
}

function entriesOf(sec: DocSection | undefined): { id: string; text: string }[] {
  if (!sec) { return []; }
  return [
    ...sec.items.map((i) => ({ id: i.id, text: i.text })),
    ...sec.records.map((r) => ({ id: r.id, text: recordText(r) })),
  ];
}

function recordText(record: DocRecord): string {
  return [
    record.title,
    ...record.fields.map((f) => `${f.label}: ${f.value} ${f.items.join(' ')}`),
    ...record.extra,
  ].join('\n');
}

function recordMissingFields(record: DocRecord, required: string[]): string[] {
  return required.filter((label) => {
    const field = record.fields.find((f) => f.label.toLowerCase() === label.toLowerCase());
    if (!field) { return true; }
    return field.value.trim() === '' && field.items.length === 0;
  });
}

function uncoveredIds(ctx: BlueprintContext, from: { file: string; section: string }, by: { file: string; section: string }): string[] {
  const sources = entriesOf(section(ctx, from.file, from.section));
  if (sources.length === 0) { return []; }
  const mentioned = new Set(
    entriesOf(section(ctx, by.file, by.section)).flatMap((e) => extractIds(`${e.id} ${e.text}`)),
  );
  return sources.map((s) => s.id).filter((id) => !mentioned.has(id));
}

// ── Definition of Done ─────────────────────────────────────────────────────

function checkRule(ctx: BlueprintContext, step: DiscoverStepSpec, rule: DodRule): DodCheckResult {
  const base = { id: rule.id, level: rule.level, label: rule.label };
  switch (rule.rule.kind) {
    case 'proseFilled': {
      const sec = section(ctx, rule.rule.file, rule.rule.section);
      return { ...base, passed: !!sec && sec.prose.trim().length > 0 };
    }
    case 'minItems': {
      const count = section(ctx, rule.rule.file, rule.rule.section)?.items.length ?? 0;
      return { ...base, passed: count >= rule.rule.count, detail: `${count}/${rule.rule.count}` };
    }
    case 'minRecords': {
      const count = section(ctx, rule.rule.file, rule.rule.section)?.records.length ?? 0;
      return { ...base, passed: count >= rule.rule.count, detail: `${count}/${rule.rule.count}` };
    }
    case 'recordFields': {
      const records = section(ctx, rule.rule.file, rule.rule.section)?.records ?? [];
      const incomplete = records.filter((r) => recordMissingFields(r, (rule.rule as { fields: string[] }).fields).length > 0);
      return {
        ...base,
        passed: records.length > 0 && incomplete.length === 0,
        detail: incomplete.length ? `missing on ${incomplete.map((r) => r.id).join(', ')}` : undefined,
      };
    }
    case 'coverage': {
      const sources = entriesOf(section(ctx, rule.rule.from.file, rule.rule.from.section));
      if (sources.length === 0) {
        return { ...base, passed: true, notApplicable: true, detail: `nothing in ${rule.rule.from.file} to cover yet` };
      }
      const missing = uncoveredIds(ctx, rule.rule.from, rule.rule.by);
      return { ...base, passed: missing.length === 0, detail: missing.length ? `not covered: ${missing.join(', ')}` : undefined };
    }
    case 'minExtraFiles': {
      const dir = step.extraDir?.path;
      const count = dir ? (ctx.extraFiles[dir]?.length ?? 0) : 0;
      return { ...base, passed: count >= rule.rule.count, detail: `${count}/${rule.rule.count}` };
    }
    default:
      return { ...base, passed: false, detail: 'unknown rule' };
  }
}

export function getStepStatus(ctx: BlueprintContext, stepId: DiscoverStepId): StepStatus {
  const spec = getStepSpec(stepId);
  const requirements = spec.dod.map((rule) => checkRule(ctx, spec, rule));
  const required = requirements.filter((r) => r.level === 'required' && !r.notApplicable);
  const passed = required.filter((r) => r.passed).length;
  return {
    step: stepId,
    requirements,
    completion: required.length === 0 ? 1 : passed / required.length,
    canAdvance: passed === required.length,
  };
}

export function getAllStepStatuses(ctx: BlueprintContext): StepStatus[] {
  return DISCOVER_STEPS.map((s) => getStepStatus(ctx, s.id));
}

export function getMissingRequirements(ctx: BlueprintContext, stepId: DiscoverStepId): DodCheckResult[] {
  return getStepStatus(ctx, stepId).requirements.filter((r) => r.level === 'required' && !r.notApplicable && !r.passed);
}

/** Whether a step's docs have any content at all — the `fill` vs `refine` decision. */
export function isStepEmpty(ctx: BlueprintContext, stepId: DiscoverStepId): boolean {
  return getStepSpec(stepId).files.every((file) => {
    const doc = ctx.docs.get(file.path);
    if (!doc || !doc.exists) { return true; }
    return doc.sections.every((s) => s.prose.trim() === '' && s.items.length === 0 && s.records.length === 0);
  });
}

// ── traceability / consistency ─────────────────────────────────────────────

export function validateBlueprint(ctx: BlueprintContext, index?: DiscoverIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, string>();
  const known = new Set<string>();

  for (const [docPath, doc] of ctx.docs) {
    const fileSpec = getFileSpec(docPath);
    for (const sec of doc.sections) {
      const secSpec = fileSpec?.sections.find((s) => s.key === sec.key);
      for (const entry of [...sec.items, ...sec.records]) {
        known.add(entry.id);
        const where = `${docPath}#${entry.id}`;
        const prev = seen.get(entry.id);
        if (prev) {
          issues.push({ level: 'error', code: 'duplicate-id', file: docPath, id: entry.id, message: `${entry.id} is declared twice (${prev} and ${where}).` });
        } else {
          seen.set(entry.id, where);
        }
        if (secSpec?.idPattern && !secSpec.idPattern.test(entry.id)) {
          issues.push({ level: 'warn', code: 'id-shape', file: docPath, id: entry.id, message: `${entry.id} does not match the ${secSpec.heading} id shape.` });
        }
      }
      if (sec.stray.length > 0 && sec.kind !== 'unknown' && sec.kind !== 'prose') {
        issues.push({ level: 'warn', code: 'unparsed-line', file: docPath, message: `${sec.stray.length} line(s) under "${sec.heading}" are not in the item format and will not be tracked.` });
      }
    }
  }

  // Dangling references: an id cited by an item that nothing declares.
  for (const [docPath, doc] of ctx.docs) {
    for (const sec of doc.sections) {
      for (const entry of entriesOf(sec)) {
        for (const ref of extractIds(entry.text)) {
          if (ref !== entry.id && !known.has(ref)) {
            issues.push({ level: 'warn', code: 'dangling-ref', file: docPath, id: entry.id, message: `${entry.id} cites ${ref}, which no document declares.` });
          }
        }
      }
    }
  }

  // Coverage warnings, including the ones that are only `optional` as DoD.
  for (const step of DISCOVER_STEPS) {
    for (const rule of step.dod) {
      if (rule.rule.kind !== 'coverage') { continue; }
      for (const id of uncoveredIds(ctx, rule.rule.from, rule.rule.by)) {
        issues.push({ level: 'warn', code: 'not-covered', file: rule.rule.by.file, id, message: `${id} is not covered in ${rule.rule.by.file}.` });
      }
    }
  }

  if (index) { issues.push(...staleDocIssues(ctx, index)); }
  return issues;
}

/**
 * A doc is stale when a document it depends on (an earlier step) was written
 * after it was. Reported, never auto-fixed — the human decides whether the
 * later decision actually needs redoing.
 */
export function staleDocIssues(ctx: BlueprintContext, index: DiscoverIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ordered = DISCOVER_STEPS.flatMap((step) => step.files.map((f) => ({ order: step.order, path: f.path })));
  for (const downstream of ordered) {
    const meta = index.docs[downstream.path];
    if (!meta || !ctx.docs.get(downstream.path)?.exists) { continue; }
    for (const upstream of ordered) {
      if (upstream.order >= downstream.order) { continue; }
      const upMeta = index.docs[upstream.path];
      if (!upMeta) { continue; }
      if (upMeta.updatedAt > meta.updatedAt) {
        issues.push({
          level: 'warn',
          code: 'stale-doc',
          file: downstream.path,
          message: `${upstream.path} changed after ${downstream.path} was written — re-check it.`,
        });
        break;
      }
    }
  }
  return issues;
}

// ── diff + guardrails ──────────────────────────────────────────────────────

function signatures(blueprint: Blueprint): Map<string, string> {
  const out = new Map<string, string>();
  for (const [docPath, doc] of blueprint) {
    for (const sec of doc.sections) {
      for (const entry of [...sec.items, ...sec.records]) {
        out.set(`${docPath}#${entry.id}`, itemSignature(entry));
      }
    }
  }
  return out;
}

export function diffBlueprints(before: Blueprint, after: Blueprint): BlueprintDiff {
  const from = signatures(before);
  const to = signatures(after);
  const diff: BlueprintDiff = { added: [], updated: [], removed: [] };
  for (const [key, sig] of to) {
    if (!from.has(key)) { diff.added.push(key); }
    else if (from.get(key) !== sig) { diff.updated.push(key); }
  }
  for (const key of from.keys()) { if (!to.has(key)) { diff.removed.push(key); } }
  return diff;
}

/** Raw text of the sections the spec does not declare — the user's own writing. */
function freeBlocks(blueprint: Blueprint): Map<string, string> {
  const out = new Map<string, string>();
  for (const [docPath, doc] of blueprint) {
    for (const sec of doc.sections) {
      if (!sec.key.startsWith('unknown:')) { continue; }
      out.set(`${docPath}#${sec.key}`, doc.lines.slice(sec.headingLine, sec.endLine).join('\n'));
    }
  }
  return out;
}

/**
 * What an agent run is judged on after the fact. `allowedPaths` is the set of
 * docs the run was scoped to; touching anything else is a violation even when
 * the edit itself looks reasonable.
 */
export function checkGuardrails(
  before: Blueprint,
  after: Blueprint,
  index: DiscoverIndex,
  allowedPaths: string[],
): GuardrailIssue[] {
  const issues: GuardrailIssue[] = [];
  const diff = diffBlueprints(before, after);
  const allowed = new Set(allowedPaths);

  for (const key of [...diff.added, ...diff.updated, ...diff.removed]) {
    const [docPath, id] = key.split('#') as [string, string];
    const meta = index.items[key];
    if (!allowed.has(docPath)) {
      issues.push({ code: 'out-of-scope', file: docPath, id, message: `${key} changed but ${docPath} is not part of this step.` });
    }
    if (meta?.pinned && diff.removed.includes(key)) {
      issues.push({ code: 'pinned-removed', file: docPath, id, message: `${id} is pinned and was removed.` });
    } else if (meta?.pinned && diff.updated.includes(key)) {
      issues.push({ code: 'pinned-modified', file: docPath, id, message: `${id} is pinned and was rewritten.` });
    } else if (meta?.origin === 'human' && diff.removed.includes(key)) {
      issues.push({ code: 'human-removed', file: docPath, id, message: `${id} was written by you and was removed — confirm before keeping.` });
    }
  }

  const beforeFree = freeBlocks(before);
  const afterFree = freeBlocks(after);
  for (const [key, text] of beforeFree) {
    const [docPath] = key.split('#') as [string];
    if (!afterFree.has(key)) {
      issues.push({ code: 'free-block-removed', file: docPath, message: `Your own section "${key.split('#')[1]}" was removed.` });
    } else if (afterFree.get(key) !== text) {
      issues.push({ code: 'free-block-modified', file: docPath, message: `Your own section "${key.split('#')[1]}" was rewritten.` });
    }
  }

  for (const [docPath, doc] of before) {
    const now = after.get(docPath);
    if (!now) { continue; }
    for (const sec of doc.sections) {
      if (sec.key.startsWith('unknown:')) { continue; }
      if (!findSection(now, sec.key)) {
        issues.push({ code: 'section-removed', file: docPath, message: `Required section "${sec.heading}" is gone from ${docPath}.` });
      }
    }
  }

  return issues;
}
