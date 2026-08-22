# Architecture — TodoKit

## Tầng

| Tầng | Chứa gì | Được import | Cấm import |
|---|---|---|---|
| Domain | `Todo`, `TodoFilter`, `TodoError` | Foundation | Data, Presentation, SwiftUI |
| Data | `TodoStore`, `TodoPersisting`, `InMemoryTodoPersistence` | Domain, Foundation | Presentation |
| Presentation | `TodoListView`, `TodoRow` | Domain, Data, SwiftUI | — |

## Luồng chính

```
Người dùng gõ tiêu đề → TodoListView.submit()
  → TodoStore.add(title:)         ← validate ở ĐÂY (BR-1, BR-2)
      → throws TodoError          → View hiện banner đỏ
      → append + persist()        → @Published todos đổi → View render lại
```

```
Chạm vòng tròn → TodoStore.toggle(id) → isDone.toggle() → persist()
  → visibleTodos sắp xếp lại (BR-4: chưa xong lên trước)
```

## Điểm cần biết trước khi sửa

- `visibleTodos` là nơi gộp **lọc + sắp xếp**. Đổi thứ tự hiển thị thì sửa ở đó, không sửa View.
- `persist()` được gọi sau *mọi* mutation. Thêm lệnh mutate mới mà quên gọi là mất dữ liệu.
- `InMemoryTodoPersistence` chỉ dành cho demo/test. Bản thật thay bằng implementation khác
  của `TodoPersisting` — `TodoStore` không cần đổi.
