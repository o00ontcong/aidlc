---
description: Publish Context — chỉ mục docs/ + khối aidlc:context + manifest
---

Run skill `.aidlc/skills/publish-context.md`.
Load persona from `.claude/agents/project-architect.md`.

Pipeline: `project-foundation` · step `publish-context`

## Input cần đọc

1. Toàn bộ `docs/project/`
2. `CLAUDE.md` hiện tại — BẮT BUỘC đọc trước khi ghi

## Output

- `docs/README.md`
- `docs/project/context/CONTEXT-MANIFEST.json`
- `CLAUDE.md (khối aidlc:context)`

Xong thì báo user click **Mark step done** trong AIDLC panel.
