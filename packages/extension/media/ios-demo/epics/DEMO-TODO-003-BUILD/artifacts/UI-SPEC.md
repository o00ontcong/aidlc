# UI Spec — DEMO-TODO-003-BUILD

**Status:** Ready
**Nguồn:** ảnh wireframe trong `screens/` (demo không dùng Figma MCP)

### Danh sách việc — `screens/todo-list.png`

| Thành phần | Thuộc tính | Giá trị | Nguồn |
|---|---|---|---|
| Dòng việc | chiều cao tối thiểu | 44 pt | suy đoán |
| Dòng việc | padding dọc | 4 pt | code |
| Vòng tròn trạng thái | đường kính | 20 pt | ảnh |
| Vòng tròn ↔ tiêu đề | khoảng cách | 12 pt | code |
| Nhãn "Quá hạn" | vị trí | ngay dưới tiêu đề, cùng lề trái | ảnh |
| Nhãn "Quá hạn" | kiểu chữ | `.caption2` đậm vừa | code |
| Nhãn "Quá hạn" | màu | đỏ hệ thống | ảnh |
| Nhãn "Quá hạn" | khoảng cách với tiêu đề | 2 pt | code |

#### Chuỗi hiển thị

| Khoá | Chuỗi |
|---|---|
| Nhãn trễ hạn | `Quá hạn` |

#### Trạng thái

- Việc **chưa xong** + có hạn ở quá khứ → hiện nhãn.
- Việc **đã xong** → không hiện nhãn, kể cả khi hạn đã qua.

#### Chỗ phải suy đoán

- **Chiều cao tối thiểu 44 pt** — ảnh wireframe không đo được chính xác; lấy theo chuẩn vùng chạm iOS. Human xác nhận trước khi coi là chốt.
