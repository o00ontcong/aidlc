---
name: diagnose
description: Establish a reviewable root cause before a CoFoFo bugfix changes production code.
---

# Diagnose a SkyCast bug

Read the requirement, current run state, stack profile, project rules, and
concrete source/test paths. Reproduce the observed behavior when possible, then
write `ROOT-CAUSE.md` with the current behavior, expected behavior, causal
chain, affected invariant, scope, and a precise failure oracle. Distinguish a
bug from a missing feature. Do not edit production code in this phase.

The `diagnose` step is a mandatory Canvas gate for `cofofo-bugfix`. A request
for changes must be carried into the next revision; a provider cannot approve
this gate on behalf of the human reviewer.
