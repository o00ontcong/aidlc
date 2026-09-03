/**
 * Docs ↔ code reconciliation for the Discover "Kiểm tra" panel.
 *
 * Each finding becomes a pre-filled epic suggestion the user can start with
 * one click — no wizard fields to fill. Pure functions over blueprint context
 * plus a filesystem walk of declared source repos.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { CofofoRecipeId, DiscoverIndex, DiscoverScope } from '../contracts/discover';
import {
  DOC_FEATURES,
  DOC_IMPLEMENTATION_PLAN,
  DOC_MODULES,
  DOC_PROJECT_STRUCTURE,
  DOC_REQUIREMENTS,
  DOC_SKELETON,
  DOC_TECH_STACK,
  DOC_USER_FLOWS,
} from './DocSpec';
import { extractIds, findSection, type DocRecord } from './mdParse';
import { validateBlueprint, type BlueprintContext, type ValidationIssue } from './validate';
import { CofofoFoundationService } from '../cofofo/FoundationService';
import { listPhases, renderBootstrapIntent, isSkeletonPhase } from './handoff';
import { EXCLUDED_DIRS } from './sourceScope';

const EXCLUDED = new Set(EXCLUDED_DIRS);
const SOURCE_EXT = /\.(ts|tsx|js|jsx|swift|kt|java|go|rs|py|rb|cs|php|dart|m|mm|c|cc|cpp|h|vue|svelte)$/i;

export type EpicSuggestionKind =
  | 'no-skeleton'
  | 'not-implemented'
  | 'docs-stale'
  | 'undocumented'
  | 'doc-gap';

export interface EpicSuggestion {
  id: string;
  kind: EpicSuggestionKind;
  recipeId: CofofoRecipeId;
  title: string;
  description: string;
  /** Pre-rendered INTENT.md body — ready for scaffoldEpic. */
  brief: string;
  summary: string;
  details: string[];
  level: 'error' | 'warn' | 'info';
  featureId?: string;
  phaseId?: string;
  docFile?: string;
}

export interface EpicSuggestionInput {
  workspaceRoot: string;
  ctx: BlueprintContext;
  index: DiscoverIndex;
  scope?: DiscoverScope;
  /** Skip when foundation is already ready — set false in tests. */
  checkFoundation?: boolean;
}

interface FeatureEntry {
  id: string;
  text: string;
}

interface ModuleEntry {
  id: string;
  title: string;
  responsibility: string;
  folder: string;
  cites: string[];
}

export interface PhaseWorkStatus {
  phaseId: string;
  alreadyBuilt: boolean;
  matchedFiles: string[];
  tokens: string[];
  missingFeatureIds: string[];
  scannedFileCount: number;
}

/** Docs ↔ code status on a Discover item. No source ⇒ everything is `missing`. */
export type DiscoverItemCoverageStatus = 'in-code' | 'missing' | 'stale';

export type DiscoverCoverageKind = 'fr' | 'feature' | 'screen';

export interface DiscoverCoveredItem {
  id: string;
  kind: DiscoverCoverageKind;
  text: string;
  status: DiscoverItemCoverageStatus;
  /** Feature group (`VIDEO`) or `Screens`. */
  group: string;
  coveringFeatureIds: string[];
  coveredFrIds: string[];
  matchedFiles: string[];
}

export interface DiscoverItemCoverage {
  sourceFileCount: number;
  items: DiscoverCoveredItem[];
  counts: { inCode: number; missing: number; stale: number };
}

function sectionItems(ctx: BlueprintContext, file: string, sectionKey: string): FeatureEntry[] {
  const doc = ctx.docs.get(file);
  const section = doc ? findSection(doc, sectionKey) : undefined;
  if (!section) { return []; }
  return [
    ...section.items.map((i) => ({ id: i.id, text: i.text })),
    ...section.records.map((r) => ({
      id: r.id,
      text: r.title || r.fields.map((f) => `${f.label}: ${f.value}`).join(' · '),
    })),
  ];
}

function recordField(record: DocRecord, label: string): string {
  const found = record.fields.find((f) => f.label.toLowerCase() === label.toLowerCase());
  if (!found) { return ''; }
  return found.value.trim() || found.items.join('; ');
}

function listModules(ctx: BlueprintContext): ModuleEntry[] {
  const doc = ctx.docs.get(DOC_MODULES);
  const section = doc ? findSection(doc, 'modules') : undefined;
  if (!section) { return []; }
  return section.records.map((record) => {
    const body = [record.title, ...record.fields.flatMap((f) => [f.value, ...f.items])].join(' ');
    return {
      id: record.id,
      title: record.title,
      responsibility: recordField(record, 'Responsibility'),
      folder: recordField(record, 'Folder'),
      cites: extractIds(body),
    };
  });
}

function prose(ctx: BlueprintContext, file: string, sectionKey: string): string {
  const doc = ctx.docs.get(file);
  const section = doc ? findSection(doc, sectionKey) : undefined;
  return section?.prose.trim() ?? '';
}

function featureGroup(id: string): string {
  const parts = id.split('-');
  if (parts.length >= 3 && parts[0] === 'F') { return parts[1]!.toLowerCase(); }
  return id.replace(/^F-?/i, '').toLowerCase();
}

function foldVi(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Vietnamese / product phrases → path tokens that actually appear in source trees. */
const WORD_ALIASES: { match: RegExp; tokens: string[] }[] = [
  { match: /dang\s*nhap|\blogin\b|sign[\s-]?in/i, tokens: ['login', 'signin'] },
  { match: /attestation/i, tokens: ['attestation'] },
  { match: /thiet\s*bi/i, tokens: ['device'] },
  { match: /\bmfa\b|\b2fa\b|\btotp\b|xac thuc hai/i, tokens: ['mfa', 'totp'] },
  { match: /push/i, tokens: ['push'] },
  { match: /profile|ho\s*so/i, tokens: ['profile'] },
];

function searchTokens(id: string, text: string): string[] {
  const tokens = new Set<string>();
  const group = featureGroup(id);
  if (group.length >= 4 && /[a-z]/.test(group)) { tokens.add(group); }
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= 4) { tokens.add(word); }
  }
  const folded = foldVi(`${id} ${text}`);
  for (const alias of WORD_ALIASES) {
    if (alias.match.test(folded) || alias.match.test(text)) {
      for (const t of alias.tokens) { tokens.add(t); }
    }
  }
  return [...tokens].filter(Boolean);
}

function pathHasToken(file: string, token: string): boolean {
  const lower = file.toLowerCase().replace(/\\/g, '/');
  if (token.length >= 6) { return lower.includes(token); }
  return lower.split(/[^a-z0-9]+/).includes(token);
}

function walkSourceFiles(absRoot: string, relPrefix: string, out: string[], limit: number): void {
  if (out.length >= limit) { return; }
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(absRoot, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (out.length >= limit) { return; }
    if (EXCLUDED.has(entry.name) || entry.name.startsWith('.')) { continue; }
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    const abs = path.join(absRoot, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(abs, rel, out, limit);
    } else if (SOURCE_EXT.test(entry.name)) {
      out.push(rel);
    }
  }
}

function allSourceFiles(workspaceRoot: string, scope?: DiscoverScope): string[] {
  const repos = scope?.repos?.length ? scope.repos : [{ path: '.', name: path.basename(workspaceRoot), kind: '' }];
  const out: string[] = [];
  for (const repo of repos) {
    const abs = repo.path === '.' ? workspaceRoot : path.join(workspaceRoot, repo.path);
    walkSourceFiles(abs, repo.path === '.' ? '' : repo.path, out, 8000);
  }
  return out;
}

function pathExists(workspaceRoot: string, rel: string, scope?: DiscoverScope): boolean {
  const repos = scope?.repos?.length ? scope.repos : [{ path: '.', name: '', kind: '' }];
  for (const repo of repos) {
    const base = repo.path === '.' ? workspaceRoot : path.join(workspaceRoot, repo.path);
    const target = path.join(base, rel.replace(/^\.\//, ''));
    if (fs.existsSync(target)) { return true; }
  }
  return false;
}

function looksLikePath(value: string): boolean {
  const inner = value.trim();
  return Boolean(inner) && /[\/.]/.test(inner) && !inner.includes(' ');
}

function extractPaths(text: string): string[] {
  const paths: string[] = [];
  const backtick = text.match(/`([^`]+)`/g);
  if (backtick) {
    for (const m of backtick) {
      const inner = m.slice(1, -1).trim();
      if (looksLikePath(inner)) { paths.push(inner); }
    }
  }
  for (const m of text.match(/\b(?:src|packages|lib|app|internal|cmd|api|tests?)\/[\w./-]+/gi) ?? []) {
    paths.push(m);
  }
  if (looksLikePath(text)) { paths.push(text.trim()); }
  return [...new Set(paths)];
}

function foldersForModule(mod: ModuleEntry, mappings: FeatureEntry[]): string[] {
  const fromMap = mappings
    .filter((m) => extractIds(m.text).includes(mod.id) || m.text.includes(mod.id))
    .flatMap((m) => extractPaths(m.text));
  return [...new Set([
    ...extractPaths(mod.folder),
    ...extractPaths(mod.responsibility),
    ...extractPaths(mod.title),
    ...fromMap,
  ])].filter(Boolean);
}

function folderHasSource(workspaceRoot: string, rel: string, scope?: DiscoverScope): boolean {
  const repos = scope?.repos?.length ? scope.repos : [{ path: '.', name: '', kind: '' }];
  for (const repo of repos) {
    const base = repo.path === '.' ? workspaceRoot : path.join(workspaceRoot, repo.path);
    const target = path.join(base, rel.replace(/^\.\//, ''));
    try {
      if (!fs.existsSync(target)) { continue; }
      const stat = fs.statSync(target);
      if (stat.isFile()) { return SOURCE_EXT.test(target); }
      if (stat.isDirectory()) {
        const files: string[] = [];
        walkSourceFiles(target, '', files, 8);
        if (files.length > 0) { return true; }
      }
    } catch {
      continue;
    }
  }
  return false;
}

function skeletonPaths(ctx: BlueprintContext): string[] {
  const doc = ctx.docs.get(DOC_SKELETON);
  const section = doc ? findSection(doc, 'files') : undefined;
  if (!section) { return []; }
  return section.items.flatMap((i) => extractPaths(i.text));
}

function foundationReady(workspaceRoot: string): boolean {
  try {
    return new CofofoFoundationService(workspaceRoot).inspect().status === 'ready';
  } catch {
    return false;
  }
}

function matchFilesForFeature(
  feature: FeatureEntry,
  modules: ModuleEntry[],
  mappings: FeatureEntry[],
  sourceFiles: string[],
): string[] {
  const tokens = searchTokens(feature.id, feature.text);
  const linked = modules.filter((m) =>
    m.cites.includes(feature.id) || tokens.some((t) => m.title.toLowerCase().includes(t) || m.folder.toLowerCase().includes(t)),
  );
  const modulePaths = linked.flatMap((m) => foldersForModule(m, mappings));

  const hits = new Set<string>();
  for (const file of sourceFiles) {
    const lower = file.toLowerCase();
    if (tokens.some((t) => pathHasToken(file, t))) { hits.add(file); }
    if (modulePaths.some((p) => lower.includes(p.replace(/^\.\//, '').toLowerCase()))) { hits.add(file); }
  }
  return [...hits];
}

function featureHits(
  feature: FeatureEntry,
  modules: ModuleEntry[],
  mappings: FeatureEntry[],
  sourceFiles: string[],
  workspaceRoot: string,
  scope?: DiscoverScope,
): string[] {
  const matched = matchFilesForFeature(feature, modules, mappings, sourceFiles);
  if (matched.length > 0) { return matched; }
  const extra: string[] = [];
  for (const mod of modulesForFeature(feature.id, modules)) {
    for (const folder of foldersForModule(mod, mappings)) {
      if (folderHasSource(workspaceRoot, folder, scope)) { extra.push(folder); }
    }
  }
  return extra;
}

function phaseCodeHits(
  phase: ReturnType<typeof listPhases>[number],
  modules: ModuleEntry[],
  mappings: FeatureEntry[],
  sourceFiles: string[],
  workspaceRoot: string,
  scope?: DiscoverScope,
): { tokens: string[]; files: string[] } {
  const tokens = searchTokens(phase.id, `${phase.title} ${phase.goal} ${phase.deliverables.join(' ')}`);
  const files = new Set<string>();
  for (const file of sourceFiles) {
    if (tokens.some((t) => pathHasToken(file, t))) { files.add(file); }
  }
  for (const mod of modules) {
    const blob = foldVi(`${mod.title} ${mod.folder} ${mod.responsibility}`);
    if (!tokens.some((t) => blob.includes(t) || foldVi(mod.title).includes(t))) { continue; }
    for (const folder of foldersForModule(mod, mappings)) {
      if (folderHasSource(workspaceRoot, folder, scope)) { files.add(folder); }
    }
  }
  return { tokens, files: [...files] };
}

function modulesForFeature(featureId: string, modules: ModuleEntry[]): ModuleEntry[] {
  return modules.filter((m) => m.cites.includes(featureId));
}

function renderBrief(args: {
  index: DiscoverIndex;
  title: string;
  goal: string;
  deliverables: string[];
  definitionOfDone: string[];
  context?: string[];
  diff?: string[];
  cites?: { id: string; text: string }[];
}): string {
  const lines: string[] = [
    `# ${args.title}`,
    '',
    `- **Blueprint:** ${args.index.id} — ${args.index.title}`,
    `- **Blueprint revision:** ${args.index.revision}`,
    `- **Source:** Kiểm tra (docs ↔ code)`,
    '',
    '## Goal',
    '',
    args.goal,
    '',
    '## Deliverables',
    '',
    ...(args.deliverables.length ? args.deliverables.map((d) => `- ${d}`) : ['_(none)_']),
    '',
    '## Definition of done',
    '',
    ...(args.definitionOfDone.length ? args.definitionOfDone.map((d) => `- ${d}`) : ['_(none)_']),
    '',
  ];
  if (args.cites?.length) {
    lines.push('## In scope', '');
    for (const c of args.cites) { lines.push(`- **${c.id}** — ${c.text}`); }
    lines.push('');
  }
  if (args.diff?.length) {
    lines.push('## Docs vs code', '');
    for (const d of args.diff) { lines.push(`- ${d}`); }
    lines.push('');
  }
  if (args.context?.length) {
    lines.push('## Context', '');
    for (const c of args.context) { lines.push(`- ${c}`); }
    lines.push('');
  }
  lines.push(
    '---',
    '',
    '_Snapshot taken when this epic was created from Kiểm tra. Editing the blueprint afterwards does not change this file._',
    '',
  );
  return lines.join('\n');
}

function docGapSuggestion(issue: ValidationIssue, index: DiscoverIndex, ctx: BlueprintContext): EpicSuggestion | null {
  if (issue.code === 'not-covered' && issue.id?.startsWith('F-')) {
    const features = sectionItems(ctx, DOC_FEATURES, 'features');
    const feature = features.find((f) => f.id === issue.id);
    const goal = `Implement and schedule feature ${issue.id} which is declared in docs but not covered in ${issue.file ?? 'downstream documents'}.`;
    return {
      id: `gap-${issue.id}`,
      kind: 'doc-gap',
      recipeId: 'cofofo-feature',
      title: `${issue.id} — ${feature?.text.slice(0, 60) || 'Feature chưa được lên kế hoạch'}`,
      description: issue.message,
      summary: issue.message,
      details: [`Feature khai báo tại \`${DOC_FEATURES}\` nhưng chưa xuất hiện trong \`${issue.file ?? DOC_IMPLEMENTATION_PLAN}\`.`],
      level: 'warn',
      featureId: issue.id,
      docFile: issue.file,
      brief: renderBrief({
        index,
        title: `${issue.id} — Implement feature`,
        goal,
        deliverables: [feature?.text ?? issue.id, `Cập nhật ${issue.file ?? DOC_IMPLEMENTATION_PLAN} với phase phù hợp.`],
        definitionOfDone: ['Feature hoạt động theo mô tả trong FEATURES.md', 'Implementation Plan phản ánh feature này'],
        cites: feature ? [{ id: feature.id, text: feature.text }] : undefined,
      }),
    };
  }
  if (issue.code === 'dangling-ref' && issue.id) {
    return {
      id: `dangling-${issue.id}-${issue.file ?? 'doc'}`,
      kind: 'doc-gap',
      recipeId: 'cofofo-feature',
      title: `Sửa tham chiếu — ${issue.id}`,
      description: issue.message,
      summary: issue.message,
      details: [`Mục \`${issue.id}\` trong \`${issue.file ?? '?'}\` trích dẫn ID không tồn tại.`],
      level: 'warn',
      docFile: issue.file,
      brief: renderBrief({
        index,
        title: `Fix dangling reference in ${issue.file ?? 'blueprint'}`,
        goal: `Resolve broken cross-reference: ${issue.message}`,
        deliverables: ['Sửa hoặc bổ sung tài liệu được trích dẫn', 'Đảm bảo ID tồn tại trước khi implement'],
        definitionOfDone: ['Không còn dangling-ref cho mục này', 'Traceability FR → Feature → Phase còn liên tục'],
      }),
    };
  }
  if (issue.code === 'stale-doc' && issue.file) {
    return {
      id: `stale-${issue.file}`,
      kind: 'doc-gap',
      recipeId: 'cofofo-feature',
      title: `Đồng bộ lại — ${issue.file}`,
      description: issue.message,
      summary: issue.message,
      details: [issue.message, 'Tài liệu upstream đã đổi — cần rà soát và cập nhật cho khớp.'],
      level: 'warn',
      docFile: issue.file,
      brief: renderBrief({
        index,
        title: `Reconcile stale doc ${issue.file}`,
        goal: issue.message,
        deliverables: [`Rà soát \`${issue.file}\` so với tài liệu upstream`, 'Cập nhật nội dung cho nhất quán'],
        definitionOfDone: ['Nội dung downstream phản ánh quyết định mới nhất', 'Không còn cảnh báo stale-doc'],
      }),
    };
  }
  return null;
}

function bootstrapCopy(args: {
  skeletonDocReady: boolean;
  skeletonItems: FeatureEntry[];
  missingSk: string[];
  skPathCount: number;
  foundationOk: boolean;
  stackTitles: string[];
  hasTree: boolean;
  filledDocs: string[];
  phaseTitle?: string;
}): { title: string; description: string; summary: string; details: string[] } {
  const preview = args.skeletonItems.slice(0, 4).map((i) => i.id).join(', ');
  const stackPreview = args.stackTitles.slice(0, 4).join(', ');
  const details: string[] = [];

  if (args.filledDocs.length) {
    details.push(`Blueprint Discover: ${args.filledDocs.length} tài liệu đã có nội dung.`);
  }
  if (args.phaseTitle) {
    details.push(`Phase 1: ${args.phaseTitle}`);
  }
  if (args.hasTree) {
    details.push('Cây thư mục: architecture/PROJECT_STRUCTURE.md');
  }
  if (stackPreview) {
    details.push(`Tech stack: ${stackPreview}`);
  }
  if (args.skeletonItems.length) {
    details.push(`${args.skeletonItems.length} mục trong plans/SKELETON.md:`);
    details.push(...args.skeletonItems.slice(0, 12).map((i) => `  • ${i.id}: ${i.text}`));
  }
  if (args.missingSk.length) {
    details.push(
      `${args.missingSk.length}/${args.skPathCount || args.missingSk.length} path chưa có trên disk — epic này tạo chúng:`,
    );
    details.push(...args.missingSk.slice(0, 8).map((p) => `  • \`${p}\``));
  }
  if (!args.foundationOk) {
    details.push(
      'CoFoFo foundation chưa publish — đó là deliverable của cofofo-bootstrap (scan-stack, map-system, publish-context), không phải lỗi Discover.',
    );
  }

  if (args.skeletonDocReady) {
    const bits = [
      args.skeletonItems.length ? `${args.skeletonItems.length} mục SKELETON.md${preview ? ` (${preview})` : ''}` : '',
      args.hasTree ? 'cây thư mục PROJECT_STRUCTURE.md' : '',
      stackPreview ? `stack ${stackPreview}` : '',
      'bootstrap CoFoFo foundation',
    ].filter(Boolean);
    return {
      title: args.phaseTitle
        ? `Dựng Generate Skeleton — ${args.phaseTitle}`
        : 'Dựng Generate Skeleton theo blueprint',
      description: `Dựng skeleton từ blueprint Discover: ${bits.join(' · ')}.`,
      summary: `12 bước Discover đã có spec — tạo file/folder trên disk theo SKELETON.md và PROJECT_STRUCTURE.md, rồi publish CoFoFo foundation.`,
      details: details.length ? details : ['Blueprint đã sẵn sàng để materialize.'],
    };
  }

  return {
    title: 'Dựng Generate Skeleton & Foundation',
    description: args.filledDocs.length
      ? `Blueprint đang có ${args.filledDocs.length} tài liệu nhưng plans/SKELETON.md chưa liệt kê file — epic bootstrap dựng khung tối thiểu rồi publish foundation.`
      : 'Chưa có plans/SKELETON.md — epic bootstrap dựng khung tối thiểu và publish CoFoFo foundation.',
    summary: 'Chưa có danh sách file trong SKELETON.md — nên hoàn thành Discover bước 12, hoặc start epic bootstrap với khung tối thiểu.',
    details: details.length ? details : ['Chưa có plans/SKELETON.md hoặc chưa có mục Files and folders.'],
  };
}

interface WorkspaceScan {
  sourceFiles: string[];
  modules: ModuleEntry[];
  mappings: FeatureEntry[];
  features: FeatureEntry[];
  featureHits: Map<string, string[]>;
  skPaths: string[];
  missingSk: string[];
  skeletonDocReady: boolean;
  skeletonItems: FeatureEntry[];
  foundationOk: boolean;
  needsCodeSkeleton: boolean;
  needsFoundation: boolean;
  phases: ReturnType<typeof listPhases>;
  bootstrapPhase?: ReturnType<typeof listPhases>[number];
  bootstrapHandedOff: boolean;
}

function scanWorkspace(input: EpicSuggestionInput): WorkspaceScan {
  const { workspaceRoot, ctx, index, scope } = input;
  const checkFoundation = input.checkFoundation !== false;
  const sourceFiles = allSourceFiles(workspaceRoot, scope);
  const modules = listModules(ctx);
  const mappings = sectionItems(ctx, DOC_PROJECT_STRUCTURE, 'mapping');
  const features = sectionItems(ctx, DOC_FEATURES, 'features');
  const skPaths = skeletonPaths(ctx);
  const skeletonDocExists = ctx.docs.get(DOC_SKELETON)?.exists ?? false;
  const skeletonItems = [
    ...sectionItems(ctx, DOC_SKELETON, 'files'),
    ...sectionItems(ctx, DOC_SKELETON, 'interfaces'),
    ...sectionItems(ctx, DOC_SKELETON, 'config'),
    ...sectionItems(ctx, DOC_SKELETON, 'tests'),
  ];
  const missingSk = skPaths.filter((p) => !pathExists(workspaceRoot, p, scope));
  const foundationOk = checkFoundation ? foundationReady(workspaceRoot) : true;
  const skeletonDocReady = skeletonDocExists && skeletonItems.length > 0;
  const majorityMissing = skPaths.length > 0 && missingSk.length / skPaths.length > 0.5;
  const greenfieldWithPlan = skeletonDocReady && sourceFiles.length === 0;
  const phases = listPhases(ctx);
  const bootstrapPhase = phases.find((p, i) => isSkeletonPhase(p, i === 0));
  const bootstrapHandedOff = index.handoffs.some((h) =>
    h.recipeId === 'cofofo-bootstrap' || (bootstrapPhase !== undefined && h.phaseId === bootstrapPhase.id),
  );
  const hits = new Map<string, string[]>();
  for (const feature of features) {
    hits.set(feature.id, featureHits(feature, modules, mappings, sourceFiles, workspaceRoot, scope));
  }
  return {
    sourceFiles,
    modules,
    mappings,
    features,
    featureHits: hits,
    skPaths,
    missingSk,
    skeletonDocReady,
    skeletonItems,
    foundationOk,
    needsCodeSkeleton: !skeletonDocReady || majorityMissing || greenfieldWithPlan,
    needsFoundation: !foundationOk,
    phases,
    bootstrapPhase,
    bootstrapHandedOff,
  };
}

function impliedFeaturesForPhase(
  phase: ReturnType<typeof listPhases>[number],
  features: FeatureEntry[],
): FeatureEntry[] {
  const cited = new Set(phase.cites.filter((c) => c.id.startsWith('F-')).map((c) => c.id));
  const haystack = `${phase.title} ${phase.goal} ${phase.deliverables.join(' ')}`.toLowerCase();
  return features.filter((f) => {
    if (cited.has(f.id) || haystack.includes(f.id.toLowerCase())) { return true; }
    const group = featureGroup(f.id);
    return group.length >= 4 && /[a-z]/.test(group) && haystack.includes(group);
  });
}

function phaseAlreadyBuilt(
  phase: ReturnType<typeof listPhases>[number],
  isFirst: boolean,
  scan: WorkspaceScan,
  workspaceRoot: string,
  scope?: DiscoverScope,
): { alreadyBuilt: boolean; matchedFiles: string[]; tokens: string[]; missingFeatureIds: string[] } {
  const titleHits = phaseCodeHits(phase, scan.modules, scan.mappings, scan.sourceFiles, workspaceRoot, scope);

  if (isSkeletonPhase(phase, isFirst)) {
    const filesExist = !scan.needsCodeSkeleton && scan.skPaths.length > 0;
    const sourceExists = scan.sourceFiles.length > 0 && !scan.needsCodeSkeleton;
    if ((filesExist || sourceExists) && scan.foundationOk) {
      return {
        alreadyBuilt: true,
        matchedFiles: scan.skPaths.filter((p) => pathExists(workspaceRoot, p, scope)).slice(0, 8),
        tokens: titleHits.tokens,
        missingFeatureIds: [],
      };
    }
    return { alreadyBuilt: false, matchedFiles: [], tokens: titleHits.tokens, missingFeatureIds: [] };
  }

  const implied = impliedFeaturesForPhase(phase, scan.features);
  const missingFeatureIds = implied.filter((f) => (scan.featureHits.get(f.id) ?? []).length === 0).map((f) => f.id);
  const featureFiles = implied.flatMap((f) => scan.featureHits.get(f.id) ?? []);
  const matchedFiles = [...new Set([...featureFiles, ...titleHits.files])].slice(0, 8);

  if (implied.length > 0 && missingFeatureIds.length === 0) {
    return { alreadyBuilt: true, matchedFiles, tokens: titleHits.tokens, missingFeatureIds: [] };
  }
  const tokenHits = titleHits.tokens.filter((t) => titleHits.files.some((f) => pathHasToken(f, t)));
  const distinctiveTitle = tokenHits.some((t) => t.length >= 8)
    || tokenHits.length >= 2
    || tokenHits.includes('login')
    || tokenHits.includes('signin');
  if (distinctiveTitle && titleHits.files.length > 0) {
    return { alreadyBuilt: true, matchedFiles, tokens: titleHits.tokens, missingFeatureIds };
  }

  const deliverablePaths = phase.deliverables.flatMap((d) => extractPaths(d));
  if (deliverablePaths.length > 0) {
    const present = deliverablePaths.filter((p) => pathExists(workspaceRoot, p, scope) || folderHasSource(workspaceRoot, p, scope));
    if (present.length > 0 && present.length >= Math.ceil(deliverablePaths.length / 2)) {
      return { alreadyBuilt: true, matchedFiles: present.slice(0, 8), tokens: titleHits.tokens, missingFeatureIds };
    }
  }
  return { alreadyBuilt: false, matchedFiles, tokens: titleHits.tokens, missingFeatureIds };
}

/**
 * Mark Implementation Plan phases whose cited features (or skeleton) already
 * exist on disk — those must not be offered as new "implement this" epics.
 */
export function classifyPhaseWork(input: EpicSuggestionInput): PhaseWorkStatus[] {
  const { workspaceRoot, scope } = input;
  const scan = scanWorkspace(input);
  return scan.phases.map((phase, idx) => {
    const { alreadyBuilt, matchedFiles, tokens, missingFeatureIds } = phaseAlreadyBuilt(
      phase, idx === 0, scan, workspaceRoot, scope,
    );
    return {
      phaseId: phase.id,
      alreadyBuilt,
      matchedFiles,
      tokens,
      missingFeatureIds,
      scannedFileCount: scan.sourceFiles.length,
    };
  });
}

/**
 * Compute epic suggestions from blueprint docs, optional source scope, and
 * on-disk code. Doc-only validation issues become suggestions when they imply
 * actionable work.
 */
export function suggestEpics(input: EpicSuggestionInput): EpicSuggestion[] {
  const { workspaceRoot, ctx, index, scope } = input;
  const scan = scanWorkspace(input);
  const suggestions: EpicSuggestion[] = [];
  const {
    sourceFiles, modules, mappings, features, featureHits: hits,
    skPaths, missingSk, skeletonDocReady, skeletonItems, foundationOk,
    needsCodeSkeleton, needsFoundation, phases, bootstrapPhase, bootstrapHandedOff,
  } = scan;

  const needsSkeleton = (needsCodeSkeleton || needsFoundation) && !bootstrapHandedOff;
  const handedOffFeatures = new Set(
    phases
      .filter((p) => index.handoffs.some((h) => h.phaseId === p.id))
      .flatMap((p) => impliedFeaturesForPhase(p, features).map((f) => f.id)),
  );
  const builtFeatures = new Set(
    phases
      .filter((p, i) => phaseAlreadyBuilt(p, i === 0, scan, workspaceRoot, scope).alreadyBuilt)
      .flatMap((p) => impliedFeaturesForPhase(p, features).map((f) => f.id)),
  );

  if (needsSkeleton) {
    const stackRecords = sectionItems(ctx, DOC_TECH_STACK, 'stack');
    const tree = prose(ctx, DOC_PROJECT_STRUCTURE, 'tree');
    const filledDocs = [...ctx.docs.entries()]
      .filter(([, doc]) => doc.exists && doc.sections.some((s) => s.prose.trim() || s.items.length || s.records.length))
      .map(([file]) => file);
    const { description, summary, details, title } = bootstrapCopy({
      skeletonDocReady,
      skeletonItems,
      missingSk,
      skPathCount: skPaths.length,
      foundationOk,
      stackTitles: stackRecords.map((r) => r.text || r.id),
      hasTree: Boolean(tree),
      filledDocs,
      phaseTitle: bootstrapPhase?.title ?? phases[0]?.title,
    });
    suggestions.push({
      id: 'no-skeleton',
      kind: 'no-skeleton',
      recipeId: 'cofofo-bootstrap',
      title,
      description,
      summary,
      details,
      level: skeletonDocReady ? 'info' : 'error',
      phaseId: bootstrapPhase?.id ?? phases[0]?.id,
      docFile: DOC_SKELETON,
      brief: renderBootstrapIntent(ctx, index, {
        missingPaths: missingSk,
        foundationReady: foundationOk,
      }),
    });
  }

  for (const feature of features) {
    const matched = hits.get(feature.id) ?? [];
    const linkedModules = modulesForFeature(feature.id, modules);

    if (matched.length === 0) {
      if (handedOffFeatures.has(feature.id) || builtFeatures.has(feature.id)) { continue; }
      suggestions.push({
        id: `impl-${feature.id}`,
        kind: 'not-implemented',
        recipeId: 'cofofo-feature',
        title: `${feature.id} — Implement`,
        description: feature.text,
        summary: `${feature.id} đã khai báo trong docs nhưng chưa thấy code tương ứng.`,
        details: [
          `Docs: \`${DOC_FEATURES}\` — ${feature.text}`,
          linkedModules.length
            ? `Modules liên quan: ${linkedModules.map((m) => m.id).join(', ')}`
            : 'Chưa có module nào trích dẫn feature này trong MODULES.md.',
          `Đã quét ${sourceFiles.length} file source — không khớp token "${featureGroup(feature.id)}".`,
        ],
        level: 'warn',
        featureId: feature.id,
        brief: renderBrief({
          index,
          title: `${feature.id} — ${feature.text.slice(0, 80)}`,
          goal: `Implement feature ${feature.id} as described in the blueprint.`,
          deliverables: [feature.text, ...linkedModules.map((m) => `Module ${m.id}: ${m.responsibility || m.title}`)],
          definitionOfDone: [
            'Code implement đúng mô tả feature',
            'Test cơ bản pass',
            'MODULES.md / USER_FLOWS.md còn khớp (nếu có)',
          ],
          cites: [{ id: feature.id, text: feature.text }],
          diff: [`Code: (chưa có file khớp)`, `Docs: ${feature.text}`],
        }),
      });
      continue;
    }

    const expectedPaths = linkedModules.flatMap((m) => foldersForModule(m, mappings));
    const missingExpected = expectedPaths.filter((p) => !pathExists(workspaceRoot, p, scope) && !folderHasSource(workspaceRoot, p, scope));
    const docSays = linkedModules.map((m) => `${m.id} (${m.responsibility || m.title})`).join('; ')
      || feature.text;
    const codeSays = matched.slice(0, 6).join(', ') + (matched.length > 6 ? ` (+${matched.length - 6})` : '');

    if (missingExpected.length > 0) {
      const diffLines = [
        `Docs mô tả: ${docSays}`,
        `Code hiện có: ${codeSays}`,
        ...missingExpected.map((p) => `Docs kỳ vọng path \`${p}\` nhưng chưa tồn tại`),
      ];
      suggestions.push({
        id: `stale-${feature.id}`,
        kind: 'docs-stale',
        recipeId: 'cofofo-bugfix',
        title: `${feature.id} — Đồng bộ docs ↔ code`,
        description: `Feature có code một phần nhưng lệch so với docs.`,
        summary: `${feature.id}: code và docs không khớp — cần cập nhật implementation hoặc spec.`,
        details: diffLines,
        level: 'warn',
        featureId: feature.id,
        brief: renderBrief({
          index,
          title: `${feature.id} — Reconcile docs and code`,
          goal: `Align implementation of ${feature.id} with blueprint docs (or update docs if code is authoritative).`,
          deliverables: ['Phân tích chênh lệch docs ↔ code', 'Sửa code hoặc cập nhật docs cho nhất quán'],
          definitionOfDone: ['Docs và code mô tả cùng một hành vi', 'Kiểm tra pass'],
          cites: [{ id: feature.id, text: feature.text }],
          diff: diffLines,
        }),
      });
    }
  }

  for (const mod of modules) {
    const hasFeature = mod.cites.some((id) => id.startsWith('F-') && features.some((f) => f.id === id));
    const matchedMod = matchFilesForFeature(
      { id: mod.id, text: `${mod.title} ${mod.responsibility} ${mod.folder}` },
      [],
      mappings,
      sourceFiles,
    );
    const modFiles = matchedMod.length > 0
      ? matchedMod
      : (mod.folder && folderHasSource(workspaceRoot, mod.folder, scope) ? [mod.folder] : []);
    if (!hasFeature && modFiles.length > 0) {
      suggestions.push({
        id: `undoc-${mod.id}`,
        kind: 'undocumented',
        recipeId: 'cofofo-feature',
        title: `${mod.id} — Bổ sung docs`,
        description: `Module có code (${modFiles.length} file) nhưng chưa liên kết feature trong FEATURES.md.`,
        summary: `${mod.id} tồn tại trong code nhưng chưa có feature tương ứng trong docs.`,
        details: [
          `Module: ${mod.title} — ${mod.responsibility || '(no responsibility)'}`,
          `Code: ${modFiles.slice(0, 5).join(', ')}${modFiles.length > 5 ? '…' : ''}`,
          `Docs: chưa có F-* nào trích dẫn ${mod.id}.`,
        ],
        level: 'info',
        brief: renderBrief({
          index,
          title: `${mod.id} — Document existing module`,
          goal: `Add or update FEATURES.md (and related docs) to cover module ${mod.id} that already exists in code.`,
          deliverables: [
            `Feature mới cho ${mod.title}`,
            'Cập nhật USE_CASES / USER_FLOWS nếu cần',
            `Giữ MODULES.md (${mod.id}) làm nguồn truth`,
          ],
          definitionOfDone: ['Feature F-* mới trích dẫn module', 'Traceability đầy đủ'],
          diff: [`Code có: ${modFiles.join(', ')}`, 'Docs: thiếu feature tương ứng'],
        }),
      });
    }
  }

  const docIssues = validateBlueprint(ctx, index);
  for (const issue of docIssues) {
    if (issue.code === 'duplicate-id' || issue.code === 'id-shape' || issue.code === 'unparsed-line') { continue; }
    const gap = docGapSuggestion(issue, index, ctx);
    if (!gap) { continue; }
    if (gap.featureId && suggestions.some((s) => s.featureId === gap.featureId && s.kind !== 'doc-gap')) { continue; }
    if (!suggestions.some((s) => s.id === gap.id)) { suggestions.push(gap); }
  }

  return suggestions;
}

/** Lookup a suggestion by id — used when the webview confirms a one-click start. */
export function findEpicSuggestion(input: EpicSuggestionInput, suggestionId: string): EpicSuggestion | undefined {
  return suggestEpics(input).find((s) => s.id === suggestionId);
}

function codeStatus(
  entry: FeatureEntry,
  scan: WorkspaceScan,
  workspaceRoot: string,
  scope: DiscoverScope | undefined,
): { status: DiscoverItemCoverageStatus; matched: string[] } {
  if (scan.sourceFiles.length === 0) { return { status: 'missing', matched: [] }; }
  const matched = featureHits(entry, scan.modules, scan.mappings, scan.sourceFiles, workspaceRoot, scope);
  if (matched.length === 0) { return { status: 'missing', matched: [] }; }
  const expectedPaths = modulesForFeature(entry.id, scan.modules)
    .flatMap((m) => foldersForModule(m, scan.mappings));
  const missingExpected = expectedPaths.filter((p) =>
    !pathExists(workspaceRoot, p, scope) && !folderHasSource(workspaceRoot, p, scope),
  );
  return { status: missingExpected.length > 0 ? 'stale' : 'in-code', matched: matched.slice(0, 6) };
}

function frStatusFrom(covering: DiscoverCoveredItem[]): DiscoverItemCoverageStatus {
  if (covering.length === 0) { return 'missing'; }
  if (covering.every((f) => f.status === 'in-code')) { return 'in-code'; }
  if (covering.some((f) => f.status === 'stale')) { return 'stale'; }
  return 'missing';
}

/**
 * Per-item inventory for Discover steps 3, 4 and 6.
 * A workspace with no source is not a second mode — every item is `missing`.
 */
export function classifyItemCoverage(input: EpicSuggestionInput): DiscoverItemCoverage {
  const { workspaceRoot, ctx, scope } = input;
  const scan = scanWorkspace(input);
  const frs = sectionItems(ctx, DOC_REQUIREMENTS, 'functional');
  const screens = sectionItems(ctx, DOC_USER_FLOWS, 'screens');

  const featureItems: DiscoverCoveredItem[] = scan.features.map((feature) => {
    const { status, matched } = codeStatus(feature, scan, workspaceRoot, scope);
    return {
      id: feature.id,
      kind: 'feature',
      text: feature.text,
      status,
      group: featureGroup(feature.id).toUpperCase() || feature.id,
      coveringFeatureIds: [],
      coveredFrIds: extractIds(feature.text).filter((id) => id.startsWith('FR-')),
      matchedFiles: matched,
    };
  });

  const frItems: DiscoverCoveredItem[] = frs.map((fr) => {
    const covering = featureItems.filter((f) => f.coveredFrIds.includes(fr.id));
    return {
      id: fr.id,
      kind: 'fr',
      text: fr.text,
      status: frStatusFrom(covering),
      group: '',
      coveringFeatureIds: covering.map((f) => f.id),
      coveredFrIds: [],
      matchedFiles: [...new Set(covering.flatMap((f) => f.matchedFiles))].slice(0, 6),
    };
  });

  const byFeatureId = new Map(featureItems.map((f) => [f.id, f]));
  const screenItems: DiscoverCoveredItem[] = screens.map((screen) => {
    const { status, matched } = codeStatus(screen, scan, workspaceRoot, scope);
    const cited = extractIds(screen.text).filter((id) => id.startsWith('F-'));
    const citedStatus = cited.map((id) => byFeatureId.get(id)?.status).filter(Boolean) as DiscoverItemCoverageStatus[];
    const fromFeatures = citedStatus.includes('stale')
      ? 'stale'
      : citedStatus.length > 0 && citedStatus.every((s) => s === 'in-code') && status === 'missing'
        ? 'in-code'
        : status;
    return {
      id: screen.id,
      kind: 'screen',
      text: screen.text,
      status: fromFeatures,
      group: 'Screens',
      coveringFeatureIds: cited,
      coveredFrIds: [],
      matchedFiles: matched,
    };
  });

  const items = [...frItems, ...featureItems, ...screenItems];
  return {
    sourceFileCount: scan.sourceFiles.length,
    items,
    counts: {
      inCode: items.filter((i) => i.status === 'in-code').length,
      missing: items.filter((i) => i.status === 'missing').length,
      stale: items.filter((i) => i.status === 'stale').length,
    },
  };
}
