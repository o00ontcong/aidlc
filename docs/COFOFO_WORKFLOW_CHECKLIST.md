# Cofofo Workflow — Implementation Checklist

Status date: 2026-08-28

This checklist separates reviewed design work from implementation. A checked
item means that the work exists on the current branch and has been verified
where a verification command is listed. It does not imply that the branch has
been merged or released.

## Done

### Proposal and scope

- [x] Review and correct the Cofofo workflow proposal through three review rounds.
- [x] Define the two-tier model: a reusable project foundation plus generated
  feature-delivery pipelines.
- [x] Limit the MVP to single-stack repositories and explicitly fall back to
  the existing generic SDLC workflow for monorepos or ambiguous stacks.
- [x] Make `STACK-PROFILE.json` the machine-readable source of truth, with
  evidence, version, package-manager, build-system, and confidence requirements.
- [x] Make `PROJECT-RULES.json` the policy source of truth and treat
  `PROJECT-RULES.md` as a generated view bound by a marker and source hash.
- [x] Restrict custom validation commands to approved `commandId` values from
  a pinned allow-list; arbitrary shell commands are not allowed in project rules.
- [x] Define the foundation lifecycle, including refresh, rule update, ECC
  re-pin, drift detection, and mandatory MVP rebase when the foundation changes.
- [x] Separate Canvas review gates from provider execution; the workflow remains
  provider-neutral across Claude, Cursor, Codex, and OpenCode.
- [x] Restrict vendored ECC content in the MVP to curated text-only agents and
  skills. Validators and hooks remain AIDLC-owned and tested.
- [x] Pin the proposed ECC source revision and record the MIT/CC BY attribution
  obligations, including a future `NOTICE` requirement.
- [x] Define machine-evidence gates for stack detection, RED/GREEN execution,
  rule validation, and the full test suite.
- [x] Define proposal-level acceptance criteria and residual risks.
- [x] Preserve the corrected proposal in
  `docs/COFOFO_WORKFLOW_PROPOSAL.html`.

### Canvas dependency implemented on this branch

- [x] Add declarative Canvas review policy validation to the workspace schema.
- [x] Add content-addressed review bundles bound to run, step revision, review
  revision, artifact path, and SHA-256 content.
- [x] Persist review sessions and typed verdict state in core run state.
- [x] Make Canvas verdicts the approval authority for Canvas-gated steps.
- [x] Fail closed for plain approval, auto-approval, provider-managed approval,
  stale content, and verdicts that do not carry the active gate token.
- [x] Add formal Annotron review mode with `approve` and
  `request_changes` verdicts while retaining freeform mode.
- [x] Add the CLI review flow and provider-neutral Annotron transport.
- [x] Project review state into the Epic artifact index.
- [x] Verify core tests: 75 files, 905 tests passed.
- [x] Verify extension tests: 17 files, 204 tests passed.
- [x] Verify Annotron tests: 20 tests passed.
- [x] Verify the CLI TypeScript build.

## Left

### Finish the Canvas/ECC prerequisite

- [ ] Add machine-captured ECC evidence for RED, GREEN, refactor, and verify,
  including timestamps, exit status, redacted bounded output, and tamper-evident
  full-log references.
- [ ] Add the remaining extension review service and complete the gate UX for
  multi-artifact review, stale state, resume, repair, and accessibility.
- [ ] Add built-in ECC workflow stages and their declared artifacts without
  changing existing in-flight snapshots.
- [ ] Add project-native research, test, implementation, review, verification,
  memory, and improvement contracts.
- [ ] Harden Epic memory as bounded, secret-screened, unreviewed context that
  cannot promote itself into policy.
- [ ] Complete the full build/package matrix and the manual browser walkthrough
  described in
  `.claude/plans/ecc-evidence-and-artifact-review-canvas.plan.md`.
- [ ] Merge and release the Canvas/ECC prerequisite after review.

### Implement the Cofofo foundation pipeline

- [ ] Define versioned schemas for `STACK-PROFILE.json`,
  `PROJECT-RULES.json`, `CONTEXT-MANIFEST.json`, the installed-asset manifest,
  and foundation revision state.
- [ ] Implement deterministic single-stack detection with evidence and
  confidence thresholds.
- [ ] Implement the explicit generic-SDLC fallback for multi-stack, monorepo, or
  low-confidence detection.
- [ ] Implement curated ECC catalog selection from the pinned revision.
- [ ] Vendor the approved text-only ECC subset and add license attribution,
  modification records, and `NOTICE`.
- [ ] Implement AIDLC-owned validators and hooks for supported rule kinds,
  including layering, path, naming, dependency, and allow-listed command rules.
- [ ] Implement the foundation installer with dry-run, backups, atomic writes,
  ownership markers, manifest hashes, and rollback.
- [ ] Implement safe upgrade and migration behavior that preserves user-authored
  content and detects drift or conflicts.
- [ ] Implement foundation refresh, rule update, ECC re-pin, and mandatory run
  rebase semantics.
- [ ] Generate provider-specific context blocks without changing unmanaged
  content.

### Implement generated delivery workflows

- [ ] Generate a feature pipeline from the validated foundation manifest.
- [ ] Enforce the dependency from feature work to an approved, current
  foundation revision.
- [ ] Feed project rules and the architecture map into planning before
  implementation begins.
- [ ] Enforce real RED evidence before production mutation.
- [ ] Enforce build, rule, targeted-test, full-suite, fresh-review, and final
  verification gates.
- [ ] Route every human review through Canvas and every execution step through
  the selected provider adapter.
- [ ] Capture durable run evidence and surface actionable failure reasons,
  including the RED failure oracle and an audited waiver path.
- [ ] Promote repeated defects into proposed machine-checkable rules through a
  reviewed `update-rules` path.

### Validate and release Cofofo

- [ ] Add schema, installer, migration, rollback, path-safety, hash, drift,
  provider, and compatibility tests.
- [ ] Add end-to-end fixtures for each initially supported stack.
- [ ] Prove that unsupported and ambiguous repositories fall back safely.
- [ ] Prove that modified or executable ECC assets are rejected.
- [ ] Prove offline and reproducible operation with no runtime ECC dependency.
- [ ] Run full core, extension, CLI, Annotron, package, and generated-workspace
  verification.
- [ ] Complete security review, accessibility review, and documentation review.
- [ ] Merge, publish, and monitor the MVP before expanding to composite
  multi-stack repositories.
