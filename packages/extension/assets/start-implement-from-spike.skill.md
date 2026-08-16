---
name: start-implement-from-spike
description: Analyze a completed feature-spike MISSION.md and scaffold one or more independent feature-implement epics. Invoke via /start-implement-from-spike <spike-epic-id>.
---

# Start implement from a feature spike

`$ARGUMENTS` is a completed `feature-spike` epic. Turn its approved output into implementation epics; do not implement application code in this command.

## Read and validate

1. Read `docs/epics/$ARGUMENTS/artifacts/MISSION.md`, `state.json`, and `inputs.json`.
2. Read the project charter and the repository paths named by the mission.
3. Treat `MISSION.md` as the source of truth. If it is incomplete, Draft, or contains an OQ blocking marker, stop and explain that the spike must be corrected first.

## Decide the split

Create **one** `feature-implement` epic when the mission is an atomic, cohesive change. Split into **multiple** epics only when the mission has genuinely independent, reviewable slices with a clear ownership boundary. Do not split merely to create parallelism; keep shared contracts, migrations, and tightly coupled UI/API work together. Record dependencies between slices explicitly.

Before creating anything, write `docs/epics/$ARGUMENTS/artifacts/IMPLEMENTATION-EPICS.md` with:

- the source spike id;
- the rationale for one or many slices;
- each proposed epic id, title, scope, owning Tasks/FR/AC, and dependencies.

## Scaffold each implementation epic

For each slice:

1. Choose a unique, stable id based on the spike id, such as `$ARGUMENTS-I1`, `$ARGUMENTS-I2`. Inspect `docs/epics/` first and never overwrite an existing epic.
2. Scaffold it through AIDLC, so it gets a normal state file and run state:

   ```sh
   aidlc epic start <new-id> --pipeline feature-implement --title "<title>" --desc "<short scope>" --input source_spike=$ARGUMENTS
   ```

3. Replace the newly seeded `docs/epics/<new-id>/artifacts/MISSION.md` with a **self-contained** slice of the source mission. It must retain every required heading: Summary, Problem / Goal, In scope, Out of scope, Functional requirements, Acceptance criteria, Constraints, Tasks, UI spec, Flow, and Definition of done. Keep only the FR/AC/tasks in that slice, state cross-epic dependencies under Constraints, and preserve the charter references.
4. Do **not** run `/feature-implement-implement`; leave every new epic ready at its implement step for the user to start or delegate later.

At the end, report the new epic ids and their dependencies. Do not modify application code, the source spike's `MISSION.md`, or its approval state.
