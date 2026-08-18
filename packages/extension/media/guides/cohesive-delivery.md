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
2. Nếu đã có workspace, chọn **Overwrite & apply** hoặc nhấn **Migrate** trên danh sách Epic để lên bundle **3.0.0** (2+1+3 pipeline, remap run cũ, xóa slash `/cohesive-feature-*`).
3. Khi được hỏi, chọn **Install** để cài agents/skills vào ~/.claude/.
4. Kiểm tra tab **Workflows** có ba pipeline:

  - **project-context** — 2 step: `establish-baseline` → `publish-context`.
  - **feature-spike** — 1 step: `package-mission` (xuất `MISSION.md`).
  - **feature-implement** — 3 step: `implement` → `resolve-bugs` → `ship`.

Không còn pipeline `cohesive-feature` 15 step trên picker. Project cũ lên bản này bằng **Migrate**.

## 2. Thiết lập Project Context một lần

Hoàn tất project-context trước khi bắt đầu các feature đầu tiên:

~~~mermaid
flowchart LR
  A[establish-baseline] --> B[publish-context]
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
  S[feature-spike / paste / Jira] --> M[MISSION.md]
  M --> I[implement] --> B[resolve-bugs] --> H[ship]
~~~

| Stage | Kết quả chính (không trùng) |
|---|---|
| establish-baseline | `CONTEXT-REVIEW.md` `## Summary` + `## Graph coverage` + `docs/project/context/visualization/` (architecture / cây code / cây màn hình — đủ inventory, không sketch) |
| package-mission | `MISSION.md` = Summary + AC + Tasks + UI + Flow mermaid. Ba graph cạnh pack: **Luồng** / **Surfaces** / **Cây feature** — đủ inventory trên path epic, có `discovery`, không sketch |
| implement | Code + `IMPLEMENTATION-SUMMARY.md` với `## Acceptance criteria results`. Refresh Flow/Surfaces từ code — đủ inventory as-built, có `discovery`, không giữ sketch từ spike |
| resolve-bugs | User nhập bug, agent sửa/lặp; **Approve bản sửa** |
| ship | Một PR, human merge trên GitHub (không Approve AIDLC), rồi Reality sync |

Human đọc **một** chỗ cho mỗi câu hỏi: AC chỉ trong MISSION; graph không kể lại AC; as-built summary không viết lại spec.

### Guided mode

1. Trên Epic card, nhấn **Run with Claude**.
2. Extension mở terminal Claude với slash command của đúng step.
3. Claude ghi artifact; kiểm tra output và artifact.
4. Nhấn **Mark step done**, rồi hoàn tất auto-review/human review khi có.

Nếu lệnh Claude fail/đóng nhưng step còn **Awaiting work**, nhấn **Run again with Claude**
để mở lại cùng slash command và run id. Nếu review reject, **Run again with Claude**
tạo revision mới và chạy với feedback; chọn **Edit feedback first**
nếu muốn sửa feedback trước. Sau retry, lại **Mark step done** và review.

Riêng `resolve-bugs`, nút chạy luôn mở form **Thông tin bug**. Nhập hành vi
hiện tại, hành vi mong muốn, cách tái hiện. Có thể **chèn nhiều ảnh**, kéo thả,
hoặc dán screenshot; AIDLC copy chúng vào `artifacts/bug-screenshots/` để agent đọc.
Agent tự tìm step/artifact sở hữu và sửa code/test. Nếu chưa hài lòng, **Reject**
kèm thông tin bổ sung để agent lặp lại ngay tại step này. Khi đã kiểm tra
xong, nhấn **Approve**. Chỉ sau approval, `ship` mới đồng bộ docs và mở PR.

## 5. Autonomous Delivery cho một feature epic

Mở **Open Workspace → Epics → Autonomous Delivery → Start new delivery**. Điền ID,
title và request. Khi nhấn **Start delivery**, extension ghi request/state rồi mở
terminal Claude với:

~~~
/aidlc-autonomous-delivery <delivery-id>
~~~

Claude master chạy trọn project-context khi cần và feature-implement cho **một epic**.
Nó không tạo worker epic hoặc UI queue. Nếu có nhiều feature độc lập, bạn khởi động
một Autonomous Delivery cho mỗi feature; chúng hiện thành các delivery riêng và chạy
trong các terminal Claude riêng.

Master không yêu cầu **Mark step done** giữa phase. Nó ghi checkpoint durable,
narrate stage transitions/validation trong terminal, và tự approve các phase đã
pass output validation + auto-review, trừ `resolve-bugs`. Tại đó master dừng ở
`awaiting_review` để bạn kiểm tra bản sửa và nhấn **Approve**; sau đó Resume
sẽ tiếp tục từ `open-pr`. Nó cũng dừng ở blocker thật hoặc câu hỏi
product/architecture/ship-policy cần bạn trả lời.

### Resume không chạy lại từ đầu

Nếu Claude bị dừng/fail, chọn **Resume interrupted delivery**. Extension mở lại
chính master command. Claude phải đọc state, báo checkpoint được chọn trước khi làm
việc, giữ artifact/phase đã approve, rồi chỉ chạy phase failed/chưa xong và
downstream cần thiết. Nó không được tạo lại một run hoặc chạy lại upstream đã approve
chỉ vì bạn bấm Resume.

### Approval và merge

Không cần aggregate review hoặc bấm **Approve** từng phase. Chỉ
`resolve-bugs` bắt buộc approval của bạn vì đó là điểm chốt bản sửa và cho
phép agent đồng bộ docs. Bạn vẫn có thể mở review summary khi muốn.

Ở `await-merge`, master đọc `shipPolicy`: nếu policy cho phép agent merge thì nó
merge và xác minh branch đã vào base; nếu policy cấm agent merge, master hỏi một
câu rõ ràng để bạn thay đổi policy. Nó không tự bịa human approval hoặc trạng thái
merged.

Project-sync chỉ chạy sau bằng chứng merge thực tế.

## 6. Quy tắc an toàn khi nhiều epic cùng chạy

- Không chạy song song hai epic cùng thay đổi public API/schema/shared contract.
- Không cùng chạy project-sync khi một epic khác chưa merge; merge xong theo thứ tự
  và refresh context trước epic phụ thuộc.
- Dùng ID/branch/PR riêng cho từng epic.
- Nếu scope thay đổi làm hai epic không còn độc lập, dừng một epic, điều chỉnh
  contract/plan, rồi resume epic còn lại từ checkpoint; đừng ép Claude tự merge xung đột.

## 7. Xử lý sự cố

**Không thấy Autonomous Delivery**: apply/upgrade Cohesive Delivery và kiểm tra có
project-context (2 steps) cùng feature-spike (1) và feature-implement (3).

**Claude báo unknown slash command**: refresh AIDLC/workspace rồi bấm Run again;
extension sẽ sync các command bundled trước khi mở terminal.

**Epic không độc lập nữa**: không tạo worker package. Ghi dependency hoặc conflict
vào feature plan, chọn một epic làm upstream, rồi resume epic còn lại sau checkpoint.

Bạn có thể mở lại tài liệu này từ **Autonomous Delivery → Help & guide**.
