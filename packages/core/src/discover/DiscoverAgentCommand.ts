/**
 * The provider command files that let an agent do one Discover step.
 *
 * The Markdown contract in these bodies is GENERATED from `DocSpec.ts` rather
 * than written out by hand, so the format the agent is told to write can never
 * drift from the format `mdParse.ts` actually reads. A command file is written
 * once and reused for every blueprint, so nothing here embeds a specific
 * project's content — the agent reads the docs itself at run time.
 */

import { DISCOVER_STEPS, DEV_DOC_PATHS, type DiscoverStepSpec, type SectionSpec } from './DocSpec';

export const DISCOVER_COMMAND_NAME = 'aidlc-discover';
export const DISCOVER_PIPELINE_COMMAND_NAME = 'aidlc-discover-pipeline';
export const DISCOVER_DEV_DOCS_COMMAND_NAME = 'aidlc-discover-dev-docs';
export const DISCOVER_SCAN_COMMAND_NAME = 'aidlc-discover-scan';

function exampleId(spec: SectionSpec): string {
  const prefix = spec.idPrefix ?? 'ID';
  return spec.grouped ? `${prefix}-<GROUP>-01` : `${prefix}-01`;
}

function describeSection(spec: SectionSpec): string[] {
  const lines: string[] = [];
  switch (spec.kind) {
    case 'prose':
      lines.push(`  - \`## ${spec.heading}\` — a short paragraph (a fenced block is fine and is kept verbatim).`);
      break;
    case 'items':
      lines.push(`  - \`## ${spec.heading}\` — bullet list, one entry per line: \`- **${exampleId(spec)}** — text\`.`);
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

function describeStep(step: DiscoverStepSpec): string {
  const lines = [`### ${step.order} · ${step.label}  (\`${step.id}\`)`, step.goal, ''];
  for (const file of step.files) {
    lines.push(`- \`<docsRoot>/${file.path}\` — \`# ${file.title}\``);
    for (const section of file.sections) { lines.push(...describeSection(section)); }
  }
  if (step.extraDir) {
    lines.push(`- \`<docsRoot>/${step.extraDir.path}/\` — one free-form \`${step.extraDir.label}\` file per decision, named \`ADR-001-<slug>.md\`, with \`## Context\`, \`## Decision\`, \`## Consequences\`.`);
  }
  lines.push('', `Done when: ${step.dod.filter((r) => r.level === 'required').map((r) => r.label).join(' · ')}.`);
  return lines.join('\n');
}

function stepCatalogue(): string {
  return DISCOVER_STEPS.map(describeStep).join('\n\n');
}

const FORMAT_RULES = [
  '1. **Ids are permanent.** Never renumber, re-letter or re-use an id. If an',
  '   entry is wrong, edit its text; if it no longer belongs, delete the whole',
  '   line/block. Its id is retired with it.',
  '2. **Only the headings listed above.** They are what the app parses. Anything',
  '   under a heading that is not listed is the user\'s own writing — leave it',
  '   exactly as it is, byte for byte, including blank lines.',
  '3. **Cite ids to link documents.** Mentioning `FR-02` anywhere in a feature,',
  '   use case, flow or phase is what records the link — there is no separate',
  '   refs syntax. Only cite ids that actually exist.',
  '4. **Never touch a pinned entry.** The app refuses those edits and will show',
  '   the user that you tried.',
  '5. **Stay inside this step\'s files.** Editing a document that belongs to',
  '   another step is reported as an out-of-scope change.',
  '6. Write in the language the existing docs are written in.',
].join('\n');

const MODE_RULES = [
  '- **The step\'s docs are empty or missing → fill.** Write every listed',
  '  section, minting ids from `01` upward. Aim to satisfy the "Done when"',
  '  line, no more: do not invent detail the earlier documents do not support.',
  '- **The step\'s docs already have content → refine.** Read them first, then',
  '  make the smallest set of changes that improves them:',
  '    - ADD entries that are missing, continuing the existing numbering;',
  '    - EDIT the text of an entry that is wrong, unclear, or contradicts a',
  '      document from an earlier step — keeping its id;',
  '    - DELETE an entry that no longer belongs.',
  '  Do not rewrite the file from scratch, and do not restate an entry that is',
  '  already fine. If you believe an entry the user wrote is wrong, say so in',
  '  your reply instead of deleting it.',
].join('\n');

export function discoverCommandBody(): string {
  return `# AIDLC Discover Agent

You turn one idea into a project blueprint: twelve steps from Idea to Project
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
   the Discover panel and either keep it or undo it; once they advance the
   step, running \`/${DISCOVER_PIPELINE_COMMAND_NAME}\` again picks the new step
   up at instruction 1. Never attempt two steps in one turn.

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
Markdown docs are never told. Your job this run is to reconcile every step's
docs against **what the project's source code actually does right now** — not
against what an earlier document claims, and not against what you remember
from a previous turn.

## Task

You were invoked with \`$ARGUMENTS\` = \`[optional note]\`.

1. Read \`.aidlc/discover/index.json\` for \`docsRoot\` (default \`docs\`) and the
   blueprint's title. Everything below is relative to that root.
2. Explore the real codebase before touching any doc: entry points, package
   manifests, routes/handlers, data models or schemas, existing tests, and any
   README. Build your own picture of what the product actually does today —
   that picture is this run's ground truth. When a document says one thing and
   the code does another, **the code wins**.
3. Go through all twelve steps below, in order, in this same turn — unlike
   \`/${DISCOVER_PIPELINE_COMMAND_NAME}\`'s one-step-per-turn rule, because code
   drift rarely stays inside one step: a new endpoint alone can touch
   Requirements, Data Model, Architecture and Tech Decisions at once. For each
   step, read its current docs (if any), then work in the mode below.
4. Never advance \`currentStep\` and never claim the blueprint is more complete
   than it is — a scan reconciles the record, it does not move the pipeline
   forward.
5. Stop. Report, step by step, what you added, changed and removed, and which
   steps you left untouched because they already matched the code.

## Fill or refine

${MODE_RULES}

One addition for a scan specifically: **do not invent detail the code does not
support.** If something is ambiguous in the code, or a document records a
decision (a "why") that has no footprint in the code either way, leave the
existing text alone rather than guessing — a scan corrects drift, it does not
rewrite intent.

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
   does not exist yet, stop and tell the user to do the Tech Decisions step
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
