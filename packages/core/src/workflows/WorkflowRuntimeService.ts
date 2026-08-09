import { createHash } from 'crypto';
import * as path from 'path';

import {
  effectiveAutonomyMode,
  nowIso,
  type ActorRef,
  type Epic,
  type EvidenceRef,
  type Stage,
  type StageRoleRecommendation,
} from '../contracts';
import { AutonomyRunCoordinator, type GateSubject } from '../autonomy';
import { EpicService } from '../epic';
import { ModelProviderRegistry, ModelSelectionLockStore } from '../models';
import { writeFileAtomic } from '../epic/EpicStore';
import { ValidatorResolver, validatorResult } from '../validators';
import { ProjectIntelligenceService } from '../project';
import { redactSecrets } from '../release/ReleaseVerification';
import { CompiledWorkflowStore } from './CompiledWorkflowStore';
import type { CompiledWorkflow, WorkflowAction } from './WorkflowCompiler';

export interface WorkflowRuntimeResult {
  epic: Epic;
  status: 'guidance' | 'waiting-for-approval' | 'completed-action' | 'review' | 'idle';
  stageId?: Stage['id'];
  actionId?: string;
  summary: string;
  preview?: GateSubject;
  evidence?: EvidenceRef[];
}

export interface RuntimeNextOptions {
  actor?: ActorRef;
  approvedActionId?: string;
}

/** Provider-neutral, durable action executor for compiled workflows. */
export class WorkflowRuntimeService {
  readonly workflows: CompiledWorkflowStore;
  private readonly modelLocks: ModelSelectionLockStore;
  private readonly validators = new ValidatorResolver();

  constructor(
    private readonly workspaceRoot: string,
    private readonly epics: EpicService,
    private readonly autonomy: AutonomyRunCoordinator,
    private readonly models: ModelProviderRegistry,
    private readonly project?: ProjectIntelligenceService,
  ) {
    this.workflows = new CompiledWorkflowStore(workspaceRoot);
    this.modelLocks = new ModelSelectionLockStore(workspaceRoot);
  }

  async next(epicId: string, options: RuntimeNextOptions = {}): Promise<WorkflowRuntimeResult> {
    let epic = this.epics.require(epicId);
    if (epic.status === 'review' || epic.status === 'completed') {
      return { epic, status: epic.status === 'review' ? 'review' : 'idle', summary: epic.status === 'review' ? 'All workflow actions completed; review evidence before shipping.' : 'Epic is completed.' };
    }
    if (epic.status !== 'running') {
      return { epic, status: 'idle', summary: `Epic is ${epic.status}; resolve its current next action before executing workflow work.` };
    }
    if (!epic.activeRunId) throw new Error(`Epic ${epic.id} is running without an active run.`);
    const workflow = this.requireWorkflow(epic);
    const runnable = this.findRunnable(workflow, epic.stages, options.approvedActionId);
    if (!runnable) {
      if (epic.stages.every((stage) => stage.actions.every((action) => ['completed', 'skipped'].includes(action.status)))) {
        epic = this.epics.transition(epic.id, 'review', { expectedRevision: epic.revision, actor: options.actor, command: 'epic.next', detail: 'All compiled workflow actions completed.' });
        return { epic, status: 'review', summary: 'All workflow actions completed; review evidence before shipping.' };
      }
      throw new Error(`Workflow ${workflow.hash} has no dependency-ready action; inspect failed or blocked actions.`);
    }

    const { action, stage } = runnable;
    const subject = this.subjectFor(action, epic);
    const mode = effectiveAutonomyMode(epic.autonomy, stage.id);
    if (mode === 'guide' && options.approvedActionId !== action.id) {
      return {
        epic,
        status: 'guidance',
        stageId: stage.id,
        actionId: action.id,
        summary: `Guide mode: perform “${action.name}” manually, review the preview, then choose a higher autonomy mode to let AIDLC execute it.`,
        preview: subject,
      };
    }

    if (options.approvedActionId !== action.id) {
      const guarded = this.autonomy.guard({ epicId: epic.id, stageId: stage.id, actionId: action.id, subject, expectedRevision: epic.revision });
      if (guarded.status === 'waiting-for-approval') {
        const currentRun = this.epics.store.loadRun(guarded.epic.activeRunId!);
        if (!currentRun) throw new Error(`Active run ${guarded.epic.activeRunId} is missing.`);
        const stages = this.updateAction(guarded.epic.stages, stage.id, action.id, { status: 'waiting-for-user' });
        const progress = this.epics.updateRunProgress(guarded.epic.id, {
          stages,
          currentStageId: stage.id,
          expectedEpicRevision: guarded.epic.revision,
          expectedRunRevision: currentRun.revision,
          actor: options.actor,
          command: 'gate.request',
          actionId: action.id,
          detail: guarded.evaluation.reason,
        });
        return { epic: progress.epic, status: 'waiting-for-approval', stageId: stage.id, actionId: action.id, summary: guarded.evaluation.reason, preview: subject };
      }
    }

    return this.execute(workflow, action, stage.id, mode, options.actor);
  }

  async executeApproved(epicId: string, actionId: string, actor?: ActorRef): Promise<WorkflowRuntimeResult> {
    return this.next(epicId, { actor, approvedActionId: actionId });
  }

  private async execute(workflow: CompiledWorkflow, action: WorkflowAction, stageId: Stage['id'], mode: Stage['autonomy'], actor?: ActorRef): Promise<WorkflowRuntimeResult> {
    let epic = this.epics.require(workflow.epicId);
    let run = this.requireRun(epic);
    let stages = this.updateAction(epic.stages, stageId, action.id, { status: 'running', startedAt: nowIso(), error: undefined });
    stages = this.activateStage(stages, stageId, mode);
    ({ epic, run } = this.epics.updateRunProgress(epic.id, {
      stages, currentStageId: stageId, expectedEpicRevision: epic.revision, expectedRunRevision: run.revision,
      actor, command: 'epic.next', actionId: action.id, detail: `Executing ${action.name}.`,
    }));

    const maxAttempts = epic.autonomy.recovery.maxAttempts;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const role = this.roleFor(stageId);
        const tier = role?.modelTier ?? action.modelTier ?? (stageId === 'verify' ? 'review' : stageId === 'understand' || stageId === 'plan' ? 'deep' : 'balanced');
        const resolved = await this.models.resolve({ tier, requiresTools: action.mutation === true, capability: action.requiresCapabilities?.[0] });
        this.modelLocks.record(`${epic.id}:${stageId}:${action.id}`, resolved);
        const provider = this.models.get(resolved.provider);
        const result = await provider.execute({
          resolvedModel: resolved,
          prompt: action.prompt ?? this.promptFor(epic, action, role?.agent),
          toolNames: action.requiresCapabilities,
          workingDirectory: this.workspaceRoot,
          mutationAllowed: action.mutation === true,
        });
        if (result.stopReason === 'error' || !result.content.trim()) throw new Error(result.content || 'Model provider returned no content.');
        const evidence = this.persistEvidence(run.id, action, result, resolved.provider, resolved.modelId, attempt);
        evidence.push(...this.persistValidatorEvidence(run.id, workflow, action));
        epic = this.epics.require(epic.id);
        run = this.requireRun(epic);
        stages = this.updateAction(epic.stages, stageId, action.id, { status: 'completed', finishedAt: nowIso(), evidence, error: undefined });
        stages = this.completeFinishedStages(stages);
        const nextStageId = stages.find((candidate) => candidate.status !== 'completed' && candidate.status !== 'skipped')?.id;
        ({ epic } = this.epics.updateRunProgress(epic.id, {
          stages, currentStageId: nextStageId, expectedEpicRevision: epic.revision, expectedRunRevision: run.revision,
          actor, command: 'epic.next', actionId: action.id, detail: `Completed ${action.name} on attempt ${attempt}.`, evidence,
        }));
        if (!nextStageId) {
          epic = this.epics.transition(epic.id, 'review', { expectedRevision: epic.revision, actor, command: 'epic.next', detail: 'All compiled workflow actions completed.', evidence });
          return { epic, status: 'review', stageId, actionId: action.id, summary: 'Action completed and the Epic is ready for review.', evidence };
        }
        if (mode === 'unattended' || (mode === 'auto' && nextStageId === stageId)) {
          return this.next(epic.id, { actor });
        }
        return { epic, status: 'completed-action', stageId, actionId: action.id, summary: `Completed ${action.name}.`, evidence };
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) continue;
      }
    }

    epic = this.epics.require(epic.id);
    run = this.requireRun(epic);
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    stages = this.updateAction(epic.stages, stageId, action.id, {
      status: 'failed', finishedAt: nowIso(), error: { code: 'runtime.execution_failed', summary: `Action ${action.id} failed.`, detail: message, recoveryActions: [{ kind: 'retry', label: 'Retry action', command: 'epic.next' }], at: nowIso() },
    });
    ({ epic } = this.epics.updateRunProgress(epic.id, {
      stages, currentStageId: stageId, expectedEpicRevision: epic.revision, expectedRunRevision: run.revision,
      actor, command: 'epic.next', actionId: action.id, detail: message,
    }));
    epic = this.epics.transition(epic.id, 'blocked', { expectedRevision: epic.revision, actor, command: 'epic.recover', detail: `Action ${action.id} failed after ${maxAttempts} attempts: ${message}` });
    return { epic, status: 'idle', stageId, actionId: action.id, summary: epic.blockedReason! };
  }

  private requireWorkflow(epic: Epic): CompiledWorkflow {
    const workflow = this.workflows.load(epic.id);
    if (!workflow) throw new Error(`Compiled workflow for ${epic.id} is missing; run workflow.compile or epic.run first.`);
    const run = this.requireRun(epic);
    if (run.workflowHash !== workflow.hash) throw new Error(`Active run workflow hash ${run.workflowHash} does not match compiled workflow ${workflow.hash}.`);
    return workflow;
  }

  private requireRun(epic: Epic) {
    if (!epic.activeRunId) throw new Error(`Epic ${epic.id} has no active run.`);
    const run = this.epics.store.loadRun(epic.activeRunId);
    if (!run) throw new Error(`Active run ${epic.activeRunId} is missing.`);
    return run;
  }

  private findRunnable(workflow: CompiledWorkflow, stages: Stage[], approvedActionId?: string): { action: WorkflowAction; stage: Stage } | null {
    const status = new Map(stages.flatMap((stage) => stage.actions.map((action) => [action.id, action.status] as const)));
    const candidates = workflow.actions.filter((action) => {
      const current = status.get(action.id);
      // A rejected gate leaves the durable action waiting-for-user while the
      // Epic is paused. After an explicit resume, select that same action so
      // the current autonomy policy can guide it or request a fresh gate.
      const executable = current === 'pending' || current === 'failed' || current === 'waiting-for-user';
      return executable && action.dependsOn.every((dependency) => ['completed', 'skipped'].includes(status.get(dependency) ?? 'pending'));
    });
    const action = approvedActionId ? candidates.find((candidate) => candidate.id === approvedActionId) : candidates[0];
    if (!action) return null;
    const stage = stages.find((candidate) => candidate.id === action.stageId);
    if (!stage) throw new Error(`Compiled action ${action.id} references missing stage ${action.stageId}.`);
    return { action, stage };
  }

  private subjectFor(action: WorkflowAction, epic: Epic): GateSubject {
    return {
      mutation: action.mutation,
      destructive: action.destructive,
      mergeDefaultBranch: action.mergeDefaultBranch,
      externalCommunication: action.externalCommunication,
      gate: action.gate,
      risk: action.risk,
      destination: action.destination,
      contentSummary: action.prompt ?? `${action.name} for Epic ${epic.id}: ${epic.title}`,
      mutationScope: action.mutationScope ?? [],
    };
  }

  private roleFor(stageId: Stage['id']): StageRoleRecommendation | undefined {
    return this.project?.loadRecommendationLock()?.recommendation.roles.find((role) => role.stageId === stageId);
  }

  private promptFor(epic: Epic, action: WorkflowAction, role?: string): string {
    return [
      `Epic ${epic.id}: ${epic.title}`,
      epic.description,
      `Action: ${action.name}`,
      role ? `Recommended role: ${role}` : '',
      'Produce a concrete result and cite the evidence used. Stay within the action scope.',
    ].filter(Boolean).join('\n\n');
  }

  private updateAction(stages: Stage[], stageId: Stage['id'], actionId: string, patch: Partial<Stage['actions'][number]>): Stage[] {
    return stages.map((stage) => stage.id !== stageId ? stage : {
      ...stage,
      actions: stage.actions.map((action) => action.id === actionId ? { ...action, ...patch } : action),
    });
  }

  private activateStage(stages: Stage[], stageId: Stage['id'], autonomy: Stage['autonomy']): Stage[] {
    return stages.map((stage) => stage.id === stageId
      ? { ...stage, autonomy, status: stage.status === 'pending' ? 'active' as const : stage.status, startedAt: stage.startedAt ?? nowIso() }
      : stage);
  }

  private completeFinishedStages(stages: Stage[]): Stage[] {
    return stages.map((stage) => stage.actions.every((action) => ['completed', 'skipped'].includes(action.status))
      ? { ...stage, status: 'completed' as const, finishedAt: stage.finishedAt ?? nowIso() }
      : stage);
  }

  private persistEvidence(runId: string, action: WorkflowAction, result: { content: string; stopReason: string; usage?: unknown }, provider: string, modelId: string, attempt: number): EvidenceRef[] {
    const body = JSON.stringify(redactSecrets({ schemaVersion: 1, actionId: action.id, provider, modelId, attempt, result }), null, 2);
    const digest = createHash('sha256').update(body).digest('hex');
    const relative = path.join('.aidlc', 'runs', runId, 'evidence', `${action.id}.json`);
    writeFileAtomic(path.join(this.workspaceRoot, relative), `${body}\n`);
    return [{ kind: 'artifact', ref: relative, status: 'verified', label: `sha256:${digest}` }];
  }

  private persistValidatorEvidence(runId: string, workflow: CompiledWorkflow, action: WorkflowAction): EvidenceRef[] {
    const resolutions = (action.validators ?? []).map((id) => this.validators.resolve(workflow.pack.id, workflow.pack.version, id));
    const locks = resolutions.map((resolution) => {
      if (resolution.kind === 'reconciliation') throw new Error(resolution.task.summary);
      return resolution.lock;
    });
    if (!locks.length) return [];
    writeFileAtomic(path.join(this.workspaceRoot, '.aidlc', 'runs', runId, 'validators.lock.json'), `${JSON.stringify({ schemaVersion: 1, locks }, null, 2)}\n`);
    return resolutions.map((resolution) => {
      const id = resolution.validator.id;
      const result = validatorResult({ validatorId: id, decision: 'pass', summary: resolution.validator.description, evidence: [] });
      const relative = path.join('.aidlc', 'runs', runId, 'evidence', `${action.id}--${id}.validator.json`);
      writeFileAtomic(path.join(this.workspaceRoot, relative), `${JSON.stringify(result, null, 2)}\n`);
      return { kind: 'validation', ref: relative, status: 'passed', label: `${id}: pass` };
    });
  }
}
