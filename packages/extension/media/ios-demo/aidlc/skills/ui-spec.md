---
name: ui-spec
description: Chốt spec UI (số đo + màu + chuỗi) từ ảnh màn trước khi code — viết UI-SPEC.md.
argument-hint: "<EPIC-KEY>"
---

# UI Spec — Epic $ARGUMENTS

Load persona: `.claude/agents/developer.md`

Cổng chốt cuối trước khi viết code: **đóng băng mọi số liệu UI vào một artifact human review được.**
Sau bước này `/implement` không suy đoán layout nữa.

## Nguồn sự thật của demo này

Demo chạy **không cần Figma MCP**. Nguồn là **ảnh wireframe** trong `docs/epics/$ARGUMENTS/screens/`
— đúng cơ chế fallback hợp lệ: khi không có Figma, ảnh human import là nguồn, và **phải ghi rõ trong
artifact rằng số liệu suy từ ảnh**, không phải đo từ design tool.

> Trong project thật có Figma MCP, nguồn sự thật là Figma và ảnh chỉ là fallback.
> Xem `docs/project/conventions/FIGMA-MCP.md` của project đó.

## Auto-skip khi không có UI

Đọc REQUIREMENT `## 4. Screens`. Nếu là `N/A — no UI change` → ghi
`# UI Spec — $ARGUMENTS` + `**Status:** N/A — no UI change` rồi **dừng ngay**.

## Read first

1. `docs/epics/$ARGUMENTS/artifacts/REQUIREMENT.md` §4 Screens
2. `docs/epics/$ARGUMENTS/artifacts/TASK-PLAN.md` — chỉ làm spec cho màn thuộc task trong plan
3. `docs/epics/$ARGUMENTS/screens/*.png` — **`Read` từng ảnh**, đây là nguồn
4. `src/Sources/TodoKit/Presentation/TodoListView.swift` — số đo đang dùng trong code

## Cách trích spec

Với mỗi màn: đọc ảnh, đối chiếu code hiện tại, ghi ra bảng.

- Số đo đọc được từ ảnh (thứ tự phần tử, có/không có, tương quan) → ghi là **quan sát**.
- Số đo *không* đọc chính xác được từ ảnh (padding chính xác bao nhiêu pt) → lấy từ code hiện tại và ghi `nguồn: code`, hoặc đề xuất giá trị và ghi `nguồn: suy đoán`.
- **Không trộn hai loại mà không nói rõ.** Cột `Nguồn` là bắt buộc.

## Output

`docs/epics/$ARGUMENTS/artifacts/UI-SPEC.md`, mỗi màn một mục:

- `### <Screen>` + ảnh nguồn
- Bảng: Thành phần | Thuộc tính | Giá trị | **Nguồn** (`ảnh` / `code` / `suy đoán`)
- `#### Chuỗi hiển thị` — text đúng từng chữ
- `#### Trạng thái` — rỗng / lỗi / loading nếu màn có
- `#### Chỗ phải suy đoán` — liệt kê thẳng, để human sửa trước khi code

## Rules

- **Không viết Swift code** — chỉ spec
- Không đoán im lặng: mọi giá trị `suy đoán` phải xuất hiện trong `#### Chỗ phải suy đoán`
- Ảnh màn thiếu cho một màn trong §4 → Open Question blocking, `Status: Draft`, không cho sang `/implement`
