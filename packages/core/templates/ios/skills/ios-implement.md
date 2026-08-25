---
name: ios-implement
description: Implement task theo TASK-PLAN + UI-SPEC, verify bằng lệnh build của dự án.
argument-hint: "<EPIC-KEY>"
---

# Implement — Epic $ARGUMENTS

## Read first

1. `docs/epics/$ARGUMENTS/artifacts/TASK-PLAN.md` — thứ tự task
2. `docs/epics/$ARGUMENTS/artifacts/UI-SPEC.md` — số đo đã chốt. `N/A` thì bỏ qua.
3. `docs/project/conventions/CONVENTIONS.md` + `PROJECT-SCAN.md` `## Build Commands`
4. `docs/project/domain/BUSINESS-RULES.md` — luật đang có, **không được phá**

## Các bước

1. Làm lần lượt `T-1 → T-2 → …` theo `## Execution Order`.
2. Thứ tự trong một task: **Domain → Data → Presentation**.
3. Validate / business rule đặt trong tầng sở hữu state, **không** trong View.
4. **Verify build thật** — bắt buộc, không được bỏ. Dùng đúng lệnh trong PROJECT-SCAN, ví dụ:

```bash
swift build 2>&1 | tail -5
```

Với Xcode project, dùng lệnh `xcodebuild` đã được PROJECT-SCAN xác nhận. Chỉ coi task xong khi
lệnh build thành công.

5. Ghi `docs/epics/$ARGUMENTS/artifacts/IMPLEMENT-SUMMARY.md`.

## IMPLEMENT-SUMMARY bắt buộc có

- `## Task Progress` — mọi task có status
- `## Files Changed` — mỗi file `[New]` / `[Update]`
- `## Acceptance Criteria Coverage` — mỗi `AC-n` → build, repro hoặc review evidence nào chứng minh
- `## UI-SPEC Conformance` — bám spec chưa, chỗ nào lệch và vì sao
- `## Build Evidence` — **dán output thật** của lệnh build đã chạy

## Rules

- Không scope ngoài TASK-PLAN
- Chưa có build thành công thì chưa xong — không Mark step done
- Phá một `BR-n` đang `confirmed` → dừng, hỏi human, không tự quyết
- Dán output build thật vào `## Build Evidence`; **không viết lại từ trí nhớ**
