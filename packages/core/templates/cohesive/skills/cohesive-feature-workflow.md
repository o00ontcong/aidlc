---
name: cohesive-feature-workflow
description: Coordinate a cohesive feature from project-context snapshot through specification, work-package execution, integration, verification, and project sync.
---

# Cohesive Feature Workflow

You are the Feature Coordinator. You own the common feature goal and the integrity of every artifact from specification through final integration.

## Phase resolution

1. Read `docs/epics/$0/state.json` and `docs/epics/$0/inputs.json`.
2. Resolve the current step name from pipeline `cohesive-feature` in `.aidlc/workspace.yaml` and `currentStep`.
3. An explicitly named phase in a slash command wins.
4. Execute only that phase.

## Non-negotiable rules

- `SPEC.md`, `PLAN.md`, `TASKS.md`, and `FEATURE-CONTRACT.md` are the common source of truth for all work packages.
- A work package may execute approved work but may not redefine feature scope or shared contracts.
- Group tightly coupled tasks into one work package. Parallelism is allowed only across independent packages.
- Never let two parallel packages own the same file scope or shared contract change.
- Do not consider the feature complete when packages finish; integration, cohesion review, system test, and project sync remain mandatory.
- Feature artifacts live in `docs/epics/$0/artifacts/`.

## Phase: `capture-context`

Read the published files under `docs/project/context/` and verify `CONTEXT-MANIFEST.json` references them.

Write `PROJECT-CONTEXT-SNAPSHOT.md` with:

- `## Context Identity`: manifest revision, source commit, hashes, capture timestamp.
- `## Relevant Architecture`: only areas relevant to this feature.
- `## Relevant Domain and Contracts`.
- `## Relevant Engineering Rules`.
- `## Relevant Project Constraints`.
- `## Excluded Context`: context intentionally omitted as unrelated.
- `## Context Risks`: age, conflicting documents, or code drift noticed during capture.

Do not silently update canonical project context here.

## Phase: `specify`

Read feature intent from `state.json` title/description and `inputs.json`. If intent is empty, stop and request a meaningful brief.

Write `SPEC.md` with:

- Overview and common feature goal.
- User scenarios including failure/edge paths.
- `## Functional Requirements` with stable `$0-FRNN` IDs.
- Non-functional requirements with stable `$0-NFRNN` IDs and measurable targets.
- `## Acceptance Criteria` with stable `$0-ACNN` IDs.
- Compatibility with current project behavior/contracts.
- `## Out of Scope`.
- Open questions marked `[NEEDS CLARIFICATION: ...]`.

Describe what/why, not libraries or implementation details.

## Phase: `clarify`

- Find every clarification marker and every requirement with multiple reasonable interpretations.
- Ask closed, decision-ready questions.
- Update requirements and acceptance criteria, not only the decision log.
- Append `## Clarifications` with question, decision, decider, and affected IDs.
- Remove all unresolved clarification markers or explicitly defer them with rationale and scope impact.

## Phase: `plan`

Read the context snapshot and clarified spec. Write `PLAN.md` with:

- Technical approach and why it fits current project patterns.
- Architecture/components and dependency direction.
- Data model/migrations where applicable.
- APIs/interfaces/events and error behavior.
- `## Shared Contract Impact`: unchanged/used/changed/new, owner and consumers.
- Compatibility and rollout/migration.
- Security, observability, and testing strategy.
- `## File Impact` with path/glob, ownership, new/modified/removed.
- `## Requirement Traceability` mapping every FR/NFR to plan sections.
- ADR required/not required.
- Risks and open technical decisions.

Return to Specify/Clarify if the requested behavior is still ambiguous.

## Phase: `tasks-package`

Create `TASKS.md`. Every task must contain:

- Stable `$0-TNN` ID and name.
- Concrete work.
- Dependencies.
- Requirements/plan sections implemented.
- Expected files/modules.
- Shared contracts used or changed.
- Done condition and tests.
- Parallel-safety note.

Then group tasks into cohesive work packages and write `WORK-PACKAGES.json`:

```json
{
  "schemaVersion": 1,
  "feature": "$0",
  "projectContextRevision": 1,
  "featureContractRevision": 1,
  "featureContractHash": "pending",
  "baseCommit": "full-git-sha",
  "packages": [
    {
      "id": "WP-01",
      "name": "Cohesive package name",
      "runId": "$0-WP-01",
      "status": "ready",
      "dependsOn": [],
      "tasks": ["$0-T01"],
      "writeScope": ["path/or/glob/**"],
      "contracts": [{ "name": "ContractName", "mode": "read-only" }],
      "acceptanceCriteria": ["$0-AC01"]
    }
  ]
}
```

Grouping rules:

- Same file/module, shared contract, domain aggregate, or tightly coupled dependency → same package.
- Parallel packages must have disjoint write scopes and may not both modify one contract.
- Package dependency graph must be acyclic.
- Every task appears exactly once.
- Prefer a few cohesive packages over many tiny packages.
- `runId` must follow `$0-WP-NN`.

At this phase the contract hash remains `pending`; it is finalized by `analyze-contract`.

## Phase: `analyze-contract`

Cross-check:

`Project Context Snapshot ↔ SPEC ↔ PLAN ↔ TASKS ↔ WORK-PACKAGES`

Write `ANALYSIS.md` with coverage matrix, gaps, orphans, contradictions, package dependency review, write-scope overlap review, shared-contract review, and `**Verdict:** GO|NO-GO`.

On GO, write `FEATURE-CONTRACT.md` with:

- Feature identity, goal, project-context revision and base commit.
- Feature-contract revision.
- Invariants all packages must preserve.
- Frozen architecture decisions.
- Shared contracts with owners and allowed mutation policy.
- Domain vocabulary.
- NFRs and Definition of Done.
- Change-request protocol.
- Links to SPEC/PLAN/TASKS/WORK-PACKAGES.
- `**Status:** FROZEN`.
- `**Contract Hash:** sha256:...` computed over the contract with the hash line normalized to `pending`.

Update `WORK-PACKAGES.json` with the same feature contract revision and hash. Do not publish GO if hashes disagree.

## Phase: `await-packages`

Read every package entry in `WORK-PACKAGES.json`. For each `runId`, read:

`docs/epics/<runId>/artifacts/PACKAGE-RESULT.json`

Write `TASK-BOARD.md` derived from manifest + results. Never ask workers to edit this file.

Write `PACKAGE-RESULTS.md` containing:

- Package status and dependency table.
- Contract/context revision comparison.
- Branches and commits.
- Completed/deferred/failed tasks.
- Tests and deviations.
- Change requests.
- Merge readiness verdict.

Stop if a required package is missing, blocked, failed, stale, or has requested a contract change. A deferred package requires explicit human approval and must not hide unmet acceptance criteria.

## Phase: `integrate`

- Read `PACKAGE-RESULTS.md` and all package results.
- Determine merge order from package dependencies.
- Use a single integration branch `feature/$0` unless inputs specify an approved alternative.
- Verify every package commit exists before integrating.
- Cherry-pick package commits in dependency order by default.
- Never integrate one commit twice.
- Resolve conflicts using PLAN and FEATURE-CONTRACT; do not silently drop behavior.
- Run smoke checks after each dependency layer where practical.

Write `INTEGRATION-SUMMARY.md` with integration branch, base, merge order, commits, conflicts/resolutions, checks, rejected or deferred results, and final integrated commit.

## Phase: `integration-context`

Inspect the actual integrated diff, not only package prose. Write `INTEGRATION-CONTEXT.md` with:

- `## Planned Versus Actual`.
- Final files/modules and contracts changed.
- Package results and integration order.
- `## Cross-Package Interactions`.
- Deviations from plan and accepted change requests.
- Traceability from requirement → task → package → commit → test.
- Documentation impact.
- `## Remaining Risks`.

## Phase: `cohesion-review`

**Ownership:** `cohesive-reviewer-agent` (independent read-only reviewer — not this feature coordinator). Follow `cohesive-reviewer-workflow`. Feature agent must not author `COHESION-REPORT.md`.

The reviewer writes `COHESION-REPORT.md` with `**Reviewer:** cohesive-reviewer-agent` and `**Verdict:** GO|NO-GO`. Never issue GO merely because packages individually passed.

## Phase: `system-test`

Read exact commands from `docs/project/context/ENGINEERING-RULES.md` and repository configuration. Execute applicable lint, typecheck, unit, integration/regression, and build commands.

Write `SYSTEM-TEST-REPORT.md` with:

- Integrated commit tested.
- Commands, exit codes, and concise outputs.
- Acceptance criteria exercised.
- Failures/skips with reasons.
- `**Verdict:** GO|NO-GO`.

Do not claim a command passed if it was not run.

## Phase: `project-sync`

Update canonical project context only from the final integrated code and approved decisions:

- Architecture map when boundaries or flows changed.
- Domain model when vocabulary/invariants changed.
- Shared contracts when public/stable contracts changed.
- Engineering rules only for an explicitly approved new convention.
- ADRs when a durable architecture decision was introduced.

Write `PROJECT-UPDATE.md` with:

- `## Project Knowledge Changes` listing each canonical file changed or why no change was needed.
- Feature/integration commit.
- Context revision before/after.
- Follow-up risks or debt.
- `## Final Feature Status` with GO/NO-GO and rationale.

If canonical context changed, update `CONTEXT-MANIFEST.json` revision, source commit, timestamp, and hashes.

