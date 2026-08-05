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

## Phase: `implement-package`

- Read `PACKAGE-CONTEXT.md` and `WORKTREE-STATE.json`.
- Perform all Git and code operations inside the package worktree.
- Execute package tasks in dependency order.
- Write tests alongside each behavior change.
- Keep commits small and traceable to task IDs.
- Check that changed files remain within write scope.

Maintain `IMPLEMENT-STATE.md` with a table:

`task → status → files → tests → commit → deviation`

Write `PACKAGE-SUMMARY.md` with implemented behavior, task completion, commits, files, contract observations, deviations, and remaining work.

### Change request

If implementation requires changing a read-only contract, architecture decision, scope, or another package's write area:

1. Stop affected implementation.
2. Write `CHANGE-REQUEST.md` with evidence, affected contract/requirements/packages, proposed change, and completed/blocked work.
3. Mark the relevant task/package as `change_requested` in the summary.
4. Do not modify the parent Feature Contract.

## Phase: `package-test`

Inside the worktree, run:

- Tests required by every assigned task.
- Package-level tests.
- Applicable lint/typecheck checks.

Write `PACKAGE-TEST-REPORT.md` with exact commands, exit codes, task/AC coverage, failures/skips, and `**Verdict:** GO|NO-GO`.

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

- `done` requires all assigned tasks completed and package tests GO.
- `deferred` requires explicit reasons per task.
- `change_requested` requires `CHANGE-REQUEST.md`.
- Never report a commit, test, or file that cannot be verified.

