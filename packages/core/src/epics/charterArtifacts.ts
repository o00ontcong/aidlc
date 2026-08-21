/**
 * Shared project charter artifacts for Project Workspace.
 *
 * Seeds Intent + Conventions once under `docs/project/`, validates machine-
 * readable `CHARTER.json`, and projects a marked summary into repo rule files
 * (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules/aidlc-charter.mdc`).
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export const CHARTER_MD_FILES = [
  'NORTH-STAR.md',
  'ARCHITECTURE-PRINCIPLES.md',
  'TECH-POLICY.md',
] as const;

export const CHARTER_REL_DIR = path.join('docs', 'project', 'charter');
export const CONVENTIONS_REL = path.join('docs', 'project', 'conventions', 'CONVENTIONS.md');
export const DRIFT_REPORT_REL = path.join('docs', 'project', 'conformance', 'DRIFT-REPORT.md');
export const CHARTER_JSON_REL = path.join(CHARTER_REL_DIR, 'CHARTER.json');

export const RULES_SYNC_TARGETS = [
  'CLAUDE.md',
  'AGENTS.md',
  path.join('.cursor', 'rules', 'aidlc-charter.mdc'),
] as const;

export const CHARTER_MARKER_START_RE =
  /<!--\s*aidlc:charter start\s*·\s*revision\s+(\d+)\s*·\s*(sha256:[0-9a-f]{64})\s*-->/i;
export const CHARTER_MARKER_END_RE = /<!--\s*aidlc:charter end\s*-->/i;

export type InvariantSeverity = 'advisory' | 'blocking';
export type TechRuleKind = 'must-use' | 'forbidden' | 'allowed';

export interface CharterGoal {
  id: string;
  title: string;
  metric: string;
  status: string;
  confidence?: 'low' | 'medium' | 'high';
  confirmation?: 'pending' | 'confirmed';
  sources?: string[];
}

export interface CharterInvariant {
  id: string;
  rule: string;
  scope: string[];
  severity: InvariantSeverity;
  confidence?: 'low' | 'medium' | 'high';
  confirmation?: 'pending' | 'confirmed';
  sources?: string[];
}

export interface CharterTechRule {
  id: string;
  kind: TechRuleKind;
  value: string;
  reason: string;
  confidence?: 'low' | 'medium' | 'high';
  confirmation?: 'pending' | 'confirmed';
  sources?: string[];
}

export interface DeliveryBudget {
  maxFilesPerPackage: number;
  maxTasksPerPackage: number;
}

export interface ShipPolicy {
  requirePullRequest: boolean;
  forbidAgentMergeToDefaultBranch: boolean;
  defaultBranch: string;
  allowAiAssistReview: boolean;
  /** Explicit escape hatch for repositories without a PR provider. Defaults false. */
  allowLocalMergeWithHumanOnly?: boolean;
}

export interface CharterDocument {
  revision: number;
  hash: string;
  status?: 'provisional' | 'confirmed';
  origin?: 'interactive' | 'existing-project-inference';
  generatedAt?: string;
  goals: CharterGoal[];
  nonGoals: string[];
  invariants: CharterInvariant[];
  techRules: CharterTechRule[];
  protectedPaths: string[];
  deliveryBudget: DeliveryBudget;
  requiredQualityGates: string[];
  shipPolicy: ShipPolicy;
}

export interface SeedCharterResult {
  seeded: string[];
  skipped: string[];
  charterPath: string;
  hash: string;
  revision: number;
}

export interface SyncProjectRulesResult {
  written: string[];
  revision: number;
  hash: string;
}

export interface RecordHumanCharterEditResult extends SyncProjectRulesResult {
  charterPath: string;
  status: 'provisional' | 'confirmed';
  confirmedIds: string[];
}

/** Resolve bundled charter templates (packages/core/templates/…). */
export function defaultCharterTemplatesDir(): string {
  // Core layout: dist/epics → ../../templates/project-workspace/artifacts
  // Extension bundle: out → ../templates/project-workspace/artifacts
  // Extension root (if __dirname is already extensionPath): ./templates/...
  const candidates = [
    path.join(__dirname, '..', '..', 'templates', 'project-workspace', 'artifacts'),
    path.join(__dirname, '..', 'templates', 'project-workspace', 'artifacts'),
    path.join(__dirname, 'templates', 'project-workspace', 'artifacts'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'charter', 'NORTH-STAR.md'))) {
      return dir;
    }
  }
  return candidates[0]!;
}

export function sha256Text(text: string | Buffer): string {
  return `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;
}

export function sha256File(file: string): string {
  return sha256Text(fs.readFileSync(file));
}

/** Stable hash of the three Intent Markdown files (canonical order). */
export function computeCharterMarkdownHash(charterDir: string): string {
  const parts: Buffer[] = [];
  for (const name of CHARTER_MD_FILES) {
    const file = path.join(charterDir, name);
    if (!fs.existsSync(file)) {
      throw new Error(`Missing charter markdown: ${name}`);
    }
    parts.push(fs.readFileSync(file));
  }
  return sha256Text(Buffer.concat(parts));
}

export function readCharterJson(workspaceRoot: string): CharterDocument {
  const file = path.join(workspaceRoot, CHARTER_JSON_REL);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as CharterDocument;
}

/**
 * Reconcile human edits to an inferred charter. Markdown remains canonical for
 * the charter hash; CHARTER.json remains canonical for structured policy. The
 * caller may confirm every inferred item or only a selected set of IDs.
 */
export function recordHumanCharterEdit(
  workspaceRoot: string,
  options: { confirmIds?: string[]; confirmAll?: boolean } = {},
): RecordHumanCharterEditResult {
  const charterPath = path.join(workspaceRoot, CHARTER_JSON_REL);
  if (!fs.existsSync(charterPath)) throw new Error(`Missing ${CHARTER_JSON_REL}`);
  const charter = readCharterJson(workspaceRoot);
  const selected = new Set(options.confirmIds ?? []);
  const confirmAll = options.confirmAll ?? selected.size === 0;
  const knownIds = new Set<string>();
  const confirmedIds: string[] = [];
  const confirm = <T extends { id: string; confirmation?: 'pending' | 'confirmed' }>(item: T): T => {
    knownIds.add(item.id);
    if (confirmAll || selected.has(item.id)) {
      confirmedIds.push(item.id);
      return { ...item, confirmation: 'confirmed' };
    }
    return item;
  };
  charter.goals = charter.goals.map(confirm);
  charter.invariants = charter.invariants.map(confirm);
  charter.techRules = charter.techRules.map(confirm);
  const unknown = [...selected].filter((id) => !knownIds.has(id));
  if (unknown.length) throw new Error(`Unknown charter item id(s): ${unknown.join(', ')}`);

  charter.hash = computeCharterMarkdownHash(path.join(workspaceRoot, CHARTER_REL_DIR));
  charter.revision = Math.max(0, Number(charter.revision) || 0) + 1;
  charter.generatedAt = new Date().toISOString();
  const items = [...charter.goals, ...charter.invariants, ...charter.techRules];
  charter.status = items.every((item) => item.confirmation === 'confirmed')
    ? 'confirmed'
    : 'provisional';
  const temp = `${charterPath}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(charter, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, charterPath);
  const synced = syncProjectRules(workspaceRoot);
  return { ...synced, charterPath, status: charter.status, confirmedIds };
}

function readTemplate(templatesRoot: string, relParts: string[]): string {
  const file = path.join(templatesRoot, ...relParts);
  if (!fs.existsSync(file)) {
    throw new Error(`Charter template missing: ${relParts.join('/')}`);
  }
  return fs.readFileSync(file, 'utf8');
}

function writeIfAbsent(abs: string, content: string, seeded: string[], skipped: string[], workspaceRoot: string): void {
  const rel = path.relative(workspaceRoot, abs);
  if (fs.existsSync(abs)) {
    skipped.push(rel);
    return;
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  seeded.push(rel);
}

function defaultCharterDocument(hash: string): CharterDocument {
  return {
    revision: 1,
    hash,
    goals: [
      {
        id: 'G-1',
        title: 'Deliver cohesive, reviewable change',
        metric:
          'Every feature ships through project-context → feature contract → work packages with passing required quality gates.',
        status: 'active',
      },
    ],
    nonGoals: [
      'Rewriting the entire codebase in one epic',
      'Bypassing charter invariants for convenience',
    ],
    invariants: [
      {
        id: 'INV-1',
        rule: 'Feature and package work inherit charter goals and constraints; they must not redefine project north-star intent.',
        scope: ['docs/project/charter/**', 'docs/epics/**/artifacts/**'],
        severity: 'advisory',
      },
    ],
    techRules: [
      {
        id: 'T-1',
        kind: 'must-use',
        value: 'repository package manager and configured quality commands',
        reason: 'Keep delivery gates and local agent runs consistent with CI.',
      },
    ],
    protectedPaths: ['docs/project/charter/**'],
    deliveryBudget: { maxFilesPerPackage: 12, maxTasksPerPackage: 6 },
    requiredQualityGates: ['test', 'lint', 'typecheck'],
    shipPolicy: {
      requirePullRequest: true,
      forbidAgentMergeToDefaultBranch: true,
      defaultBranch: 'main',
      allowAiAssistReview: true,
      allowLocalMergeWithHumanOnly: false,
    },
  };
}

/**
 * Seed project charter + conventions once. Existing files are left untouched.
 * When `CHARTER.json` is missing, it is generated from the three Markdown files
 * (hash) plus bootstrap defaults (advisory invariants).
 */
export function seedCharterArtifacts(
  workspaceRoot: string,
  options: { templatesRoot?: string } = {},
): SeedCharterResult {
  const templatesRoot = options.templatesRoot ?? defaultCharterTemplatesDir();
  const seeded: string[] = [];
  const skipped: string[] = [];

  const charterDir = path.join(workspaceRoot, CHARTER_REL_DIR);
  for (const name of CHARTER_MD_FILES) {
    const abs = path.join(charterDir, name);
    const rel = path.relative(workspaceRoot, abs);
    if (fs.existsSync(abs)) {
      skipped.push(rel);
      continue;
    }
    writeIfAbsent(
      abs,
      readTemplate(templatesRoot, ['charter', name]),
      seeded,
      skipped,
      workspaceRoot,
    );
  }

  {
    const abs = path.join(workspaceRoot, CONVENTIONS_REL);
    const rel = path.relative(workspaceRoot, abs);
    if (fs.existsSync(abs)) {
      skipped.push(rel);
    } else {
      writeIfAbsent(
        abs,
        readTemplate(templatesRoot, ['conventions', 'CONVENTIONS.md']),
        seeded,
        skipped,
        workspaceRoot,
      );
    }
  }

  {
    const abs = path.join(workspaceRoot, DRIFT_REPORT_REL);
    const rel = path.relative(workspaceRoot, abs);
    if (fs.existsSync(abs)) {
      skipped.push(rel);
    } else {
      writeIfAbsent(
        abs,
        readTemplate(templatesRoot, ['conformance', 'DRIFT-REPORT.md']),
        seeded,
        skipped,
        workspaceRoot,
      );
    }
  }

  const charterJsonAbs = path.join(workspaceRoot, CHARTER_JSON_REL);
  let hash: string;
  let revision: number;
  if (fs.existsSync(charterJsonAbs)) {
    skipped.push(CHARTER_JSON_REL);
    const existing = JSON.parse(fs.readFileSync(charterJsonAbs, 'utf8')) as CharterDocument;
    hash = existing.hash;
    revision = existing.revision;
  } else {
    hash = computeCharterMarkdownHash(charterDir);
    const doc = defaultCharterDocument(hash);
    fs.mkdirSync(path.dirname(charterJsonAbs), { recursive: true });
    fs.writeFileSync(charterJsonAbs, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    seeded.push(CHARTER_JSON_REL);
    revision = doc.revision;
  }

  return { seeded, skipped, charterPath: charterJsonAbs, hash, revision };
}

function conventionsSummary(conventionsMd: string): string {
  const lines = conventionsMd
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('>'));
  const picked = lines.slice(0, 12);
  return picked.length ? picked.map((l) => `- ${l.replace(/^[-*]\s*/, '')}`).join('\n') : '- (see CONVENTIONS.md)';
}

/** Build the marked projection body (without surrounding file content). */
export function buildCharterRulesBlock(charter: CharterDocument, conventionsMd: string): string {
  const goals = charter.goals
    .map((g) => `- ${g.id}: ${g.title} — metric: ${g.metric}`)
    .join('\n');
  const invariants = charter.invariants
    .map((i) => `- ${i.id} [${i.severity}]: ${i.rule}`)
    .join('\n');
  const tech = charter.techRules
    .map((t) => `- ${t.id} (${t.kind}): ${t.value} — ${t.reason}`)
    .join('\n');
  const protectedPaths = (charter.protectedPaths ?? []).map((p) => `- ${p}`).join('\n');
  const gates = (charter.requiredQualityGates ?? []).join(', ');
  const ship = charter.shipPolicy
    ? `PR required=${charter.shipPolicy.requirePullRequest}; forbid agent merge to ${charter.shipPolicy.defaultBranch}=${charter.shipPolicy.forbidAgentMergeToDefaultBranch}; AI assist review=${charter.shipPolicy.allowAiAssistReview}`
    : '(missing shipPolicy)';

  const body = [
    '## AIDLC Project Charter (projected)',
    '',
    'Human-owned Intent. Do not weaken invariants, protected paths, or quality gates.',
    '',
    '### Goals',
    goals || '- (none)',
    '',
    '### Invariants',
    invariants || '- (none)',
    '',
    '### Tech rules',
    tech || '- (none)',
    '',
    '### Protected paths',
    protectedPaths || '- (none)',
    '',
    `### Quality gates: ${gates || '(none)'}`,
    `### Ship policy: ${ship}`,
    `### Delivery budget: maxFiles=${charter.deliveryBudget?.maxFilesPerPackage ?? '?'}, maxTasks=${charter.deliveryBudget?.maxTasksPerPackage ?? '?'}`,
    '',
    '### Conventions (summary)',
    conventionsSummary(conventionsMd),
  ].join('\n');

  return [
    `<!-- aidlc:charter start · revision ${charter.revision} · ${charter.hash} -->`,
    body,
    '<!-- aidlc:charter end -->',
  ].join('\n');
}

function upsertMarkedBlock(existing: string, block: string): string {
  const start = existing.search(CHARTER_MARKER_START_RE);
  const endMatch = existing.match(CHARTER_MARKER_END_RE);
  if (start >= 0 && endMatch && endMatch.index !== undefined && endMatch.index >= start) {
    const end = endMatch.index + endMatch[0].length;
    return `${existing.slice(0, start).replace(/\s*$/, '')}\n\n${block}\n${existing.slice(end).replace(/^\s*/, '\n')}`.replace(/\n{3,}/g, '\n\n');
  }
  const trimmed = existing.replace(/\s*$/, '');
  return trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
}

/**
 * Project charter + conventions into rule files (one-way). Creates targets when
 * missing; replaces an existing aidlc:charter marked block in place.
 */
export function syncProjectRules(workspaceRoot: string): SyncProjectRulesResult {
  const charter = readCharterJson(workspaceRoot);
  const conventionsPath = path.join(workspaceRoot, CONVENTIONS_REL);
  if (!fs.existsSync(conventionsPath)) {
    throw new Error(`Missing ${CONVENTIONS_REL}`);
  }
  const conventionsMd = fs.readFileSync(conventionsPath, 'utf8');
  const block = buildCharterRulesBlock(charter, conventionsMd);
  const written: string[] = [];

  for (const rel of RULES_SYNC_TARGETS) {
    const abs = path.join(workspaceRoot, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const prev = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    const next = upsertMarkedBlock(prev, block);
    fs.writeFileSync(abs, next, 'utf8');
    written.push(rel);
  }

  return { written, revision: charter.revision, hash: charter.hash };
}

export function parseCharterMarker(text: string): { revision: number; hash: string } | null {
  const m = text.match(CHARTER_MARKER_START_RE);
  if (!m) { return null; }
  if (!CHARTER_MARKER_END_RE.test(text)) { return null; }
  return { revision: Number(m[1]), hash: m[2].toLowerCase() };
}
