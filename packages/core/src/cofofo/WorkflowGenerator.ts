import * as fs from 'fs';
import * as path from 'path';

import type { WorkspaceConfig } from '../schema/WorkspaceSchema';
import { normalizeStep, validateWorkspace } from '../schema/WorkspaceSchema';
import { listCommandProviderAdapters } from '../providers/CommandProviderAdapter';
import type { PipelineConfig } from '../schema/WorkspaceSchema';
import { hashFile } from './hash';
import { writeAtomic } from './paths';

const FOUNDATION = 'docs/project/foundation';
const EPIC = 'docs/epics/{epic}/artifacts';

const FOUNDATION_PHASES = [
  'scan-stack', 'define-rules', 'map-system', 'select-ecc-catalog', 'install-ecc-assets', 'publish-context',
] as const;

const DELIVERY_PHASES = [
  'requirement', 'diagnose', 'create-plan', 'reproduce', 'implement', 'test',
] as const;

const PHASES = [...FOUNDATION_PHASES, ...DELIVERY_PHASES] as const;

type Phase = typeof PHASES[number];

const PHASE_INSTRUCTIONS: Record<Phase, string> = {
  'scan-stack': 'Read STACK-PROFILE.json as machine evidence. Do not guess an unsupported or second stack. Explain the detected manifest, toolchain, confidence, and generic-SDLC fallback when present.',
  'define-rules': 'Edit PROJECT-RULES.json as canonical policy, then run `aidlc cofofo render-rules` to regenerate the hash-bound PROJECT-RULES.md and RULE-DRIFT.md. Every blocking rule needs a stable ruleId, machine-checkable matcher, measured scope, and explicit exception expiry.',
  'map-system': 'Map modules, layers, dependency direction, state ownership, entry points, and test seams from concrete source paths. Write ARCHITECTURE-MAP.md and cite evidence.',
  'select-ecc-catalog': 'Review the pinned text-only catalog selection. Reject scripts, hooks, binaries, unknown licenses, unpinned revisions, and assets without a SHA-256 digest.',
  'install-ecc-assets': 'Run `aidlc cofofo install --run <foundation-run>` only after both policy and catalog Canvas gates are approved. Do not copy or download an executable ECC asset.',
  'publish-context': 'Run `aidlc cofofo publish --run <foundation-run>`, review PROVIDER-CONTEXT.md and docs/README.md in Canvas, approve the step, then run `aidlc cofofo activate --run <foundation-run>` to install the approved block into provider files.',
  requirement: 'INTENT.md is a required input, snapshotted from the Ideas tab intake that started this epic — read it as the starting point of the reasoning chain the Canvas gate will review. Research with sources: read the current CONTEXT-MANIFEST.json, PROJECT-RULES.json, architecture map, and codebase; write EVIDENCE.md citing exactly where each claim came from, and label anything you could not verify as an assumption rather than stating it as fact. Apply 2-4 named lenses (e.g. JTBD, assumption mapping, anti-scope, opportunity sizing) and write OPTIONS.md: each option gets a numbered critique menu (challenge / red-team / expand / shrink for appetite / swap approach), and a "## Open Decisions" section listing at most 5 decisions, each as a table of 2-5 choices with one recommended default pre-marked — approving the Canvas gate accepts every default the reviewer does not override via request-changes feedback. Write REQUIREMENT.md with scope, non-goals, and acceptance criteria stated as observable behavior, since create-plan must derive a RED test from each one. Do not mutate production code.',
  diagnose: 'For a bug, find root cause before changing production code. Write ROOT-CAUSE.md with reproduction, causal chain, affected invariant, and failure oracle. Skip this phase only for non-bug recipes.',
  'create-plan': 'Write TASK-PLAN.md. Map every acceptance criterion to files/tests, cite every applicable blocking ruleId, state the exact RED test and expected assertion, then obtain Canvas approval before production mutation.',
  reproduce: 'Add the smallest behavior test first. Capture a real expected assertion failure with `aidlc cofofo evidence red`; compile/import/syntax failures do not count. If a RED waiver is necessary, use `aidlc cofofo waive-red` so RED-EVIDENCE.md records the reason and alternative evidence. The Canvas gate on RED-EVIDENCE.md must approve either path before production code changes.',
  implement: 'When reproduce is not in this recipe, write the RED test inside this phase first, capture RED with `aidlc cofofo evidence red`, and write RED-EVIDENCE.md before any production mutation. Implement only enough production behavior to pass the RED test, capture GREEN with the allow-listed test command, refactor without changing behavior and capture REFACTOR, then write IMPLEMENT-SUMMARY.md. Canvas reviews the implementation summary and scope.',
  test: 'Review the diff from fresh context for correctness, rules, regression, security, concurrency, and maintainability in REVIEW.md. Dispose every blocking finding, run build/rule/full-suite checks, capture VERIFY evidence, and write TEST-REPORT.md and VERIFY.md with actual results and limitations; Canvas closes the delivery boundary.',
};

const ROLE_BY_PHASE: Record<Phase, string> = {
  'scan-stack': 'foundation-architect', 'define-rules': 'policy-engineer', 'map-system': 'foundation-architect',
  'select-ecc-catalog': 'catalog-curator', 'install-ecc-assets': 'foundation-architect', 'publish-context': 'foundation-architect',
  requirement: 'product-owner', diagnose: 'diagnostician', 'create-plan': 'tech-lead', reproduce: 'developer',
  implement: 'developer', test: 'fresh-reviewer',
};

function skillId(phase: Phase): string { return `cofofo-${phase}`; }
function skillPath(phase: Phase): string { return `.aidlc/cofofo/skills/${phase}.md`; }

export function installCofofoPhaseSkills(workspaceRoot: string): void {
  for (const phase of PHASES) {
    const content = [
      '---', `name: ${skillId(phase)}`, `description: CoFoFo ${phase} phase contract.`, '---', '',
      `# ${phase}`, '', PHASE_INSTRUCTIONS[phase], '',
      'Machine evidence and Canvas verdicts are owned by AIDLC core. Markdown claims never replace them.', '',
    ].join('\n');
    writeAtomic(path.join(workspaceRoot, skillPath(phase)), content);
  }
}

/**
 * Materialize provider-native command files for every CoFoFo phase. The
 * command carries the canonical policy path and current hash in its body, so
 * provider execution cannot omit the policy input without visibly departing
 * from the generated command.
 */
export function installCofofoProviderCommands(
  workspaceRoot: string,
  workspace: WorkspaceConfig,
  contextHash = 'pending-foundation-review',
): string[] {
  const rulesPath = `${FOUNDATION}/PROJECT-RULES.json`;
  const rulesHash = fs.existsSync(path.join(workspaceRoot, rulesPath))
    ? hashFile(path.join(workspaceRoot, rulesPath))
    : 'missing';
  const written: string[] = [];

  for (const pipeline of workspace.pipelines.filter((item) => item.id.startsWith('cofofo-'))) {
    for (const raw of pipeline.steps) {
      const phase = normalizeStep(raw).name as Phase | undefined;
      if (!phase || !PHASES.includes(phase)) continue;
      const commandName = `${pipeline.id}-${phase}`;
      const body = [
        `Follow \`${skillPath(phase)}\` as the phase contract.`,
        '',
        `Canonical policy: \`${rulesPath}\``,
        `Policy hash: \`${rulesHash}\``,
        `Context hash: \`${contextHash}\``,
        '',
        `Run id / epic id: \`$ARGUMENTS\`.`,
        'Read the matching run state before changing files. Machine evidence and Canvas verdicts are written only by AIDLC core.',
        '',
      ].join('\n');
      for (const adapter of listCommandProviderAdapters()) {
        const rendered = adapter.renderCommandFile({
          commandName,
          description: `CoFoFo ${phase} phase`,
          body,
          epicRoot: 'docs/epics',
        });
        const target = adapter.commandFilePath(workspaceRoot, commandName);
        writeAtomic(target, rendered);
        written.push(target);
        // Cursor Agent resolves slash commands as skills.
        if (adapter.id === 'cursor') {
          const skill = path.join(workspaceRoot, '.cursor', 'skills', commandName, 'SKILL.md');
          writeAtomic(skill, rendered);
          written.push(skill);
        }
      }
    }
  }
  return written;
}

function agents(): WorkspaceConfig['agents'] {
  const roles = [...new Set(Object.values(ROLE_BY_PHASE))];
  return roles.map((role) => {
    const rolePhases = PHASES.filter((phase) => ROLE_BY_PHASE[phase] === role);
    return {
      id: `cofofo-${role}`,
      name: role.split('-').map((part) => part[0]!.toUpperCase() + part.slice(1)).join(' '),
      skills: rolePhases.map(skillId),
      model: role.includes('review') || role.includes('architect') ? 'claude-opus-5' : 'claude-sonnet-5',
      runner: 'default' as const,
      capabilities: ['files'],
    };
  });
}

function step(phase: Phase, value: Record<string, unknown>): WorkspaceConfig['pipelines'][number]['steps'][number] {
  return {
    agent: `cofofo-${ROLE_BY_PHASE[phase]}`,
    name: phase,
    skills: [skillId(phase)],
    enabled: true,
    produces: [], requires: [], depends_on: [], produces_contains: [],
    auto_review: false, human_review: false, skippable: false,
    ...value,
  } as WorkspaceConfig['pipelines'][number]['steps'][number];
}

export function generatedCofofoWorkspace(current?: Partial<WorkspaceConfig>): WorkspaceConfig {
  const generatedSkills: WorkspaceConfig['skills'] = PHASES.map((phase) => ({ id: skillId(phase), path: skillPath(phase) }));

  const foundation = {
    id: 'cofofo-foundation', on_failure: 'stop' as const,
    steps: [
      step('scan-stack', { produces: [`${FOUNDATION}/STACK-PROFILE.json`, `${FOUNDATION}/STACK-PROFILE.md`], produces_contains: ['schemaVersion'] }),
      step('define-rules', { requires: [`${FOUNDATION}/STACK-PROFILE.json`], produces: [`${FOUNDATION}/PROJECT-RULES.json`, `${FOUNDATION}/PROJECT-RULES.md`, `${FOUNDATION}/RULE-DRIFT.md`], produces_contains: ['## Rule Index'], human_review: true, review: { mode: 'canvas', artifacts: [`${FOUNDATION}/PROJECT-RULES.md`, `${FOUNDATION}/RULE-DRIFT.md`] }, depends_on: ['scan-stack'] }),
      step('map-system', { requires: [`${FOUNDATION}/STACK-PROFILE.json`, `${FOUNDATION}/PROJECT-RULES.json`], produces: [`${FOUNDATION}/ARCHITECTURE-MAP.md`], produces_contains: ['## Layer Map'], depends_on: ['define-rules'] }),
      step('select-ecc-catalog', { requires: [`${FOUNDATION}/STACK-PROFILE.json`], produces: [`${FOUNDATION}/ECC-CATALOG-SELECTION.md`], produces_contains: ['## Approved Text Assets'], human_review: true, review: { mode: 'canvas', artifacts: [`${FOUNDATION}/ECC-CATALOG-SELECTION.md`] }, depends_on: ['map-system'] }),
      step('install-ecc-assets', { requires: [`${FOUNDATION}/ECC-CATALOG-SELECTION.md`, `${FOUNDATION}/PROJECT-RULES.json`], produces: [`${FOUNDATION}/INSTALLED-ASSETS.json`], produces_contains: ['catalogRevision'], depends_on: ['select-ecc-catalog'] }),
      step('publish-context', { requires: [`${FOUNDATION}/ARCHITECTURE-MAP.md`, `${FOUNDATION}/PROJECT-RULES.json`, `${FOUNDATION}/INSTALLED-ASSETS.json`], produces: [`${FOUNDATION}/CONTEXT-MANIFEST.json`, `${FOUNDATION}/BUNDLE-BINDING.json`, 'docs/README.md', `${FOUNDATION}/PROVIDER-CONTEXT.md`], produces_contains: ['foundationRevision', 'CoFoFo Provider Context'], human_review: true, review: { mode: 'canvas', artifacts: ['docs/README.md', `${FOUNDATION}/PROVIDER-CONTEXT.md`] }, depends_on: ['install-ecc-assets'] }),
    ],
  };

  const delivery = {
    id: 'cofofo-delivery', on_failure: 'stop' as const,
    foundation: { mode: 'cofofo' as const, manifest: `${FOUNDATION}/CONTEXT-MANIFEST.json`, state: '.aidlc/cofofo/foundation.json' },
    steps: [
      step('requirement', { requires: [`${FOUNDATION}/CONTEXT-MANIFEST.json`, `${EPIC}/INTENT.md`], produces: [`${EPIC}/REQUIREMENT.md`, `${EPIC}/EVIDENCE.md`, `${EPIC}/OPTIONS.md`], produces_contains: ['## Acceptance Criteria'], human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/INTENT.md`, `${EPIC}/EVIDENCE.md`, `${EPIC}/OPTIONS.md`, `${EPIC}/REQUIREMENT.md`] } }),
      step('diagnose', { requires: [`${FOUNDATION}/CONTEXT-MANIFEST.json`, `${EPIC}/BUG-REPORT.md`], produces: [`${EPIC}/ROOT-CAUSE.md`], produces_contains: ['## Failure Oracle', '## Resume From'], human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/ROOT-CAUSE.md`] }, depends_on: ['requirement'] }),
      step('create-plan', { requires: [`${EPIC}/REQUIREMENT.md`, `${FOUNDATION}/PROJECT-RULES.json`, `${FOUNDATION}/ARCHITECTURE-MAP.md`], produces: [`${EPIC}/TASK-PLAN.md`], produces_contains: ['## RED / GREEN Contract'], human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/TASK-PLAN.md`] }, depends_on: ['requirement'] }),
      step('reproduce', { requires: [`${EPIC}/ROOT-CAUSE.md`], produces: [`${EPIC}/RED-EVIDENCE.md`], produces_contains: ['## Expected Failure'], evidence: { stage: 'red' }, human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/RED-EVIDENCE.md`] }, depends_on: ['create-plan'] }),
      step('implement', { produces: [`${EPIC}/RED-EVIDENCE.md`, `${EPIC}/IMPLEMENT-SUMMARY.md`, `${EPIC}/REFACTOR-EVIDENCE.md`], produces_contains: ['## Green Evidence'], evidence: { stage: 'green' }, human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/IMPLEMENT-SUMMARY.md`] }, depends_on: ['reproduce'] }),
      step('test', { requires: [`${EPIC}/IMPLEMENT-SUMMARY.md`], produces: [`${EPIC}/REVIEW.md`, `${EPIC}/TEST-REPORT.md`, `${EPIC}/VERIFY.md`], produces_contains: ['## Final Verification'], evidence: { stage: 'verify' }, human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/VERIFY.md`, `${EPIC}/TEST-REPORT.md`, `${EPIC}/REVIEW.md`] }, depends_on: ['implement'] }),
    ],
  };

  const keep = <T extends { id: string }>(values: T[] | undefined): T[] => (values ?? []).filter((value) => !value.id.startsWith('cofofo-'));
  const slash = (current?.slash_commands ?? []).filter((value) => !('agent' in value && value.agent.startsWith('cofofo-')));
  const raw: WorkspaceConfig = {
    version: current?.version ?? '1.0',
    name: current?.name ?? 'CoFoFo Workspace',
    standard: current?.standard,
    agents: [...keep(current?.agents), ...agents()],
    skills: [...keep(current?.skills), ...generatedSkills],
    environment: current?.environment ?? {},
    slash_commands: [
      ...slash,
      ...foundation.steps.map((raw) => {
        const phase = normalizeStep(raw).name as Phase;
        return { name: `/cofofo-foundation-${phase}`, agent: `cofofo-${ROLE_BY_PHASE[phase]}` };
      }),
      ...delivery.steps.map((raw) => {
        const phase = normalizeStep(raw).name as Phase;
        return { name: `/cofofo-delivery-${phase}`, agent: `cofofo-${ROLE_BY_PHASE[phase]}` };
      }),
    ],
    pipelines: [...keep(current?.pipelines), foundation, delivery],
    recipes: [
      ...keep(current?.recipes),
      { id: 'cofofo-bootstrap', from: 'cofofo-foundation', description: 'Build the complete project foundation.', steps: ['scan-stack', 'define-rules', 'map-system', 'select-ecc-catalog', 'install-ecc-assets', 'publish-context'] },
      { id: 'cofofo-refresh-context', from: 'cofofo-foundation', description: 'Refresh stack/map/context.', steps: ['scan-stack', 'map-system', 'publish-context'] },
      { id: 'cofofo-update-rules', from: 'cofofo-foundation', description: 'Review policy changes and republish context.', steps: ['define-rules', 'publish-context'] },
      { id: 'cofofo-repin-bundle', from: 'cofofo-foundation', description: 'Review and install a new pinned catalog.', steps: ['select-ecc-catalog', 'install-ecc-assets', 'publish-context'] },
      { id: 'cofofo-feature', from: 'cofofo-delivery', description: 'Requirement → plan → implement → test.', steps: ['requirement', 'create-plan', 'implement', 'test'] },
      { id: 'cofofo-bugfix', from: 'cofofo-delivery', description: 'Diagnose → reproduce → implement → test.', steps: ['diagnose', 'reproduce', 'implement', 'test'] },
    ],
    state: current?.state,
    persistence: current?.persistence,
    sidebar: current?.sidebar,
  };
  return validateWorkspace(raw, '.aidlc/workspace.yaml');
}

export { PHASES as COFOFO_PHASES };

const ROUTE_PHASES = {
  bootstrap: ['scan-stack', 'define-rules', 'map-system', 'select-ecc-catalog', 'install-ecc-assets', 'publish-context'],
  'refresh-context': ['scan-stack', 'map-system', 'publish-context'],
  'update-rules': ['define-rules', 'publish-context'],
  'repin-bundle': ['select-ecc-catalog', 'install-ecc-assets', 'publish-context'],
} as const;

/** Create the executable Foundation slice for one of the four lifecycle routes. */
export function foundationPipelineForRoute(
  pipeline: PipelineConfig,
  route: keyof typeof ROUTE_PHASES,
): PipelineConfig {
  const selected = new Set<string>(ROUTE_PHASES[route]);
  const steps = pipeline.steps
    .filter((raw) => selected.has(normalizeStep(raw).name ?? normalizeStep(raw).agent))
    .map((raw, index, values) => {
      const norm = normalizeStep(raw);
      const previous = index > 0 ? normalizeStep(values[index - 1]!).name ?? normalizeStep(values[index - 1]!).agent : undefined;
      return {
        ...norm,
        depends_on: previous ? [previous] : [],
      };
    });
  return validateWorkspace({
    version: '1.0', name: 'CoFoFo route', agents: [], skills: [], environment: {}, slash_commands: [],
    pipelines: [{ ...pipeline, steps }], recipes: [],
  }, '.aidlc/workspace.yaml').pipelines[0]!;
}
