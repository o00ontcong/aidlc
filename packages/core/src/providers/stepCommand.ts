import type { PhaseDef } from '../presets/builtinWorkflows';

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
  phase: PhaseDef,
  skillBody: string,
  epicRoot: string,
): string {
  const explicitOutputs = phase.produces?.map((output) =>
    output.replaceAll('{epic}', '$ARGUMENTS')) ?? [];
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
   - If the step has \`feedback\` from a prior rejection, address it explicitly in this revision.
   - Check \`history\` entries for rejection reasons and context.
2. Read \`${epicRoot}/$ARGUMENTS/inputs.json\` for capability inputs (Jira ticket, Figma URL, files glob, GitHub repo, etc.).
${artifactInstruction}
4. When finished, summarize what you produced and tell the user to click **"Mark step done"** in the AIDLC panel to advance the pipeline.
`;
}

export function buildStepCommandSpec(
  phase: PhaseDef,
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
