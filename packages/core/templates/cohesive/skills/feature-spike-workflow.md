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

## Human briefing — one owner per question

Do **not** recreate SPEC.md, PLAN.md, FEATURE-CONTRACT.md, or a second AC list. Each artifact answers a different question:

| Human reads | Canonical owner | Not a second story |
|---|---|---|
| What / why / AC / tasks / UI | `MISSION.md` only | Do not also write SPEC/PLAN/CONTRACT |
| User/API path through code that will change | `MISSION.md` `## Flow` mermaid **and** `FEATURE-FLOW.mmd` (same diagram) + `FEATURE-FLOW.json` (nodes/files for Explorer) | JSON is structure, mermaid is the picture |
| Which systems this epic touches | `FEATURE-SURFACES.json` + `.mmd` | Not in MISSION |
| Catalog add / modify / delete | `FEATURE-IMPACT.json` + `.mmd` vs `FEATURE-CATALOG.json` | Not a flow graph |

## Non-negotiable rules

- Inherit Goals / Architecture / Tech from `docs/project/charter/`. Do not invent project-level policy.
- Honor `ALIGNMENT.md` when present (Serves G-x; feature constraints only narrower than charter).
- One source of truth: `MISSION.md`. Do not also write SPEC/PLAN/CONTRACT as the pack.
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

- **Summary** — 1–2 paragraphs a human can read without opening other files.
- **Functional requirements** — stable FR ids; `Serves: G-x` on every FR when charter goals exist.
- **Acceptance criteria** — testable; each AC has an `AC-n` id **or** Given/When/Then **or** a Criterion table; each AC maps to an FR. Never “should work well”.
- **Tasks** — concrete work with expected files/modules (`Implements:` + `AC:`).
- **UI spec** — layout, states, tokens, Figma URL/node, or `N/A — no UI change`.
- **Flow** — mermaid fence of the user/API path through the code that will change. Copy that **same** mermaid into `FEATURE-FLOW.mmd`. Also write `FEATURE-FLOW.json` (`schemaVersion: 1`, `featureId`, nodes with `id`/`label`/`file`, edges). Do not invent a different flow in JSON.

Also write (required, not optional):

- `FEATURE-SURFACES.json` + `FEATURE-SURFACES.mmd` — web/mobile/desktop/api/worker/sdk/external nodes; edges `http|sdk|event|webhook|internal`. External nodes must not invent a workspace `file`.
- `FEATURE-IMPACT.json` + `FEATURE-IMPACT.mmd` — vs `docs/project/context/visualization/FEATURE-CATALOG.json`. Each feature `change`: `add|modify|delete|unchanged`. At least one add/modify/delete. `modify`/`delete` ids must exist in the catalog; `add` ids must not.

If `inputs.json` has `jira` / `spec_ref` / pasted requirement text, extract into these headings instead of leaving a blob.

Do not start `feature-implement`. Tell the user the pack is ready for **Start implement**.
