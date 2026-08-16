import * as fs from 'node:fs';
import * as path from 'node:path';

import { writeFileAtomic } from '../epic/EpicStore';
import { snapshotPipeline } from '../runs/PipelineSnapshot';
import { RunStateStore } from '../runs/RunStateStore';
import type { RunState, StepRecord } from '../runs/RunState';
import { normalizeStep, stepDagId, type PipelineConfig } from '../schema/WorkspaceSchema';
import { writeSynthesizedMission } from '../mission/synthesizeMission';

export const LEGACY_PROJECT_CONTEXT_PHASES = [
  'define-charter',
  'scan-project',
  'model-project',
  'map-features',
  'check-drift',
  'review-context',
  'publish-context',
  'project-rules-sync',
] as const;

export const LEGACY_FEATURE_PHASES = [
  'capture-context',
  'specify',
  'clarify',
  'plan',
  'plan-tasks',
  'analyze-contract',
  'map-feature-flow',
  'implement',
  'implementation-context',
  'cohesion-review',
  'system-test',
  'resolve-bugs',
  'open-pr',
  'await-merge',
  'project-sync',
] as const;

const NEW_CONTEXT_PHASES = ['establish-baseline', 'publish-context'] as const;
const NEW_SPIKE_PHASES = ['package-mission'] as const;
const NEW_IMPLEMENT_PHASES = ['implement', 'resolve-bugs', 'ship'] as const;

export const COHESIVE_OWNED_PHASES = new Set<string>([
  ...LEGACY_PROJECT_CONTEXT_PHASES,
  ...LEGACY_FEATURE_PHASES,
  ...NEW_CONTEXT_PHASES,
  ...NEW_SPIKE_PHASES,
  ...NEW_IMPLEMENT_PHASES,
]);

const BASELINE_LEGACY = [
  'define-charter', 'scan-project', 'model-project', 'map-features', 'check-drift', 'review-context',
] as const;
const PUBLISH_LEGACY = ['publish-context', 'project-rules-sync'] as const;
const IMPLEMENT_LEGACY = ['implement', 'implementation-context', 'cohesion-review', 'system-test'] as const;
const SHIP_LEGACY = ['open-pr', 'await-merge', 'project-sync'] as const;

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  awaiting_work: 1,
  awaiting_auto_review: 2,
  awaiting_review: 3,
  rejected: 4,
  approved: 5,
};

function sourceIds(state: RunState): string[] {
  return (state.pipelineSnapshot?.pipeline.steps ?? []).map(stepDagId);
}

function recordsFor(state: RunState, ids: string[], names: readonly string[]): StepRecord[] {
  return names.flatMap((name) => {
    const index = ids.indexOf(name);
    if (index < 0) return [];
    const record = state.steps.find((step) => step.stepIdx === index) ?? state.steps[index];
    return record ? [record] : [];
  });
}

function foldStatus(records: StepRecord[], fallback: StepRecord['status'] = 'pending'): StepRecord['status'] {
  if (records.length === 0) return fallback;
  return records.reduce((best, record) => (
    (STATUS_RANK[record.status] ?? 0) >= (STATUS_RANK[best.status] ?? 0) ? record : best
  )).status;
}

function started(records: StepRecord[]): boolean {
  return records.some((record) => record.status !== 'pending');
}

function mergeRecord(
  stepIdx: number,
  agent: string,
  status: StepRecord['status'],
  from: StepRecord[],
): StepRecord {
  const latest = [...from].reverse().find(Boolean);
  return {
    stepIdx,
    agent,
    revision: latest?.revision ?? 1,
    status,
    artifactsProduced: from.flatMap((step) => step.artifactsProduced ?? []),
    history: from.flatMap((step) => step.history ?? []),
    feedback: [...from].reverse().find((step) => step.feedback)?.feedback,
    startedAt: from.find((step) => step.startedAt)?.startedAt,
    finishedAt: status === 'approved'
      ? [...from].reverse().find((step) => step.finishedAt)?.finishedAt
      : undefined,
  };
}

function firstOpenIdx(steps: StepRecord[]): number {
  const idx = steps.findIndex((step) => step.status !== 'approved' && step.status !== 'pending');
  if (idx >= 0) return idx;
  const awaiting = steps.findIndex((step) => step.status === 'awaiting_work');
  if (awaiting >= 0) return awaiting;
  const pending = steps.findIndex((step) => step.status !== 'approved');
  return pending >= 0 ? pending : Math.max(0, steps.length - 1);
}

function runStatus(steps: StepRecord[], previous: RunState['status']): RunState['status'] {
  if (steps.every((step) => step.status === 'approved')) return 'completed';
  if (previous === 'failed') return 'failed';
  return 'running';
}

export function isLegacyProjectContextRun(state: RunState): boolean {
  if (state.pipelineId !== 'project-context') return false;
  const ids = sourceIds(state);
  return ids.some((id) => id === 'define-charter' || id === 'scan-project' || id === 'review-context');
}

export function isLegacyFeatureRun(state: RunState): boolean {
  return state.pipelineId === 'cohesive-feature'
    || sourceIds(state).includes('capture-context')
    || sourceIds(state).includes('map-feature-flow');
}

export function remapProjectContextRun(
  state: RunState,
  target: PipelineConfig,
  capturedAt = new Date().toISOString(),
): RunState {
  const ids = sourceIds(state);
  const baseline = recordsFor(state, ids, BASELINE_LEGACY);
  const publish = recordsFor(state, ids, PUBLISH_LEGACY);
  const agents = target.steps.map((step) => normalizeStep(step).agent);
  const baselineStatus = foldStatus(baseline, 'awaiting_work');
  const publishStatus = baselineStatus === 'approved'
    ? (started(publish) ? foldStatus(publish, 'awaiting_work') : 'awaiting_work')
    : 'pending';
  const steps: StepRecord[] = [
    mergeRecord(0, agents[0] ?? 'aidlc-project-context-agent', baselineStatus, baseline),
    mergeRecord(1, agents[1] ?? 'aidlc-project-context-agent', publishStatus, publish),
  ];
  return {
    ...state,
    pipelineId: 'project-context',
    pipelineSnapshot: snapshotPipeline(target, capturedAt),
    steps,
    currentStepIdx: firstOpenIdx(steps),
    status: runStatus(steps, state.status),
    updatedAt: capturedAt,
  };
}

export function remapFeatureRun(
  state: RunState,
  target: PipelineConfig,
  workspaceRoot: string,
  capturedAt = new Date().toISOString(),
): RunState {
  const ids = sourceIds(state);
  const implementLegacy = recordsFor(state, ids, IMPLEMENT_LEGACY);
  const resolveLegacy = recordsFor(state, ids, ['resolve-bugs']);
  const shipLegacy = recordsFor(state, ids, SHIP_LEGACY);
  const agents = target.steps.map((step) => normalizeStep(step).agent);

  const implementStatus = started(implementLegacy)
    ? foldStatus(implementLegacy, 'awaiting_work')
    : 'awaiting_work';
  const resolveStatus = implementStatus === 'approved'
    ? (started(resolveLegacy) ? foldStatus(resolveLegacy, 'awaiting_work') : 'awaiting_work')
    : 'pending';
  const shipStatus = resolveStatus === 'approved'
    ? (started(shipLegacy) ? foldStatus(shipLegacy, 'awaiting_work') : 'awaiting_work')
    : 'pending';

  const steps: StepRecord[] = [
    mergeRecord(0, agents[0] ?? 'aidlc-feature-implement-agent', implementStatus, implementLegacy),
    mergeRecord(1, agents[1] ?? 'aidlc-feature-implement-agent', resolveStatus, resolveLegacy),
    mergeRecord(2, agents[2] ?? 'aidlc-feature-implement-agent', shipStatus, shipLegacy),
  ];

  const artifactsDir = path.join(workspaceRoot, 'docs', 'epics', state.runId, 'artifacts');
  writeSynthesizedMission(artifactsDir);

  return {
    ...state,
    pipelineId: 'feature-implement',
    pipelineSnapshot: snapshotPipeline(target, capturedAt),
    steps,
    currentStepIdx: firstOpenIdx(steps),
    status: runStatus(steps, state.status),
    updatedAt: capturedAt,
  };
}

function pipelineById(pipelines: PipelineConfig[], id: string): PipelineConfig | undefined {
  return pipelines.find((pipeline) => pipeline.id === id);
}

function rewriteEpicPipeline(workspaceRoot: string, epicId: string, pipelineId: string): void {
  const stateFile = path.join(workspaceRoot, 'docs', 'epics', epicId, 'state.json');
  if (!fs.existsSync(stateFile)) return;
  try {
    const epic = JSON.parse(fs.readFileSync(stateFile, 'utf8')) as Record<string, unknown>;
    if (epic.pipeline === 'cohesive-feature' || epic.pipeline === pipelineId) {
      epic.pipeline = pipelineId;
      writeFileAtomic(stateFile, `${JSON.stringify(epic, null, 2)}\n`);
    }
  } catch { /* ignore unreadable epic state */ }
}

/**
 * Rewrite leftover 8-step / 15-step Cohesive runs onto the 3.0 pipelines.
 * Idempotent: already-remapped runs are left unchanged.
 */
export function remapCohesiveRunsToThreePipeline(
  workspaceRoot: string,
  pipelines: PipelineConfig[],
  capturedAt = new Date().toISOString(),
): { remapped: string[] } {
  const remapped: string[] = [];
  const project = pipelineById(pipelines, 'project-context');
  const implement = pipelineById(pipelines, 'feature-implement');
  for (const state of RunStateStore.list(workspaceRoot)) {
    let next = state;
    if (project && isLegacyProjectContextRun(state)) {
      next = remapProjectContextRun(state, project, capturedAt);
    } else if (implement && isLegacyFeatureRun(state)) {
      next = remapFeatureRun(state, implement, workspaceRoot, capturedAt);
      rewriteEpicPipeline(workspaceRoot, state.runId, 'feature-implement');
    } else {
      continue;
    }
    RunStateStore.save(workspaceRoot, next);
    remapped.push(state.runId);
  }
  return { remapped };
}

export const RETIRED_SLASH_PREFIXES = [
  '/cohesive-feature-',
  '/cohesive-work-package-',
] as const;

export const RETIRED_SLASH_EXACT = new Set([
  '/project-context-define-charter',
  '/project-context-scan-project',
  '/project-context-model-project',
  '/project-context-map-features',
  '/project-context-check-drift',
  '/project-context-review-context',
  '/project-context-project-rules-sync',
]);

export function isRetiredCohesiveSlash(name: string): boolean {
  const normalized = name.startsWith('/') ? name : `/${name}`;
  if (RETIRED_SLASH_EXACT.has(normalized)) return true;
  return RETIRED_SLASH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

const COMMAND_DIRS = [
  ['.claude', 'commands'],
  ['.cursor', 'commands'],
  ['.opencode', 'commands'],
] as const;

export function pruneRetiredCohesiveCommandFiles(workspaceRoot: string): string[] {
  const removed: string[] = [];
  for (const parts of COMMAND_DIRS) {
    const dir = path.join(workspaceRoot, ...parts);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.md')) continue;
      const id = file.replace(/\.md$/, '');
      if (!isRetiredCohesiveSlash(`/${id}`)) continue;
      fs.unlinkSync(path.join(dir, file));
      removed.push(path.join(...parts, file));
    }
  }
  const codexSkills = path.join(workspaceRoot, '.codex', 'skills');
  if (fs.existsSync(codexSkills)) {
    for (const dirent of fs.readdirSync(codexSkills, { withFileTypes: true })) {
      const name = dirent.name.replace(/^aidlc-/, '');
      if (!isRetiredCohesiveSlash(`/${name}`)) continue;
      const full = path.join(codexSkills, dirent.name);
      fs.rmSync(full, { recursive: true, force: true });
      removed.push(path.join('.codex', 'skills', dirent.name));
    }
  }
  return removed;
}
