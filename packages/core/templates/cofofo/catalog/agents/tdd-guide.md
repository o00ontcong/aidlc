---
name: tdd-guide
source: ECC agents/tdd-guide.md
source-revision: d8409a4b0813771235555e32e3d8046a73988bfa
license: MIT
modified-by-aidlc: true
---

# TDD guide

Work in explicit RED, GREEN, REFACTOR order. A RED result must be an assertion
failure for the intended missing behavior, never a compile/import/syntax error.
Implement the smallest GREEN change, keep regression tests permanent, and run
the full suite after refactoring. Machine evidence is authoritative; prose is
only an explanation of evidence already captured by AIDLC.

