# Project Workspace: Step-by-Step Guide

Project Workspace gives a project one durable shared area and a separate work area for every task. Claude, Codex, and Cursor can work from the same project context while each task keeps its own scope, artifacts, status, and history.

## The three workflows

| Workflow | Use it for | Main result |
| --- | --- | --- |
| `project-context` | Initial project setup or a major architecture refresh | Charter, architecture, engineering rules, and shared context |
| `feature-spike` | Understanding and packaging a new request | A reviewable `MISSION.md` with scope and acceptance criteria |
| `feature-implement` | Building an approved mission | Implementation, optional bug resolution, and shipping evidence |

## 1. Initialize the shared area

1. Open **AIDLC Workspace** and select **Project**.
2. Choose **Create missing files** if the shared area is not initialized.
3. Review the four shared documents:
   - `AGENTS.md` — working rules every provider must follow.
   - `PROJECT.md` — product goals, architecture, constraints, and quality commands.
   - `STATUS.md` — completed work, active work, blockers, and the next priority.
   - `DECISIONS.md` — durable product and engineering decisions.
4. Keep these files concise and current. A new task should be able to understand the project by reading them before touching code.

## 2. Establish Project Context

Run this once for a new project, then repeat it only after a significant architecture or policy change.

1. Choose **New task**.
2. Use `PROJECT-CONTEXT` as the task ID.
3. Select `project-context`.
4. Describe the project, intended outcomes, constraints, and anything the provider must not infer.
5. Run `establish-baseline` with the selected provider.
6. Review the charter, architecture, feature catalog, screen catalog, engineering rules, and context review.
7. Reject with concrete feedback if the baseline is incomplete or inaccurate.
8. Approve the baseline only when the review verdict and graph coverage are trustworthy.
9. Run `publish-context` to publish the shared context for future tasks.

## 3. Start a feature task

Use a spike when the request still needs analysis, scoping, or acceptance criteria.

1. Choose **New task**.
2. Enter a stable task ID, such as `EPIC-003`, and a short title.
3. Select `feature-spike`.
4. In the project idea, include:
   - the problem and desired outcome;
   - in-scope and out-of-scope behavior;
   - known constraints;
   - examples or references;
   - the expected definition of done.
5. Select the relevant charter goals.
6. Create the task and run `package-mission`.
7. Review `MISSION.md`, especially scope, acceptance criteria, tasks, UI specification, flow, constraints, and definition of done.
8. Reject the step with specific feedback when anything is ambiguous, missing, or too broad.
9. Approve the spike when another provider could implement it without guessing.

## 4. Move from spike to implementation

1. Open the completed spike.
2. Choose **Start implement**.
3. The selected provider reads `MISSION.md` and creates one or more focused `feature-implement` tasks.
4. Keep independent changes in separate tasks. Split a mission when parts can be reviewed, tested, or shipped independently.

## 5. Implement with human review

Use **Guided** mode initially. It makes every provider action, artifact, and approval checkpoint visible.

1. Open an implementation task and run `implement`.
2. Before approving, inspect:
   - the Git diff;
   - changed files and tests;
   - `IMPLEMENTATION-SUMMARY.md`;
   - acceptance-criteria evidence;
   - task artifacts and step history.
3. Run the relevant application and quality commands yourself.
4. Reject with precise feedback if behavior, tests, documentation, or scope is wrong.
5. Approve `implement` only after the change works in the real application.
6. Run `resolve-bugs` when bugs were reported. Skip it when no bug-fix cycle is needed.
7. Run `ship` only after implementation and verification are complete.

**Provider-managed** mode can run consecutive steps in the selected provider terminal, but it must still stop at human gates. Use it after the workflow and project checks are reliable.

## 6. Finish and hand off a task

Before marking a task complete:

1. Update `STATUS.md` with what changed, what was verified, remaining risks, and the next priority.
2. Add material decisions to `DECISIONS.md`.
3. Confirm that the task contains its final artifacts and verification evidence.
4. Record the branch or pull request when the work is not yet on the default branch.
5. Mark the task complete only after the application has been run and reviewed.

## Parallel work

- Planning tasks may run in parallel safely.
- Give concurrent implementation tasks separate branches or worktrees.
- Review each task diff independently before integration.
- Use an integration branch when you need to test several tasks together before merging.
- Keep `STATUS.md` current so every provider knows which tasks, branches, and decisions already exist.

The workspace records coordination and evidence; it does not replace Git integration or application-level testing.
