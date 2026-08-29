---
name: test-red
description: Establish a meaningful failing SkyCast regression test before production changes.
argument-hint: "<EPIC-KEY>"
---

# Test RED — $ARGUMENTS

Implement the planned test in `src/Tests/SkyCastTests/ForecastStoreTests.swift`
before changing production code. Its name must be
`testHighTemperatureAlertRequiresThreshold`. Capture the failing assertion with:

```bash
aidlc cofofo evidence red $ARGUMENTS \
  --command swift.test-targeted \
  --target testHighTemperatureAlertRequiresThreshold \
  --expected "heat alert missing"
```

Compile/import/syntax failures are rejected by the RED oracle. Write
`RED-EVIDENCE.md` with `## Expected Failure` and the accepted ledger record id;
Markdown output is not a substitute for the machine record.
