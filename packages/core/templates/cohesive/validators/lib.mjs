import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export function verdict(decision, reason) {
  return { decision, reason };
}

export function pass(reason) {
  return verdict('pass', reason);
}

export function reject(reason) {
  return verdict('reject', reason);
}

export function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

export function readJson(file) {
  return JSON.parse(readText(file));
}

export function exists(file) {
  return fs.existsSync(file);
}

export function sha256Text(text) {
  return `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;
}

export function sha256File(file) {
  return sha256Text(fs.readFileSync(file));
}

export function epicDir(workspaceRoot, runId) {
  return path.join(workspaceRoot, 'docs', 'epics', runId);
}

export function artifactDir(workspaceRoot, runId) {
  return path.join(epicDir(workspaceRoot, runId), 'artifacts');
}

export function inputsFor(workspaceRoot, runId) {
  const file = path.join(epicDir(workspaceRoot, runId), 'inputs.json');
  return exists(file) ? readJson(file) : {};
}

export function currentStepName(ctx) {
  const config = ctx.pipeline?.steps?.[ctx.step?.stepIdx ?? ctx.state?.currentStepIdx];
  return config?.name ?? config?.agent ?? '';
}

export function fullCommitExists(workspaceRoot, sha) {
  if (typeof sha !== 'string' || !/^[0-9a-f]{7,40}$/i.test(sha)) return false;
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], {
      cwd: workspaceRoot,
      stdio: 'ignore',
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

export function markdownHasGo(text) {
  return /\*\*(?:Verdict|Status):\*\*\s*(?:GO|PASS)\b/i.test(text);
}

export function hasPlaceholder(text) {
  return /\$EPIC_ID|\[Feature Title\]|\[task name\]|\bTODO\b|template missing|fill in your output|(?:^|\s)…(?:\s|$)/im.test(text);
}

export function contractHash(text) {
  const normalized = text.replace(
    /\*\*Contract Hash:\*\*\s*[^\r\n]*/i,
    '**Contract Hash:** pending',
  );
  return sha256Text(normalized);
}

export function declaredContractHash(text) {
  return text.match(/\*\*Contract Hash:\*\*\s*(sha256:[0-9a-f]{64})/i)?.[1]?.toLowerCase();
}

export function taskIdsFromMarkdown(text) {
  return [...new Set(text.match(/[A-Z][A-Z0-9_-]*-T\d{2,}/g) ?? [])];
}

export function staticGlobRoot(pattern) {
  const normalized = String(pattern ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
  const idx = normalized.search(/[?*{[]/);
  const root = (idx >= 0 ? normalized.slice(0, idx) : normalized).replace(/\/$/, '');
  return root;
}

export function scopesOverlap(a, b) {
  const ra = staticGlobRoot(a);
  const rb = staticGlobRoot(b);
  if (!ra || !rb) return true;
  return ra === rb || ra.startsWith(`${rb}/`) || rb.startsWith(`${ra}/`);
}

export function matchesScope(file, pattern) {
  const f = String(file ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
  const root = staticGlobRoot(pattern);
  return !!root && (f === root || f.startsWith(`${root}/`) || pattern === f);
}

export function packageById(manifest, packageId) {
  return manifest?.packages?.find((entry) => entry?.id === packageId);
}

/** ownedPaths (charter) with writeScope fallback (legacy package manifests). */
export function packageOwnedPaths(pkg) {
  const owned = pkg?.ownedPaths ?? pkg?.writeScope ?? [];
  return Array.isArray(owned) ? owned : [];
}

export function readCharter(workspaceRoot) {
  const file = path.join(workspaceRoot, 'docs', 'project', 'charter', 'CHARTER.json');
  return exists(file) ? readJson(file) : null;
}

export function approvedVarianceCoversPath(workspaceRoot, featureId, filePath) {
  const dir = path.join(artifactDir(workspaceRoot, featureId), 'variance-requests');
  if (!exists(dir)) return false;
  try {
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
      const text = readText(path.join(dir, name));
      const approved = /\*\*Status:\*\*\s*approved\b/i.test(text) || /\bstatus:\s*approved\b/i.test(text);
      if (!approved) continue;
      if (text.includes(filePath) || matchesScope(filePath, filePath)) return true;
      // Broad approved VR that lists the path root.
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/`([^`]+)`/);
        if (m && matchesScope(filePath, m[1])) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

export function parentArtifacts(workspaceRoot, featureId) {
  return artifactDir(workspaceRoot, featureId);
}

export function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

