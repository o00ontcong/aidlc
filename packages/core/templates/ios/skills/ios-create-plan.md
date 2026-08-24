---
name: ios-create-plan
description: Breakdown REQUIREMENT thành task nhỏ theo tầng — viết TASK-PLAN.md.
argument-hint: "<EPIC-KEY>"
---

# Create Plan — Epic $ARGUMENTS

## Read first

1. `docs/epics/$ARGUMENTS/artifacts/REQUIREMENT.md` — **bắt buộc**, `Status: Ready`
2. `docs/project/context/ARCHITECTURE-MAP.md` — luật phân tầng
3. `docs/project/conventions/CONVENTIONS.md` — quy ước code
4. Code trong tầng bị chạm. Nhiều hơn ~10 file → **fan-out Explore agent**, nhận về tóm tắt
   ≤1.5k token; main session không ôm nội dung file.

## Output

`docs/epics/$ARGUMENTS/artifacts/TASK-PLAN.md`, bắt buộc có:

- `## Tasks` — bảng: ID (`T-n`) | Việc | Tầng | File | AC phục vụ | Phụ thuộc
- `## Execution Order` — thứ tự chạy, không có cycle
- `## Test Plan` — mỗi AC ánh xạ tới ít nhất một test trong test target của package
- `## Risks` — chỗ dễ vỡ, hoặc `Không có.`

## Quy tắc chia task

- Một task = một tầng hoặc một nhóm file liên quan. Task chạm cả Domain lẫn Presentation → tách đôi.
- Thứ tự mặc định: **Domain → Data → Presentation**. Validate thuộc tầng sở hữu state, không thuộc View.
- Mỗi AC trong REQUIREMENT phải được ít nhất một task phục vụ. AC không có task = thiếu sót, không
  phải "để sau".

## Rules

- Không implement code
- Không thêm scope ngoài REQUIREMENT
- Không đặt validate vào View — vi phạm luật phân tầng trong ARCHITECTURE-MAP
