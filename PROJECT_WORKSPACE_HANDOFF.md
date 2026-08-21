# Project Workspace Migration Handoff

Last updated: 2026-08-21 on macOS, from the uncommitted working tree on `main`. This document is the continuation guide for replacing the user-facing Cohesive Delivery experience with Project Workspace in the AIDLC extension.

## Goal and product model

The intended experience is:

- one shared project area containing durable context;
- separate focused task workspaces, each with its own status, artifacts, history, and review gates;
- Claude, Codex, and Cursor operating through the same checked-in workspace state;
- changes visible for human review before they are considered complete;
- parallel implementation isolated with Git branches or worktrees, then integrated and tested together by a human;
- no user-facing Cohesive Delivery or work-package/worker-board experience.

The canonical user guide is [`packages/extension/media/guides/project-workspace.md`](packages/extension/media/guides/project-workspace.md).

## What has been implemented

### Project Workspace UI

- Added a Project Overview to the extension.
- Added shared project files:
  - `AGENTS.md`
  - `PROJECT.md`
  - `STATUS.md`
  - `DECISIONS.md`
- Added initialization that creates only missing shared files and does not overwrite existing project content.
- Added direct task navigation and task status summaries.
- Reworded the extension around Project, Tasks, visible review, and provider-managed execution.
- Replaced the old extension icon filenames with:
  - `packages/extension/media/aidlc-workspace-icon.png`
  - `packages/extension/media/aidlc-workspace-activitybar.svg`

Primary implementation files:

- `packages/extension/src/v2/projectWorkspace.ts`
- `packages/extension/src/webview/components/ProjectOverview.tsx`
- `packages/extension/src/v2/workspaceWebview.ts`
- `packages/extension/src/webview/components/WorkspaceShell.tsx`
- `packages/extension/src/webview/components/AppSidebar.tsx`

### New workflow bundle

The built-in preset is now `project-workspace`, with templates under `packages/core/templates/project-workspace/`.

It exposes three focused pipelines:

| Pipeline | Purpose | Steps |
| --- | --- | --- |
| `project-context` | Establish or refresh shared project context | `establish-baseline` → `publish-context` |
| `feature-spike` | Turn a request into a reviewable implementation mission | `package-mission` |
| `feature-implement` | Implement, resolve reviewed bugs, and ship | `implement` → `resolve-bugs` → `ship` |

The extension copies these templates to `packages/extension/templates/project-workspace/` during its normal template-copy/build step.

Primary implementation files:

- `packages/core/src/presets/builtinWorkflows.ts`
- `packages/core/templates/project-workspace/`
- `packages/core/src/providers/syncPipelineCommands.ts`
- `packages/extension/src/v2/providerManagedRunCommands.ts`

The provider-level command is now `/aidlc-provider-managed-task`. It runs one already-scaffolded task through the selected provider terminal while using the task's saved pipeline checkpoint.

### Legacy cleanup and migration

`packages/extension/src/v2/legacyWorkspaceCleanup.ts` detects, hides, removes, and archives retired Cohesive assets. It covers old pipeline IDs, agents, skills, locks, templates, and Claude/Cursor/Codex/OpenCode provider command files.

The cleanup is deliberately recoverable: files removed from a user's project are archived before deletion. Repository files deleted in this branch remain recoverable through Git history.

### Removed obsolete sources

The current working tree deletes these categories:

- root Cohesive architecture, summary, UI-guide, and TODO documents;
- old `.claude/commands/cohesive-*` and autonomous-delivery command files;
- `packages/core/templates/cohesive/`;
- old work-package agents, skills, validators, and tests;
- `packages/cli/src/commands/cohesive.ts` and its recovery smoke test;
- `packages/cli/AUTOMATION.md` and stale README links to it;
- extension autonomous-delivery host commands, modal, webview library, and tests;
- old Cohesive icons and guide;
- the obsolete `v3-handoff/` prototype;
- the unused harness `MockGuide.tsx`.

The diff is intentionally deletion-heavy. At the time of this handoff it removes roughly 13,800 lines.

## Compatibility code intentionally retained

Do not remove every occurrence of the words `cohesive` or `autonomous` mechanically. Some remaining identifiers read historical workspaces so users can migrate rather than lose state.

Keep these until migration support is explicitly retired:

- `packages/core/src/migration/CohesiveDeliveryUpgradeService.ts`
- `packages/core/src/migration/cohesiveThreePipelineRemap.ts`
- legacy schema fields in `packages/core/src/schema/WorkspaceSchema.ts`
- migration fixtures in `packages/core/test/legacy-workspace-upgrade.test.ts`
- `packages/extension/src/v2/legacyWorkspaceCleanup.ts` and its tests;
- old-pipeline detection and remapping in `epicsList.ts`, sidebar filtering, and related webview compatibility logic;
- the alias that maps old preset ID `cohesive-delivery` to `project-workspace` in `getBuiltinWorkflow()`.

These references should never appear as normal new-workspace choices. They exist only to detect, hide, archive, or migrate old state.

## Known unfinished work

Work stopped during a dead-code audit. Continue from here:

1. Audit `packages/core/src/delivery/`.
   - `DeliveryOrchestrator.ts`, `DeliveryReview.ts`, and parts of `AutonomousMaster.ts` still contain the retired delivery engine and old terminology.
   - The extension and CLI entry points for Cohesive have already been removed.
   - `DeliveryStateStore` is still read by `packages/extension/src/v2/epicsList.ts` for historical delivery metadata.
   - Migration tests still exercise the old delivery state format.
   - Decide whether to keep this subsystem as migration-only code, split out the minimal reader/types, or remove the unused orchestrator/review writer and their exports/tests.
2. Rename remaining internal current-path symbols where safe.
   - Examples include `AUTONOMOUS_EPIC_MASTER_COMMAND`, `ensureAutonomousEpicMasterCommand`, and `autonomousEpicMasterCommandBody` even though their visible command is already `/aidlc-provider-managed-task`.
   - Preserve a compatibility alias only if a real importer needs it.
3. Review all remaining matches before changing them:

   ```sh
   rg -n -i "cohesive|autonomous delivery|aidlc-autonomous-delivery" \
     packages/core/src packages/extension/src packages/cli/src \
     --glob '!**/dist/**'
   ```

   Classify each match as migration compatibility, historical prose, ordinary English (for example “cohesive chunk”), or dead old behavior.
4. Run manual UI QA in an Extension Development Host.
5. Build a VSIX before committing or publishing. No version bump, changelog entry, tag, marketplace publish, or commit has been made for this work.

## Important unrelated working-tree change

`packages/extension/src/v2/astGraph/scanner.ts` contained a pre-existing user change before this migration work. It prunes dependency/vendor paths from `graph.db` after an AST scan.

Do not discard, rewrite, or attribute that file to the Project Workspace migration without reviewing it separately. If the final commit should contain only Project Workspace work, stage that file separately or leave it unstaged.

## Set up another macOS machine

### Prerequisites

- macOS with Xcode Command Line Tools (`xcode-select --install` if missing);
- Git;
- Node.js 20 or newer;
- pnpm 10.32.1, as declared by the root `packageManager` field;
- VS Code 1.85 or newer;
- a provider CLI on `PATH` for whichever provider will be tested (Claude is the default runner);
- `sqlite3` on `PATH` if testing the unrelated AST graph pruning change. macOS normally provides it.

The last successful local verification used Node `v25.9.0` and pnpm `10.32.1`. Node 20+ is the supported requirement; matching Node 25 is not required.

### Install dependencies

```sh
git clone <repository-url>
cd aidlc-custom
corepack enable
corepack prepare pnpm@10.32.1 --activate
pnpm install --frozen-lockfile
```

If the branch has already been committed, check it out normally. If transferring an uncommitted patch instead, make sure renamed/new files and deletions are all included; a plain copy of only modified files will miss the deleted Cohesive assets.

### Build

```sh
pnpm --filter @aidlc/core build
pnpm --filter aidlc-o00ontcong typecheck
pnpm --filter aidlc-o00ontcong bundle:webviews
pnpm --filter aidlc build
```

To run the full extension compile, including copying templates/tools/vendors:

```sh
pnpm --filter aidlc-o00ontcong compile
```

To produce the installable VSIX:

```sh
pnpm package:extension
```

Do not commit generated `dist/`, `out/`, copied build output, or a `.vsix` unless repository policy explicitly requires it.

## Automated verification

The following checks passed immediately before this handoff:

- core: 68 test files, 555 tests passed;
- extension: 16 test files, 94 tests passed;
- extension TypeScript and webview TypeScript typecheck passed;
- CLI TypeScript build passed;
- `.aidlc/workspace.yaml` parsed successfully.

Re-run them after continuing:

```sh
pnpm --filter @aidlc/core build
pnpm --filter @aidlc/core test
pnpm --filter aidlc-o00ontcong test
pnpm --filter aidlc-o00ontcong typecheck
pnpm --filter aidlc build
git diff --check
```

The extension tests consume the built `@aidlc/core` package. Build core before running extension tests after changing core preset metadata; otherwise extension tests may read stale `packages/core/dist` output.

## Manual Extension Development Host verification

1. Open the repository root in VS Code.
2. Choose the launch configuration **Run AIDLC Flow Extension**.
3. Press F5. Its `compile-extension` pre-launch task builds core, copies templates/tools/vendors, compiles the extension, and bundles webviews.
4. In the Extension Development Host, open the AIDLC activity-bar view.
5. Verify the title, icon, tabs, cards, and commands do not present Cohesive Delivery or Autonomous Delivery.
6. Open **Project** and initialize missing shared files.
7. Verify existing `AGENTS.md`, `PROJECT.md`, `STATUS.md`, or `DECISIONS.md` content is not overwritten.
8. Create and inspect each workflow:
   - `project-context`
   - `feature-spike`
   - `feature-implement`
9. Confirm the task detail shows artifacts, history, review state, diff/review actions, and provider selection.
10. Run a task with a provider and confirm `.claude/commands/aidlc-provider-managed-task.md` is generated instead of an autonomous-delivery command.
11. Test a fixture containing old Cohesive configuration. Confirm it is hidden from normal catalogs and the cleanup/migration action archives or migrates it without losing historical task state.
12. Reload the Extension Development Host and repeat the Project/Tasks navigation to catch stale webview bundle or persisted-state issues.

The other launch configurations contain machine-specific project paths. They are optional and may not exist on another Mac; use **Run AIDLC Flow Extension** unless those projects have also been cloned to matching locations.

## Commit checklist

Before committing:

1. Review `git status --short`; there are many intentional deletions and new untracked replacement files.
2. Decide whether the unrelated `astGraph/scanner.ts` change belongs in the same commit.
3. Confirm `packages/core/templates/project-workspace/` and all new tests/media/source files are staged.
4. Confirm `packages/core/templates/cohesive/`, old command files, old guides/icons, old CLI command, and obsolete UI files are staged as deletions.
5. Re-run the automated verification commands above.
6. Run `pnpm package:extension` and manually smoke-test the resulting VSIX if this commit is a release candidate.
7. Check staged content with:

   ```sh
   git diff --cached --stat
   git diff --cached --check
   git status --short
   ```

No commit has been created by the assistant.

## Local state outside this repository

During development, a separate local project at `/Users/cong/Project/personal/vn-stock-vectorbt-bot` was cleaned of generated Cohesive workspace elements to test the migration experience. That external project is not part of this repository diff and will not be transferred by committing this repository. Repeat cleanup/migration independently on another machine's test project if needed.
