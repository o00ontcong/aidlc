---
description: UI Spec — chốt số đo từ ảnh màn
---

Run skill `.aidlc/skills/ui-spec.md`.
Load persona from `.claude/agents/developer.md`.

Pipeline: `ios-pipeline` · step `ui-spec`

Epic key: `$ARGUMENTS`

## Input cần đọc

1. `REQUIREMENT.md` §4 Screens
2. `docs/epics/$ARGUMENTS/screens/*.png` — **Read từng ảnh**, đây là nguồn
3. `src/Sources/TodoKit/Presentation/TodoListView.swift` — số đo đang dùng

## Output

- `docs/epics/$ARGUMENTS/artifacts/UI-SPEC.md`

Xong thì báo user click **Mark step done** trong AIDLC panel.
