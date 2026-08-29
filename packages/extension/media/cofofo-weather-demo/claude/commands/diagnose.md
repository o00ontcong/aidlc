---
description: Diagnose a SkyCast bug and write ROOT-CAUSE.md before implementation
---

Read the current epic input, `.aidlc/runs/$ARGUMENTS.json`, the active
Foundation context and the relevant Swift source/tests. Treat the task as a
bug only when observed behavior contradicts an already-defined expectation.
Write `docs/epics/$ARGUMENTS/artifacts/ROOT-CAUSE.md` with:

- current versus expected behavior and a concrete reproduction;
- the causal chain and affected invariant;
- the smallest failure oracle that a RED test can assert;
- limitations, production-only conditions, and any proposed RED waiver.

Do not edit production code. Tell the user to review this artifact in Canvas
and mark the `diagnose` step done.
