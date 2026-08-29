---
name: install-foundation
description: Record the installed text-only asset manifest for the demo foundation.
argument-hint: "<FOUNDATION-EPIC>"
---

# Install foundation assets — $ARGUMENTS

This fixture already ships its skill files. Do not download or execute ECC content. Create `INSTALLED-ASSETS.json` with `foundationRevision`, `catalogRevision: "demo-local"`, `assetHashes`, ownership markers, and a rollback note. Every listed asset must be a local `.md` file; validators are not catalog assets. The validator enforces this boundary.
