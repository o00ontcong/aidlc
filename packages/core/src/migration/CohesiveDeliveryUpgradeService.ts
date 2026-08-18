/** Explicit, reversible upgrade of the generated Cohesive Delivery bundle. */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { writeFileAtomic } from '../epic/EpicStore';
import { builtinTemplatesRoot, BUILTIN_WORKFLOWS, loadBuiltinPreset, writeBuiltinAutoReviewValidators } from '../presets/builtinWorkflows';
import { normalizeStep, stepDagId } from '../schema/WorkspaceSchema';
import type { PipelineConfig } from '../schema/WorkspaceSchema';
import { pipelineHash, snapshotPipeline } from '../runs/PipelineSnapshot';
import { resolvePath, type RunState, type StepRecord } from '../runs/RunState';
import {
  COHESIVE_OWNED_PHASES,
  isRetiredCohesiveSlash,
  pruneRetiredCohesiveCommandFiles,
  remapCohesiveRunsToThreePipeline,
} from './cohesiveThreePipelineRemap';

export const COHESIVE_DELIVERY_BUNDLE_VERSION = '3.0.0';
const WORKFLOW_ID = 'cohesive-delivery';
const MANIFEST_DIR = path.join('.aidlc', 'migration-backups');
const LOCK_RELATIVE = path.join('.aidlc', 'locks', 'cohesive-delivery.json');

export type CohesiveUpgradeStatus = 'preview' | 'applied' | 'rolled-back' | 'partial-failure';
export type CohesiveUpgradeDisposition = 'upgrade' | 'already-current' | 'conflict' | 'missing';
export interface CohesiveUpgradeItem { pipelineId: string; disposition: CohesiveUpgradeDisposition; currentSteps: string[]; targetSteps: string[]; warning?: string; }
export interface CohesiveUpgradePreview { schemaVersion: 1; id: string; createdAt: string; status: 'preview'; fromVersion: string; toVersion: string; workspaceFile: string; items: CohesiveUpgradeItem[]; activeRunIds: string[]; warnings: string[]; }
export interface CohesiveUpgradeManifest { schemaVersion: 1; id: string; createdAt: string; appliedAt?: string; status: CohesiveUpgradeStatus; backupDir: string; workspaceFile: string; workspaceBeforeHash?: string; workspaceAfterHash?: string; lockFile: string; activeRunIds: string[]; errors: string[]; }
export interface CohesiveBundleLock { schemaVersion: 1; workflowId: typeof WORKFLOW_ID; bundleVersion: string; installedAt: string; migrationId?: string; }

export interface RunPipelineReconciliation {
  state: RunState;
  changed: boolean;
  addedStepIds: string[];
}

/**
 * Rebase an existing run onto a newer definition of the same pipeline.
 *
 * Step identity comes from the phase name (`stepDagId`), not its index or
 * agent persona. Existing records are moved intact, while phases that only
 * exist in the target pipeline are created with `isNew: true`. This makes
 * the operation safe for Cohesive pipelines that insert phases in the
 * middle and reuse one agent across many phases.
 */
export function reconcileRunStateToPipeline(
  state: RunState,
  target: PipelineConfig,
  capturedAt = new Date().toISOString(),
): RunPipelineReconciliation {
  if (state.pipelineId !== target.id) {
    throw new Error(`Cannot migrate run "${state.runId}" from pipeline "${state.pipelineId}" to "${target.id}".`);
  }

  const sourceSnapshot = state.pipelineSnapshot;
  const source = sourceSnapshot?.pipeline;
  if (!sourceSnapshot || !source) {
    return {
      state: { ...state, pipelineSnapshot: snapshotPipeline(target, capturedAt) },
      changed: true,
      addedStepIds: [],
    };
  }

  const sourceIds = source.steps.map(stepDagId);
  const targetIds = target.steps.map(stepDagId);
  const targetIdSet = new Set(targetIds);
  const removed = sourceIds.filter((id) => !targetIdSet.has(id));
  if (removed.length > 0) {
    throw new Error(
      `Pipeline "${target.id}" no longer contains existing phase(s): ${removed.join(', ')}. Resolve this custom pipeline conflict manually.`,
    );
  }

  const sameSnapshot = sourceSnapshot.hash === pipelineHash(target);
  const addedStepIds = targetIds.filter((id) => !sourceIds.includes(id));
  const hasStepShapeDrift = state.steps.length !== target.steps.length
    || state.steps.some((step, index) => step.stepIdx !== index);
  if (sameSnapshot && addedStepIds.length === 0 && !hasStepShapeDrift) {
    return { state, changed: false, addedStepIds: [] };
  }

  const existingById = new Map<string, StepRecord>();
  sourceIds.forEach((id, index) => {
    const record = state.steps.find((step) => step.stepIdx === index) ?? state.steps[index];
    if (record) { existingById.set(id, record); }
  });

  const nextSteps: StepRecord[] = target.steps.map((raw, stepIdx) => {
    const id = targetIds[stepIdx];
    const existing = existingById.get(id);
    if (existing) { return { ...existing, stepIdx }; }
    return {
      stepIdx,
      agent: normalizeStep(raw).agent,
      revision: 1,
      status: 'pending',
      artifactsProduced: [],
      history: [],
      isNew: true,
    };
  });

  const added = new Set(addedStepIds);
  const normalized = target.steps.map(normalizeStep);
  const usesDag = normalized.some((step) => step.depends_on.length > 0);
  if (usesDag) {
    const approvedIds = new Set(
      nextSteps
        .filter((step) => step.status === 'approved')
        .map((step) => targetIds[step.stepIdx]),
    );
    nextSteps.forEach((step, index) => {
      if (!added.has(targetIds[index])) { return; }
      const deps = normalized[index].depends_on;
      if (deps.length === 0 || deps.every((dep) => approvedIds.has(dep))) {
        step.status = 'awaiting_work';
      }
    });
  } else {
    const firstAddedIdx = nextSteps.findIndex((_, index) => added.has(targetIds[index]));
    if (
      firstAddedIdx >= 0
      && nextSteps.slice(0, firstAddedIdx).every((step) => step.status === 'approved')
    ) {
      nextSteps[firstAddedIdx].status = 'awaiting_work';
    }
  }

  const oldCurrentId = sourceIds[state.currentStepIdx];
  const mappedCurrentIdx = oldCurrentId ? targetIds.indexOf(oldCurrentId) : -1;
  const mappedCurrent = mappedCurrentIdx >= 0 ? nextSteps[mappedCurrentIdx] : undefined;
  const mappedCurrentIsActive = mappedCurrent
    && mappedCurrent.status !== 'approved'
    && mappedCurrent.status !== 'pending';
  const firstReadyNewIdx = nextSteps.findIndex((step) => step.isNew && step.status === 'awaiting_work');
  const firstNewIdx = nextSteps.findIndex((step) => step.isNew);
  const currentStepIdx = mappedCurrentIsActive
    ? mappedCurrentIdx
    : firstReadyNewIdx >= 0
    ? firstReadyNewIdx
    : mappedCurrentIdx >= 0
      ? mappedCurrentIdx
      : Math.max(0, firstNewIdx);

  return {
    changed: true,
    addedStepIds,
    state: {
      ...state,
      pipelineSnapshot: snapshotPipeline(target, capturedAt),
      steps: nextSteps,
      currentStepIdx,
      status: addedStepIds.length > 0
        ? nextSteps.every((step) => step.status === 'approved') ? 'completed' : 'running'
        : state.status,
      updatedAt: capturedAt,
    },
  };
}

/** New human-briefing graphs added to existing cohesive-feature phases. */
const VISUALIZATION_ARTIFACTS = new Set([
  'FEATURE-IMPACT.json',
  'FEATURE-IMPACT.mmd',
  'FEATURE-SURFACES.json',
  'FEATURE-SURFACES.mmd',
  'FEATURE-FLOW.json',
  'FEATURE-FLOW.mmd',
]);

const REOPENABLE = new Set(['approved', 'awaiting_review', 'awaiting_auto_review']);

/**
 * After a config-only upgrade, approved `plan` / `map-feature-flow` steps
 * still look done even though FEATURE-IMPACT / FEATURE-SURFACES were never
 * written. Reopen those steps so Migrate can produce the graphs without
 * resetting later approved work.
 */
export function reopenApprovedStepsMissingProduces(
  state: RunState,
  pipeline: PipelineConfig,
  workspaceRoot: string,
  capturedAt = new Date().toISOString(),
): { state: RunState; reopenedStepIds: string[] } {
  if (state.pipelineId !== pipeline.id) {
    return { state, reopenedStepIds: [] };
  }
  const context = { epic: state.runId, ...state.context };
  const ids = pipeline.steps.map(stepDagId);
  const reopenedStepIds: string[] = [];
  const nextSteps = state.steps.map((record, index) => {
    const raw = pipeline.steps[index];
    if (!raw || !REOPENABLE.has(record.status)) { return record; }
    const produces = normalizeStep(raw).produces.filter((item) => VISUALIZATION_ARTIFACTS.has(path.basename(item)));
    if (produces.length === 0) { return record; }
    const missing = produces.some((item) => {
      const resolved = resolvePath(item, context);
      const abs = path.isAbsolute(resolved) ? resolved : path.join(workspaceRoot, resolved);
      return !fs.existsSync(abs);
    });
    if (!missing) { return record; }
    reopenedStepIds.push(ids[index] ?? String(index));
    return { ...record, status: 'awaiting_work' as const, isNew: true };
  });
  if (reopenedStepIds.length === 0) { return { state, reopenedStepIds: [] }; }

  const current = state.steps[state.currentStepIdx];
  const currentActive = current
    && current.status !== 'approved'
    && current.status !== 'pending';
  const firstReopenedIdx = nextSteps.findIndex((step, index) => {
    const id = ids[index];
    return Boolean(id && reopenedStepIds.includes(id) && step.status === 'awaiting_work');
  });
  return {
    reopenedStepIds,
    state: {
      ...state,
      steps: nextSteps,
      currentStepIdx: currentActive || firstReopenedIdx < 0 ? state.currentStepIdx : firstReopenedIdx,
      status: nextSteps.every((step) => step.status === 'approved') ? 'completed' : 'running',
      pipelineSnapshot: snapshotPipeline(pipeline, capturedAt),
      updatedAt: capturedAt,
    },
  };
}

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
function desiredWorkspace(): Record<string, unknown> {
  const workflow = BUILTIN_WORKFLOWS.find((item) => item.id === WORKFLOW_ID);
  if (!workflow) throw new Error('Cohesive Delivery built-in workflow is unavailable.');
  return loadBuiltinPreset(builtinTemplatesRoot(), workflow).workspace as Record<string, unknown>;
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
  constructor(readonly workspaceRoot: string, private readonly clock: () => string = now) {}
  preview(): CohesiveUpgradePreview {
    const workspaceFile = path.join(this.workspaceRoot, '.aidlc', 'workspace.yaml'); const body = fs.existsSync(workspaceFile) ? fs.readFileSync(workspaceFile, 'utf8') : '';
    const current = parseWorkspace(workspaceFile); const desired = desiredWorkspace(); const existing = pipelineEntries(current); const target = pipelineEntries(desired);
    const items: CohesiveUpgradeItem[] = target.map((next) => {
      const pipelineId = String(next.id); const currentPipeline = existing.find((item) => item.id === pipelineId); const targetSteps = (Array.isArray(next.steps) ? next.steps : []).map(stepName);
      if (!currentPipeline) return { pipelineId, disposition: 'missing' as const, currentSteps: [], targetSteps };
      const currentSteps = (Array.isArray(currentPipeline.steps) ? currentPipeline.steps : []).map(stepName);
      if (
        JSON.stringify(currentSteps) === JSON.stringify(targetSteps)
        && pipelineHash(currentPipeline as unknown as PipelineConfig) === pipelineHash(next as unknown as PipelineConfig)
      ) return { pipelineId, disposition: 'already-current' as const, currentSteps, targetSteps };
      const owned = currentSteps.length > 0 && currentSteps.every((name) => COHESIVE_OWNED_PHASES.has(name));
      return owned
        ? { pipelineId, disposition: 'upgrade' as const, currentSteps, targetSteps }
        : { pipelineId, disposition: 'conflict' as const, currentSteps, targetSteps, warning: 'Contains phase(s) not owned by the Cohesive bundle; preserved for a manual merge.' };
    });
    const leftoverFeature = existing.find((item) => String(item.id) === 'cohesive-feature');
    if (leftoverFeature) {
      const implement = target.find((item) => String(item.id) === 'feature-implement');
      items.push({
        pipelineId: 'cohesive-feature',
        disposition: 'upgrade',
        currentSteps: (Array.isArray(leftoverFeature.steps) ? leftoverFeature.steps : []).map(stepName),
        targetSteps: (Array.isArray(implement?.steps) ? implement.steps : []).map(stepName),
        warning: 'Retires cohesive-feature; existing runs remap onto feature-implement.',
      });
    }
    const runs = activeRuns(this.workspaceRoot).filter(({ state }) =>
      items.some((item) => item.pipelineId === state.pipelineId) || state.pipelineId === 'cohesive-feature',
    );
    const lock = readLock(this.workspaceRoot);
    return {
      schemaVersion: 1,
      id: idFor(`${body}\n${COHESIVE_DELIVERY_BUNDLE_VERSION}`),
      createdAt: this.clock(),
      status: 'preview',
      fromVersion: lock?.bundleVersion ?? 'legacy-unlocked',
      toVersion: COHESIVE_DELIVERY_BUNDLE_VERSION,
      workspaceFile,
      items,
      activeRunIds: runs.map(({ state }) => state.runId),
      warnings: [
        ...items.filter((item) => item.disposition === 'conflict').map((item) => `${item.pipelineId}: ${item.warning}`),
        ...(runs.length ? [`${runs.length} active Cohesive run(s) will remap onto the 3.0 pipelines.`] : []),
      ],
    };
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
      const current = parseWorkspace(workspaceFile); const desired = desiredWorkspace(); const currentPipelines = pipelineEntries(current); const desiredPipelines = pipelineEntries(desired);
      for (const item of preview.items) {
        if (item.pipelineId === 'cohesive-feature') continue;
        const target = desiredPipelines.find((pipeline) => pipeline.id === item.pipelineId)!;
        const idx = currentPipelines.findIndex((pipeline) => pipeline.id === item.pipelineId);
        if (idx >= 0) currentPipelines[idx] = target; else currentPipelines.push(target);
      }
      for (const target of desiredPipelines) {
        if (!currentPipelines.some((pipeline) => pipeline.id === target.id)) currentPipelines.push(target);
      }
      current.pipelines = currentPipelines.filter((pipeline) => pipeline.id !== 'cohesive-feature');
      const commands = Array.isArray(current.slash_commands) ? current.slash_commands : [];
      const desiredCommands = Array.isArray(desired.slash_commands) ? desired.slash_commands : [];
      const kept = commands.filter((command) => !isRetiredCohesiveSlash(String(asRecord(command).name)));
      const names = new Set(kept.map((command) => String(asRecord(command).name)));
      for (const command of desiredCommands) {
        if (!names.has(String(asRecord(command).name))) kept.push(command);
      }
      current.slash_commands = kept;
      writeFileAtomic(workspaceFile, yaml.dump(current, { noRefs: true, lineWidth: 120 })); manifest.workspaceAfterHash = hash(fs.readFileSync(workspaceFile));
      remapCohesiveRunsToThreePipeline(this.workspaceRoot, current.pipelines as unknown as PipelineConfig[], this.clock());
      pruneRetiredCohesiveCommandFiles(this.workspaceRoot);
      const lock: CohesiveBundleLock = { schemaVersion: 1, workflowId: WORKFLOW_ID, bundleVersion: COHESIVE_DELIVERY_BUNDLE_VERSION, installedAt: this.clock(), migrationId: preview.id }; writeFileAtomic(assertInside(this.workspaceRoot, path.join(this.workspaceRoot, LOCK_RELATIVE)), `${JSON.stringify(lock, null, 2)}\n`);
      writeBuiltinAutoReviewValidators(builtinTemplatesRoot(), this.workspaceRoot, BUILTIN_WORKFLOWS.find((item) => item.id === WORKFLOW_ID)!); manifest.status = 'applied'; manifest.appliedAt = this.clock();
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
