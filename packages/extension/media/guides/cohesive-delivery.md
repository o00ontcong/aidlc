# Hướng dẫn Cohesive Delivery trên UI

Cohesive Delivery dùng **Project Context** chung và các **Feature Epic độc lập**.
Trong tài liệu này, “chạy song song” chỉ có một nghĩa: nhiều feature epic độc lập
được chạy cùng thời điểm. Nó **không** có nghĩa tạo work-package/worker epic trong
một feature, đặt số agent, hay bắt bạn điều phối agent. Claude tự quyết định cách
phân rã nội bộ cho từng epic.

## 0. Mô hình làm việc

~~~mermaid
flowchart TB
  PC[Project Context chung] --> F1[Feature epic FEATURE-001]
  PC --> F2[Feature epic FEATURE-002]
  PC --> F3[Feature epic FEATURE-003]
  F1 --> PR1[PR riêng]
  F2 --> PR2[PR riêng]
  F3 --> PR3[PR riêng]
~~~

Mỗi feature epic sở hữu riêng yêu cầu, branch, artifacts, implementation, test và
PR. Chỉ chạy cùng lúc khi chúng độc lập: không cùng sửa shared contract, vùng file
nhạy cảm, hoặc phụ thuộc chưa được giải quyết. Nếu Claude thấy xung đột thật, nó
phải nêu blocker thay vì tự trộn hai epic.

Hai cách vận hành cùng tồn tại:

- **Guided**: bạn chạy/review từng step của một epic.
- **Existing Project Autonomous Delivery**: bạn khởi động một Claude master cho
  một feature epic; master chạy trọn flow và dừng đúng human gate.

Không có global aidlc cohesive CLI chạy ngầm. Mọi thao tác do extension khởi động
đều mở lệnh nhìn thấy được trong terminal Claude.

## 1. Cài Cohesive Delivery

1. Mở sidebar **AIDLC** → **Workflows** → **Cohesive Delivery**.
2. Nếu đã có workspace, chọn **Overwrite & apply** để cập nhật các pipeline bundled.
3. Khi được hỏi, chọn **Install** để cài agents/skills vào ~/.claude/.
4. Kiểm tra tab **Workflows** có hai pipeline:

   - **project-context** — 7 step để thiết lập charter và context chung.
   - **cohesive-feature** — 13 step để hoàn tất một feature epic độc lập.

Các pipeline cohesive-work-package cũ chỉ là compatibility cho run lịch sử; không
dùng để tạo run mới và không phải cách chạy parallel trong mô hình hiện tại.

## 2. Thiết lập Project Context một lần

Hoàn tất project-context trước khi bắt đầu các feature đầu tiên:

~~~mermaid
flowchart LR
  A[define-charter] --> B[scan-project] --> C[model-project] --> D[check-drift]
  D --> E[review-context] --> F[publish-context] --> G[project-rules-sync]
~~~

1. Nhấn **Start Epic** → workflow **project-context**.
2. Điền **Project idea**; đây là seed, không phải charter đã xác nhận.
3. Chạy từng step bằng **Run with Claude** → kiểm tra artifact → **Mark step done**.
4. Hoàn tất auto-review/human review khi UI yêu cầu.

Project Context là baseline chung. Một feature epic capture snapshot của baseline này
để có thể chạy độc lập, kể cả khi epic khác đang hoạt động.

## 3. Chạy nhiều feature epic song song

Tạo một epic cho mỗi outcome độc lập — ví dụ PAYMENTS-001, EXPORT-001,
NOTIFICATIONS-001 — rồi chạy chúng trong các terminal Claude riêng.

Trước khi chạy song song, xác nhận:

- scope và acceptance criteria của mỗi epic tách biệt;
- file/contract shared bị ảnh hưởng không chồng lấn, hoặc có quyết định thứ tự rõ ràng;
- mỗi epic có branch và PR riêng;
- thay đổi Project Context/charter không đang chờ ở epic khác.

Không tạo WP-01, WP-02, không chờ await-packages, và không đặt
max_parallel_workers. Số subagent, cách chia task và thứ tự làm việc **bên trong
một epic** là quyết định của Claude theo hợp đồng feature.

## 4. Chu trình một Feature Epic

~~~mermaid
flowchart LR
  A[capture-context] --> B[specify] --> C[clarify] --> D[plan]
  D --> E[plan-tasks] --> F[analyze-contract] --> G[implement]
  G --> H[implementation-context] --> I[cohesion-review] --> J[system-test]
  J --> K[open-pr] --> L[await-merge] --> M[project-sync]
~~~

| Stage | Kết quả chính |
|---|---|
| capture-context | Snapshot Project Context cho epic này |
| specify / clarify | SPEC.md có FR/NFR/AC rõ ràng |
| plan / plan-tasks | PLAN.md và TASKS.md cho một epic |
| analyze-contract | FEATURE-CONTRACT.md frozen |
| implement | Code hoàn chỉnh + IMPLEMENTATION-SUMMARY.md |
| implementation-context | Hành vi thực tế và traceability |
| cohesion-review / system-test | Review độc lập và quality gates |
| open-pr / await-merge | Một PR riêng, merge do human |
| project-sync | Cập nhật Reality sau merge |

### Guided mode

1. Trên Epic card, nhấn **Run with Claude**.
2. Extension mở terminal Claude với slash command của đúng step.
3. Claude ghi artifact; kiểm tra output và artifact.
4. Nhấn **Mark step done**, rồi hoàn tất auto-review/human review khi có.

Nếu lệnh Claude fail/đóng nhưng step còn **Awaiting work**, nhấn **Run again with Claude**
để mở lại cùng slash command và run id. Nếu review reject, **Run again with Claude**
tạo revision mới và chạy với feedback; chọn **Edit feedback first**
nếu muốn sửa feedback trước. Sau retry, lại **Mark step done** và review.

## 5. Autonomous Delivery cho một feature epic

Mở **Open Workspace → Epics → Autonomous Delivery → Start new delivery**. Điền ID,
title và request. Khi nhấn **Start delivery**, extension ghi request/state rồi mở
terminal Claude với:

~~~
/aidlc-autonomous-delivery <delivery-id>
~~~

Claude master chạy trọn project-context khi cần và cohesive-feature cho **một epic**.
Nó không tạo worker epic hoặc UI queue. Nếu có nhiều feature độc lập, bạn khởi động
một Autonomous Delivery cho mỗi feature; chúng hiện thành các delivery riêng và chạy
trong các terminal Claude riêng.

Master không yêu cầu **Mark step done** giữa phase. Nó ghi checkpoint durable,
narrate stage transitions/validation trong terminal, và dừng chỉ ở human review,
human merge, blocker thật hoặc quyết định sản phẩm cần bạn trả lời.

### Resume không chạy lại từ đầu

Nếu Claude bị dừng/fail, chọn **Resume interrupted delivery**. Extension mở lại
chính master command. Claude phải đọc state, báo checkpoint được chọn trước khi làm
việc, giữ artifact/phase đã approve, rồi chỉ chạy phase failed/chưa xong và
downstream cần thiết. Nó không được tạo lại một run hoặc chạy lại upstream đã approve
chỉ vì bạn bấm Resume.

### Review và merge

Tại aggregate review, dùng:

- **Open review summary** để kiểm tra bundle;
- **Add review task** nếu cần rework chọn lọc trong feature đó;
- **Complete after merge** sau khi human đã merge PR.

Agent không merge default branch. Project-sync chỉ chạy sau bằng chứng merge hoặc
local human approval được policy cho phép.

## 6. Quy tắc an toàn khi nhiều epic cùng chạy

- Không chạy song song hai epic cùng thay đổi public API/schema/shared contract.
- Không cùng chạy project-sync khi một epic khác chưa merge; merge xong theo thứ tự
  và refresh context trước epic phụ thuộc.
- Dùng ID/branch/PR riêng cho từng epic.
- Nếu scope thay đổi làm hai epic không còn độc lập, dừng một epic, điều chỉnh
  contract/plan, rồi resume epic còn lại từ checkpoint; đừng ép Claude tự merge xung đột.

## 7. Xử lý sự cố

**Không thấy Autonomous Delivery**: apply/upgrade Cohesive Delivery và kiểm tra có
project-context (7 steps) cùng cohesive-feature (13 steps).

**Claude báo unknown slash command**: refresh AIDLC/workspace rồi bấm Run again;
extension sẽ sync các command bundled trước khi mở terminal.

**Epic không độc lập nữa**: không tạo worker package. Ghi dependency hoặc conflict
vào feature plan, chọn một epic làm upstream, rồi resume epic còn lại sau checkpoint.

Bạn có thể mở lại tài liệu này từ **Autonomous Delivery → Help & guide**.
