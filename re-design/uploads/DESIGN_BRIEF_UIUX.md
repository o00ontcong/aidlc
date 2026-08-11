# Design Brief — Unified AIDLC Product UI/UX

> Tài liệu này viết cho **agent/công cụ thiết kế UI-UX** (tạo wireframe/mockup, kiểu Figma) để vẽ giao diện cho sản phẩm AIDLC — không cần đọc source code, mọi thông tin cần thiết đã tổng hợp ở đây. Cơ sở dữ liệu: [PHAN_TICH_CHUC_NANG.md](PHAN_TICH_CHUC_NANG.md) và [CHUC_NANG_CHI_TIET.md](CHUC_NANG_CHI_TIET.md) (phân tích chức năng đầy đủ của repo hiện tại).

---

## 0. Việc cần làm

Thiết kế lại (redesign) toàn bộ trải nghiệm người dùng của AIDLC thành **một hệ giao diện hợp nhất** (Unified Workspace UI), gộp:
- Các tính năng **đã chứng minh giá trị** ở giao diện cũ (V2): tìm kiếm/lọc/theo dõi Epic, Builder CRUD, Analyze, Test Agent, Monitor.
- Kiến trúc điều hướng **mới** (V3): Home / Epics / Guide / Studio — mô hình 5-stage (Understand → Plan → Build → Verify → Ship) + autonomy 4 cấp (guide/assist/auto/unattended) + gate approval.

**Lý do**: khảo sát hiện trạng cho thấy giao diện mới (V3) đã bỏ mất các tính năng UI quan trọng của giao diện cũ (đặc biệt: ô tìm kiếm Epic, tính năng "Follow" đánh dấu theo dõi bằng ⭐ kéo-thả). Bản thiết kế mới phải **không đánh mất** năng lực nào của bản cũ, đồng thời thêm các khái niệm mới (stage, gate, autonomy mode) một cách rõ ràng, dễ hiểu cho người dùng không rành kỹ thuật AI.

---

## 1. Bối cảnh sản phẩm

**AIDLC** là công cụ điều khiển **Claude Code** (AI coding agent) chạy các "Epic" (đơn vị công việc — feature/bug/refactor) qua một pipeline nhiều giai đoạn, có thể tự động hoàn toàn hoặc dừng lại xin người dùng phê duyệt (gate) ở các bước rủi ro (destructive change, merge nhánh chính, giao tiếp bên ngoài như mở PR/gửi email).

Sản phẩm tồn tại ở 3 hình thức:
1. **VS Code Extension** — sidebar + các webview panel (đối tượng thiết kế chính của brief này).
2. **CLI terminal** — có 1 phần giao diện web nhẹ (`aidlc dashboard`, mở trong browser, cùng nhóm tính năng với Epics view).
3. **Trình duyệt** — annotron (đánh giá artifact do AI sinh ra) — nằm ngoài phạm vi brief này (đã có design riêng, vendor).

Sản phẩm nhắm tới developer/tech lead muốn AI tự làm phần lớn công việc lập trình theo quy trình có kiểm soát, chứ không phải chat tự do.

---

## 2. Người dùng & ngữ cảnh sử dụng

| Persona | Mục tiêu | Ngữ cảnh dùng chính |
|---|---|---|
| **Developer / Tech Lead** (chính) | Khởi tạo Epic, theo dõi tiến độ nhiều Epic cùng lúc, phê duyệt/từ chối các bước cần review, cấu hình agent/skill/pipeline riêng cho project | VS Code, sidebar hẹp (~300–400px) để lướt nhanh + panel rộng (toàn màn hình editor) khi cần chi tiết |
| **Reviewer** (phụ) | Xem diff, approve/reject 1 step hoặc 1 gate, không tự chạy Epic | Có thể chỉ mở CLI web dashboard trên browser, không cần VS Code |
| **Platform/DevOps admin** | Cấu hình workflow pack, model provider, artifact policy, capability cho cả team | Tab "Studio" trong panel Workspace |

**Ràng buộc quan trọng cho thiết kế**:
- Phải đẹp và dùng được ở **cả light theme và dark theme** (VS Code tôn trọng theme hệ điều hành/người dùng chọn) — không hard-code màu nền trắng/đen tuyệt đối.
- Sidebar là không gian **hẹp, dọc** — layout phải co giãn tốt theo chiều rộng nhỏ (giống thanh bên trình duyệt, ~280–420px).
- Panel chính (Workspace) mở như 1 tab editor — có thể full-width, cần layout responsive 2-3 cột khi rộng, 1 cột khi hẹp.
- Có nhiều Epic chạy đồng thời trong 1 project — UI phải scale tốt với 20-50 Epic hiển thị cùng lúc (cần search/filter/nhóm, không chỉ list dài).
- Trạng thái cập nhật **real-time** (qua file-watch, không phải người dùng bấm refresh) — thiết kế cần có micro-interaction cho "vừa cập nhật" (ví dụ highlight nhẹ dòng vừa đổi).

---

## 3. Nguyên tắc thiết kế

1. **Tôn trọng cảm giác "native" của VS Code** — không thiết kế như 1 web app nặng nề tách biệt; dùng mật độ thông tin cao, viền mỏng, ít shadow, font hệ thống, spacing nhỏ gọn (giống Explorer/Source Control panel có sẵn của VS Code).
2. **Trạng thái luôn nhận biết được bằng ≥2 tín hiệu** (màu + icon + text) — không dùng màu đơn độc để phân biệt trạng thái (accessibility).
3. **Progressive disclosure** — Sidebar chỉ tóm tắt + launcher; Workspace panel mới là nơi xem/hành động chi tiết. Không nhồi hành động phức tạp vào sidebar.
4. **Gate/approval không bao giờ bị ẩn hoặc tự động lướt qua** — bất kể autonomy mode nào, khi có 1 gate đang chờ, nó phải là điểm chú ý number-one trên màn hình (banner/card nổi bật, không phải icon nhỏ).
5. **Phân biệt rõ Hard gate vs Soft gate** — hard gate (destructive change / merge nhánh chính / giao tiếp bên ngoài) không thể bypass ở bất kỳ autonomy mode nào → cần 1 dấu hiệu thị giác riêng (ví dụ viền đỏ đậm + icon khóa) khác với gate thường (approval "nice to have").
6. **Không mất tính năng khi chuyển bản thiết kế mới** — mọi khả năng đã có ở bản cũ (search, follow, filter, drag-drop) phải có mặt tương đương hoặc tốt hơn ở bản mới.

### Design tokens tham khảo (agent có thể thay bằng bộ token riêng, miễn giữ đúng ngữ nghĩa)

| Token | Vai trò | Gợi ý |
|---|---|---|
| `--status-pending` | Epic/step chưa bắt đầu | Xám trung tính |
| `--status-in-progress` | Đang chạy | Xanh dương/cam ánh sáng, có thể animate nhẹ (pulse) |
| `--status-done` | Hoàn tất | Xanh lá |
| `--status-rejected` / `--status-blocked` | Bị từ chối / chặn | Đỏ |
| `--status-waiting` | Đang chờ người dùng (gate) | Vàng/amber — màu "cần chú ý" |
| `--gate-hard` | Viền/nhấn cho hard gate | Đỏ đậm + icon khóa 🔒 |
| Spacing scale | 4/8/12/16/24/32px | Mật độ cao ở sidebar (4-8px), thoáng hơn ở panel chính (12-24px) |
| Typography | 2 cấp: UI text (sans, 12-13px) + code/monospace (cho slash command, path, log) | Giữ đúng font monospace cho mọi đoạn code/command/path |
| Radius | Nhỏ, 4-6px (giống VS Code, không bo tròn kiểu mobile app) | |

---

## 4. Kiến trúc thông tin (Site map hợp nhất)

```
Activity Bar
 └─ AIDLC (icon) → Sidebar Panel
      ├─ Project switcher
      ├─ Stats (Agents / Skills / Flows / Epics)
      ├─ Recent Epics (rút gọn, có Follow indicator)
      ├─ Workflow templates
      ├─ MCP servers status
      └─ [Nút] Open Workspace → mở Workspace Panel (toàn màn hình)

Workspace Panel (tab shell, điều hướng ngang trên cùng)
 ├─ Home            (tổng quan project, readiness, Epic hiện tại nổi bật)
 ├─ Epics           (★ màn hình trung tâm — xem mục 5.4)
 ├─ Builder         (CRUD Agent / Skill / Pipeline / Workflow)
 ├─ Analyze         (Phân tích requirement → task breakdown)
 ├─ Tests           (Test Agent — E2E pipeline)
 ├─ Guide           (Giải thích trạng thái, "vì sao bị chặn", doctor diagnostics)
 └─ Studio          (Workflow pack, model provider, artifact policy, capability)

Panel phụ (mở riêng, độc lập)
 ├─ Monitor         (Token Usage / Insights / Agents — 3 tab)
 ├─ AST Graph Report
 └─ Standard Picker (chọn chuẩn compliance: none/agile-lite/hybrid/iso-ieee)

Ngoài VS Code
 └─ CLI Web Dashboard (browser) — Runs / Builder / Epics (bản rút gọn, dùng khi không có VS Code, ví dụ reviewer)
```

---

## 5. Đặc tả từng màn hình

Mỗi màn hình: **Mục đích** — **Người dùng chính** — **Nội dung/khối layout** — **Component chính** — **Trạng thái cần thiết kế** — **Độ ưu tiên** (P0 = phải có trong bản thiết kế đầu, P1 = quan trọng, P2 = có thể làm sau).

### 5.1 Sidebar (Activity Bar view) — P0

- **Mục đích**: launcher nhanh + tóm tắt tình trạng project, không phải nơi làm việc chi tiết.
- **Layout** (dọc, hẹp): từ trên xuống — (1) Project bar (tên project hiện tại + nút đổi/đóng), (2) nút nổi bật "Ask AIDLC" + "Analyze Requirements", (3) **Stats grid** 2x2 (Agents / Skills / Flows / Epics — mỗi ô là số + label, click điều hướng sang Builder/Epics tương ứng), (4) **Recent Epics** — 3 dòng gần nhất, mỗi dòng: dot màu trạng thái + tên rút gọn + (nếu đang follow) icon ⭐ nhỏ, (5) **Workflow templates** — danh sách chip, (6) **MCP servers** — danh sách nhỏ + nút refresh.
- **Trạng thái**: rỗng (chưa có project/epic nào) cần empty-state gợi ý "Start Epic"; loading khi đang quét project.
- Không có nút hành động phức tạp (approve/reject) ở đây — chỉ điều hướng.

### 5.2 Workspace Panel Shell — P0

- Thanh tab ngang cố định trên cùng: Home / Epics / Builder / Analyze / Tests / Guide / Studio. Tab đang active có gạch chân/nhấn màu.
- Vùng nội dung bên dưới chiếm toàn bộ chiều cao còn lại, tự cuộn riêng.

### 5.3 Home — P1

- **Mục đích**: màn hình chào khi mở Workspace — trạng thái tổng quan + hành động tiếp theo gợi ý.
- **Nội dung**: card "Project readiness" (đã setup/context/recommendation chưa — checklist 3 bước với nút hành động cho từng bước: Analyze / Publish context / Generate recommendation); card lớn "Current Epic" nổi bật — hiển thị Epic đang active nhất, kèm `nextAction` (câu gợi ý hành động kế tiếp bằng ngôn ngữ tự nhiên), autonomy mode hiện tại, và nếu có blocker → khối cảnh báo với `RecoveryActions` (list nút bấm để tự sửa).
- **Trạng thái**: chưa có Epic nào (empty, CTA "Start Epic"); mọi thứ readiness done (chỉ còn card Current Epic).

### 5.4 Epics — ★ Màn hình trung tâm, P0

**Đây là màn hình quan trọng nhất của toàn bộ brief — phải giữ nguyên/mở rộng mọi tính năng đã có ở bản cũ.**

**Layout tổng**: 2 cột — cột trái là **danh sách Epic** (30-35% chiều rộng, tự cuộn riêng), cột phải là **chi tiết Epic đang chọn** (chiếm phần còn lại).

**Cột trái — Danh sách Epic**:
- Thanh công cụ trên cùng: **ô tìm kiếm** (icon search, placeholder "Search epics by title or description…", lọc tức thời không cần debounce rõ rệt) + **5 nút filter theo trạng thái** dạng pill (All / In progress / Pending / Done / Failed), mỗi pill hiện số lượng đếm được.
- Bên dưới thanh công cụ: **2 khu vực có thể thu/mở** — "⭐ Following" và "Not following" — mỗi Epic có thể **kéo-thả** giữa 2 khu để đánh dấu theo dõi (Follow). Mỗi item trong list là 1 dòng compact: dot màu trạng thái, tên Epic, progress % nhỏ, icon Follow (bấm để toggle nhanh không cần kéo-thả).
- Trạng thái filter/search/khu vực follow phải được **nhớ lại** khi mở lại panel (persist).
- Nút nổi bật cuối danh sách: "+ Start Epic" và "Start Autonomous Delivery".

**Cột phải — Epic Card chi tiết** (khi chọn 1 Epic):
- Header: tên Epic, badge trạng thái (`StatusBadge`), % progress (progress bar ngang), autonomy mode hiện tại (chip: guide/assist/auto/unattended, có thể đổi qua dropdown), token usage đã tiêu.
- **Stepper**: hiển thị các stage (Understand/Plan/Build/Verify/Ship) dạng chuỗi ngang có thể là **tuyến tính hoặc DAG** (khi các stage phụ thuộc nhau song song — profile "Parallel"); mỗi stage/step có icon trạng thái riêng.
- Chi tiết từng step khi mở rộng: input, output, artifact liên quan, slash command tương ứng (hiển thị dạng code chip có thể copy).
- **Gate/RunGate area** — khi có hành động cần phê duyệt: 1 banner nổi bật (không phải nút nhỏ chìm) hiển thị nội dung cần duyệt + nút **Run with Claude / Mark step done / Approve / Reject / Rerun / Run auto-review**. Nếu là **hard gate** (destructive/merge nhánh chính/giao tiếp ngoài) → banner có viền đỏ đậm + icon khóa + text "Cannot be skipped in any mode".
- **History log**: danh sách các event reject/rerun/approve/annotate theo thời gian, mỗi dòng có timestamp + actor + tóm tắt.
- **Charter/Alignment strip** (dải ngang phía trên card): hiển thị Epic có đi đúng "ý chí" (Intent) của project charter không — cảnh báo nếu lệch.
- **Ship strip**: trạng thái đưa code lên production (PR/merge) khi Epic đến giai đoạn Ship.
- Action bar cuối: Verify / Report / Delete / Reveal artifacts / Memory (xem lại `epic-memory.json`).

**Trạng thái cần thiết kế**: danh sách rỗng (chưa có epic khớp filter/search — empty state "No epics match"); 1 epic đang chờ gate (cần nổi bật nhất trong toàn bộ site); epic bị blocked (banner lỗi + recovery actions); epic completed (card có tông màu "hoàn tất", ít hành động hơn).

### 5.5 Gate Approval Modal/Flow — P0 (dùng chung nhiều nơi)

- Modal xác nhận khi bấm Approve/Reject: hiển thị rõ **loại gate** (tên + mô tả bằng ngôn ngữ tự nhiên "vì sao hành động này cần duyệt"), nội dung sẽ xảy ra nếu approve (ví dụ "Sẽ mở Pull Request tới nhánh main"), ô nhập `reason`/`comment` (bắt buộc khi reject).
- Nếu hard gate: modal có thêm dòng cảnh báo cố định, không thể tắt bằng "đừng hỏi lại".

### 5.6 Builder — P1

- 3 sub-tab: **Workflows** (danh sách pipeline dạng thẻ, mỗi thẻ vẽ chuỗi step dạng DAG mini, nút Edit/Delete/Generate from recipe), **Agents** (danh sách card: tên, model, skill gắn kèm, nút Add/Edit/Rename/Delete), **Skills** (danh sách: nguồn builtin/custom, nút Add — có 3 cách nhập: chọn template / dán nội dung / upload file / tạo blank).
- Modal "Add Agent"/"Add Skill"/"Add Pipeline" — form nhiều bước nếu cần (chọn skill cho agent, chọn agent theo thứ tự cho pipeline).
- Trạng thái rỗng: gợi ý "Apply a preset" (code-review / release-notes / sdlc / cohesive-delivery).

### 5.7 Analyze — P1

- Form nhập: nguồn requirement (path/URL/text dán trực tiếp), platform đích (Jira/GitHub/Linear/Redmine/Local — dạng icon-select), parent task, project key.
- Sau khi submit: bảng tóm tắt xác nhận trước khi tạo (title, platform, parent) + nút Proceed.
- Danh sách "Recent Analyses" bên dưới — mỗi item mở lại chi tiết breakdown đã tạo.

### 5.8 Tests (Test Agent) — P2

- Trực quan hóa pipeline 7 bước: **Explore → Plan → Confirm (gate) → Generate → Execute → Heal → Verdict (gate)** dạng stepper ngang có 2 gate rõ ràng (icon khóa khác màu ở bước Confirm và Verdict).
- Kết quả cuối (Verdict): pass/fail summary + link tới report chi tiết.

### 5.9 Monitor (panel riêng, 3 tab) — P1

- **Token Usage**: 6 khối — Overview (tổng chi tiêu), By Model, Daily (chart theo ngày), Top Projects, Heatmap (giờ/ngày dùng nhiều), Efficiency Suggestions (gợi ý tối ưu bằng text).
- **Insights**: 7 panel — Overview, Context+Cache timeline, Hooks, Prompts, Context management, Retrieval, Tools, Subagents — dữ liệu live-append (khi có event mới, phải có hiệu ứng "vừa thêm" nhẹ).
- **Agents**: tóm tắt session/event live (từ plugin ngoài `agents-observe`) + khu vực nhúng dashboard đầy đủ (iframe); nút "Start Monitor" khi server chưa chạy (empty/off state rõ ràng, kèm giải thích ngắn đây là plugin ngoài).
- 3 tab giữ mounted cùng lúc (chuyển tab không mất trạng thái iframe).

### 5.10 Standard Picker — P2

- Modal/panel nhỏ: chọn 1 trong 4 chuẩn compliance (`none`, `agile-lite`, `hybrid`, `iso-ieee`) — mỗi option có mô tả ngắn (bao nhiêu artifact bắt buộc, mức độ traceability).

### 5.11 Guide (diagnostics) — P1

- Chế độ giải thích: với stage hiện tại, hiển thị 5 khối cố định **Why / Inputs / Outputs / Done when / Next** (dạng list ngắn, dễ scan).
- "Doctor" — danh sách diagnostic items (mỗi item: tên check, pass/fail, nếu fail có nút "Fix" gợi ý hành động sửa).
- Log nâng cao: 20 event gần nhất (collapsible, ẩn theo mặc định — dành cho debug).

### 5.12 Studio — P1

- Chọn **workflow pack** (sdlc-core / speckit / cohesive / regulated) — dạng card so sánh, mỗi pack có mô tả triết lý (waterfall-like / spec-driven / feature-coordination / traceability-heavy).
- Quản lý **model provider**: danh sách provider, nút "Check providers" (chạy diagnose), "Use as default".
- **Artifact policy editor**: textarea/JSON editor có validate trước khi save (hiển thị lỗi inline nếu JSON invalid).
- **Capability toggles**: danh sách switch on/off (ast-graph, artifact-annotation…) kèm trạng thái health (✓/✗).

### 5.13 AST Graph Report (panel riêng) — P2

- Header: 4 KPI tile (Files / Nodes / Edges / Languages) + 3 pill trạng thái (Binary ready / Scanning / MCP registered) + nút Rescan / Re-register MCP / Reveal .db.
- **Hotspots**: bảng (Name/Kind/Out/In/Total) kèm mini bar-chart cạnh mỗi dòng, có ô lọc theo tên/kind.
- **By kind**: chip đếm theo loại symbol.
- **HTTP routes**: bảng route phát hiện được.
- **Symbol explorer**: ô tìm kiếm riêng (đợi ≥3 ký tự hoặc Enter), kết quả hiển thị dạng cây callers/callees, click 1 node → (trong thiết kế mockup, chỉ cần thể hiện affordance "mở file tại dòng tương ứng").

### 5.14 CLI Web Dashboard (browser, ngoài VS Code) — P2

- Bản rút gọn của Epics + Builder, chạy trong browser thường (không có sidebar VS Code). 3 tab: **Runs** (list run + panel action approve/reject/rerun/mark-done — "click-to-approve"), **Builder** (chỉ đọc), **Epics** (list + filter theo status, không có search/follow — cần quyết định: brief này khuyến nghị **nên thêm search+follow vào đây luôn** để đồng bộ với Epics view chính).
- Cập nhật real-time tự động (không cần bấm refresh) — cần 1 chỉ báo nhỏ "Live" (dot xanh nhấp nháy) để người dùng biết dữ liệu đang tự cập nhật.

---

## 6. Component library dùng chung (thiết kế 1 lần, dùng lại nhiều màn hình)

| Component | Mô tả | Dùng ở |
|---|---|---|
| `StatusBadge` | Badge màu + icon + text theo trạng thái (pending/in_progress/done/rejected/blocked/waiting-for-user) | Epics, Home, Sidebar, Guide |
| `SearchFilterBar` | Ô search + nhóm filter pill có đếm số lượng | Epics (VS Code + Web dashboard) |
| `FollowToggle` | Icon ⭐ bấm toggle + hỗ trợ kéo-thả giữa 2 khu vực | Epics |
| `ProgressStepper` | Chuỗi bước ngang, hỗ trợ tuyến tính hoặc DAG (rẽ nhánh song song) | EpicCard, Tests |
| `GateBanner` | Banner nổi bật cho hành động cần duyệt — 2 biến thể: gate thường / hard gate (viền đỏ + khóa) | EpicCard, Home |
| `RecoveryActionsList` | Danh sách nút gợi ý hành động khắc phục khi bị blocked | Home, Guide, EpicCard |
| `DiffPane` | Hiển thị diff code khi cần review | EpicCard (human review step) |
| `AutonomyModeChip` | Dropdown chip 4 trạng thái guide/assist/auto/unattended, có tooltip giải thích mỗi mode | EpicCard, Home |
| `LiveIndicator` | Dot nhấp nháy nhỏ báo "đang tự cập nhật real-time" | Web dashboard, Monitor |
| `EmptyState` | Khối minh họa + text + CTA khi danh sách rỗng | Mọi list view |

---

## 7. Luồng tương tác quan trọng cần storyboard (ngoài màn hình tĩnh)

1. **Search + Filter + Follow trên Epics**: gõ từ khóa → list lọc tức thời → kéo 1 Epic từ "Not following" sang "Following" → đóng panel, mở lại → trạng thái vẫn giữ nguyên.
2. **Gate approval (hard gate)**: Epic đang `running` → action cần merge nhánh chính → Epic chuyển `waiting-for-user`, `GateBanner` xuất hiện với viền đỏ + khóa → người dùng bấm Approve → nhập reason → xác nhận → Epic resume và action tự thực thi tiếp.
3. **Chuyển autonomy mode giữa chừng**: đang ở mode `auto`, người dùng đổi sang `unattended` qua `AutonomyModeChip` → tooltip cảnh báo ngắn "Sẽ tự chạy nhiều stage liên tiếp, vẫn dừng ở hard gate" trước khi xác nhận đổi.
4. **Epic bị blocked → tự sửa**: card hiện khối đỏ "Blocked" + `RecoveryActionsList` (ví dụ "Retry step", "Resume Epic") → bấm 1 nút → loading ngắn → card trở lại `running`.

---

## 8. Ưu tiên & phạm vi giao nộp mong đợi

| Ưu tiên | Màn hình/Component |
|---|---|
| **P0 — bắt buộc có trong bản vẽ đầu tiên** | Sidebar, Workspace Shell, **Epics (5.4)**, Gate Approval Flow (5.5) |
| **P1 — quan trọng, nên có sớm** | Home, Builder, Analyze, Monitor, Guide, Studio |
| **P2 — có thể làm sau** | Tests, Standard Picker, AST Graph Report, CLI Web Dashboard |

Deliverable mong đợi từ agent thiết kế: wireframe/mockup (2 theme sáng/tối) cho từng màn hình P0 trước, kèm 1 bộ component library tối thiểu (mục 6) để tái sử dụng cho P1/P2.

---

## 9. Tài liệu tham chiếu thêm (nếu agent cần đào sâu chi tiết hành vi)

- [PHAN_TICH_CHUC_NANG.md](PHAN_TICH_CHUC_NANG.md) — tổng quan kiến trúc hệ thống.
- [CHUC_NANG_CHI_TIET.md](CHUC_NANG_CHI_TIET.md) — chi tiết từng command/API/UI hiện có, bao gồm bảng so sánh tính năng V2 vs V3 (mục 4 của file đó) là cơ sở trực tiếp cho yêu cầu "không mất tính năng" ở mục 0 brief này.
