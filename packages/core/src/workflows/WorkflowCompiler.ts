import { createHash } from 'crypto';
import { z } from 'zod';
import {
  GateKindSchema,
  ModelTierSchema,
  StageSchema,
  effectiveAutonomyMode,
  type AutonomyPolicy,
  type Epic,
  type ProjectFacts,
  type Stage,
  type StageId,
} from '../contracts';

export const WorkflowActionSchema = z.object({
  id: z.string().min(1),
  stageId: z.enum(['understand', 'plan', 'build', 'verify', 'ship']),
  name: z.string().min(1),
  dependsOn: z.array(z.string()),
  /** Parallel Build work is represented as a subrun/action, never a sixth visible stage. */
  subrun: z.boolean().optional(),
  requiresCapabilities: z.array(z.string()).optional(),
  /** Durable execution hints consumed by the provider-neutral runtime. */
  prompt: z.string().optional(),
  mutation: z.boolean().optional(),
  destructive: z.boolean().optional(),
  mergeDefaultBranch: z.boolean().optional(),
  externalCommunication: z.enum(['pull-request', 'issue', 'comment', 'email-chat', 'release-announcement', 'publish-package']).optional(),
  gate: GateKindSchema.optional(),
  risk: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  destination: z.string().optional(),
  mutationScope: z.array(z.string()).optional(),
  modelTier: ModelTierSchema.optional(),
  validators: z.array(z.string()).optional(),
  artifactTypes: z.array(z.string()).optional(),
});
export type WorkflowAction = z.infer<typeof WorkflowActionSchema>;

export interface SdlcPack {
  id: string;
  version: string;
  actions?: Partial<Record<StageId, WorkflowAction[]>>;
}

export interface CompileWorkflowInput {
  epic: Epic;
  facts: ProjectFacts;
  selectedCapabilities: string[];
  autonomy: AutonomyPolicy;
  pack: SdlcPack;
}

export const CompiledWorkflowSchema = z.object({
  schemaVersion: z.literal(1),
  epicId: z.string().min(1),
  pack: z.object({ id: z.string().min(1), version: z.string().min(1), lockHash: z.string().optional() }),
  factsRevision: z.number().int().nonnegative(),
  profile: z.enum(['quick', 'standard', 'parallel', 'regulated']),
  visibleStageIds: z.array(z.enum(['understand', 'plan', 'build', 'verify', 'ship'])),
  stages: z.array(StageSchema),
  actions: z.array(WorkflowActionSchema),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type CompiledWorkflow = z.infer<typeof CompiledWorkflowSchema>;

export class WorkflowCompileError extends Error {
  constructor(message: string, readonly actionIds: string[] = []) {
    super(message);
    this.name = 'WorkflowCompileError';
  }
}

const STAGES_BY_PROFILE: Record<Epic['profile'], StageId[]> = {
  quick: ['understand', 'build', 'verify'],
  standard: ['understand', 'plan', 'build', 'verify', 'ship'],
  parallel: ['understand', 'plan', 'build', 'verify', 'ship'],
  regulated: ['understand', 'plan', 'build', 'verify', 'ship'],
};

const DEFAULT_ACTIONS: Record<StageId, WorkflowAction[]> = {
  understand: [{ id: 'analyze-project', stageId: 'understand', name: 'Analyze project and requirement', dependsOn: [], modelTier: 'deep' }],
  plan: [{ id: 'design-plan', stageId: 'plan', name: 'Design execution plan', dependsOn: ['analyze-project'], modelTier: 'deep' }],
  build: [{ id: 'implement', stageId: 'build', name: 'Implement change', dependsOn: ['design-plan'], mutation: true, risk: 'medium', modelTier: 'balanced' }],
  verify: [{ id: 'verify', stageId: 'verify', name: 'Validate and review', dependsOn: ['implement'], modelTier: 'review', validators: ['project-ci'] }],
  ship: [{ id: 'ship', stageId: 'ship', name: 'Preview and ship approved changes', dependsOn: ['verify'], mutation: true, gate: 'external_communication', risk: 'high', modelTier: 'balanced' }],
};

function defaultActionsFor(profile: Epic['profile'], stageId: StageId): WorkflowAction[] {
  const actions = DEFAULT_ACTIONS[stageId].map((action) => ({ ...action, dependsOn: [...action.dependsOn] }));
  // Quick intentionally omits Plan, so its default build action must depend
  // on Understand rather than silently dropping a non-existent dependency.
  if (profile === 'quick' && stageId === 'build') actions[0]!.dependsOn = ['analyze-project'];
  return actions;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Compiles the five-stage user timeline and its internal action DAG deterministically. */
export function compileWorkflow(input: CompileWorkflowInput): CompiledWorkflow {
  const visibleStageIds = STAGES_BY_PROFILE[input.epic.profile];
  validatePack(input.pack, visibleStageIds);
  let actions = visibleStageIds.flatMap((stageId) => {
    const base = input.pack.actions?.[stageId] ?? defaultActionsFor(input.epic.profile, stageId);
    return base.map((action) => WorkflowActionSchema.parse({ ...action, dependsOn: [...action.dependsOn], requiresCapabilities: action.requiresCapabilities ? [...action.requiresCapabilities] : undefined }));
  });
  if (input.epic.profile === 'quick') {
    const omittedPlanIds = new Set((input.pack.actions?.plan ?? DEFAULT_ACTIONS.plan).map((action) => action.id));
    const understandIds = actions.filter((action) => action.stageId === 'understand').map((action) => action.id);
    actions = actions.map((action) => action.stageId !== 'build' ? action : {
      ...action,
      dependsOn: [...new Set(action.dependsOn.flatMap((dependency) => omittedPlanIds.has(dependency) ? understandIds : [dependency]))],
    });
  }
  validateActionDag(actions, input.selectedCapabilities);
  if (input.epic.profile === 'parallel') {
    const build = actions.find((action) => action.id === 'implement' && action.stageId === 'build');
    if (build) build.subrun = true;
  }
  const stages: Stage[] = visibleStageIds.map((id) => ({
    id,
    status: 'pending',
    autonomy: effectiveAutonomyMode(input.autonomy, id),
    actions: actions.filter((action) => action.stageId === id).map((action) => ({
      id: action.id,
      stageId: id,
      name: action.name,
      status: 'pending',
      capability: action.requiresCapabilities?.[0],
      modelTier: action.modelTier,
      gate: action.gate,
      evidence: [],
    })),
  }));
  const hashInput = { epic: input.epic.id, profile: input.epic.profile, factsRevision: input.facts.revision, capabilities: [...input.selectedCapabilities].sort(), autonomy: input.autonomy, pack: input.pack, visibleStageIds, actions };
  const hash = createHash('sha256').update(stable(hashInput)).digest('hex');
  return CompiledWorkflowSchema.parse({ schemaVersion: 1, epicId: input.epic.id, pack: { id: input.pack.id, version: input.pack.version }, factsRevision: input.facts.revision, profile: input.epic.profile, visibleStageIds: [...visibleStageIds], stages, actions, hash });
}

function validatePack(pack: SdlcPack, visibleStageIds: readonly StageId[]): void {
  if (!pack.id.trim() || !pack.version.trim()) throw new WorkflowCompileError('SDLC pack id and version must not be empty.');
  for (const [stageId, actions] of Object.entries(pack.actions ?? {})) {
    if (!actions) continue;
    if (!['understand', 'plan', 'build', 'verify', 'ship'].includes(stageId)) {
      throw new WorkflowCompileError(`SDLC pack declares unknown stage "${stageId}".`);
    }
    if (!visibleStageIds.includes(stageId as StageId)) continue;
    for (const action of actions) {
      if (action.stageId !== stageId) {
        throw new WorkflowCompileError(`Custom action "${action.id}" is declared under ${stageId} but has stageId ${action.stageId}.`, [action.id]);
      }
    }
  }
}

function validateActionDag(actions: readonly WorkflowAction[], selectedCapabilities: readonly string[]): void {
  const ids = new Set<string>();
  for (const action of actions) {
    if (!/^[a-z][a-z0-9-]*$/.test(action.id)) throw new WorkflowCompileError(`Workflow action id "${action.id}" must use lower-kebab-case.`, [action.id]);
    if (!action.name.trim()) throw new WorkflowCompileError(`Workflow action "${action.id}" must have a name.`, [action.id]);
    if (ids.has(action.id)) throw new WorkflowCompileError(`Workflow action id "${action.id}" is duplicated.`, [action.id]);
    ids.add(action.id);
    if (new Set(action.dependsOn).size !== action.dependsOn.length) {
      throw new WorkflowCompileError(`Workflow action "${action.id}" repeats a dependency.`, [action.id]);
    }
    if (action.dependsOn.includes(action.id)) throw new WorkflowCompileError(`Workflow action "${action.id}" cannot depend on itself.`, [action.id]);
    const missingCapabilities = (action.requiresCapabilities ?? []).filter((id) => !selectedCapabilities.includes(id));
    if (missingCapabilities.length) {
      throw new WorkflowCompileError(`Workflow action "${action.id}" requires unavailable capabilities: ${missingCapabilities.join(', ')}.`, [action.id]);
    }
  }
  for (const action of actions) {
    const missing = action.dependsOn.filter((dependency) => !ids.has(dependency));
    if (missing.length) throw new WorkflowCompileError(`Workflow action "${action.id}" depends on unknown action(s): ${missing.join(', ')}.`, [action.id, ...missing]);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(actions.map((action) => [action.id, action]));
  const visit = (id: string, trail: string[]): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const cycle = [...trail.slice(trail.indexOf(id)), id];
      throw new WorkflowCompileError(`Workflow action dependency cycle: ${cycle.join(' -> ')}.`, cycle);
    }
    visiting.add(id);
    for (const dependency of byId.get(id)!.dependsOn) visit(dependency, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const action of actions) visit(action.id, []);
}
