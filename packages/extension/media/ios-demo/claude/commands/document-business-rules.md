---
description: Document Business Rules — luật nghiệp vụ kèm evidence
---

Run skill `.aidlc/skills/document-business-rules.md`.
Load persona from `.claude/agents/project-architect.md`.

Pipeline: `project-foundation` · step `document-business-rules`

## Input cần đọc

1. `ARCHITECTURE-MAP.md` — bắt buộc
2. `src/Sources/TodoKit/Data/TodoStore.swift` — nơi luật sống
3. `src/Tests/TodoKitTests/TodoStoreTests.swift` — test pass = luật đã chứng minh

## Output

- `docs/project/domain/BUSINESS-RULES.md`
- `docs/project/domain/RULE-OPEN-QUESTIONS.md`

Xong thì báo user click **Mark step done** trong AIDLC panel.
