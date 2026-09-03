/**
 * The provider command files that let an agent do one Discover step.
 *
 * The Markdown contract in these bodies is GENERATED from `DocSpec.ts` rather
 * than written out by hand, so the format the agent is told to write can never
 * drift from the format `mdParse.ts` actually reads. A command file is written
 * once and reused for every blueprint, so nothing here embeds a specific
 * project's content — the agent reads the docs itself at run time.
 */

import { DISCOVER_STEPS, DEV_DOC_PATHS, DOC_MODULES, DOC_DATA_FLOW, type DiscoverStepSpec, type SectionSpec } from './DocSpec';
import {
  DISCOVER_ADR_EXAMPLE,
  DISCOVER_DATA_FLOW_EXAMPLE,
  DISCOVER_MODULES_EXAMPLE,
  DISCOVER_WORKED_EXAMPLES,
} from './discoverExamples';
import { EXCLUDED_DIRS } from './sourceScope';
import { SCAN_BRIEF_REL_PATH, SCAN_PASSES, scanPassDocPaths, scanPassExtraDirs } from './discoverScan';

export const DISCOVER_COMMAND_NAME = 'aidlc-discover';
export const DISCOVER_PIPELINE_COMMAND_NAME = 'aidlc-discover-pipeline';
export const DISCOVER_DEV_DOCS_COMMAND_NAME = 'aidlc-discover-dev-docs';
export const DISCOVER_SCAN_COMMAND_NAME = 'aidlc-discover-scan';
export const DISCOVER_CHAT_COMMAND_NAME = 'aidlc-discover-chat';
export const DISCOVER_COMMIT_COMMAND_NAME = 'aidlc-discover-commit';

function exampleId(spec: SectionSpec): string {
  const prefix = spec.idPrefix ?? 'ID';
  return spec.grouped ? `${prefix}-<GROUP>-01` : `${prefix}-01`;
}

function describeSection(spec: SectionSpec): string[] {
  const lines: string[] = [];
  switch (spec.kind) {
    case 'prose':
      if (spec.shape === 'ascii-tree') {
        lines.push(`  - \`## ${spec.heading}\` — REQUIRED fenced \`\`\`text ASCII tree/flow. Not an essay. Missing or old-format prose here is a bug: rewrite it.`);
      } else if (spec.shape === 'mermaid-flowchart') {
        lines.push(`  - \`## ${spec.heading}\` — REQUIRED fenced \`\`\`mermaid \`flowchart TD\`. Each node is a screen. Not an ASCII tree, not an essay. Missing or old-format prose here is a bug: rewrite it.`);
      } else {
        lines.push(`  - \`## ${spec.heading}\` — a short paragraph (a fenced block is fine and is kept verbatim).`);
      }
      break;
    case 'items':
      lines.push(`  - \`## ${spec.heading}\` — bullet list: \`- **${exampleId(spec)}** — title\`, then optional indented description lines under it.`);
      break;
    case 'records':
      lines.push(`  - \`## ${spec.heading}\` — one \`### ${exampleId(spec)} — Title\` block per entry, each with:`);
      for (const field of spec.fields ?? []) {
        const shape = field.list ? `\`- **${field.label}:**\` then nested \`  - \` bullets` : `\`- **${field.label}:** value\``;
        lines.push(`      - ${shape}${field.required ? ' — required' : ''}`);
      }
      break;
  }
  if (spec.hint) { lines.push(`      ${spec.hint}`); }
  return lines;
}

function extraFileExample(path: string): string | undefined {
  if (path === DOC_MODULES) { return DISCOVER_MODULES_EXAMPLE; }
  if (path === DOC_DATA_FLOW) { return DISCOVER_DATA_FLOW_EXAMPLE; }
  return undefined;
}

function describeStep(step: DiscoverStepSpec): string {
  const lines = [`### ${step.order} · ${step.label} — ${step.labelVi}  (\`${step.id}\`)`, step.goal, ''];
  for (const file of step.files) {
    lines.push(`- \`<docsRoot>/${file.path}\` — \`# ${file.title}\``);
    for (const section of file.sections) { lines.push(...describeSection(section)); }
  }
  if (step.extraDir) {
    lines.push(`- \`<docsRoot>/${step.extraDir.path}/\` — one free-form \`${step.extraDir.label}\` file per decision, named \`ADR-001-<slug>.md\`, with \`## Context\`, \`## Decision\`, \`## Consequences\`.`);
  }
  lines.push('', `Done when: ${step.dod.filter((r) => r.level === 'required').map((r) => r.label).join(' · ')}.`);
  const example = DISCOVER_WORKED_EXAMPLES[step.id];
  if (example) {
    lines.push('', 'Write it like this (same headings and density — not this product unless it is):', '', '````markdown', example.trimEnd(), '````');
  }
  for (const file of step.files) {
    const extra = extraFileExample(file.path);
    if (!extra) { continue; }
    lines.push('', `Also \`<docsRoot>/${file.path}\`:`, '', '````markdown', extra.trimEnd(), '````');
  }
  if (step.extraDir) {
    lines.push('', 'Also one ADR, named `ADR-001-<slug>.md`:', '', '````markdown', DISCOVER_ADR_EXAMPLE.trimEnd(), '````');
  }
  return lines.join('\n');
}

function stepCatalogue(): string {
  return DISCOVER_STEPS.map(describeStep).join('\n\n');
}

function passCatalogue(): string {
  return SCAN_PASSES.map((pass) => {
    const steps = DISCOVER_STEPS.filter((s) => (pass.stepIds as readonly string[]).includes(s.id));
    const docs = scanPassDocPaths(pass.id);
    const extras = scanPassExtraDirs(pass.id);
    return [
      `## Pass ${pass.id} · ${pass.label} (\`pass=${pass.id}\`)`,
      '',
      pass.goal,
      '',
      `Write only: ${docs.map((p) => `\`${p}\``).join(', ')}${extras.length ? `; plus \`${extras.join('`, `')}/\` ADRs` : ''}.`,
      '',
      steps.map(describeStep).join('\n\n'),
    ].join('\n');
  }).join('\n\n');
}

const FORMAT_RULES = [
  '1. **Ids are permanent.** Never renumber, re-letter or re-use an id. If an',
  '   entry is wrong, edit its text; if it no longer belongs, delete the whole',
  '   line/block. Its id is retired with it.',
  '2. **Only the headings listed above.** They are what the app parses. Extra',
  '   `##` headings the user added for their own notes stay byte for byte.',
  '   Declared headings do not: if a `#` title or `##` heading does not match',
  '   the list, rewrite that file to the worked example. Old titles',
  '   (`# Features`, `# User flows`, `# Data model`, `# Tech stack`,',
  '   `# Skeleton`) are bugs, not content to preserve.',
  '3. **Cite ids to link documents.** Mentioning `FR-02` anywhere in a feature,',
  '   use case, flow or phase is what records the link — there is no separate',
  '   refs syntax. Only cite ids that actually exist.',
  '4. **Never touch a pinned entry.** The app refuses those edits and will show',
  '   the user that you tried.',
  '5. **Stay inside this step\'s files.** Editing a document that belongs to',
  '   another step is reported as an out-of-scope change. (A scan may touch',
  '   every step\'s files.)',
  '6. **Headings stay in English, exactly as listed.** Never translate a `#`',
  '   or `##` heading — those are what the app parses. Body text follows',
  '   `outputLanguage` in `.aidlc/discover/index.json` (`vi` or `en`). If the',
  '   existing body is already in a language, keep that language.',
  '7. **Write for a 10-second review.** Copy the worked example\'s shape and',
  '   density: short lines, ASCII trees inside fenced ```text blocks, screen',
  '   flow as mermaid `flowchart TD`, no essays, no extra `##` headings, no',
  '   restating an earlier step. Data / API / Storage is a general structure',
  '   — name areas, do not list every field or endpoint.',
  '8. **If you read source code at all, read it inside the declared scope.**',
  '   `scope.repos` in `.aidlc/discover/index.json` says which repos hold this',
  '   blueprint\'s code. Never treat `.aidlc/`, `.claude/`, `.cursor/`,',
  '   `.codex/` or `.opencode/` as source — they are the AI tooling\'s own',
  '   configuration, and describing them describes the tool, not the product.',
  '9. **The format above is the only valid format.** First fill, later refine,',
  '   first scan and every later scan all write the same headings and trees.',
  '   Old format is a bug. If the file on disk is the old format, rewrite it',
  '   in this run — do not leave it because "it already has content". Keep',
  '   every existing id.',
].join('\n');

const MODE_RULES = [
  '- **The step\'s docs are empty or missing → fill.** Write every listed',
  '  section, minting ids from `01` upward. Match the worked example\'s shape',
  '  and density: scannable, complete enough to review, no essays. Do not',
  '  invent detail the earlier documents do not support.',
  '- **The step\'s docs already have content → refine.** Read them first, then',
  '  make the smallest set of changes that improves them:',
  '    - ADD entries that are missing, continuing the existing numbering;',
  '    - EDIT the text of an entry that is wrong, unclear, or contradicts a',
  '      document from an earlier step — keeping its id;',
  '    - DELETE an entry that no longer belongs;',
  '    - MOVE content that sits under the wrong `##` heading onto the declared',
  '      heading; ADD any declared heading that is missing;',
  '    - If a `#` title or `##` heading does not match the list above, a',
  '      required tree is missing, or the file is an essay, rewrite that one',
  '      file to the worked example\'s shape, keeping every existing id. Old',
  '      format is a bug — do not preserve it.',
  '  Do not restate an entry that is already fine. If you believe an entry the',
  '  user wrote is wrong, say so in your reply instead of deleting it.',
].join('\n');

export function discoverCommandBody(): string {
  return `# AIDLC Discover Agent

You turn one idea into a project blueprint: twelve steps from Idea to Generate
Skeleton, each one owning a few Markdown files under the workspace's docs
root. **Those Markdown files are the source of truth** — there is no database
behind them, so what you write into them is what the project gets.

The application owns the workflow, not you. It decides when a step is done and
when the blueprint moves on. Never claim a step is complete, never edit a
document belonging to a step other than the one you were asked for, and never
create the real project code.

## Task

You were invoked with \`$ARGUMENTS\` = \`<step> [optional note]\`, where \`<step>\`
is one of: ${DISCOVER_STEPS.map((s) => `\`${s.id}\``).join(', ')}.
Anything after the step id is a note from the user — take it into account; it
does not change which step you work in.

1. Read \`.aidlc/discover/index.json\` for \`docsRoot\` (default \`docs\`) and the
   blueprint's title. Everything below is relative to that root.
2. Read the documents of every step BEFORE this one — they are the input to
   this step, and this step must not contradict them.
3. Read this step's own documents if they exist, then work in the mode below.
4. Write the files for this step, and only those.
5. Stop. Tell the user what you added, changed and removed, and anything you
   deliberately left alone. Do not start the next step.

## Fill or refine

${MODE_RULES}

## Format rules

${FORMAT_RULES}

## The steps

${stepCatalogue()}
`;
}

export function discoverPipelineCommandBody(): string {
  return `# AIDLC Discover Agent — Pipeline

Same job as \`/${DISCOVER_COMMAND_NAME}\`, except you work out the step yourself
instead of being told it — one step per turn, then stop.

## Task

You were invoked with \`$ARGUMENTS\` = \`[optional note]\`; there is no step
argument.

1. Read \`.aidlc/discover/index.json\`. Its \`currentStep\` is the application's
   current step — trust it over anything you remember from earlier in this
   conversation, since the user may have advanced the blueprint since your
   last turn. \`docsRoot\` (default \`docs\`) is where the documents live.
2. If \`currentStep\` is \`skeleton\` and that step's document already satisfies
   its "Done when" line, stop: tell the user the blueprint looks ready for
   their own review and hand-off, and write nothing this turn.
3. Otherwise do exactly that one step, following \`/${DISCOVER_COMMAND_NAME}\`'s
   rules below to the letter.
4. End your turn as soon as that step's files are written. Do not sleep or
   poll — this is a foreground session. Tell the user to review the diff in
   the Discover panel and either keep it or undo it; once they select another
   step in the rail, running \`/${DISCOVER_PIPELINE_COMMAND_NAME}\` again picks
   the new step up at instruction 1. Never attempt two steps in one turn.

## Fill or refine

${MODE_RULES}

## Format rules

${FORMAT_RULES}

## The steps

${stepCatalogue()}
`;
}

export function discoverScanCommandBody(): string {
  return `# AIDLC Discover Agent — Scan existing project

Other people commit to this repo too, so the twelve-step blueprint drifts:
someone adds a feature, changes a data model, or removes an endpoint, and the
Markdown docs are never told. Your job this run is to reconcile **one pass**
of those docs against **what the project's source code actually does right
now** — not against what an earlier document claims, and not against what you
remember from a previous turn.

A scan is three passes, each its own invocation (the host starts the next
after the human keeps this one):

- \`pass=1\` Product — Idea through User Flow
- \`pass=2\` Architecture — architecture, data, stack, folder structure
- \`pass=3\` Plan — implementation plan and skeleton

Do **only** the pass in \`$ARGUMENTS\`. Do not start the next pass yourself.

## Task

You were invoked with \`$ARGUMENTS\` of the form:

\`pass=<1|2|3> layout=<single|parent|child> repos=<path:kind,...> brief=${SCAN_BRIEF_REL_PATH} [parent=<path>] [note]\`

Those tokens are authoritative — they were written by the host from the
layout the human declared. Do not guess a different layout.

1. Read \`${SCAN_BRIEF_REL_PATH}\` **first**. It is the host-built inventory
   of this pass: the only source files you may open, the pass number, and
   the doc paths you may write. This file is the one exception to "never
   read \`.aidlc/\`". If it is missing, stop and tell the user to run Scan
   from the Discover panel (that is what writes it).
2. Read \`.aidlc/discover/index.json\` for \`docsRoot\` (default \`docs\`) and
   the blueprint's title. Every doc path below is relative to that root.
3. Explore **only the files listed in the brief**. Do not \`ls\` the workspace
   root looking for more code — that is how scans describe \`.claude/\` or
   the tooling instead of the product. When a document says one thing and
   the listed source does another, **the code wins**.
4. Go through this pass's steps below, in order, in this same turn. For each
   step, read its current docs (if any), then work in the mode below.
   **Use the same format contract as fill.** A first scan of an empty
   blueprint and a later scan of a filled one both write the headings and
   trees listed below. If a file is still on the old format, rewrite it in
   this run.
5. Stay inside this pass's files. Editing a document that belongs to another
   pass is reported as an out-of-scope change.
6. Never advance \`currentStep\` and never claim the blueprint is more complete
   than it is — a scan reconciles the record, it does not move the pipeline
   forward.
7. Stop. Report, step by step, what you added, changed and removed, and which
   steps you left untouched because they already matched the code. Report per
   source repo when there is more than one. Do not start the next pass.

## Where the code is

\`layout\` and \`repos\` in \`$ARGUMENTS\` (and the brief) list the repos whose
code you are reconciling against. Each has a \`path\` (relative to the
workspace root; \`.\` is the workspace itself) and a \`kind\` the user declared
— \`backend\`, \`frontend\`, \`mobile\`, … Those paths are the **only** places
you read source from:

- \`single\` — one repo holding its own source. The ordinary case.
- \`parent\` — this workspace is a parent repo that owns the docs while the
  code lives in the listed child repos, each its own git repo with its own
  stack. So:
    - Give **every child repo its own \`M-\` module record** in
      \`architecture/MODULES.md\`, with \`- **Folder:**\` set to its \`path\`, and
      one \`MAP-\` line in \`architecture/PROJECT_STRUCTURE.md\` citing that id.
    - Never merge two repos' stacks into one \`TECH-\` entry. Name the repo in
      the entry (\`- **Choice:** Go 1.22 + chi (backend)\`) so a reader can tell
      which repo a decision binds.
    - Keep product-level documents (Idea through User Flow / Screen Flow) about the
      **product as a whole**, not about one repo.
- \`child\` — this workspace is one child of a parent repo at
  \`parent=\`. Read that parent's \`docs/\` as the product-level input
  and do not contradict or restate it; this blueprint's job is this repo's own
  data model, architecture, stack, structure and plan.

### Never read these as source

${EXCLUDED_DIRS.map((d) => `\`${d}\``).join(', ')} — at any depth, plus
\`docsRoot\` itself and anything in \`scope.excludes\`. The brief already
omits them; do not go looking for more files outside it.

The first group is the reason this section exists: \`.aidlc/\`, \`.claude/\`,
\`.cursor/\`, \`.codex/\`, \`.opencode/\` hold the **AI tooling's** own templates,
skills and slash commands. They are configuration that happens to live in this
repo — never the product. A stack decision like "Markdown as the prompt
language" or "YAML for pipeline config" is a sign you read the scaffolding and
described the tool instead of the product. \`.aidlc/discover/snapshots/\` is
worse: it holds old copies of these very documents, and treating those as
evidence makes the scan agree with itself. \`${SCAN_BRIEF_REL_PATH}\` is the
only \`.aidlc/\` path you may read.

### Never write outside \`docsRoot\`

A source repo is **read-only** this run. A child repo commonly has its own
\`docs/\` with the same filenames as this blueprint (\`ARCHITECTURE.md\`,
\`CONTEXT.md\`); those are input you may read, never files you may edit. The
app fingerprints every source repo's git state around this run — including
layout \`single\` — and shows the user any source file you dirtied.

## Fill or refine

${MODE_RULES}

One addition for a scan specifically: **do not invent product facts the code
does not support.** If something is ambiguous in the code, or a document
records a decision (a "why") that has no footprint in the code either way,
leave that fact alone rather than guessing — a scan corrects drift, it does
not invent intent.

Format is not a product fact. If the headings, H1 title, required ASCII
trees, or the Screen flow mermaid diagram do not match the contract below, rewrite that file to the worked
example's shape in this same run, keeping every existing id. Old format is a bug.
The first scan and every later scan use this same rule.

## Format rules

${FORMAT_RULES}

Rule 5's "a scan may touch every step" is **per pass**, not the whole
pipeline: this invocation may only write the files listed for \`pass=N\`.

## The passes

${passCatalogue()}
`;
}

export function discoverChatCommandBody(): string {
  return `# AIDLC Discover Agent — Conversation

The human already has content for one Discover step and wants to talk about
it, not have you rewrite it unprompted. Open the conversation with that step
as context, then wait. **Those Markdown files are the source of truth.**

## Task

You were invoked with \`$ARGUMENTS\` = \`<step> [optional note]\`, where \`<step>\`
is one of: ${DISCOVER_STEPS.map((s) => `\`${s.id}\``).join(', ')}.
Anything after the step id is a note from the user — take it into account; it
does not change which step you discuss.

1. Read \`.aidlc/discover/index.json\` for \`docsRoot\` (default \`docs\`) and the
   blueprint's title. Everything below is relative to that root.
2. Read the documents of every step BEFORE this one — they are the input to
   this step, and this conversation must not contradict them.
3. Read this step's own documents thoroughly. That is the conversation's
   context. Also read any extra files this step owns (for example ADRs).
4. Reply with a short briefing: what this step currently records, anything
   incomplete or inconsistent with earlier steps, and one or two questions
   the human may want to discuss. Then **stop and wait**.
5. Do not write or rewrite any document on this first turn. Later, edit this
   step's files only when the human asks you to. Stay inside those files.
6. When you do edit, follow the format rules below to the letter, keep every
   existing id, and tell the user what you added, changed and removed.

## Format rules

${FORMAT_RULES}

## The steps

${stepCatalogue()}
`;
}

export function discoverDevDocsCommandBody(): string {
  return `# AIDLC Discover Agent — Development docs

You write the development-convention documents a coding agent reads before
every task, so it never has to guess the project's rules.

## Task

You were invoked with \`$ARGUMENTS\` = \`[optional note]\`.

1. Read \`.aidlc/discover/index.json\` for \`docsRoot\` (default \`docs\`).
2. Read \`<docsRoot>/architecture/TECH_STACK.md\`,
   \`<docsRoot>/architecture/ARCHITECTURE.md\` and
   \`<docsRoot>/architecture/PROJECT_STRUCTURE.md\`. If the tech stack document
   does not exist yet, stop and tell the user to do the Technical Decisions step
   first — these documents are derived from it, not invented alongside it.
3. Write these files, each as plain Markdown with a \`# \` title:
${DEV_DOC_PATHS.map((p) => `   - \`<docsRoot>/${p}\``).join('\n')}
   Ground every rule in the stack that was actually chosen — no generic advice
   that would read the same for any project, and no rule that contradicts an
   ADR under \`<docsRoot>/architecture/ADR/\`.
4. Do not touch any other document. These three files are not part of the
   twelve-step pipeline and are not parsed into items — they are prose, and the
   app keeps them as written.
5. Stop and tell the user which files you wrote.
`;
}

export function discoverCommitCommandBody(): string {
  return `# AIDLC Discover Agent — Commit everything

The human asked you to commit all local changes so they do not have to write
a message or run git themselves. Do the commit. Do not stop at a proposed
message.

## Task

You were invoked with \`$ARGUMENTS\` = \`<git-root>\` — the working tree to
commit, relative to the workspace (use \`.\` for the workspace itself).

1. \`cd\` into that directory. It is a git repo. If it is not, stop and say so.
2. Run \`git status --short\` and \`git diff HEAD\` (and \`git diff --cached\`).
   If there is nothing to commit, tell the human and stop.
3. Stage everything in that repo: \`git add -A\`.
4. Write a commit message from the staged diff:
   - Imperative mood; subject ≤72 characters.
   - Prefix \`AIDLC Discover: \` when the changes are mostly blueprint/docs
     under the Discover docs root.
   - Follow the language of the existing docs / \`outputLanguage\` in
     \`.aidlc/discover/index.json\` (\`vi\` or \`en\`).
   - No markdown fences, no quotes around the whole message.
5. Create a **new** commit with that message (\`git commit\`). Use a HEREDOC
   if the body has more than one line.
6. **Do not** push, amend, reset, rebase, force, or skip hooks.
7. Stop. Reply with the short hash and one line on what landed.
`;
}
