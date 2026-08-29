---
name: verify
description: Run final independent Swift verification and disclose limits.
argument-hint: "<EPIC-KEY>"
---

# Verify — $ARGUMENTS

After review findings are disposed, capture a fresh full suite with:

```bash
aidlc cofofo evidence verify $ARGUMENTS --command swift.test
```

Write `TEST-REPORT.md` and `VERIFY.md`; `VERIFY.md` must contain
`## Final Verification`, the accepted ledger record id, result, limitations and
links to acceptance criteria. Canvas closes the verification boundary only
after core validates the tamper-evident ledger and project rules again.
