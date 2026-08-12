/**
 * V3 extension-host boundary.
 *
 * The webview owns presentation only.  This class translates the stable V3
 * transport envelope into the one `AidlcApplication` command bus used by the
 * CLI and Claude adapter; it deliberately contains no Epic/workflow logic.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import {
  AidlcApplication,
  listBuiltinWorkflowPacks,
  AgentStore,
  SkillStore,
  PipelineStore,
  PipelineRunStore,
  RegistryValidator,
  parseAgent,
  parseSkill,
  parsePipeline,
  writePipelineCommand,
  removePipelineCommand,
} from '@aidlc/core';

import {
  ExtensionV3ApplicationClient,
  type ExtensionV3Command,
  type ExtensionV3CommandResult,
} from './ExtensionV3ApplicationClient';
import { BUILTIN_PIPELINES } from './bundledRegistryData';
import type { RegistryAgentInput, RegistryPipelineInput, RegistryScope, RegistrySkillInput } from './ExtensionV3ApplicationClient';

export interface V3HostApplicationFactory {
  (workspaceRoot: string): AidlcApplication;
}

export interface ExtensionV3HostOptions {
  readonly workspaceRoot: () => string | undefined;
  readonly applicationFactory?: V3HostApplicationFactory;
  readonly actor?: V3ActorRef;
  readonly hostDispatcher?: (command: ExtensionV3Command) => Promise<ExtensionV3CommandResult | undefined>;
  /** Reads the `aidlc.language` setting. Defaults to `'en'` — kept as a callback (like `workspaceRoot`) so this class stays vscode-agnostic and testable. */
  readonly language?: () => 'en' | 'vi';
  readonly templateRoot?: () => string | undefined;
}

/** Kept local because the public core migration export currently exposes the application class, not this helper contract. */
export interface V3ActorRef { readonly kind: 'user' | 'agent' | 'system'; readonly id: string; readonly label?: string; }

interface RecommendationProjectionSource {
  workflowProfile: string;
  roles: readonly { stageId: string; agent: string; skills: readonly string[]; modelTier: string; reason: string; confidence: number }[];
}

interface EpicProjectionSource {
  id: string;
  title: string;
  type: string;
  profile: string;
  status: string;
  autonomy: { default: string };
  updatedAt: string;
  blockedReason?: string;
  pendingGate?: { id: string; preview: { gate: string; destination?: string; contentSummary: string; mutationScope: readonly string[] } };
  stages: readonly {
    id: string;
    status: string;
    autonomy: string;
    actions: readonly { id: string; name: string; status: string; evidence: readonly { kind: string; label?: string; ref: string; status?: string }[] }[];
  }[];
}

/** Browser names kept during the UI migration, mapped only at the transport edge. */
const V3_COMMAND_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'epic.create': 'epic.start',
});

export function toApplicationCommandName(v3Name: string): string {
  return V3_COMMAND_ALIASES[v3Name] ?? v3Name;
}

function errorResult(commandId: string, error: unknown): ExtensionV3CommandResult {
  return {
    commandId,
    status: 'error',
    data: {
      code: 'extension.v3.dispatch_failed',
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

/**
 * A thin, testable host for both `aidlc.v3.command` and the V3 webview panel.
 * It makes every response typed, including synchronous service errors, so a
 * malformed browser message can never escape as an unhandled extension error.
 */
export class ExtensionV3Host {
  readonly client: ExtensionV3ApplicationClient;
  private readonly applicationFactory: V3HostApplicationFactory;
  private readonly actor: V3ActorRef;
  private compiledWorkflow?: { profile: string; stages: string[]; summary: string };
  private providerDiagnostics?: Array<{ providerId: string; status: 'ready' | 'needs-auth' | 'unavailable'; message: string; selected?: boolean }>;
  private readonly stateListeners = new Set<(state: Record<string, unknown>) => void>();

  constructor(private readonly options: ExtensionV3HostOptions) {
    this.applicationFactory = options.applicationFactory ?? ((root) => new AidlcApplication(root));
    this.actor = options.actor ?? { kind: 'user', id: 'vscode-extension', label: 'VS Code extension' };
    this.client = new ExtensionV3ApplicationClient((command) => this.dispatch(command));
  }

  handleMessage(message: unknown): Promise<ExtensionV3CommandResult | undefined> {
    return this.client.handleMessage(message);
  }

  subscribe(listener: (state: Record<string, unknown>) => void): { dispose(): void } {
    this.stateListeners.add(listener);
    return { dispose: () => this.stateListeners.delete(listener) };
  }

  notifyDurableStateChanged(): void {
    this.emitState();
  }

  /**
   * Small serializable projection for the V3 shell.  It is a read model only:
   * no state is cached or mutated here, so CLI and webview always observe the
   * same durable Epic files after a command completes.
   */
  workspaceState(): Record<string, unknown> {
    const root = this.requireWorkspaceRoot();
    const application = this.applicationFactory(root);
    const context = application.project.loadContext();
    const recommendation = application.project.loadRecommendationLock()?.recommendation
      ?? application.project.loadProposal();
    const sourceEpics = application.epics.list();
    const currentSource = sourceEpics.find((epic) => epic.status === 'running' || epic.status === 'waiting-for-user' || epic.status === 'blocked') ?? sourceEpics[0];
    const epics = sourceEpics.map((epic) => projectEpic(epic, application.guide.next(epic)));
    const current = epics.find((epic) => epic.id === currentSource?.id);
    const durableWorkflow = currentSource ? application.workflows.load(currentSource.id) : null;
    const stageId = currentSource?.stages.find((stage) => stage.status === 'active')?.id ?? 'understand';
    const guide = application.guide.explain(stageId);
    const migration = application.migration.preview();

    return {
      language: this.options.language?.() ?? 'en',
      project: {
        name: path.basename(root),
        readiness: context?.analysisStatus === 'published' ? 'ready' : 'not-ready',
        contextRevision: context ? String(context.revision) : undefined,
        recommendation: projectRecommendation(recommendation),
        diagnostics: application.guide.doctor().filter((item) => !item.ok).map((item) => ({
          id: item.id,
          severity: 'warning',
          summary: item.message,
        })),
      },
      epics,
      currentEpicId: current?.id,
      // Pack/provider configuration will be sourced from the corresponding
      // application services as their commands land. Keeping empty arrays is
      // intentional: UI must not manufacture a second configuration store.
      workflowPacks: listBuiltinWorkflowPacks().map((pack) => ({
        id: pack.id,
        label: pack.id,
        description: pack.description,
        profiles: ['quick', 'standard', 'parallel', 'regulated'],
      })),
      compiledWorkflow: durableWorkflow ? {
        profile: durableWorkflow.profile,
        stages: durableWorkflow.visibleStageIds,
        summary: `Compiled ${durableWorkflow.pack.id}@${durableWorkflow.pack.version} · ${durableWorkflow.hash}`,
      } : this.compiledWorkflow,
      providerDiagnostics: this.providerDiagnostics ?? application.models.list().map((provider) => ({
        providerId: provider.id,
        selected: application.models.getDefault().id === provider.id,
        status: 'needs-auth',
        message: 'Provider is registered. Use Check providers to verify CLI/auth availability.',
      })),
      artifactPolicy: application.artifacts.load(),
      legacyMigration: migration.items.length ? { id: migration.id, itemCount: migration.items.length, command: `aidlc migration apply ${migration.id} --confirm` } : undefined,
      capabilities: application.capabilities.list().map((capability) => ({
        id: capability.id,
        label: capability.name,
        category: capability.category,
        enabled: application.capabilities.isEnabled(capability.id),
        healthy: capability.category === 'bundled',
        message: capability.category === 'optional' ? 'Optional capability requires an installed provider.' : undefined,
      })),
      guide: {
        stage: stageId,
        title: `${stageId[0]!.toUpperCase()}${stageId.slice(1)} guide`,
        why: guide.why,
        inputs: guide.inputs,
        outputs: guide.outputs,
        doneWhen: guide.doneWhen,
        next: guide.next,
        recovery: guide.recovery.map((label) => ({ kind: 'ask-user', label })),
        advancedLog: currentSource
          ? application.epics.events(currentSource.id).slice(-20).map((event) => JSON.stringify(event)).join('\n')
          : undefined,
      },
      registry: registryProjection(root, sourceEpics.map((epic) => epic.id), this.options.templateRoot?.()),
    };
  }

  private async dispatch(command: ExtensionV3Command): Promise<ExtensionV3CommandResult> {
    try {
      const hostResult = await this.options.hostDispatcher?.(command);
      if (hostResult) return hostResult;
      const root = this.requireWorkspaceRoot();
      const registryResult = this.dispatchRegistry(root, command);
      if (registryResult) {
        this.emitState();
        return registryResult;
      }
      const application = this.applicationFactory(root);
      const applicationCommand = application.bus.command(
        command.id,
        toApplicationCommandName(command.name),
        this.actor,
        command.payload,
      );
      const result = await application.bus.dispatch(applicationCommand);
      if (result.status === 'ok' && command.name === 'workflow.compile') {
        const workflow = result.data as { profile?: unknown; visibleStageIds?: unknown; hash?: unknown };
        if (typeof workflow.profile === 'string' && Array.isArray(workflow.visibleStageIds)) {
          this.compiledWorkflow = { profile: workflow.profile, stages: workflow.visibleStageIds.map(String), summary: `Compiled workflow ${String(workflow.hash ?? '')}`.trim() };
        }
      }
      if (result.status === 'ok' && command.name === 'model.diagnose' && Array.isArray(result.data)) {
        this.providerDiagnostics = result.data.map((diagnostic) => {
          const value = diagnostic as { provider?: unknown; ok?: unknown; message?: unknown };
          const providerId = String(value.provider ?? 'unknown');
          return { providerId, selected: application.models.getDefault().id === providerId, status: value.ok ? 'ready' as const : 'needs-auth' as const, message: String(value.message ?? 'No diagnostic message.') };
        });
      }
      if (result.status !== 'error') this.emitState();
      return result;
    } catch (error) {
      return errorResult(command.id, error);
    }
  }

  private requireWorkspaceRoot(): string {
    const root = this.options.workspaceRoot();
    if (!root) throw new Error('Open a workspace folder before using AIDLC V3.');
    return root;
  }

  /** Registry CRUD deliberately lives at the host boundary: it validates and
   * persists durable files, while the webview only sends typed commands. */
  private dispatchRegistry(root: string, command: ExtensionV3Command): ExtensionV3CommandResult | undefined {
    if (!command.name.startsWith('registry.agent.') && !command.name.startsWith('registry.skill.') && !command.name.startsWith('registry.pipeline.')) return undefined;
    const agents = new AgentStore(root);
    const skills = new SkillStore(root);
    const pipelines = new PipelineStore(root, BUILTIN_PIPELINES as unknown as ConstructorParameters<typeof PipelineStore>[1]);
    const validator = new RegistryValidator(agents, skills, pipelines);
    const ok = (data: unknown): ExtensionV3CommandResult => ({ commandId: command.id, status: 'ok', data });
    const scope = (value: unknown): RegistryScope => value === 'global' ? 'global' : 'project';
    const p = command.payload as Record<string, unknown>;

    if (command.name === 'registry.agent.create' || command.name === 'registry.agent.update') {
      const entity = parseAgent(p.agent as RegistryAgentInput);
      const targetScope = scope(p.scope);
      if (command.name.endsWith('.create')) {
        const duplicate = validator.checkDuplicateId('agent', entity.id);
        if (duplicate) throw new Error(duplicate.message);
      } else if (agents.scopeOf(entity.id) !== targetScope) {
        throw new Error(`Agent "${entity.id}" does not exist in ${targetScope} scope.`);
      }
      for (const skillId of entity.skills) if (!skills.exists(skillId)) throw new Error(`Agent "${entity.id}" references skill "${skillId}", which doesn't exist.`);
      agents.write(entity, targetScope);
      return ok({ agent: { ...entity, scope: targetScope } });
    }
    if (command.name === 'registry.agent.delete') {
      const id = String(p.id ?? '');
      const targetScope = scope(p.scope);
      if (agents.scopeOf(id) !== targetScope) throw new Error(`Agent "${id}" does not exist in ${targetScope} scope.`);
      const references = pipelines.list().filter((pipeline) => pipeline.steps.some((step) => step.agent === id)).map((pipeline) => pipeline.id);
      if (references.length) throw new Error(`Agent "${id}" is referenced by pipeline(s): ${references.join(', ')}.`);
      agents.remove(id, targetScope);
      return ok({ deleted: id });
    }
    if (command.name === 'registry.skill.create' || command.name === 'registry.skill.update') {
      const entity = parseSkill(p.skill as RegistrySkillInput);
      const targetScope = scope(p.scope);
      if (command.name.endsWith('.create')) {
        const duplicate = validator.checkDuplicateId('skill', entity.id);
        if (duplicate) throw new Error(duplicate.message);
      } else if (skills.scopeOf(entity.id) !== targetScope) {
        throw new Error(`Skill "${entity.id}" does not exist in ${targetScope} scope.`);
      }
      skills.write(entity, targetScope);
      return ok({ skill: { ...entity, scope: targetScope } });
    }
    if (command.name === 'registry.skill.delete') {
      const id = String(p.id ?? '');
      const targetScope = scope(p.scope);
      if (skills.scopeOf(id) !== targetScope) throw new Error(`Skill "${id}" does not exist in ${targetScope} scope.`);
      const references = pipelines.list().filter((pipeline) => pipeline.steps.some((step) => step.skills.includes(id))).map((pipeline) => pipeline.id);
      if (references.length) throw new Error(`Skill "${id}" is referenced by pipeline(s): ${references.join(', ')}.`);
      skills.remove(id, targetScope);
      return ok({ deleted: id });
    }
    if (command.name === 'registry.pipeline.create' || command.name === 'registry.pipeline.update' || command.name === 'registry.pipeline.copyToProject') {
      const input = p.pipeline as RegistryPipelineInput;
      const entity = parsePipeline({ ...input, source: 'project' });
      if (command.name === 'registry.pipeline.create') {
        const duplicate = validator.checkDuplicateId('pipeline', entity.id);
        if (duplicate) throw new Error(duplicate.message);
      }
      if (command.name === 'registry.pipeline.update' && !pipelines.isProject(entity.id)) {
        throw new Error(`Pipeline "${entity.id}" is bundled and read-only. Copy it to project before editing.`);
      }
      const issues = validator.validatePipeline(entity);
      if (issues.length) throw new Error(issues.map((issue) => issue.message).join(' '));
      const written = pipelines.write(entity);
      writePipelineCommand(root, written, { overwrite: true });
      return ok({ pipeline: written, copied: command.name === 'registry.pipeline.copyToProject' });
    }
    if (command.name === 'registry.pipeline.delete') {
      const id = String(p.id ?? '');
      if (!pipelines.isProject(id)) throw new Error(`Pipeline "${id}" is bundled and cannot be deleted.`);
      const active = this.activePipelineRuns(root, id);
      if (active.length) throw new Error(`Pipeline "${id}" has active run(s): ${active.join(', ')}.`);
      pipelines.remove(id);
      // Deleting an override can reveal a bundled pipeline with the same id;
      // regenerate its command instead of leaving a stale project command.
      const fallback = pipelines.read(id);
      if (fallback) writePipelineCommand(root, fallback, { overwrite: true });
      else removePipelineCommand(root, id);
      return ok({ deleted: id });
    }
    return undefined;
  }

  private activePipelineRuns(root: string, pipelineId: string): string[] {
    const runs = new PipelineRunStore(root);
    return runs.listForPipeline(pipelineId)
      .filter((run) => run.steps.some((step) => step.status !== 'done'))
      .map((run) => run.epicId);
  }

  private emitState(): void {
    if (!this.stateListeners.size) return;
    try {
      const state = this.workspaceState();
      for (const listener of this.stateListeners) listener(state);
    } catch {
      // Workspace close/change races are surfaced on the next explicit read.
    }
  }
}

/** IMPLEMENT.md §1 registry read model — same three stores `registerRegistryCommands.ts` writes through. */
function registryProjection(root: string, epicIds: readonly string[], templateRoot?: string): Record<string, unknown> {
  const agents = new AgentStore(root);
  const skills = new SkillStore(root);
  const pipelines = new PipelineStore(root, BUILTIN_PIPELINES as unknown as ConstructorParameters<typeof PipelineStore>[1]);
  const runs = new PipelineRunStore(root);
  return {
    agents: agents.list().map((agent) => ({ ...agent, scope: agents.scopeOf(agent.id) })),
    skills: skills.list().map((skill) => ({ ...skill, scope: skills.scopeOf(skill.id) })),
    pipelines: pipelines.list(),
    templates: discoverRegistryTemplates(templateRoot),
    runs: epicIds.flatMap((epicId) => runs.listForEpic(epicId).map((run) => ({
      epicId: run.epicId,
      pipelineId: run.pipelineId,
      steps: run.steps.map((step) => ({ id: step.id, status: step.status, attempt: step.attempt, feedback: step.feedback })),
    }))),
  };
}

/** Read-only catalog of assets bundled with AIDLC. A selection only pre-fills
 * the Builder form; it is not shown as a stored Agent/Skill until saved to a
 * project or global scope. */
function discoverRegistryTemplates(templateRoot?: string): Record<string, unknown>[] {
  if (!templateRoot || !fs.existsSync(templateRoot)) return [];
  const templates: Record<string, unknown>[] = [];
  for (const workflow of fs.readdirSync(templateRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    for (const kind of ['agents', 'skills'] as const) {
      const dir = path.join(templateRoot, workflow.name, kind);
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true }).filter((item) => item.isFile() && item.name.endsWith('.md'))) {
        const raw = fs.readFileSync(path.join(dir, entry.name), 'utf8');
        const { attributes, body } = splitTemplateFrontmatter(raw);
        const stem = path.basename(entry.name, '.md');
        const id = `template:${workflow.name}/${kind}/${stem}`;
        const suggestedId = `aidlc-${workflow.name}-${stem}`.replace(/[^a-z0-9-]/g, '-');
        const label = stringValue(attributes.name) || firstHeading(body) || stem;
        const description = stringValue(attributes.description) || firstParagraph(body) || `${label} starter template`;
        if (kind === 'agents') {
          const model = stringValue(attributes.model) || 'claude-sonnet-4-5';
          const capabilities = stringArray(attributes.tools).filter((value): value is 'figma' | 'files' | 'github' | 'web' => ['figma', 'files', 'github', 'web'].includes(value));
          templates.push({ id, kind: 'agent', label, description, agent: { id: suggestedId, name: label, description, model, tier: model.includes('opus') ? 'deep' : 'balanced', skills: stringArray(attributes.skills), capabilities } });
        } else {
          templates.push({ id, kind: 'skill', label, description, skill: { id: suggestedId, source: 'custom', description, body } });
        }
      }
    }
  }
  return templates.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function splitTemplateFrontmatter(raw: string): { attributes: Record<string, unknown>; body: string } {
  if (!raw.startsWith('---')) return { attributes: {}, body: raw.trim() };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { attributes: {}, body: raw.trim() };
  try {
    return { attributes: (yaml.load(raw.slice(3, end)) as Record<string, unknown>) ?? {}, body: raw.slice(end + 4).trim() };
  } catch { return { attributes: {}, body: raw.slice(end + 4).trim() }; }
}

function stringValue(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function firstHeading(body: string): string { return body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? ''; }
function firstParagraph(body: string): string { return body.split(/\n\s*\n/).map((part) => part.replace(/^#+\s+/, '').trim()).find(Boolean) ?? ''; }

function projectRecommendation(recommendation: RecommendationProjectionSource | null): Record<string, unknown> | undefined {
  if (!recommendation) return undefined;
  const preferred = recommendation.roles.find((role) => role.stageId === 'build') ?? recommendation.roles[0];
  return {
    profile: recommendation.workflowProfile,
    agentRole: preferred?.agent ?? 'No specialist recommendation',
    skills: preferred?.skills ?? [],
    modelTier: preferred?.modelTier ?? 'balanced',
    rationale: preferred?.reason ?? 'No stage-specific recommendation is needed.',
    confidence: preferred?.confidence ?? 0,
  };
}

function projectEpic(epic: EpicProjectionSource, nextAction?: { summary: string; command?: string; reason?: string }): Record<string, unknown> {
  const artifactEvidence = epic.stages.flatMap((stage) => stage.actions.flatMap((action) => action.evidence
    .filter((evidence) => evidence.kind === 'artifact')
    .map((evidence, index) => ({ action, evidence, index }))));
  return {
    id: epic.id,
    title: epic.title,
    type: epic.type,
    profile: epic.profile,
    status: epic.status,
    autonomy: epic.autonomy.default,
    updatedAt: epic.updatedAt,
    nextAction: nextAction ? { id: nextAction.command ?? 'epic.inspect', ...nextAction } : undefined,
    gate: epic.pendingGate ? {
      id: epic.pendingGate.id,
      gate: epic.pendingGate.preview.gate,
      destination: epic.pendingGate.preview.destination,
      contentSummary: epic.pendingGate.preview.contentSummary,
      mutationScope: epic.pendingGate.preview.mutationScope,
      hard: ['destructive_changes', 'merge_default_branch', 'external_communication'].includes(epic.pendingGate.preview.gate),
    } : undefined,
    blocker: epic.blockedReason ? {
      code: 'epic.blocked',
      summary: epic.blockedReason,
      recoveryActions: [{ kind: 'ask-user', label: 'Review blocker and resume Epic.' }],
    } : undefined,
    stages: epic.stages.map((stage) => ({
      id: stage.id,
      status: projectStageStatus(stage.status),
      autonomy: stage.autonomy,
      summary: stage.actions.find((action) => action.status === 'running' || action.status === 'pending')?.name,
    })),
    artifacts: artifactEvidence.map(({ action, evidence, index }) => ({
      id: `${action.id}:${index}`,
      label: evidence.label ?? action.name,
      path: evidence.ref,
      lifecycle: evidence.status === 'verified' ? 'approved' : 'review',
      // Evidence files are runtime state. A separate artifact-policy command
      // must select a project artifact before commit eligibility becomes true.
      eligibleForCommit: false,
    })),
    evidence: epic.stages.flatMap((stage) => stage.actions.flatMap((action) => action.evidence.map((evidence, index) => ({
      id: `${stage.id}:${action.id}:${index}`,
      label: evidence.label ?? evidence.ref,
      uri: evidence.ref,
      kind: evidence.kind === 'artifact' ? 'artifact' : 'log',
    })))),
  };
}

function projectStageStatus(status: string): 'pending' | 'running' | 'waiting-for-user' | 'blocked' | 'review' | 'completed' {
  switch (status) {
    case 'active': return 'running';
    case 'waiting-for-user': return 'waiting-for-user';
    case 'blocked': return 'blocked';
    case 'completed':
    case 'skipped': return 'completed';
    case 'paused': return 'waiting-for-user';
    default: return 'pending';
  }
}
