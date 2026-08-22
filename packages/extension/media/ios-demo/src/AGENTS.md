# AGENTS — TodoKit (app code)

App demo cho AIDLC iOS pipeline. Swift Package, build bằng `swift build`, test bằng `swift test`.

## Kiến trúc

```
Sources/TodoKit/
  Domain/         Todo, TodoFilter, TodoError    — value type thuần, không phụ thuộc UI
  Data/           TodoStore, TodoPersisting      — nơi DUY NHẤT mutate state
  Presentation/   TodoListView, TodoRow          — SwiftUI, chỉ đọc + gọi lệnh
```

Luật phân tầng: `Presentation → Data → Domain`. Không có mũi tên ngược.
View **không** tự validate — mọi business rule nằm trong `TodoStore`.

## Lệnh

| Việc | Lệnh |
|---|---|
| Build | `cd src && swift build` |
| Test | `cd src && swift test` |
| Test một case | `cd src && swift test --filter testAddRejectsDuplicateActiveTitle` |

Gate của step `implement`: **`Build complete!`** + `swift test` xanh trước khi Mark step done.

## Quy ước

- Kiểu public phải có `public init` — package này là library.
- `TodoStore` là `@MainActor`; test store phải đánh dấu `@MainActor`.
- Chuỗi hiển thị viết tiếng Việt, đặt thẳng trong View (demo không có lớp localization).
- Thêm business rule mới → thêm test trong `TodoStoreTests` + một dòng `BR-n` trong
  `docs/project/domain/BUSINESS-RULES.md`.
