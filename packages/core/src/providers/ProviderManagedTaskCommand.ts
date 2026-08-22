import * as fs from 'fs';
import * as path from 'path';

export const PROVIDER_MANAGED_TASK_COMMAND = '/aidlc-provider-managed-task';

/** Body for provider command adapters, which add provider-specific frontmatter. */
export function providerManagedTaskCommandBody(): string {
  return `# AIDLC Provider-managed Task

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
3. Treat \`human_review: true\` as a **provider-managed approval**, not a pause:
   after the declared outputs and auto-review pass, record the run step as
   \`approved\` and continue.
4. Do not pause merely for another configured human-review or merge gate, and
   never fabricate an approval, a merge, or a policy exception. When a
   checked-in policy requires a human-only action, ask one explicit question
   rather than treating it as an approval request.
5. For recoverable failures, diagnose and retry only the failed phase and its
   required downstream dependants. For a real blocker, state the evidence and
   exact question needed to proceed. The only normal wait is a human answer to
   an unresolved product, architecture, or policy question.
6. Never invoke a hidden global AIDLC CLI; narrate commands, transitions,
   validation, and failures in this session.
`;
}

/** Install the generic, visible task command used by every provider adapter. */
export function ensureProviderManagedTaskCommand(workspaceRoot: string): void {
  const file = path.join(workspaceRoot, '.claude', 'commands', 'aidlc-provider-managed-task.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---
description: Run one AIDLC task pipeline in the selected provider terminal. Usage: /aidlc-provider-managed-task <task-id>
---

${providerManagedTaskCommandBody()}`, 'utf8');
}
