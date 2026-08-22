---
name: standardize-structure
description: Chốt cấu trúc chuẩn + quy tắc phân tầng, liệt kê chỗ code đang lệch.
---

# Standardize Structure

Load persona: `.claude/agents/project-architect.md`

Bước 2/5. Biến "cấu trúc đang có" thành **chuẩn viết ra được**, rồi chỉ đúng chỗ lệch.
Bước này có human review — chuẩn là quyết định của người, agent chỉ đề xuất theo đa số hiện hành.

## Nguyên tắc: đếm trước, kết luận sau

Mỗi quy tắc phải trả lời được *"bao nhiêu file theo, bao nhiêu file lệch?"*.
Quy tắc mà đa số hiện tại đang vi phạm → đó là **đề xuất**, vào `## Proposed Changes`, không được ghi như thể đã là chuẩn.

## Read first

1. `docs/project/context/PROJECT-SCAN.md` — bắt buộc
2. `src/AGENTS.md` — luật phân tầng người viết đã chốt. **Giữ nguyên câu chữ.**

## Output

### `docs/project/conventions/CONVENTIONS.md`

- `## Canonical Layout` — cây chuẩn, mỗi node kèm "cái gì được phép nằm ở đây"
- `## Naming Rules` — bảng: Loại | Pattern | Đúng | Sai | **Tuân thủ (n/tổng)**
- `## Layering Rules` — layer nào được import layer nào, và **cấm** chiều ngược lại
- `## Proposed Changes` — đề xuất đổi, kèm chi phí (số file). Trống thì ghi "Không đề xuất thay đổi."

### `docs/project/conformance/STRUCTURE-DRIFT.md`

- `## Drift Table` — bảng: ID | Quy tắc bị vi phạm | Đường dẫn | Mức độ | Đề xuất
- Mỗi dòng phải trỏ **đường dẫn thật**. Không có đường dẫn = không phải drift.
- Không có drift → giữ heading và ghi `Không phát hiện lệch chuẩn.`

## Rules

- **Không di chuyển / đổi tên file nào** — bước này chỉ viết docs
- Không hạ chuẩn để khớp code sai: code sai là drift, không phải lý do sửa quy tắc
