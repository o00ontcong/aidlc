/**
 * Registry bundled definitions for the redesigned v3 Builder/New-Epic UI.
 *
 * Only pipelines have a bundled scope. Agents and skills are discovered from
 * their project/global filesystem locations and are never fabricated here.
 */

interface BuiltinRegistryStep {
  readonly id: string;
  readonly agent?: string;
  readonly skills: readonly string[];
  readonly autoReview: boolean;
  readonly humanReview: boolean;
  readonly gate?: string;
}
interface BuiltinRegistryPipeline {
  readonly id: string;
  readonly source: string;
  readonly version: string;
  readonly steps: readonly BuiltinRegistryStep[];
}
interface BuiltinRegistryAgent {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly model: string;
  readonly tier: string;
  readonly skills: readonly string[];
  readonly capabilities: readonly string[];
}
interface BuiltinRegistrySkill {
  readonly id: string;
  readonly source: string;
  readonly description: string;
}

function step(id: string, agent: string, skills: readonly string[] = [], options: Partial<BuiltinRegistryStep> = {}): BuiltinRegistryStep {
  return { id, agent, skills, autoReview: false, humanReview: false, ...options };
}

export const BUILTIN_PIPELINES: readonly BuiltinRegistryPipeline[] = [
  {
    id: 'cohesive-feature',
    source: 'bundled',
    version: '1.0.0',
    steps: [
      step('capture-context', 'cohesive-feature-agent'),
      step('specify', 'cohesive-feature-agent', ['requirement-analysis']),
      step('clarify', 'cohesive-feature-agent'),
      step('plan', 'cohesive-feature-agent'),
      step('plan-tasks', 'cohesive-feature-agent'),
      step('analyze-contract', 'cohesive-feature-agent', [], { autoReview: true }),
      step('implement', 'cohesive-work-package-agent', ['implementation']),
      step('implementation-context', 'cohesive-feature-agent'),
      step('cohesion-review', 'cohesive-reviewer-agent', [], { humanReview: true, gate: 'destructive_changes' }),
      step('system-test', 'cohesive-feature-agent', [], { autoReview: true }),
      step('open-pr', 'cohesive-feature-agent', [], { humanReview: true, gate: 'external_communication' }),
      step('await-merge', 'cohesive-feature-agent', [], { humanReview: true, gate: 'merge_default_branch' }),
      step('project-sync', 'project-context-agent'),
    ],
  },
  {
    id: 'project-context',
    source: 'bundled',
    version: '1.0.0',
    steps: [
      step('define-charter', 'project-context-agent', [], { humanReview: true }),
      step('scan-project', 'project-context-agent'),
      step('model-project', 'project-context-agent'),
      step('check-drift', 'project-context-agent'),
      step('review-context', 'project-context-agent', [], { humanReview: true }),
      step('publish-context', 'project-context-agent'),
      step('project-rules-sync', 'project-context-agent'),
    ],
  },
  {
    id: 'sdlc-standard',
    source: 'bundled',
    version: '1.0.0',
    steps: [
      step('understand', 'sdlc-core-agent'),
      step('plan', 'sdlc-core-agent', [], { humanReview: true }),
      step('build', 'sdlc-core-agent'),
      step('verify', 'sdlc-core-agent', [], { autoReview: true }),
      step('ship', 'sdlc-core-agent', [], { humanReview: true, gate: 'merge_default_branch' }),
    ],
  },
  {
    id: 'quick-fix',
    source: 'bundled',
    version: '1.0.0',
    steps: [
      step('understand', 'sdlc-core-agent'),
      step('build', 'sdlc-core-agent'),
      step('verify', 'sdlc-core-agent', [], { humanReview: true }),
    ],
  },
];

export const BUILTIN_AGENTS: readonly BuiltinRegistryAgent[] = [
  {
    id: 'cohesive-feature-agent',
    name: 'Cohesive Feature Coordinator',
    description: 'Owns one independent feature epic end to end — charter alignment, specification, implementation, system test, one feature PR, post-merge project sync.',
    model: 'claude-opus-4',
    tier: 'deep',
    skills: ['cohesive-feature-workflow'],
    capabilities: ['files', 'github'],
  },
  {
    id: 'cohesive-work-package-agent',
    name: 'Cohesive Work Package Engineer',
    description: 'Executes one approved work package in its declared isolated branch and worktree without redefining feature scope or shared contracts.',
    model: 'claude-sonnet-4-6',
    tier: 'balanced',
    skills: ['cohesive-work-package-workflow'],
    capabilities: ['files'],
  },
  {
    id: 'cohesive-reviewer-agent',
    name: 'Cohesive Reviewer',
    description: 'Independent, read-only reviewer. Issues an explicit GO/NO-GO verdict against contracts, tests, and charter invariants.',
    model: 'claude-opus-4',
    tier: 'review',
    skills: ['cohesive-reviewer-workflow'],
    capabilities: ['files'],
  },
  {
    id: 'project-context-agent',
    name: 'Project Context Curator',
    description: 'Owns the repository-wide Intent/Reality source of truth every feature epic captures a snapshot of.',
    model: 'claude-opus-4',
    tier: 'deep',
    skills: ['project-context-workflow'],
    capabilities: ['files', 'github'],
  },
  {
    id: 'sdlc-core-agent',
    name: 'SDLC Core Agent',
    description: 'Runs the classic five-stage understand/plan/build/verify/ship loop for a single epic.',
    model: 'claude-sonnet-4-6',
    tier: 'balanced',
    skills: [],
    capabilities: ['files'],
  },
];

export const BUILTIN_SKILLS: readonly BuiltinRegistrySkill[] = [
  { id: 'cohesive-feature-workflow', source: 'bundled', description: 'Coordinate a cohesive feature from project-context snapshot through specification, work-package execution, integration, verification, and project sync.' },
  { id: 'cohesive-work-package-workflow', source: 'bundled', description: 'Execute one approved cohesive work package inside its isolated worktree.' },
  { id: 'cohesive-reviewer-workflow', source: 'bundled', description: 'Review package diffs and integrated features against contracts, tests, and charter invariants.' },
  { id: 'project-context-workflow', source: 'bundled', description: 'Scan, model, review, and publish the canonical Project Context used by every feature.' },
  { id: 'requirement-analysis', source: 'bundled', description: 'Turn a pasted requirement, ticket, or editor selection into a structured spec draft.' },
  { id: 'implementation', source: 'bundled', description: 'Implement approved tasks on a feature branch following the tech design and project conventions.' },
];
