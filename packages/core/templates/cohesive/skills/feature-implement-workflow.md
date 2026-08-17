---
name: feature-implement-workflow
description: Implement one feature from MISSION.md, resolve bugs, then ship one PR and sync Reality.
---

# Feature Implement Workflow

You own one independent feature epic from a complete `MISSION.md` through ship. Parallelism means multiple independent feature epics, not worker graphs inside this epic.

## Phase resolution

1. Read `docs/epics/$0/state.json` and `docs/epics/$0/inputs.json`.
2. Resolve the current step from pipeline `feature-implement` in `.aidlc/workspace.yaml`.
3. An explicitly named phase in a slash command wins.
4. Execute only that phase.

## Non-negotiable rules

- Read **only** `MISSION.md`, `docs/project/charter/`, the repo, and this epic's artifacts. Do not treat SPEC/PLAN/CONTRACT as source of truth when `MISSION.md` exists.
- Do not start this pipeline if `MISSION.md` is missing headings, still `**Status:** Draft`, or still has `OQ blocking`.
- 100% means fidelity to the pack, not zero bugs. Pixel/layout sign-off is the human on a real device — no simulator as proof.
- This epic owns `feature/$0`. Before changing a shared surface, inspect other active epics and stop for a real conflict.
- You may choose internal decomposition. Do not expose worker epics or a worker count.
- Treat `resolve-bugs` approval as the commit point for bug-driven documentation changes. Before approval, keep proposed documentation updates only in `BUG-FIX-LOG.md`.
- Open exactly one PR from `feature/$0`; never merge the default branch yourself.
- Do not copy AC text into the summary. Trace `AC-n` ids. Do not rewrite `MISSION.md` ## Flow (intent stays in the pack). Refresh `FEATURE-FLOW` / `FEATURE-SURFACES` from as-built code — that is the code map, not a second spec.

## Phase: `implement`

1. Confirm `MISSION.md` is complete (all required headings; UI spec is N/A or has Figma/layout/token; no Draft / OQ blocking).
2. Implement the Tasks and Acceptance criteria on `feature/$0`. Match UI spec when it is not N/A.
3. Run the project's quality commands (test / lint / typecheck as declared in charter / ENGINEERING-RULES).
4. Write `IMPLEMENTATION-SUMMARY.md` with:
   - what changed and which files
   - remaining risks
   - planned vs pack
   - `## Acceptance criteria results` — one line per `AC-n` from MISSION (`pass` / `fail` / `deferred` + evidence). Do **not** restate the AC prose.
   Refresh `FEATURE-FLOW.json` / `.mmd` and `FEATURE-SURFACES.json` / `.mmd` from as-built code (visualization of what landed). Leave `FEATURE-IMPACT` unless the catalog membership actually changed. Do not edit `MISSION.md`.
5. Do not open a PR in this phase.

## Phase: `resolve-bugs`

Collect one consolidated bug report from the user's consolidated report (current vs expected, repro, screenshots under `bug-screenshots/`). Previously reported bugs remain in scope.

1. Diagnose owning files/steps. Fix code and tests. Do not silently rewrite `MISSION.md` or other phase-owned Markdown yet — you must not edit those files yet.
2. Append an append-only log in `BUG-FIX-LOG.md` with `## Reported Bugs`, `## Diagnosis and Owning Steps`, `## Fixes and Verification`, `## Screenshots`, `## Documentation Sync Plan`.
3. End the round with `**Status:** READY-FOR-APPROVAL`. Do not mark the step approved yourself — wait for **Approve bản sửa** in AIDLC.
4. If the user rejects, keep the same phase, address the new report, append another round.

kind: bug_report entries in run history are in scope. The user's consolidated report is the input; do not invent bugs.

## Phase: `ship`

Run only after `resolve-bugs` is approved (or the human confirmed there were no bugs and the log records that). No AIDLC Approve on this phase.

1. Apply the approved `## Documentation Sync Plan` to the Markdown owned by affected steps.
2. Open exactly one PR `feature/$0` → charter default branch. Write `PR-LINK.md` with `**Head:**`, `**Base:**`, `**URL:**`, `**Status:**` (`open` until merged).
3. Do not merge. Ask the human to merge on GitHub (or local human-approval escape hatch when charter `allowLocalMergeWithHumanOnly` is true).
4. After merge is visible in git, update Reality only (`docs/project/context/**`, feature catalog impact). Never edit charter Intent or conventions. Write `PROJECT-UPDATE.md` with `## Project Knowledge Changes` and `## Final Feature Status`. Set `PR-LINK.md` `**Status:** merged`.
