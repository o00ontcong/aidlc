import * as crypto from 'crypto';

import type { Idea } from '../contracts/idea';
import { nowIso } from '../contracts/common';
import { WorkspaceLoader } from '../loader/WorkspaceLoader';
import { pipelineForRun } from '../runs/PipelineSnapshot';
import type { RunState } from '../runs/RunState';
import { RunStateStore } from '../runs/RunStateStore';
import type { PipelineConfig } from '../schema/WorkspaceSchema';
import { normalizeStep } from '../schema/WorkspaceSchema';
import { IdeaStore } from './IdeaStore';

function loadPipelineForRun(
  workspaceRoot: string,
  run: RunState,
  doc: { pipelines?: unknown } | null,
): PipelineConfig | null {
  const fromSnapshot = pipelineForRun(run);
  if (fromSnapshot) return fromSnapshot;
  try {
    const pipelines = (doc?.pipelines as PipelineConfig[] | undefined)
      ?? WorkspaceLoader.load(workspaceRoot).config.pipelines;
    return pipelines.find((p) => p.id === run.pipelineId) ?? null;
  } catch {
    return null;
  }
}

/**
 * Which pipeline step the Ideas delivery panel should open for plan canvas
 * review. Prefers the step currently awaiting human review; otherwise the
 * named `requirement` step; otherwise the first canvas human-review gate.
 */
export function resolvePlanCanvasStepIndex(pipeline: PipelineConfig, runState: RunState): number {
  const awaitingReview = runState.steps.findIndex((step) => step.status === 'awaiting_review');
  if (awaitingReview >= 0) return awaitingReview;

  const requirementIdx = pipeline.steps.findIndex((step) => normalizeStep(step).name === 'requirement');
  if (requirementIdx >= 0) return requirementIdx;

  const canvasIdx = pipeline.steps.findIndex((step) => {
    const norm = normalizeStep(step);
    return norm.human_review && norm.review?.mode === 'canvas';
  });
  if (canvasIdx >= 0) return canvasIdx;

  return runState.currentStepIdx;
}

export function resolveChildCanvasStepIndex(
  workspaceRoot: string,
  epicId: string,
  doc: { pipelines?: unknown } | null,
): number | undefined {
  const run = RunStateStore.load(workspaceRoot, epicId);
  if (!run) return undefined;
  const pipeline = loadPipelineForRun(workspaceRoot, run, doc);
  if (!pipeline) return undefined;
  return resolvePlanCanvasStepIndex(pipeline, run);
}

/**
 * Mirror live run progress into every `in_delivery` Idea that owns `runId` as
 * a child epic. Called from extension `saveRun` and from workspace refresh.
 */
export function syncIdeasForRun(
  workspaceRoot: string,
  runId: string,
  doc: { pipelines?: unknown; state?: unknown } | null,
  options: { clock?: () => string; store?: IdeaStore } = {},
): void {
  const store = options.store ?? new IdeaStore(workspaceRoot);
  const clock = options.clock ?? nowIso;
  for (const idea of store.list()) {
    if (idea.checkpoint !== 'in_delivery') continue;
    if (!idea.children.some((child) => child.epicId === runId)) continue;
    syncIdeaDelivery(workspaceRoot, idea.id, doc, { clock, store });
    return;
  }
}

/** Refresh every in-flight Idea's children + completion checkpoint from disk runs. */
export function syncAllIdeaDeliveries(
  workspaceRoot: string,
  doc: { pipelines?: unknown; state?: unknown } | null,
  options: { clock?: () => string; store?: IdeaStore } = {},
): void {
  const store = options.store ?? new IdeaStore(workspaceRoot);
  for (const idea of store.list()) {
    if (idea.checkpoint === 'in_delivery') {
      syncIdeaDelivery(workspaceRoot, idea.id, doc, { ...options, store });
    }
  }
}

function syncIdeaDelivery(
  workspaceRoot: string,
  ideaId: string,
  doc: { pipelines?: unknown; state?: unknown } | null,
  options: { clock?: () => string; store?: IdeaStore },
): void {
  const store = options.store ?? new IdeaStore(workspaceRoot);
  const clock = options.clock ?? nowIso;
  const idea = store.load(ideaId);
  if (!idea || idea.checkpoint !== 'in_delivery' || idea.children.length === 0) return;

  let changed = false;
  const children = idea.children.map((child) => {
    const run = RunStateStore.load(workspaceRoot, child.epicId);
    const runStatus = run?.status ?? child.runStatus;
    if (runStatus !== child.runStatus) changed = true;
    return { ...child, runStatus };
  });

  const activeChild = children.find((child) => {
    const run = RunStateStore.load(workspaceRoot, child.epicId);
    return run && run.status !== 'completed';
  }) ?? children[children.length - 1]!;

  let inDelivery = idea.inDelivery;
  const activeRun = RunStateStore.load(workspaceRoot, activeChild.epicId);
  if (activeRun) {
    const step = activeRun.steps[activeRun.currentStepIdx];
    const nextPointer = {
      epicId: activeChild.epicId,
      runId: activeRun.runId,
      stepRevision: step?.revision ?? 1,
      reviewRound: step?.reviewBundleRevision,
    };
    if (JSON.stringify(inDelivery) !== JSON.stringify(nextPointer)) {
      inDelivery = nextPointer;
      changed = true;
    }
  }

  const allCompleted = children.length > 0 && children.every((child) => {
    const run = RunStateStore.load(workspaceRoot, child.epicId);
    return run?.status === 'completed';
  });

  if (allCompleted) {
    const completed: Idea = {
      ...idea,
      children,
      checkpoint: 'completed',
      inDelivery: undefined,
      updatedAt: clock(),
      ideaRevision: idea.ideaRevision + 1,
    };
    store.save(completed, idea.ideaRevision);
    store.appendEvent(ideaId, {
      id: crypto.randomUUID(),
      at: clock(),
      type: 'completed',
      actor: { kind: 'system', id: 'aidlc-ideas' },
      revision: completed.ideaRevision,
      detail: children.map((c) => c.epicId).join(', '),
    });
    return;
  }

  if (!changed) return;

  const next: Idea = {
    ...idea,
    children,
    inDelivery,
    updatedAt: clock(),
    ideaRevision: idea.ideaRevision + 1,
  };
  store.save(next, idea.ideaRevision);
}
