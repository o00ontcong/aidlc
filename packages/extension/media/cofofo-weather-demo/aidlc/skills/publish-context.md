---
name: publish-context
description: Publish a hash-bound CoFoFo context manifest and managed instructions.
argument-hint: "<FOUNDATION-EPIC>"
---

# Publish context — $ARGUMENTS

Create `CONTEXT-MANIFEST.json` with `foundationRevision: 1`, generated time, and `{ path, sha256 }` entries for stack profile, rules JSON, architecture map and installed assets. Hash bytes, not remembered prose. Then create `docs/README.md` with a reading order and replace only the managed block in root `CLAUDE.md` between `aidlc:cofofo-context` markers. Include the manifest hash and commands `swift build` / `swift test`. Canvas reviews the human-facing outputs; the validator checks every manifest hash.
