# Plan: ECC-First Idea Workflow and Plan Canvas

**Source PRD**: N/A — direct user directive, grounded in `affaan-m/ECC`
**Selected Milestone**: Replace the legacy Idea experience with the ECC plan-and-approval vertical slice
**Complexity**: Large

## Summary

Replace the legacy Idea-tab workflow with an ECC-native experience that plans
before it builds, grounds the plan in repository patterns, blocks on explicit
human approval, and carries verifiable evidence through TDD, review, final
verification, memory, and improvement. Use the existing Annotron runtime as the
local Plan Canvas, but make the artifact path, structure, verdict, and evidence
semantics match ECC rather than inventing another planning format.

The user-facing journey is intentionally shorter than the engineering loop:
describe the outcome, review the grounded plan, approve the exact revision, and
follow delivery evidence. The eight ECC stages remain the runtime contract, not
eight competing navigation items.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Plan artifact | `https://github.com/affaan-m/ECC/blob/main/commands/plan.md` | Write `.claude/plans/{kebab-case-name}.plan.md` with Summary, Patterns, Files, Tasks, Validation, Risks, and Acceptance; wait for confirmation. |
| Canvas review | `https://github.com/affaan-m/ECC/blob/main/skills/plan-canvas/SKILL.md` | Open a local plan, await structured feedback, live-reload revisions, and treat only the human `approve` verdict as plan confirmation. |
| TDD evidence | `https://github.com/affaan-m/ECC/blob/main/skills/tdd-workflow/SKILL.md` | Map approved behavior to a test target and retain distinct RED and GREEN evidence before final verification. |
| Bounded state writes | `packages/core/src/shape/ShapeService.ts` | Preserve optimistic concurrency and human-only acceptance while the legacy Shape store remains the compatibility backend. |
| Local review runtime | `vendor/annotron/src/server.js` | Reuse loopback serving, registered-file allow-listing, structured feedback, persisted sidecars, and live reload. |
| Webview refresh | `packages/extension/src/v2/workspaceWebview.ts` | Rebuild durable state from disk and post one curated state object to the React webview. |
| Tests | `packages/core/test/discovery-shape.test.ts` and `packages/extension/test/discoveryI18n.test.ts` | Use Vitest, temporary workspaces for state transitions, and structural assertions for localized UI copy. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `AGENTS.md` | UPDATE | Persist the ECC workflow and canonical plan format for every future agent. |
| `packages/extension/src/webview/components/DiscoveryView.tsx` | UPDATE | Replace legacy Idea actions and terminology with the ECC plan-review state machine and one primary action per state. |
| `packages/extension/src/webview/lib/discoveryI18n.ts` | UPDATE | Provide plain-language ECC copy without exposing legacy Shape/Foundation vocabulary as the primary UX. |
| `packages/core/src/plan/renderEccPlan.ts` | CREATE | Render the canonical ECC `.plan.md` structure from grounded research and bounded plan data. |
| `packages/core/src/plan/EccPlanService.ts` | CREATE | Own plan naming, revision/hash binding, validation, and atomic approval semantics. |
| `packages/extension/src/v2/ideaPlanCanvasService.ts` | CREATE | Launch/reopen the Canvas, process feedback, revise the plan, and bridge the human verdict. |
| `packages/extension/src/v2/workspaceWebview.ts` | UPDATE | Expose ECC plan state and Canvas actions to the webview without granting arbitrary write authority. |
| `packages/extension/src/v2/providerRunLogic.ts` | UPDATE | Require research grounding and canonical plan output from every supported provider. |
| `vendor/annotron/bin/annotron` | UPDATE | Register an ECC plan-review mode and the plan revision/hash. |
| `vendor/annotron/src/server.js` | UPDATE | Return typed `approve` or `request_changes` verdicts bound to the registered plan content. |
| `vendor/annotron/src/chrome.html` | UPDATE | Present ECC Plan Canvas actions and hide generic source editing that could bypass plan validation. |
| `packages/core/test/ecc-plan.test.ts` | CREATE | Prove canonical rendering, hashes, conflicts, approval authority, and crash-safe persistence. |
| `packages/extension/test/ideaPlanCanvas.test.ts` | CREATE | Prove generate, reopen, revise, stale, approve, and recovery flows. |

## Tasks

### Task 1: Make ECC the only new Idea workflow contract

- **Action**: Replace the legacy action chain with four durable states:
  `researching`, `plan-ready`, `awaiting-approval`, and `approved`. Present one
  primary action for each state and keep technical state under progressive
  disclosure.
- **Mirror**: ECC `/plan` restates requirements, grounds patterns, writes the
  plan, and waits for explicit confirmation.
- **Validate**: Render the harness in English and Vietnamese; confirm that a
  first-time user can identify the next action without knowing Shape,
  Foundation, Epic, or ECC command names.

### Task 2: Write the canonical ECC plan artifact

- **Action**: Create `.claude/plans/{kebab-case-name}.plan.md` using the exact
  heading order in `AGENTS.md`. Store source reference, selected milestone,
  complexity, patterns, affected files, actionable tasks, validation commands,
  risks, and acceptance checks. Bind the artifact to its research inputs and
  SHA-256 content hash.
- **Mirror**: ECC `commands/plan.md` PRD artifact output.
- **Validate**: Unit-test deterministic rendering, kebab-case naming, required
  headings, pattern references, and stable hashes. Reject incomplete plans.

### Task 3: Ground the plan in repository evidence

- **Action**: Before writing the plan, inspect the closest examples for naming,
  error handling, logging, data access, and tests. Store the top source reference
  per relevant category. State explicitly when no pattern exists.
- **Mirror**: ECC `/plan` Pattern Grounding table.
- **Validate**: Use a fixture repository with known patterns and assert that the
  rendered plan cites them; use an empty fixture and assert that the absence is
  reported rather than fabricated.

### Task 4: Add the ECC Plan Canvas review loop

- **Action**: Open the canonical `.plan.md` in Annotron, keep an active feedback
  listener, apply comments back to the plan source, live-reload, and continue
  until the human requests changes again or approves. Persist the session so it
  can be reopened after an extension restart.
- **Mirror**: ECC `plan-canvas` open/await/reply/end loop and JSON verdicts.
- **Validate**: Integration-test anchored comments, general chat, multiple
  revision rounds, restart recovery, cancellation, and both verdicts.

### Task 5: Bind approval to the exact plan revision

- **Action**: Accept only a human `approve` verdict whose plan path, content
  hash, research revision, and base workspace revision still match. Make the
  state transition atomic; a conflict leaves the prior state untouched and
  marks the Canvas stale.
- **Mirror**: ECC treats Canvas `approve` as the `/plan` confirmation signal;
  preserve AIDLC's existing human-only acceptance and optimistic concurrency.
- **Validate**: Test non-human approval, stale plan hash, changed workspace
  evidence, duplicate approval, write interruption, and successful retry.

### Task 6: Enforce RED, GREEN, and refactor evidence

- **Action**: Convert every approved behavior into a testable guarantee. Record
  the test target, failing command/result, implementation change, passing
  command/result, and optional refactor result. Do not allow implementation
  evidence to substitute for a missing RED stage.
- **Mirror**: ECC `tdd-workflow` plan-task-to-test mapping and RED/GREEN cycle.
- **Validate**: Exercise a fixture change through failing test, minimal fix, and
  passing test; assert that implementation is blocked when RED evidence is
  absent.

### Task 7: Separate review from final verification

- **Action**: Run review from fresh context after GREEN, address findings with
  regression tests, then independently run the approved build, lint, type, and
  test checks. Store actual commands, exit status, relevant output, and any
  unverified limits.
- **Mirror**: ECC fresh-context review followed by deterministic verification.
- **Validate**: Inject a review finding into a fixture, prove the regression
  test fails before the fix, and ensure final verification is timestamped after
  implementation and review.

### Task 8: Remember evidence and improve deliberately

- **Action**: Persist a compact handoff containing the approved plan, RED/GREEN
  evidence, review findings, verification, decisions, and follow-ups. Propose a
  reusable rule only when a repeated or high-value lesson is confirmed; require
  human approval before promoting it into governed project instructions.
- **Mirror**: ECC Memory Vault trust boundary: memory is inspectable context,
  not executable policy.
- **Validate**: Confirm that memory remains readable after restart, does not
  change workflow policy automatically, and links back to the exact plan and
  evidence hashes.

## Validation

```bash
pnpm --filter @aidlc/core test
pnpm --filter @aidlc/core build
pnpm --filter aidlc-o00ontcong test
pnpm --filter aidlc-o00ontcong compile
```

Run browser walkthroughs for the Idea view in both supported languages and at
narrow and wide widths. Exercise the complete flow with a fake provider:
research, write plan, request changes, revise, approve, capture RED, implement
to GREEN, fresh-context review, final verification, and memory handoff.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Legacy Shape/Epic state leaks back into the new UX and creates two competing workflows. | High | Keep legacy state behind a compatibility adapter; expose only ECC plan states in new UI components. |
| A Canvas tab approves stale content. | Medium | Bind verdicts to path, content hash, research revision, and workspace revision; fail closed on any mismatch. |
| Annotron source editing bypasses bounded plan validation. | Medium | Disable generic source editing in ECC plan mode and apply feedback through `EccPlanService`. |
| Provider output invents repository patterns or validation results. | High | Require source references, validate allowed fields, and distinguish planned checks from executed evidence. |
| TDD becomes copy rather than an enforced gate. | High | Require machine-readable RED evidence before enabling implementation and separate GREEN from final verification. |
| Custom pipelines claim ECC compliance while omitting review or memory. | Medium | Compute an ECC capability status from actual configured gates and evidence; never infer it from a label. |
| Migrating existing Ideas destroys user data. | Low | Keep legacy records read-only, provide explicit migration, and never delete them automatically. |

## Acceptance

- [ ] All new implementation plans use `.claude/plans/*.plan.md` and the ECC heading order.
- [ ] Plan generation records real repository patterns or explicitly reports their absence.
- [ ] No production-code write starts before human approval of the exact plan revision.
- [ ] The Plan Canvas supports annotate, request changes, live revision, reopen, and approve.
- [ ] A stale, incomplete, or agent-approved plan cannot cross the approval gate.
- [ ] Every approved behavior maps to a test target with distinct RED and GREEN evidence.
- [ ] Fresh-context review and final verification are separate, durable stages.
- [ ] Decisions and evidence survive restart; memory never becomes policy without human approval.
- [ ] Legacy Idea data remains available for compatibility but does not define the new ECC UX or artifact format.
- [ ] All tasks complete.
- [ ] Validation passes.
- [ ] Patterns mirrored, not reinvented.
