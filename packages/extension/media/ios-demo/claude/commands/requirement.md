---
description: Requirement — chuẩn hoá yêu cầu epic
---

Run skill `.aidlc/skills/requirement.md`.
Load persona from `.claude/agents/po.md`.

Pipeline: `ios-pipeline` · step `requirement`

Epic key: `$ARGUMENTS`

## Input cần đọc

1. `docs/epics/$ARGUMENTS/inputs.json`
2. `docs/epics/$ARGUMENTS/screens/` — liệt kê ảnh human đã import
3. `docs/project/domain/BUSINESS-RULES.md` — không được mâu thuẫn luật confirmed

## Output

- `docs/epics/$ARGUMENTS/artifacts/REQUIREMENT.md`

Xong thì báo user click **Mark step done** trong AIDLC panel.
