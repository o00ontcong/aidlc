---
name: project-context-workflow
description: Build, review, and publish the canonical project context consumed by cohesive feature delivery.
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
- Canonical outputs live under `docs/project/context/`.
- Do not create placeholder-only artifacts.

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

## Phase: `review-context`

Review the five context documents against repository evidence. Write `CONTEXT-REVIEW.md` containing:

- Evidence coverage table: context claim → source file/code/config.
- Contradictions and stale documentation.
- Missing context that would make feature planning unsafe.
- Over-specific rules that are not supported by evidence.
- Required corrections.
- `**Verdict:** GO` only when the context is safe to publish; otherwise `**Verdict:** NO-GO`.

Do not publish a manifest on NO-GO. Correct the owning context artifact first.

## Phase: `publish-context`

Require `CONTEXT-REVIEW.md` to contain `**Verdict:** GO`.

Write `docs/project/context/CONTEXT-MANIFEST.json` using this schema:

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "sourceCommit": "full-git-sha",
  "generatedAt": "ISO-8601",
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
- Use the current repository commit as `sourceCommit`.
- Hash the exact bytes of every listed artifact with SHA-256.
- Never invent hashes.

