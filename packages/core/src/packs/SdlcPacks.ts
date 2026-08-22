/** Built-in SDLC packs. Packs describe work; they never copy runtime assets into a project. */
import {
  createDefaultArtifactPolicy,
  type ArtifactPolicy,
  type CapabilityRequirement,
  type StageId,
} from '../contracts';
import type { SdlcPack, WorkflowAction } from '../workflows';

export interface WorkflowPackGuideMetadata {
  why: string;
  inputs: string[];
  outputs: string[];
  doneWhen: string;
  next: string;
  recovery: string[];
}

export interface WorkflowPack extends SdlcPack {
  guide: Partial<Record<StageId, WorkflowPackGuideMetadata>>;
  artifactPolicy: ArtifactPolicy;
  capabilityRequirements: CapabilityRequirement[];
  /** Stable pack lock calculated over this descriptor by `lockWorkflowPack`. */
  description: string;
}

function action(id: string, stageId: StageId, name: string, dependsOn: string[], extra: Partial<WorkflowAction> = {}): WorkflowAction {
  const defaults: Partial<WorkflowAction> = stageId === 'understand' || stageId === 'plan'
    ? { modelTier: 'deep', risk: 'low' }
    : stageId === 'verify'
      ? { modelTier: 'review', risk: 'low' }
      : stageId === 'ship'
        ? { modelTier: 'balanced', mutation: true, gate: 'external_communication', externalCommunication: 'pull-request', risk: 'high' }
        : { modelTier: 'balanced', mutation: true, risk: 'medium' };
  return { id, stageId, name, dependsOn, ...defaults, ...extra };
}

const guide = (why: string, inputs: string[], outputs: string[], doneWhen: string, next: string): WorkflowPackGuideMetadata => ({
  why, inputs, outputs, doneWhen, next, recovery: ['Review the inputs and evidence, then retry the action.', 'Ask the user to clarify the missing decision.'],
});

function policy(types: Record<string, { path: string; commit?: boolean }>): ArtifactPolicy {
  return { ...createDefaultArtifactPolicy(), types: Object.fromEntries(Object.entries(types).map(([name, value]) => [name, { ...value, persist: 'project' as const }])) };
}

const coreGuide: WorkflowPack['guide'] = {
  understand: guide('Establish project and request context before changing anything.', ['Project facts', 'Epic request'], ['Context summary'], 'Scope, constraints and risks are recorded.', 'Plan the work.'),
  plan: guide('Turn the approved context into a small, testable plan.', ['Context summary'], ['Plan'], 'Dependencies and acceptance checks are explicit.', 'Build the change.'),
  build: guide('Implement the scoped change in reviewable increments.', ['Plan'], ['Code and implementation artifacts'], 'The requested behavior is implemented.', 'Verify the result.'),
  verify: guide('Collect independent evidence that the change meets its acceptance criteria.', ['Code', 'Tests'], ['Verification evidence'], 'Required checks pass or blockers are recorded.', 'Ship only after approval.'),
  ship: guide('Prepare the approved artifacts for the selected delivery channel.', ['Approved evidence'], ['Commit/ship preview'], 'Commit selection and external gates have been resolved.', 'Complete the Epic.'),
};

const SDLC_CORE: WorkflowPack = {
  id: 'sdlc-core', version: '1.0.0', description: 'Default five-stage SDLC workflow.', guide: coreGuide,
  capabilityRequirements: [],
  artifactPolicy: policy({
    specification: { path: 'docs/epics/{epic}/SPEC.md', commit: true },
    plan: { path: 'docs/epics/{epic}/PLAN.md', commit: true },
    verification: { path: 'docs/epics/{epic}/VERIFY.md', commit: true },
  }),
  actions: {
    understand: [action('analyze-project', 'understand', 'Analyze project and requirement', [])],
    plan: [action('design-plan', 'plan', 'Design execution plan', ['analyze-project'])],
    build: [action('implement', 'build', 'Implement change', ['design-plan'])],
    verify: [action('verify', 'verify', 'Validate and review', ['implement'], { validators: ['project-ci'] })],
    ship: [action('ship', 'ship', 'Preview and ship approved changes', ['verify'])],
  },
};

const REGULATED: WorkflowPack = {
  ...SDLC_CORE, id: 'regulated', version: '1.0.0', description: 'Five-stage workflow with traceability and evidence requirements.',
  capabilityRequirements: [{ capabilityId: 'artifact-annotation', optional: false, reason: 'Regulated work requires traceable review evidence.' }],
  artifactPolicy: policy({
    specification: { path: 'docs/epics/{epic}/SPEC.md', commit: true },
    traceability: { path: 'docs/epics/{epic}/TRACEABILITY.md', commit: true },
    verification: { path: 'docs/epics/{epic}/VERIFY.md', commit: true },
    'review-log': { path: 'docs/epics/{epic}/REVIEW.md', commit: true },
  }),
  actions: {
    understand: [action('capture-requirements', 'understand', 'Capture controlled requirements', [])],
    plan: [action('establish-traceability', 'plan', 'Establish traceability plan', ['capture-requirements'])],
    build: [action('implement-controlled-change', 'build', 'Implement controlled change', ['establish-traceability'])],
    verify: [action('verify-evidence', 'verify', 'Verify evidence and traceability', ['implement-controlled-change'], { validators: ['traceability'] })],
    ship: [action('controlled-ship', 'ship', 'Preview controlled ship action', ['verify-evidence'])],
  },
};

const BUILTIN_PACKS: readonly WorkflowPack[] = Object.freeze([SDLC_CORE, REGULATED]);

export function listBuiltinWorkflowPacks(): readonly WorkflowPack[] { return BUILTIN_PACKS; }

export function resolveBuiltinWorkflowPack(id: string, version?: string): WorkflowPack {
  const pack = BUILTIN_PACKS.find((candidate) => candidate.id === id && (!version || candidate.version === version));
  if (!pack) throw new Error(`Workflow pack ${id}${version ? `@${version}` : ''} is not bundled.`);
  return pack;
}
