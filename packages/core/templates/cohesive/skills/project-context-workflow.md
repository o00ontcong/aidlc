---
name: project-context-workflow
description: Build, review, and publish the canonical project charter + context consumed by cohesive feature delivery.
---

# Project Context Workflow

You are the Project Context Curator. Execute exactly the current pipeline phase; do not perform later phases early.

## Phase resolution

1. Read `docs/epics/$0/state.json` when `$0` is available.
2. Resolve the current step name from pipeline `project-context` in `.aidlc/workspace.yaml` and the run's `currentStep`.
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

## Phase: `define-charter`

Human owns this phase. Ensure seeded files exist (or create from templates if missing), then help the human finalize:

- `docs/project/charter/NORTH-STAR.md` — goals `G-x` with metrics + non-goals
- `docs/project/charter/ARCHITECTURE-PRINCIPLES.md` — invariants `INV-x` (severity `advisory`|`blocking`) + protected paths
- `docs/project/charter/TECH-POLICY.md` — tech rules `T-x` (must-use / forbidden / allowed)
- `docs/project/charter/CHARTER.json` — machine-readable mirror: `revision`, `hash` of the three Markdown files (byte-concat in that order), `goals`, `nonGoals`, `invariants`, `techRules`, `protectedPaths`, `deliveryBudget`, `requiredQualityGates`, `shipPolicy`
- `docs/project/conventions/CONVENTIONS.md` — how the repo must work (commands, style, commit/PR)

After human edits, recompute `CHARTER.json.hash` so it matches the three Markdown files. Do not invent goals the human did not approve. Bootstrap invariants should stay `advisory` until baseline drift is cleaned up.

## Phase: `scan-project`

Inspect the repository and write `docs/project/context/PROJECT-SCAN.md` with:

- `## Context Identity`: current Git commit, branch, scan timestamp, included roots.
- `## Repository Structure`: packages, applications, libraries, tools, documentation roots.
- `## Runtime and Build Surfaces`: languages, frameworks, package managers, build entry points.
- `## Quality Commands`: exact lint, typecheck, unit, integration, build commands supported by repository configuration.
- `## Architecture and Decision Sources`: maintained architecture docs, ADR locations, schemas, APIs.
- `## Test Topology`: test frameworks and where unit/integration/e2e tests live.
- `## Known Gaps`: missing or conflicting documentation and unverified inferences.

Do not write the final architecture model in this phase.

## Phase: `model-project`

Read `PROJECT-SCAN.md` and the evidence it references. Produce all of:

### `PROJECT-CONTEXT.md`

- Purpose and major product/system responsibilities.
- Project boundaries and deployment/runtime units.
- Context identity and source commit.
- Non-negotiable project constraints.
- Relevant quality and operational expectations.
- Index linking the four detailed context documents below.

### `ARCHITECTURE-MAP.md`

- Components/modules and responsibilities.
- Allowed dependency direction.
- Primary data/control flows.
- Extension points and shared infrastructure.
- Existing patterns to reuse.
- Legacy areas and documented exceptions.

### `DOMAIN-MODEL.md`

- Stable domain vocabulary.
- Entities/value objects/aggregates where evidence exists.
- Ownership boundaries.
- Important invariants.
- Unknown or disputed terms.

### `SHARED-CONTRACTS.md`

- Public APIs, interfaces, events, schemas, configuration contracts.
- Owning module.
- Known consumers.
- Compatibility expectations.
- Contract stability: public, internal-stable, or implementation detail.

### `ENGINEERING-RULES.md`

- Code conventions supported by existing code/configuration.
- Testing expectations.
- Security/privacy requirements found in the project.
- Observability and error-handling expectations.
- Definition of Done.
- Exact quality commands inherited from `PROJECT-SCAN.md`.

## Phase: `check-drift`

Compare Reality (`docs/project/context/*`) to Intent (`docs/project/charter/*` + `CONVENTIONS.md`).

Write `docs/project/conformance/DRIFT-REPORT.md` with:

- Charter revision and generation timestamp
- A section for **every** `INV-x` in `CHARTER.json` (heading must include the id)
- Status per invariant: `ALIGNED` | `DRIFT` | `UNKNOWN` | `VIOLATED`
- Evidence paths; do **not** edit charter files to remove drift

First bootstrap may list many advisory findings — that is expected.

## Phase: `review-context`

Review the five context documents against repository evidence (and note drift). Write `CONTEXT-REVIEW.md` containing:

- Evidence coverage table: context claim → source file/code/config.
- Contradictions and stale documentation.
- Missing context that would make feature planning unsafe.
- Over-specific rules that are not supported by evidence.
- Required corrections (if any were applied or remain).
- `**Verdict:** GO` or `**Verdict:** NO-GO` (exact markdown emphasis required).

### Auto-fix (do not ask the user to edit by hand)

When you find fixable issues — wrong claim, missing `**inference**` label, over-specific rule, naming drift, missing caveat — **apply the corrections yourself** to the owning file(s) under `docs/project/context/` in this same step, then re-check.

- Mechanical edits (drop unsupported claim, label inference, broaden a note, quote source ambiguity) → apply → write `**Verdict:** GO`.
- If a previous `CONTEXT-REVIEW.md` already lists `## Required Corrections` with `**Verdict:** NO-GO`, apply those corrections first, then rewrite the review with `**Verdict:** GO`.
- Use `**Verdict:** NO-GO` only when a **human product/architecture decision** is required that you cannot infer from repository evidence. Even then, leave precise Required Corrections so a rerun can finish without manual file editing once the human answers in chat.

Do not publish a manifest on NO-GO. Do not stop after listing corrections without applying the mechanical ones. Do not “fix” drift by editing the charter.

## Phase: `publish-context`

Require `CONTEXT-REVIEW.md` to contain `**Verdict:** GO`.

Write `docs/project/context/CONTEXT-MANIFEST.json` using this schema:

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "sourceCommit": "full-git-sha",
  "generatedAt": "ISO-8601",
  "charterRevision": 1,
  "charterHash": "sha256:...",
  "artifacts": {
    "PROJECT-CONTEXT.md": "sha256:...",
    "ARCHITECTURE-MAP.md": "sha256:...",
    "DOMAIN-MODEL.md": "sha256:...",
    "SHARED-CONTRACTS.md": "sha256:...",
    "ENGINEERING-RULES.md": "sha256:..."
  }
}
```

- Increment `revision` when replacing an existing published context.
- Copy `charterRevision` / `charterHash` from current `CHARTER.json`.
- Use the current repository commit as `sourceCommit`.
- Hash the exact bytes of every listed artifact with SHA-256.
- Never invent hashes.

## Phase: `project-rules-sync`

Project Intent outward so every agent (Cursor, Claude Code, AIDLC) sees the same law.

Update (create if missing) marked blocks in:

- `CLAUDE.md`
- `AGENTS.md`
- `.cursor/rules/aidlc-charter.mdc`

Exact marker format:

```markdown
<!-- aidlc:charter start · revision N · sha256:… -->
…short G-x / INV-x / T-x / protectedPaths / quality gates / ship policy…
…CONVENTIONS summary (test/lint/typecheck, style, ship)…
<!-- aidlc:charter end -->
```

- One-way only: charter + conventions → rule files.
- `revision` and `sha256` in the start marker **must** match current `CHARTER.json`.
- Replace an existing `aidlc:charter` block in place; leave unrelated file content intact.
