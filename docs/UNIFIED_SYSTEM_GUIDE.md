# AIDLC unified system guide

This guide covers the unified Epic/workflow runtime described in `AIDLC_SYSTEM_REDESIGN.md`. Legacy pipelines remain available for one migration window; commands using recipe/pipeline flags print an exact replacement or migration command.

## Canonical command reference

```sh
aidlc project setup                         # preview only
aidlc project setup --confirm               # create canonical project files
aidlc project analyze                       # read-only facts; does not publish context
aidlc context status
aidlc context refresh --source-commit HEAD  # explicit context publication
aidlc project recommend
aidlc project recommend-accept
aidlc project recommend-lock

aidlc epic start --title "Add risk alerts"  # derives an EPIC-* id
aidlc epic prepare EPIC-ADD-RISK-ALERTS
aidlc epic run EPIC-ADD-RISK-ALERTS --mode assist
aidlc epic next EPIC-ADD-RISK-ALERTS
aidlc epic status EPIC-ADD-RISK-ALERTS
aidlc epic explain EPIC-ADD-RISK-ALERTS
aidlc epic resume EPIC-ADD-RISK-ALERTS
aidlc epic review EPIC-ADD-RISK-ALERTS
aidlc epic ship EPIC-ADD-RISK-ALERTS

aidlc gate approve <epic-id> <gate-id>
aidlc gate reject <epic-id> <gate-id> --reason "Needs changes"
aidlc migration preview
aidlc migration apply <migration-id> --confirm
aidlc migration rollback <migration-id> --confirm
aidlc migrate --preview                      # §12.1 compatibility spelling
```

Provider commands installed for the Discover tab (run inside a provider
session, not the CLI):

```text
/aidlc-discover <step> [note]     # do one blueprint step
/aidlc-discover-pipeline [note]   # do the blueprint's current step, then stop
/aidlc-discover-dev-docs          # write development/*.md from the chosen stack
```

All redesigned commands return the same typed result used by `/aidlc` and the VS Code extension: `status`, `nextAction`, `evidence`, `warnings`, `recoveryActions`, and a structured `error` when applicable. Exit codes are 0 for success, 2 for user input, 3 for a blocker, and 1 for an error.

## Four onboarding paths

### Blueprint a new project (Discover tab)

Use this when there is nothing to automate yet — an idea, no code. The Discover
tab walks one idea through twelve steps (Idea → Product Definition →
Requirements → Features → Use Cases → User Flow → Data Model → Architecture →
Tech Decisions → Project Structure → Implementation Plan → Project Skeleton),
writing each step into Markdown under the project's `docs/` tree. Those files
are the source of truth; the app keeps only an index, per-item provenance and
one snapshot per agent run under `.aidlc/discover/`.

Agents work one step per turn through `/aidlc-discover <step>` or
`/aidlc-discover-pipeline`, editing the docs directly. Every run is diffed
against its snapshot entry by entry, so any change — or any single entry — can
be undone. When the Implementation Plan is written, each phase is handed off as
its own CoFoFo epic with an `INTENT.md` snapshot; the epic then follows the
paths below. See `docs/DISCOVER_TAB_PLAN.md`, and the tab's own guide via
its "Open the pipeline guide" button.

### Workflow runner

Use this when you already know the workflow pack. Run setup, explicitly publish context, start an Epic, prepare it, then run it with `guide`, `assist`, `auto`, or `unattended`. The compiler writes `.aidlc/epics/<id>/workflow.json`; the runtime never trusts a caller-supplied workflow hash.

### Opinionated SDLC pack

Use `sdlc-core` for the normal five-stage flow and `regulated` when traceability evidence is required. Quick work shows Understand → Build → Verify. All other profiles show no more than Understand → Plan → Build → Verify → Ship.

### Automate an existing project

Run project analysis and review its recommendation first. Accept or override, then lock it. Start an Epic using the locked profile and raise autonomy only for the stages you intend to delegate. `unattended` proceeds until a hard gate or unrecoverable blocker; it never opens a PR, posts a comment, publishes a package, merges the default branch, or performs a destructive change without a human decision.

## Recommendations

Facts and recommendations are separate. Facts include evidence paths and confidence. Recommendations include a workflow profile plus stage roles, skills, model tiers, reasons, and confidence. `project recommend` only writes a proposal. `recommend-accept` acknowledges it and `recommend-lock` makes it the durable selection consumed by new Epics and runtime model selection. Project Context never refreshes as a side effect of starting or running an Epic.

## Autonomy and gates

`.aidlc/autonomy.yaml` is the project default copied into new Epics. `guide` performs no model execution or mutation; `assist` can analyze but pauses before mutation; `auto` completes the current stage with bounded retry; `unattended` continues across stages. A per-stage change is audited in the active run projection.

Local Claude provider runs are scoped to the selected workspace. Read-only actions launch in Claude `plan` permission mode; mutation actions that have cleared AIDLC autonomy/gates launch in `acceptEdits`. Shell, network, and external tools still obey Claude/project permissions in addition to AIDLC's hard gates.

Every gate shows destination, content summary, and mutation scope. External communication, destructive changes, and default-branch merges are hard gates in every mode. Approval must be a user decision correlated to the durable gate id and exact preview. Rejection pauses the Epic. Provider/validator failures retry only up to `recovery.maxAttempts`, then block with a recovery action.

## Migration and rollback

`aidlc migration preview` is read-only. It correlates `.aidlc/deliveries`, flat `.aidlc/runs/*.json`, and `docs/epics/*/state.json` by logical Epic id and shows every source-to-target mapping. Apply requires both the preview id and `--confirm`. It backs up every source, creates unified projections, and imports source/history references into the append-only Epic audit log; it never deletes legacy files.

Rollback removes only unchanged files created by that manifest. If a target changed after migration, rollback stops rather than discarding user work. Backups and legacy sources remain available.

## Provider authoring

Implement the core `ModelProvider` interface: `discoverModels`, `resolve`, `execute`, and `validateConfiguration`. Descriptors advertise tiers, context size, tool support, latency, and cost. Never put provider-specific model ids in a workflow pack. The resolver returns a `ResolvedModel`; the runtime records it in `.aidlc/catalog/selection.lock.yaml`. Keep credentials in the provider environment or native credential store—`.aidlc/providers.yaml` stores only the default provider id.

Provider tests should use `FakeModelProvider` and prove resolution, missing capability diagnostics, execution output, credential isolation, and lock reproduction.

## Capability authoring

Register a `Capability` descriptor and provider without adding a new workflow state machine. Bundled capabilities (`ast-graph`, `artifact-annotation`) are enabled by default but may be disabled by project policy. Optional capabilities are absent/disabled until their provider is installed. Actions declare required capability ids; compilation fails if a required capability is unavailable.

Capabilities exposed in VS Code must still have an application/CLI or `/aidlc` path. AST graph belongs in Understand/code-impact context; annotation belongs on artifact/review surfaces. A capability may contribute evidence, diagnostics, tools, or adapters, but Epic/Run remains the only progress state.

## Durable files and recovery

- `.aidlc/project.yaml`: explicitly published Project Context.
- `.aidlc/epics/<id>/state.json`: fast Epic projection.
- `.aidlc/epics/<id>/events.ndjson`: Epic audit events.
- `.aidlc/epics/<id>/workflow.json`: authoritative compiled workflow.
- `.aidlc/runs/<run-id>/state.json`: active run projection.
- `.aidlc/runs/<run-id>/events.ndjson`: append-only run audit source.
- `.aidlc/runs/<run-id>/evidence/`: runtime evidence, not commit-eligible by default.

Atomic writes, optimistic revisions, event locks, and event snapshots protect crash recovery. If a command stops, run `aidlc epic status` or `explain`; do not edit run projections by hand.
