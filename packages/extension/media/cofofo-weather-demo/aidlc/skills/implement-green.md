---
name: implement-green
description: Make the approved RED test green with the smallest policy-conformant change.
argument-hint: "<EPIC-KEY>"
---

# Implement GREEN — $ARGUMENTS

Read the RED evidence and plan. Implement the smallest change in `Domain` and
`ForecastStore` required for the alert; do not put threshold logic in
`WeatherDashboardView`. Capture the full suite (which rebuilds the package) with:

```bash
aidlc cofofo evidence green $ARGUMENTS --command swift.test
```

Write `IMPLEMENT-SUMMARY.md` with `## Green Evidence`, the accepted ledger
record id, files changed, active rule IDs and acceptance-criterion coverage.
Canvas reviews the exact summary after machine evidence and project rules pass.
