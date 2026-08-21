import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const LEGACY_COHESIVE_PIPELINE_IDS = new Set([
  'cohesive-feature',
  'cohesive-work-package',
]);

const LEGACY_ASSET_PREFIXES = ['aidlc-cohesive-', 'cohesive-'];
const LEGACY_COMMAND_PREFIXES = ['/cohesive-feature-', '/cohesive-work-package-'];

export interface LegacyCohesiveSummary {
  present: boolean;
  agents: number;
  skills: number;
  pipelines: number;
  commands: number;
  recipes: number;
  executionProfile: boolean;
}

export interface LegacyCleanupReport extends LegacyCohesiveSummary {
  changed: boolean;
  archivedPaths: string[];
  backupDir?: string;
}

type LooseEntry = Record<string, unknown>;
type LooseWorkspace = Record<string, unknown>;

function entries(value: unknown): LooseEntry[] {
  return Array.isArray(value)
    ? value.filter((item): item is LooseEntry => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : [];
}

function idOf(entry: LooseEntry): string {
  return typeof entry.id === 'string' ? entry.id : '';
}

function isLegacyAgent(id: string): boolean {
  return LEGACY_ASSET_PREFIXES.some((prefix) => id.startsWith(prefix));
}

function isLegacySkill(id: string): boolean {
  return LEGACY_ASSET_PREFIXES.some((prefix) => id.startsWith(prefix));
}

function isLegacyCommand(entry: LooseEntry): boolean {
  const name = typeof entry.name === 'string' ? entry.name : '';
  const agent = typeof entry.agent === 'string' ? entry.agent : '';
  return isLegacyAgent(agent) || LEGACY_COMMAND_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function isLegacyRecipe(entry: LooseEntry): boolean {
  const source = typeof entry.from === 'string' ? entry.from : '';
  return LEGACY_COHESIVE_PIPELINE_IDS.has(source);
}

export function summarizeLegacyCohesive(doc: unknown): LegacyCohesiveSummary {
  const workspace = doc && typeof doc === 'object' && !Array.isArray(doc) ? doc as LooseWorkspace : {};
  const agents = entries(workspace.agents).filter((entry) => isLegacyAgent(idOf(entry))).length;
  const skills = entries(workspace.skills).filter((entry) => isLegacySkill(idOf(entry))).length;
  const pipelines = entries(workspace.pipelines).filter((entry) => LEGACY_COHESIVE_PIPELINE_IDS.has(idOf(entry))).length;
  const commands = entries(workspace.slash_commands).filter(isLegacyCommand).length;
  const recipes = entries(workspace.recipes).filter(isLegacyRecipe).length;
  const executionProfile = Boolean(workspace.cohesive_delivery);
  return {
    present: agents + skills + pipelines + commands + recipes > 0 || executionProfile,
    agents,
    skills,
    pipelines,
    commands,
    recipes,
    executionProfile,
  };
}

/** Mutates the parsed YAML document, removing only retired Cohesive identifiers. */
export function stripLegacyCohesiveEntries(doc: LooseWorkspace): LegacyCohesiveSummary {
  const before = summarizeLegacyCohesive(doc);
  if (!before.present) { return before; }
  doc.agents = entries(doc.agents).filter((entry) => !isLegacyAgent(idOf(entry)));
  doc.skills = entries(doc.skills).filter((entry) => !isLegacySkill(idOf(entry)));
  doc.pipelines = entries(doc.pipelines).filter((entry) => !LEGACY_COHESIVE_PIPELINE_IDS.has(idOf(entry)));
  doc.slash_commands = entries(doc.slash_commands).filter((entry) => !isLegacyCommand(entry));
  doc.recipes = entries(doc.recipes).filter((entry) => !isLegacyRecipe(entry));
  delete doc.cohesive_delivery;
  return before;
}

export function isLegacyCohesiveAssetId(id: string): boolean {
  return isLegacyAgent(id) || isLegacySkill(id) || LEGACY_COHESIVE_PIPELINE_IDS.has(id);
}

const RETIRED_VALIDATORS = [
  'await-packages.mjs',
  'charter.mjs',
  'charter.mjs.aidlc-new',
  'charter-alignment.mjs',
  'diff-review.mjs',
  'feature-contract.mjs',
  'feature-contract.mjs.aidlc-new',
  'integration-cohesion.mjs',
  'integration-cohesion.mjs.aidlc-new',
  'package-context.mjs',
  'package-result.mjs',
  'package-review.mjs',
  'rules-sync.mjs',
  'work-packages.mjs',
  'worktree-state.mjs',
];

function legacyProjectPaths(workspaceRoot: string): string[] {
  const paths = [
    path.join(workspaceRoot, '.aidlc', 'locks', 'cohesive-delivery.json'),
    path.join(workspaceRoot, '.aidlc', 'aidlc-templates', 'cohesive-feature'),
    path.join(workspaceRoot, '.aidlc', 'aidlc-templates', 'cohesive-work-package'),
    path.join(workspaceRoot, '.claude', 'commands', 'aidlc-autonomous-delivery.md'),
    path.join(workspaceRoot, '.claude', 'commands', 'aidlc-autonomous-epic.md'),
    path.join(workspaceRoot, '.cursor', 'commands', 'aidlc-autonomous-delivery.md'),
    path.join(workspaceRoot, '.cursor', 'commands', 'aidlc-autonomous-epic.md'),
    path.join(workspaceRoot, '.cursor', 'skills', 'aidlc-autonomous-delivery'),
    path.join(workspaceRoot, '.cursor', 'skills', 'aidlc-autonomous-epic'),
    path.join(workspaceRoot, '.codex', 'skills', 'aidlc-aidlc-autonomous-delivery'),
    path.join(workspaceRoot, '.codex', 'skills', 'aidlc-aidlc-autonomous-epic'),
    path.join(workspaceRoot, '.opencode', 'commands', 'aidlc-autonomous-delivery.md'),
    path.join(workspaceRoot, '.opencode', 'commands', 'aidlc-autonomous-epic.md'),
    ...RETIRED_VALIDATORS.map((name) => path.join(workspaceRoot, '.aidlc', 'validators', name)),
  ];
  const migrationRoot = path.join(workspaceRoot, '.aidlc', 'migration-backups');
  try {
    for (const name of fs.readdirSync(migrationRoot)) {
      if (name.startsWith('cohesive-')) { paths.push(path.join(migrationRoot, name)); }
    }
  } catch { /* no legacy migration directory */ }
  return paths;
}

function legacyGlobalPaths(homeDir: string): string[] {
  return [
    path.join(homeDir, '.claude', 'agents', 'aidlc-cohesive-feature-agent.md'),
    path.join(homeDir, '.claude', 'agents', 'aidlc-cohesive-work-package-agent.md'),
    path.join(homeDir, '.claude', 'agents', 'aidlc-cohesive-reviewer-agent.md'),
    path.join(homeDir, '.claude', 'skills', 'aidlc-cohesive-feature-workflow.md'),
    path.join(homeDir, '.claude', 'skills', 'aidlc-cohesive-work-package-workflow.md'),
    path.join(homeDir, '.claude', 'skills', 'aidlc-cohesive-reviewer-workflow.md'),
  ];
}

function archivePath(
  source: string,
  backupDir: string,
  label: 'project' | 'global',
  workspaceRoot: string,
  homeDir: string,
): string | undefined {
  if (!fs.existsSync(source)) { return undefined; }
  const safeRelative = label === 'project'
    ? path.relative(workspaceRoot, source)
    : path.relative(homeDir, source);
  const destination = path.join(backupDir, label, safeRelative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.renameSync(source, destination);
  return source;
}

/**
 * Moves retired project/global assets into a timestamped backup outside the
 * repository. This is only called from the explicit cleanup action.
 */
export function archiveLegacyCohesiveAssets(
  workspaceRoot: string,
  homeDir: string = os.homedir(),
): { backupDir?: string; archivedPaths: string[] } {
  const candidates = [
    ...legacyProjectPaths(workspaceRoot).map((source) => ({ source, label: 'project' as const })),
    ...legacyGlobalPaths(homeDir).map((source) => ({ source, label: 'global' as const })),
  ].filter(({ source }) => fs.existsSync(source));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(
    homeDir,
    '.aidlc',
    'backups',
    path.basename(workspaceRoot),
    `legacy-cleanup-${stamp}`,
  );
  fs.mkdirSync(backupDir, { recursive: true });
  const workspaceFile = path.join(workspaceRoot, '.aidlc', 'workspace.yaml');
  if (fs.existsSync(workspaceFile)) {
    fs.copyFileSync(workspaceFile, path.join(backupDir, 'workspace.yaml.before-cleanup'));
  }
  const archivedPaths = candidates.flatMap(({ source, label }) => {
    const archived = archivePath(source, backupDir, label, workspaceRoot, homeDir);
    return archived ? [archived] : [];
  });

  const manifestPath = path.join(workspaceRoot, '.aidlc', 'validators', '.aidlc-validator-manifest.json');
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { files?: Record<string, unknown> };
    if (manifest.files && typeof manifest.files === 'object') {
      const retired = new Set(RETIRED_VALIDATORS);
      for (const key of Object.keys(manifest.files)) {
        if (retired.has(path.basename(key))) { delete manifest.files[key]; }
      }
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    }
  } catch { /* manifest is optional; cleanup remains valid without it */ }
  return { backupDir, archivedPaths };
}
