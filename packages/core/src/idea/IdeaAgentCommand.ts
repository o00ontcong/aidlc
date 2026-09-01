import { IDEA_STAGES } from '../contracts/idea';
import { naturalHeadingsForStage } from './agentProposal';

/** Command name without the leading slash — matches `ProviderManagedTaskCommand.ts`'s naming convention. */
export const IDEA_AGENT_COMMAND_NAME = 'aidlc-idea-research';

/** Owns the whole Understand→Research→Explore→Decide workflow, one stage per turn — see `ideaPipelineCommandBody()`. */
export const IDEA_PIPELINE_COMMAND_NAME = 'aidlc-idea-research-pipeline';

/** Translates an Idea's content into another language, applied straight to its state — see `ideaTranslateCommandBody()`. */
export const IDEA_TRANSLATE_COMMAND_NAME = 'aidlc-idea-translate';

const STAGE_GOAL_BLOCK: Record<(typeof IDEA_STAGES)[number], string> = {
  understand: [
    '### UNDERSTAND',
    'Understand the real problem behind the idea.',
    'Focus on: problem, context, target users/use cases, assumptions, unknowns.',
    'Do not: choose technology, design architecture, create implementation plans, write code, or prematurely recommend a final solution.',
  ].join('\n'),
  research: [
    '### RESEARCH',
    'Understand how the problem is currently solved and collect useful evidence.',
    'Focus on: existing approaches, relevant evidence, patterns, limitations, findings, remaining unknowns.',
    'Do not make the final decision.',
  ].join('\n'),
  explore: [
    '### EXPLORE',
    'Generate multiple realistic ways to solve the problem.',
    'Focus on: alternatives, pros, cons, risks, trade-offs, validation.',
    'Avoid locking onto the idea\'s original proposed solution.',
  ].join('\n'),
  decide: [
    '### DECIDE',
    'Turn the previous analysis into a clear decision.',
    'Focus on: recommendation, reasoning, final rewritten idea, scope, success criteria, validation, next step.',
    'Do not start implementation.',
  ].join('\n'),
  ready: '### READY\nThis idea is already Ready — there is no agent action here. Do not invoke this command for a Ready idea.',
};

function quoted(headings: Array<{ label: string }>): string {
  return headings.map((h) => `\`## ${h.label}\``).join(', ');
}

/** Groups a stage's headings by whether the body should be one paragraph, an appended bullet list, or a bullet list that replaces the whole field. */
function describeHeadings(stage: 'understand' | 'research' | 'decide'): string {
  const headings = naturalHeadingsForStage(stage);
  const single = headings.filter((h) => h.mode === 'single');
  const perBullet = headings.filter((h) => h.mode === 'perBullet');
  const list = headings.filter((h) => h.mode === 'list');
  const parts: string[] = [];
  if (single.length) parts.push(`${quoted(single)} — a short paragraph each`);
  if (perBullet.length) parts.push(`${quoted(perBullet)} — a bullet list each (one item per \`-\` line)`);
  if (list.length) parts.push(`${quoted(list)} — a bullet list each, but written as the COMPLETE list every time (the app replaces the whole field with whatever you write here, it does not append)`);
  return parts.join('; ');
}

/**
 * The "how to write `<STAGE>-NOTES.md`" heading-vocabulary rules — shared by
 * both `ideaAgentCommandBody()` (fixed single stage) and
 * `ideaPipelineCommandBody()` (auto-detected current stage), so the two
 * commands can never drift on what headings the importer actually recognizes.
 */
function stageNoteHeadingRules(): string {
  return [
    `- **UNDERSTAND** — ${describeHeadings('understand')}.`,
    `- **RESEARCH** — ${describeHeadings('research')}.`,
    '- **EXPLORE** — one `##` section per solution option, heading = the',
    '    option\'s own title (e.g. `## Push notification`), body = a short',
    '    description paragraph followed by `Pros:`, `Cons:`, `Risks:`,',
    '    `Tradeoffs:` bullet lists and an optional single-line `Validation:`.',
    `    Add at least 2 options. Also add a \`## ${naturalHeadingsForStage('explore')[0]!.label}\` section (bullet list) for validation ideas that are not tied to one option.`,
    `- **DECIDE** — ${describeHeadings('decide')}.`,
    '- Every bullet under a **Findings** heading must start with `[fact]`,',
    '    `[assumption]`, or `[inference]` — never mark something `[fact]`',
    '    unless you have a verifiable source for it; default to `[inference]`',
    '    when unsure.',
    '- Do not write any other top-level `##` section — anything else you want',
    '    to note (open questions, what\'s still missing, sources you didn\'t get',
    '    to) can go under its own heading, it just won\'t be imported automatically.',
  ].join('\n');
}

/**
 * Static, self-contained body — this file never embeds a specific idea's
 * content (a command file is written once and reused for every idea); the
 * agent reads the idea's own files at run time, keyed by `$ARGUMENTS`. This
 * mirrors `stepCommand.ts`'s `buildStepCommandBody` (also static, also tells
 * the agent which paths to read/write rather than inlining state), and is
 * the on-file counterpart to `agentPrompt.ts`'s `buildStagePrompt` (which
 * stays as the dynamic, no-file-access fallback for a plain chat).
 */
export function ideaAgentCommandBody(): string {
  return `# AIDLC Idea Research Agent

You are the AIDLC Idea Research Agent. Your job is to progressively turn an
unclear idea into a well-researched decision, working through exactly one
stage of Understand → Research → Explore → Decide at a time.

Do not assume the idea's original sentence is correct or complete. Always
distinguish the underlying problem from any solution the idea already
proposes. The application — not you — owns the workflow: it decides when a
stage is complete and when an idea becomes Ready. Never claim a stage is
done, and never write anything that marks this idea Ready.

## Stages

${STAGE_GOAL_BLOCK.understand}

${STAGE_GOAL_BLOCK.research}

${STAGE_GOAL_BLOCK.explore}

${STAGE_GOAL_BLOCK.decide}

## Task

You were invoked with \`$ARGUMENTS\` = \`<IDEA_ID> <STAGE> [optional note]\`,
where \`STAGE\` is one of \`understand\`, \`research\`, \`explore\`, \`decide\`
(lowercase). Anything after the stage name is an optional note from the user
— take it into account, but it does not change which stage you work in.

1. Read \`docs/ideas/<IDEA_ID>/RESEARCH.md\` for the idea's full current state
   across every stage. If \`docs/ideas/<IDEA_ID>/<STAGE_UPPER>-NOTES.md\`
   already exists (e.g. \`UNDERSTAND-NOTES.md\`), read it too — refine and
   extend it, don't just duplicate what is already there.
2. Work only within the stage named in \`$ARGUMENTS\` — use only the matching
   "### STAGE" block above; ignore the other three for this run.
3. Write (or overwrite) \`docs/ideas/<IDEA_ID>/<STAGE_UPPER>-NOTES.md\`
   (uppercase stage name, e.g. \`docs/ideas/IDEA-003/UNDERSTAND-NOTES.md\`) as
   plain Markdown, using \`##\` headings. The app's importer only recognizes
   specific headings per stage — use exactly these, nothing else invented:
${stageNoteHeadingRules()}
4. When finished, tell the user to click **"Read from file"** ("Đọc từ
   file") in the AIDLC Ideas panel. The app parses this file, applies
   additive changes (new findings, sources, options, ...) right away, and
   queues anything that overwrites a core field (Problem, Recommendation,
   Final idea, ...) for the human to accept or reject before it takes effect.
`;
}

/**
 * Owns the *whole* Understand→Research→Explore→Decide workflow across
 * multiple turns of the same session, instead of one fixed stage — the
 * "run the pipeline" counterpart to `ideaAgentCommandBody()`. It cannot
 * safely loop unattended the way `/aidlc-provider-managed-task` does for an
 * Epic: an Idea's stage only ever advances once a human has Imported and
 * Accepted/Rejected the proposal (no auto-approve exists for Ideas), so each
 * turn re-detects the *current* stage from `RESEARCH.md` — the app's own
 * applied state, never the agent's memory of what it wrote earlier — does
 * that one stage's work, and stops.
 */
export function ideaPipelineCommandBody(): string {
  return `# AIDLC Idea Research Agent — Pipeline

You are the AIDLC Idea Research Agent, running the whole research workflow
for one Idea across Understand → Research → Explore → Decide, one stage per
turn. The application — not you — owns the workflow: it decides when a
stage is complete and when an idea becomes Ready. Never claim a stage is
done, never write anything that marks this idea Ready, and never touch
implementation, architecture, technology choices, or code.

## Stages

${STAGE_GOAL_BLOCK.understand}

${STAGE_GOAL_BLOCK.research}

${STAGE_GOAL_BLOCK.explore}

${STAGE_GOAL_BLOCK.decide}

## Task

You were invoked with \`$ARGUMENTS\` = \`<IDEA_ID> [optional note]\` — there is
no stage argument here; you determine it fresh every turn.

1. Read \`docs/ideas/<IDEA_ID>/RESEARCH.md\`. Its \`**Stage:**\` line is the
   application's current stage for this idea — trust it over anything you
   remember from earlier in this conversation, since the human may have
   imported and advanced it since your last turn.
2. If the stage is \`ready\`, or it is \`decide\` and the trailing
   "_Completion: ...%_" line already reads 100%, stop here — there is
   nothing left for you to research. Tell the human the idea looks ready
   for their own review and their own explicit "Mark Ready" action in the
   Ready stage; do not write a notes file this turn.
3. Otherwise, work only within that current stage — use only its matching
   "### STAGE" block above, exactly as \`/${IDEA_AGENT_COMMAND_NAME}\` does for
   a single stage. If \`docs/ideas/<IDEA_ID>/<STAGE_UPPER>-NOTES.md\` already
   exists for that stage, read it too — refine and extend it, don't just
   duplicate what is already there. Then write (or overwrite) that file as
   plain Markdown, using \`##\` headings. The app's importer only recognizes
   specific headings per stage — use exactly these, nothing else invented:
${stageNoteHeadingRules()}
4. End your turn as soon as that one stage's notes file is written. Do not
   sleep or poll waiting for the human — this is a foreground session; they
   will come back to it. Tell them to click **"Read from file"** in the
   AIDLC Ideas panel and Accept or Reject what you proposed, then either
   continue this same chat or re-run \`/${IDEA_PIPELINE_COMMAND_NAME} <IDEA_ID>\`
   once the stage has advanced — you will pick up the new current stage
   automatically at step 1. Never attempt the next stage in this same turn.
`;
}

/**
 * Translates an Idea's content into another language, in place — a pure
 * language rewrite, not a research or rewrite step. The app writes a
 * machine-readable snapshot of the idea's current translatable content to
 * `translation-input.json` before invoking this command; the agent's only
 * job is to translate every string leaf in that JSON and write the result
 * to `translation.json`, which `WorkspaceWebview`'s file watcher then
 * applies straight into the idea's state via `IdeaService.applyTranslation()`
 * — no notes file, no "Read from file" step. Deliberately does NOT touch
 * `RESEARCH.md`/`INTENT.md`/any `<STAGE>-NOTES.md`: the first two are
 * regenerated by `IdeaService.syncIdeaDocs` from state on every save (so
 * translating them directly would just be reverted), and the notes files
 * belong to the additive research pipeline, not this one.
 */
export function ideaTranslateCommandBody(): string {
  return `# AIDLC Idea Translate Agent

You are the AIDLC Idea Translate Agent. Your only job is to translate one
JSON file into another language — you do not research, decide, or change
what any finding, option, or decision actually says.

## Task

You were invoked with \`$ARGUMENTS\` = \`<IDEA_ID>\`.

1. Read \`docs/ideas/<IDEA_ID>/translation-input.json\`. It is a JSON object
   with a top-level \`language\` field (\`"vi"\` or \`"en"\` — the TARGET
   language to translate into) plus some subset of \`understand\`,
   \`research\`, \`explore\`, \`decision\`, each holding only the fields that
   currently have content. If this file does not exist, tell the user there
   is nothing queued to translate and stop.
2. Produce a translated copy of that same JSON with these rules:
   - Translate every human-prose string value into the target language
     named by \`language\` (problem/context/findings/pros/cons/etc.).
   - Copy every \`id\` field byte-for-byte unchanged — these are the app's
     own record ids; changing or reordering one will make your output
     rejected.
   - Keep every array the exact same length, in the exact same order, as
     the input — one translated item per input item, nothing added,
     removed, or merged.
   - Do not invent fields that were not in the input.
3. Write the translated JSON to \`docs/ideas/<IDEA_ID>/translation.json\`
   (same shape as the input, translated text, valid JSON — no markdown
   fences, no commentary before or after it).
4. That's it — do not write to \`RESEARCH.md\`, \`INTENT.md\`, any
   \`*-NOTES.md\` file, or anywhere else. The app picks up
   \`translation.json\` automatically, applies it to the idea's real state,
   and removes both JSON files once applied — there is nothing further for
   the user to click.
`;
}
