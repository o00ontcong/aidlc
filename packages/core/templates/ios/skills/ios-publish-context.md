---
name: ios-publish-context
description: Xuất bản nền — chỉ mục docs/, khối chỉ dẫn AI trong CLAUDE.md, và CONTEXT-MANIFEST.json mở khoá pipeline con.
---

# Publish Context

Bước 5/5. Gộp các artifact rời rạc thành **một đường vào duy nhất**, rồi đóng dấu bằng manifest.
`aidlc-ios-feature` khai `requires` manifest này — **chưa publish thì không epic nào đóng được bước
`requirement`**.

## Nguyên tắc: chỉ mục, không phải bản sao

File root và `docs/README.md` **trỏ tới** nội dung, không chép lại.
Chép lại = hai nguồn sự thật = một cái sẽ cũ đi trong im lặng.
Giới hạn: khối marker ≤ 40 dòng, `docs/README.md` ≤ 80 dòng.

## Read first

1. `docs/project/context/PROJECT-CONTEXT.md`, `ARCHITECTURE-MAP.md`
2. `docs/project/conventions/CONVENTIONS.md`
3. `docs/project/domain/BUSINESS-RULES.md`
4. `CLAUDE.md` hiện tại — **bắt buộc đọc trước khi ghi**

## Bảo toàn nội dung human đã viết

`CLAUDE.md` chứa quy tắc người viết tay. **Không được mất.** Chỉ quản lý phần giữa hai marker:

```
<!-- aidlc:context start · revision N -->
… phần do skill này sinh ra …
<!-- aidlc:context end -->
```

- Chưa có marker → **append** vào cuối, không đụng nội dung cũ.
- Đã có → chỉ thay phần trong khối, tăng `revision`.

## Output

1. **`docs/README.md`** — `## Reading Order` (bảng có thứ tự: đọc file nào, trả lời câu hỏi gì) và
   `## Map` (mỗi thư mục con chứa gì, bước nào ghi ra).
2. **Khối `aidlc:context` trong `CLAUDE.md`** — một câu hệ thống là gì · 4 đường dẫn phải đọc ·
   `INV-n` một dòng mỗi cái · hai pipeline và trigger · câu chốt "chi tiết ở docs/README.md".
3. **`docs/project/context/CONTEXT-MANIFEST.json`**

```json
{ "schemaVersion": 1, "revision": 1, "generatedAt": "<ISO8601>",
  "artifacts": { "<path>": "<sha256>" },
  "openQuestions": <số dòng ## Unresolved> }
```

## Verify trước khi đóng bước

- [ ] Mọi đường dẫn nhắc trong `docs/README.md` và khối marker **tồn tại thật** (`test -f`, không tin trí nhớ)
- [ ] Nội dung ngoài marker trong `CLAUDE.md` không đổi một byte
- [ ] `docs/README.md` ≤ 80 dòng

Không tick được mục nào → chưa publish, sửa rồi làm lại.

## Rules

- Không sửa source
- Không chép nội dung artifact vào file chỉ mục — chỉ trỏ đường dẫn
