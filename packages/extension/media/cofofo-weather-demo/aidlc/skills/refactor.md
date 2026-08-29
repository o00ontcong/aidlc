---
name: refactor
description: Preserve green behavior while improving the Swift design and capture separate REFACTOR evidence.
---

# Refactor

Keep the full suite green while improving names, boundaries, and duplication. Run:

```bash
aidlc cofofo evidence refactor <run-id> --command swift.test
```

Write `REFACTOR-EVIDENCE.md` with `## Refactor Evidence`, the ledger record id,
the exact structural changes, and confirmation that behavior did not change.
Do not reuse the GREEN record: REFACTOR is a distinct execution boundary.
