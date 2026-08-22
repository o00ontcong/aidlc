---
description: Create Plan — breakdown theo tầng
---

Run skill `.aidlc/skills/create-plan.md`.
Load persona from `.claude/agents/tech-lead.md`.

Pipeline: `ios-pipeline` · step `create-plan`

Epic key: `$ARGUMENTS`

## Input cần đọc

1. `REQUIREMENT.md` — bắt buộc, Status Ready
2. `docs/project/context/ARCHITECTURE-MAP.md` — luật phân tầng

## Output

- `docs/epics/$ARGUMENTS/artifacts/TASK-PLAN.md`

Xong thì báo user click **Mark step done** trong AIDLC panel.
