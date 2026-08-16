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

export function isMermaidDiagram(text) {
  return typeof text === 'string' && /^flowchart|^sequenceDiagram/m.test(String(text).trim());
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

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

/**
 * Match the path/glob dialect used by cohesive manifests.  Bare paths keep
 * their historical "directory owns its descendants" behaviour; glob paths
 * are matched segment-aware so `src/*.ts` cannot authorize
 * `src/private/secret.json`.
 */
export function globMatches(file, pattern) {
  const f = String(file ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
  const p = String(pattern ?? '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
  if (!f || !p) return false;
  if (!/[?*{[]/.test(p)) return f === p || f.startsWith(`${p}/`);

  let source = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '*') {
      if (p[i + 1] === '*') {
        while (p[i + 1] === '*') i++;
        if (p[i + 1] === '/') {
          i++;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
    } else if (ch === '?') {
      source += '[^/]';
    } else if (ch === '{') {
      const end = p.indexOf('}', i + 1);
      if (end > i) {
        const choices = p.slice(i + 1, end).split(',').map(escapeRegExp);
        source += `(?:${choices.join('|')})`;
        i = end;
      } else {
        source += '\\{';
      }
    } else {
      source += escapeRegExp(ch);
    }
  }
  return new RegExp(`^${source}$`).test(f);
}

export function matchesScope(file, pattern) {
  return globMatches(file, pattern);
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
      // Only explicitly labelled authorization fields grant access. Merely
      // mentioning a protected path elsewhere in the variance rationale must
      // not turn that path into an approved scope.
      for (const line of text.split(/\r?\n/)) {
        if (!/allowed\s+(?:path|paths|scope)|approved\s+(?:path|paths|scope)|write\s*scope/i.test(line)) continue;
        for (const match of line.matchAll(/`([^`]+)`/g)) {
          if (matchesScope(filePath, match[1])) return true;
        }
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

export function charterPath(workspaceRoot) {
  return path.join(workspaceRoot, 'docs', 'project', 'charter', 'CHARTER.json');
}

/** Load CHARTER.json when present; return null if missing. */
export function loadCharter(workspaceRoot) {
  const file = charterPath(workspaceRoot);
  if (!exists(file)) return null;
  return readJson(file);
}

export function requireCharter(workspaceRoot) {
  const charter = loadCharter(workspaceRoot);
  if (!charter) {
    throw new Error(
      'docs/project/charter/CHARTER.json is missing. Run project-context define-charter (slice 1) before feature alignment.',
    );
  }
  return charter;
}

export function goalIdsFromCharter(charter) {
  return new Set(
    (charter?.goals ?? [])
      .map((g) => g?.id)
      .filter((id) => typeof id === 'string' && /^G-\d+$/.test(id)),
  );
}

export function invariantIdsFromCharter(charter) {
  return (charter?.invariants ?? [])
    .map((inv) => inv?.id)
    .filter((id) => typeof id === 'string' && /^INV-\d+$/.test(id));
}

export function forbiddenTechFromCharter(charter) {
  return (charter?.techRules ?? [])
    .filter((rule) => rule?.kind === 'forbidden' && typeof rule?.value === 'string')
    .map((rule) => ({ id: rule.id, value: String(rule.value).toLowerCase() }));
}

export function parseServesGoalsFromAlignment(text) {
  const section = text.match(/##\s*Serves Goals\s*\n([\s\S]*?)(?=\n##\s|\n*$)/i)?.[1] ?? '';
  return [...new Set([...section.matchAll(/\b(G-\d+)\b/g)].map((m) => m[1]))];
}

export function frIdsFromSpec(text) {
  return [...new Set(text.match(/\b(?:[A-Z][A-Z0-9_-]*-)?FR\d{2,}\b/g) ?? [])];
}

/** Map FR id → Serves goal ids from SPEC.md (FR line + Serves within next 3 lines). */
export function frServesMap(specText) {
  const map = new Map();
  const lines = specText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const frMatch = lines[i].match(/\b((?:[A-Z][A-Z0-9_-]*-)?FR\d{2,})\b/);
    if (!frMatch) continue;
    if (!map.has(frMatch[1])) map.set(frMatch[1], []);
    const window = lines.slice(i, i + 4).join('\n');
    const goals = [...window.matchAll(/Serves:\s*([^\n]+)/gi)]
      .flatMap((m) => [...m[1].matchAll(/\b(G-\d+)\b/g)].map((x) => x[1]));
    if (goals.length) {
      map.set(frMatch[1], [...new Set([...(map.get(frMatch[1]) ?? []), ...goals])]);
    }
  }
  return map;
}

export function approvedVarianceIds(artifactsDir) {
  const dir = path.join(artifactsDir, 'variance-requests');
  if (!exists(dir)) return new Set();
  const approved = new Set();
  for (const name of fs.readdirSync(dir)) {
    if (!/^VR-\d+\.md$/i.test(name)) continue;
    const text = readText(path.join(dir, name));
    if (/\*\*Status:\*\*\s*APPROVED\b/i.test(text) || /\*\*Verdict:\*\*\s*APPROVED\b/i.test(text)) {
      approved.add(name.replace(/\.md$/i, '').toUpperCase());
      for (const inv of text.matchAll(/\b(INV-\d+)\b/g)) approved.add(inv[1]);
    }
  }
  return approved;
}

export function fieldFromMarkdown(text, label) {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\r\\n]+)`, 'i');
  return text.match(re)?.[1]?.trim() ?? '';
}

export function gitDiffNameOnly(workspaceRoot, baseRef = 'HEAD') {
  try {
    const out = execFileSync('git', ['diff', '--name-only', baseRef], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function gitDiffNameOnlyStagedAndUnstaged(workspaceRoot) {
  const files = new Set();
  for (const args of [
    ['diff', '--name-only'],
    ['diff', '--name-only', '--cached'],
    ['diff', '--name-only', 'HEAD'],
  ]) {
    try {
      const out = execFileSync('git', args, {
        cwd: workspaceRoot,
        encoding: 'utf8',
        timeout: 15_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      for (const line of out.split(/\r?\n/)) {
        const f = line.trim();
        if (f) files.add(f.replaceAll('\\', '/'));
      }
    } catch { /* ignore */ }
  }
  return [...files];
}
