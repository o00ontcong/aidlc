---
name: ios-requirement
description: Chuẩn hoá yêu cầu epic thành REQUIREMENT.md đủ thông tin cho bước create-plan.
argument-hint: "<EPIC-KEY>"
---

# Requirement — Epic $ARGUMENTS

## Read first

1. `docs/epics/$ARGUMENTS/inputs.json` — mô tả thô, link design, ghi chú
2. `docs/epics/$ARGUMENTS/screens/` — **liệt kê file ảnh human đã import**
3. `docs/project/context/PROJECT-CONTEXT.md` — hệ thống làm gì (do pipeline nền sinh ra)
4. `docs/project/domain/BUSINESS-RULES.md` — luật đã có; yêu cầu mới **không được mâu thuẫn** với
   luật `confirmed`

## Screen mapping (bắt buộc khi có UI)

Bảng §4 với 4 cột: Screen | Change | Screen file | View/Type trong source.

- **Screen file** — path tương đối `screens/<file>` từ folder epic, hoặc link Figma khi có Figma MCP.
  Không có nguồn nào → Open Question **blocking**, giữ `Status: Draft`.
- **View/Type** — map tới type Swift **có thật** (đọc code, theo `ARCHITECTURE-MAP.md`), hoặc tên đề
  xuất cho màn mới.
- **Không bịa mapping.** Không chắc → Open Question, không điền sai.

## Output

`docs/epics/$ARGUMENTS/artifacts/REQUIREMENT.md`, bắt buộc có:

- `## 1. Summary` — 1–2 câu
- `## 2. Problem / Goal`
- `## 3. Scope` — In scope / Out of scope
- `## 4. Screens` — bảng 4 cột, hoặc `N/A — no UI change`
- `## 5. Screen Flow` — mermaid `flowchart TD`, node khớp cột Screen
- `## 6. Acceptance Criteria` — **có thể kiểm chứng**, mỗi AC một dòng `AC-n`
- `## 7. Business Rule Impact` — luật `BR-n` nào bị chạm; luật mới đề xuất
- `## 8. Open Questions` — blocking khi thiếu nguồn design / mapping

Set `**Status:** Ready` chỉ khi §8 không còn dòng blocking.

## Rules

- Không implement code, không sửa source
- Đọc `screens/` trước khi viết bảng — không bỏ qua file human đã import
- AC phải kiểm chứng được bằng một thao tác hoặc evidence cụ thể; "UI đẹp hơn" không phải AC
- Mâu thuẫn với `BR-n` đang `confirmed` → Open Question blocking, không tự ghi đè luật
