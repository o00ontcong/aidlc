---
name: project-context-workflow
description: Establish and publish the canonical project charter + context consumed by feature spike and implement.
---

# Project Context Workflow

You are the Project Context Curator. Execute exactly the current pipeline phase.

## Phase resolution

1. Read `docs/epics/$0/state.json` when `$0` is available.
2. Resolve the current step from pipeline `project-context` in `.aidlc/workspace.yaml`.
3. A slash command may state the phase explicitly; that explicit phase wins.
4. Read `docs/epics/$0/inputs.json` for optional focus paths or linked repositories.

## Global rules

- Treat repository code, configuration, tests, ADRs, and maintained documentation as evidence.
- Label an inference as an inference. Never present a folder name alone as proof of an architecture rule.
- Record exceptions and legacy areas instead of forcing them into a clean but false model.
- Do not modify application source code in this pipeline.
- **Intent** lives under `docs/project/charter/**` and `docs/project/conventions/**` — human-owned; agents must not silently rewrite Intent to match Reality.
- **Reality** lives under `docs/project/context/**` — agent-scanned description of the repo as it is.
- **Conformance** lives under `docs/project/conformance/**` — drift and amendments.
- Do not create placeholder-only artifacts.

## Phase: `establish-baseline`

Do charter, scan, model, map-features, drift, and review **in this one step**. Stop at `CONTEXT-REVIEW.md` with `**Verdict:** GO`. Do not publish the manifest here.

### Charter — Mode A / Mode B

Read `inputs.json.context_mode` before choosing a mode:

- Missing / `interactive` → interview the human **1:1** (Mode A) and write confirmed Intent.
- `inferred-existing` → run evidence-based autonomous discovery (Mode B). Do not ask questions or wait for a reply.

#### Mode B — existing-project inference / refresh

Use this mode only when `inputs.json.context_mode` is `inferred-existing`.

1. Inspect maintained evidence: README/docs/ADRs, source/module boundaries, manifests, dependencies, CI, tests, CODEOWNERS, release/branch configuration, infrastructure, rule files, and recent Git history.
2. If a valid charter already exists and `context_operation` is `refresh`, keep Intent byte-for-byte unchanged. Validate it and record that it was reused.
3. Otherwise create a conservative provisional charter from repository evidence (`status: provisional`, every inferred Goal/Invariant/Tech Rule cites `sources` + `confidence`).
4. Write `CHARTER-DISCOVERY.md` with `## Discovery Mode`, `## Evidence Sources`, `## Observed Facts`, `## Inferred Goals`, `## Inferred Invariants`, `## Unknowns`, and `## Discovery decisions`.
5. **Never treat an existing GO baseline as done.** Re-scan Reality every run. If `SCREEN-CATALOG.json` has no `transitions[]` (parent/tab/flow tree only), that catalog is **invalid** — rebuild it. File existence, an unchanged git SHA, and `**Verdict:** GO` are not reasons to skip visualization.

#### Mode A — interview

The Start Epic **Description** is only a seed idea — **not** the charter.

1. Read `inputs.json.idea`. Ensure seeded templates exist under `docs/project/charter/**` and `docs/project/conventions/CONVENTIONS.md`.
2. Ask **one question at a time**. Cover product/outcome (Goals `G-x` + metric), non-goals, boundaries (`INV-x`), tech policy (`T-x`), quality bar, and ship policy.
3. Log Q&A in `CHARTER-DISCOVERY.md` including `## Discovery decisions`.
4. Write `NORTH-STAR.md`, `ARCHITECTURE-PRINCIPLES.md`, `TECH-POLICY.md`, `CHARTER.json`, and `CONVENTIONS.md`. Do not invent Goals the human did not confirm.

### Scan, model, map, drift, review

After Intent exists:

1. Write `docs/project/context/PROJECT-SCAN.md` with `## Repository Structure` and `## Quality Commands`.
2. Write canonical Reality: `PROJECT-CONTEXT.md`, `ARCHITECTURE-MAP.md`, `DOMAIN-MODEL.md`, `SHARED-CONTRACTS.md`, `ENGINEERING-RULES.md`.
3. Write visualization files at these exact paths (JSON is the machine model; mermaid is the human graph — both required):
   - `docs/project/context/visualization/PROJECT-ARCHITECTURE.json` + `PROJECT-ARCHITECTURE.mmd`
   - `docs/project/context/visualization/FEATURE-CATALOG.json` + `FEATURE-CATALOG.mmd`
   - `docs/project/context/visualization/SCREEN-CATALOG.json` + `SCREEN-CATALOG.mmd`
   - `docs/project/context/visualization/STRUCTURAL-GRAPH-MANIFEST.json`
   Prefer the AST graph when available; mark inferred edges. Every architecture layer/node needs `id` plus `label` or `name`. Edges use `source`/`target`.
   Draw **two** feature trees for comparison — both required, both live only under `docs/project/context/visualization/`:
   - `FEATURE-CATALOG.json` + `.mmd` — **code structure**: every product feature as modules/packages/folders organize it. Nest with `parent` and/or `area` / `module` (iOS, API, CoreAuth, …). Root is `APP`. Evidence is source/module files. The `.mmd` is `flowchart TD`: APP → area/module → feature → sub-feature.
   - `SCREEN-CATALOG.json` + `.mmd` — **full navigation graph** (directed, possibly cyclic, multi-entry, multi-path — not a tree). Build it with the **Screen navigation discovery** procedure below. Never infer from folders, tabs, or package names alone.
     - `screens[]`: `id`, `name`, `evidence` (View/route/NavDestination file), `confidence`; optional `kind` (`screen|sheet|modal|tab|drawer|overlay`), `featureRef`, `tab` / `flow` (visual grouping only — **not** a substitute for transitions), optional `parent` only when presentation binding has no imperative handler.
     - `transitions[]`: one row per **distinct navigable edge** — `source`, `target`, `evidence` (file:line or symbol), `confidence`; optional `trigger`, `kind` (`push|replace|pop|tab|sheet|modal|drawer|deeplink|notification|redirect|back`), `condition` (guard / branch predicate when it changes destination), optional `id` when the same pair has multiple triggers.
     - `roots[]`: screens with no normal incoming edge (default tab, `/`, post-splash).
     - `discovery`: required when `screens.length >= 3` — documents how the graph was built: `method`, `routeSources[]`, `entryPoints[]` (`target`, `kind`: `coldStart|deeplink|notification|auth-guard|middleware|external`), `passes` (what was scanned), `unknowns[]` (dynamic routes, runtime strings, unreadable generated code).
     - `.mmd`: `flowchart TD` — every screen node, every transition edge (label = `trigger` or `condition`). Use Mermaid `subgraph` by `tab`/`flow` only for layout when there are many screens; **do not** replace missing edges with subgraph containment.

     #### Screen navigation discovery (required)

     Real apps have **many** paths — reconvergence, cycles, auth redirects, tabs, modals, deep links. A password/settings slice is only an illustration; your job is the **whole reachable graph**.

     **Pass 1 — Route & screen inventory**
     1. Collect every screen definition: route tables, `NavGraph`, router config, screen enums, path constants, storyboard segues, coordinator maps.
     2. Use **ast-graph** when available: `search` (Route, Screen, Destination, Coordinator, NavHost, NavigationPath), `routes` (web), `symbol` on app entry / root navigator.
     3. Seed `screens[]` from definitions — one node per user-visible destination (not every layout wrapper).

     **Pass 2 — Outbound scan (closure)**
     1. Maintain a queue of screen ids. For each screen file, find **every** outbound navigation:
        - Declarative: `Link` / `NavigationLink` / `NavLink` / `href`, destination bindings, storyboard segues.
        - Imperative: `navigate` / `push` / `replace` / `present` / `show` / `go` / `router.push`, coordinator calls, `startActivity`, `Navigator.pushNamed`.
        - Presentation: sheet / modal / fullScreenCover / dialog / bottom-sheet content views.
        - Tab / drawer selection that swaps the visible root.
     2. Resolve each call to a target screen id (follow imports, route constants, enum cases). Add a `transitions[]` row per edge with evidence.
     3. Enqueue targets not yet scanned. **Repeat until the queue is empty** — do not stop after one hop or one feature area.

     **Pass 3 — Entry & implicit navigation**
     Add transitions or `discovery.entryPoints[]` for paths that never appear as a button on another screen:
     - Cold start / splash / default route / initial tab.
     - Deep links, universal links, intent filters, URL schemes.
     - Push notifications, in-app message taps.
     - Auth / session guards (`useEffect` redirect, `beforeEnter`, 401 interceptor, `if !loggedIn`).
     - Logout / session expiry / role change replacing the stack.
     - External return (payment callback, OAuth redirect).

     **Pass 4 — Coverage & honesty**
     - Any screen that is neither `roots`, nor `discovery.entryPoints[].target`, nor any `transitions[].target`, nor a documented sheet `parent` → you missed an entry path; keep scanning.
     - Hubs (settings, home, profile) often have **many** outgoing edges — list each trigger separately.
     - Same target from many sources → **many** transition rows (not one edge, not a folder group).
     - Dynamic / runtime route strings → include with `confidence: medium|low` and explain in `discovery.unknowns`.
     - Record `discovery.passes` and unresolved items; do not silently drop “small” or “rare” screens.

     Log navigation gaps in `PROJECT-CONTEXT.md` (## Navigation coverage) when evidence is incomplete.

     **Do not skip regeneration:** if `SCREEN-CATALOG.json` lacks `transitions[]` (legacy parent/tab/flow tree only), you MUST rebuild it via Screen navigation discovery **even when** other baseline files exist, git is unchanged, and `CONTEXT-REVIEW.md` is already GO. Passing file-existence checks alone is not enough.
   Each catalog node: `id`, `name`, `evidence`, `confidence`. Do not flatten to `APP → feature` / `UI → screen` and do not drop small screens or small features. Do not put these graphs under `docs/epics/*/artifacts/`.
4. Write `docs/project/conformance/DRIFT-REPORT.md` covering every `INV-x`. Do not erase drift by editing the charter.
5. Write `docs/project/context/CONTEXT-REVIEW.md` with `## Summary` (1–2 paragraphs a human can read: what this product/repo is, who it serves) then the GO/NO-GO body. Apply mechanical Required Corrections yourself to the owning context files. Re-review to `**Verdict:** GO` in the same step when possible. Do not publish while contradictions or unresolved high-impact gaps remain.

`PROJECT-CONTEXT.md` is the long evidence. `CONTEXT-REVIEW.md` `## Summary` is the human briefing. Graph files live only under `docs/project/context/visualization/`.

## Phase: `publish-context`

No AIDLC Approve. After baseline GO:

1. Write `docs/project/context/CONTEXT-MANIFEST.json` (`schemaVersion: 2`, integer `revision`, `sourceCommit`, per-artifact sha256 of Reality markdown + JSON). `PROJECT-ARCHITECTURE.mmd`, `FEATURE-CATALOG.mmd`, and `SCREEN-CATALOG.mmd` must already exist beside their JSON from `establish-baseline`; do not write them under `docs/epics/`.
2. Project charter + conventions into `CLAUDE.md`, `AGENTS.md`, and `.cursor/rules/aidlc-charter.mdc` with `<!-- aidlc:charter start · revision N · sha256:... -->` / `<!-- aidlc:charter end -->` markers matching `CHARTER.json`.
3. Do not edit application source. Do not rewrite Intent.
