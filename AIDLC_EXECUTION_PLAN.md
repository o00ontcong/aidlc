# AIDLC Redesign — Execution Plan

**Baseline:** `9da9121` plus the current coordinator worktree. W0, W1B–W1I, W2A, W2C, W2D, W2F command-surface parity, W4C and Claude template install meet their focused acceptance tests. W1A remains partial until a multi-process event/projection stress test closes the final concurrency gate.

## Phase 1 — Finish the Wave 1 seams

1. Close W1A with a multi-process stress test covering event-id allocation plus Epic/Run projection CAS as one recoverable transaction.
2. Keep the acyclic import-graph/public-boundary test green as Wave 2 clients are integrated.
3. Keep the now-complete W1B–W1I focused suites green.

**Exit gate:** A core-only test fixture can create, compile, run, pause, recover and resume a unified Epic using provider, capability, autonomy and artifact policies.

## Phase 2 — Build the application boundary (Wave 2)

1. Extend W2B migration from preserved legacy source references to imported append-only audit history.
2. Complete W2E/W2I canonical CLI cutover (`aidlc epic` aliases) after the migration window while preserving `*-v3` deprecation aliases.
3. Keep W2F Claude `/aidlc` setup/help/doctor/why-blocked/run --mode parity green; template installs via `project.setup`.
4. Add typed state subscriptions to W2G and CLI-level deterministic fixtures to W2H.
5. Keep W2C packs, W2D validator locks and the shared application-command routing matrix green.

**Exit gate:** the same command payload produces equivalent results through in-memory test adapter, CLI and Claude command.

## Phase 3 — Implement the Extension v3 (Wave 3)

1. Finish acceptance coverage for the existing typed shell, Home, Epics and Guide views.
2. Connect Studio artifact-policy editing and provider configuration to validated application payloads.
3. Feed real artifact/AST-analysis projections into the existing contextual capability surfaces.
4. Complete state subscriptions and W3I manual Extension workflow verification without moving orchestration into the webview.

**Exit gate:** an Epic can be created, approved, resumed and reviewed from the Extension with the same durable state as CLI.

## Phase 4 — Migration and release readiness (Wave 4)

1. Complete legacy UI/banner/deprecation compatibility and migration audit import (W4A–W4B).
2. Add the W1A multi-process transaction stress test plus large-repo/AST non-blocking budgets (W4D); keep completed W4C policy checks green.
3. Finish canonical guides, changelog, clean-room install and manual CLI/Claude/VSIX smokes (W4E–W4F).

**Final exit gate:** all W0–W4 TODO checkboxes are `[x]`; core/CLI/extension tests pass; VSIX packages successfully; migration preview/apply/rollback and end-to-end fixtures pass from a clean workspace.
