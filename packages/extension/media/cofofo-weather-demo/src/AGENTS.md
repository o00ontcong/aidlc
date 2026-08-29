# AGENTS — SkyCast fixture (manifest-only, no app code)

`Package.swift` is the only file here. There is no `Sources/` or `Tests/` —
this demo is a documentation-level illustration of a CoFoFo SwiftPM project,
not a buildable app. Every Foundation/delivery artifact (STACK-PROFILE,
PROJECT-RULES, ARCHITECTURE-MAP, TASK-PLAN, evidence logs, …) cites realistic
paths — `Sources/SkyCast/Domain`, `Sources/SkyCast/Data`,
`Sources/SkyCast/Presentation`, `Tests/SkyCastTests` — as prose, matching what
a real SkyCast checkout would look like, without shipping the code itself.

If you need to actually run `swift build` / `swift test` against this
fixture, add real source under those paths first — the manifest declares no
targets, so there is nothing to compile as-is.
