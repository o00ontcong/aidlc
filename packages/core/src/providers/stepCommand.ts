import { rewriteEpicsRootPrefix } from '../runs/RunState';
import { USER_NOTE_PRIORITY_RULE } from '../change/composeRequirementWithUserNote';

/** Structural subset needed to render a command; kept independent of presets. */
export interface StepCommandPhase {
  id: string;
  description: string;
  model: string;
  artifact: string;
  produces?: string[];
}

/** Provider-neutral command payload — canonical model ids, shared markdown body. */
export interface StepCommandSpec {
  commandName: string;
  description: string;
  /** Canonical Claude-oriented model key; omitted for model-less commands. */
  canonicalModel?: string;
  /** Skill + AIDLC task wiring (no provider frontmatter). */
  body: string;
  epicRoot: string;
}

/** Markdown body shared by every provider adapter (skill + task section). */
export function buildStepCommandBody(
  phase: StepCommandPhase,
  skillBody: string,
  epicRoot: string,
): string {
  const explicitOutputs = phase.produces?.map((output) =>
    rewriteEpicsRootPrefix(output, epicRoot).replaceAll('{epic}', '$ARGUMENTS')) ?? [];
  const isFilePath = !phase.artifact.includes('<') && !phase.artifact.includes('>');
  const artifactInstruction = explicitOutputs.length > 0
    ? `3. Produce every declared output below. These paths are pipeline gates; do not create placeholders or report completion before their contents are valid:\n${explicitOutputs.map((output) => `   - \`${output}\``).join('\n')}`
    : isFilePath
      ? `3. Write your output to \`${epicRoot}/$ARGUMENTS/artifacts/${phase.artifact}\`. The AIDLC validator checks for this file when the step is marked done.`
      : `3. Complete the work (${phase.artifact}), then write a summary to \`${epicRoot}/$ARGUMENTS/artifacts/${phase.id.toUpperCase()}-SUMMARY.md\` so the AIDLC validator has a file to check.`;

  return `${skillBody.trim()}

## Task

The user invoked you with epic id \`$ARGUMENTS\`.

1. Read \`${epicRoot}/$ARGUMENTS/state.json\` to understand the current run state.
   - If the step has \`feedback\` from a prior rejection or bug report, address it explicitly in this revision.
   - Check \`history\` entries for rejection reasons, \`bug_report\` rounds, and context. Previously reported bugs remain in scope.
2. Read \`${epicRoot}/$ARGUMENTS/inputs.json\` for capability inputs (Jira ticket, Figma URL, files glob, GitHub repo, etc.).
   - Read \`${epicRoot}/$ARGUMENTS/USER-NOTE.md\` FIRST when it exists. Same text as \`inputs.json\` \`user_note\`.
   - If \`jira\` is set, that is the ticket key (Sprint-started epics keep it even after the task id becomes EPIC-N). The ticket body is already in \`state.json\` description — do **not** wait for Jira MCP.
   - If \`user_note\` / USER-NOTE.md is present, it outranks \`state.json\` description and the ticket. ${USER_NOTE_PRIORITY_RULE}
${artifactInstruction}
4. When finished, summarize what you produced and tell the user to click **"Đánh dấu step xong"** / **"Mark step done"** in the AIDLC panel. Canvas-gated steps open the review canvas after that click — do not claim Canvas is already open.
`;
}

export function buildStepCommandSpec(
  phase: StepCommandPhase,
  skillBody: string,
  epicRoot: string,
  commandName: string,
): StepCommandSpec {
  return {
    commandName,
    description: phase.description,
    canonicalModel: phase.model,
    body: buildStepCommandBody(phase, skillBody, epicRoot),
    epicRoot,
  };
}

/** Claude Code slash-command format (YAML frontmatter + model). */
export function renderClaudeCommandFile(spec: StepCommandSpec, mappedModel?: string): string {
  const modelLine = mappedModel ?? spec.canonicalModel;
  const frontmatter = modelLine
    ? `---
description: ${spec.description}
model: ${modelLine}
---

`
    : `---
description: ${spec.description}
---

`;
  return `${frontmatter}${spec.body}`;
}
