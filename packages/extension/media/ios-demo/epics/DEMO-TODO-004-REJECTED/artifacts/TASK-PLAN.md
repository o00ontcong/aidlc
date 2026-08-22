# Task Plan — DEMO-TODO-004-REJECTED

**Date:** 2026-08-21

## Tasks

| ID | Việc | Tầng | File | AC phục vụ | Phụ thuộc |
|---|---|---|---|---|---|
| T-1 | Empty state khi danh sách rỗng | Presentation | `Presentation/TodoListView.swift` | AC-1 | — |
| T-2 | Banner lỗi khi trùng tên | Presentation | `Presentation/TodoListView.swift` | AC-2, AC-3 | — |

## Execution Order

`T-1 → T-2`

## Test Plan

| AC | Test |
|---|---|
| AC-2 | `testAddRejectsDuplicateActiveTitle` (đã có) |
| AC-1, AC-3 | Kiểm tra thủ công — demo chưa có UI test |

## Risks

- Cả hai task cùng sửa một file → làm tuần tự, không song song.
