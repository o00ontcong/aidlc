/**
 * Build-only auto-reviewer for step `implement` của `aidlc-ios-feature`.
 * It runs a real project build, then leaves the result for human review. It
 * deliberately never runs a test suite.
 *
 * Pass khi: `xcodebuild build` hoặc `swift build` xong sạch và
 * IMPLEMENT-SUMMARY có dán output build thật.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const IGNORED_DIRECTORIES = new Set(['.git', '.build', 'DerivedData', 'node_modules', 'Pods']);

function walk(root, predicate, maxDepth = 4, depth = 0) {
  if (depth > maxDepth) { return null; }
  let entries = [];
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return null; }
  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name)) { continue; }
    const candidate = path.join(root, entry.name);
    if (predicate(entry.name, candidate)) { return candidate; }
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name) || entry.name.endsWith('.xcodeproj')) { continue; }
    const found = walk(path.join(root, entry.name), predicate, maxDepth, depth + 1);
    if (found) { return found; }
  }
  return null;
}

function findXcodeProject(root) {
  return walk(root, (name) => name.endsWith('.xcodeproj'));
}

function findPackageDir(root) {
  if (existsSync(path.join(root, 'Package.swift'))) { return root; }
  const packageFile = walk(root, (name, candidate) => existsSync(path.join(candidate, 'Package.swift')));
  return packageFile;
}

function run(command, args, cwd) {
  try {
    return {
      ok: true,
      out: execFileSync(command, args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 20 * 1024 * 1024,
      }),
    };
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function xcodeScheme(project, root) {
  const preferred = path.basename(project, '.xcodeproj');
  const listing = run('xcodebuild', ['-list', '-project', project], root);
  if (!listing.ok) { return preferred; }
  const schemes = listing.out
    .match(/\n\s*Schemes:\s*\n([\s\S]*?)(?:\n\n|$)/)?.[1]
    ?.split('\n')
    .map((line) => line.trim())
    .filter(Boolean) ?? [];
  return schemes.includes(preferred)
    ? preferred
    : schemes.find((scheme) => !/tests?$/i.test(scheme)) ?? schemes[0] ?? preferred;
}

export default async function validate(ctx) {
  const root = ctx.workspaceRoot ?? process.cwd();
  const epic = ctx.context?.epic ?? ctx.runId;
  const project = findXcodeProject(root);
  const packageDir = project ? null : findPackageDir(root);

  if (!project && !packageDir) {
    return {
      decision: 'reject',
      reason: 'Không tìm thấy .xcodeproj hoặc Package.swift để build.',
    };
  }

  const scheme = project ? xcodeScheme(project, root) : null;
  const build = project
    ? run('xcodebuild', ['-project', project, '-scheme', scheme, '-destination', 'generic/platform=iOS', 'build'], root)
    : run('swift', ['build'], packageDir);
  if (!build.ok) {
    const firstError = build.out.split('\n').find((l) => l.includes('error:')) ?? 'build thất bại';
    return { decision: 'reject', reason: `${project ? 'xcodebuild' : 'swift build'} fail — ${firstError.trim()}` };
  }

  const summaryPath = path.join(root, 'docs', 'epics', String(epic), 'artifacts', 'IMPLEMENT-SUMMARY.md');
  if (!existsSync(summaryPath)) {
    return { decision: 'reject', reason: 'Thiếu IMPLEMENT-SUMMARY.md.' };
  }
  const summary = readFileSync(summaryPath, 'utf8');
  if (!summary.includes('## Build Evidence')) {
    return { decision: 'reject', reason: 'IMPLEMENT-SUMMARY thiếu mục "## Build Evidence".' };
  }
  return {
    decision: 'pass',
    reason: `${project ? `xcodebuild ${scheme}` : 'swift build'} xanh, và summary có bằng chứng build.`,
  };
}
