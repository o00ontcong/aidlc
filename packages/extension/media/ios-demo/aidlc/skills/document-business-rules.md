---
name: document-business-rules
description: Ghi LUẬT NGHIỆP VỤ (không phải mô tả code) kèm evidence, và câu hỏi mở cho human.
---

# Document Business Rules

Load persona: `.claude/agents/project-architect.md`

Bước 4/5 — **bước dễ làm sai nhất**. Yêu cầu là luật nghiệp vụ, không phải mô tả code.
Phép thử: xoá hết tên class trong artifact mà nội dung vẫn đọc hiểu được với người không biết Swift → đúng.

## Chép code (SAI) vs luật nghiệp vụ (ĐÚNG)

| SAI | ĐÚNG |
|---|---|
| `add(title:)` gọi `trimmingCharacters` rồi `throw .emptyTitle` nếu rỗng | Việc phải có tên. Tên chỉ toàn khoảng trắng bị coi là rỗng — người dùng không tạo được việc vô danh rồi quên mất nó là gì. |
| `guard !todos.contains { !$0.isDone && $0.title == title }` | Không được có hai việc **chưa hoàn thành** trùng tên. Việc đã xong không chặn — người dùng lặp lại một việc định kỳ là hợp lệ. |

Mỗi luật trả lời: **Khi nào áp dụng · Ràng buộc · Ngoại lệ · Hệ quả nếu vi phạm**.
*Cách* hệ thống thực thi luật chỉ nằm ở `**Evidence:**`.

## Read first

1. `docs/project/context/ARCHITECTURE-MAP.md` — bắt buộc
2. `src/Sources/TodoKit/Data/TodoStore.swift` — nơi luật sống
3. `src/Tests/TodoKitTests/TodoStoreTests.swift` — **test đã pass là luật đã được chứng minh**
4. `docs/project/domain/BUSINESS-RULES.md` — bản trước. Luật `Status: confirmed` giữ nguyên câu chữ.

## Luật hay ẩn ở đâu

- `guard` / `throw` trong `TodoStore` → điều kiện và ngoại lệ
- Thứ tự trong `visibleTodos` → luật hiển thị
- Hằng số ngưỡng (`maxTitleLength = 120`) → **luôn hỏi "con số này từ đâu ra"**; không có nguồn thì đó là câu hỏi mở, không phải luật
- Tên test → mô tả luật bằng ngôn ngữ người

## Output

### `docs/project/domain/BUSINESS-RULES.md`

- `## Rule Index` — bảng: ID (`BR-n`) | Luật (một câu, ngôn ngữ nghiệp vụ) | Status | Evidence
- Mỗi luật một mục: Khi nào · Ràng buộc · Ngoại lệ · Hệ quả · `**Evidence:** path:line`
- `Status: inferred` mặc định. Lên `confirmed` chỉ khi có **test chứng minh** hoặc người xác nhận.
- ID tăng dần liên tục, không reset, không tái sử dụng.

### `docs/project/domain/RULE-OPEN-QUESTIONS.md`

- `## Unresolved` — bảng: câu hỏi | vì sao code không trả lời được | ai trả lời được
- Đây là **đầu ra hợp lệ**, không phải thất bại. `maxTitleLength = 120` không ai giải thích được thì phải nằm ở đây.

## Rules

- Không có `**Evidence:**` → không được vào Rule Index, đẩy sang RULE-OPEN-QUESTIONS
- Không suy ý định từ tên hàm — phải đọc thân hàm hoặc bỏ qua
- Một luật một ID, không gộp
