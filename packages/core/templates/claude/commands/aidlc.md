---
description: AIDLC v3 dispatcher. Usage: /aidlc <epic|project|context|gate|artifact|help|doctor|why-blocked|setup> <action> [...args]
---

# AIDLC v3 dispatcher

You are the Claude Code adapter for AIDLC v3. Do **not** recreate AIDLC state
logic in this prompt. Convert the user's request into one explicit `aidlc`
terminal command, run it from the workspace root, then use the typed JSON
result to decide what to show next.

`$ARGUMENTS` starts with a resource (`epic`, `project`, `context`, `gate`,
`artifact`, `help`, `doctor`, `why-blocked`, or `setup`) and an action. If it
is missing, show the examples below and ask the user for an explicit command.
Never guess an Epic title or approval. The CLI may derive an Epic id from the title, and the workflow compiler owns the hash.

## Command mapping

Use `--json` on every command and preserve the JSON result in your response.

| Slash invocation | Terminal command |
| --- | --- |
| `/aidlc setup [--confirm] [--force-claude-command]` | `aidlc project setup ... --json` |
| `/aidlc help [start]` | `aidlc guide-v3 help [start] --json` |
| `/aidlc doctor` | `aidlc guide-v3 doctor --json` |
| `/aidlc why-blocked <epic-id>` | `aidlc guide-v3 why-blocked <epic-id> --json` |
| `/aidlc next <epic-id>` | `aidlc epic next <epic-id> --json` |
| `/aidlc epic start [id] --title <title> [--description <text>] [--type feature|bug|refactor|spike|maintenance] [--profile quick|standard|parallel|regulated]` | `aidlc epic start [id] --title <title> ... --json` |
| `/aidlc epic status <id>` | `aidlc epic status <id> --json` |
| `/aidlc epic resume <id>` | `aidlc epic resume <id> --json` |
| `/aidlc epic run <id> [--mode guide|assist|auto|unattended] [--pack sdlc-core]` | `aidlc epic run <id> [--mode ...] --json` |
| `/aidlc epic prepare|next|explain|review|ship <id>` | `aidlc epic <action> <id> --json` |
| `/aidlc project analyze [--project-id <id>] [--source-commit <sha>]` | `aidlc project analyze ... --json` |
| `/aidlc project recommend` | `aidlc project recommend --json` |
| `/aidlc analyze-project` | `aidlc project analyze --json` |
| `/aidlc recommend` | `aidlc project recommend --json` |
| `/aidlc project context-refresh [--project-id <id>] [--source-commit <sha>]` | `aidlc project context-refresh ... --json` |
| `/aidlc context status [--source-commit <sha>]` | `aidlc context status ... --json` |
| `/aidlc context refresh [--project-id <id>] [--source-commit <sha>]` | `aidlc context refresh ... --json` |
| `/aidlc gate preview --content-summary <text> [--mode guide|assist|auto|unattended] [--epic-id <id>] [--stage <stage>] [gate flags]` | `aidlc gate preview ... --json` |
| `/aidlc gate approve|reject <epic-id> <gate-id> [--reason <text>]` | `aidlc gate <decision> <epic-id> <gate-id> ... --json` |
| `/aidlc artifact preview-commit <epic-id> <artifact-type...>` | `aidlc artifact preview-commit <epic-id> <artifact-type...> --json` |

Gate flags are `--mutation`, `--destructive`, `--merge-default-branch`,
`--external-communication <pull-request|issue|comment|email-chat|release-announcement|publish-package>`,
`--gate <kind>`, `--risk <low|medium|high|critical>`, `--destination <target>`,
and repeatable `--mutation-scope <path>`.

## Result protocol

1. Run only the mapped explicit CLI command. Do not write AIDLC state files,
   commit, push, merge, publish, create a PR, or communicate externally as a
   substitute for a command result.
2. Read the result's `status`, `data`, `nextAction`, `warnings`, `evidence`,
   `recoveryActions`, and `error` fields. Summarize them accurately.
3. For `status: "ok"`, present `nextAction` when present. A next action is a
   suggestion, not authorization to run another command automatically.
4. For `status: "waiting-for-user"`, `"blocked"`, or `"error"`, stop. Show
   recovery actions and request an explicit user choice.
5. A `gate.preview` result with `requiresApproval: true` is a hard pause:
   show destination, content summary, mutation scope, risk, and reason; wait
   for the user's explicit approval. In particular, external communication,
   destructive changes, and default-branch merges are never auto-approved.
6. `artifact preview-commit` only lists policy-eligible artifacts. It does not
   authorize staging or committing anything. Ask for a separate explicit
   command before any Git operation.
7. `project setup` without `--confirm` is preview-only. Only apply after the
   user explicitly asks to confirm.

## Examples

```text
/aidlc help start
/aidlc setup --confirm
/aidlc project analyze
/aidlc context refresh --source-commit HEAD
/aidlc epic start PAY-101 --title "Add decimal-safe P&L" --profile regulated
/aidlc epic run PAY-101 --mode assist
/aidlc epic status PAY-101
/aidlc why-blocked PAY-101
/aidlc gate preview --epic-id PAY-101 --mode unattended --external-communication pull-request --destination "aidlc-io/aidlc" --content-summary "Open PR for PAY-101" --mutation-scope packages/core
/aidlc artifact preview-commit PAY-101 specification review-log
```
