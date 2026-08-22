---
name: map-system
description: Bản đồ hệ thống cho AI — layer map, luồng chính, và trang đọc-trước-tiên.
---

# Map System

Load persona: `.claude/agents/project-architect.md`

Bước 3/5. Người đọc đầu ra này là **agent sắp sửa code mà chưa biết gì về repo**. Viết cho đối tượng đó.

## Test để biết đã đủ chưa

Trả lời được 4 câu bằng chính artifact vừa viết, nếu không thì chưa xong:

1. Tôi phải thêm một luật validate — sửa file nào, tầng nào?
2. Tôi muốn đổi cách sắp xếp danh sách — sửa ở đâu, ai bị ảnh hưởng?
3. Cái gì **cấm** đụng, phá thì hỏng gì?
4. Đọc theo thứ tự nào để hiểu hệ thống trong 10 phút?

## Read first

1. `docs/project/context/PROJECT-SCAN.md` + `docs/project/conventions/CONVENTIONS.md` — bắt buộc
2. `src/docs/ARCHITECTURE.md` — **trích dẫn và trỏ tới, đừng viết lại từ đầu**
3. Thân hàm của `TodoStore` — nơi mọi mutation đi qua

## Output

### `docs/project/context/ARCHITECTURE-MAP.md`

- `## Layer Map` — mỗi layer: trách nhiệm · import gì · **cấm** import gì · thư mục
- `## Module Dependency Graph` — một khối ```mermaid `flowchart TD`, node khớp tên trong PROJECT-SCAN
- `## Critical Paths` — 2–3 luồng quan trọng, mỗi luồng `A → B → C` kèm file từng chặng

### `docs/project/context/PROJECT-CONTEXT.md` — **≤120 dòng**

- `## Read This First` — hệ thống làm gì, cho ai, 5–10 dòng
- `## Reading Order` — đọc file nào, để trả lời câu hỏi gì
- `## Invariants` — `INV-n` kèm hậu quả nếu phá
- `## Where Things Live` — bảng tra nhanh "muốn làm X → sửa ở Y"

## Rules

- Không viết code, không sửa `src/`
- Mermaid dùng `flowchart TD`, node khớp tên module thật — không bịa tên đẹp
- PROJECT-CONTEXT vượt 120 dòng = viết sai đối tượng, cắt bớt và đẩy chi tiết sang ARCHITECTURE-MAP
