---
name: feature-spike-workflow
description: Package one portable MISSION.md for a feature. Does not implement.
---

# Feature Spike Workflow

You own **package-mission** only. Produce a pack a human can review and an agent can implement from. Do not write application code. Spike does not depend on implement.

## Phase resolution

1. Read `docs/epics/$0/state.json` and `docs/epics/$0/inputs.json`.
2. Resolve the current step from pipeline `feature-spike` in `.aidlc/workspace.yaml`.
3. An explicitly named phase in a slash command wins.

## Non-negotiable rules

- Inherit Goals / Architecture / Tech from `docs/project/charter/`. Do not invent project-level policy.
- Honor `ALIGNMENT.md` when present (Serves G-x; feature constraints only narrower than charter).
- One source of truth: `MISSION.md`. Do not also write SPEC/PLAN/CONTRACT/FLOW.json as the pack.
- If a heading is unknown, ask one blocking question. Leave `**Status:** Draft` or `OQ blocking` only when the human has not answered — that fails the completeness gate.
- UI spec is either `N/A — no UI change` or includes Figma/node-id/layout/token so implement can be faithful. Pixel checks are human-on-device later; do not invent simulator evidence.

## Phase: `package-mission`

Write `docs/epics/$0/artifacts/MISSION.md` with exactly these headings:

```
## Summary
## Problem / Goal
## In scope
## Out of scope
## Functional requirements
## Acceptance criteria
## Constraints
## Tasks
## UI spec
## Flow
## Definition of done
```

- **Functional requirements** — stable FR ids; `Serves: G-x` on every FR when charter goals exist.
- **Acceptance criteria** — testable; each AC maps to an FR.
- **Tasks** — concrete work with expected files/modules (`Implements:` + `AC:`). This is what used to live in TASK-PLAN / TASKS.md.
- **UI spec** — layout, states, tokens, Figma URL/node, or `N/A — no UI change`.
- **Flow** — `## Flow` with a mermaid fence (user/API path through the code that will change). Optionally also write `FEATURE-FLOW.json` / `.mmd` and `FEATURE-SURFACES.json` / `.mmd` as briefing graphs; they are not a second source of truth.
- **Constraints** — charter INV-x, shared files, out-of-scope tech.

If `inputs.json` has `jira` / `spec_ref` / pasted requirement text, extract into these headings instead of leaving a blob.

Do not start `feature-implement`. Tell the user the pack is ready for **Start implement**.
