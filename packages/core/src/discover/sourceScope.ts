/**
 * What counts as "the codebase" for a blueprint.
 *
 * A Discover scan reconciles the twelve steps against the source code, which
 * only works if it knows which files *are* the source code. Two things make
 * that non-obvious on a real machine:
 *
 *  1. **AI scaffolding looks like source.** A repo carries `.aidlc/`,
 *     `.claude/`, `.cursor/`, `.opencode/` — templates, skills, slash
 *     commands, run snapshots. An agent told to "explore the codebase" reads
 *     them and reports the *tool's* stack ("Markdown as the prompt language",
 *     "YAML for pipeline config") as the product's. See {@link EXCLUDED_DIRS}.
 *
 *  2. **A repo tree has tiers.** A parent repo can own the product docs while
 *     the code lives in child repos, each its own git remote with its own
 *     stack — an iOS app and a Go service cannot share one `TECH_STACK.md`.
 *     Scanning the parent root flattens them into nonsense.
 *
 * So the layout is *declared*, not inferred: this module only proposes what it
 * sees, {@link DiscoverScope} records what the user confirmed, and every later
 * scan follows that record.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import type { DiscoverScope, DiscoverSourceRepo } from '../contracts/discover';
import type { GuardrailIssue } from './validate';

/**
 * Directories that are never a product's own source, at any depth.
 *
 * Split by why they are excluded, because the reasons age differently: the
 * agent-tooling group grows as new providers appear, the derived group is
 * stable.
 */
export const EXCLUDED_DIRS: readonly string[] = [
  // Agent/tool configuration — the AI's own scaffolding, not the product.
  '.aidlc', '.claude', '.cursor', '.codex', '.opencode', '.ideaflow', '.github/copilot',
  // Derived, vendored or downloaded.
  '.git', '.ast-graph', 'node_modules', 'vendor', 'Pods', 'Carthage', '.venv', 'venv',
  '__pycache__', 'dist', 'build', '.build', 'out', 'target', 'DerivedData', '.next',
  'coverage', '.gradle', '.terraform',
];

const EXCLUDED = new Set(EXCLUDED_DIRS);

/** How deep to look for nested repos. Deeper than this is a vendored tree, not a sibling project. */
const MAX_CHILD_DEPTH = 2;

/** A repo the user could declare as source, with everything needed to pre-fill the wizard. */
export interface RepoCandidate {
  /** Path relative to the workspace root; `.` for the root itself. */
  path: string;
  /** Folder name, or the workspace's own name for the root. */
  name: string;
  /** Best guess at `backend` / `frontend` / `mobile` / …, or `''` when nothing recognizable. */
  kind: string;
  /** Whether it has its own `.git` — i.e. is a repo in its own right rather than a plain folder. */
  isRepo: boolean;
  /** Whether it already has its own Discover blueprint. */
  hasBlueprint: boolean;
  /** The manifest files that produced `kind`, for showing the user why we guessed. */
  manifests: string[];
}

export interface RepoLayoutProbe {
  /** What we would pick if the user just pressed Enter. */
  suggested: DiscoverScope['layout'];
  /** The workspace root as a candidate — present whether or not it has source. */
  self: RepoCandidate;
  /** Nested repos and top-level project folders, nearest first. */
  children: RepoCandidate[];
  /** Set when the root looks like a child: an ancestor directory that is itself a repo with docs. */
  parentPath?: string;
}

// ── manifest → kind ────────────────────────────────────────────────────────

interface KindRule {
  kind: string;
  /** A manifest filename, or a predicate over the directory's top-level entries. */
  match: (entries: string[], dir: string) => string | undefined;
}

function hasFile(entries: string[], name: string): string | undefined {
  return entries.includes(name) ? name : undefined;
}

function hasSuffix(entries: string[], suffix: string): string | undefined {
  return entries.find((e) => e.endsWith(suffix));
}

/** Read a `package.json`'s merged dependency names, or `[]` when unreadable. */
function packageDeps(dir: string): string[] {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as Record<string, unknown>;
    return Object.keys({
      ...(pkg.dependencies as Record<string, string> | undefined),
      ...(pkg.devDependencies as Record<string, string> | undefined),
    });
  } catch {
    return [];
  }
}

const FRONTEND_DEPS = ['react', 'react-dom', 'vue', 'svelte', '@sveltejs/kit', 'next', 'nuxt', '@angular/core', 'solid-js', 'astro', 'vite'];
const BACKEND_DEPS = ['express', 'fastify', 'koa', '@nestjs/core', 'hono', 'h3', 'elysia', 'apollo-server', '@prisma/client', 'typeorm', 'mongoose'];
const MOBILE_DEPS = ['react-native', 'expo'];

/**
 * Ordered so the most specific signal wins: a React Native `package.json` is
 * mobile before it is frontend, and an `.xcodeproj` beats everything since a
 * native project rarely carries another ecosystem's manifest by accident.
 */
const KIND_RULES: readonly KindRule[] = [
  { kind: 'mobile', match: (e) => hasSuffix(e, '.xcodeproj') ?? hasSuffix(e, '.xcworkspace') ?? hasFile(e, 'Package.swift') ?? hasFile(e, 'Podfile') },
  { kind: 'mobile', match: (e) => hasFile(e, 'pubspec.yaml') },
  { kind: 'mobile', match: (e, dir) => (hasFile(e, 'package.json') && MOBILE_DEPS.some((d) => packageDeps(dir).includes(d)) ? 'package.json' : undefined) },
  { kind: 'mobile', match: (e) => (e.includes('settings.gradle') || e.includes('settings.gradle.kts') ? (hasFile(e, 'gradle.properties') ?? 'settings.gradle') : undefined) },
  { kind: 'frontend', match: (e, dir) => (hasFile(e, 'package.json') && FRONTEND_DEPS.some((d) => packageDeps(dir).includes(d)) ? 'package.json' : undefined) },
  { kind: 'backend', match: (e, dir) => (hasFile(e, 'package.json') && BACKEND_DEPS.some((d) => packageDeps(dir).includes(d)) ? 'package.json' : undefined) },
  { kind: 'backend', match: (e) => hasFile(e, 'go.mod') ?? hasFile(e, 'Cargo.toml') ?? hasFile(e, 'pom.xml') ?? hasFile(e, 'pyproject.toml') ?? hasFile(e, 'requirements.txt') ?? hasFile(e, 'Gemfile') ?? hasSuffix(e, '.csproj') },
  { kind: 'infra', match: (e) => hasSuffix(e, '.tf') ?? hasFile(e, 'Chart.yaml') ?? hasFile(e, 'docker-compose.yml') ?? hasFile(e, 'docker-compose.yaml') },
  // Last resort: a bare package.json is *some* kind of code project.
  { kind: '', match: (e) => hasFile(e, 'package.json') ?? hasFile(e, 'Dockerfile') },
];

function readDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Guess what a directory is, from its manifests alone. Returns `''` when
 * nothing recognizable is there — the wizard asks rather than inventing a
 * label, since `kind` is what keeps one repo's findings apart from another's.
 */
export function guessRepoKind(dir: string): { kind: string; manifests: string[] } {
  const entries = readDir(dir);
  const manifests: string[] = [];
  let kind = '';
  for (const rule of KIND_RULES) {
    const hit = rule.match(entries, dir);
    if (!hit) { continue; }
    manifests.push(hit);
    if (!kind && rule.kind) { kind = rule.kind; }
  }
  return { kind, manifests };
}

/** Whether a directory holds anything that could be product source at all. */
function hasOwnSource(dir: string): boolean {
  const { manifests } = guessRepoKind(dir);
  if (manifests.length > 0) { return true; }
  // No manifest: fall back to source files sitting directly in the tree,
  // ignoring the scaffolding and the docs.
  const entries = readDir(dir).filter((e) => !EXCLUDED.has(e) && !e.startsWith('.'));
  return entries.some((e) => /\.(ts|tsx|js|jsx|swift|kt|java|go|rs|py|rb|cs|php|dart|m|mm|c|cc|cpp|h)$/i.test(e));
}

function isRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.git'));
}

function hasBlueprint(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.aidlc', 'discover', 'index.json'));
}

function candidate(root: string, relative: string): RepoCandidate {
  const dir = relative === '.' ? root : path.join(root, relative);
  const { kind, manifests } = guessRepoKind(dir);
  return {
    path: relative,
    name: relative === '.' ? path.basename(root) : path.basename(relative),
    kind,
    isRepo: isRepo(dir),
    hasBlueprint: hasBlueprint(dir),
    manifests,
  };
}

/**
 * Look at a workspace root and propose a layout.
 *
 * Nothing here is authoritative — a wrong guess costs the user one click in
 * the wizard, whereas a wrong *silent* guess costs them a blueprint full of
 * the wrong product.
 */
export function probeRepoLayout(root: string): RepoLayoutProbe {
  const self = candidate(root, '.');
  const children: RepoCandidate[] = [];

  const visit = (relative: string, depth: number): void => {
    const dir = path.join(root, relative);
    for (const entry of readDir(dir)) {
      if (EXCLUDED.has(entry) || entry.startsWith('.')) { continue; }
      const childRelative = relative === '' ? entry : `${relative}/${entry}`;
      const childDir = path.join(root, childRelative);
      let stat: fs.Stats;
      try { stat = fs.statSync(childDir); } catch { continue; }
      if (!stat.isDirectory()) { continue; }
      // A nested repo, or a folder with its own manifest, is a candidate and
      // we stop there — anything below it belongs to that project, not to a
      // sibling of it.
      if (isRepo(childDir) || hasOwnSource(childDir)) {
        children.push(candidate(root, childRelative));
        continue;
      }
      if (depth < MAX_CHILD_DEPTH) { visit(childRelative, depth + 1); }
    }
  };
  visit('', 1);

  // Nested repos are the strongest signal, and are listed first so the wizard
  // pre-checks them ahead of plain source folders.
  children.sort((a, b) => Number(b.isRepo) - Number(a.isRepo) || a.path.localeCompare(b.path));

  const parentPath = findParentBlueprint(root);
  const suggested: DiscoverScope['layout'] =
    children.some((c) => c.isRepo) && !hasOwnSource(root) ? 'parent'
      : parentPath ? 'child'
        : 'single';

  return { suggested, self, children, parentPath };
}

/** The nearest ancestor that has its own blueprint — i.e. looks like this repo's parent. */
function findParentBlueprint(root: string): string | undefined {
  let dir = path.dirname(root);
  for (let up = 0; up < 3 && dir && dir !== path.dirname(dir); up += 1) {
    if (hasBlueprint(dir)) { return path.relative(root, dir).split(path.sep).join('/'); }
    dir = path.dirname(dir);
  }
  return undefined;
}

// ── using a declared scope ─────────────────────────────────────────────────

/** A scope for a repo that holds its own source — what a plain single-repo project gets. */
export function singleRepoScope(root: string, now: string): DiscoverScope {
  return {
    layout: 'single',
    repos: [{ path: '.', kind: guessRepoKind(root).kind || 'app', name: path.basename(root) }],
    excludes: [],
    declaredAt: now,
  };
}

/** Absolute paths of the repos a scan may read, skipping any that have gone missing. */
export function sourceRoots(root: string, scope: DiscoverScope | undefined): string[] {
  const repos = scope?.repos.length ? scope.repos : [{ path: '.' } as DiscoverSourceRepo];
  return repos
    .map((repo) => (repo.path === '.' ? root : path.join(root, repo.path)))
    .filter((dir) => fs.existsSync(dir));
}

/** Every path a scan must stay out of: the built-in list plus the scope's own additions. */
export function sourceExcludes(scope: DiscoverScope | undefined): string[] {
  return [...EXCLUDED_DIRS, ...(scope?.excludes ?? [])];
}

// ── write guardrail ────────────────────────────────────────────────────────

/**
 * A scan writes only into the blueprint's own `docsRoot`. Nothing in the
 * blueprint diff can see a stray write into a *source* repo (a child's own
 * `docs/ARCHITECTURE.md`, say — child repos here carry files with exactly the
 * same names), so we fingerprint each source repo's git state around the run
 * and compare.
 *
 * Keyed by repo path; the value is opaque. A repo we cannot ask git about maps
 * to `''`, which compares equal to itself and so never raises a false alarm.
 */
export type SourceRepoFingerprint = Record<string, string>;

function git(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return undefined;
  }
}

export function fingerprintSourceRepos(root: string, scope: DiscoverScope | undefined): SourceRepoFingerprint {
  const out: SourceRepoFingerprint = {};
  for (const repo of scope?.repos ?? []) {
    const dir = repo.path === '.' ? root : path.join(root, repo.path);
    if (!fs.existsSync(dir)) { continue; }
    const head = git(dir, ['rev-parse', 'HEAD']) ?? '';
    const status = git(dir, ['status', '--porcelain']) ?? '';
    out[repo.path] = head === '' && status === '' ? '' : `${head.trim()}\n${status}`;
  }
  return out;
}

/**
 * Compare two fingerprints. The blueprint's own repo (`.`) is skipped: a scan
 * is *supposed* to dirty it — that's where the docs live.
 */
export function checkSourceRepoWrites(
  before: SourceRepoFingerprint,
  after: SourceRepoFingerprint,
): GuardrailIssue[] {
  const issues: GuardrailIssue[] = [];
  for (const [repoPath, was] of Object.entries(before)) {
    if (repoPath === '.') { continue; }
    const now = after[repoPath];
    if (now === undefined || was === now) { continue; }
    issues.push({
      code: 'source-repo-written',
      file: repoPath,
      message: `${repoPath} is a source repo, not part of this blueprint, and the run changed files inside it — review it with git before keeping.`,
    });
  }
  return issues;
}
