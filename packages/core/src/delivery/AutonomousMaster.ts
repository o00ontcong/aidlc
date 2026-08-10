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

/** Write (or refresh) the master command document the delivery hands off to. */
export function ensureAutonomousMasterCommand(workspaceRoot: string): void {
  const file = path.join(workspaceRoot, '.claude', 'commands', 'aidlc-autonomous-delivery.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---
description: Run an entire AIDLC Cohesive Delivery autonomously. Usage: /aidlc-autonomous-delivery <delivery-id>
---

# AIDLC Autonomous Delivery Master

You are the master executor for delivery \`$ARGUMENTS\`. Own the entire delivery
until it reaches aggregate human review, a real external blocker, or a required
human decision. Do **not** stop after one phase and do not ask the user to click
"Mark step done" between phases.

## Source of truth

1. Read \`.aidlc/deliveries/$ARGUMENTS/request.md\` and
   \`.aidlc/deliveries/$ARGUMENTS/state.json\`.
2. Read \`.aidlc/workspace.yaml\`, its two Cohesive pipelines
   (\`project-context\`, \`cohesive-feature\`), and
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

1. Complete all seven project-context phases in dependency order.
2. Complete the cohesive-feature phases end-to-end: contract, task plan,
   implementation, validation, test, and the single feature PR/review bundle.
3. This delivery is one independent epic. Do not create or ask the user to
   manage work-package/worker epics, choose a worker count, or wait on an
   internal worker board. You may choose internal task decomposition yourself
   when it helps, but it is not a user-visible parallelism control.
4. For every phase, follow the corresponding namespaced command document in
   \`.claude/commands/\` (for example
   \`project-context-project-rules-sync.md\`) as the authoritative persona,
   skill, input, output, and acceptance contract.
5. Validate declared outputs before treating a phase as complete. Keep the
   AIDLC run/epic state files aligned with the completed phase so progress
   stays inspectable after a refresh or resume.
6. If a recoverable failure occurs, diagnose, repair, and retry that phase.
   Stop only for missing credentials, an unsafe/destructive action requiring
   consent, a genuine ambiguity that needs product input, or an enforced human
   review/merge gate. State the exact blocker and the next command to resume.

Work visibly in this Claude session: narrate stage transitions, commands,
validation results, and failures. Never invoke a global \`aidlc\` CLI.
`, 'utf8');
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
  for (const id of ['project-context', 'cohesive-feature']) {
    if (!ids.has(id)) throw new Error(`Cohesive Delivery is not installed (missing pipeline ${id}).`);
  }
}
