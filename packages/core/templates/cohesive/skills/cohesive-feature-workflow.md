---
name: cohesive-feature-workflow
description: Coordinate a cohesive feature from charter alignment through specification, packages, integration, system test, one feature PR, and post-merge project sync.
---

# Cohesive Feature Workflow

You are the Feature Coordinator. You own the common feature goal and the integrity of every artifact from specification through ship and project sync.

## Phase resolution

1. Read `docs/epics/$0/state.json` and `docs/epics/$0/inputs.json`.
2. Resolve the current step name from pipeline `cohesive-feature` in `.aidlc/workspace.yaml` and `currentStep`.
3. An explicitly named phase in a slash command wins.
4. Execute only that phase.

## Non-negotiable rules

- Inherit Goals / Architecture / Tech from `docs/project/charter/` — never invent project-level Goals, Architecture, or Tech at the epic.
- `ALIGNMENT.md` declares which charter Goals this feature serves; constraints may only be **narrower** than the charter.
- `SPEC.md`, `PLAN.md`, `TASKS.md`, and `FEATURE-CONTRACT.md` are the common source of truth for all work packages.
- A work package may execute approved work but may not redefine feature scope or shared contracts.
- Group tightly coupled tasks into one work package. Parallelism is allowed only across independent packages.
- Never let two parallel packages own the same file scope or shared contract change.
- Do not consider the feature complete when packages finish; integration, cohesion review, system test, **open-pr / await-merge**, and project sync remain mandatory.
- Ship is **one PR per feature** after system-test. Packages never open PRs or merge `main`.
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

Require `docs/project/charter/CHARTER.json` and `ALIGNMENT.md`. If charter is missing, stop with a clear error asking to run project-context `define-charter` first.

Read feature intent from `ALIGNMENT.md` (Serves Goals + Feature Contribution), `state.json`, and `inputs.json`.

Write `SPEC.md` with:

- Overview tied to the Goals listed in `ALIGNMENT.md` (do not invent new project Goals).
- User scenarios including failure/edge paths.
- `## Functional Requirements` with stable `$0-FRNN` IDs. **Every FR must include `Serves: G-x`** (one or more Goals from ALIGNMENT / CHARTER).
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

Read the charter, `ALIGNMENT.md`, context snapshot, and clarified spec. Write `PLAN.md` with:

- Technical approach and why it fits current project patterns **and TECH-POLICY**.
- Architecture/components and dependency direction (respect ARCHITECTURE-PRINCIPLES / INV-x).
- Data model/migrations where applicable.
- APIs/interfaces/events and error behavior.
- `## Shared Contract Impact`: unchanged/used/changed/new, owner and consumers.
- Compatibility and rollout/migration.
- Security, observability, and testing strategy.
- `## File Impact` with path/glob, ownership, new/modified/removed.
- `## Requirement Traceability` mapping every FR/NFR to plan sections.
- `## Charter Conformance`: table/list covering **every INV-x** — how this plan complies (or points to an approved VR).
- ADR required/not required.
- Risks and open technical decisions.

If the plan would use forbidden tech from TECH-POLICY, stop and file `variance-requests/VR-xxx.md` instead of sneaking it in.

Return to Specify/Clarify if the requested behavior is still ambiguous.

## Phase: `tasks-package`

Create `TASKS.md`. Every task must contain:

- Stable `$0-TNN` ID and name.
- Concrete work.
- Dependencies.
- `Implements: FR-x` (at least one functional requirement).
- `AC:` task-level acceptance criteria (not only spec-level AC).
- Requirements/plan sections implemented.
- Expected files/modules.
- Shared contracts used or changed.
- Done condition and tests.
- Parallel-safety note.

Respect `CHARTER.json` `deliveryBudget` (`maxTasksPerPackage`, `maxFilesPerPackage`) when grouping packages.

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
- Charter revision/hash captured in the snapshot (`**Charter Hash:**`).
- Invariants all packages must preserve.
- `## Charter Invariants` listing INV-x from the charter that apply to this feature.
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

The reviewer writes `COHESION-REPORT.md` covering:

- Duplicate or competing abstractions.
- Naming and convention consistency.
- Module boundary and dependency compliance.
- Shared contract drift.
- Scope drift and missing behavior.
- Cross-package error handling and observability.
- Complete requirement-to-test traceability.
- Whether the result is one coherent vertical feature.
- Per-invariant status (`INV-x` OK / VIOLATED). Any `VIOLATED` without an approved `variance-requests/VR-*.md` is **NO-GO**.
- `**Reviewer:** cohesive-reviewer-agent`
- `**Verdict:** GO|NO-GO`.

Never issue GO merely because packages individually passed.

## Phase: `system-test`

Read exact commands from `docs/project/context/ENGINEERING-RULES.md`, `.aidlc/cohesive-ci.json`, and `CHARTER.json` `requiredQualityGates`. Fail closed if a required gate has no runnable command.

Write `SYSTEM-TEST-REPORT.md` with:

- Integrated commit tested.
- Commands, exit codes, and concise outputs.
- Acceptance criteria exercised.
- Failures/skips with reasons.
- `**Verdict:** GO|NO-GO`.

Do not claim a command passed if it was not run.

## Phase: `open-pr`

After system-test GO, open **exactly one** pull request for the whole feature:

- Head branch: `feature/$0` (the integration branch from `integrate`).
- Base branch: `shipPolicy.defaultBranch` from CHARTER.json (usually `main`).
- Do **not** open per-package PRs.

Write `PR-LINK.md` with:

- `**URL:**` PR URL (or `(none)` only if `shipPolicy.allowLocalMergeWithHumanOnly` is enabled).
- `**Base:**` default branch.
- `**Head:**` `feature/$0`.
- `**Status:**` open.

## Phase: `await-merge`

Human merge gate. You must **not** merge into the default branch.

- Wait for human approval / merge (AI review tools may assist if `allowAiAssistReview`).
- Update `PR-LINK.md`: `**Status:**` approved|merged, and `**Merged By:**` human when merged.
- If `allowLocalMergeWithHumanOnly` is set and there is no remote PR, require `**Local Human Approval:**` yes instead of a URL.
- Never set `Merged By: agent`.

## Phase: `project-sync`

Run **only after** await-merge (PR merged or local human approval). Update **Reality** (`docs/project/context/*`) only:

- Architecture map when boundaries or flows changed.
- Domain model when vocabulary/invariants changed.
- Shared contracts when public/stable contracts changed.
- Engineering rules only for an explicitly approved new convention.
- ADRs when a durable architecture decision was introduced.

**Never** edit `docs/project/charter/**` or `docs/project/conventions/**`. Intent changes require a human amendment + rules-sync.

Write `PROJECT-UPDATE.md` with:

- `## Project Knowledge Changes` listing each canonical file changed or why no change was needed.
- Feature/integration commit and PR reference.
- Context revision before/after.
- Follow-up risks or debt.
- `## Final Feature Status` with GO/NO-GO and rationale.

If canonical context changed, update `CONTEXT-MANIFEST.json` revision, source commit, timestamp, and hashes.

