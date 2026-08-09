import { createHash } from 'crypto';
import {
  effectiveAutonomyMode,
  type AutonomyPolicy,
  type Epic,
  type ProjectFacts,
  type Stage,
  type StageId,
} from '../contracts';

export interface WorkflowAction {
  id: string;
  stageId: StageId;
  name: string;
  dependsOn: string[];
  /** Parallel Build work is represented as a subrun/action, never a sixth visible stage. */
  subrun?: boolean;
  requiresCapabilities?: string[];
}

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

export interface CompiledWorkflow {
  schemaVersion: 1;
  profile: Epic['profile'];
  visibleStageIds: StageId[];
  stages: Stage[];
  actions: WorkflowAction[];
  hash: string;
}

const STAGES_BY_PROFILE: Record<Epic['profile'], StageId[]> = {
  quick: ['understand', 'build', 'verify'],
  standard: ['understand', 'plan', 'build', 'verify', 'ship'],
  parallel: ['understand', 'plan', 'build', 'verify', 'ship'],
  regulated: ['understand', 'plan', 'build', 'verify', 'ship'],
};

const DEFAULT_ACTIONS: Record<StageId, WorkflowAction[]> = {
  understand: [{ id: 'analyze-project', stageId: 'understand', name: 'Analyze project and requirement', dependsOn: [] }],
  plan: [{ id: 'design-plan', stageId: 'plan', name: 'Design execution plan', dependsOn: ['analyze-project'] }],
  build: [{ id: 'implement', stageId: 'build', name: 'Implement change', dependsOn: ['design-plan'] }],
  verify: [{ id: 'verify', stageId: 'verify', name: 'Validate and review', dependsOn: ['implement'] }],
  ship: [{ id: 'ship', stageId: 'ship', name: 'Preview and ship approved changes', dependsOn: ['verify'] }],
};

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
  const rawActions = visibleStageIds.flatMap((stageId) => {
    const base = input.pack.actions?.[stageId] ?? DEFAULT_ACTIONS[stageId];
    return base.map((action) => ({ ...action, dependsOn: [...action.dependsOn] }));
  });
  const knownActionIds = new Set(rawActions.map((action) => action.id));
  const actions = rawActions.map((action) => ({
    ...action,
    dependsOn: action.dependsOn.filter((dependency) => knownActionIds.has(dependency)),
  }));
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
      evidence: [],
    })),
  }));
  const hashInput = { epic: input.epic.id, profile: input.epic.profile, factsRevision: input.facts.revision, capabilities: [...input.selectedCapabilities].sort(), autonomy: input.autonomy, pack: input.pack, visibleStageIds, actions };
  const hash = createHash('sha256').update(stable(hashInput)).digest('hex');
  return { schemaVersion: 1, profile: input.epic.profile, visibleStageIds: [...visibleStageIds], stages, actions, hash };
}
