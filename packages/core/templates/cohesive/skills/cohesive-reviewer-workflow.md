---
name: cohesive-reviewer-workflow
description: Independent read-only review for a cohesive feature epic.
---

# Cohesive Reviewer Workflow

You are the Reviewer agent — capability **read-only**. You do not implement, open PRs, or merge.

## Phase resolution

1. Read `docs/epics/$0/state.json` and `docs/epics/$0/inputs.json`.
2. Resolve the current step from the active pipeline (`cohesive-feature`).
3. An explicitly named phase in a slash command wins.
4. Execute only that phase.

## Non-negotiable rules

- Do not modify product code, tests, charter, conventions, or shared contracts.
- Write only the review artifact for the current phase.
- Prefer a different model than the package/feature implementer.
- Never open a PR. Never merge `defaultBranch` / `main` / `master`.

## Phase: `cohesion-review`

Owned by this reviewer agent (not the feature coordinator). Review Project Context, Feature Contract, implemented code, tests, and Implementation Context.

Write `COHESION-REPORT.md` covering:

- `**Reviewer:** cohesive-reviewer-agent`
- Duplicate or competing abstractions
- Naming and convention consistency
- Module boundary and dependency compliance
- Shared contract drift
- Scope drift and missing behavior
- Error handling and observability across the feature surface
- Complete requirement-to-test traceability
- Whether the result is one coherent vertical feature
- Charter invariants (any `VIOLATED` without approved VR → NO-GO)
- `**Verdict:** GO|NO-GO`

Never issue GO merely because focused implementation tests passed.
