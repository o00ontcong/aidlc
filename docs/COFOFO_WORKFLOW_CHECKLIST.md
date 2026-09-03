# CoFoFo Workflow — Implementation Checklist

Status date: 2026-08-29

A checked item exists on the current branch and has been exercised by an
automated test or the verification noted below. It does not imply that the
branch has been merged, published, or manually signed off for release.

## Implemented

### Reviewed design and safety boundary

- [x] Preserve the three-round reviewed proposal in
  `docs/COFOFO_WORKFLOW_PROPOSAL.html`.
- [x] Implement the two-tier model: reusable Foundation plus generated
  feature/bugfix delivery pipelines.
- [x] Restrict the runtime to one detected stack per repository and fail
  closed on `scan-stack` for multi-stack, monorepo, unsupported, or ambiguous
  repositories. CoFoFo does not switch to `aidlc-workflow-full`.
- [x] Keep `PROJECT-RULES.json` canonical; generate `PROJECT-RULES.md` with a
  source marker/hash and reject a stale hand-written view.
- [x] Restrict executable validation to pinned `commandId` values. Project
  rules cannot contain arbitrary shell commands.
- [x] Pin ECC at `d8409a4b0813771235555e32e3d8046a73988bfa`; vendor only the
  five audited Markdown agents/skills, with MIT `LICENSE`, `NOTICE`, source
  paths, modification flags and SHA-256 records.

### Content-addressed Canvas

- [x] Validate declarative `review: { mode: canvas, artifacts: [...] }` policy
  in the workspace schema.
- [x] Bind review bundles to run id, step index/revision, review revision,
  ordered artifact paths, per-file hashes and bundle hash.
- [x] Make Canvas verdicts the only approval authority for Canvas-gated steps;
  plain approval, auto-approval and provider-managed paths fail closed.
- [x] Re-check path containment, symlinks and content hashes at verdict time.
- [x] Add capability-token formal Annotron sessions keyed by `(artifact,
  bundleHash)`, with exactly two verdicts, read-only artifacts and durable
  sidecars; concurrent gates on one artifact remain independent.
- [x] Treat a multi-artifact bundle as one decision and reject conflicting or
  repeated verdicts.
- [x] Add CLI `aidlc run review` with reopen/resume behavior.
- [x] Add extension `Review in Canvas` UX that starts bundled Annotron, opens
  every bundle artifact, waits cancellably, reloads current run state before
  applying a verdict, and surfaces stale/request-changes results.
- [x] Hide invalid direct Approve/Reject controls for Canvas steps in the Epic
  gate banner and per-step action row.
- [x] Prevent legacy Epic-state reconciliation from manufacturing approval for
  a Canvas-gated step.

### CoFoFo Foundation runtime

- [x] Define strict versioned schemas for stack profile, project rules,
  installed assets, context manifest, foundation state and machine evidence.
- [x] Detect supported stack manifests deterministically with content hashes,
  toolchain/build metadata, confidence and single-stack enforcement.
- [x] Generate machine-readable rules for path, naming, layering, dependency
  and allow-listed command kinds; enforce blocking drift in core.
- [x] Implement the four executable routes: `bootstrap`, `refresh-context`,
  `update-rules` and `repin-bundle`.
- [x] Generate `STACK-PROFILE`, `PROJECT-RULES`, `RULE-DRIFT`, architecture map,
  catalog selection and provider context artifacts.
- [x] Generate provider-native phase commands for Claude, Cursor, Codex and
  OpenCode with the canonical policy path/hash and context hash embedded.
- [x] Preserve unmanaged text in `AGENTS.md`, `CLAUDE.md`, Cursor/OpenCode
  instructions and `docs/README.md` using guarded managed blocks.
- [x] Implement read-only install preview, text-only catalog audit, atomic
  writes, managed-asset drift detection, backups, manifest hashes, rollback
  tokens and intermediate-symlink refusal.
- [x] Require Canvas approval of policy/catalog before installation and of the
  published provider context before Foundation activation.
- [x] Validate manifest content, artifact hashes, installed catalog revision
  and asset hashes before marking Foundation ready. Filesystem mtimes are not
  evidence, so a byte-identical clone remains ready.
- [x] Add extension commands for prepare, rule render, install, publish,
  activate and status, so the lifecycle does not require a global CLI install.

### Stack bundle → workspace binding

Foundation selects and installs an audited ECC text bundle per stack; delivery
must consume that bundle through `workspace.yaml`, not hardcoded generator
extras. See `docs/COFOFO_BUNDLE_BINDING_PLAN.md` for the milestone design.

- [x] At `publish-context`, build `docs/project/foundation/BUNDLE-BINDING.json`
  deterministically from the catalog selection and `INSTALLED-ASSETS.json`.
- [x] `composeWorkspaceFromBundle()` merges ECC skill registry entries onto
  CoFoFo agents and `cofofo-delivery` step `skills`; remove Swift ECC hardcode
  from `WorkflowGenerator.agents()`.
- [x] `CONTEXT-MANIFEST.json` schema v2 records `bindingPath` and
  `bindingHash`; schema v1 manifests remain readable.
- [x] Render `PROVIDER-CONTEXT.md` from the binding (role→skills, phase→skills,
  installed registry, command allow-list) before the publish Canvas gate.
- [x] `diagnoseCofofoBinding()` flags workspace drift; `aidlc cofofo doctor` and
  `inspect()` surface Vietnamese repair hints for unbound or stale bindings.
- [x] SkyCast demo composes workspace from binding; tests prove implement-step
  dry-run loads ECC vendor skill text, not only the phase contract skill.

### Generated delivery runtime

- [x] Generate provider-neutral `cofofo-delivery` plus `cofofo-feature` and
  `cofofo-bugfix` recipes with declared inputs/outputs and immutable snapshots.
- [x] Preserve every normalized step policy when a recipe is materialized and
  fail closed for an old CoFoFo snapshot that lost a Canvas/evidence gate.
- [x] Make bug diagnosis a mandatory Canvas gate before reproduce/implement.
- [x] Pin Foundation revision + manifest hash into each delivery run and check
  it before every phase.
- [x] Stop stale delivery runs and implement mandatory rebase that preserves
  audit history while resetting every phase for replay.
- [x] Require task plans to cite all active blocking `ruleId` values before
  production mutation.
- [x] Capture RED → GREEN → REFACTOR → VERIFY in strict order with
  timestamps, command id/args, exit status, timeout, secret-redacted bounded
  output, durable log hash and record hash chain; bind each accepted record to
  the current owning step revision so a rework/rebase must recapture it.
- [x] Reject RED results caused by compile/import/syntax failures or an
  unmatched assertion oracle; provide a named, reasoned, secret-screened human
  waiver with alternative evidence, then require Canvas approval of
  `RED-EVIDENCE.md` before production code changes.
- [x] Re-run blocking project rules at GREEN/refactor/verify boundaries.
- [x] Route plan, implementation, fresh review, verification, memory and
  improvement artifacts through Canvas.
- [x] Enforce memory as at most 64 KiB, explicitly `unreviewed`, secret-screened
  context that cannot modify/promote policy.
- [x] Keep improvement output `proposed — not active`; policy promotion goes
  through the separately reviewed `update-rules` route.
- [x] Add extension commands for mandatory rebase and current-stage machine
  evidence capture.
- [x] Add `Báo lỗi` (three symptom fields) and `aidlc cofofo doctor`: completed
  delivery runs start a clean linked bugfix run; active runs record the report
  at the current phase; doctor only offers repairs that can actually work.

### SkyCast real-world demo

- [x] Package an offline SwiftPM/iOS-compatible SkyCast weather app with a
  runnable SwiftUI host (`swift run SkyCastDemoApp`) and deterministic data.
- [x] Add command-palette/sidebar loading into
  `~/aidlc-cofofo-weather-demo`, with safe re-seed/open-as-is behavior.
- [x] Seed a validated, active Foundation before delivery work, pin its exact
  revision/manifest hash into every current run, and model fail-closed behavior
  with a real revision-1 → revision-2 stale snapshot plus awaiting Canvas, RED
  and request-changes states.
- [x] Run the shipped Foundation validators against the seeded artifacts using
  the runtime schemas: stack evidence hashes, canonical rule hash, installed
  asset provenance/attribution, and context/state content hashes all pass.
- [x] Build every seeded Foundation, feature and bugfix run by materializing
  `generatedCofofoWorkspace()` recipes, including mandatory diagnosis Canvas,
  refactor and all four machine-evidence boundaries.
- [x] Seed completed feature/bugfix runs plus production diagnosis, RED waiver,
  stale-foundation/rebase, and proposed-rule improvement scenarios with real
  artifacts, review history, and tamper-evident fixture ledgers.
- [x] Add `docs/COFOFO_DEMO_RUNBOOK.md` with a 12–15 minute boss demo script,
  recovery scenarios and CLI equivalents.
- [x] Verify `swift build` and `swift test` (4 XCTest) for the packaged fixture.
- [x] Exercise the bundled CLI against a newly copied SkyCast workspace:
  stack detection, revision-1 prepare/start, status inspection and dry-run
  catalog plan all succeed without network access.

### Automated verification completed so far

- [x] Core suite passes, including lifecycle, route slicing, successful stale
  run rebase, rule binding, evidence order/oracle/redaction/tamper checks,
  installer drift/rollback, bundle-binding compose/doctor tests and path-safety
  tests.
- [x] Extension typecheck passes and 19 test files / 211 tests pass.
- [x] Annotron 22/22 tests pass, including multi-file verdict atomicity and
  independent concurrent gates on one artifact.
- [x] CLI TypeScript compilation and production bundle succeed.
- [x] Production VSIX packaging succeeds with Swift `.build`/cache artifacts
  excluded: `packages/extension/aidlc-o00ontcong-3.4.38.vsix`, 2.32 MB,
  SHA-256 `d6552d203b731fbb2c12f676ccf77993a35386ec67772b2a0b6028bb4dbe0150`.
- [x] Bundled Annotron UI smoke check shows the formal-review identity,
  content hash and exactly the `Approve` / `Request changes` gate actions.
- [x] `git diff --check` passes.

## Remaining before release

### Manual release gates

- [ ] Run the packaged VSIX browser walkthrough end to end with a human Canvas
  approval, request-changes round, stale-content repair and resume after an
  extension/server restart.
- [ ] Complete keyboard-only, focus-order, screen-reader-label and color-
  contrast review for the new Canvas actions.
- [ ] Complete a focused security review of loopback token/session handling,
  installer writes, provider command generation and evidence redaction.
- [ ] Run the final full package/install smoke matrix on a clean VS Code profile
  and record the produced VSIX checksum.
- [ ] Review and merge the branch, publish the MVP, and monitor first real
  projects before expanding scope.

### Deliberate post-MVP scope

- [ ] Add Xcode scheme/destination handling for `xcodebuild` evidence; Xcode
  already selects the ios-swift catalog and a declared command allow-list, but
  destinations are not guessed.
- [ ] Vendor additional stack-specific ECC Markdown (Python/Node/Go/…) on top
  of the shared TDD/security assets already selected for every detected stack.
- [ ] Design content-addressed composite Foundations for monorepos/multi-stack
  repositories; `scan-stack` still fails closed until then.
- [ ] Add greenfield-only `design-architecture` and `scaffold-project` routes.
- [ ] Decide whether to vendor selected system-design-primer case studies; if
  adopted, pin a revision and satisfy CC BY 4.0 attribution/change notices.
