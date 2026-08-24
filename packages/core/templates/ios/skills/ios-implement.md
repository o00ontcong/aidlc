---
name: ios-implement
description: Implement task theo TASK-PLAN + UI-SPEC, verify bằng swift build + swift test.
argument-hint: "<EPIC-KEY>"
---

# Implement — Epic $ARGUMENTS

## Read first

1. `docs/epics/$ARGUMENTS/artifacts/TASK-PLAN.md` — thứ tự task
2. `docs/epics/$ARGUMENTS/artifacts/UI-SPEC.md` — số đo đã chốt. `N/A` thì bỏ qua.
3. `docs/project/conventions/CONVENTIONS.md` + `PROJECT-SCAN.md` `## Build and Test Commands`
4. `docs/project/domain/BUSINESS-RULES.md` — luật đang có, **không được phá**

## Các bước

1. Làm lần lượt `T-1 → T-2 → …` theo `## Execution Order`.
2. Thứ tự trong một task: **Domain → Data → Presentation**.
3. Validate / business rule đặt trong tầng sở hữu state, **không** trong View.
4. Mỗi luật mới hoặc đổi → thêm/sửa test trong test target của package.
5. **Verify build thật** — bắt buộc, không được bỏ. Dùng đúng lệnh trong PROJECT-SCAN, ví dụ:

```bash
swift build 2>&1 | tail -5
swift test 2>&1 | tail -15
```

`Build complete!` và test xanh mới được coi là xong task.

6. Ghi `docs/epics/$ARGUMENTS/artifacts/IMPLEMENT-SUMMARY.md`.

## IMPLEMENT-SUMMARY bắt buộc có

- `## Task Progress` — mọi task có status
- `## Files Changed` — mỗi file `[New]` / `[Update]`
- `## Acceptance Criteria Coverage` — mỗi `AC-n` → test nào chứng minh
- `## UI-SPEC Conformance` — bám spec chưa, chỗ nào lệch và vì sao
- `## Build Evidence` — **dán output thật** của `swift build` và `swift test`, phải chứa `Build complete!`

## Rules

- Không scope ngoài TASK-PLAN
- Chưa `Build complete!` thì chưa xong — không Mark step done
- Không sửa test cho pass bằng cách nới lỏng assertion; sửa code
- Phá một `BR-n` đang `confirmed` → dừng, hỏi human, không tự quyết
- Dán output build thật vào `## Build Evidence`; **không viết lại từ trí nhớ**
