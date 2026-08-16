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
3. Write visualization manifests: `PROJECT-ARCHITECTURE.json`, `FEATURE-CATALOG.json`, `STRUCTURAL-GRAPH-MANIFEST.json`. Prefer the AST graph when available; mark inferred edges.
4. Write `docs/project/conformance/DRIFT-REPORT.md` covering every `INV-x`. Do not erase drift by editing the charter.
5. Write `CONTEXT-REVIEW.md`. Apply mechanical Required Corrections yourself to the owning context files. Re-review to `**Verdict:** GO` in the same step when possible. Do not publish while contradictions or unresolved high-impact gaps remain.

## Phase: `publish-context`

No AIDLC Approve. After baseline GO:

1. Write `docs/project/context/CONTEXT-MANIFEST.json` (`schemaVersion: 2`, integer `revision`, `sourceCommit`, per-artifact sha256).
2. Project charter + conventions into `CLAUDE.md`, `AGENTS.md`, and `.cursor/rules/aidlc-charter.mdc` with `<!-- aidlc:charter start · revision N · sha256:... -->` / `<!-- aidlc:charter end -->` markers matching `CHARTER.json`.
3. Do not edit application source. Do not rewrite Intent.
