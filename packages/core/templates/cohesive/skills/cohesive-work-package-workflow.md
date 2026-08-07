---
name: cohesive-work-package-workflow
description: Execute one approved cohesive work package in an isolated branch/worktree and publish a machine-readable result for the feature coordinator.
---

# Cohesive Work Package Workflow

You are the Work Package Engineer. You implement an approved package; you do not own the feature specification or shared architecture.

## Phase resolution

1. Read `docs/epics/$0/state.json` and `docs/epics/$0/inputs.json`.
2. Resolve the current step from pipeline `cohesive-work-package`.
3. An explicitly named phase in a slash command wins.
4. Execute only that phase.

## Required inputs

`inputs.json` must contain string values:

```json
{
  "feature_id": "EPIC-123",
  "package_id": "WP-01"
}
```

The worker run id must match `<feature_id>-<package_id>`.

## Non-negotiable rules

- Use only the package assigned in the parent feature's `WORK-PACKAGES.json`.
- Use the exact Project Context and Feature Contract revisions/hashes assigned by the coordinator.
- Do not alter feature scope, architecture decisions, or read-only shared contracts.
- Do not edit another worker's run artifacts.
- Work only in the package worktree after it is prepared.
- If the contract is insufficient, create a Change Request and stop affected work.
- Treat `ownedPaths` and `writeScope` as the same boundary (prefer `ownedPaths` when present).

## Prompt contract (every implement step)

```text
Implement the tasks listed in this package according to PLAN.md and TASKS.md.
- Only modify files in ownedPaths. Do not touch protectedPaths or docs/project/charter/**.
- Follow package-test-plan: failing tests first, then implementation until green.
- Run requiredQualityGates (test, lint, typecheck) before finishing.
- Produce REVIEW-DIFF.md summarizing the real git diff.
- Stay on feature/$FEATURE-WP-x. Do not open a PR. Do not merge defaultBranch.
  Ship (open-pr / await-merge) belongs to the feature coordinator after system-test.
- If you must violate an invariant: stop and file variance-requests/VR-xxx.md instead.
```

## Phase: `load-package`

Resolve parent files under `docs/epics/<feature_id>/artifacts/`:

- `PROJECT-CONTEXT-SNAPSHOT.md`
- `SPEC.md`
- `PLAN.md`
- `TASKS.md`
- `FEATURE-CONTRACT.md`
- `WORK-PACKAGES.json`

Find exactly one package matching `package_id` and verify its `runId` equals `$0`.

Write `PACKAGE-CONTEXT.md` with:

- Feature/package identity.
- Project Context revision.
- Feature Contract revision and hash.
- Base commit.
- Package goal and assigned task IDs.
- Requirement/acceptance-criteria subset.
- Package dependencies and required result paths.
- Write scope.
- Contracts and allowed modes.
- Done conditions and tests.
- Explicit prohibited changes.

Stop if the package is not ready, a dependency result is missing/not done, or the feature contract is not frozen.

## Phase: `prepare-worktree`

Use:

- Branch: `feature/<feature_id>-<package_id>`.
- Worktree: `.aidlc/worktrees/<feature_id>/<package_id>`.
- Base: package `baseCommit` or explicitly declared integrated dependency commit.

Before creating anything:

- Check the target worktree path is either absent or already belongs to this exact branch.
- Never delete an existing unexpected worktree.
- Never reset another branch or the main workspace.

Create the branch/worktree if safe. Write `WORKTREE-STATE.json`:

```json
{
  "schemaVersion": 1,
  "feature": "EPIC-123",
  "package": "WP-01",
  "branch": "feature/EPIC-123-WP-01",
  "worktree": ".aidlc/worktrees/EPIC-123/WP-01",
  "baseCommit": "full-git-sha",
  "preparedAt": "ISO-8601"
}
```

## Phase: `package-test-plan`

- Read `PACKAGE-CONTEXT.md` and `WORKTREE-STATE.json`.
- Inside the package worktree, write **failing** tests that encode each assigned task's AC.
- Commit the red tests before any implementation commit when practical.
- Do not implement production code in this phase.

Write `PACKAGE-TEST-PLAN.md` with:

- `## Failing Tests` — list each failing test file/case and the AC it covers.
- Exact commands that currently fail (exit codes).
- Optional `**Test commit:** <full-sha>` for the failing-test commit.

## Phase: `implement-package`

- Read `PACKAGE-CONTEXT.md`, `WORKTREE-STATE.json`, and `PACKAGE-TEST-PLAN.md`.
- Perform all Git and code operations inside the package worktree.
- Execute package tasks in dependency order **after** failing tests exist.
- Keep commits small and traceable to task IDs.
- Check that changed files remain within `ownedPaths` / `writeScope`.
- Never touch `protectedPaths` or `docs/project/charter/**` without an approved VR.
- Do not open a PR. Do not merge `defaultBranch`.

Maintain `IMPLEMENT-STATE.md` with a table:

`task → status → files → tests → commit → deviation`

Write `PACKAGE-SUMMARY.md` with implemented behavior, task completion, commits, files, contract observations, deviations, and remaining work.

Write `REVIEW-DIFF.md` summarizing the **real** git diff (`git diff` / `git diff --name-only` vs package base). Include:

- Changed file list
- High-signal hunks (or pointers)
- Confirmation that every changed path is inside ownedPaths / writeScope

### Change request

If implementation requires changing a read-only contract, architecture decision, scope, or another package's write area:

1. Stop affected implementation.
2. Write `CHANGE-REQUEST.md` with evidence, affected contract/requirements/packages, proposed change, and completed/blocked work.
3. Mark the relevant task/package as `change_requested` in the summary.
4. Do not modify the parent Feature Contract.

## Phase: `package-test`

Inside the worktree, run:

- Tests required by every assigned task (the previously failing suite must now pass).
- Package-level tests.
- Applicable lint/typecheck checks.

When `PACKAGE-TEST-PLAN.md` records a `**Test commit:**`, verify that commit precedes implementation commits (ancestor / earlier in history).

Write `PACKAGE-TEST-REPORT.md` with exact commands, exit codes, task/AC coverage, failures/skips, test-first ordering note, and `**Verdict:** GO|NO-GO`.

## Phase: `package-review`

Owned by `cohesive-reviewer-agent` (see reviewer skill). Package engineer does not self-review this gate.

## Phase: `publish-result`

Read package context, worktree state, implementation state, summary, test report, and optional change request.

Write `PACKAGE-RESULT.json`:

```json
{
  "schemaVersion": 1,
  "feature": "EPIC-123",
  "package": "WP-01",
  "runId": "EPIC-123-WP-01",
  "status": "done",
  "projectContextRevision": 1,
  "featureContractRevision": 1,
  "featureContractHash": "sha256:...",
  "baseCommit": "full-git-sha",
  "branch": "feature/EPIC-123-WP-01",
  "worktree": ".aidlc/worktrees/EPIC-123/WP-01",
  "commits": ["full-git-sha"],
  "completedTasks": ["EPIC-123-T01"],
  "deferredTasks": [],
  "changedFiles": ["path/to/file"],
  "tests": [{ "command": "...", "status": "pass" }],
  "contractChanges": [],
  "deviations": [],
  "changeRequests": [],
  "completedAt": "ISO-8601"
}
```

Allowed final statuses: `done`, `deferred`, `failed`, `change_requested`.

- `done` requires all assigned tasks completed, package tests GO, and package-review GO.
- `deferred` requires explicit reasons per task.
- `change_requested` requires `CHANGE-REQUEST.md`.
- Never report a commit, test, or file that cannot be verified.
- Never open a PR or merge into `defaultBranch` from this pipeline — ship is feature-level only.
- Set `openedPullRequest` / `mergedDefaultBranch` only if true (validators reject when true).

