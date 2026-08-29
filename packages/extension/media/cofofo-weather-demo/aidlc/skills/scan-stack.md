---
name: scan-stack
description: Produce deterministic SwiftPM stack evidence for the SkyCast foundation.
argument-hint: "<FOUNDATION-EPIC>"
---

# Scan stack — $ARGUMENTS

Read `src/Package.swift`, `src/Sources/`, `src/Tests/`, and `src/AGENTS.md`. Write `docs/project/foundation/STACK-PROFILE.json` with exactly one supported stack: `ios-swift`, `swiftpm`, build system `swift`, evidence paths, detected Swift tools version and `confidence` at least `0.9`. Then render the same facts in `STACK-PROFILE.md`. Do not guess a second framework or package manager.

Run `cd src && swift build && swift test`; record the commands and their real outcomes in the Markdown view. The validator reads JSON, not prose.
