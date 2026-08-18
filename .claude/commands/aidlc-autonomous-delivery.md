---
description: Run an entire AIDLC Cohesive Delivery autonomously.
model: claude-sonnet-5
---

# AIDLC Autonomous Delivery Master

You are the master executor for delivery `$ARGUMENTS`. Own the entire delivery
until it completes, a real external blocker occurs, or an unresolved question
needs a human answer. Do **not** stop after one phase and do not ask the user to
click "Mark step done" or approve a phase between phases.

## Source of truth

1. Read `.aidlc/deliveries/$ARGUMENTS/request.md` and
   `.aidlc/deliveries/$ARGUMENTS/state.json`.
2. Read `.aidlc/workspace.yaml`, its Cohesive pipelines
   (`project-context`, `feature-spike`, `feature-implement`), and
   every relevant agent/skill file under `.claude/` or `~/.claude/`.
3. Read existing run and epic state before resuming; preserve completed,
   validated work and continue from the first incomplete phase.

## Resume contract (mandatory)

- Treat `.aidlc/deliveries/$ARGUMENTS/state.json`, `.aidlc/runs/*.json`,
  and the matching epic `state.json` files as durable checkpoints.
- Never delete, recreate, reset, or overwrite a run, worktree, artifact, or
  approved phase that already exists and validates successfully.
- On a resumed invocation, locate the first phase whose state is
  `awaiting_work`, `pending`, `rejected`, or recorded as failed; retry only
  that incomplete phase and its required downstream dependants.
- Do not rerun an approved upstream phase merely because this master command
  was invoked again. Report the checkpoint selected before doing any work.

## Execute autonomously

1. Complete every configured project-context phase in dependency order.
2. Complete feature-implement from a complete MISSION.md: implement, resolve-bugs,
   and ship (one feature PR, human merge, then Reality sync).
   Optionally run feature-spike first to package MISSION.md; spike does not
   depend_on implement.
3. This delivery is one independent epic. Do not create or ask the user to
   manage work-package/worker epics, choose a worker count, or wait on an
   internal worker board. You may choose internal task decomposition yourself
   when it helps, but it is not a user-visible parallelism control.
4. For every phase, follow the corresponding namespaced command document as
   the authoritative persona, skill, input, output, and acceptance contract.
5. A phase with `human_review: true` is automatically approved once its
   declared outputs and auto-review validator pass, except `resolve-bugs`.
   That phase must remain `awaiting_review` until the user has tested the fix
   and explicitly approves it in AIDLC. Persist ordinary phases as `approved`
   in run state and `done` in epic state; do not create aggregate review.
6. Do not stop at `ship` solely because merge is a human GitHub action. Follow the
   checked-in ship policy exactly; if it allows an agent merge, merge and verify
   it. If it forbids agent merge, ask one explicit policy question — never
   invent a human approval or a merged status.
7. If a recoverable failure occurs, diagnose, repair, and retry that phase.
   Stop only for missing credentials, an unsafe/destructive action requiring
   consent, or a genuine unresolved product, architecture, or ship-policy
   question. State the exact question and the next command to resume.

Work visibly in this session: narrate stage transitions, commands,
validation results, and failures. Never invoke a global `aidlc` CLI.
