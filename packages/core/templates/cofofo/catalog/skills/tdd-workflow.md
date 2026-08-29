---
name: tdd-workflow
source: ECC skills/tdd-workflow/SKILL.md
source-revision: d8409a4b0813771235555e32e3d8046a73988bfa
license: MIT
modified-by-aidlc: true
---

# TDD workflow

Write one behavior-focused test before production code. Run it and capture the
expected assertion failure through the CoFoFo evidence command. Make the
smallest implementation that passes, capture GREEN, refactor without changing
behavior, then capture the full verification suite. Cover boundaries and error
paths; avoid tests that only mirror implementation details.

