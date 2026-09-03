/**
 * Host-side work that makes a Discover scan stop guessing.
 *
 * The agent still writes the Markdown; this module decides *what it may read*
 * (inventory + scope args), *which steps it may write this turn* (passes),
 * and *what to name a blueprint bootstrapped from existing code* (seed).
 */

import * as fs from 'fs';
import * as path from 'path';

import type { DiscoverScope, DiscoverStepId } from '../contracts/discover';
import { getStepSpec } from './DocSpec';
import { EXCLUDED_DIRS, guessRepoKind, sourceExcludes } from './sourceScope';

export const SCAN_BRIEF_REL_PATH = '.aidlc/discover/scan-brief.md';
export const SCAN_PASS_COUNT = 3;

export type ScanPassId = 1 | 2 | 3;

export interface ScanPassSpec {
  id: ScanPassId;
  label: string;
  labelVi: string;
  goal: string;
  stepIds: readonly DiscoverStepId[];
}

/**
 * Three turns, same campaign. Code drift still crosses steps, but a single
 * turn that rewrites all twelve files is too large to do well — so each pass
 * is one slash-command invocation with its own snapshot and review.
 */
export const SCAN_PASSES: readonly ScanPassSpec[] = [
  {
    id: 1,
    label: 'Product',
    labelVi: 'Sản phẩm',
    goal: 'Reconcile Idea through User Flow against what the product actually does.',
    stepIds: ['idea', 'product', 'requirements', 'features', 'usecases', 'userflows'],
  },
  {
    id: 2,
    label: 'Architecture',
    labelVi: 'Kiến trúc',
    goal: 'Reconcile architecture, data, stack and folder structure against the code.',
    stepIds: ['architecture', 'datamodel', 'techdecisions', 'structure'],
  },
  {
    id: 3,
    label: 'Plan',
    labelVi: 'Kế hoạch',
    goal: 'Reconcile the implementation plan and skeleton against the real tree.',
    stepIds: ['plan', 'skeleton'],
  },
];

const EXCLUDED = new Set(EXCLUDED_DIRS);
const SOURCE_EXT = /\.(ts|tsx|js|jsx|swift|kt|java|go|rs|py|rb|cs|php|dart|m|mm|c|cc|cpp|h|vue|svelte)$/i;
const ROOT_EXTRA_FILES = [
  'README.md', 'readme.md', 'README.MD',
  'package.json', 'go.mod', 'Cargo.toml', 'pyproject.toml', 'requirements.txt',
  'Podfile', 'Package.swift', 'pubspec.yaml', 'Gemfile', 'pom.xml',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
];
const MAX_FILES_PER_REPO = 200;
const MAX_FILES_TOTAL = 600;

// ── content extraction limits ──────────────────────────────────────────────

/**
 * Total character budget for embedded file content across the whole brief.
 * ~80 KB → fits comfortably in a 200 K-token context window together with
 * the 12-step contract, worked examples and existing docs.
 */
const MAX_CONTENT_CHARS = 80_000;
/** Characters per individual file — prevents one giant file eating the budget. */
const MAX_FILE_CHARS = 12_000;

/**
 * Patterns that identify "hot" files: entry points, routers, models/schemas.
 * Ordered by relevance — first match wins the highest priority bucket.
 */
const HOT_PATTERNS: { bucket: number; re: RegExp }[] = [
  // Manifests / project definition (already in manifests[] but include body)
  { bucket: 0, re: /(^|\/)package\.json$|(^|\/)go\.mod$|(^|\/)Cargo\.toml$|(^|\/)pyproject\.toml$|(^|\/)requirements\.txt$|(^|\/)Podfile$|(^|\/)Package\.swift$|(^|\/)pubspec\.yaml$|(^|\/)Gemfile$|(^|\/)pom\.xml$/i },
  // README
  { bucket: 0, re: /(^|\/)readme\.md$/i },
  // Entry points
  { bucket: 1, re: /(^|\/)main\.(ts|tsx|go|swift|kt|py|rs|java|cs)$/i },
  { bucket: 1, re: /(^|\/)index\.(ts|tsx|js|jsx)$/i },
  { bucket: 1, re: /(^|\/)app\.(ts|tsx|swift|kt|dart)$/i },
  { bucket: 1, re: /(^|\/)App\.(swift|tsx|kt|dart)$/i },
  { bucket: 1, re: /(^|\/)server\.(ts|js|go|py|rs)$/i },
  { bucket: 1, re: /(^|\/)Application\.(swift|kt|java)$/i },
  // Routes / handlers / controllers
  { bucket: 2, re: /(router|routes?|handler|controller|endpoint|api)\.(ts|tsx|js|go|swift|kt|py|rs|java|cs|php|rb)$/i },
  { bucket: 2, re: /\/(router|routes?|handlers?|controllers?|endpoints?)\//i },
  // Models / schemas / entities / types
  { bucket: 3, re: /(model|schema|entity|types?|dto)\.(ts|tsx|js|go|swift|kt|py|rs|java|cs|dart)$/i },
  { bucket: 3, re: /\/(models?|schemas?|entities|types?|dtos?)\//i },
  // Tests — reveal intended behavior clearly
  { bucket: 4, re: /\.(spec|test)\.(ts|tsx|js|go)$|_test\.(go|rs|py)$/i },
  { bucket: 4, re: /(Test|Spec|Tests)\.(swift|kt|java)$/i },
];

export function isScanPassId(value: unknown): value is ScanPassId {
  return value === 1 || value === 2 || value === 3;
}

export function getScanPass(id: ScanPassId): ScanPassSpec {
  return SCAN_PASSES[id - 1]!;
}

export function nextScanPass(id: ScanPassId | undefined): ScanPassId | undefined {
  if (id === 1) { return 2; }
  if (id === 2) { return 3; }
  return undefined;
}

export function scanPassDocPaths(id: ScanPassId): string[] {
  return getScanPass(id).stepIds.flatMap((stepId) => getStepSpec(stepId).files.map((f) => f.path));
}

export function scanPassExtraDirs(id: ScanPassId): string[] {
  return getScanPass(id).stepIds.flatMap((stepId) => {
    const extra = getStepSpec(stepId).extraDir;
    return extra ? [extra.path] : [];
  });
}

export function scanPassFirstStep(id: ScanPassId): DiscoverStepId {
  return getScanPass(id).stepIds[0]!;
}

// ── slash-command arguments ────────────────────────────────────────────────

export function formatDiscoverScanArgs(input: {
  pass: ScanPassId;
  scope: DiscoverScope;
  briefPath?: string;
  note?: string;
}): string {
  const repos = input.scope.repos.map((r) => `${r.path}:${r.kind}`).join(',');
  const parts = [
    `pass=${input.pass}`,
    `layout=${input.scope.layout}`,
    `repos=${repos || '.'}`,
    `brief=${input.briefPath ?? SCAN_BRIEF_REL_PATH}`,
  ];
  if (input.scope.parentPath) { parts.push(`parent=${input.scope.parentPath}`); }
  if (input.note?.trim()) { parts.push(input.note.trim()); }
  return parts.join(' ');
}

export interface ParsedScanArgs {
  pass: ScanPassId;
  layout?: DiscoverScope['layout'];
  repos: { path: string; kind: string }[];
  briefPath: string;
  parentPath?: string;
  note: string;
}

/** Best-effort parse of the host-built `$ARGUMENTS` line. */
export function parseDiscoverScanArgs(raw: string): ParsedScanArgs {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  let pass: ScanPassId = 1;
  let layout: DiscoverScope['layout'] | undefined;
  let repos: { path: string; kind: string }[] = [];
  let briefPath = SCAN_BRIEF_REL_PATH;
  let parentPath: string | undefined;
  const notes: string[] = [];
  for (const token of tokens) {
    if (token.startsWith('pass=')) {
      const n = Number(token.slice('pass='.length));
      if (isScanPassId(n)) { pass = n; }
      continue;
    }
    if (token.startsWith('layout=')) {
      const value = token.slice('layout='.length);
      if (value === 'single' || value === 'parent' || value === 'child') { layout = value; }
      continue;
    }
    if (token.startsWith('repos=')) {
      repos = token.slice('repos='.length).split(',').flatMap((entry) => {
        const [p, kind] = entry.split(':');
        if (!p) { return []; }
        return [{ path: p, kind: kind || 'app' }];
      });
      continue;
    }
    if (token.startsWith('brief=')) {
      briefPath = token.slice('brief='.length) || SCAN_BRIEF_REL_PATH;
      continue;
    }
    if (token.startsWith('parent=')) {
      parentPath = token.slice('parent='.length) || undefined;
      continue;
    }
    notes.push(token);
  }
  return { pass, layout, repos, briefPath, parentPath, note: notes.join(' ') };
}

// ── inventory / brief ──────────────────────────────────────────────────────

export interface ScanFileContent {
  /** Relative path (same as in `files[]`). */
  rel: string;
  /** File body, possibly truncated at MAX_FILE_CHARS. */
  content: string;
  truncated: boolean;
}

export interface ScanRepoInventory {
  path: string;
  kind: string;
  name: string;
  manifests: string[];
  readmeTitle?: string;
  files: string[];
  truncated: number;
  /** Key file contents embedded so the agent never has to `read()` them. */
  keyFiles: ScanFileContent[];
}

export interface ScanInventory {
  layout: DiscoverScope['layout'];
  parentPath?: string;
  repos: ScanRepoInventory[];
  excludes: string[];
  fileCount: number;
  truncated: boolean;
}

const DEFAULT_SCOPE = (root: string): DiscoverScope => ({
  layout: 'single',
  repos: [{ path: '.', kind: 'app', name: path.basename(root) }],
  excludes: [],
  declaredAt: new Date(0).toISOString(),
});

export function collectScanInventory(
  workspaceRoot: string,
  scope: DiscoverScope | undefined,
  docsRoot = 'docs',
): ScanInventory {
  const effective = scope?.repos.length ? scope : DEFAULT_SCOPE(workspaceRoot);
  const extraExcludes = sourceExcludes(effective);
  const repos: ScanRepoInventory[] = [];
  let remaining = MAX_FILES_TOTAL;
  let contentBudget = MAX_CONTENT_CHARS;

  for (const repo of effective.repos) {
    const abs = repo.path === '.' ? workspaceRoot : path.join(workspaceRoot, repo.path);
    if (!fs.existsSync(abs)) { continue; }
    const { manifests } = guessRepoKind(abs);
    const cap = Math.min(MAX_FILES_PER_REPO, remaining);
    const walked = listRepoSourceFiles(abs, repo.path === '.' ? '' : repo.path, cap, extraExcludes, docsRoot, repo.path === '.');
    remaining -= walked.files.length;
    const keyFiles = extractKeyFileContents(workspaceRoot, walked.files, contentBudget);
    contentBudget -= keyFiles.reduce((n, f) => n + f.content.length, 0);
    repos.push({
      path: repo.path,
      kind: repo.kind,
      name: repo.name ?? path.basename(repo.path === '.' ? workspaceRoot : repo.path),
      manifests: [...new Set([...manifests, ...rootExtraFiles(abs)])],
      readmeTitle: readmeTitle(abs),
      files: walked.files,
      truncated: walked.truncated,
      keyFiles,
    });
    if (remaining <= 0) { break; }
  }

  return {
    layout: effective.layout,
    parentPath: effective.parentPath,
    repos,
    excludes: extraExcludes,
    fileCount: repos.reduce((n, r) => n + r.files.length, 0),
    truncated: repos.some((r) => r.truncated > 0),
  };
}

/**
 * Score a file path: lower = more important.
 * Returns `undefined` when the file is not a hot file (skip embedding).
 */
function hotBucket(rel: string): number | undefined {
  const base = rel.replace(/\\/g, '/');
  for (const { bucket, re } of HOT_PATTERNS) {
    if (re.test(base)) { return bucket; }
  }
  return undefined;
}

/**
 * Pick the most important files from `allFiles`, read their contents, and
 * return them sorted by importance — manifests first, tests last. Stops
 * when the remaining content budget is exhausted.
 */
function extractKeyFileContents(
  workspaceRoot: string,
  allFiles: string[],
  budget: number,
): ScanFileContent[] {
  if (budget <= 0) { return []; }
  // Bucket each file; skip files that have no hot pattern
  type Candidate = { rel: string; bucket: number };
  const candidates: Candidate[] = [];
  for (const rel of allFiles) {
    const b = hotBucket(rel);
    if (b !== undefined) { candidates.push({ rel, bucket: b }); }
  }
  // Sort: bucket asc, then path asc (deterministic)
  candidates.sort((a, b) => a.bucket - b.bucket || a.rel.localeCompare(b.rel));

  const result: ScanFileContent[] = [];
  let used = 0;
  for (const { rel } of candidates) {
    if (used >= budget) { break; }
    const abs = path.join(workspaceRoot, rel);
    let raw: string;
    try { raw = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const avail = Math.min(MAX_FILE_CHARS, budget - used);
    const truncated = raw.length > avail;
    const content = truncated ? `${raw.slice(0, avail)}\n… [truncated]` : raw;
    result.push({ rel, content, truncated });
    used += content.length;
  }
  return result;
}

export function renderDiscoverScanBrief(input: {
  inventory: ScanInventory;
  pass: ScanPassId;
  docsRoot: string;
}): string {
  const pass = getScanPass(input.pass);
  const docs = scanPassDocPaths(input.pass);
  const extras = scanPassExtraDirs(input.pass);
  const lines: string[] = [
    '# Discover scan brief',
    '',
    'Host-built inventory for this scan pass. **This list is the only source',
    'you may read.** Do not explore outside these paths. Do not read `.aidlc/`',
    `(except this file), \`.claude/\`, \`.cursor/\`, or \`${input.docsRoot}/\`.`,
    '',
    '## Pass',
    '',
    `${input.pass} / ${SCAN_PASS_COUNT} — ${pass.label}`,
    '',
    pass.goal,
    '',
    `Steps: ${pass.stepIds.map((id) => `\`${id}\``).join(', ')}`,
    '',
    'Write only:',
    ...docs.map((p) => `- \`${input.docsRoot}/${p}\``),
    ...(extras.length ? extras.map((p) => `- \`${input.docsRoot}/${p}/\` (free-form ADRs)`) : []),
    '',
    '## Scope',
    '',
    `- layout: \`${input.inventory.layout}\``,
    ...(input.inventory.parentPath ? [`- parent: \`${input.inventory.parentPath}\``] : []),
    `- files listed: ${input.inventory.fileCount}${input.inventory.truncated ? ' (truncated — stay inside the listed repo paths)' : ''}`,
    '',
    '## Never read',
    '',
    input.inventory.excludes.map((d) => `\`${d}\``).join(', '),
    '',
  ];

  for (const repo of input.inventory.repos) {
    lines.push(`## ${repo.path} (${repo.kind})`, '');
    if (repo.readmeTitle) { lines.push(`README: ${repo.readmeTitle}`, ''); }
    if (repo.manifests.length) { lines.push(`manifests: ${repo.manifests.join(', ')}`, ''); }
    if (repo.files.length === 0) {
      lines.push('_No source files found inside the exclude rules._', '');
      continue;
    }
    lines.push(`files (${repo.files.length}${repo.truncated ? `, +${repo.truncated} not listed` : ''}):`);
    for (const file of repo.files) { lines.push(`- \`${file}\``); }
    lines.push('');

    // ── embedded key-file contents ──────────────────────────────────────
    if (repo.keyFiles.length > 0) {
      lines.push('### Key file contents', '');
      lines.push('> The files below are embedded verbatim so you do NOT need to');
      lines.push('> call `read()` on them. Use them as primary evidence when');
      lines.push('> writing documentation sections for this repository.');
      lines.push('');
      for (const kf of repo.keyFiles) {
        const ext = path.extname(kf.rel).slice(1) || 'text';
        lines.push(`#### \`${kf.rel}\`${kf.truncated ? ' _(truncated)_' : ''}`);
        lines.push('');
        lines.push('```' + ext);
        lines.push(kf.content);
        lines.push('```');
        lines.push('');
      }
    }
  }

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

export function writeDiscoverScanBrief(workspaceRoot: string, markdown: string): string {
  const abs = path.join(workspaceRoot, SCAN_BRIEF_REL_PATH);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, markdown.endsWith('\n') ? markdown : `${markdown}\n`);
  return SCAN_BRIEF_REL_PATH;
}

// ── seed sentence from existing source ─────────────────────────────────────

/**
 * A one-line seed for a blueprint bootstrapped by scanning existing source.
 *
 * Parent layouts skip the workspace-root README: that file usually describes
 * the checkout / tooling, not the product. Child repo READMEs and manifests
 * name the product.
 */
export function deriveScanSeedSentence(root: string, scope?: DiscoverScope): string {
  for (const dir of seedSearchDirs(root, scope)) {
    const heading = readmeTitle(dir);
    if (heading) { return heading; }
  }
  for (const dir of seedSearchDirs(root, scope)) {
    try {
      const pkgPath = path.join(dir, 'package.json');
      if (!fs.existsSync(pkgPath)) { continue; }
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string; description?: string };
      const name = typeof pkg.name === 'string' ? pkg.name : undefined;
      const description = typeof pkg.description === 'string' ? pkg.description.trim() : '';
      if (name && description) { return `${name}: ${description}`; }
      if (name) { return name; }
    } catch {
      // Malformed package.json — try the next source repo.
    }
  }
  return path.basename(root);
}

export function readmeTitle(dir: string): string | undefined {
  for (const name of ['README.md', 'readme.md', 'README.MD']) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) { continue; }
    try {
      const heading = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((line) => /^#\s+\S/.test(line));
      const title = heading?.replace(/^#\s+/, '').trim();
      if (title) { return title; }
    } catch {
      continue;
    }
  }
  return undefined;
}

function seedSearchDirs(root: string, scope?: DiscoverScope): string[] {
  const childDirs = (scope?.repos ?? [])
    .map((r) => (r.path === '.' ? root : path.join(root, r.path)))
    .filter((dir, i, all) => all.indexOf(dir) === i && fs.existsSync(dir));
  if (scope?.layout === 'parent') {
    return childDirs.filter((dir) => dir !== root);
  }
  const dirs = [root, ...childDirs.filter((dir) => dir !== root)];
  return dirs.filter((dir, i, all) => all.indexOf(dir) === i);
}

// ── walk ───────────────────────────────────────────────────────────────────

function rootExtraFiles(abs: string): string[] {
  return ROOT_EXTRA_FILES.filter((name) => fs.existsSync(path.join(abs, name)));
}

function listRepoSourceFiles(
  absRoot: string,
  relPrefix: string,
  limit: number,
  extraExcludes: readonly string[],
  docsRoot: string,
  isWorkspaceRoot: boolean,
): { files: string[]; truncated: number } {
  const files: string[] = [];
  let truncated = 0;
  const extras = ROOT_EXTRA_FILES
    .filter((name) => fs.existsSync(path.join(absRoot, name)))
    .map((name) => (relPrefix ? `${relPrefix}/${name}` : name));
  for (const extra of extras) {
    if (files.length >= limit) { truncated += 1; continue; }
    files.push(extra);
  }

  const visit = (abs: string, rel: string): void => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (EXCLUDED.has(entry.name) || entry.name.startsWith('.')) { continue; }
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (isExcludedRel(childRel, extraExcludes)) { continue; }
      if (isWorkspaceRoot && isDocsRel(childRel, docsRoot)) { continue; }
      const childAbs = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        visit(childAbs, childRel);
        continue;
      }
      if (!SOURCE_EXT.test(entry.name)) { continue; }
      if (files.length >= limit) { truncated += 1; continue; }
      files.push(childRel);
    }
  };
  visit(absRoot, relPrefix);
  files.sort((a, b) => a.localeCompare(b));
  return { files, truncated };
}

function isExcludedRel(rel: string, extraExcludes: readonly string[]): boolean {
  const n = rel.replace(/\\/g, '/');
  return extraExcludes.some((ex) => {
    const e = ex.replace(/\\/g, '/').replace(/\/$/, '');
    return n === e || n.startsWith(`${e}/`);
  });
}

function isDocsRel(rel: string, docsRoot: string): boolean {
  const n = rel.replace(/\\/g, '/');
  const d = docsRoot.replace(/\\/g, '/').replace(/\/$/, '');
  return n === d || n.startsWith(`${d}/`);
}
