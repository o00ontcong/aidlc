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

export function markdownSection(text, heading) {
  const re = new RegExp(`^##\\s+${String(heading).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*$`, 'im');
  const match = re.exec(String(text ?? ''));
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = String(text).slice(start);
  const next = /^##\s+/im.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

export function extractMermaidFence(text) {
  const fence = String(text ?? '').match(/```mermaid\s*([\s\S]+?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const trimmed = String(text ?? '').trim();
  if (/^(flowchart|sequenceDiagram)\b/m.test(trimmed)) return trimmed;
  return '';
}

export function mermaidNormalized(text) {
  return extractMermaidFence(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function mermaidEquals(a, b) {
  const left = mermaidNormalized(a);
  return left.length > 0 && left === mermaidNormalized(b);
}

export function acceptanceCriteriaProblems(ac) {
  const body = String(ac ?? '').trim();
  const problems = [];
  if (body.length < 12) {
    problems.push('Acceptance criteria is too thin to be testable');
    return problems;
  }
  if (/should work well|feels fast|good UX|just works/i.test(body)) {
    problems.push('Acceptance criteria is vague (avoid "should work well")');
  }
  const hasId = /\bAC[- ]?\d+/i.test(body);
  const hasGwt = /\bgiven\b[\s\S]{0,240}\bwhen\b[\s\S]{0,240}\bthen\b/i.test(body);
  const hasTable = /\|\s*(criterion|verifiable)/i.test(body);
  if (!hasId && !hasGwt && !hasTable) {
    problems.push('Acceptance criteria need AC-ids, Given/When/Then, or a Criterion table');
  }
  return problems;
}

const IMPACT_CHANGES = new Set(['add', 'modify', 'delete', 'unchanged']);
const impactId = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]*$/i.test(value);

/** Catalog delta graph: add/modify/delete vs FEATURE-CATALOG. Not a second AC list. */
export function collectFeatureImpactProblems(workspaceRoot, runId) {
  const problems = [];
  const artifacts = artifactDir(workspaceRoot, runId);
  const catalogFile = path.join(workspaceRoot, 'docs', 'project', 'context', 'visualization', 'FEATURE-CATALOG.json');
  const impactFile = path.join(artifacts, 'FEATURE-IMPACT.json');
  const mermaidFile = path.join(artifacts, 'FEATURE-IMPACT.mmd');
  if (!exists(catalogFile)) {
    problems.push('FEATURE-CATALOG.json is required before feature briefing; complete project-context first');
    return problems;
  }
  if (!exists(impactFile) || !exists(mermaidFile)) {
    problems.push('Feature briefing requires FEATURE-IMPACT.json and FEATURE-IMPACT.mmd');
    return problems;
  }
  if (!isMermaidDiagram(readText(mermaidFile))) {
    problems.push('FEATURE-IMPACT.mmd must be Mermaid flowchart or sequenceDiagram source');
  }
  let catalog;
  let impact;
  try { catalog = readJson(catalogFile); } catch {
    problems.push('FEATURE-CATALOG.json is not valid JSON');
    return problems;
  }
  try { impact = readJson(impactFile); } catch {
    problems.push('FEATURE-IMPACT.json is not valid JSON');
    return problems;
  }
  const catalogIds = new Set((catalog.features ?? []).map((feature) => feature.id).filter((id) => typeof id === 'string'));
  if (impact.schemaVersion !== 1 || !Array.isArray(impact.features) || !impact.features.length) {
    problems.push('FEATURE-IMPACT.json must be schemaVersion 1 with a features array');
    return problems;
  }
  if (typeof impact.epicId === 'string' && impact.epicId !== runId) {
    problems.push(`FEATURE-IMPACT.json epicId ${impact.epicId} does not match run ${runId}`);
  }
  const seen = new Set();
  let changed = 0;
  for (const feature of impact.features) {
    if (!impactId(feature.id) || typeof feature.name !== 'string') {
      problems.push('Every FEATURE-IMPACT feature needs a stable id and name');
      continue;
    }
    if (seen.has(feature.id)) problems.push(`FEATURE-IMPACT repeats feature id ${feature.id}`);
    seen.add(feature.id);
    if (!IMPACT_CHANGES.has(feature.change)) {
      problems.push(`Feature ${feature.id} needs change add|modify|delete|unchanged`);
      continue;
    }
    if (feature.change !== 'unchanged') changed += 1;
    if ((feature.change === 'modify' || feature.change === 'delete') && !catalogIds.has(feature.id)) {
      problems.push(`${feature.change} ${feature.id} is not in FEATURE-CATALOG.json`);
    }
    if (feature.change === 'add' && catalogIds.has(feature.id)) {
      problems.push(`add ${feature.id} already exists in FEATURE-CATALOG.json; use modify`);
    }
  }
  if (!changed) problems.push('FEATURE-IMPACT.json must add, modify, or delete at least one feature');
  return problems;
}

const PROJECT_VIZ = {
  architectureJson: 'docs/project/context/visualization/PROJECT-ARCHITECTURE.json',
  architectureMmd: 'docs/project/context/visualization/PROJECT-ARCHITECTURE.mmd',
  catalogJson: 'docs/project/context/visualization/FEATURE-CATALOG.json',
  catalogMmd: 'docs/project/context/visualization/FEATURE-CATALOG.mmd',
  screensJson: 'docs/project/context/visualization/SCREEN-CATALOG.json',
  screensMmd: 'docs/project/context/visualization/SCREEN-CATALOG.mmd',
};

function objects(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function mermaidSafeId(value) {
  return `n_${String(value).replace(/[^A-Za-z0-9_]/g, '_')}`;
}

function mermaidSafeLabel(value) {
  return String(value).replace(/[\\"\[\]{}|<>]/g, '').replace(/[\r\n]+/g, ' ').trim();
}

function nodeIdentity(raw) {
  const id = typeof raw.id === 'string' && raw.id.trim()
    ? raw.id.trim()
    : typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : typeof raw.label === 'string' && raw.label.trim()
        ? raw.label.trim()
        : '';
  if (!id) return undefined;
  const label = typeof raw.label === 'string' && raw.label.trim()
    ? raw.label.trim()
    : typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : id;
  return { id, label };
}

function architectureOverviewMermaidFromJson(doc) {
  if (!doc || typeof doc !== 'object') return undefined;
  const rawNodes = objects(doc.layers).length ? objects(doc.layers) : objects(doc.nodes);
  const nodes = rawNodes.map(nodeIdentity).filter(Boolean);
  if (nodes.length < 2) return undefined;
  const lines = ['flowchart TD'];
  const seen = new Set();
  for (const node of nodes) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    lines.push(`  ${mermaidSafeId(node.id)}["${mermaidSafeLabel(node.label)}"]`);
  }
  for (const edge of objects(doc.edges)) {
    const source = typeof edge.source === 'string' ? edge.source : typeof edge.from === 'string' ? edge.from : '';
    const target = typeof edge.target === 'string' ? edge.target : typeof edge.to === 'string' ? edge.to : '';
    if (!source || !target) continue;
    lines.push(`  ${mermaidSafeId(source)} --> ${mermaidSafeId(target)}`);
  }
  return lines.length > 2 ? lines.join('\n') : undefined;
}

function featureCatalogMermaidFromJson(catalog, opts) {
  opts = opts || {};
  const features = objects(catalog?.[opts.listKey || 'features']);
  if (!features.length) return undefined;
  const GENERIC_DIR = new Set([
    'src', 'source', 'sources', 'lib', 'libs', 'test', 'tests', 'spec', '__tests__',
    'include', 'internal', 'public', 'main', 'resources', 'assets', 'classes',
    'node_modules', 'features', 'feature',
  ]);
  const fieldString = (raw, keys) => {
    for (const key of keys) {
      const value = raw[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  };
  const childIds = (raw) => {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      if (typeof item === 'string' && item.trim()) return [item.trim()];
      if (item && typeof item === 'object' && !Array.isArray(item) && typeof item.id === 'string' && item.id.trim()) {
        return [item.id.trim()];
      }
      return [];
    });
  };
  const wouldCycle = (parentOf, child, parent) => {
    let current = parent;
    const seen = new Set();
    while (current) {
      if (current === child) return true;
      if (seen.has(current)) return true;
      seen.add(current);
      current = parentOf.get(current) ?? '';
    }
    return false;
  };
  const setParent = (parentOf, child, parent) => {
    if (!child || !parent || child === parent || parentOf.has(child)) return;
    if (wouldCycle(parentOf, child, parent)) return;
    parentOf.set(child, parent);
  };
  const meaningfulDirs = (filePath) => {
    const parts = String(filePath).replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts.length > 1) parts.pop();
    return parts.filter((part) => !GENERIC_DIR.has(part.toLowerCase()));
  };
  const commonPrefix = (lists) => {
    if (!lists.length) return [];
    const prefix = [];
    for (let i = 0; ; i += 1) {
      const token = lists[0][i];
      if (!token || lists.some((list) => list[i] !== token)) return prefix;
      prefix.push(token);
    }
  };
  const idPrefix = (value) => {
    const match = String(value).match(/^([a-z][a-z0-9]{2,})[-_.]/i);
    return match?.[1]?.toLowerCase() ?? '';
  };
  const mermaidNodeId = (value) => {
    if (value === 'APP') return 'app';
    if (value === 'UI') return 'ui';
    if (value.startsWith('area:')) return mermaidSafeId(`area_${value.slice(5)}`);
    if (value.startsWith('dir:')) return mermaidSafeId(`dir_${value.slice(4)}`);
    if (value.startsWith('pfx:')) return mermaidSafeId(`pfx_${value.slice(4)}`);
    if (value.startsWith('entry:')) return mermaidSafeId(`entry_${value.slice(6)}`);
    return mermaidSafeId(`${opts.nodePrefix || 'feature'}_${value}`);
  };

  const rows = [];
  const seen = new Set();
  for (const feature of features) {
    const node = nodeIdentity(feature);
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    rows.push({ id: node.id, label: fieldString(feature, ['name']) || node.label, raw: feature });
  }
  if (!rows.length) return undefined;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const parentOf = new Map();
  const groups = new Map();

  for (const row of rows) {
    for (const child of childIds(row.raw.children)) {
      if (byId.has(child)) setParent(parentOf, child, row.id);
    }
  }
  for (const row of rows) {
    const parent = fieldString(row.raw, ['parent', 'parentId', 'parent_id']);
    if (parent && byId.has(parent)) setParent(parentOf, row.id, parent);
  }
  for (const row of rows) {
    if (parentOf.has(row.id)) continue;
    const area = fieldString(row.raw, opts.groupKeys || ['area', 'domain', 'capability', 'module']);
    if (!area) continue;
    const key = `area:${area}`;
    groups.set(key, area);
    setParent(parentOf, row.id, key);
  }

  const dirLists = [];
  const dirsByFeature = new Map();
  for (const row of rows) {
    if (parentOf.has(row.id)) continue;
    const evidence = Array.isArray(row.raw.evidence) ? row.raw.evidence : [];
    const file = evidence.find((item) => typeof item === 'string' && item.trim());
    const dirs = file ? meaningfulDirs(file) : [];
    dirsByFeature.set(row.id, dirs);
    if (dirs.length) dirLists.push(dirs);
  }
  const parentLists = dirLists.map((dirs) => dirs.slice(0, Math.max(0, dirs.length - 1))).filter((dirs) => dirs.length);
  const shared = commonPrefix(parentLists);
  for (const [id, dirs] of dirsByFeature) {
    if (!dirs.length) continue;
    const top = dirs.slice(shared.length)[0] ?? dirs[dirs.length - 1];
    const key = `dir:${top}`;
    groups.set(key, top);
    setParent(parentOf, id, key);
  }

  if (opts.useIdPrefix !== false) {
    const prefixCount = new Map();
    const prefixOf = new Map();
    for (const row of rows) {
      if (parentOf.has(row.id)) continue;
      const prefix = idPrefix(row.id);
      if (!prefix) continue;
      prefixOf.set(row.id, prefix);
      prefixCount.set(prefix, (prefixCount.get(prefix) ?? 0) + 1);
    }
    for (const [id, prefix] of prefixOf) {
      if ((prefixCount.get(prefix) ?? 0) < 2) continue;
      const key = `pfx:${prefix}`;
      groups.set(key, prefix);
      setParent(parentOf, id, key);
    }
  }

  const rootId = opts.rootId || 'APP';
  const rootLabel = opts.rootLabel || 'APP';
  const lines = ['flowchart TD', `  ${mermaidNodeId(rootId)}["${mermaidSafeLabel(rootLabel)}"]`];
  const drawn = new Set([rootId]);
  const draw = (id, label) => {
    if (drawn.has(id)) return;
    drawn.add(id);
    lines.push(`  ${mermaidNodeId(id)}["${mermaidSafeLabel(label)}"]`);
  };
  for (const [id, label] of [...groups.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
    draw(id, label);
    lines.push(`  ${mermaidNodeId(rootId)} --> ${mermaidNodeId(id)}`);
  }
  for (const row of [...rows].sort((a, b) => a.label.localeCompare(b.label))) {
    draw(row.id, row.label);
    const parent = parentOf.get(row.id) ?? rootId;
    lines.push(`  ${mermaidNodeId(parent)} --> ${mermaidNodeId(row.id)}`);
  }
  for (const row of rows) {
    const entries = objects(row.raw.entrypoints).slice(0, 4);
    entries.forEach((entry, index) => {
      const label = fieldString(entry, ['label', 'name', 'symbol', 'file']) || `entry ${index + 1}`;
      const id = `entry:${row.id}:${index}`;
      lines.push(`  ${mermaidNodeId(id)}["${mermaidSafeLabel(label)}"]`);
      lines.push(`  ${mermaidNodeId(row.id)} --> ${mermaidNodeId(id)}`);
    });
  }
  return lines.join('\n');
}

function screenCatalogMermaidFromJson(catalog) {
  if (!catalog) return undefined;
  return featureCatalogMermaidFromJson(catalog, {
    listKey: objects(catalog.screens).length ? 'screens' : 'features',
    rootId: 'UI',
    rootLabel: 'UI',
    groupKeys: ['flow', 'tab', 'area', 'nav', 'section'],
    useIdPrefix: false,
    nodePrefix: 'screen',
  });
}

function isPlaceholderMermaid(text) {
  return /not generated yet/i.test(text);
}

function needsMermaidFile(file) {
  if (!exists(file)) return true;
  const text = readText(file).trim();
  return !text || !isMermaidDiagram(text) || isPlaceholderMermaid(text);
}

/**
 * Write canonical project mermaid next to the JSON. Do not look in epic
 * artifacts or ARCHITECTURE-MAP.md. Creates the .mmd if it is missing.
 */
export function ensureProjectVisualizationMermaid(workspaceRoot) {
  const created = [];
  const abs = (rel) => path.join(workspaceRoot, rel);
  const writeIfNeeded = (rel, body) => {
    const file = abs(rel);
    if (!needsMermaidFile(file)) return;
    const next = body.endsWith('\n') ? body : `${body}\n`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next, 'utf8');
    created.push(rel);
  };
  let architecture;
  try {
    architecture = exists(abs(PROJECT_VIZ.architectureJson))
      ? readJson(abs(PROJECT_VIZ.architectureJson))
      : undefined;
  } catch {
    architecture = undefined;
  }
  let catalog;
  try {
    catalog = exists(abs(PROJECT_VIZ.catalogJson))
      ? readJson(abs(PROJECT_VIZ.catalogJson))
      : undefined;
  } catch {
    catalog = undefined;
  }
  let screens;
  try {
    screens = exists(abs(PROJECT_VIZ.screensJson))
      ? readJson(abs(PROJECT_VIZ.screensJson))
      : undefined;
  } catch {
    screens = undefined;
  }
  writeIfNeeded(
    PROJECT_VIZ.architectureMmd,
    architectureOverviewMermaidFromJson(architecture)
      || 'flowchart TD\n  pending["Project architecture not generated yet"]\n',
  );
  const catalogMermaid = featureCatalogMermaidFromJson(catalog);
  if (catalogMermaid) {
    const file = abs(PROJECT_VIZ.catalogMmd);
    const next = catalogMermaid.endsWith('\n') ? catalogMermaid : `${catalogMermaid}\n`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!exists(file) || readText(file) !== next) {
      fs.writeFileSync(file, next, 'utf8');
      created.push(PROJECT_VIZ.catalogMmd);
    }
  } else {
    writeIfNeeded(
      PROJECT_VIZ.catalogMmd,
      'flowchart TD\n  app["APP"]\n  app --> pending["Feature catalog not generated yet"]\n',
    );
  }
  const screensMermaid = screenCatalogMermaidFromJson(screens);
  if (screensMermaid) {
    const file = abs(PROJECT_VIZ.screensMmd);
    const next = screensMermaid.endsWith('\n') ? screensMermaid : `${screensMermaid}\n`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!exists(file) || readText(file) !== next) {
      fs.writeFileSync(file, next, 'utf8');
      created.push(PROJECT_VIZ.screensMmd);
    }
  } else {
    writeIfNeeded(
      PROJECT_VIZ.screensMmd,
      'flowchart TD\n  ui["UI"]\n  ui --> pending["Screen catalog not generated yet"]\n',
    );
  }
  return created;
}
