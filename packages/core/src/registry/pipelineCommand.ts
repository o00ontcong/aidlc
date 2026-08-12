/**
 * Slash-command generation for registry pipelines (IMPLEMENT.md §2 step 3 +
 * step 7): every pipeline in `PipelineStore` gets a `.claude/commands/aidlc-<id>.md`
 * file so `/aidlc-<id> <epic>` is runnable in the Claude terminal. Pure string
 * generation + fs write — no `vscode` dependency; the extension only owns
 * *opening* the terminal and sending this slash command (IMPLEMENT.md §0.4:
 * "Không có CLI chạy ngầm. Mọi hành động mở một lệnh nhìn thấy được trong
 * terminal Claude").
 */

import * as fs from 'fs';
import * as path from 'path';

import type { Pipeline } from '../contracts';
import { writeFileAtomic } from '../epic';

/** `/aidlc-<pipelineId>` — the slash command name for one registry pipeline. */
export function registryPipelineCommandId(pipelineId: string): string {
  return `aidlc-${pipelineId}`;
}

export function registryPipelineCommandFile(root: string, pipelineId: string): string {
  return path.join(root, '.claude', 'commands', `${registryPipelineCommandId(pipelineId)}.md`);
}

/**
 * `.claude/commands/aidlc-<id>.md` body. References the new registry layout
 * directly (`.aidlc/pipelines`, `.claude/agents`, `.aidlc/skills`) — distinct
 * from the legacy `workspace.yaml`-keyed shortcut commands in
 * `presets/commandModel.ts`, which this does not touch or replace.
 */
export function registryPipelineCommandDoc(pipeline: Pipeline): string {
  const stepList = pipeline.steps
    .map((step) => {
      const bits = [`\`${step.id}\``];
      if (step.agent) bits.push(`agent \`${step.agent}\``);
      if (step.skills.length) bits.push(`skills ${step.skills.map((s) => `\`${s}\``).join(', ')}`);
      if (step.humanReview) bits.push('**human review**');
      else if (step.autoReview) bits.push('auto-reviewed');
      return `   - ${bits.join(' — ')}`;
    })
    .join('\n');

  return `---
description: Run the next eligible step of the "${pipeline.id}" pipeline for one epic. Usage: /${registryPipelineCommandId(pipeline.id)} <epic>
---

# /${registryPipelineCommandId(pipeline.id)} — ${pipeline.id} (v${pipeline.version})

You were invoked as \`/${registryPipelineCommandId(pipeline.id)} <epic>\` with arguments: \`$ARGUMENTS\` (the epic id, optionally followed by feedback text).

1. Read \`.aidlc/epics/<epic>/state.json\` for the epic's current step and status.
2. This pipeline's steps, in order:
${stepList}
3. Find the current \`awaiting-work\` step (or the one named in feedback after a
   reject). Load its agent's frontmatter from \`.claude/agents/<agent>.md\` and
   each of its skills from \`.aidlc/skills/<skill>.md\` (fall back to
   \`~/.claude/skills/<skill>.md\` if not present in the project).
4. Adopt that agent/skill combination, do the step's work, and write to the
   paths in its \`outputs\`.
5. If the step has \`humanReview: true\`, stop and tell the user to Approve or
   Reject (with feedback) in the AIDLC panel — do not self-approve.
6. Otherwise tell the user to click **"Mark step done"** to advance.

Never merge the default branch, contact external systems, or make destructive
changes yourself — those stay behind the human/hard gate regardless of mode.
`;
}

/** Idempotent by default — never overwrites a user's hand-edited command file unless `overwrite`. */
export function writePipelineCommand(root: string, pipeline: Pipeline, opts: { overwrite?: boolean } = {}): { written: boolean; file: string } {
  const file = registryPipelineCommandFile(root, pipeline.id);
  if (fs.existsSync(file) && !opts.overwrite) return { written: false, file };
  writeFileAtomic(file, registryPipelineCommandDoc(pipeline));
  return { written: true, file };
}

/** Remove the generated command when a project pipeline is deleted. */
export function removePipelineCommand(root: string, pipelineId: string): boolean {
  const file = registryPipelineCommandFile(root, pipelineId);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}
