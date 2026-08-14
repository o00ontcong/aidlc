---
name: cohesive-feature-workflow
description: Deliver one independent feature epic end to end: alignment, specification, implementation, verification, one PR, and project sync.
---

# Cohesive Feature Workflow

You own one independent feature epic from charter alignment through ship and
project sync. Parallelism in AIDLC means multiple **independent feature epics**
can run at the same time. It never means that the user must create, schedule, or
wait for worker/work-package epics inside this feature.

## Phase resolution

1. Read `docs/epics/$0/state.json` and `docs/epics/$0/inputs.json`.
2. Resolve the current step from pipeline `cohesive-feature` in `.aidlc/workspace.yaml`.
3. An explicitly named phase in a slash command wins.
4. Execute only that phase.

## Non-negotiable rules

- Inherit Goals / Architecture / Tech from `docs/project/charter/`; never invent project-level policy in an epic.
- `ALIGNMENT.md`, `SPEC.md`, `PLAN.md`, `TASKS.md`, and `FEATURE-CONTRACT.md` are this epic’s source of truth.
- This epic owns its own feature branch, files, contracts, tests, PR, and artifacts. Before changing a shared surface, inspect other active epics and stop for a real conflict rather than silently overlapping work.
- You may choose internal decomposition, tools, or subagents when useful. Do not expose that as user-managed workers, a worker count, package board, worktree graph, or a gate between this epic’s phases.
- Do not consider implementation complete until cohesion review, system test, **open-pr / await-merge**, and project sync pass.
- Open exactly one PR from `feature/$0`; never merge the default branch yourself.

## Phase: `capture-context`

Read the published project-context files and write `PROJECT-CONTEXT-SNAPSHOT.md` with `## Context Identity`, relevant architecture/domain/contracts/rules, excluded context, and context risks. Do not update canonical context here.

## Phase: `specify`

Use `ALIGNMENT.md`, charter, snapshot, state, and inputs. Write `SPEC.md` with overview tied to charter goals, scenarios, stable FR/NFR/AC ids, a `Serves: G-x` on every FR, compatibility, out-of-scope, and decision-ready clarification markers.

## Phase: `clarify`

Resolve ambiguous requirements, update the affected FRs/ACs, and append `## Clarifications` with question, decision, decider, and affected ids. Do not leave unresolved ambiguity hidden in implementation.

## Phase: `plan`

Write `PLAN.md` covering technical approach, architecture, contracts, file impact, rollout, security, observability, testing, requirement traceability, and charter conformance for every applicable `INV-x`. Raise an approved variance request rather than using forbidden tech.

## Phase: `plan-tasks`

Write `TASKS.md`. Every task needs a stable `$0-TNN` id, concrete work, dependencies, `Implements: FR-x`, task-level `AC:`, expected files/modules, tests, and done condition. This is a delivery plan for **this one epic**, not instructions to create worker epics or a parallelism setting.

## Phase: `analyze-contract`

Cross-check `Project Context Snapshot ↔ SPEC ↔ PLAN ↔ TASKS`. Write `ANALYSIS.md` with coverage, gaps, contradictions, file/contract impact, and `**Verdict:** GO|NO-GO`.

On GO, write frozen `FEATURE-CONTRACT.md` containing goal, context/base identity, revision, charter hash, `## Invariants`, `## Charter Invariants`, `## Shared Contracts`, domain vocabulary, NFRs, `## Definition of Done`, `## Change Request Protocol`, links to SPEC/PLAN/TASKS, `**Status:** FROZEN`, and a normalized `**Contract Hash:** sha256:...`.

## Phase: `map-feature-flow`

Create Level 3 of the Architecture Explorer for **this one feature**, not a repository-wide graph.
Start at a real user/API/event entry point, then follow only the observed or explicitly inferred path through presentation, domain, data, and external boundaries. Prefer the static AST graph where available; mark an edge `inferred` if evidence is indirect.

Write `FEATURE-FLOW.json`:

```json
{"schemaVersion":1,"featureId":"auth","title":"Login flow","nodes":[{"id":"login-view","label":"LoginView","kind":"view","layer":"presentation","file":"features/auth/LoginView.swift","symbol":"LoginView","role":"Captures credentials"}],"edges":[{"source":"login-view","target":"login-view-model","label":"submit","confidence":"observed"}]}
```

Each node needs an id, readable label, layer, workspace-relative `file`, and a one-line role. Keep it to the human-comprehensible participants in this feature flow; link to source instead of embedding source code. Then write matching `FEATURE-FLOW.mmd` Mermaid `flowchart` or `sequenceDiagram` source.

## Phase: `implement`

Implement the complete feature on branch `feature/$0` according to the frozen contract and task plan. Run focused tests as you work. Write `IMPLEMENTATION-SUMMARY.md` with completed tasks, changed files/contracts, test commands/results, deviations/approved variances, and the implementation commit. Do not open a separate worker/package epic or PR.

## Phase: `implementation-context`

Inspect the actual diff and write `IMPLEMENTATION-CONTEXT.md` with `## Planned Versus Actual`, `## Implemented Behavior`, changed modules/contracts, `## Requirement Traceability`, documentation impact, and `## Remaining Risks`.

## Phase: `cohesion-review`

This phase is owned by `cohesive-reviewer-agent`, not you. The reviewer produces `COHESION-REPORT.md`; do not author your own approval.

## Phase: `system-test`

Read exact quality commands from project context, `.aidlc/cohesive-ci.json`, and `CHARTER.json`. Run required commands and write `SYSTEM-TEST-REPORT.md` with commit, commands, exit codes, AC coverage, failures/skips, and `**Verdict:** GO|NO-GO`.

## Phase: `open-pr`

After system-test GO, open one PR from `feature/$0` to the charter’s default branch. Write `PR-LINK.md` with URL, base, head, and `**Status:** open`.

## Phase: `await-merge`

Do not wait merely for a human approval. Read the checked-in `shipPolicy`:

- when it permits an agent merge, merge the feature PR with the repository's
  configured tooling, verify the branch is reachable from the base branch, and
  record the actual merged status in `PR-LINK.md`;
- when it forbids an agent merge, ask one explicit question to change that
  policy. Never invent a human approval or a merged status.

## Phase: `project-sync`

After merge, update Reality in `docs/project/context/*` only. Never edit charter Intent or conventions. Write `PROJECT-UPDATE.md` with `## Project Knowledge Changes`, PR/commit reference, context revision before/after, risks, and `## Final Feature Status`. Update `CONTEXT-MANIFEST.json` if canonical context changed.
