import * as fs from 'fs';
import * as path from 'path';

import type { WorkspaceConfig } from '../schema/WorkspaceSchema';
import { normalizeStep, validateWorkspace } from '../schema/WorkspaceSchema';
import { listCommandProviderAdapters } from '../providers/CommandProviderAdapter';
import { hashFile } from './hash';
import { writeAtomic } from './paths';

const EPIC = 'docs/epics/{epic}/artifacts';
const DISCOVER_CONTEXT = '.aidlc/discover';

const PHASES = [
  'analyze', 'diagnose', 'create-plan', 'reproduce', 'implement', 'test',
] as const;

type Phase = typeof PHASES[number];

const PHASE_INSTRUCTIONS: Record<Phase, string> = {
  analyze: 'Read the pinned Discover context pack in run state, never latest Discover docs by default. Research the relevant source/test paths and write EVIDENCE.md with citations, OPTIONS.md with bounded alternatives, and TASK-DECISIONS.md containing only task-local decisions, assumptions, scope and acceptance-criteria references. Do not create REQUIREMENT.md or copy canonical Requirement/Feature prose. If product scope, architecture or a requirement must change, record a Discover delta and ask the human to publish and explicitly rebase before continuing. Do not mutate production code.',
  diagnose: 'For a bug, find root cause before changing production code. Write ROOT-CAUSE.md with reproduction, causal chain, affected invariant, and failure oracle.',
  'create-plan': 'Write TASK-PLAN.md. Map every acceptance criterion to files/tests, cite every applicable blocking ruleId, state the exact RED test and expected assertion, then obtain Canvas approval before production mutation.',
  reproduce: 'Add the smallest behavior test first. Capture a real expected assertion failure with `aidlc cofofo evidence red`; compile/import/syntax failures do not count. If a RED waiver is necessary, use `aidlc cofofo waive-red` so RED-EVIDENCE.md records the reason and alternative evidence. The Canvas gate on RED-EVIDENCE.md must approve either path before production code changes.',
  implement: 'On cofofo-feature (no reproduce step), write the RED test in this phase first, capture RED with `aidlc cofofo evidence red`, and write RED-EVIDENCE.md before any production mutation. On cofofo-bugfix, RED already exists from reproduce. Implement only enough production behavior to pass the RED test, capture GREEN with the allow-listed test command, refactor without changing behavior and capture REFACTOR, then write IMPLEMENT-SUMMARY.md. Canvas reviews the implementation summary and scope.',
  test: 'Review the diff from fresh context for correctness, rules, regression, security, concurrency, and maintainability in REVIEW.md. Dispose every blocking finding, run build/rule/full-suite checks, capture VERIFY evidence, and write TEST-REPORT.md and VERIFY.md with actual results and limitations; Canvas closes the delivery boundary.',
};

const ROLE_BY_PHASE: Record<Phase, string> = {
  analyze: 'product-owner', diagnose: 'diagnostician', 'create-plan': 'tech-lead', reproduce: 'developer',
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
  contextHash = 'pending-discover-publish',
): string[] {
  const rulesPath = `${DISCOVER_CONTEXT}/compiled-rules.json`;
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

  const discoverContextGate = {
    manifest: `${DISCOVER_CONTEXT}/published-context.json`,
    packDirectory: `${DISCOVER_CONTEXT}/context-packs`,
  };

  // Only two public task pipelines. Discover's "Publish context" button owns
  // the prerequisite validation, stack/rule reconciliation, and ECC bundle
  // install — there is no separate startable Foundation pipeline.
  const feature = {
    id: 'cofofo-feature', on_failure: 'stop' as const,
    discover_context: discoverContextGate,
    steps: [
      step('analyze', { requires: ['{context_pack}'], produces: [`${EPIC}/EVIDENCE.md`, `${EPIC}/OPTIONS.md`, `${EPIC}/TASK-DECISIONS.md`], produces_contains: ['## Scope'], human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/EVIDENCE.md`, `${EPIC}/OPTIONS.md`, `${EPIC}/TASK-DECISIONS.md`] } }),
      step('create-plan', { requires: [`${EPIC}/TASK-DECISIONS.md`, `${DISCOVER_CONTEXT}/compiled-rules.json`], produces: [`${EPIC}/TASK-PLAN.md`], produces_contains: ['## RED / GREEN Contract'], human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/TASK-PLAN.md`] }, depends_on: ['analyze'] }),
      step('implement', { produces: [`${EPIC}/RED-EVIDENCE.md`, `${EPIC}/IMPLEMENT-SUMMARY.md`, `${EPIC}/REFACTOR-EVIDENCE.md`], produces_contains: ['## Green Evidence'], evidence: { stage: 'green' }, human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/IMPLEMENT-SUMMARY.md`] }, depends_on: ['create-plan'] }),
      step('test', { requires: [`${EPIC}/IMPLEMENT-SUMMARY.md`], produces: [`${EPIC}/REVIEW.md`, `${EPIC}/TEST-REPORT.md`, `${EPIC}/VERIFY.md`], produces_contains: ['## Final Verification'], evidence: { stage: 'verify' }, human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/VERIFY.md`, `${EPIC}/TEST-REPORT.md`, `${EPIC}/REVIEW.md`] }, depends_on: ['implement'] }),
    ],
  };

  const bugfix = {
    id: 'cofofo-bugfix', on_failure: 'stop' as const,
    discover_context: discoverContextGate,
    steps: [
      step('diagnose', { requires: ['{context_pack}', `${EPIC}/BUG-REPORT.md`], produces: [`${EPIC}/ROOT-CAUSE.md`], produces_contains: ['## Failure Oracle', '## Resume From'], human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/ROOT-CAUSE.md`] } }),
      step('reproduce', { requires: [`${EPIC}/ROOT-CAUSE.md`], produces: [`${EPIC}/RED-EVIDENCE.md`], produces_contains: ['## Expected Failure'], evidence: { stage: 'red' }, human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/RED-EVIDENCE.md`] }, depends_on: ['diagnose'] }),
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
      ...[feature, bugfix].flatMap((pipeline) => pipeline.steps.map((raw) => {
        const phase = normalizeStep(raw).name as Phase;
        return { name: `/${pipeline.id}-${phase}`, agent: `cofofo-${ROLE_BY_PHASE[phase]}` };
      })),
    ],
    // Discover publishes context internally; only delivery task pipelines are public.
    pipelines: [...keep(current?.pipelines), feature, bugfix],
    recipes: [...keep(current?.recipes)],
    state: current?.state,
    persistence: current?.persistence,
    sidebar: current?.sidebar,
  };
  return validateWorkspace(raw, '.aidlc/workspace.yaml');
}

export { PHASES as COFOFO_PHASES };
