import * as fs from 'fs';
import * as path from 'path';

import type { WorkspaceConfig } from '../schema/WorkspaceSchema';
import { normalizeStep, validateWorkspace } from '../schema/WorkspaceSchema';
import { listCommandProviderAdapters } from '../providers/CommandProviderAdapter';
import { hashFile } from './hash';
import { writeAtomic } from './paths';
import { USER_NOTE_PRIORITY_RULE } from '../change/composeRequirementWithUserNote';

const EPIC = 'docs/epics/{epic}/artifacts';
const DISCOVER_CONTEXT = '.aidlc/discover';
const REQUIREMENT = `${EPIC}/REQUIREMENT.md`;

/** Headings the analyze step must write; Canvas and produces_contains gate on these. */
export const COFOFO_REQUIREMENT_REQUIRED_HEADINGS = [
  '## 4. Screens (New / Update)',
  '## 5. Screen Flow Diagram',
  '## 6. APIs (New / Update)',
  '## 6.1 API Flow Diagram',
  '## 9. Research / citations',
  '## 10. Options & task decisions',
] as const;

export const COFOFO_PLAN_REQUIRED_HEADINGS = ['## Files and Tests'] as const;
export const COFOFO_IMPLEMENT_REQUIRED_HEADINGS = ['## Scope'] as const;
export const COFOFO_TEST_REQUIRED_HEADINGS = ['## Final Verification'] as const;
export const COFOFO_DIAGNOSE_REQUIRED_HEADINGS = ['## Failure Oracle', '## Resume From'] as const;

const PHASES = [
  'analyze', 'diagnose', 'create-plan', 'implement', 'test',
] as const;

type Phase = typeof PHASES[number];

/** `produces_contains` markers per phase — skills and slash commands must quote these verbatim. */
export const COFOFO_PHASE_REQUIRED_HEADINGS: Record<Phase, readonly string[]> = {
  analyze: COFOFO_REQUIREMENT_REQUIRED_HEADINGS,
  diagnose: COFOFO_DIAGNOSE_REQUIRED_HEADINGS,
  'create-plan': COFOFO_PLAN_REQUIRED_HEADINGS,
  implement: COFOFO_IMPLEMENT_REQUIRED_HEADINGS,
  test: COFOFO_TEST_REQUIRED_HEADINGS,
};

function pipelineHeadingGate(headings: readonly string[]): string {
  return `Pipeline gate: produced files must contain these exact headings (verbatim): ${headings.map((h) => `\`${h}\``).join(', ')}. Close variants fail mark-done.`;
}

const PHASE_INSTRUCTIONS: Record<Phase, string> = {
  analyze: [
    'Turn the epic brief into REQUIREMENT.md — the only analyze Canvas artifact. This is an execution snapshot for create-plan, not a second editor for the Change requirement. Discover docs/project REQUIREMENTS.md (product) is a different file from this epic REQUIREMENT.md (task).',
    'READ docs/epics/$ARGUMENTS/USER-NOTE.md FIRST when that file exists. It is the human\'s authoritative note (screens, Figma URLs, APIs, UI). Every distinctive line and every URL must appear in REQUIREMENT.md — do not skip it.',
    USER_NOTE_PRIORITY_RULE,
    'Ticket source (do not wait for Jira MCP):',
    '- Read docs/epics/$ARGUMENTS/inputs.json. `jira` is the ticket key when this epic started from the Sprint tab. `user_note` is the same text as USER-NOTE.md.',
    '- Read state.json `description` — AIDLC already snapshotted the ticket body (and **Jira:** / **URL:** lines) there.',
    '- If `user_note` / USER-NOTE.md is present, it outranks `state.json` description and the ticket; fold both into the requirement.',
    'Read the pinned Discover context pack in run state, never latest Discover docs by default. Research relevant source/test paths so screen and API mappings are real, not invented.',
    `Write \`${REQUIREMENT}\` with every heading below. Headings are mandatory even when a section is N/A.`,
    '- `## 1. Summary` — 1–2 sentences',
    '- `## 2. Problem / Goal`',
    '- `## 3. Scope` — In scope / Out of scope',
    '- `## 4. Screens (New / Update)` — table: Screen | Change (New / Update) | Screen file or Figma | View/Type in source. Or `N/A — no UI change`.',
    '- `## 5. Screen Flow Diagram` — mermaid `flowchart TD`; nodes match the Screen column. Or `N/A — no UI change`.',
    '- `## 6. APIs (New / Update)` — table: API | Change (New / Update) | Method + path | Request / Response | Client / UseCase. Or `N/A — no API change`.',
    '- `## 6.1 API Flow Diagram` — mermaid `sequenceDiagram` or `flowchart TD` of the calls. Or `N/A — no API change`.',
    '- `## 7. Acceptance Criteria` — verifiable `AC-n` lines',
    '- `## 8. Open Questions` — blocking when a mapping or contract is unknown',
    '- `## 9. Research / citations` — source paths, APIs from comments, Figma/node evidence. Or `N/A`.',
    '- `## 10. Options & task decisions` — bounded alternatives plus task-local assumptions/decisions. Or `N/A`.',
    pipelineHeadingGate(COFOFO_REQUIREMENT_REQUIRED_HEADINGS),
    'Do not mutate production code. Do not report the step complete without the Screens/API headings and §§ 9–10.',
    'If an older run left OPTIONS.md, EVIDENCE.md, or TASK-DECISIONS.md, fold that content into §§ 9–10. Those files are leftover from a retired analyze split — they are not pipeline artifacts. Do not write them as the requirement.',
  ].join('\n'),
  diagnose: [
    'For a bug, find root cause before changing production code.',
    'Write ROOT-CAUSE.md with reproduction, causal chain, affected invariant, and failure oracle.',
    '`## Resume From` must name the next delivery phase (`implement`).',
    pipelineHeadingGate(COFOFO_DIAGNOSE_REQUIRED_HEADINGS),
  ].join('\n'),
  'create-plan': [
    'Read REQUIREMENT.md only (screens, screen flow, APIs, API flow, AC, research, task decisions).',
    'Write TASK-PLAN.md.',
    pipelineHeadingGate(COFOFO_PLAN_REQUIRED_HEADINGS),
    '`## Files and Tests` must map every acceptance criterion to files and tests, then cite every applicable blocking ruleId.',
    'Obtain Canvas approval before production mutation.',
  ].join('\n'),
  implement: [
    'Implement the approved plan. Do not expand scope past TASK-PLAN.md and REQUIREMENT.md.',
    'Write IMPLEMENT-SUMMARY.md with what changed, files touched, and how to verify.',
    pipelineHeadingGate(COFOFO_IMPLEMENT_REQUIRED_HEADINGS),
    'Canvas reviews the implementation summary and scope.',
  ].join('\n'),
  test: [
    'Review the diff from fresh context for correctness, rules, regression, security, concurrency, and maintainability in REVIEW.md.',
    'Dispose every blocking finding, run build/rule/full-suite checks, capture VERIFY evidence, and write TEST-REPORT.md and VERIFY.md with actual results and limitations; Canvas closes the delivery boundary.',
    pipelineHeadingGate(COFOFO_TEST_REQUIRED_HEADINGS),
  ].join('\n'),
};

const ROLE_BY_PHASE: Record<Phase, string> = {
  analyze: 'product-owner', diagnose: 'diagnostician', 'create-plan': 'tech-lead',
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
        pipelineHeadingGate(COFOFO_PHASE_REQUIRED_HEADINGS[phase]),
        '',
        `Canonical policy: \`${rulesPath}\``,
        `Policy hash: \`${rulesHash}\``,
        `Context hash: \`${contextHash}\``,
        '',
        `Run id / epic id: \`$ARGUMENTS\`.`,
        'Read docs/epics/$ARGUMENTS/USER-NOTE.md FIRST when it exists (authoritative user note; it outranks description). Fold it into the phase output.',
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
      capabilities: role === 'product-owner' || role === 'diagnostician' ? ['files', 'jira'] : ['files'],
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
      step('analyze', { requires: ['{context_pack}'], produces: [REQUIREMENT], produces_contains: [...COFOFO_PHASE_REQUIRED_HEADINGS.analyze], human_review: true, review: { mode: 'canvas', artifacts: [REQUIREMENT] } }),
      step('create-plan', { requires: [REQUIREMENT, `${DISCOVER_CONTEXT}/compiled-rules.json`], produces: [`${EPIC}/TASK-PLAN.md`], produces_contains: [...COFOFO_PHASE_REQUIRED_HEADINGS['create-plan']], human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/TASK-PLAN.md`] }, depends_on: ['analyze'] }),
      step('implement', { produces: [`${EPIC}/IMPLEMENT-SUMMARY.md`], produces_contains: [...COFOFO_PHASE_REQUIRED_HEADINGS.implement], human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/IMPLEMENT-SUMMARY.md`] }, depends_on: ['create-plan'] }),
      step('test', { requires: [`${EPIC}/IMPLEMENT-SUMMARY.md`], produces: [`${EPIC}/REVIEW.md`, `${EPIC}/TEST-REPORT.md`, `${EPIC}/VERIFY.md`], produces_contains: [...COFOFO_PHASE_REQUIRED_HEADINGS.test], evidence: { stage: 'verify' }, human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/VERIFY.md`, `${EPIC}/TEST-REPORT.md`, `${EPIC}/REVIEW.md`] }, depends_on: ['implement'] }),
    ],
  };

  const bugfix = {
    id: 'cofofo-bugfix', on_failure: 'stop' as const,
    discover_context: discoverContextGate,
    steps: [
      step('diagnose', { requires: ['{context_pack}', `${EPIC}/BUG-REPORT.md`], produces: [`${EPIC}/ROOT-CAUSE.md`], produces_contains: [...COFOFO_PHASE_REQUIRED_HEADINGS.diagnose], human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/ROOT-CAUSE.md`] } }),
      step('implement', { produces: [`${EPIC}/IMPLEMENT-SUMMARY.md`], produces_contains: [...COFOFO_PHASE_REQUIRED_HEADINGS.implement], human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/IMPLEMENT-SUMMARY.md`] }, depends_on: ['diagnose'] }),
      step('test', { requires: [`${EPIC}/IMPLEMENT-SUMMARY.md`], produces: [`${EPIC}/REVIEW.md`, `${EPIC}/TEST-REPORT.md`, `${EPIC}/VERIFY.md`], produces_contains: [...COFOFO_PHASE_REQUIRED_HEADINGS.test], evidence: { stage: 'verify' }, human_review: true, review: { mode: 'canvas', artifacts: [`${EPIC}/VERIFY.md`, `${EPIC}/TEST-REPORT.md`, `${EPIC}/REVIEW.md`] }, depends_on: ['implement'] }),
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
