---
name: ios-ui-spec
description: Chốt spec UI (số đo + màu + chuỗi) trước khi code — viết UI-SPEC.md.
argument-hint: "<EPIC-KEY>"
---

# UI Spec — Epic $ARGUMENTS

Cổng chốt cuối trước khi viết code: **đóng băng mọi số liệu UI vào một artifact human review được.**
Sau bước này bước `implement` không được suy đoán layout nữa.

## Nguồn sự thật

Theo thứ tự ưu tiên:

1. **Figma MCP** — khi project có, đây là nguồn sự thật. Đo từ node thật, ghi node id.
2. **Ảnh wireframe / screenshot** trong `docs/epics/$ARGUMENTS/screens/` — fallback hợp lệ khi không
   có Figma. Khi dùng fallback, **phải ghi rõ trong artifact rằng số liệu suy từ ảnh**, không phải
   đo từ design tool.

## Auto-skip khi không có UI

Đọc REQUIREMENT `## 4. Screens`. Nếu là `N/A — no UI change` → ghi
`# UI Spec — $ARGUMENTS` + `**Status:** N/A — no UI change` rồi **dừng ngay**.

## Read first

1. `docs/epics/$ARGUMENTS/artifacts/REQUIREMENT.md` §4 Screens
2. `docs/epics/$ARGUMENTS/artifacts/TASK-PLAN.md` — chỉ làm spec cho màn thuộc task trong plan
3. Nguồn design: Figma node, hoặc `docs/epics/$ARGUMENTS/screens/*.png` — **`Read` từng ảnh**
4. View code hiện tại của màn liên quan — số đo đang dùng thật

## Cách trích spec

Với mỗi màn: đọc nguồn design, đối chiếu code hiện tại, ghi ra bảng.

- Giá trị đo được từ nguồn design → ghi `nguồn: design`.
- Giá trị *không* đọc chính xác được từ nguồn (padding bao nhiêu pt) → lấy từ code hiện tại và ghi
  `nguồn: code`, hoặc đề xuất giá trị và ghi `nguồn: suy đoán`.
- **Không trộn hai loại mà không nói rõ.** Cột `Nguồn` là bắt buộc.

## Output

`docs/epics/$ARGUMENTS/artifacts/UI-SPEC.md`, mỗi màn một mục:

- `### <Screen>` + nguồn (Figma node id hoặc file ảnh)
- Bảng: Thành phần | Thuộc tính | Giá trị | **Nguồn** (`design` / `code` / `suy đoán`)
- `#### Chuỗi hiển thị` — text đúng từng chữ
- `#### Trạng thái` — rỗng / lỗi / loading nếu màn có
- `#### Chỗ phải suy đoán` — liệt kê thẳng, để human sửa trước khi code

## Rules

- **Không viết Swift code** — chỉ spec
- Không đoán im lặng: mọi giá trị `suy đoán` phải xuất hiện trong `#### Chỗ phải suy đoán`
- Thiếu nguồn design cho một màn trong §4 → Open Question blocking, `Status: Draft`, không cho sang
  bước `implement`
