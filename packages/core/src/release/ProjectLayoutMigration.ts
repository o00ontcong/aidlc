/**
 * Preview/apply support for the standard AIDLC project layout (W4A).
 *
 * It is deliberately additive: it never rewrites CLAUDE.md or AGENTS.md,
 * never deletes legacy layout files, and requires an explicit confirmation
 * before creating a file. Legacy state projection is owned by W2B.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

import {
  createDefaultArtifactPolicy,
  createDefaultAutonomyPolicy,
  resolveArtifactDescriptor,
  type ArtifactPolicy,
} from '../contracts';
import { writeFileAtomic } from '../epic';
import { verifyWorkspacePath, type VerificationCheck } from './ReleaseVerification';

export interface CanonicalAsset { path: string; content: string; kind: 'agent' | 'skill'; }
export interface LayoutMigrationInput {
  canonicalAssets?: CanonicalAsset[];
  artifactPolicy?: ArtifactPolicy;
  artifactCandidates?: Array<{ type: string; source: string; epicId: string }>;
}
export type LayoutDisposition = 'create' | 'update-managed' | 'unchanged' | 'conflict' | 'skipped';
export interface LayoutMigrationItem { path: string; disposition: LayoutDisposition; reason: string; content?: string; }
export interface ProjectLayoutPreview {
  schemaVersion: 1;
  id: string;
  items: LayoutMigrationItem[];
  preservedFiles: string[];
  safetyChecks: VerificationCheck[];
}
export interface ProjectLayoutManifest {
  schemaVersion: 1;
  id: string;
  appliedAt: string;
  createdFiles: string[];
  lockFile: string;
}

const RUNTIME_IGNORE_LINES = ['.aidlc/runtime/', '.aidlc/cache/', '.aidlc/epics/*/events.ndjson'];
const LOCK_FILE = '.aidlc/locks/canonical-assets.json';

function sha256(content: string): string { return crypto.createHash('sha256').update(content).digest('hex'); }
function normalized(relative: string): string { return relative.replace(/\\/g, '/'); }

function safeTarget(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  const relativeToRoot = path.relative(path.resolve(root), target);
  if (relativeToRoot === '..' || relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Refusing project-layout path outside the workspace: ${relative}`);
  }
  return target;
}

function dispositionFor(root: string, relative: string, content: string): LayoutMigrationItem {
  const target = safeTarget(root, relative);
  if (!fs.existsSync(target)) return { path: normalized(relative), disposition: 'create', reason: 'Missing standard-layout file.', content };
  const existing = fs.readFileSync(target, 'utf8');
  if (existing === content) return { path: normalized(relative), disposition: 'unchanged', reason: 'Existing content already matches.', content };
  return { path: normalized(relative), disposition: 'conflict', reason: 'Existing user-managed content differs; migration will not overwrite it.', content };
}

function gitignoreDisposition(root: string): LayoutMigrationItem {
  const file = path.join(root, '.gitignore');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
  const content = ignoreContent(existing);
  if (existing === undefined) return { path: '.gitignore', disposition: 'create', reason: 'Missing runtime/cache ignore rules.', content };
  if (existing === content) return { path: '.gitignore', disposition: 'unchanged', reason: 'Runtime/cache ignore rules are already present.', content };
  return { path: '.gitignore', disposition: 'update-managed', reason: 'Append missing AIDLC runtime/cache ignore rules without replacing existing rules.', content };
}

function ignoreContent(existing: string | undefined): string {
  const lines = existing?.split(/\r?\n/) ?? [];
  for (const line of RUNTIME_IGNORE_LINES) if (!lines.includes(line)) lines.push(line);
  return `${lines.filter((line, index) => line || index < lines.length - 1).join('\n').replace(/\n*$/, '')}\n`;
}

/** Service for non-destructive standard-layout migration. */
export class ProjectLayoutMigrationService {
  constructor(private readonly workspaceRoot: string, private readonly now: () => string = () => new Date().toISOString()) {}

  preview(input: LayoutMigrationInput = {}): ProjectLayoutPreview {
    const defaults: Array<[string, string]> = [
      ['.aidlc/project.yaml', yaml.dump({
        schemaVersion: 1,
        projectId: path.basename(path.resolve(this.workspaceRoot)),
        generatedAt: this.now(),
        revision: 0,
        analysisStatus: 'uninitialized',
        facts: [],
      }, { noRefs: true })],
      ['.aidlc/autonomy.yaml', (() => {
        const autonomy = createDefaultAutonomyPolicy();
        return yaml.dump({ schemaVersion: 1, default: autonomy.default, stages: autonomy.stages, gates: autonomy.gates, recovery: {
          max_attempts: autonomy.recovery.maxAttempts,
          on_validation_failure: autonomy.recovery.onValidationFailure,
          on_ambiguous_requirement: autonomy.recovery.onAmbiguousRequirement,
        } }, { noRefs: true });
      })()],
      ['.aidlc/artifacts.yaml', yaml.dump(input.artifactPolicy ?? createDefaultArtifactPolicy(), { noRefs: true })],
      ['.aidlc/workflows/default.yaml', yaml.dump({ schemaVersion: 1, pack: 'sdlc-core', profile: 'standard' }, { noRefs: true })],
      ['.claude/settings.json', `${JSON.stringify({}, null, 2)}\n`],
    ];
    const items = defaults.map(([file, content]) => dispositionFor(this.workspaceRoot, file, content));
    items.push(gitignoreDisposition(this.workspaceRoot));
    for (const asset of input.canonicalAssets ?? []) {
      const base = asset.kind === 'agent' ? '.claude/agents' : '.claude/skills';
      items.push(dispositionFor(this.workspaceRoot, path.posix.join(base, asset.path), asset.content));
    }
    const policy = input.artifactPolicy ?? createDefaultArtifactPolicy();
    for (const artifact of input.artifactCandidates ?? []) {
      const descriptor = resolveArtifactDescriptor(policy, artifact.type);
      if (!descriptor?.commit) {
        items.push({ path: normalized(artifact.source), disposition: 'skipped', reason: 'Artifact policy does not approve this artifact for commit.' });
        continue;
      }
      const relative = descriptor.path.replace(/\{epic\}/g, artifact.epicId);
      const sourceCheck = verifyWorkspacePath(this.workspaceRoot, artifact.source);
      if (!sourceCheck.ok) throw new Error(`Refusing unsafe artifact source: ${sourceCheck.detail ?? artifact.source}`);
      items.push(dispositionFor(this.workspaceRoot, relative, fs.readFileSync(safeTarget(this.workspaceRoot, artifact.source), 'utf8')));
    }
    const safetyChecks = items.filter((item) => item.disposition !== 'skipped').map((item) => verifyWorkspacePath(this.workspaceRoot, item.path));
    const id = `layout-${sha256(items.map((item) => [item.path, item.disposition]).join('|')).slice(0, 16)}`;
    return { schemaVersion: 1, id, items, preservedFiles: ['CLAUDE.md', 'AGENTS.md'], safetyChecks };
  }

  apply(preview: ProjectLayoutPreview, confirm: boolean): ProjectLayoutManifest {
    if (!confirm) throw new Error('Project layout migration requires explicit confirm: true. Preview is read-only.');
    const conflicts = preview.items.filter((item) => item.disposition === 'conflict');
    if (conflicts.length) throw new Error(`Project layout migration has conflicts: ${conflicts.map((item) => item.path).join(', ')}`);
    const unsafe = preview.safetyChecks.filter((check) => !check.ok);
    if (unsafe.length) throw new Error(`Project layout migration has unsafe paths: ${unsafe.map((check) => check.detail ?? check.id).join(', ')}`);
    const createdFiles: string[] = [];
    const hashes: Record<string, string> = {};
    for (const item of preview.items) {
      if ((item.disposition !== 'create' && item.disposition !== 'update-managed') || item.content === undefined) continue;
      const target = safeTarget(this.workspaceRoot, item.path);
      writeFileAtomic(target, item.content);
      createdFiles.push(item.path);
    }
    for (const item of preview.items) {
      if ((item.path.startsWith('.claude/agents/') || item.path.startsWith('.claude/skills/')) && item.content && item.disposition !== 'skipped') hashes[item.path] = sha256(item.content);
    }
    const lockFile = safeTarget(this.workspaceRoot, LOCK_FILE);
    if (Object.keys(hashes).length) {
      writeFileAtomic(lockFile, `${JSON.stringify({ schemaVersion: 1, assets: hashes }, null, 2)}\n`);
      createdFiles.push(LOCK_FILE);
    }
    return { schemaVersion: 1, id: preview.id, appliedAt: this.now(), createdFiles, lockFile };
  }
}
