import * as fs from 'fs';
import * as path from 'path';

import { WorkspaceLoader } from '../loader/WorkspaceLoader';
import type { DeliveryRequest } from './DeliveryTypes';

/**
 * Slash command that owns an entire Cohesive Delivery epic end-to-end inside
 * one Claude session. Both the extension (interactive terminal) and the CLI
 * (spawned `claude` process) hand off to the exact same command instead of
 * walking DeliveryOrchestrator's per-step programmatic loop — internal task
 * decomposition is Claude's decision, not a TypeScript state machine's.
 */
export const AUTONOMOUS_MASTER_COMMAND = '/aidlc-autonomous-delivery';
export const AUTONOMOUS_EPIC_MASTER_COMMAND = '/aidlc-autonomous-epic';

/** Body for multi-provider sync (provider adapters add their own frontmatter). */
export function autonomousEpicMasterCommandBody(): string {
  return `# AIDLC Autonomous Epic Master

Own epic \`$ARGUMENTS\` until its configured pipeline completes, its saved
mode switches to Guided, or an unresolved product/architecture question needs
a human answer. Work visibly in this session.

## Source of truth

1. Read the epic \`state.json\`, \`inputs.json\`, and matching
   \`.aidlc/runs/<epic-id>.json\`.
2. Read \`.aidlc/workspace.yaml\`, resolve the epic's \`pipeline\`, and read
   the corresponding slash-command documents for every phase.
3. Before starting **every** next phase, re-read epic \`state.json\`.

## Mode and checkpoint contract

- Continue only while \`state.json.runMode\` is \`autonomous\`.
- If it becomes \`guided\`, stop cleanly at the current durable checkpoint;
  report the next phase and do not start it.
- Preserve approved steps. Resume from the first incomplete, rejected, or
  retryable step; never recreate or reset an existing run, artifact, branch,
  or approved phase.

## Execution contract

1. Run pipeline phases in their declared dependency order, following each
   phase's command document for its inputs, outputs, validation, and state
   transition.
2. Keep run and epic state aligned after every completed phase so refresh and
   resume remain accurate.
   - Run-step status must use the run schema: \`approved\` (never \`completed\`).
   - Epic step status must use the epic schema: \`done\` (never \`completed\`).
   - Only the top-level run status uses \`completed\`; the top-level epic status
     uses \`done\`.
   - Record every validated output path in that step's \`artifactsProduced\`.
3. Treat \`human_review: true\` as an **autonomous approval**, not a pause,
   except for the Cohesive Delivery phase named \`resolve-bugs\`:
   - for ordinary phases, after declared outputs and auto-review pass, record
     the run step as \`approved\` and continue;
   - for \`resolve-bugs\`, collect the user's bug report, complete fixes and
     verification, persist \`awaiting_review\`, then stop at that checkpoint.
     Continue only after the user explicitly approves it in AIDLC. A rejection
     carries the next bug report/revision back into the same phase.
4. Do not pause merely for another configured human-review or merge gate. At
   \`ship\`, execute only the merge behavior allowed by the checked-in
   ship policy; never fabricate an approval, a merge, or a policy exception.
   If that policy requires a human-only merge, ask one explicit question about
   changing the policy rather than treating it as an approval request.
5. For recoverable failures, diagnose and retry only the failed phase and its
   required downstream dependants. For a real blocker, state the evidence and
   exact question needed to proceed. The only normal wait is a human answer to
   an unresolved product, architecture, or policy question.
6. Never invoke a hidden global AIDLC CLI; narrate commands, transitions,
   validation, and failures in this session.
`;
}

/** Body for multi-provider sync (provider adapters add their own frontmatter). */
export function autonomousMasterCommandBody(): string {
  return `# AIDLC Autonomous Delivery Master

You are the master executor for delivery \`$ARGUMENTS\`. Own the entire delivery
until it completes, a real external blocker occurs, or an unresolved question
needs a human answer. Do **not** stop after one phase and do not ask the user to
click "Mark step done" or approve a phase between phases.

## Source of truth

1. Read \`.aidlc/deliveries/$ARGUMENTS/request.md\` and
   \`.aidlc/deliveries/$ARGUMENTS/state.json\`.
2. Read \`.aidlc/workspace.yaml\`, its Cohesive pipelines
   (\`project-context\`, \`feature-spike\`, \`feature-implement\`), and
   every relevant agent/skill file under \`.claude/\` or \`~/.claude/\`.
3. Read existing run and epic state before resuming; preserve completed,
   validated work and continue from the first incomplete phase.

## Resume contract (mandatory)

- Treat \`.aidlc/deliveries/$ARGUMENTS/state.json\`, \`.aidlc/runs/*.json\`,
  and the matching epic \`state.json\` files as durable checkpoints.
- Never delete, recreate, reset, or overwrite a run, worktree, artifact, or
  approved phase that already exists and validates successfully.
- On a resumed invocation, locate the first phase whose state is
  \`awaiting_work\`, \`pending\`, \`rejected\`, or recorded as failed; retry only
  that incomplete phase and its required downstream dependants.
- Do not rerun an approved upstream phase merely because this master command
  was invoked again. Report the checkpoint selected before doing any work.

## Execute autonomously

1. Complete every configured project-context phase in dependency order.
2. Complete feature-implement from a complete MISSION.md: implement, resolve-bugs,
   and ship (one feature PR, human merge, then Reality sync).
   Optionally run feature-spike first to package MISSION.md; spike does not
   depend_on implement.
3. This delivery is one independent epic. Do not create or ask the user to
   manage work-package/worker epics, choose a worker count, or wait on an
   internal worker board. You may choose internal task decomposition yourself
   when it helps, but it is not a user-visible parallelism control.
4. For every phase, follow the corresponding namespaced command document as
   the authoritative persona, skill, input, output, and acceptance contract.
5. A phase with \`human_review: true\` is automatically approved once its
   declared outputs and auto-review validator pass, except \`resolve-bugs\`.
   That phase must remain \`awaiting_review\` until the user has tested the fix
   and explicitly approves it in AIDLC. Persist ordinary phases as \`approved\`
   in run state and \`done\` in epic state; do not create aggregate review.
6. Do not stop at \`ship\` solely because merge is a human GitHub action. Follow the
   checked-in ship policy exactly; if it allows an agent merge, merge and verify
   it. If it forbids agent merge, ask one explicit policy question — never
   invent a human approval or a merged status.
7. If a recoverable failure occurs, diagnose, repair, and retry that phase.
   Stop only for missing credentials, an unsafe/destructive action requiring
   consent, or a genuine unresolved product, architecture, or ship-policy
   question. State the exact question and the next command to resume.

Work visibly in this session: narrate stage transitions, commands,
validation results, and failures. Never invoke a global \`aidlc\` CLI.
`;
}

/**
 * Install the generic, visible Claude master command used by any pipeline
 * epic. It deliberately relies on the pipeline's own step commands and run
 * state rather than reimplementing pipeline semantics in TypeScript.
 */
export function ensureAutonomousEpicMasterCommand(workspaceRoot: string): void {
  const file = path.join(workspaceRoot, '.claude', 'commands', 'aidlc-autonomous-epic.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---
description: Run one AIDLC epic's configured pipeline autonomously. Usage: /aidlc-autonomous-epic <epic-id>
---

${autonomousEpicMasterCommandBody()}`, 'utf8');
}

/** Write (or refresh) the master command document the delivery hands off to. */
export function ensureAutonomousMasterCommand(workspaceRoot: string): void {
  const file = path.join(workspaceRoot, '.claude', 'commands', 'aidlc-autonomous-delivery.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---
description: Run an entire AIDLC Cohesive Delivery autonomously. Usage: /aidlc-autonomous-delivery <delivery-id>
---

${autonomousMasterCommandBody()}`, 'utf8');
}

/** Write the human-authored delivery request the master command reads as its brief. */
export function writeAutonomousRequest(workspaceRoot: string, request: DeliveryRequest): void {
  const file = path.join(workspaceRoot, '.aidlc', 'deliveries', request.id, 'request.md');
  const body = [
    `# Delivery Request: ${request.title}`,
    '',
    request.description.trim(),
    ...(request.acceptanceCriteria?.length ? ['', '## Acceptance Criteria', ...request.acceptanceCriteria.map((item) => `- ${item}`)] : []),
    ...(request.constraints?.length ? ['', '## Constraints', ...request.constraints.map((item) => `- ${item}`)] : []),
    ...(request.source?.reference ? ['', `Source: ${request.source.type} — ${request.source.reference}`] : []),
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, 'utf8');
}

/** Throw a clear error unless both Cohesive Delivery pipelines are installed in this workspace. */
export function ensureCohesiveBundleInstalled(workspaceRoot: string): void {
  const ids = new Set(WorkspaceLoader.load(workspaceRoot).config.pipelines.map((pipeline) => pipeline.id));
  for (const id of ['project-context', 'feature-implement']) {
    if (!ids.has(id)) throw new Error(`Cohesive Delivery is not installed (missing pipeline ${id}).`);
  }
}
