/**
 * Discover's published-context layer.
 *
 * Markdown under docs/project remains the only editable source. This service
 * converts a checked snapshot of that content into immutable, content-addressed
 * data for delivery tasks. It deliberately never creates a second Markdown
 * source of truth and never mutates the canonical docs while publishing.
 */

import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import type { ActorRef } from '../contracts/common';
import type { WorkspaceConfig } from '../schema/WorkspaceSchema';
import { writeFileAtomic } from '../epic/EpicStore';
import { hashObject } from '../cofofo/hash';
import { detectStack } from '../cofofo/StackDetector';
import { builtinCofofoCatalogRoot, selectCatalog } from '../cofofo/Catalog';
import { installCatalog, COFOFO_INSTALLED_ASSETS_PATH } from '../cofofo/Installer';
import { buildBundleBinding, COFOFO_BUNDLE_BINDING_PATH } from '../cofofo/BundleBinding';
import { composeWorkspaceFromBundle } from '../cofofo/WorkspaceComposer';
import { generatedCofofoWorkspace, installCofofoProviderCommands } from '../cofofo/WorkflowGenerator';
import {
  DOC_ARCHITECTURE,
  DOC_FEATURES,
  DOC_IDEA,
  DOC_IMPLEMENTATION_PLAN,
  DOC_MODULES,
  DOC_PRODUCT,
  DOC_PROJECT_STRUCTURE,
  DOC_REQUIREMENTS,
  DOC_TECH_STACK,
  allDocPaths,
} from './DocSpec';
import { DiscoverNotInitializedError, DiscoverService } from './DiscoverService';
import { getPhase, type DiscoverPhase } from './handoff';
import { extractIds, findSection, itemBody, type DocItem } from './mdParse';
import { classifyItemCoverage } from './epicSuggestions';
import { listProductSourceFiles } from './sourceScope';
import type { BlueprintContext, ValidationIssue } from './validate';

export const DISCOVER_CONTEXT_DIR = '.aidlc/discover';
export const DISCOVER_PUBLISHED_CONTEXT_PATH = `${DISCOVER_CONTEXT_DIR}/published-context.json`;
export const DISCOVER_CODE_INDEX_PATH = `${DISCOVER_CONTEXT_DIR}/code-index.json`;
export const DISCOVER_COMPILED_RULES_PATH = `${DISCOVER_CONTEXT_DIR}/compiled-rules.json`;
export const DISCOVER_HISTORY_DIR = `${DISCOVER_CONTEXT_DIR}/history`;
export const DISCOVER_HISTORY_REVISIONS_DIR = `${DISCOVER_HISTORY_DIR}/revisions`;
export const DISCOVER_OBJECTS_DIR = `${DISCOVER_CONTEXT_DIR}/objects`;
export const DISCOVER_CONTEXT_PACKS_DIR = `${DISCOVER_CONTEXT_DIR}/context-packs`;
export const DISCOVER_MIGRATION_INVENTORY_PATH = `${DISCOVER_CONTEXT_DIR}/migration/legacy-inventory.json`;

export type DiscoverEntityKind = 'requirement' | 'feature' | 'other';
export type DiscoverEntityStatus = 'draft' | 'review' | 'ready' | 'deprecated';
export type DiscoverCodeEvidenceStatus = 'planned' | 'implemented' | 'stale' | 'orphaned' | 'conflict';
export type DiscoverContextStatus = 'missing' | 'draft' | 'ready' | 'stale' | 'conflict';

export interface DiscoverContextEntity {
  id: string;
  kind: DiscoverEntityKind;
  title: string;
  status: DiscoverEntityStatus;
  fields: Record<string, string[]>;
  references: string[];
  source: { file: string; section: string };
  contentHash: string;
}

export interface DiscoverContextRef {
  discoverRevision: string;
  contextHash: string;
  phaseId?: string;
  bugScopeId?: string;
  packHash: string;
  sourceCommit: string | null;
  sourceTreeHash: string;
  dirty: boolean;
}

export interface DiscoverHistoryEvent {
  discoverRevision: string;
  parentRevision: string | null;
  publishedAt: string;
  actor: ActorRef | { kind: 'migration'; id: string };
  source?: { taskId?: string; jiraKey?: string; runId?: string; command?: string };
  entityType: DiscoverEntityKind;
  entityId: string;
  changeType: 'created' | 'updated' | 'deprecated' | 'restored' | 'relinked';
  changedFields: string[];
  beforeHash: string | null;
  afterHash: string;
  summary: string;
  reason: string;
  breaking: boolean;
}

export interface DiscoverHistoryDetail {
  event: DiscoverHistoryEvent;
  before?: Pick<DiscoverContextEntity, 'title' | 'status' | 'fields'>;
  after?: Pick<DiscoverContextEntity, 'title' | 'status' | 'fields'>;
}

export interface DiscoverPublishedContext {
  schemaVersion: 1;
  generated: true;
  doNotEdit: true;
  inputHash: string;
  status: 'ready';
  discoverRevision: string;
  parentRevision: string | null;
  contextHash: string;
  canonicalHash: string;
  blueprint: { id: string; revision: number; title: string; docsRoot: string };
  publishedAt: string;
  actor: ActorRef | { kind: 'migration'; id: string };
  source?: DiscoverHistoryEvent['source'];
  sourceCommit: string | null;
  sourceTreeHash: string;
  dirty: boolean;
  documents: Array<{ path: string; hash: string }>;
  entities: DiscoverContextEntity[];
  stack: { kind: string; stackId?: string; confidence?: number; reason?: string };
  rules: Array<{ id: string; text: string; hash: string }>;
}

export interface DiscoverContextPack {
  schemaVersion: 1;
  generated: true;
  doNotEdit: true;
  inputHash: string;
  taskKind: 'feature' | 'bugfix';
  contextRef: DiscoverContextRef;
  phase?: Pick<DiscoverPhase, 'id' | 'title' | 'goal' | 'dependsOn' | 'deliverables' | 'definitionOfDone'>;
  entities: DiscoverContextEntity[];
  productSummary: string[];
  rules: Array<{ id: string; text: string }>;
  sourcePaths: string[];
  estimatedTokens: number;
  generatedAt: string;
}

/**
 * Generated evidence only. Canonical Discover Markdown remains the sole
 * editable source; this index is deliberately safe to recreate on Publish.
 */
export interface DiscoverCodeIndex {
  schemaVersion: 1;
  generated: true;
  doNotEdit: true;
  discoverRevision: string;
  sourceCommit: string | null;
  sourceTreeHash: string;
  inputHash: string;
  dependencies: Array<{ path: string; names: string[]; hash: string }>;
  entryPoints: string[];
  reconciliation: Array<{ document: string; status: 'matched' | 'missing' | 'stale'; detail: string }>;
  entries: Array<{
    id: string;
    status: DiscoverCodeEvidenceStatus;
    paths: string[];
    testPaths: string[];
    entryPoints: string[];
    evidenceHash: string;
  }>;
}

export interface DiscoverLegacyMigrationPreview {
  schemaVersion: 1;
  generated: true;
  doNotEdit: true;
  inputHash: string;
  sources: Array<{ path: string; hash: string; kind: 'foundation' | 'epic-intent' | 'epic-requirement' }>;
  discoverInitialized: boolean;
  publishedRevision?: string;
  warnings: string[];
}

export interface DiscoverLegacyMigrationResult {
  inventoryPath: string;
  context: DiscoverPublishedContext;
  createdDiscover: boolean;
  createdBaseline: boolean;
}

export interface DiscoverContextInspection {
  status: DiscoverContextStatus;
  context: DiscoverPublishedContext | null;
  issues: ValidationIssue[];
  nextAction: string;
}

export class DiscoverContextPublishError extends Error {
  constructor(message: string, readonly issues: ValidationIssue[] = []) {
    super(message);
    this.name = 'DiscoverContextPublishError';
  }
}

function writeJson(file: string, value: unknown): void {
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) { return null; }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return null; }
}

function keyOf(label: string): string {
  return label.toLowerCase().replace(/[*_`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Detail fields live in an item's indented Markdown description. This keeps
 * REQUIREMENTS.md and FEATURES.md canonical and backwards compatible with the
 * existing item format:
 *
 * - **FR-01** — title
 *   - **Statement:** ...
 *   - **Acceptance criteria:**
 *     - Given ...
 */
export function parseDetailFields(description?: string): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  let current = 'description';
  for (const raw of (description ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) { continue; }
    const match = /^(?:[-*+]\s+)?(?:\*\*)?([^:*]+?)(?:\*\*)?:(?:\*\*)?\s*(.*)$/u.exec(line);
    if (match) {
      current = keyOf(match[1]!);
      const value = match[2]!.trim();
      fields[current] ??= [];
      if (value) { fields[current]!.push(value); }
      continue;
    }
    fields[current] ??= [];
    fields[current]!.push(line.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/u, '').trim());
  }
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value.some(Boolean)));
}

function statusOf(fields: Record<string, string[]>): DiscoverEntityStatus {
  const value = fields.status?.join(' ').toLowerCase().trim();
  if (value === 'ready') { return 'ready'; }
  if (value === 'review' || value === 'in review') { return 'review'; }
  if (value === 'deprecated') { return 'deprecated'; }
  return 'draft';
}

function canonicalEntity(kind: DiscoverEntityKind, file: string, section: string, item: DocItem): DiscoverContextEntity {
  const description = item.description ?? '';
  const fields = parseDetailFields(description);
  const references = extractIds(`${item.text}\n${description}`).filter((id) => id !== item.id).sort();
  const base = {
    id: item.id,
    kind,
    title: item.text,
    status: statusOf(fields),
    fields,
    references,
    source: { file, section },
  };
  return { ...base, contentHash: hashObject(base) };
}

function docContent(service: DiscoverService, docPath: string): string {
  const file = service.docFile(docPath);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function sourceState(root: string): { sourceCommit: string | null; sourceTreeHash: string; dirty: boolean } {
  let sourceCommit: string | null = null;
  let dirty = true;
  try {
    sourceCommit = childProcess.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
    // Generated Context files are deliberately untracked. They must not make
    // their own published revision immediately stale after `publish()`.
    // Tracked source edits still participate in the dirty signal.
    const sourcePathspec = ['--', '.', ':(exclude).aidlc'];
    const status = childProcess.execFileSync('git', ['status', '--porcelain', '--untracked-files=no', ...sourcePathspec], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const diff = childProcess.execFileSync('git', ['diff', '--no-ext-diff', '--binary', 'HEAD', ...sourcePathspec], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    dirty = status.length > 0;
    // Do not collapse every dirty worktree into one value. A changed source
    // file must make a published context stale even before a commit exists.
    return { sourceCommit, sourceTreeHash: hashObject({ sourceCommit, diffHash: hashObject(diff) }), dirty };
  } catch {
    // A non-git workspace is allowed. The docs + evidence hashes still make
    // the published context deterministic.
  }
  return { sourceCommit, sourceTreeHash: hashObject({ sourceCommit, dirty }), dirty };
}

function readText(file: string): string | undefined {
  try { return fs.readFileSync(file, 'utf8'); } catch { return undefined; }
}

function isTestPath(file: string): boolean {
  return /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/i.test(file);
}

function likelyEntryPoint(file: string): boolean {
  return /(?:^|\/)(?:index|main|app|server|cli)\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|swift)$/i.test(file);
}

function packageDependencies(file: string): { names: string[]; hash: string } | undefined {
  const text = readText(file);
  if (!text) { return undefined; }
  try {
    const pkg = JSON.parse(text) as Record<string, unknown>;
    const groups = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
    const names = [...new Set(groups.flatMap((key) => Object.keys((pkg[key] ?? {}) as Record<string, unknown>)))].sort();
    return { names, hash: hashObject({ names, textHash: hashObject(text) }) };
  } catch {
    return undefined;
  }
}

function architectureReconciliation(service: DiscoverService, ctx: BlueprintContext, sourcePaths: string[]): DiscoverCodeIndex['reconciliation'] {
  const hasSource = sourcePaths.length > 0;
  const docs = [DOC_ARCHITECTURE, DOC_MODULES, DOC_PROJECT_STRUCTURE, DOC_TECH_STACK];
  const result: DiscoverCodeIndex['reconciliation'] = docs.map((document) => ({
    document,
    status: !docContent(service, document).trim() ? 'missing' : hasSource ? 'matched' : 'stale',
    detail: !docContent(service, document).trim()
      ? 'Canonical architecture document is empty.'
      : hasSource ? 'Reviewed against the current source inventory.' : 'No product source is present; this remains a planned/skeleton architecture.',
  }));
  const moduleDoc = ctx.docs.get(DOC_MODULES);
  const modules = moduleDoc ? findSection(moduleDoc, 'modules')?.records ?? [] : [];
  for (const module of modules) {
    const folder = module.fields.find((field) => field.label.toLowerCase() === 'folder')?.value.trim();
    if (!folder) { continue; }
    const normalized = folder.replace(/^\.\//, '').replace(/\\/g, '/');
    const matches = sourcePaths.some((source) => source === normalized || source.startsWith(`${normalized}/`));
    result.push({
      document: `${DOC_MODULES}#${module.id}`,
      status: matches ? 'matched' : hasSource ? 'stale' : 'missing',
      detail: matches ? `Module folder ${folder} has source evidence.` : `Module folder ${folder} has no matching source evidence.`,
    });
  }
  return result;
}

function buildCodeIndexDraft(
  root: string,
  service: DiscoverService,
  ctx: BlueprintContext,
  entities: DiscoverContextEntity[],
  source: { sourceCommit: string | null; sourceTreeHash: string },
): Omit<DiscoverCodeIndex, 'discoverRevision'> {
  const sourcePaths = listProductSourceFiles(root, service.declaredScope(), 8000).sort();
  const coverage = classifyItemCoverage({ workspaceRoot: root, ctx, index: service.require(), scope: service.declaredScope(), checkFoundation: false });
  const coverageById = new Map(coverage.items.map((item) => [item.id, item]));
  const sourceSet = new Set(sourcePaths);
  const manifestCandidates = [
    'package.json', 'pnpm-workspace.yaml', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'Gemfile', 'Package.swift', 'Podfile',
  ];
  const dependencies = manifestCandidates.flatMap((relative) => {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) { return []; }
    const parsed = relative === 'package.json' ? packageDependencies(absolute) : undefined;
    const text = readText(absolute) ?? '';
    return [{ path: relative, names: parsed?.names ?? [], hash: parsed?.hash ?? hashObject(text) }];
  });
  const entryPoints = sourcePaths.filter(likelyEntryPoint).slice(0, 80);
  const entries = entities.map((entity) => {
    const covered = coverageById.get(entity.id);
    const paths = [...new Set((covered?.matchedFiles ?? []).filter((file) => sourceSet.has(file)))].sort();
    const testPaths = paths.filter(isTestPath);
    const status: DiscoverCodeEvidenceStatus = entity.references.some((id) => !entities.some((candidate) => candidate.id === id))
      ? 'conflict'
      : covered?.status === 'stale' ? 'stale'
        : covered?.status === 'in-code' ? 'implemented'
          : 'planned';
    const value = { id: entity.id, status, paths, testPaths, entryPoints: entryPoints.filter((entry) => paths.some((file) => entry.startsWith(path.dirname(file)))) };
    return { ...value, evidenceHash: hashObject(value) };
  });
  const reconciliation = architectureReconciliation(service, ctx, sourcePaths);
  const inputHash = hashObject({ sourceTreeHash: source.sourceTreeHash, dependencies, entryPoints, reconciliation, entries });
  return {
    schemaVersion: 1,
    generated: true,
    doNotEdit: true,
    sourceCommit: source.sourceCommit,
    sourceTreeHash: source.sourceTreeHash,
    inputHash,
    dependencies,
    entryPoints,
    reconciliation,
    entries,
  };
}

function legacyMigrationSources(root: string): DiscoverLegacyMigrationPreview['sources'] {
  const sources: DiscoverLegacyMigrationPreview['sources'] = [];
  const foundation = path.join(root, 'docs/project/foundation');
  try {
    for (const entry of fs.readdirSync(foundation, { withFileTypes: true })) {
      if (!entry.isFile()) { continue; }
      const absolute = path.join(foundation, entry.name);
      const text = readText(absolute);
      if (text === undefined) { continue; }
      sources.push({ path: path.relative(root, absolute).split(path.sep).join('/'), hash: hashObject(text), kind: 'foundation' });
    }
  } catch { /* Legacy Foundation is optional. */ }
  const epics = path.join(root, 'docs/epics');
  try {
    for (const epic of fs.readdirSync(epics, { withFileTypes: true })) {
      if (!epic.isDirectory()) { continue; }
      for (const [name, kind] of [['INTENT.md', 'epic-intent'], ['REQUIREMENT.md', 'epic-requirement']] as const) {
        const absolute = path.join(epics, epic.name, 'artifacts', name);
        const text = readText(absolute);
        if (text !== undefined) {
          sources.push({ path: path.relative(root, absolute).split(path.sep).join('/'), hash: hashObject(text), kind });
        }
      }
    }
  } catch { /* Legacy epics are optional. */ }
  return sources.sort((a, b) => a.path.localeCompare(b.path));
}

function changedFields(before: DiscoverContextEntity, after: DiscoverContextEntity): string[] {
  const names = new Set([...Object.keys(before.fields), ...Object.keys(after.fields)]);
  const changed = [...names].filter((name) => JSON.stringify(before.fields[name] ?? []) !== JSON.stringify(after.fields[name] ?? []));
  if (before.title !== after.title) { changed.unshift('title'); }
  if (before.status !== after.status) { changed.unshift('status'); }
  if (JSON.stringify(before.references) !== JSON.stringify(after.references)) { changed.push('references'); }
  return [...new Set(changed)];
}

function hasField(entity: DiscoverContextEntity, ...names: string[]): boolean {
  return names.some((name) => (entity.fields[keyOf(name)] ?? []).some((value) => value.trim().length > 0));
}

function detailIssues(entities: DiscoverContextEntity[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const features = entities.filter((entity) => entity.kind === 'feature');
  for (const entity of entities) {
    if (entity.status !== 'ready') { continue; }
    const missing = entity.kind === 'requirement'
      ? [
        ['statement'], ['rationale', 'user value'], ['acceptance criteria', 'acceptance criterion'], ['verification', 'verification method'], ['owner'],
      ].filter((names) => !hasField(entity, ...names))
      : [
        ['problem'], ['desired outcome', 'outcome'], ['in scope', 'scope'], ['definition of done', 'dod'], ['owner'],
      ].filter((names) => !hasField(entity, ...names));
    if (missing.length) {
      issues.push({
        level: 'error', code: 'discover-detail-incomplete', file: entity.source.file, id: entity.id,
        message: `${entity.id} is Ready but missing: ${missing.map((names) => names[0]).join(', ')}.`,
      });
    }
    if (entity.kind === 'feature' && !entity.references.some((id) => byId.get(id)?.kind === 'requirement')) {
      issues.push({ level: 'error', code: 'feature-without-requirement', file: entity.source.file, id: entity.id, message: `${entity.id} is Ready but does not reference a requirement.` });
    }
    if (entity.kind === 'requirement' && !features.some((feature) => feature.references.includes(entity.id))) {
      issues.push({ level: 'error', code: 'requirement-without-feature', file: entity.source.file, id: entity.id, message: `${entity.id} is Ready but no Feature references it.` });
    }
  }
  return issues;
}

function entitiesFrom(ctx: BlueprintContext): DiscoverContextEntity[] {
  const requirements = ctx.docs.get(DOC_REQUIREMENTS);
  const features = ctx.docs.get(DOC_FEATURES);
  const out: DiscoverContextEntity[] = [];
  for (const section of requirements?.sections ?? []) {
    if (section.key !== 'functional' && section.key !== 'nonFunctional') { continue; }
    for (const item of section.items) { out.push(canonicalEntity('requirement', DOC_REQUIREMENTS, section.key, item)); }
  }
  for (const section of features?.sections ?? []) {
    if (section.key !== 'features') { continue; }
    for (const item of section.items) { out.push(canonicalEntity('feature', DOC_FEATURES, section.key, item)); }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function productSummary(ctx: BlueprintContext): string[] {
  const take = (file: string, section: string) => {
    const doc = ctx.docs.get(file);
    return doc ? findSection(doc, section)?.prose.trim() ?? '' : '';
  };
  return [take(DOC_PRODUCT, 'problem') || take(DOC_IDEA, 'problem'), take(DOC_PRODUCT, 'value') || take(DOC_IDEA, 'value')].filter(Boolean);
}

function parseRules(service: DiscoverService): Array<{ id: string; text: string; hash: string }> {
  const file = path.join(service.docsRoot(), 'development', 'PROJECT_RULES.md');
  if (!fs.existsSync(file)) { return []; }
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const rules: Array<{ id: string; text: string; hash: string }> = [];
  for (const line of lines) {
    const match = /^-\s+\*\*([A-Z][A-Z0-9_-]*-\d+)\*\*\s*[—–-]?\s*(.*)$/u.exec(line);
    if (!match) { continue; }
    const value = { id: match[1]!, text: match[2]!.trim() };
    rules.push({ ...value, hash: hashObject(value) });
  }
  return rules;
}

function safeStack(root: string): DiscoverPublishedContext['stack'] {
  try {
    const profile = detectStack(root);
    return profile.stack
      ? { kind: profile.repositoryKind, stackId: profile.stack.id, confidence: profile.confidence }
      : { kind: profile.repositoryKind, confidence: profile.confidence, reason: profile.closed?.reason };
  } catch (error) {
    return { kind: 'unknown', reason: error instanceof Error ? error.message : String(error) };
  }
}

function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

function compactEntity(entity: DiscoverContextEntity, maxCharsPerField: number): DiscoverContextEntity {
  const fields = Object.fromEntries(Object.entries(entity.fields).map(([name, values]) => [
    name,
    values.map((value) => value.length > maxCharsPerField ? `${value.slice(0, Math.max(0, maxCharsPerField - 1))}…` : value),
  ]));
  return { ...entity, fields };
}

export class DiscoverContextPublisher {
  readonly service: DiscoverService;

  constructor(readonly workspaceRoot: string, private readonly catalogRoot = builtinCofofoCatalogRoot()) {
    this.service = new DiscoverService(workspaceRoot);
  }

  private absolute(relative: string): string { return path.join(this.workspaceRoot, relative); }
  private publishedFile(): string { return this.absolute(DISCOVER_PUBLISHED_CONTEXT_PATH); }
  private revisionFile(revision: string): string { return this.absolute(`${DISCOVER_HISTORY_REVISIONS_DIR}/${revision}.json`); }
  private contextPackFile(packHash: string): string { return this.absolute(`${DISCOVER_CONTEXT_PACKS_DIR}/${packHash}.json`); }
  private objectFile(contentHash: string): string { return this.absolute(`${DISCOVER_OBJECTS_DIR}/${contentHash.replace(/^sha256:/, '')}.json`); }

  loadPublished(): DiscoverPublishedContext | null {
    const context = readJson<DiscoverPublishedContext>(this.publishedFile());
    return context?.schemaVersion === 1 && context.status === 'ready' ? context : null;
  }

  /** Read-only migration inventory. It never treats legacy prose as canonical. */
  previewLegacyMigration(): DiscoverLegacyMigrationPreview {
    const context = this.loadPublished();
    const sources = legacyMigrationSources(this.workspaceRoot);
    return {
      schemaVersion: 1,
      generated: true,
      doNotEdit: true,
      inputHash: hashObject(sources),
      sources,
      discoverInitialized: this.service.exists(),
      ...(context ? { publishedRevision: context.discoverRevision } : {}),
      warnings: sources.length === 0
        ? ['No legacy Foundation or Epic INTENT/REQUIREMENT artifacts were found.']
        : ['Legacy prose is inventoried for human review; missing canonical fields are never inferred automatically.'],
    };
  }

  /**
   * Explicit, idempotent migration entry point for old Foundation/Epic trees.
   * It creates only a planned Discover skeleton and a baseline revision. The
   * original files remain untouched, and ambiguous prose stays in the
   * generated inventory rather than being copied into editable requirements.
   */
  migrateLegacy(input: { confirm: boolean; reason?: string }): DiscoverLegacyMigrationResult {
    if (!input.confirm) { throw new DiscoverContextPublishError('Legacy Discover migration requires confirm: true. Preview is read-only.'); }
    const preview = this.previewLegacyMigration();
    const createdDiscover = !this.service.exists();
    if (createdDiscover) {
      this.service.init({
        seedSentence: 'Legacy project migration — review and complete canonical Discover documents.',
        actor: { kind: 'system', id: 'discover-migration' },
      });
    }
    const existing = this.loadPublished();
    const context = existing ?? this.publish({
      actor: { kind: 'migration', id: 'discover-migration' },
      reason: input.reason?.trim() || 'Create a migration baseline; legacy sources were inventoried for review.',
      source: { command: 'Discover Context migration' },
    });
    const state = sourceState(this.workspaceRoot);
    writeJson(this.absolute(DISCOVER_MIGRATION_INVENTORY_PATH), {
      ...preview,
      discoverRevision: context.discoverRevision,
      sourceCommit: state.sourceCommit,
      sourceTreeHash: state.sourceTreeHash,
    });
    return {
      inventoryPath: DISCOVER_MIGRATION_INVENTORY_PATH,
      context,
      createdDiscover,
      createdBaseline: !existing,
    };
  }

  inspect(): DiscoverContextInspection {
    if (!this.service.exists()) {
      return { status: 'missing', context: null, issues: [], nextAction: 'Initialize Discover first.' };
    }
    const index = this.service.require();
    const ctx = this.service.readBlueprint(index);
    const issues = [...this.service.validate(ctx), ...detailIssues(entitiesFrom(ctx))];
    const context = this.loadPublished();
    if (!context) {
      return { status: 'draft', context: null, issues, nextAction: 'Publish Context from Discover after resolving blocking validation.' };
    }
    const documents = allDocPaths().map((docPath) => ({ path: docPath, hash: hashObject(docContent(this.service, docPath)) }));
    const state = sourceState(this.workspaceRoot);
    const canonicalHash = hashObject({ blueprint: { id: index.id, revision: index.revision, docsRoot: index.docsRoot }, documents, entities: entitiesFrom(ctx), rules: parseRules(this.service), sourceTreeHash: state.sourceTreeHash });
    if (canonicalHash !== context.canonicalHash) {
      return { status: 'stale', context, issues, nextAction: 'Discover changed after the last Publish Context. Publish a new revision.' };
    }
    const blockers = issues.filter((issue) => issue.level === 'error');
    return blockers.length
      ? { status: 'conflict', context, issues, nextAction: 'Resolve blocking Discover validation before handing work off.' }
      : { status: 'ready', context, issues, nextAction: 'Context is ready for a Feature or Bugfix task.' };
  }

  publish(input: {
    actor: ActorRef | { kind: 'migration'; id: string };
    reason: string;
    source?: DiscoverHistoryEvent['source'];
    now?: string;
  }): DiscoverPublishedContext {
    if (!this.service.exists()) { throw new DiscoverNotInitializedError(); }
    if (!input.reason.trim()) { throw new DiscoverContextPublishError('Publish Context requires a change reason.'); }
    const index = this.service.require();
    const ctx = this.service.readBlueprint(index);
    const entities = entitiesFrom(ctx);
    const issues = [...this.service.validate(ctx), ...detailIssues(entities)];
    const blockers = issues.filter((issue) => issue.level === 'error');
    if (blockers.length) {
      throw new DiscoverContextPublishError('Discover Context has blocking validation issues.', blockers);
    }
    const previous = this.loadPublished();
    const documents = allDocPaths().map((docPath) => ({ path: docPath, hash: hashObject(docContent(this.service, docPath)) }));
    const source = sourceState(this.workspaceRoot);
    const rules = parseRules(this.service);
    const codeIndexDraft = buildCodeIndexDraft(this.workspaceRoot, this.service, ctx, entities, source);
    const canonicalHash = hashObject({
      blueprint: { id: index.id, revision: index.revision, docsRoot: index.docsRoot }, documents, entities, rules, sourceTreeHash: source.sourceTreeHash,
    });
    if (previous?.canonicalHash === canonicalHash) { return previous; }
    const discoverRevision = `DREV-${canonicalHash.replace(/^sha256:/, '').slice(0, 12)}`;
    const publishedAt = input.now ?? new Date().toISOString();
    const draft = {
      schemaVersion: 1 as const,
      generated: true as const,
      doNotEdit: true as const,
      inputHash: canonicalHash,
      status: 'ready' as const,
      discoverRevision,
      parentRevision: previous?.discoverRevision ?? null,
      canonicalHash,
      blueprint: { id: index.id, revision: index.revision, title: index.title, docsRoot: index.docsRoot },
      publishedAt,
      actor: input.actor,
      source: input.source,
      ...source,
      documents,
      entities,
      stack: safeStack(this.workspaceRoot),
      rules,
    };
    const context: DiscoverPublishedContext = { ...draft, contextHash: hashObject(draft) };
    this.installEccBundle(context.contextHash);
    const before = new Map((previous?.entities ?? []).map((entity) => [entity.id, entity]));
    const events: DiscoverHistoryEvent[] = entities.flatMap((entity) => {
      const old = before.get(entity.id);
      if (old?.contentHash === entity.contentHash) { return []; }
      const type: DiscoverHistoryEvent['changeType'] = !old
        ? 'created'
        : entity.status === 'deprecated' ? 'deprecated'
          : JSON.stringify(old.references) !== JSON.stringify(entity.references) ? 'relinked'
            : 'updated';
      return [{
        discoverRevision,
        parentRevision: previous?.discoverRevision ?? null,
        publishedAt,
        actor: input.actor,
        source: input.source,
        entityType: entity.kind,
        entityId: entity.id,
        changeType: type,
        changedFields: old ? changedFields(old, entity) : ['*'],
        beforeHash: old?.contentHash ?? null,
        afterHash: entity.contentHash,
        summary: `${type} ${entity.id}`,
        reason: input.reason.trim(),
        breaking: old?.status === 'ready' && entity.status === 'deprecated',
      }];
    });
    const revision = { ...context, events };
    // Objects are immutable snapshots keyed by entity content hash. They make
    // history/recovery possible without another editable Markdown copy.
    for (const entity of entities) {
      const objectFile = this.absolute(`${DISCOVER_OBJECTS_DIR}/${entity.contentHash.replace(/^sha256:/, '')}.json`);
      if (!fs.existsSync(objectFile)) { writeJson(objectFile, entity); }
    }
    writeJson(this.revisionFile(discoverRevision), revision);
    writeJson(this.absolute(`${DISCOVER_HISTORY_DIR}/index.json`), {
      schemaVersion: 1,
      generated: true,
      doNotEdit: true,
      discoverRevision,
      sourceCommit: source.sourceCommit,
      sourceTreeHash: source.sourceTreeHash,
      inputHash: hashObject(events),
      latestRevision: discoverRevision,
      revisions: [discoverRevision, ...(readJson<{ revisions?: string[] }>(this.absolute(`${DISCOVER_HISTORY_DIR}/index.json`))?.revisions ?? []).filter((id) => id !== discoverRevision)],
    });
    writeJson(this.absolute(DISCOVER_CODE_INDEX_PATH), { ...codeIndexDraft, discoverRevision });
    writeJson(this.absolute(DISCOVER_COMPILED_RULES_PATH), {
      schemaVersion: 1,
      generated: true,
      doNotEdit: true,
      discoverRevision,
      sourceCommit: source.sourceCommit,
      sourceTreeHash: source.sourceTreeHash,
      inputHash: hashObject(rules),
      rules,
    });
    writeJson(this.publishedFile(), context);
    return context;
  }

  /**
   * Best-effort, fully automatic ECC skill bundle install for the detected
   * stack — the replacement for the retired agent-driven, Canvas-reviewed
   * `select-ecc-catalog` / `install-ecc-assets` steps. There is no human
   * review step here by design: Publish Context is meant to be a single,
   * synchronous action. A missing/undetectable stack or an install failure
   * (e.g. an unsafe symlink) must never block publishing Requirements and
   * Features, so failures are swallowed rather than thrown.
   */
  private installEccBundle(contextHash: string): void {
    let profile;
    try { profile = detectStack(this.workspaceRoot); } catch { return; }
    const selection = selectCatalog(profile);
    if (!selection) { return; }
    try {
      const previousInstalled = readJson<{ foundationRevision?: number }>(this.absolute(COFOFO_INSTALLED_ASSETS_PATH));
      const revision = (previousInstalled?.foundationRevision ?? 0) + 1;
      const installed = installCatalog({
        workspaceRoot: this.workspaceRoot,
        profile,
        foundationRevision: revision,
        force: true,
        catalogRoot: this.catalogRoot,
      });
      const binding = buildBundleBinding({ selection, installed, foundationRevision: revision });
      writeJson(this.absolute(COFOFO_BUNDLE_BINDING_PATH), binding);
      const workspacePath = this.absolute('.aidlc/workspace.yaml');
      const current = fs.existsSync(workspacePath)
        ? (yaml.load(fs.readFileSync(workspacePath, 'utf8')) as Partial<WorkspaceConfig>)
        : undefined;
      const skeleton = generatedCofofoWorkspace(current);
      const composed = composeWorkspaceFromBundle({ workspaceRoot: this.workspaceRoot, skeleton, binding, installed });
      writeFileAtomic(workspacePath, yaml.dump(composed, { lineWidth: -1, noRefs: true, sortKeys: false }));
      installCofofoProviderCommands(this.workspaceRoot, composed, contextHash);
    } catch {
      // Swallow: ECC bundle install is supplementary, never a Publish blocker.
    }
  }

  createContextPack(input: {
    taskKind: 'feature' | 'bugfix';
    phaseId?: string;
    bugScopeId?: string;
    maxTokens?: number;
    now?: string;
  }): DiscoverContextPack {
    const inspection = this.inspect();
    if (inspection.status !== 'ready' || !inspection.context) {
      throw new DiscoverContextPublishError('Discover Context is not READY. Publish Context before creating a delivery task.', inspection.issues);
    }
    const context = inspection.context;
    const ctx = this.service.readBlueprint();
    const phase = input.phaseId ? getPhase(ctx, input.phaseId) : undefined;
    if (input.phaseId && !phase) { throw new DiscoverContextPublishError(`Phase ${input.phaseId} does not exist.`); }
    const byId = new Map(context.entities.map((entity) => [entity.id, entity]));
    const requested = new Set<string>(phase?.cites.map((cite) => cite.id) ?? []);
    if (input.bugScopeId) { requested.add(input.bugScopeId); }
    const queue = [...requested];
    while (queue.length) {
      const id = queue.shift()!;
      for (const ref of byId.get(id)?.references ?? []) {
        if (!requested.has(ref) && byId.has(ref)) { requested.add(ref); queue.push(ref); }
      }
    }
    const selected = [...requested].map((id) => byId.get(id)).filter((entity): entity is DiscoverContextEntity => !!entity);
    const nonReady = selected.filter((entity) => entity.status !== 'ready' && entity.status !== 'deprecated');
    if (phase && nonReady.length) {
      throw new DiscoverContextPublishError(`${phase.id} cites entities that are not Ready: ${nonReady.map((entity) => entity.id).join(', ')}.`);
    }
    const maxTokens = input.maxTokens ?? 3000;
    let entities = selected.map((entity) => compactEntity(entity, 700));
    const phaseData = phase && {
      id: phase.id, title: phase.title, goal: phase.goal,
      dependsOn: phase.dependsOn, deliverables: phase.deliverables, definitionOfDone: phase.definitionOfDone,
    };
    let draft = {
      schemaVersion: 1 as const,
      generated: true as const,
      doNotEdit: true as const,
      inputHash: '',
      taskKind: input.taskKind,
      contextRef: {
        discoverRevision: context.discoverRevision,
        contextHash: context.contextHash,
        ...(input.phaseId ? { phaseId: input.phaseId } : {}),
        ...(input.bugScopeId ? { bugScopeId: input.bugScopeId } : {}),
        packHash: '',
        sourceCommit: context.sourceCommit,
        sourceTreeHash: context.sourceTreeHash,
        dirty: context.dirty,
      },
      ...(phaseData ? { phase: phaseData } : {}),
      entities,
      productSummary: productSummary(ctx),
      rules: context.rules.map(({ id, text }) => ({ id, text })),
      sourcePaths: (() => {
        const index = readJson<DiscoverCodeIndex>(this.absolute(DISCOVER_CODE_INDEX_PATH));
        if (index?.discoverRevision !== context.discoverRevision) { return []; }
        const wanted = new Set(entities.map((entity) => entity.id));
        return [...new Set(index.entries
          .filter((entry) => wanted.has(entry.id))
          .flatMap((entry) => [...entry.paths, ...entry.testPaths, ...entry.entryPoints]))].sort();
      })(),
      estimatedTokens: 0,
      generatedAt: input.now ?? new Date().toISOString(),
    };
    draft = { ...draft, inputHash: hashObject({ ...draft, inputHash: undefined, generatedAt: undefined, estimatedTokens: undefined, contextRef: { ...draft.contextRef, packHash: '' } }) };
    if (estimateTokens(draft) > maxTokens) {
      entities = selected.map((entity) => compactEntity(entity, 220));
      draft = { ...draft, entities, productSummary: draft.productSummary.map((line) => line.slice(0, 350)), rules: draft.rules.map((rule) => ({ ...rule, text: rule.text.slice(0, 160) })) };
    }
    draft = { ...draft, inputHash: hashObject({ ...draft, inputHash: undefined, generatedAt: undefined, estimatedTokens: undefined, contextRef: { ...draft.contextRef, packHash: '' } }) };
    const stable = { ...draft, generatedAt: undefined, estimatedTokens: undefined, contextRef: { ...draft.contextRef, packHash: '' } };
    const packHash = hashObject(stable);
    const pack: DiscoverContextPack = {
      ...draft,
      contextRef: { ...draft.contextRef, packHash },
      estimatedTokens: estimateTokens({ ...draft, contextRef: { ...draft.contextRef, packHash } }),
    };
    const file = this.contextPackFile(packHash.replace(/^sha256:/, ''));
    if (!fs.existsSync(file)) { writeJson(file, pack); }
    return pack;
  }

  contextPackPath(packHash: string): string {
    return `${DISCOVER_CONTEXT_PACKS_DIR}/${packHash.replace(/^sha256:/, '')}.json`;
  }

  loadContextPack(relativePath: string): DiscoverContextPack | null {
    const normalized = relativePath.replace(/\\/g, '/');
    if (!normalized.startsWith(`${DISCOVER_CONTEXT_PACKS_DIR}/`) || normalized.includes('..')) { return null; }
    const pack = readJson<DiscoverContextPack>(this.absolute(normalized));
    return pack?.schemaVersion === 1 ? pack : null;
  }

  /** Append-only history for one requirement or feature, newest first. */
  historyFor(entityId: string): DiscoverHistoryEvent[] {
    const index = readJson<{ revisions?: string[] }>(this.absolute(`${DISCOVER_HISTORY_DIR}/index.json`));
    const events: DiscoverHistoryEvent[] = [];
    for (const revision of index?.revisions ?? []) {
      const snapshot = readJson<{ events?: DiscoverHistoryEvent[] }>(this.revisionFile(revision));
      for (const event of snapshot?.events ?? []) {
        if (event.entityId === entityId) { events.push(event); }
      }
    }
    return events.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }

  /** Read-only before/after snapshots for the Discover history dialog. */
  historyDetailsFor(entityId: string): DiscoverHistoryDetail[] {
    const load = (contentHash: string | null): Pick<DiscoverContextEntity, 'title' | 'status' | 'fields'> | undefined => {
      if (!contentHash) { return undefined; }
      const raw = readJson<DiscoverContextEntity>(this.objectFile(contentHash));
      if (!raw || typeof raw.title !== 'string' || !raw.fields) { return undefined; }
      return { title: raw.title, status: raw.status, fields: raw.fields };
    };
    return this.historyFor(entityId).map((event) => {
      const before = load(event.beforeHash);
      const after = load(event.afterHash);
      return { event, ...(before ? { before } : {}), ...(after ? { after } : {}) };
    });
  }
}
