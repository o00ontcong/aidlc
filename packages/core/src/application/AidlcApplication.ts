import {
  AutonomyModeSchema,
  createDefaultAutonomyPolicy,
  effectiveAutonomyMode,
  isHardGate,
  nowIso,
  parseArtifactPolicy,
  parseAidlcError,
  toChangeId,
  toContextGroupId,
  toContextProposalId,
  toEpicId,
  type ApplicationCommand,
  type AutonomyMode,
  type ChangeOrigin,
  type ChangePriority,
  type ChangeRequirement,
  type ChangeType,
  type CommandResult,
  type ContextRevisionId,
  type EpicProfile,
  type ExternalReference,
  type GateDecision,
  type ScopeAnalysis,
  type SourceSnapshot,
  type StageId,
} from '../contracts';
import { ArtifactPolicyService } from '../artifacts';
import { AutonomyController, AutonomyPolicyStore, AutonomyRunCoordinator, type GateEvaluation, type GateSubject } from '../autonomy';
import { CapabilityPolicyStore, CapabilityRegistry } from '../capabilities';
import {
  ChangeEpicCoordinator,
  ChangeService,
  type ChangeShapeDraftInput,
  type MergeChangesInput,
  type ScopeFeedbackNextRoute,
  type SplitChangeChildInput,
} from '../change';
import { ContextBootstrapService, ContextProposalService, type StartContextProposalInput } from '../context';
import { EpicService, type CreateEpicInput } from '../epic';
import { GuideService } from '../guide';
import { createDefaultModelProviderRegistry, ModelProviderConfigStore, ModelProviderRegistry } from '../models';
import { lockWorkflowPack, resolveBuiltinWorkflowPack } from '../packs';
import { ProjectIntelligenceService } from '../project';
import { installClaudeAidlcCommand, ProjectLayoutMigrationService } from '../release';
import { LegacyMigrationService } from '../migration';
import type { VersionGuard } from '../storage';
import { CompiledWorkflowStore, WorkflowRuntimeService, compileWorkflow, type CompiledWorkflow } from '../workflows';
import { CommandBus } from './CommandBus';

function ok(
  command: ApplicationCommand,
  data: unknown,
  nextAction?: CommandResult['nextAction'],
  status: CommandResult['status'] = 'ok',
  extras: Partial<Pick<CommandResult, 'warnings' | 'evidence' | 'recoveryActions'>> = {},
): CommandResult {
  return {
    schemaVersion: 1,
    commandId: command.id,
    status,
    data,
    nextAction,
    warnings: extras.warnings ?? [],
    evidence: extras.evidence ?? [],
    recoveryActions: extras.recoveryActions ?? [],
  };
}

function epicOutcome(status: string): CommandResult['status'] {
  return status === 'waiting-for-user' ? 'waiting-for-user' : status === 'blocked' ? 'blocked' : 'ok';
}

/** Single application boundary shared by CLI, Claude command, and Extension adapters. */
export class AidlcApplication {
  readonly bus = new CommandBus();
  readonly epics: EpicService;
  readonly project: ProjectIntelligenceService;
  readonly artifacts: ArtifactPolicyService;
  readonly gates: AutonomyController;
  readonly capabilities: CapabilityRegistry;
  readonly capabilityPolicy: CapabilityPolicyStore;
  readonly models: ModelProviderRegistry;
  readonly modelProviderConfig: ModelProviderConfigStore;
  readonly autonomy: AutonomyRunCoordinator;
  readonly autonomyPolicy: AutonomyPolicyStore;
  readonly runtime: WorkflowRuntimeService;
  readonly workflows: CompiledWorkflowStore;
  readonly guide: GuideService;
  readonly layout: ProjectLayoutMigrationService;
  readonly migration: LegacyMigrationService;
  readonly changes: ChangeService;
  readonly changeEpics: ChangeEpicCoordinator;
  readonly contextBootstrap: ContextBootstrapService;
  readonly contextProposals: ContextProposalService;
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string, options: { models?: ModelProviderRegistry } = {}) {
    this.workspaceRoot = workspaceRoot;
    this.gates = new AutonomyController();
    this.capabilityPolicy = new CapabilityPolicyStore(workspaceRoot);
    this.capabilities = new CapabilityRegistry(this.capabilityPolicy.load());
    this.models = options.models ?? createDefaultModelProviderRegistry();
    this.modelProviderConfig = new ModelProviderConfigStore(workspaceRoot);
    const providerConfig = this.modelProviderConfig.load();
    if (providerConfig && this.models.list().some((provider) => provider.id === providerConfig.defaultProvider)) this.models.setDefault(providerConfig.defaultProvider);
    this.guide = new GuideService();
    this.epics = new EpicService(workspaceRoot);
    this.project = new ProjectIntelligenceService(workspaceRoot, { capabilities: this.capabilities });
    this.artifacts = new ArtifactPolicyService(workspaceRoot);
    this.autonomy = new AutonomyRunCoordinator(this.epics, this.gates);
    this.autonomyPolicy = new AutonomyPolicyStore(workspaceRoot);
    this.runtime = new WorkflowRuntimeService(workspaceRoot, this.epics, this.autonomy, this.models, this.project);
    this.workflows = this.runtime.workflows;
    this.layout = new ProjectLayoutMigrationService(workspaceRoot);
    this.migration = new LegacyMigrationService(workspaceRoot);
    this.changes = new ChangeService(workspaceRoot);
    this.changeEpics = new ChangeEpicCoordinator(workspaceRoot, { changeStore: this.changes.store, epics: this.epics });
    this.contextBootstrap = new ContextBootstrapService(workspaceRoot);
    this.contextProposals = new ContextProposalService(workspaceRoot);
    this.registerCommands();
  }

  private registerCommands(): void {
    this.bus.register<CreateEpicInput>('epic.start', (command) => {
      const locked = this.project.loadRecommendationLock();
      const input = {
        ...command.payload,
        profile: command.payload.profile ?? locked?.recommendation.workflowProfile ?? this.workflows.loadProjectDefault()?.profile,
        autonomy: command.payload.autonomy ?? this.autonomyPolicy.load(),
      };
      const result = this.epics.start(input);
      const context = this.project.contextStatus();
      const needsContext = !context.context || context.stale;
      return ok(command, result, result.nextAction, epicOutcome(result.epic.status), {
        warnings: needsContext ? ['Project Context is missing or uninitialized. Epic creation did not analyze or refresh it implicitly.'] : [],
        recoveryActions: needsContext ? [{ kind: 'refresh-context', label: 'Publish Project Context explicitly.', command: 'project.context.refresh' }] : [],
      });
    });
    this.bus.register<{ epicId: string; workflowHash?: string; packId?: string; version?: string; selectedCapabilities?: string[]; mode?: AutonomyMode }>('epic.run', (command) => {
      let epic = this.epics.require(command.payload.epicId);
      if (command.payload.mode !== undefined) {
        const mode = AutonomyModeSchema.parse(command.payload.mode);
        epic = this.epics.update(epic.id, { autonomy: { ...epic.autonomy, default: mode } }, epic.revision);
      }
      if (epic.status === 'running' && epic.activeRunId) {
        const run = this.epics.store.loadRun(epic.activeRunId);
        if (!run) throw new Error(`Active run ${epic.activeRunId} is missing.`);
        return ok(command, { epic, run, started: false }, this.guide.next(epic));
      }
      if (epic.status === 'draft') {
        epic = this.epics.transition(epic.id, 'ready', { expectedRevision: epic.revision, actor: command.actor, command: 'epic.prepare', detail: 'Prepared automatically as part of explicit epic.run.' });
      }
      const workflow = this.compileAndSave(epic, command.payload.packId ?? this.workflows.loadProjectDefault()?.pack ?? 'sdlc-core', command.payload.version, command.payload.selectedCapabilities);
      const result = this.epics.startRun(epic.id, { workflowHash: workflow.hash, stages: workflow.stages, expectedRevision: epic.revision, actor: command.actor, command: command.name });
      const legacyHashIgnored = Boolean(command.payload.workflowHash && command.payload.workflowHash !== workflow.hash);
      return ok(command, { ...result, workflow, legacyWorkflowHashIgnored: legacyHashIgnored }, result.nextAction, 'ok', {
        warnings: legacyHashIgnored ? ['The legacy workflowHash input was ignored; the run uses the deterministic compiler output. Remove workflowHash during this migration window.'] : [],
      });
    });
    this.bus.register<{ epicId: string }>('epic.prepare', (command) => {
      const epic = this.epics.require(command.payload.epicId);
      if (epic.status !== 'draft' && epic.status !== 'ready') throw new Error(`Epic ${epic.id} cannot be prepared from ${epic.status}.`);
      const prepared = epic.status === 'draft'
        ? this.epics.transition(epic.id, 'ready', { expectedRevision: epic.revision, actor: command.actor, command: command.name })
        : epic;
      return ok(command, prepared, this.guide.next(prepared), epicOutcome(prepared.status));
    });
    this.bus.register<{ epicId: string }>('epic.next', async (command) => {
      const result = await this.runtime.next(command.payload.epicId, { actor: command.actor });
      return ok(command, result, this.guide.nextOrFallback(result.epic), epicOutcome(result.epic.status), { evidence: result.evidence });
    });
    this.bus.register<{ epicId: string }>('epic.status', (command) => {
      const epic = this.epics.require(command.payload.epicId);
      return ok(command, epic, this.guide.next(epic), epicOutcome(epic.status));
    });
    this.bus.register<{ epicId: string }>('epic.resume', (command) => {
      const epic = this.epics.require(command.payload.epicId);
      const result = this.epics.resume(epic.id, { expectedRevision: epic.revision, actor: command.actor, command: command.name });
      return ok(command, result, result.nextAction, epicOutcome(result.epic.status));
    });
    this.bus.register<{ epicId: string }>('epic.explain', (command) => {
      const epic = this.epics.require(command.payload.epicId);
      return ok(command, {
        epic,
        blocker: epic.blockedReason,
        pendingGate: epic.pendingGate,
        nextAction: this.guide.nextOrFallback(epic),
      }, this.guide.nextOrFallback(epic), epicOutcome(epic.status));
    });
    this.bus.register<{ epicId: string }>('epic.review', (command) => {
      const epic = this.epics.require(command.payload.epicId);
      if (epic.status !== 'running' && epic.status !== 'review') throw new Error(`Epic ${epic.id} cannot enter review from ${epic.status}.`);
      const reviewed = epic.status === 'running'
        ? this.epics.transition(epic.id, 'review', { expectedRevision: epic.revision, actor: command.actor, command: command.name })
        : epic;
      return ok(command, reviewed, this.guide.next(reviewed), epicOutcome(reviewed.status));
    });
    this.bus.register<{ epicId: string }>('epic.ship', (command) => {
      const epic = this.epics.require(command.payload.epicId);
      if (!['review', 'shipping', 'completed'].includes(epic.status)) throw new Error(`Epic ${epic.id} cannot ship from ${epic.status}.`);
      const shipping = epic.status === 'review'
        ? this.epics.transition(epic.id, 'shipping', { expectedRevision: epic.revision, actor: command.actor, command: command.name })
        : epic;
      const shipped = shipping.status === 'shipping'
        ? this.epics.transition(shipping.id, 'completed', { expectedRevision: shipping.revision, actor: command.actor, command: command.name })
        : shipping;
      return ok(command, shipped, this.guide.next(shipped), epicOutcome(shipped.status));
    });
    this.bus.register<{ epicId: string; stageId: 'understand' | 'plan' | 'build' | 'verify' | 'ship'; autonomy: 'guide' | 'assist' | 'auto' | 'unattended' }>('epic.stage.autonomy.set', (command) => {
      const epic = this.epics.require(command.payload.epicId);
      const autonomy = { ...epic.autonomy, stages: { ...epic.autonomy.stages, [command.payload.stageId]: command.payload.autonomy } };
      let updated = this.epics.update(epic.id, { autonomy }, epic.revision);
      if (updated.activeRunId) {
        const run = this.epics.store.loadRun(updated.activeRunId);
        if (!run) throw new Error(`Active run ${updated.activeRunId} is missing.`);
        const stages = updated.stages.map((stage) => stage.id === command.payload.stageId ? { ...stage, autonomy: command.payload.autonomy } : stage);
        updated = this.epics.updateRunProgress(updated.id, {
          stages,
          currentStageId: updated.currentStageId,
          expectedEpicRevision: updated.revision,
          expectedRunRevision: run.revision,
          actor: command.actor,
          command: command.name,
          detail: `Stage ${command.payload.stageId} autonomy changed to ${command.payload.autonomy}.`,
        }).epic;
      }
      return ok(command, updated, this.guide.next(updated), epicOutcome(updated.status));
    });
    this.bus.register<{ projectId?: string; sourceCommit?: string }>('project.context.refresh', (command) =>
      ok(command, this.project.refreshContext(command.payload.projectId, command.payload.sourceCommit)));
    this.bus.register<{ projectId?: string; sourceCommit?: string }>('project.analyze', (command) =>
      ok(command, this.project.analyze(command.payload.projectId, command.payload.sourceCommit)));
    this.bus.register<{ sourceCommit?: string }>('project.context.status', (command) =>
      ok(command, this.project.contextStatus(command.payload.sourceCommit)));
    this.bus.register<Record<string, never>>('project.recommend', (command) => {
      const published = this.project.loadContext();
      const facts = published?.analysisStatus === 'published' ? published : this.project.analyze();
      return ok(command, this.project.propose(facts));
    });
    this.bus.register<{ confirm?: boolean; forceClaudeCommand?: boolean }>('project.setup', (command) => {
      const preview = this.layout.preview();
      const confirm = command.payload.confirm === true;
      const layout = confirm ? this.layout.apply(preview, true) : undefined;
      const claudeCommand = confirm
        ? installClaudeAidlcCommand(this.workspaceRoot, { force: command.payload.forceClaudeCommand === true })
        : {
            path: '.claude/commands/aidlc.md',
            installed: false,
            overwritten: false,
            reason: 'Claude /aidlc install is deferred until setup confirm: true.',
          };
      return ok(command, {
        preview,
        layout,
        claudeCommand,
        applied: confirm,
        defaultAutonomy: createDefaultAutonomyPolicy().default,
      }, {
        summary: confirm
          ? 'Project layout is ready. Analyze the project, then start an Epic.'
          : 'Preview the project layout, then re-run setup with confirm to apply.',
        command: confirm ? 'project.analyze' : 'project.setup',
        reason: confirm ? 'Setup applied; next step is read-only analysis.' : 'Setup requires explicit confirm: true before writing files.',
      }, 'ok', {
        warnings: confirm ? [] : ['Setup preview only — pass confirm: true to create standard .aidlc files and install /aidlc.'],
      });
    });
    this.bus.register<{ subject: GateSubject; mode?: AutonomyMode; epicId?: string; stageId?: StageId }>('gate.preview', (command) => {
      const epic = command.payload.epicId ? this.epics.require(command.payload.epicId) : undefined;
      const policy = epic?.autonomy ?? createDefaultAutonomyPolicy();
      const mode = command.payload.mode
        ?? (command.payload.stageId ? effectiveAutonomyMode(policy, command.payload.stageId) : policy.default);
      return ok(command, this.gates.evaluate(policy, mode, command.payload.subject));
    });
    this.bus.register<Record<string, never>>('migration.preview', (command) => ok(command, this.migration.preview()));
    this.bus.register<{ migrationId: string; confirm?: boolean }>('migration.apply', (command) => {
      const preview = this.migration.preview();
      if (preview.id !== command.payload.migrationId) throw new Error(`Migration preview changed from ${command.payload.migrationId} to ${preview.id}; preview again before applying.`);
      return ok(command, this.migration.apply(preview, { confirm: command.payload.confirm === true }));
    });
    this.bus.register<{ migrationId: string; confirm?: boolean }>('migration.rollback', (command) =>
      ok(command, this.migration.rollback(command.payload.migrationId, { confirm: command.payload.confirm === true })));
    this.bus.register<{ epicId: string; stageId: 'understand' | 'plan' | 'build' | 'verify' | 'ship'; actionId?: string; subject: GateSubject }>('gate.request', (command) => {
      const epic = this.epics.require(command.payload.epicId);
      const result = this.autonomy.guard({
        epicId: epic.id,
        stageId: command.payload.stageId,
        actionId: command.payload.actionId,
        subject: command.payload.subject,
        expectedRevision: epic.revision,
      });
      return ok(command, result, this.guide.next(result.epic), result.status === 'waiting-for-approval' ? 'waiting-for-user' : epicOutcome(result.epic.status));
    });
    const decideGate = (outcome: 'approved' | 'rejected') => async (command: ApplicationCommand<{ epicId: string; gateId: string; reason?: string }>): Promise<CommandResult> => {
      const epic = this.epics.require(command.payload.epicId);
      const pending = epic.pendingGate;
      if (!pending || pending.id !== command.payload.gateId) throw new Error(`Pending gate ${command.payload.gateId} was not found on ${epic.id}.`);
      const mode = this.gates.effectiveMode(epic.autonomy, pending.stageId);
      const evaluation: GateEvaluation = {
        mode,
        gate: pending.preview.gate,
        hard: isHardGate(pending.preview.gate),
        requiresApproval: true,
        preview: pending.preview,
        reason: 'Decision is correlated with the durable pending gate.',
      };
      const decision: GateDecision = {
        gate: pending.preview.gate,
        outcome,
        preview: pending.preview,
        decidedBy: command.actor,
        decidedAt: nowIso(),
        reason: command.payload.reason,
      };
      const result = this.autonomy.decide(epic.id, evaluation, decision, epic.revision);
      if (outcome === 'approved' && result.status === 'approved' && pending.actionId) {
        const executed = await this.runtime.executeApproved(epic.id, pending.actionId, command.actor);
        return ok(command, { decision: result, execution: executed }, this.guide.next(executed.epic), epicOutcome(executed.epic.status), { evidence: executed.evidence });
      }
      return ok(command, result, this.guide.next(result.epic), epicOutcome(result.epic.status));
    };
    this.bus.register<{ epicId: string; gateId: string; reason?: string }>('gate.approve', decideGate('approved'));
    this.bus.register<{ epicId: string; gateId: string; reason?: string }>('gate.reject', decideGate('rejected'));
    this.bus.register<{ types: string[]; epicId: string }>('artifact.preview.commit', (command) =>
      ok(command, this.artifacts.preview(this.artifacts.load(), command.payload.types, { epic: command.payload.epicId })));
    this.bus.register<{ policy: unknown }>('artifact.policy.update', (command) => {
      const policy = parseArtifactPolicy(command.payload.policy);
      this.artifacts.save(policy);
      return ok(command, policy);
    });
    this.bus.register<{ epicId: string; packId: string; version?: string; selectedCapabilities?: string[] }>('workflow.compile', (command) => {
      const epic = this.epics.require(command.payload.epicId);
      return ok(command, this.compileAndSave(epic, command.payload.packId, command.payload.version, command.payload.selectedCapabilities));
    });
    this.bus.register<{ capabilityId: string; enabled: boolean }>('capability.enabled.set', (command) => {
      this.capabilities.setEnabled(command.payload.capabilityId, command.payload.enabled);
      this.capabilityPolicy.save(this.capabilities.getPolicy());
      return ok(command, { capabilityId: command.payload.capabilityId, enabled: this.capabilities.isEnabled(command.payload.capabilityId) });
    });
    this.bus.register<Record<string, never>>('model.diagnose', async (command) => ok(command, await this.models.diagnose()));
    this.bus.register<{ providerId: string }>('model.provider.default.set', (command) => {
      this.models.setDefault(command.payload.providerId);
      return ok(command, this.modelProviderConfig.saveDefaultProvider(command.payload.providerId));
    });
    this.bus.register<Record<string, never>>('project.recommend.accept', (command) => ok(command, this.project.accept()));
    this.bus.register<{ workflowProfile?: 'quick' | 'standard' | 'parallel' | 'regulated'; roles?: Parameters<ProjectIntelligenceService['override']>[0]['roles'] }>('project.recommend.override', (command) => ok(command, this.project.override(command.payload)));
    this.bus.register<Record<string, never>>('project.recommend.lock', (command) => ok(command, this.project.lock()));
    this.bus.register<{ stage: 'understand' | 'plan' | 'build' | 'verify' | 'ship' }>('guide.explain', (command) => ok(command, this.guide.explain(command.payload.stage)));
    this.bus.register<Record<string, never>>('guide.doctor', async (command) => ok(command, await this.guide.diagnose({ capabilities: this.capabilities, models: this.models })));
    this.bus.register<{ topic?: string }>('guide.help', (command) => {
      const topic = this.guide.help(command.payload.topic);
      return ok(command, topic, topic.next ? { summary: topic.next, command: topic.id === 'start' ? 'project.setup' : 'guide.help' } : undefined);
    });
    this.bus.register<{ epicId?: string; error?: unknown }>('guide.why.blocked', (command) => {
      if (command.payload.epicId) {
        const epic = this.epics.require(command.payload.epicId);
        const explanation = this.guide.whyEpicBlocked(epic);
        return ok(command, explanation, explanation.nextAction, epicOutcome(epic.status), {
          recoveryActions: explanation.recovery,
        });
      }
      if (command.payload.error !== undefined) {
        const error = parseAidlcError(command.payload.error);
        const explanation = this.guide.whyBlocked(error);
        return ok(command, explanation, undefined, 'blocked', { recoveryActions: explanation.recovery });
      }
      throw new Error('guide.why.blocked requires epicId or a structured AidlcError payload.');
    });
    this.bus.register<{ epicId: string; artifactId: string; feedback: string }>('epic.review.feedback', (command) => {
      const feedback = command.payload.feedback.trim();
      if (!feedback) throw new Error('Review feedback must not be empty.');
      const event = this.epics.record(command.payload.epicId, {
        command: command.name,
        actor: command.actor,
        detail: `Artifact ${command.payload.artifactId}: ${feedback}`,
      });
      return ok(command, event);
    });
    this.bus.register<{ epicId?: string; action: string; reason?: string }>('recovery.apply', (command) => {
      if (!command.payload.epicId) throw new Error('Recovery requires an Epic id.');
      const epic = this.epics.require(command.payload.epicId);
      if (command.payload.action === 'epic.resume' || command.payload.action === 'retry' || command.payload.action === 'apply-fix') {
        const result = this.epics.resume(epic.id, { expectedRevision: epic.revision, actor: command.actor, command: command.name, detail: command.payload.reason });
        return ok(command, result, result.nextAction, epicOutcome(result.epic.status));
      }
      return ok(command, { epic, requestedAction: command.payload.action, reason: command.payload.reason }, this.guide.nextOrFallback(epic), epicOutcome(epic.status));
    });

    this.registerChangeCommands();
    this.registerChangeEpicCommands();
    this.registerContextCommands();
  }

  /**
   * `change.*` commands (implementation plan §8, §18.6) — every command
   * except the three saga steps that need `ChangeEpicCoordinator` (M3:
   * `change.epic.start`, `change.epic.pending.resume/rollback`).
   * `ChangeService`
   * already enforces actor/state rules and throws typed errors shaped so
   * `CommandBus`'s generic catch surfaces `.code`/`.recoveryActions`/
   * `.metadata` — no per-command try/catch is needed here.
   */
  private registerChangeCommands(): void {
    this.bus.register<{
      title: string;
      type: ChangeType;
      priority?: ChangePriority;
      requirement: ChangeRequirement;
      origin: ChangeOrigin;
      externalRefs?: ExternalReference[];
    }>('change.create', (command) => ok(command, this.changes.create({ commandId: command.id, actor: command.actor, ...command.payload })));

    this.bus.register<{
      changeId: string;
      guard: VersionGuard;
      requirement: ChangeRequirement;
      title?: string;
      type?: ChangeType;
      priority?: ChangePriority;
    }>('change.requirement.update', (command) =>
      ok(
        command,
        this.changes.updateRequirement({
          commandId: command.id,
          actor: command.actor,
          changeId: toChangeId(command.payload.changeId),
          guard: command.payload.guard,
          requirement: command.payload.requirement,
          title: command.payload.title,
          type: command.payload.type,
          priority: command.payload.priority,
        }),
      ));

    this.bus.register<{
      changeId: string;
      guard: VersionGuard;
      analysis: {
        contextEntityKeys?: string[];
        files?: ScopeAnalysis['files'];
        symbols?: ScopeAnalysis['symbols'];
        dependencies?: string[];
        risks?: string[];
        unknowns?: string[];
        confidence: ScopeAnalysis['confidence'];
        legacyImpactStatus?: ScopeAnalysis['legacyImpactStatus'];
        contextRevisionId: ContextRevisionId;
        contextRootHash: string;
        sourceSnapshotHash: string;
      };
    }>('change.scope.propose', (command) =>
      ok(
        command,
        this.changes.proposeScope({
          commandId: command.id,
          actor: command.actor,
          changeId: toChangeId(command.payload.changeId),
          guard: command.payload.guard,
          ...command.payload.analysis,
        }),
      ));

    this.bus.register<{ changeId: string; guard: VersionGuard; analysisId: string; feedback?: string; nextRoute: ScopeFeedbackNextRoute }>(
      'change.scope.feedback',
      (command) =>
        ok(
          command,
          this.changes.recordScopeFeedback({
            commandId: command.id,
            actor: command.actor,
            changeId: toChangeId(command.payload.changeId),
            guard: command.payload.guard,
            analysisId: command.payload.analysisId,
            feedback: command.payload.feedback,
            nextRoute: command.payload.nextRoute,
          }),
        ),
    );

    this.bus.register<{ changeId: string; guard: VersionGuard }>('change.explore.start', (command) =>
      ok(command, this.changes.startExplore({ commandId: command.id, actor: command.actor, changeId: toChangeId(command.payload.changeId), guard: command.payload.guard })));

    this.bus.register<{ changeId: string; changeGuard: VersionGuard; shapeGuard: VersionGuard; shapeDraft: ChangeShapeDraftInput }>(
      'change.shape.update',
      (command) =>
        ok(
          command,
          this.changes.updateShape({
            commandId: command.id,
            actor: command.actor,
            changeId: toChangeId(command.payload.changeId),
            changeGuard: command.payload.changeGuard,
            shapeGuard: command.payload.shapeGuard,
            shapeDraft: command.payload.shapeDraft,
          }),
        ),
    );

    this.bus.register<{ changeId: string; changeGuard: VersionGuard; shapeGuard: VersionGuard }>('change.shape.ready', (command) => {
      const result = this.changes.markShapeReady({
        commandId: command.id,
        actor: command.actor,
        changeId: toChangeId(command.payload.changeId),
        changeGuard: command.payload.changeGuard,
        shapeGuard: command.payload.shapeGuard,
      });
      return ok(command, result, undefined, result.blockers.length > 0 ? 'blocked' : 'ok');
    });

    this.bus.register<{ changeId: string; changeGuard: VersionGuard; shapeGuard: VersionGuard }>('change.shape.accept', (command) =>
      ok(
        command,
        this.changes.acceptShape({
          commandId: command.id,
          actor: command.actor,
          changeId: toChangeId(command.payload.changeId),
          changeGuard: command.payload.changeGuard,
          shapeGuard: command.payload.shapeGuard,
        }),
      ));

    this.bus.register<{ changeId: string; changeGuard: VersionGuard; shapeGuard: VersionGuard; reason: string }>('change.shape.reopen', (command) =>
      ok(
        command,
        this.changes.reopenShape({
          commandId: command.id,
          actor: command.actor,
          changeId: toChangeId(command.payload.changeId),
          changeGuard: command.payload.changeGuard,
          shapeGuard: command.payload.shapeGuard,
          reason: command.payload.reason,
        }),
      ));

    this.bus.register<{ changeId: string; guard: VersionGuard; reason?: string }>('change.shelve', (command) =>
      ok(command, this.changes.shelve({ commandId: command.id, actor: command.actor, changeId: toChangeId(command.payload.changeId), guard: command.payload.guard, reason: command.payload.reason })));

    this.bus.register<{ changeId: string; guard: VersionGuard; reason?: string }>('change.reopen', (command) =>
      ok(command, this.changes.reopen({ commandId: command.id, actor: command.actor, changeId: toChangeId(command.payload.changeId), guard: command.payload.guard, reason: command.payload.reason })));

    this.bus.register<{ changeId: string; guard: VersionGuard; reason?: string }>('change.cancel', (command) =>
      ok(command, this.changes.cancel({ commandId: command.id, actor: command.actor, changeId: toChangeId(command.payload.changeId), guard: command.payload.guard, reason: command.payload.reason })));

    this.bus.register<{ changeId: string; guard: VersionGuard; children: SplitChangeChildInput[]; reason: string }>('change.split', (command) =>
      ok(
        command,
        this.changes.split({
          commandId: command.id,
          actor: command.actor,
          changeId: toChangeId(command.payload.changeId),
          guard: command.payload.guard,
          children: command.payload.children,
          reason: command.payload.reason,
        }),
      ));

    this.bus.register<{ sourceIds: string[]; sourceGuards: VersionGuard[]; target: MergeChangesInput['target']; reason: string }>('change.merge', (command) =>
      ok(
        command,
        this.changes.merge({
          commandId: command.id,
          actor: command.actor,
          sourceIds: command.payload.sourceIds.map((id) => toChangeId(id)),
          sourceGuards: command.payload.sourceGuards,
          target: command.payload.target,
          reason: command.payload.reason,
        }),
      ));

    this.bus.register<{ changeId: string; guard: VersionGuard; epicId: string; reason: string }>('change.context.notrequired', (command) =>
      ok(
        command,
        this.changes.markContextNotRequired({
          commandId: command.id,
          actor: command.actor,
          changeId: toChangeId(command.payload.changeId),
          guard: command.payload.guard,
          epicId: toEpicId(command.payload.epicId),
          reason: command.payload.reason,
        }),
      ));

    // Delivery completion is emitted by an execution adapter, never directly
    // from a human-facing screen. It records only the pending Context fact;
    // `done` remains impossible until a subsequent human Context decision.
    this.bus.register<{ changeId: string; guard: VersionGuard; epicId: string; completedAt?: string }>('change.delivery.complete', (command) =>
      ok(
        command,
        this.changes.recordDeliveryCompleted({
          commandId: command.id,
          actor: command.actor,
          changeId: toChangeId(command.payload.changeId),
          guard: command.payload.guard,
          epicId: toEpicId(command.payload.epicId),
          completedAt: command.payload.completedAt,
        }),
      ));
  }

  /**
   * `change.epic.start` / `change.epic.pending.resume` / `change.epic.pending.rollback`
   * (plan §8, §9.2, §18.6, M3) — driven by `ChangeEpicCoordinator`, not
   * `this.changes`, since these commands touch both the Change and Epic
   * aggregates in one saga.
   */
  private registerChangeEpicCommands(): void {
    this.bus.register<{
      changeId: string;
      guard: VersionGuard;
      pipeline: { id: string; runMode: 'guided' | 'autonomous'; extraProjects?: string[] };
      source: SourceSnapshot;
      context: { baseRevisionId: ContextRevisionId; baseRootHash: string; entityObjectHashes?: Record<string, string>; contextSliceHash: string };
      epicProfile?: EpicProfile;
    }>('change.epic.start', (command) =>
      ok(
        command,
        this.changeEpics.startEpic({
          commandId: command.id,
          actor: command.actor,
          changeId: toChangeId(command.payload.changeId),
          guard: command.payload.guard,
          pipeline: command.payload.pipeline,
          source: command.payload.source,
          context: command.payload.context,
          epicProfile: command.payload.epicProfile,
        }),
      ));

    this.bus.register<{ changeId: string; guard: VersionGuard; pendingCommandId: string }>('change.epic.pending.resume', (command) =>
      ok(
        command,
        this.changeEpics.resumePending({
          commandId: command.payload.pendingCommandId,
          actor: command.actor,
          changeId: toChangeId(command.payload.changeId),
          guard: command.payload.guard,
        }),
      ));

    this.bus.register<{ changeId: string; guard: VersionGuard; pendingCommandId: string; reason: string }>('change.epic.pending.rollback', (command) =>
      ok(
        command,
        this.changeEpics.rollbackPending({
          commandId: command.payload.pendingCommandId,
          actor: command.actor,
          changeId: toChangeId(command.payload.changeId),
          guard: command.payload.guard,
          reason: command.payload.reason,
        }),
      ));
  }

  /**
   * `context.bootstrap.*` / `context.proposal.*` (implementation plan §10,
   * §18.2, §18.6, M4) — the canonical Project Context and the Git-like
   * proposal review/apply flow around it.
   */
  private registerContextCommands(): void {
    this.bus.register('context.bootstrap.preview', (command) => ok(command, this.contextBootstrap.preview()));

    this.bus.register<{ previewId: string; sourceHashes: Record<string, string> }>('context.bootstrap.apply', (command) =>
      ok(command, this.contextBootstrap.apply({ actor: command.actor, previewId: command.payload.previewId, sourceHashes: command.payload.sourceHashes })));

    this.bus.register<Omit<StartContextProposalInput, 'commandId' | 'actor'> & { producedBy?: StartContextProposalInput['producedBy'] }>('context.proposal.start', (command) =>
      ok(
        command,
        this.contextProposals.start({
          commandId: command.id,
          actor: command.actor,
          producedBy: command.payload.producedBy,
          origin: command.payload.origin,
          originRef: command.payload.originRef,
          contextGuard: command.payload.contextGuard,
          sourceSnapshot: command.payload.sourceSnapshot,
          operations: command.payload.operations,
          groups: command.payload.groups,
          newObjects: command.payload.newObjects,
        }),
      ));

    this.bus.register<{ proposalId: string; guard: VersionGuard }>('context.proposal.finish', (command) =>
      ok(command, this.contextProposals.finish({ commandId: command.id, actor: command.actor, proposalId: toContextProposalId(command.payload.proposalId), guard: command.payload.guard })));

    this.bus.register<{ proposalId: string; guard: VersionGuard; groupIds: string[] }>('context.proposal.approve', (command) =>
      ok(
        command,
        this.contextProposals.approve({
          commandId: command.id,
          actor: command.actor,
          proposalId: toContextProposalId(command.payload.proposalId),
          guard: command.payload.guard,
          groupIds: command.payload.groupIds.map((id) => toContextGroupId(id)),
        }),
      ));

    this.bus.register<{ proposalId: string; guard: VersionGuard; contextGuard: VersionGuard; groupIds: string[] }>('context.proposal.apply', (command) => {
      const result = this.contextProposals.apply({
          commandId: command.id,
          actor: command.actor,
          proposalId: toContextProposalId(command.payload.proposalId),
          guard: command.payload.guard,
          contextGuard: command.payload.contextGuard,
          groupIds: command.payload.groupIds.map((id) => toContextGroupId(id)),
      });
      // A fully applied delivery proposal closes its owning Change as one
      // follow-up fact. Partial application remains pending: remaining groups
      // still need a human decision and must not falsely finish the Change.
      if (result.proposal.status === 'applied'
        && result.proposal.origin === 'delivery'
        && result.proposal.originRef?.changeId
        && result.proposal.originRef.epicId) {
        const change = this.changes.require(result.proposal.originRef.changeId);
        this.changes.markContextApplied({
          commandId: `${command.id}:change-context-applied`,
          actor: command.actor,
          changeId: change.id,
          guard: { expectedRevision: change.revision, expectedContentHash: change.contentHash },
          epicId: result.proposal.originRef.epicId,
          proposalIds: [result.proposal.id],
          contextRevisionIds: [result.head.currentRevisionId],
        });
      }
      return ok(command, result);
    });

    this.bus.register<{ proposalId: string; guard: VersionGuard; contextGuard: { expectedRevisionId: ContextRevisionId; expectedRootHash: string } }>('context.proposal.rebase', (command) =>
      ok(
        command,
        this.contextProposals.rebase({
          commandId: command.id,
          actor: command.actor,
          proposalId: toContextProposalId(command.payload.proposalId),
          guard: command.payload.guard,
          contextGuard: command.payload.contextGuard,
        }),
      ));

    this.bus.register<{ proposalId: string; guard: VersionGuard; groupIds: string[]; feedback: string }>('context.proposal.changes.request', (command) =>
      ok(
        command,
        this.contextProposals.requestChanges({
          commandId: command.id,
          actor: command.actor,
          proposalId: toContextProposalId(command.payload.proposalId),
          guard: command.payload.guard,
          groupIds: command.payload.groupIds.map((id) => toContextGroupId(id)),
          feedback: command.payload.feedback,
        }),
      ));

    this.bus.register<{ proposalId: string; guard: VersionGuard; groupIds?: string[]; reason: string }>('context.proposal.discard', (command) =>
      ok(
        command,
        this.contextProposals.discard({
          commandId: command.id,
          actor: command.actor,
          proposalId: toContextProposalId(command.payload.proposalId),
          guard: command.payload.guard,
          groupIds: command.payload.groupIds?.map((id) => toContextGroupId(id)),
          reason: command.payload.reason,
        }),
      ));
  }

  private compileAndSave(epic: ReturnType<EpicService['require']>, packId: string, version?: string, selectedCapabilities?: string[]): CompiledWorkflow {
    const facts = this.project.loadContext() ?? {
      schemaVersion: 1 as const,
      projectId: 'uninitialized-project',
      generatedAt: nowIso(),
      revision: 0,
      analysisStatus: 'uninitialized' as const,
      facts: [],
    };
    const selected = selectedCapabilities
      ?? this.capabilities.list().filter((capability) => this.capabilities.isEnabled(capability.id)).map((capability) => capability.id);
    const pack = resolveBuiltinWorkflowPack(packId, version);
    const unavailable = pack.capabilityRequirements.filter((requirement) => !requirement.optional && !selected.includes(requirement.capabilityId));
    if (unavailable.length) throw new Error(`Workflow pack ${pack.id} requires unavailable capabilities: ${unavailable.map((requirement) => requirement.capabilityId).join(', ')}.`);
    const compiled = compileWorkflow({
      epic,
      facts,
      selectedCapabilities: selected,
      autonomy: epic.autonomy,
      pack,
    });
    return this.workflows.save({ ...compiled, pack: { ...compiled.pack, lockHash: lockWorkflowPack(pack).hash } });
  }
}
