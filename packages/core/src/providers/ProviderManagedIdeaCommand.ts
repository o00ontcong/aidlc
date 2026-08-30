export const PROVIDER_MANAGED_IDEA_COMMAND = '/aidlc-provider-managed-idea';

/**
 * The visible, provider-native owner for an Idea intake. This deliberately
 * mirrors the Epic provider-managed command: the agent owns the interactive
 * conversation and persists each checkpoint, while the extension only
 * observes the durable Idea state.
 *
 * There is no extension-side normalization step between what this agent
 * writes and what the AIDLC webview reads — `state.json` is parsed with a
 * strict Zod schema (`packages/core/src/contracts/idea.ts`) and a single
 * wrong field name or enum value makes the whole Idea fail to parse, which
 * hides it from the Ideas tab entirely even though its `docs/ideas/<id>/`
 * output already exists. Every shape below is copied verbatim from that
 * schema for exactly this reason — do not improvise field names, and do not
 * reuse a *checkpoint* name (e.g. \`route_proposed\`) as an *event* \`type\`
 * (e.g. \`route_generated\`); they are two different enums.
 */
export function providerManagedIdeaCommandBody(): string {
  return `# AIDLC Provider-managed Idea

Own Idea \`$ARGUMENTS\` in this visible provider session until it reaches a
durable route proposal, a clean close, or an actual blocker. Ask every human
question through this provider's native interaction UI. Never run hidden or
background work, and never ask the person to return to the AIDLC panel to
complete, paste, or confirm a terminal result.

## Source of truth

1. Read \`.aidlc/ideas/$ARGUMENTS/state.json\` and its \`events.ndjson\` before
   doing anything, and re-read state before every transition.
2. Read \`docs/ideas/$ARGUMENTS/\` when it exists, the CoFoFo Foundation files,
   \`AGENTS.md\`, and the relevant project source before asking questions.
3. The Idea state file and its event log are authoritative. The AIDLC webview
   watches those files and does not consume terminal output.
4. \`state.json\` is validated with a strict schema and NOT repaired or
   normalized by the extension. Never hand-author the whole file from
   scratch: parse the current JSON, change only the keys this transition
   requires, and re-serialize every other key byte-identical to what you
   read — including keys you do not recognize the purpose of.

## Native question contract

1. From \`captured\` (or a failed preparation retry), mark preparation running
   in the Idea state, then research before asking.
2. Self-answer everything supported by the project. Keep only questions whose
   answer changes scope, implementation approach, or an acceptance criterion.
   Ask at most five questions; each needs 2–4 concrete options and one
   recommended option.
3. Before displaying native questions, persist their exact question ids,
   options, self-answers, and a durable \`awaiting_human\` checkpoint in
   \`.aidlc/ideas/$ARGUMENTS/state.json\`. Append the matching audit event.
4. Ask the questions using the provider-native UI and wait in this same,
   visible terminal. When the person answers, persist selected option ids and
   the batch submission before continuing. Do not leave their answer only in
   chat history.
5. When no question survives, persist preparation as complete and write
   \`docs/ideas/$ARGUMENTS/INTENT.md\`. When questions are answered, write the
   same Intent artifact from the confirmed answers and declared assumptions.

## Routing contract

1. From \`intent_drafted\`, read the Intent artifact and classify it into the
   appropriate CoFoFo route. Do not create Epics or implement code.
2. Persist either a \`route_proposed\` state plus \`docs/ideas/$ARGUMENTS/ROUTE.md\`,
   or a \`closed\` state plus \`EVIDENCE.md\` for a non-build outcome.
3. Insert no bootstrap step based on judgment; use the Foundation freshness
   rules already recorded by the Idea state.

## Exact field shapes — copy these keys verbatim, never invent alternatives

\`prep\` (inside the top-level Idea object):

\`\`\`json
"prep": {
  "status": "running",
  "jobId": "<uuid you generated for this session>",
  "selfAnswered": [
    { "question": "...", "answer": "...", "source": "<file or command you read this from>", "flagged": false }
  ],
  "questions": [
    {
      "id": "live_execution_scope",
      "text": "...",
      "options": [
        { "id": "manual_only", "label": "...", "recommended": false },
        { "id": "semi_automated_alerts", "label": "...", "recommended": true }
      ],
      "reason": "...",
      "highImpact": false,
      "dependsOn": []
    }
  ]
}
\`\`\`

- \`status\` is one of exactly \`"idle" | "running" | "done" | "failed"\` — never
  \`"complete"\` or any other word.
- \`error\` (sibling of \`status\`) is a string when \`status\` is \`"failed"\`, and
  otherwise **omitted entirely** — never \`null\`.
- Every \`selfAnswered\` entry needs \`source\` (not \`rationale\`) and \`flagged\`
  (boolean, always \`false\` unless the human flagged it) — both required.
- Every \`questions\` entry needs \`text\` (not \`prompt\`), \`reason\`,
  \`highImpact\` (boolean), and \`dependsOn\` (array, \`[]\` if none). The
  recommended choice is a per-option \`"recommended": true\` — never a
  top-level \`"recommended": "<option id>"\` string.

\`assumptions\` (top-level array — objects, never plain strings):

\`\`\`json
"assumptions": [
  { "id": "live_execution_scope", "label": "...", "source": "agent" }
]
\`\`\`

\`routeDraft\` — **required** the moment \`checkpoint\` becomes
\`"route_proposed"\`; omitting it makes the whole Idea fail to parse:

\`\`\`json
"routeDraft": {
  "outcome": "epics",
  "steps": [
    { "recipeId": "cofofo-feature", "epicTitle": "...", "rationale": "..." }
  ]
}
\`\`\`

\`recipeId\` is one of exactly: \`cofofo-bootstrap\`, \`cofofo-refresh-context\`,
\`cofofo-update-rules\`, \`cofofo-repin-bundle\`, \`cofofo-feature\`,
\`cofofo-bugfix\`. For a non-build outcome, use \`"outcome": "close"\`,
\`"steps": []\`, and a top-level sibling \`"evidence": "<the EVIDENCE.md body>"\`
instead.

Never set \`checkpoint\` to \`"in_delivery"\` or \`"completed"\`, and never write
an \`inDelivery\` object yourself — the extension owns the scaffold step that
follows the human confirming a route in the Ideas tab.

## Event log — \`events.ndjson\`

\`type\` is a **different enum from \`checkpoint\`** — never write a checkpoint
name (e.g. \`route_proposed\`, \`intent_drafted\`) as an event \`type\`. The only
valid \`type\` values are: \`created\`, \`seed_edited\`, \`prep_started\`,
\`prep_rerun\`, \`prep_completed\`, \`prep_failed\`, \`prep_stopped\`,
\`self_answer_flagged\`, \`answer_saved\`, \`answers_reopened\`, \`batch_submitted\`,
\`decided_rest\`, \`route_failed\`, \`route_stopped\`, \`route_generated\`,
\`route_confirmed\`, \`scaffolded\`, \`closed\`, \`completed\`, \`shelved\`,
\`reopened\`, \`restarted\`. Use \`prep_completed\` for the event that ends
preparation (whether it lands on \`awaiting_human\` or skips straight to
\`intent_drafted\` because zero questions survived) and \`route_generated\` for
the event that writes \`routeDraft\` (whether the checkpoint becomes
\`route_proposed\` or \`closed\`). Each event needs a fresh \`id\` (uuid), \`at\`
(ISO timestamp), \`actor\`, and the Idea's new \`revision\` — append one line of
JSON, never rewrite an existing line.

## State-writing rules

- Keep the existing schema valid. Increment \`ideaRevision\`, update
  \`updatedAt\`, and append the matching \`events.ndjson\` event for every
  transition or saved answer.
- Preserve existing answers, audit events, and approved route information.
  Resume from the current checkpoint; never reset an Idea merely because this
  command was launched again.
- If a real error prevents progress, persist the appropriate failed or blocked
  state with the reason before reporting it. If you need a human answer, use
  the native interaction and keep the checkpoint resumable.
- Do not print \`AIDLC_RESULT_BEGIN\`, JSON handoff envelopes, or a request to
  click “Complete preparation”. The persisted Idea state is the handoff.
`;
}
