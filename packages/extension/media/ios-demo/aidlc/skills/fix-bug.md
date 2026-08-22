---
name: fix-bug
description: Phân tích bug → sửa nguồn gây lỗi, ghi BUG-LEDGER append-only với claimed/verified.
argument-hint: "<EPIC-KEY>"
---

# Fix Bug — Epic $ARGUMENTS

Load persona: `.claude/agents/tech-lead.md`

> **Step on-demand.** Chạy khi có bug. Không có bug → **Bỏ qua step này** (step có `skippable: true`),
> không cần viết artifact.

## Debug từ TRIỆU CHỨNG, không từ spec

| Triệu chứng | Tầng nghi ĐẦU TIÊN | KHÔNG phải |
|---|---|---|
| Thêm việc mà danh sách không đổi | `@Published` không phát / mutate ngoài `TodoStore` | View layout |
| Thứ tự hiển thị sai | `visibleTodos` (lọc + sắp xếp) | thứ tự trong `todos` |
| Dữ liệu mất sau khi thao tác | thiếu `persist()` sau mutation | tầng persistence |
| Validate không chạy | luật bị đặt nhầm trong View | `TodoStore` |

Hỏi trước khi đổ lỗi: *"state này do ai sở hữu và ai được phép đổi nó?"*

## Read first

1. `docs/epics/$ARGUMENTS/artifacts/BUG-LEDGER.md` — **đọc TRƯỚC** để không re-plan bug đã fix.
   Trùng một entry `verified` → hỏi human đây có phải regression không.
2. `docs/epics/$ARGUMENTS/artifacts/IMPLEMENT-SUMMARY.md`
3. `docs/project/domain/BUSINESS-RULES.md` — bug có thể là luật bị hiểu sai, không phải code sai

## Output

`docs/epics/$ARGUMENTS/artifacts/BUG-LEDGER.md` — **append-only**, chỉ thêm dòng, không sửa/xoá dòng cũ.
Bug ID tăng dần liên tục qua mọi lần chạy (B1, B2, …).

Mỗi entry: ID | Mô tả | **Category** (`logic`/`state`/`ui`/`rule-mismatch`/`regression`) |
Files touched | Verdict | **Status** | Verify evidence

## Verify gate

- Status mặc định là **`claimed`** — đã sửa nhưng chưa chứng minh.
- Lên **`verified`** chỉ khi có evidence: `swift build` + `swift test` xanh **và** một test mới tái hiện được bug cũ.
- **Evidence trống → tối đa `claimed`.** Đừng ghi `verified` để cho xong.
- Bug `claimed` còn treo là việc dở — lần sau đọc ledger phải nhặt lại.

## Verdict

| Verdict | Khi nào |
|---|---|
| `Fix requirement` | AC sai/thiếu — sửa REQUIREMENT rồi chạy lại từ đó |
| `Fix plan` | Breakdown sai tầng — sửa TASK-PLAN |
| `Redo implement` | Docs đúng, code lệch |
| `Rule was wrong` | Luật trong BUSINESS-RULES mô tả sai hành vi đúng — sửa luật, ghi rõ |

## Rules

- Không viết patch code trong artifact — ledger ghi kết quả, không ghi diff
- Sửa nguyên nhân, không vá triệu chứng ở View
