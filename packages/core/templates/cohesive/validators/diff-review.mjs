import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  artifactDir, exists, formatError, inputsFor, matchesScope, packageById,
  packageOwnedPaths, pass, readJson, readText, reject,
} from './lib.mjs';

function changedFilesFromReviewDiff(text) {
  const files = new Set();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*]\s+`?([^`\s]+)`?\s*$/);
    if (bullet) files.add(bullet[1].replaceAll('\\', '/').replace(/^\.\//, ''));
    const named = trimmed.match(/^(?:Changed|File):\s*`?([^`\s]+)`?\s*$/i);
    if (named) files.add(named[1].replaceAll('\\', '/').replace(/^\.\//, ''));
  }
  const fence = String(text ?? '').match(/```(?:diff|git)?\n([\s\S]*?)```/i);
  if (fence) {
    for (const line of fence[1].split(/\r?\n/)) {
      const a = line.match(/^---\s+a\/(.+)$/);
      const b = line.match(/^\+\+\+\s+b\/(.+)$/);
      if (a && a[1] !== '/dev/null') files.add(a[1].replaceAll('\\', '/'));
      if (b && b[1] !== '/dev/null') files.add(b[1].replaceAll('\\', '/'));
    }
  }
  return [...files];
}

function gitChangedFiles(worktreeAbs, baseCommit) {
  try {
    const out = execFileSync(
      'git',
      ['diff', '--name-only', `${baseCommit}...HEAD`],
      { cwd: worktreeAbs, encoding: 'utf8', timeout: 15_000 },
    );
    return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((f) => f.replaceAll('\\', '/'));
  } catch {
    return null;
  }
}

export default async function diffReview(ctx) {
  try {
    const runId = ctx.state.runId;
    const inputs = inputsFor(ctx.workspaceRoot, runId);
    const feature = inputs.feature_id;
    const packageId = inputs.package_id;
    const artifacts = artifactDir(ctx.workspaceRoot, runId);
    const reviewPath = path.join(artifacts, 'REVIEW-DIFF.md');
    if (!exists(reviewPath)) return reject('REVIEW-DIFF.md is missing');
    const reviewText = readText(reviewPath);
    if (!reviewText.trim()) return reject('REVIEW-DIFF.md is empty');

    const parent = artifactDir(ctx.workspaceRoot, feature);
    const manifest = readJson(path.join(parent, 'WORK-PACKAGES.json'));
    const pkg = packageById(manifest, packageId);
    if (!pkg) return reject(`package ${packageId} not found in WORK-PACKAGES.json`);
    const owned = packageOwnedPaths(pkg);
    if (!owned.length) return reject(`${packageId} has no ownedPaths/writeScope`);

    const problems = [];
    let changed = changedFilesFromReviewDiff(reviewText);

    const statePath = path.join(artifacts, 'WORKTREE-STATE.json');
    if (exists(statePath)) {
      const state = readJson(statePath);
      const worktreeAbs = path.resolve(ctx.workspaceRoot, state.worktree ?? '');
      if (fs.existsSync(worktreeAbs) && state.baseCommit) {
        const fromGit = gitChangedFiles(worktreeAbs, state.baseCommit);
        if (fromGit) {
          for (const file of fromGit) {
            if (!changed.includes(file)) changed.push(file);
          }
          // Prefer git ground truth when available.
          if (fromGit.length) changed = fromGit;
        }
      }
    }

    if (!changed.length) {
      problems.push('no changed files detected in REVIEW-DIFF.md or git diff');
    }
    for (const file of changed) {
      if (!owned.some((scope) => matchesScope(file, scope))) {
        problems.push(`changed file outside ownedPaths: ${file}`);
      }
    }

    if (problems.length) return reject(`Diff review failed:\n- ${problems.join('\n- ')}`);
    return pass(`REVIEW-DIFF covers ${changed.length} file(s) within ownedPaths for ${packageId}.`);
  } catch (error) {
    return reject(`Diff-review validator failed: ${formatError(error)}`);
  }
}
