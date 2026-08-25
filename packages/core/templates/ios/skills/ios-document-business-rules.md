---
name: ios-document-business-rules
description: Ghi LUẬT NGHIỆP VỤ (không phải mô tả code) kèm evidence, và câu hỏi mở cho human.
---

# Document Business Rules

Bước 4/5 — **bước dễ làm sai nhất**. Yêu cầu là luật nghiệp vụ, không phải mô tả code.
Phép thử: xoá hết tên class trong artifact mà nội dung vẫn đọc hiểu được với người không biết Swift → đúng.

## Chép code (SAI) vs luật nghiệp vụ (ĐÚNG)

| SAI | ĐÚNG |
|---|---|
| `add(title:)` gọi `trimmingCharacters` rồi `throw .emptyTitle` nếu rỗng | Việc phải có tên. Tên chỉ toàn khoảng trắng bị coi là rỗng — người dùng không tạo được bản ghi vô danh rồi quên mất nó là gì. |
| `guard !items.contains { !$0.isDone && $0.title == title }` | Không được có hai bản ghi **chưa hoàn thành** trùng tên. Bản ghi đã xong không chặn — lặp lại một việc định kỳ là hợp lệ. |

Mỗi luật trả lời: **Khi nào áp dụng · Ràng buộc · Ngoại lệ · Hệ quả nếu vi phạm**.
*Cách* hệ thống thực thi luật chỉ nằm ở `**Evidence:**`.

## Read first

1. `docs/project/context/ARCHITECTURE-MAP.md` — bắt buộc
2. Type sở hữu state (store / service / repository) — nơi luật sống
3. Code ở tầng sở hữu state và history/version control, nếu có — chỉ dùng làm evidence cho luật đã tồn tại
4. `docs/project/domain/BUSINESS-RULES.md` — bản trước. Luật `Status: confirmed` giữ nguyên câu chữ.

## Luật hay ẩn ở đâu

- `guard` / `throw` trong tầng sở hữu state → điều kiện và ngoại lệ
- Thứ tự trong computed property lọc/sắp xếp danh sách → luật hiển thị
- Hằng số ngưỡng (`maxTitleLength = 120`) → **luôn hỏi "con số này từ đâu ra"**; không có nguồn thì
  đó là câu hỏi mở, không phải luật
- Tên API và luồng xử lý có thể gợi ý nơi kiểm tra, nhưng không tự chứng minh ý định nghiệp vụ

## Output

### `docs/project/domain/BUSINESS-RULES.md`

- `## Rule Index` — bảng: ID (`BR-n`) | Luật (một câu, ngôn ngữ nghiệp vụ) | Status | Evidence
- Mỗi luật một mục: Khi nào · Ràng buộc · Ngoại lệ · Hệ quả · `**Evidence:** path:line`
- `Status: inferred` mặc định. Lên `confirmed` chỉ khi có evidence code rõ ràng hoặc người xác nhận.
- ID tăng dần liên tục, không reset, không tái sử dụng.

### `docs/project/domain/RULE-OPEN-QUESTIONS.md`

- `## Unresolved` — bảng: câu hỏi | vì sao code không trả lời được | ai trả lời được
- Đây là **đầu ra hợp lệ**, không phải thất bại. Một ngưỡng không ai giải thích được thì phải nằm ở đây.

## Rules

- Không có `**Evidence:**` trỏ file thật → không được vào Rule Index, đẩy sang RULE-OPEN-QUESTIONS
- Không suy ý định từ tên hàm — phải đọc thân hàm hoặc bỏ qua
- Một luật một ID, không gộp
