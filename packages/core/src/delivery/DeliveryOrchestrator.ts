import * as fs from 'fs';
import * as path from 'path';

import { readCharterJson, defaultCharterTemplatesDir } from '../epics/charterArtifacts';
import { WorkspaceLoader } from '../loader/WorkspaceLoader';
import { normalizeStep, stepAgentId, type PipelineConfig } from '../schema/WorkspaceSchema';
import { scaffoldEpic } from '../runs/EpicScaffold';
import { requestStepUpdate } from '../runs/PipelineRunner';
import { RunStateStore } from '../runs/RunStateStore';
import { runExecLoop, type ExecHooks, type ExecOutcome } from '../runs/execEngine';
import { writeDeliveryReviewBundle } from './DeliveryReview';
import { DeliveryStateStore } from './DeliveryStateStore';
import {
  DEFAULT_EXISTING_PROJECT_PROFILE,
  validateDeliveryRequest,
  type DeliveryProfile,
  type DeliveryFailureRef,
  type DeliveryRequest,
  type DeliveryReviewTask,
  type DeliveryReviewTaskTarget,
  type DeliveryState,
} from './DeliveryTypes';
import { VALIDATOR_RECONCILIATION_ERROR_PREFIX } from '../presets/validatorManifest';

interface WorkPackageEntry {
  id: string;
  runId: string;
  dependsOn?: string[];
}

interface WorkPackageManifest {
  feature: string;
  packages: WorkPackageEntry[];
}

function readWorkPackageManifest(workspaceRoot: string, featureRunId: string): WorkPackageManifest {
  const file = path.join(workspaceRoot, 'docs', 'epics', featureRunId, 'artifacts', 'WORK-PACKAGES.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as WorkPackageManifest;
  if (!Array.isArray(manifest.packages) || !manifest.packages.length) {
    throw new Error('WORK-PACKAGES.json has no packages.');
  }
  return manifest;
}

export interface DeliveryHooks extends ExecHooks {
  onDeliveryStage?(event: { deliveryId: string; stage: string; detail?: string }): void;
}

export interface StartDeliveryOptions {
  profile?: Partial<DeliveryProfile>;
  hooks?: DeliveryHooks;
  charterTemplatesRoot?: string;
}

export interface AddDeliveryTaskInput {
  title: string;
  acceptanceCriteria?: string[];
  severity?: 'blocking' | 'follow-up';
  target?: DeliveryReviewTaskTarget;
}

function uniqueAgents(pipeline: PipelineConfig): string[] {
  return [...new Set(pipeline.steps.map(stepAgentId).filter(Boolean))];
}

function stepIndex(pipeline: PipelineConfig, name: string): number {
  const idx = pipeline.steps.findIndex((step) => {
    const norm = normalizeStep(step);
    return norm.name === name || norm.agent === name;
  });
  if (idx < 0) throw new Error(`Pipeline "${pipeline.id}" has no step "${name}".`);
  return idx;
}

function event(state: DeliveryState, kind: string, detail?: string): void {
  state.events.push({ at: new Date().toISOString(), kind, detail });
}

function deliveryBrief(request: DeliveryRequest): string {
  return [
    request.description.trim(),
    ...(request.acceptanceCriteria?.length
      ? ['', 'Acceptance Criteria:', ...request.acceptanceCriteria.map((item) => `- ${item}`)]
      : []),
    ...(request.constraints?.length
      ? ['', 'Constraints:', ...request.constraints.map((item) => `- ${item}`)]
      : []),
    ...(request.source?.reference
      ? ['', `Requirement source: ${request.source.type} — ${request.source.reference}`]
      : []),
  ].join('\n');
}

function profileFromWorkspace(root: string, override?: Partial<DeliveryProfile>): DeliveryProfile {
  const config = WorkspaceLoader.load(root).config;
  const epicsDir = (config.state?.root ?? 'docs/epics').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
  if (epicsDir !== 'docs/epics') {
    throw new Error(
      `Cohesive Delivery artifact contracts currently require state.root=docs/epics (got ${config.state?.root}).`,
    );
  }
  const raw = config.cohesive_delivery?.execution_profiles?.['existing-project-autonomous'];
  const profile: DeliveryProfile = {
    ...DEFAULT_EXISTING_PROJECT_PROFILE,
    ...(raw ? {
      projectContextMode: raw.project_context,
      reviewStrategy: raw.review_strategy,
      // Only retained to read historical delivery state. New Cohesive Delivery
      // no longer exposes or uses a worker-count concurrency setting.
      maxParallelWorkers: raw.max_parallel_workers ?? DEFAULT_EXISTING_PROJECT_PROFILE.maxParallelWorkers,
      openFeaturePullRequest: raw.open_feature_pr,
      mergePolicy: raw.merge,
    } : {}),
    ...override,
    id: override?.id ?? DEFAULT_EXISTING_PROJECT_PROFILE.id,
  };
  if (!Number.isInteger(profile.maxParallelWorkers) || profile.maxParallelWorkers < 1 || profile.maxParallelWorkers > 32) {
    throw new Error('maxParallelWorkers must be an integer between 1 and 32.');
  }
  if (profile.mergePolicy !== 'human-only') {
    throw new Error('Existing Project Autonomous Delivery requires mergePolicy=human-only.');
  }
  if (profile.openFeaturePullRequest !== true) {
    throw new Error('Existing Project Autonomous Delivery requires one feature pull request.');
  }
  if (profile.projectContextMode !== 'infer-or-refresh' || profile.reviewStrategy !== 'aggregate') {
    throw new Error(
      'Existing Project Autonomous Delivery requires projectContextMode=infer-or-refresh and reviewStrategy=aggregate.',
    );
  }
  return profile;
}

export class DeliveryOrchestrator {
  constructor(private readonly workspaceRoot: string) {}

  create(request: DeliveryRequest, options: StartDeliveryOptions = {}): DeliveryState {
    validateDeliveryRequest(request);
    const existing = DeliveryStateStore.load(this.workspaceRoot, request.id);
    if (existing) return existing;
    const now = new Date().toISOString();
    const state: DeliveryState = {
      schemaVersion: 1,
      id: request.id,
      profile: profileFromWorkspace(this.workspaceRoot, options.profile),
      request,
      status: 'pending',
      workerRunIds: [],
      completedStages: [],
      reviewRevision: 1,
      reviewTasks: [],
      events: [{ at: now, kind: 'created' }],
      createdAt: now,
      updatedAt: now,
    };
    DeliveryStateStore.save(this.workspaceRoot, state);
    return state;
  }

  load(deliveryId: string): DeliveryState {
    const state = DeliveryStateStore.load(this.workspaceRoot, deliveryId);
    if (!state) throw new Error(`Delivery "${deliveryId}" not found.`);
    return state;
  }

  async run(deliveryId: string, options: StartDeliveryOptions = {}): Promise<DeliveryState> {
    const state = this.load(deliveryId);
    if (state.status === 'completed' || state.status === 'awaiting-aggregate-review') {
      writeDeliveryReviewBundle(this.workspaceRoot, state);
      return state;
    }
    const hooks = options.hooks ?? {};
    try {
      this.assertValidatorsReady();
      await this.ensureProjectContext(state, hooks, options.charterTemplatesRoot);
      await this.ensureFeatureContract(state, hooks);
      await this.ensureWorkers(state, hooks, options.charterTemplatesRoot);
      await this.ensureFeatureReviewReady(state, hooks);
      state.status = 'awaiting-aggregate-review';
      state.lastError = undefined;
      event(state, 'aggregate-review-ready');
      writeDeliveryReviewBundle(this.workspaceRoot, state);
      DeliveryStateStore.save(this.workspaceRoot, state);
      return state;
    } catch (error) {
      state.status = 'blocked';
      state.lastError = error instanceof Error ? error.message : String(error);
      event(state, 'blocked', state.lastError);
      writeDeliveryReviewBundle(this.workspaceRoot, state);
      DeliveryStateStore.save(this.workspaceRoot, state);
      throw error;
    }
  }

  private assertValidatorsReady(): void {
    const validators = path.join(this.workspaceRoot, '.aidlc', 'validators');
    if (!fs.existsSync(validators)) return;
    const pending = fs.readdirSync(validators)
      .filter((name) => name.endsWith('.aidlc-new'));
    if (pending.length) {
      throw new Error(
        `${VALIDATOR_RECONCILIATION_ERROR_PREFIX} before autonomous execution: ${pending.join(', ')}. ` +
        'Run `aidlc cohesive reconcile-validators` (or the AIDLC extension\'s ' +
        '"Resolve validator conflicts" action) to keep or accept each one.',
      );
    }
  }

  addTask(deliveryId: string, input: AddDeliveryTaskInput): DeliveryReviewTask {
    const state = this.load(deliveryId);
    if (state.status === 'completed') {
      throw new Error('Completed delivery is immutable; create a follow-up delivery instead.');
    }
    if (!input.title.trim()) throw new Error('Review task title is required.');
    if (!['blocking', 'follow-up'].includes(input.severity ?? 'blocking')) {
      throw new Error('Review task severity must be blocking or follow-up.');
    }
    if (input.target && (!input.target.runId || !input.target.step)) {
      throw new Error('An explicit review task target requires both runId and step.');
    }
    if (input.target?.runId && input.target.step) {
      const run = RunStateStore.load(this.workspaceRoot, input.target.runId);
      if (!run) throw new Error(`Explicit review target run "${input.target.runId}" not found.`);
      const idx = stepIndex(this.pipeline(run.pipelineId), input.target.step);
      if (run.steps[idx]?.status !== 'approved') {
        throw new Error('Explicit review task target must be a previously completed/approved step.');
      }
    }
    const nextNumber = state.reviewTasks.reduce((max, task) => {
      const value = Number(task.id.match(/HR-(\d+)/)?.[1] ?? 0);
      return Math.max(max, value);
    }, 0) + 1;
    const task: DeliveryReviewTask = {
      id: `HR-${String(nextNumber).padStart(3, '0')}`,
      title: input.title.trim(),
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      severity: input.severity ?? 'blocking',
      status: 'pending',
      target: input.target,
      createdAt: new Date().toISOString(),
    };
    state.reviewTasks.push(task);
    event(state, 'review-task-added', `${task.id}: ${task.title}`);
    writeDeliveryReviewBundle(this.workspaceRoot, state);
    DeliveryStateStore.save(this.workspaceRoot, state);
    return task;
  }

  async rework(deliveryId: string, options: StartDeliveryOptions = {}): Promise<DeliveryState> {
    const state = this.load(deliveryId);
    const pending = state.reviewTasks.filter((task) => task.status === 'pending');
    if (!pending.length) throw new Error('No pending human review tasks.');
    state.reviewRevision++;
    const hooks = options.hooks ?? {};
    let contextChanged = false;
    let featureFrontChanged = false;
    let workerChanged = false;
    let integrationOnly = false;
    const grouped = new Map<string, {
      target: DeliveryReviewTaskTarget;
      stepIdx: number;
      feedback: string[];
    }>();

    for (const task of pending) {
      task.status = 'running';
      const target = task.target ?? this.routeTask(state, task.title);
      task.target = target;
      if (!target.runId || !target.step) throw new Error('Review task target must identify a run and step.');
      const run = RunStateStore.load(this.workspaceRoot, target.runId);
      if (!run) throw new Error(`Run "${target.runId}" not found.`);
      const idx = stepIndex(this.pipeline(run.pipelineId), target.step);
      const existing = grouped.get(target.runId);
      if (!existing) {
        grouped.set(target.runId, { target, stepIdx: idx, feedback: [`${task.id}: ${task.title}`] });
      } else {
        existing.feedback.push(`${task.id}: ${task.title}`);
        if (idx < existing.stepIdx) {
          existing.target = target;
          existing.stepIdx = idx;
        }
      }
      if (target.runId === state.projectContextRunId) contextChanged = true;
      else if (state.workerRunIds.includes(target.runId ?? '')) workerChanged = true;
      else if (target.step && ['capture-context', 'specify', 'clarify', 'plan', 'tasks-package', 'analyze-contract'].includes(target.step)) featureFrontChanged = true;
      else integrationOnly = true;
    }

    try {
      for (const item of grouped.values()) {
        this.reopen(item.target, item.feedback.join('\n'));
      }
      if (contextChanged) {
        await this.executeRun(state, state.projectContextRunId!, undefined, hooks);
        this.reopenApprovedStep(state.featureRunId!, 'capture-context', 'Project Context changed during aggregate review.');
        featureFrontChanged = true;
      }
      if (featureFrontChanged) {
        await this.executeFeatureFront(state, hooks);
        const refreshedManifest = readWorkPackageManifest(this.workspaceRoot, state.featureRunId!);
        for (const pkg of refreshedManifest.packages) {
          if (RunStateStore.load(this.workspaceRoot, pkg.runId)) {
            this.reopenApprovedStep(pkg.runId, 'load-package', 'Feature contract/context changed during aggregate review.');
          }
        }
        workerChanged = true;
      }
      if (workerChanged) {
        await this.ensureWorkers(state, hooks, options.charterTemplatesRoot);
        this.reopenApprovedStep(state.featureRunId!, 'await-packages', 'Worker result changed during aggregate review.');
        integrationOnly = true;
      }
      if (integrationOnly) await this.ensureFeatureReviewReady(state, hooks);

      const completedAt = new Date().toISOString();
      for (const task of pending) { task.status = 'done'; task.completedAt = completedAt; }
      state.status = 'awaiting-aggregate-review';
      state.lastError = undefined;
      event(state, 'rework-completed', `Review bundle R${state.reviewRevision}`);
      writeDeliveryReviewBundle(this.workspaceRoot, state);
      DeliveryStateStore.save(this.workspaceRoot, state);
      return state;
    } catch (error) {
      for (const task of pending) {
        if (task.status === 'running') task.status = 'pending';
      }
      state.status = 'blocked';
      state.lastError = error instanceof Error ? error.message : String(error);
      event(state, 'rework-blocked', state.lastError);
      writeDeliveryReviewBundle(this.workspaceRoot, state);
      DeliveryStateStore.save(this.workspaceRoot, state);
      throw error;
    }
  }

  async resumeAfterMerge(deliveryId: string, hooks: DeliveryHooks = {}): Promise<DeliveryState> {
    const state = this.load(deliveryId);
    if (state.reviewTasks.some((task) => task.severity === 'blocking' && task.status !== 'done')) {
      throw new Error('Blocking human review tasks remain open.');
    }
    try {
      state.status = 'project-sync';
      this.saveStage(state, hooks, 'project-sync');
      await this.executeRun(state, state.featureRunId!, undefined, hooks);
      const feature = RunStateStore.load(this.workspaceRoot, state.featureRunId!);
      if (feature?.status !== 'completed') throw new Error('Feature did not complete project-sync.');
      state.status = 'completed';
      state.lastError = undefined;
      state.completedStages = [...new Set([...state.completedStages, 'project-sync'])];
      event(state, 'completed');
      const summary = writeDeliveryReviewBundle(this.workspaceRoot, state);
      const final = path.join(path.dirname(summary), 'FINAL-DELIVERY-SUMMARY.md');
      fs.copyFileSync(summary, final);
      DeliveryStateStore.save(this.workspaceRoot, state);
      return state;
    } catch (error) {
      state.status = 'blocked';
      state.lastError = error instanceof Error ? error.message : String(error);
      event(state, 'post-merge-blocked', state.lastError);
      writeDeliveryReviewBundle(this.workspaceRoot, state);
      DeliveryStateStore.save(this.workspaceRoot, state);
      throw error;
    }
  }

  private async ensureProjectContext(state: DeliveryState, hooks: DeliveryHooks, templatesRoot?: string): Promise<void> {
    state.status = 'project-context';
    this.saveStage(state, hooks, 'project-context');
    const runId = state.projectContextRunId ?? `${state.id}-PROJECT-CONTEXT`;
    state.projectContextRunId = runId;
    const ws = WorkspaceLoader.load(this.workspaceRoot);
    const pipeline = this.pipeline('project-context');
    const existingContextRun = RunStateStore.load(this.workspaceRoot, runId);
    if (existingContextRun && existingContextRun.pipelineId !== pipeline.id) {
      throw new Error(`Run id collision: ${runId} belongs to pipeline ${existingContextRun.pipelineId}.`);
    }
    if (!existingContextRun) {
      const existingManifest = fs.existsSync(path.join(this.workspaceRoot, 'docs/project/context/CONTEXT-MANIFEST.json'));
      scaffoldEpic({
        workspaceRoot: this.workspaceRoot,
        doc: ws.config,
        epicId: runId,
        title: `Project context for ${state.request.title}`,
        description: `Infer or refresh the existing project context before delivering ${state.request.title}.`,
        target: { kind: 'pipeline', id: pipeline.id },
        agents: uniqueAgents(pipeline),
        inputs: {
          context_mode: 'inferred-existing',
          context_operation: existingManifest ? 'refresh' : 'bootstrap',
        },
        pipeline,
        charterTemplatesRoot: templatesRoot ?? defaultCharterTemplatesDir(),
      });
    }
    await this.executeRun(state, runId, undefined, hooks);
    state.completedStages = [...new Set([...state.completedStages, 'project-context'])];
    DeliveryStateStore.save(this.workspaceRoot, state);
  }

  private async ensureFeatureContract(state: DeliveryState, hooks: DeliveryHooks): Promise<void> {
    state.status = 'feature-contract';
    this.saveStage(state, hooks, 'feature-contract');
    const runId = state.featureRunId ?? state.request.id;
    state.featureRunId = runId;
    const ws = WorkspaceLoader.load(this.workspaceRoot);
    const pipeline = this.pipeline('cohesive-feature');
    const existingFeatureRun = RunStateStore.load(this.workspaceRoot, runId);
    if (existingFeatureRun && existingFeatureRun.pipelineId !== pipeline.id) {
      throw new Error(`Run id collision: ${runId} belongs to pipeline ${existingFeatureRun.pipelineId}.`);
    }
    if (!existingFeatureRun) {
      const charter = readCharterJson(this.workspaceRoot);
      const goals = charter.goals.filter((goal) => goal.status !== 'retired').map((goal) => goal.id);
      if (!goals.length) throw new Error('Inferred/confirmed charter contains no active Goals.');
      scaffoldEpic({
        workspaceRoot: this.workspaceRoot,
        doc: ws.config,
        epicId: runId,
        title: state.request.title,
        description: deliveryBrief(state.request),
        target: { kind: 'pipeline', id: pipeline.id },
        agents: uniqueAgents(pipeline),
        inputs: {
          delivery_profile: state.profile.id,
          requirement_source: state.request.source?.type ?? 'manual',
          requirement_reference: state.request.source?.reference ?? '',
        },
        pipeline,
        alignmentSeed: {
          servesGoals: goals,
          scope: deliveryBrief(state.request),
          featureConstraints: state.request.constraints?.join('\n') ?? 'Stay within the supplied delivery request.',
        },
      });
    }
    await this.executeFeatureFront(state, hooks);
    state.completedStages = [...new Set([...state.completedStages, 'feature-contract'])];
    DeliveryStateStore.save(this.workspaceRoot, state);
  }

  private async executeFeatureFront(state: DeliveryState, hooks: DeliveryHooks): Promise<void> {
    const pipeline = this.pipeline('cohesive-feature');
    await this.executeRun(state, state.featureRunId!, stepIndex(pipeline, 'analyze-contract'), hooks);
  }

  private async ensureWorkers(state: DeliveryState, hooks: DeliveryHooks, templatesRoot?: string): Promise<void> {
    state.status = 'executing-workers';
    this.saveStage(state, hooks, 'executing-workers');
    const manifest = readWorkPackageManifest(this.workspaceRoot, state.featureRunId!);
    const ws = WorkspaceLoader.load(this.workspaceRoot);
    const pipeline = this.pipeline('cohesive-work-package');
    state.workerRunIds = manifest.packages.map((pkg) => pkg.runId);
    for (const pkg of manifest.packages) {
      const existingWorker = RunStateStore.load(this.workspaceRoot, pkg.runId);
      if (existingWorker) {
        if (existingWorker.pipelineId !== pipeline.id
          || existingWorker.context.feature_id !== state.featureRunId
          || existingWorker.context.package_id !== pkg.id) {
          throw new Error(`Worker run id collision or identity mismatch: ${pkg.runId}.`);
        }
        continue;
      }
      scaffoldEpic({
        workspaceRoot: this.workspaceRoot,
        doc: ws.config,
        epicId: pkg.runId,
        title: `${state.request.title} — ${pkg.id}`,
        description: `Execute ${pkg.id} for feature ${state.featureRunId}.`,
        target: { kind: 'pipeline', id: pipeline.id },
        agents: uniqueAgents(pipeline),
        inputs: { feature_id: state.featureRunId!, package_id: pkg.id, delivery_profile: state.profile.id },
        pipeline,
        charterTemplatesRoot: templatesRoot,
      });
    }

    const byId = new Map(manifest.packages.map((pkg) => [pkg.id, pkg]));
    const remaining = new Set(manifest.packages.map((pkg) => pkg.id));
    while (remaining.size) {
      for (const id of [...remaining]) {
        const pkg = byId.get(id)!;
        if (RunStateStore.load(this.workspaceRoot, pkg.runId)?.status === 'completed') remaining.delete(id);
      }
      if (!remaining.size) break;
      const ready = [...remaining].filter((id) => {
        const pkg = byId.get(id)!;
        return (pkg.dependsOn ?? []).every((dep) => {
          const depPkg = byId.get(dep);
          return depPkg && RunStateStore.load(this.workspaceRoot, depPkg.runId)?.status === 'completed';
        });
      });
      if (!ready.length) throw new Error(`No runnable work packages remain: ${[...remaining].join(', ')}.`);
      for (let i = 0; i < ready.length; i += state.profile.maxParallelWorkers) {
        const wave = ready.slice(i, i + state.profile.maxParallelWorkers);
        await Promise.all(wave.map(async (id) => {
          const pkg = byId.get(id)!;
          await this.executeRun(state, pkg.runId, undefined, hooks);
          const run = RunStateStore.load(this.workspaceRoot, pkg.runId);
          if (run?.status !== 'completed') throw new Error(`Worker ${pkg.runId} did not complete.`);
        }));
      }
    }
    state.completedStages = [...new Set([...state.completedStages, 'workers'])];
    DeliveryStateStore.save(this.workspaceRoot, state);
  }

  private async ensureFeatureReviewReady(state: DeliveryState, hooks: DeliveryHooks): Promise<void> {
    state.status = 'integrating';
    this.saveStage(state, hooks, 'integrating');
    const pipeline = this.pipeline('cohesive-feature');
    const stop = state.profile.openFeaturePullRequest ? 'open-pr' : 'system-test';
    await this.executeRun(state, state.featureRunId!, stepIndex(pipeline, stop), hooks);
    state.completedStages = [...new Set([...state.completedStages, 'integration', stop])];
    DeliveryStateStore.save(this.workspaceRoot, state);
  }

  private async executeRun(
    state: DeliveryState,
    runId: string,
    untilIdx: number | undefined,
    hooks: DeliveryHooks,
  ): Promise<ExecOutcome> {
    const outcome = await runExecLoop(this.workspaceRoot, runId, {
      untilIdx,
      aggregateReview: state.profile.reviewStrategy === 'aggregate',
      reviewBundleRevision: state.reviewRevision,
    }, hooks);
    if (!['completed', 'until'].includes(outcome.kind)) {
      if (outcome.kind === 'error' && outcome.failure) {
        const failure: DeliveryFailureRef = {
          ...outcome.failure,
          runId,
          resumeCommand: `aidlc cohesive resume ${state.id}`,
          recoveryCommands: [...new Set([
            ...outcome.failure.recoveryCommands.filter((command) => !command.startsWith('aidlc run exec ')),
            `aidlc cohesive resume ${state.id}`,
          ])],
        };
        state.lastFailure = failure;
        state.failureHistory = [...(state.failureHistory ?? []), failure];
        event(state, 'execution-failed', `${failure.code}: ${failure.summary} (${failure.logPath})`);
        DeliveryStateStore.save(this.workspaceRoot, state);
        throw new Error([
          `Run ${runId} failed at step ${failure.stepIdx ?? '?'}${failure.agent ? ` (${failure.agent})` : ''}: ${failure.summary}`,
          `Failure log: ${failure.logPath}`,
          `Recovery: ${failure.recoveryCommands.join(' && ')}`,
        ].join('\n'));
      }
      throw new Error(`Run ${runId} stopped with outcome ${outcome.kind}. Resume with: aidlc cohesive resume ${state.id}`);
    }
    if (state.lastFailure?.runId === runId) {
      event(state, 'execution-recovered', `${state.lastFailure.code}: resumed ${runId} successfully.`);
      state.lastFailure = undefined;
      state.lastError = undefined;
      DeliveryStateStore.save(this.workspaceRoot, state);
    }
    return outcome;
  }

  private routeTask(state: DeliveryState, title: string): DeliveryReviewTaskTarget {
    const lower = title.toLowerCase();
    if (/context|architecture|domain|charter|policy|bối cảnh|kiến trúc|miền|chính sách|mục tiêu/.test(lower)) {
      return {
        runId: state.projectContextRunId,
        step: /charter|policy|chính sách|mục tiêu/.test(lower) ? 'define-charter' : 'model-project',
      };
    }
    if (/requirement|scope|acceptance|behavio[u]?r|yêu cầu|phạm vi|nghiệm thu|hành vi/.test(lower)) {
      return { runId: state.featureRunId, step: 'specify' };
    }
    if (/plan|design|kế hoạch|thiết kế/.test(lower)) {
      return { runId: state.featureRunId, step: 'plan' };
    }
    if (/package|boundary|ownership|gói|ranh giới|sở hữu/.test(lower)) {
      return { runId: state.featureRunId, step: 'tasks-package' };
    }
    if (/integrat|conflict|cohesion|tích hợp|xung đột|kết dính/.test(lower)) {
      return { runId: state.featureRunId, step: 'integrate' };
    }
    const worker = state.workerRunIds[0];
    if (worker) {
      return {
        runId: worker,
        step: /test|coverage|kiểm thử|bao phủ/.test(lower) ? 'package-test-plan' : 'implement-package',
      };
    }
    return { runId: state.featureRunId, step: 'integrate' };
  }

  private reopen(target: DeliveryReviewTaskTarget, feedback: string): void {
    if (!target.runId || !target.step) throw new Error('Review task target must identify a run and step.');
    this.reopenApprovedStep(target.runId, target.step, feedback);
  }

  private reopenApprovedStep(runId: string, stepName: string, feedback: string): void {
    const run = RunStateStore.load(this.workspaceRoot, runId);
    if (!run) throw new Error(`Run "${runId}" not found.`);
    const pipeline = this.pipeline(run.pipelineId);
    const idx = stepIndex(pipeline, stepName);
    if (run.steps[idx]?.status !== 'approved') return;
    const next = requestStepUpdate({ state: run, pipeline, stepIdx: idx, feedback });
    RunStateStore.save(this.workspaceRoot, next);
  }

  private pipeline(id: string): PipelineConfig {
    const pipeline = WorkspaceLoader.load(this.workspaceRoot).config.pipelines.find((item) => item.id === id);
    if (!pipeline) throw new Error(`Required Cohesive Delivery pipeline "${id}" is not installed.`);
    return pipeline;
  }

  private saveStage(state: DeliveryState, hooks: DeliveryHooks, stage: string): void {
    event(state, 'stage', stage);
    DeliveryStateStore.save(this.workspaceRoot, state);
    hooks.onDeliveryStage?.({ deliveryId: state.id, stage });
  }
}
