---
name: define-rules
description: Turn observed SkyCast invariants into machine-readable project rules.
argument-hint: "<FOUNDATION-EPIC>"
---

# Define rules — $ARGUMENTS

Read the stack profile, `src/AGENTS.md`, and current source. Write `PROJECT-RULES.json` first with `schemaVersion: 1`, stable `ruleId`, `kind`, `scope`, `matcher`, `severity`, and only allow-listed `commandId` values. Never put shell commands in JSON.

Run `aidlc cofofo render-rules` after editing JSON. Core renders
`PROJECT-RULES.md` with its source hash and writes `RULE-DRIFT.md` from the
machine matcher; do not hand-author either result. Submit both Markdown outputs
to Canvas because rules are a human policy decision.
