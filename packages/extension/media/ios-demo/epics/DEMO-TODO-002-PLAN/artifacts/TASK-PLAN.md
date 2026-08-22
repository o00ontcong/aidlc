# Task Plan — DEMO-TODO-002-PLAN

**Date:** 2026-08-21
**Nguồn:** `REQUIREMENT.md` (Status: Ready)

## Tasks

| ID | Việc | Tầng | File | AC phục vụ | Phụ thuộc |
|---|---|---|---|---|---|
| T-1 | Thêm `dueDate` vào tham số tạo việc của store | Data | `Data/TodoStore.swift` | AC-1 | — |
| T-2 | Hiện nhãn "Quá hạn" trên dòng việc | Presentation | `Presentation/TodoListView.swift` | AC-1, AC-2, AC-3 | T-1 |
| T-3 | Test cho điều kiện quá hạn | Test | `Tests/TodoKitTests/TodoStoreTests.swift` | AC-1, AC-2, AC-3 | T-1 |
| T-4 | Xác nhận thứ tự sắp xếp không đổi | Test | `Tests/TodoKitTests/TodoStoreTests.swift` | AC-4 | T-1 |

## Execution Order

`T-1 → T-3 → T-2 → T-4`

Domain không đổi (`Todo.dueDate` và `isOverdue()` đã có sẵn) nên bắt đầu từ Data.

## Test Plan

| AC | Test |
|---|---|
| AC-1 | `testOverdueOnlyWhenUnfinished` (nhánh chưa xong) |
| AC-2 | `testOverdueOnlyWhenUnfinished` (nhánh sau toggle) |
| AC-3 | `testTodoWithoutDueDateIsNeverOverdue` (mới) |
| AC-4 | `testVisibleTodosPutActiveFirst` (đã có, chạy lại để chống regression) |

## Risks

- `isOverdue()` dùng `Date()` mặc định → test phải truyền `now` tường minh, nếu không sẽ flaky.
