/** Explicit, reversible upgrade of the generated Cohesive Delivery bundle. */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { writeFileAtomic } from '../epic/EpicStore';
import { builtinTemplatesRoot, BUILTIN_WORKFLOWS, loadBuiltinPreset, writeBuiltinAutoReviewValidators } from '../presets/builtinWorkflows';
import type { PipelineConfig } from '../schema/WorkspaceSchema';
import { snapshotPipeline } from '../runs/PipelineSnapshot';
import type { RunState } from '../runs/RunState';

export const COHESIVE_DELIVERY_BUNDLE_VERSION = '2.0.0';
const WORKFLOW_ID = 'cohesive-delivery';
const MANIFEST_DIR = path.join('.aidlc', 'migration-backups');
const LOCK_RELATIVE = path.join('.aidlc', 'locks', 'cohesive-delivery.json');

export type CohesiveUpgradeStatus = 'preview' | 'applied' | 'rolled-back' | 'partial-failure';
export type CohesiveUpgradeDisposition = 'upgrade' | 'already-current' | 'conflict' | 'missing';
export interface CohesiveUpgradeItem { pipelineId: string; disposition: CohesiveUpgradeDisposition; currentSteps: string[]; targetSteps: string[]; warning?: string; }
export interface CohesiveUpgradePreview { schemaVersion: 1; id: string; createdAt: string; status: 'preview'; fromVersion: string; toVersion: string; workspaceFile: string; items: CohesiveUpgradeItem[]; activeRunIds: string[]; warnings: string[]; }
export interface CohesiveUpgradeManifest { schemaVersion: 1; id: string; createdAt: string; appliedAt?: string; status: CohesiveUpgradeStatus; backupDir: string; workspaceFile: string; workspaceBeforeHash?: string; workspaceAfterHash?: string; lockFile: string; activeRunIds: string[]; errors: string[]; }
export interface CohesiveBundleLock { schemaVersion: 1; workflowId: typeof WORKFLOW_ID; bundleVersion: string; installedAt: string; migrationId?: string; }

function now(): string { return new Date().toISOString(); }
function hash(content: string | Buffer): string { return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`; }
function idFor(source: string): string { return `cohesive-${hash(source).slice(7, 23)}`; }
function assertInside(root: string, target: string): string {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Unsafe Cohesive upgrade path: ${target}`);
  return path.resolve(target);
}
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stepName(step: unknown): string { const value = asRecord(step); return typeof step === 'string' ? step : typeof value.name === 'string' ? value.name : typeof value.agent === 'string' ? value.agent : ''; }
function desiredWorkspace(templatesRoot: string): Record<string, unknown> {
  const workflow = BUILTIN_WORKFLOWS.find((item) => item.id === WORKFLOW_ID);
  if (!workflow) throw new Error('Cohesive Delivery built-in workflow is unavailable.');
  return loadBuiltinPreset(templatesRoot, workflow).workspace as Record<string, unknown>;
}
function readLock(root: string): CohesiveBundleLock | null { try { const lock = JSON.parse(fs.readFileSync(path.join(root, LOCK_RELATIVE), 'utf8')) as CohesiveBundleLock; return lock.workflowId === WORKFLOW_ID ? lock : null; } catch { return null; } }
function parseWorkspace(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) throw new Error('Cohesive upgrade requires .aidlc/workspace.yaml. Apply the Cohesive Delivery preset first.');
  const parsed = yaml.load(fs.readFileSync(file, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('workspace.yaml must contain a mapping.');
  return parsed as Record<string, unknown>;
}
function pipelineEntries(doc: Record<string, unknown>): Record<string, unknown>[] { return Array.isArray(doc.pipelines) ? doc.pipelines.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : []; }
function activeRuns(root: string): Array<{ file: string; state: RunState }> {
  const dir = path.join(root, '.aidlc', 'runs'); if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.json')).flatMap((entry) => {
    const file = path.join(dir, entry.name); try { const state = JSON.parse(fs.readFileSync(file, 'utf8')) as RunState; return state.status === 'running' ? [{ file, state }] : []; } catch { return []; }
  });
}

export class CohesiveDeliveryUpgradeService {
  constructor(
    readonly workspaceRoot: string,
    private readonly clock: () => string = now,
    /** The extension bundle supplies its own templates directory; the CLI uses core's built-ins. */
    private readonly templatesRoot: string = builtinTemplatesRoot(),
  ) {}
  preview(): CohesiveUpgradePreview {
    const workspaceFile = path.join(this.workspaceRoot, '.aidlc', 'workspace.yaml'); const body = fs.existsSync(workspaceFile) ? fs.readFileSync(workspaceFile, 'utf8') : '';
    const current = parseWorkspace(workspaceFile); const desired = desiredWorkspace(this.templatesRoot); const existing = pipelineEntries(current); const target = pipelineEntries(desired);
    const items = target.map((next) => {
      const pipelineId = String(next.id); const currentPipeline = existing.find((item) => item.id === pipelineId); const targetSteps = (Array.isArray(next.steps) ? next.steps : []).map(stepName);
      if (!currentPipeline) return { pipelineId, disposition: 'missing' as const, currentSteps: [], targetSteps };
      const currentSteps = (Array.isArray(currentPipeline.steps) ? currentPipeline.steps : []).map(stepName);
      if (JSON.stringify(currentSteps) === JSON.stringify(targetSteps)) return { pipelineId, disposition: 'already-current' as const, currentSteps, targetSteps };
      const known = new Set(targetSteps); const safe = currentSteps.length > 0 && currentSteps.every((name) => known.has(name));
      return safe ? { pipelineId, disposition: 'upgrade' as const, currentSteps, targetSteps } : { pipelineId, disposition: 'conflict' as const, currentSteps, targetSteps, warning: 'Contains phase(s) not owned by the Cohesive bundle; preserved for a manual merge.' };
    });
    const runs = activeRuns(this.workspaceRoot).filter(({ state }) => items.some((item) => item.pipelineId === state.pipelineId)); const lock = readLock(this.workspaceRoot);
    return { schemaVersion: 1, id: idFor(`${body}\n${COHESIVE_DELIVERY_BUNDLE_VERSION}`), createdAt: this.clock(), status: 'preview', fromVersion: lock?.bundleVersion ?? 'legacy-unlocked', toVersion: COHESIVE_DELIVERY_BUNDLE_VERSION, workspaceFile, items, activeRunIds: runs.map(({ state }) => state.runId), warnings: [...items.filter((item) => item.disposition === 'conflict').map((item) => `${item.pipelineId}: ${item.warning}`), ...(runs.length ? [`${runs.length} active Cohesive run(s) will retain a frozen pipeline snapshot.`] : [])] };
  }
  manifestFile(id: string): string { if (!/^cohesive-[a-f0-9]{16}$/.test(id)) throw new Error(`Invalid Cohesive upgrade id: ${id}`); return path.join(this.workspaceRoot, MANIFEST_DIR, id, 'manifest.json'); }
  loadManifest(id: string): CohesiveUpgradeManifest | null { try { return JSON.parse(fs.readFileSync(this.manifestFile(id), 'utf8')) as CohesiveUpgradeManifest; } catch { return null; } }
  apply(preview: CohesiveUpgradePreview, options: { confirm: boolean }): CohesiveUpgradeManifest {
    if (!options.confirm) throw new Error('Cohesive upgrade requires explicit confirm: true. Run preview first.');
    if (preview.items.some((item) => item.disposition === 'conflict')) throw new Error('Cohesive upgrade has pipeline conflicts. Resolve the custom phase merge before applying.');
    const existing = this.loadManifest(preview.id); if (existing?.status === 'applied') return existing;
    const manifestFile = this.manifestFile(preview.id); const backupDir = path.dirname(manifestFile); const workspaceFile = assertInside(this.workspaceRoot, preview.workspaceFile); const before = fs.readFileSync(workspaceFile, 'utf8');
    const manifest: CohesiveUpgradeManifest = existing ?? { schemaVersion: 1, id: preview.id, createdAt: this.clock(), status: 'preview', backupDir, workspaceFile, lockFile: path.join(this.workspaceRoot, LOCK_RELATIVE), activeRunIds: preview.activeRunIds, errors: [] };
    try {
      fs.mkdirSync(backupDir, { recursive: true }); const backup = path.join(backupDir, 'files', '.aidlc', 'workspace.yaml'); if (!fs.existsSync(backup)) { fs.mkdirSync(path.dirname(backup), { recursive: true }); fs.copyFileSync(workspaceFile, backup); }
      manifest.workspaceBeforeHash = hash(before); manifest.status = 'partial-failure'; writeFileAtomic(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
      const current = parseWorkspace(workspaceFile); const desired = desiredWorkspace(this.templatesRoot); const currentPipelines = pipelineEntries(current); const desiredPipelines = pipelineEntries(desired);
      for (const run of activeRuns(this.workspaceRoot)) { const oldPipeline = currentPipelines.find((item) => item.id === run.state.pipelineId); if (oldPipeline && !run.state.pipelineSnapshot) { run.state.pipelineSnapshot = snapshotPipeline(oldPipeline as unknown as PipelineConfig, this.clock()); writeFileAtomic(run.file, `${JSON.stringify(run.state, null, 2)}\n`); } }
      for (const item of preview.items) { const target = desiredPipelines.find((pipeline) => pipeline.id === item.pipelineId)!; const idx = currentPipelines.findIndex((pipeline) => pipeline.id === item.pipelineId); if (idx >= 0) currentPipelines[idx] = target; else currentPipelines.push(target); }
      current.pipelines = currentPipelines;
      const commands = Array.isArray(current.slash_commands) ? current.slash_commands : []; const desiredCommands = Array.isArray(desired.slash_commands) ? desired.slash_commands : []; const names = new Set(commands.map((command) => String(asRecord(command).name))); for (const command of desiredCommands) if (!names.has(String(asRecord(command).name))) commands.push(command); current.slash_commands = commands;
      writeFileAtomic(workspaceFile, yaml.dump(current, { noRefs: true, lineWidth: 120 })); manifest.workspaceAfterHash = hash(fs.readFileSync(workspaceFile));
      const lock: CohesiveBundleLock = { schemaVersion: 1, workflowId: WORKFLOW_ID, bundleVersion: COHESIVE_DELIVERY_BUNDLE_VERSION, installedAt: this.clock(), migrationId: preview.id }; writeFileAtomic(assertInside(this.workspaceRoot, path.join(this.workspaceRoot, LOCK_RELATIVE)), `${JSON.stringify(lock, null, 2)}\n`);
      writeBuiltinAutoReviewValidators(this.templatesRoot, this.workspaceRoot, BUILTIN_WORKFLOWS.find((item) => item.id === WORKFLOW_ID)!); manifest.status = 'applied'; manifest.appliedAt = this.clock();
    } catch (error) { manifest.status = 'partial-failure'; manifest.errors.push(error instanceof Error ? error.message : String(error)); writeFileAtomic(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`); throw error; }
    writeFileAtomic(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`); return manifest;
  }
  rollback(id: string, options: { confirm: boolean }): CohesiveUpgradeManifest {
    if (!options.confirm) throw new Error('Cohesive rollback requires explicit confirm: true.'); const manifest = this.loadManifest(id); if (!manifest) throw new Error(`Cohesive upgrade manifest ${id} does not exist.`); if (manifest.status === 'rolled-back') return manifest;
    if (manifest.workspaceAfterHash && hash(fs.readFileSync(manifest.workspaceFile)) !== manifest.workspaceAfterHash) throw new Error('Refusing rollback: workspace.yaml changed after this upgrade. Restore from the backup manually or resolve the change first.');
    const backup = path.join(manifest.backupDir, 'files', '.aidlc', 'workspace.yaml'); if (!fs.existsSync(backup)) throw new Error('Cohesive rollback backup is missing.'); writeFileAtomic(manifest.workspaceFile, fs.readFileSync(backup, 'utf8'));
    const lockFile = assertInside(this.workspaceRoot, manifest.lockFile); if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile); manifest.status = 'rolled-back'; writeFileAtomic(this.manifestFile(id), `${JSON.stringify(manifest, null, 2)}\n`); return manifest;
  }
}
