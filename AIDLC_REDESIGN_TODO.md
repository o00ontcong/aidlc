# AIDLC Redesign — Implementation TODO

Design: [`AIDLC Workspace v2.dc.html`](AIDLC%20Workspace%20v2.dc.html) (source of truth for UX)
Spec: [`IMPLEMENT.md`](IMPLEMENT.md) (maps design → code, defines the 7-step build order)

**Decision (2026-08-10):** this repo also has an older, separate wave-based rewrite
(`AIDLC_SYSTEM_REDESIGN.md` / `AIDLC_SYSTEM_REDESIGN_TODO.md`, waves W0→W2, partially
merged) with its own `contracts/epic.ts`, `EpicStore.ts`, `autonomy.ts`. Per user
decision, **IMPLEMENT.md supersedes that plan** — the old wave-plan is history. Its
code is reused where it already matches IMPLEMENT.md's model (renamed/reconciled, not
rebuilt); anything left of the old wave-plan TODO is no longer the active plan.

## Step 1 — Store + event log — ✅ DONE (reused existing code, no rewrite needed)
`packages/core/src/epic/EpicStore.ts` + `contracts/run.ts` already implement this
exactly: `.aidlc/epics/<id>/{state.json,events.ndjson}`, atomic writes,
`RunEvent`/`EpicEvent` shaped as `{at, actor, command, from, to, evidence}`,
`redactSecrets()` on append, and `recoverProjection()` as the crash-recovery
rebuild path. No new code was needed — this satisfied the spec as found.

## Step 2 — Registry: Skill / Agent / Pipeline stores — ✅ DONE
- [x] `contracts/registry.ts` — zod contracts for `Skill`/`Agent`/`Pipeline`/`PipelineStep`, 4 `RegistryIssueKind`s
- [x] `registry/AgentStore.ts`, `SkillStore.ts`, `PipelineStore.ts` — `list()/read()/write()/exists()`, project-shadows-global precedence
- [x] Frontmatter parsing via `gray-matter` (added as a new dependency)
- [x] Storage paths implemented as specified: `.claude/agents/<id>.md` / `.aidlc/skills/<id>.md` (project) vs `~/.claude/agents,skills` (global), `.aidlc/pipelines/<id>.yaml` (project; bundled pipelines supplied by the extension, never overwritten — write() always creates a project-scoped copy)
- [x] `onChange()` emits after write for UI refresh-without-reload
- [x] `RegistryValidator` — the 4 error types: `duplicate-id`, `missing-skill`, `missing-agent`, `no-human-review-step`
- [x] Tests: `agent-store.test.ts` (13 cases incl. skill store + pipeline store), `registry-validation.test.ts`, `registry-linking.test.ts` — all green, full core suite (492 tests) unaffected
- [x] Wired into `packages/extension`: `registerRegistryCommands.ts` handles terminal commands; V3 Builder reads the same stores
- [x] Old `loader/SkillLoader.ts`/`AssetDiscovery.ts`/`WorkspaceLoader.ts` remain deliberately isolated as legacy workspace.yaml paths during migration

## Step 3 — CommandBus + slash commands — ✅ DONE (mostly reused existing v2 code)
- [x] Core `CommandBus` (`application/CommandBus.ts`) already has a full set of registered handlers (`epic.*`, `gate.*`, `project.*`, ...) — these run AI in-process via `ClaudeCliProvider` (`spawn('claude', ...)`), which is the **legacy/autonomous** path. Per user decision, this stays as-is for headless/autonomous mode; it is NOT used by the new terminal-only path below.
- [x] Terminal-dispatch already exists in `v2/workspaceCommands.ts` (`aidlc.runStepWithFeedback`, `aidlc.openClaudeTerminal`) — shell-integration-aware `sendText`, terminal reuse/fresh-terminal handling, and the Reload-notification pattern (`workbench.action.reloadWindow`) already all exist in `v2/workspaceWebview.ts`. Reused rather than rebuilt.
- [x] New: `registry/pipelineCommand.ts` — pure generator for `.claude/commands/aidlc-<id>.md`, referencing the new registry paths (`.aidlc/epics`, `.claude/agents`, `.aidlc/skills`), idempotent unless `overwrite`
- [x] New: `extension/src/v3/registerRegistryCommands.ts` — wires `AgentStore`/`SkillStore`/`PipelineStore.onChange()` to (a) regenerate the pipeline's command file and (b) show the Reload notification; new command `aidlc.registry.pipeline.run(epicId, pipelineId, feedback?)` writes the command file then delegates to `aidlc.runStepWithFeedback` — never runs AI itself
- [x] Autonomous delivery remains explicitly on the legacy execution path during the migration window; the new registry path is terminal-only and never spawns AI in-process
- [x] Tests: `pipeline-command.test.ts` (core, 3 cases); extension `tsc --noEmit` clean + full extension suite green (52 tests)

## Step 4 — Step runner + rerun/resume
- [x] `runStep(epicId, stepId)`: `awaiting-work → running`, opens the visible terminal and now has `aidlc.registry.step.complete` for the "Mark step done" callback
- [x] `rerunStep(epicId, stepId, { feedback })`: new revision, same run id, re-runs the same slash command, preserves approved artifacts
- [x] `resume(epicId)`: rebuilds from the checkpoint event log and returns only the current incomplete step — never starts a new run when one exists
- [x] Reject at review → `onReject.rerun` target with feedback, without re-running upstream approved steps
- [x] Runner rejects out-of-order run/complete/review transitions, so commands cannot bypass an earlier step or hard gate
- [x] Regression coverage in `step-runner.test.ts`: rerun, resume, reject-with-feedback, event-log recovery, and order/gate enforcement

## Step 5 — Gate service
- [x] Hard gate list already matches spec exactly: `HARD_GATE_KINDS = [destructive_changes, merge_default_branch, external_communication]` in `packages/core/src/contracts/autonomy.ts`, enforced via `resolveGatePolicy()` / `AutonomyController.ts`
- [x] `GateService.request(...)` transitions a running Epic to `waiting-for-user` and writes a durable `gate.request` event
- [x] Reject requires a non-empty reason and persists it in the pipeline event log before scheduling the rerun
- [x] `project-sync` remains downstream of the explicit `await-merge`/merge gate in the existing cohesive workflow; regression coverage keeps that order intact
- [x] `gate-service.test.ts` covers hard-gate parse enforcement, mode bypassability, request eventing, and logged reject reasons

## Step 6 — Webview UI
- [x] Home, Epics, Guide, Studio tabs exist under `packages/extension/src/webview/v3/`
- [x] Added V3 **Builder**, **Analyze**, and **Tests** tabs; Builder exposes the registry plus the Redraw Design preset
- [x] Epics tab is a two-column layout with search, counts, local ★ following state, and collapsible rail
- [x] V3 flow graph component derives coordinates from the grid, never hard-codes a pipeline:
  - `x = 12 + 224 * (i % 5)`, `y = 40 + 128 * floor(i / 5)`, node size `208×52`
  - horizontal connector: `M x+208,y+26 → x',y+26`
  - row wrap via corridor `y+88`
  - reject loop via corridor `y+76` between the two related nodes
  - canvas height: `max(loopY+20, 40 + 128*rows + 12)`, scaled to fit column width
- [x] Typed postmessage protocol: `aidlc.v3.command` carries `{ id, name, payload }`; `aidlc.v3.state` returns the durable epic/registry/event projection after each command

## Step 7 — Preset "Redraw Design"
- [x] Command `aidlc.preset.redrawDesign.apply` — idempotent, does 3 things:
  1. write 5 skills if missing: `figma-to-ui`, `image-to-ui`, `design-system`, `responsive-layout`, `visual-review`
  2. write agent `design-recreator` (skills + capabilities per frontmatter shape in IMPLEMENT.md §1)
  3. write pipeline `.aidlc/pipelines/redraw-design.yaml` (4 steps: design-analyzer → design-recreator → visual-reviewer → human-review, see IMPLEMENT.md §2 for exact YAML)
- [x] Never overwrites a bundled pipeline — `PipelineStore.write()` always emits a versioned project copy and the preset preserves existing project edits
- [x] Implemented fresh in `registry/redrawDesignPreset.ts`, without altering v2 presets
- [x] Sample-workspace test verifies five skills, agent, pipeline, idempotence, and preservation of an edited project pipeline; extension command generates slash command then presents Reload

## Cross-cutting
- [x] Existing cohesive pipeline tests continue to assert `cohesive-feature` (13 steps) and `project-context` (7 steps) unchanged
- [x] Decision: new `.aidlc/epics/**/pipeline-runs/**` event-sourced registry model runs alongside `RunStateStore`/`GitRunStateStore` during migration; legacy autonomous delivery stays on the legacy path
- [x] Added `gray-matter` dependency for registry frontmatter

## Suggested build order (per IMPLEMENT.md §2, each step ships independently)
1. Store + event log
2. Skill/Agent/Pipeline registry + validation
3. CommandBus wiring + terminal dispatch
4. Step runner + rerun/resume
5. Gate service hookup to event log
6. Webview UI (tabs, flow graph, postmessage)
7. Redraw Design preset

## End-to-end acceptance walkthrough (from IMPLEMENT.md §4)
1. Sidebar → Workflows → Cohesive Delivery → Overwrite & apply → Install
2. Start Epic → project-context → run 7 steps → publish-context (rev-7)
3. Builder → Preset Redraw Design → Apply preset → Reload VS Code
4. + New Epic → title "Redraw checkout screen" → pipeline redraw-design → create & run
5. Run each step with Claude → Mark step done
6. human-review: Approve, or Reject + feedback → design-recreator reruns as revision 2
7. open-pr → await-merge (human merge) → project-sync
8. Parallel test: create `PAYMENTS-001`, `EXPORT-001`, `NOTIFICATIONS-001` — one terminal/branch/PR each
