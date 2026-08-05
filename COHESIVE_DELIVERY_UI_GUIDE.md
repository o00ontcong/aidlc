# Hướng dẫn sử dụng Cohesive Delivery trên UI

Tài liệu này dành cho người mới đã cài AIDLC extension và đang mở project cần làm việc trong VS Code hoặc Cursor.

## 1. Cài Cohesive Delivery vào project

1. Nhấn biểu tượng **AIDLC** trên Activity Bar.
2. Trong sidebar AIDLC, mở phần **Workflows**.
3. Trong nhóm **Common**, chọn **Cohesive Delivery**.
4. Nếu project đã có `.aidlc/workspace.yaml`, UI sẽ hiện hộp thoại **Apply template**:
   - Nhấn **Overwrite & apply**.
   - Implementation hiện tại merge thêm các thành phần chưa có và giữ lại workflow cũ có ID khác.
5. Khi VS Code hỏi cài agents và skills vào `~/.claude/`, nhấn **Install**.
6. Chờ thông báo **Applied preset `cohesive-delivery`**.
7. Có thể chọn **Open Builder** để mở Workspace Builder.
8. Mở tab **Workflows** và kiểm tra có đủ ba pipeline:

   - `project-context` — 4 steps;
   - `cohesive-feature` — 12 steps;
   - `cohesive-work-package` — 5 steps.

> **Lưu ý về badge:** trong một số view hiện tại, chỉ `cohesive-feature` có badge built-in. Hai pipeline còn lại có thể nằm trong nhóm **Your pipelines**. Đây chỉ là khác biệt hiển thị, không ảnh hưởng chức năng.

## 2. Cách thao tác một step

Mỗi step trong Epic card thường đi qua chu trình sau:

1. Nhấn **Run with Claude**.
2. Extension tự mở một terminal Claude mới và chạy đúng slash command.
3. Chờ Claude hoàn thành công việc và artifact.
4. Quay lại Epic card.
5. Nhấn **Mark step done**.
6. Nếu xuất hiện **Run auto-review**, nhấn nút đó.
7. Nếu xuất hiện **Approve / Reject**:
   - Đọc và kiểm tra artifact;
   - Nhấn **Approve** để sang bước tiếp theo;
   - Hoặc nhấn **Reject** và nhập lý do cần sửa.
8. Nếu auto-review hoặc human review reject:
   - Đọc lý do reject trên step;
   - Nhấn **Rerun**;
   - Chạy lại step với feedback.

> **Quan trọng:** hãy tạo các run của Cohesive Delivery bằng nút **Start Epic**. Không dùng nút **Run** trực tiếp trên Pipeline card, vì `Start Epic` mới tạo đầy đủ `state.json`, `inputs.json` và thư mục artifacts mà các workflow này cần.

## 3. Khởi tạo Project Context

Project Context là nguồn thông tin chung về kiến trúc, domain, shared contracts và engineering rules của repository. Hãy hoàn thành pipeline này trước feature đầu tiên.

### 3.1 Tạo Project Context epic

1. Trong AIDLC sidebar, nhấn **Start Epic**.
2. Trong phần **Workflow**, chọn `project-context`.
3. Điền thông tin, ví dụ:

   - **Epic id:** `PROJECT-CONTEXT-001`
   - **Title:** `Initialize project context`
   - **Description:** mô tả ngắn project và mục tiêu quét context.

4. Nhấn **Start epic**.
5. Mở Epic card `PROJECT-CONTEXT-001`.

### 3.2 Chạy các step

Chạy lần lượt:

1. `scan-project`
2. `model-project`
3. `review-context`
4. `publish-context`

Tại `review-context`:

1. Đọc `CONTEXT-REVIEW.md`.
2. Chỉ nhấn **Approve** khi verdict là `GO`.

Tại `publish-context`:

1. Nhấn **Mark step done**.
2. Nhấn **Run auto-review**.
3. Nhấn **Approve** nếu validator pass.

Sau khi hoàn tất, project phải có các file:

```text
docs/project/context/
├── PROJECT-SCAN.md
├── PROJECT-CONTEXT.md
├── ARCHITECTURE-MAP.md
├── DOMAIN-MODEL.md
├── SHARED-CONTRACTS.md
├── ENGINEERING-RULES.md
├── CONTEXT-REVIEW.md
└── CONTEXT-MANIFEST.json
```

## 4. Tạo Feature Coordinator

Ví dụ trong phần này sử dụng feature ID `EPIC-123`.

### 4.1 Tạo feature epic

1. Nhấn **Start Epic**.
2. Chọn workflow `cohesive-feature`.
3. Điền:

   - **Epic id:** `EPIC-123`
   - **Title:** tên feature rõ ràng;
   - **Description / requirement:** mô tả yêu cầu đủ chi tiết, gồm mục tiêu và phạm vi.

4. Nếu cần, điền thêm **Capability inputs**, ví dụ file scope hoặc GitHub repository.
5. Nhấn **Start epic**.

### 4.2 Chạy phần đầu của feature

Chạy lần lượt:

1. `capture-context`
2. `specify`
3. `clarify`
4. `plan`
5. `tasks-package`
6. `analyze-contract`

Các review quan trọng:

- `clarify`: human review;
- `plan`: human review;
- `tasks-package`: auto-review và human review;
- `analyze-contract`: auto-review và human review.

Sau `analyze-contract`, kiểm tra thư mục sau:

```text
docs/epics/EPIC-123/artifacts/
├── PROJECT-CONTEXT-SNAPSHOT.md
├── SPEC.md
├── PLAN.md
├── TASKS.md
├── WORK-PACKAGES.json
├── ANALYSIS.md
└── FEATURE-CONTRACT.md
```

### 4.3 Xác định các work package

1. Mở `WORK-PACKAGES.json`.
2. Xem danh sách package và `runId` của từng package, ví dụ:

```json
{
  "id": "WP-01",
  "runId": "EPIC-123-WP-01"
}
```

3. Khi feature chuyển tới `await-packages`, tạm dừng ở đó.
4. Chưa chạy `await-packages` cho đến khi tất cả worker cần thiết đã hoàn thành.

## 5. Tạo một Work Package worker

Ví dụ dưới đây tạo worker cho `WP-01` của feature `EPIC-123`.

### 5.1 Tạo worker epic

1. Nhấn **Start Epic**.
2. Chọn `cohesive-work-package`.
3. Điền:

   - **Epic id:** đúng bằng `runId` trong `WORK-PACKAGES.json`, ví dụ `EPIC-123-WP-01`;
   - **Title:** `EPIC-123 — WP-01`;
   - **Description:** `Execute WP-01 for EPIC-123`.

4. Nhấn **Start epic**.
5. Mở Epic card `EPIC-123-WP-01`.

### 5.2 Khai báo feature và package cho worker

UI hiện tại chưa có field riêng cho `feature_id` và `package_id`. Thực hiện như sau:

1. Trên Epic card, nhấn **Open inputs.json**.
2. Thêm hai field sau:

```json
{
  "feature_id": "EPIC-123",
  "package_id": "WP-01"
}
```

3. Nếu file đã có field khác, giữ nguyên chúng và chỉ thêm `feature_id`, `package_id`.
4. Lưu `inputs.json` trước khi chạy `load-package`.

### 5.3 Chạy worker

Chạy lần lượt:

1. `load-package`
2. `prepare-worktree`
3. `implement-package`
4. `package-test`
5. `publish-result`

Gate tương ứng:

- `load-package`: auto-review;
- `prepare-worktree`: auto-review;
- `implement-package`: human review;
- `package-test`: artifact validation;
- `publish-result`: auto-review và human review.

Worker hoàn thành khi có đủ:

```text
docs/epics/EPIC-123-WP-01/artifacts/
├── PACKAGE-CONTEXT.md
├── WORKTREE-STATE.json
├── IMPLEMENT-STATE.md
├── PACKAGE-SUMMARY.md
├── PACKAGE-TEST-REPORT.md
└── PACKAGE-RESULT.json
```

## 6. Chạy nhiều worker song song

Giả sử `WORK-PACKAGES.json` có hai package độc lập là `WP-01` và `WP-02`.

### 6.1 Tạo các worker runs

Tạo worker thứ nhất:

- Epic id: `EPIC-123-WP-01`
- `feature_id`: `EPIC-123`
- `package_id`: `WP-01`

Tạo worker thứ hai:

- Epic id: `EPIC-123-WP-02`
- `feature_id`: `EPIC-123`
- `package_id`: `WP-02`

### 6.2 Chạy song song

1. Mở worker `EPIC-123-WP-01` và nhấn **Run with Claude**.
2. Không cần chờ toàn bộ pipeline WP-01 kết thúc.
3. Mở worker `EPIC-123-WP-02` và nhấn **Run with Claude**.
4. Extension tạo terminal Claude riêng cho mỗi lần chạy.
5. Chuyển qua lại giữa các Epic card để:
   - Mark step done;
   - Run auto-review;
   - Approve hoặc Reject;
   - Chạy step tiếp theo.

Mỗi worker có:

- RunState riêng;
- Branch riêng;
- Worktree riêng;
- Artifact directory riêng.

> Chỉ chạy song song những package không phụ thuộc nhau. Nếu package có `dependsOn`, hãy chờ package dependency tạo `PACKAGE-RESULT.json` hợp lệ trước. Validator sẽ reject worker bắt đầu quá sớm.

## 7. Thu kết quả về Feature Coordinator

Sau khi tất cả worker cần thiết đã tạo `PACKAGE-RESULT.json` hợp lệ:

1. Quay lại Epic `EPIC-123`.
2. Mở step `await-packages`.
3. Nhấn **Run with Claude**.
4. Claude đọc package results và tạo:

   - `PACKAGE-RESULTS.md`;
   - `TASK-BOARD.md`.

5. Nhấn **Mark step done**.
6. Nhấn **Run auto-review**.
7. Nếu validator xác nhận mọi package dùng đúng context và contract revision, nhấn **Approve**.

Nếu auto-review reject, thông báo sẽ chỉ rõ package gặp vấn đề, ví dụ:

- Thiếu `PACKAGE-RESULT.json`;
- Sai Feature Contract hash;
- Project Context revision đã stale;
- Package chưa ở trạng thái merge-ready;
- Package deferred nhưng thiếu danh sách deferred tasks.

## 8. Tích hợp và hoàn tất feature

Sau khi `await-packages` được approve, tiếp tục trên Epic `EPIC-123`.

### 8.1 `integrate`

1. Nhấn **Run with Claude**.
2. Claude tích hợp package branches theo dependency order.
3. Đọc `INTEGRATION-SUMMARY.md`.
4. Mark step done và **Approve** nếu kết quả đúng.

### 8.2 `integration-context`

1. Nhấn **Run with Claude**.
2. Kiểm tra `INTEGRATION-CONTEXT.md` phản ánh code thực tế sau tích hợp.
3. Nhấn **Mark step done**.

### 8.3 `cohesion-review`

1. Nhấn **Run with Claude**.
2. Kiểm tra `COHESION-REPORT.md`.
3. Nhấn **Mark step done**.
4. Nhấn **Run auto-review**.
5. Nhấn **Approve** nếu verdict là GO.

### 8.4 `system-test`

1. Nhấn **Run with Claude**.
2. Kiểm tra `SYSTEM-TEST-REPORT.md` ghi lại các command thực tế như `lint`, `typecheck`, `test` hoặc `build`.
3. Nhấn **Mark step done**.
4. Nhấn **Run auto-review**.
5. Nhấn **Approve** nếu toàn bộ test pass.

### 8.5 `project-sync`

1. Nhấn **Run with Claude**.
2. Kiểm tra `PROJECT-UPDATE.md` ghi lại thay đổi đối với project knowledge.
3. Nhấn **Mark step done**.
4. Nhấn **Run auto-review**.
5. Nhấn **Approve**.

Feature chỉ hoàn thành sau `project-sync`, không phải ngay khi các worker hoàn thành.

## 9. Luồng tổng quát

```text
Apply Cohesive Delivery
        ↓
Start Epic: project-context
        ↓
Start Epic: cohesive-feature
        ↓
Feature chạy đến analyze-contract
        ↓
Tạm dừng tại await-packages
        ↓
Start Epic: WP-01 ─┐
Start Epic: WP-02 ─┼─ chạy song song
Start Epic: WP-03 ─┘
        ↓
Quay lại feature
        ↓
await-packages → integrate → integration-context
        ↓
cohesion-review → system-test → project-sync
        ↓
Feature hoàn thành
```

## 10. Xử lý lỗi thường gặp

### Không thấy Cohesive Delivery trong Workflows

- Kiểm tra đã reload VS Code/Cursor sau khi cài extension.
- Mở lại AIDLC sidebar.
- Kiểm tra đang mở một project folder.

### Không thấy `project-context` hoặc `cohesive-work-package` trong nhóm built-in

Tìm trong nhóm **Your pipelines**. Đây là giới hạn badge của UI hiện tại.

### Step không cho Mark done

- Chờ terminal Claude hoàn thành.
- Kiểm tra artifact bắt buộc đã được tạo.
- Kiểm tra đường dẫn artifact nằm trong đúng Epic directory.

### Auto-review reject

1. Đọc lý do trên Epic card.
2. Mở artifact liên quan.
3. Nhấn **Rerun**.
4. Sửa theo feedback.
5. Mark step done và chạy auto-review lại.

### Worker báo thiếu feature hoặc package

Mở **inputs.json** và kiểm tra có đúng:

```json
{
  "feature_id": "EPIC-123",
  "package_id": "WP-01"
}
```

Epic ID của worker cũng phải trùng `runId` trong `WORK-PACKAGES.json`.

### Worker báo dependency chưa hoàn thành

Mở `WORK-PACKAGES.json`, kiểm tra `dependsOn`, sau đó hoàn thành package dependency trước khi chạy lại worker.
