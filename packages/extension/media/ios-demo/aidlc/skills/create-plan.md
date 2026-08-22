---
name: create-plan
description: Breakdown REQUIREMENT thành task nhỏ theo tầng — viết TASK-PLAN.md.
argument-hint: "<EPIC-KEY>"
---

# Create Plan — Epic $ARGUMENTS

Load persona: `.claude/agents/tech-lead.md`

## Read first

1. `docs/epics/$ARGUMENTS/artifacts/REQUIREMENT.md` — **bắt buộc**, `Status: Ready`
2. `docs/project/context/ARCHITECTURE-MAP.md` — luật phân tầng
3. `src/AGENTS.md` — quy ước app
4. Code trong tầng bị chạm. Nhiều hơn ~10 file → **fan-out Explore agent**, nhận về tóm tắt ≤1.5k token; main session không ôm nội dung file.

## Output

`docs/epics/$ARGUMENTS/artifacts/TASK-PLAN.md`, bắt buộc có:

- `## Tasks` — bảng: ID (`T-n`) | Việc | Tầng | File | AC phục vụ | Phụ thuộc
- `## Execution Order` — thứ tự chạy, không có cycle
- `## Test Plan` — mỗi AC ánh xạ tới ít nhất một test trong `TodoKitTests`
- `## Risks` — chỗ dễ vỡ, hoặc `Không có.`

## Quy tắc chia task

- Một task = một tầng hoặc một nhóm file liên quan. Task chạm cả Domain lẫn Presentation → tách đôi.
- Thứ tự mặc định: **Domain → Data → Presentation**. Validate luôn thuộc Data (`TodoStore`), không thuộc View.
- Mỗi AC trong REQUIREMENT phải được ít nhất một task phục vụ. AC không có task = thiếu sót, không phải "để sau".

## Rules

- Không implement code
- Không thêm scope ngoài REQUIREMENT
- Không đặt validate vào View — vi phạm luật phân tầng trong ARCHITECTURE-MAP
