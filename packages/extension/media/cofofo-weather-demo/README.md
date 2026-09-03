# SkyCast — CoFoFo Weather Demo

## CoFoFo workflow set

Demo này hiển thị đúng workflow set built-in của CoFoFo, không phải một danh
sách pipeline theo từng task mẫu:

- `cofofo-foundation` — pipeline dựng và publish nền tảng.
- `cofofo-delivery` — pipeline nguồn cho hai recipe `cofofo-feature` và
  `cofofo-bugfix`.

Mỗi scenario Weather có một pipeline snapshot bất biến trong run state để mô
phỏng đúng thời điểm nó bắt đầu. Snapshot đó là lịch sử thực thi, không phải
workflow trong `.aidlc/workspace.yaml`, nên Builder chỉ hiển thị workflow set
trên.

SkyCast là weather app SwiftUI nhỏ dùng để trình diễn CoFoFo trên repository
SwiftPM/iOS đơn stack — nhưng demo này **không đóng gói code thật**. `src/`
chỉ có `Package.swift` (manifest tối thiểu, để stack detector nhận ra một
SwiftPM stack thật) và `AGENTS.md`; không có `Sources/` hay `Tests/`, nên
`swift build`/`swift test` sẽ không chạy được.

Mọi artifact Foundation/delivery (STACK-PROFILE, PROJECT-RULES,
ARCHITECTURE-MAP, TASK-PLAN, evidence log, …) vẫn trích dẫn đường dẫn thật như
`Sources/SkyCast/Data/ForecastStore.swift` hay
`Sources/SkyCast/Presentation/WeatherDashboardView.swift` — nhưng chỉ ở mức
văn bản, để tài liệu đọc thật (realistic ở mức documentation) mà không cần
mang theo toàn bộ ứng dụng.

## Pipeline thật đang được kiểm thử

```text
cofofo-foundation (một lần / mỗi foundation revision)
  scan-stack → define-rules → map-system → select-ecc-catalog
             → install-ecc-assets → publish-context
                                      │
                                      ▼
cofofo-feature recipe (materialized from provider-neutral cofofo-delivery, mỗi feature)
  requirement → create-plan → implement → test

cofofo-bugfix recipe (mỗi bug)
  diagnose [Canvas] → reproduce → implement → test
```

- Foundation tạo `STACK-PROFILE.json`, policy JSON + view có source hash,
  architecture map, catalog selection, installed-asset manifest và
  `CONTEXT-MANIFEST.json`.
- Catalog ECC ghim commit
  `d8409a4b0813771235555e32e3d8046a73988bfa`, chỉ cài năm asset Markdown
  đã audit; executable, hook và validator ngoài bị từ chối.
- Canvas bundle gắn verdict với run, step revision, artifact path và SHA-256.
  Sửa nội dung sau duyệt làm approval hết hiệu lực.
- Evidence ledger bắt buộc đúng thứ tự RED → GREEN → REFACTOR →
  VERIFY, bind vào revision hiện tại của từng phase, ghi timestamp, exit
  status, output đã redact, log hash và hash chain.
- Delivery run ghim foundation revision + manifest hash; foundation thay đổi
  thì run dừng và phải rebase/replay.

## Demo bằng extension

1. Command Palette → `AIDLC: Load CoFoFo Weather Demo`.
2. Mở `COFOFO-WEATHER-FOUNDATION`: revision 2 đã hoàn tất và active trước mọi
   delivery task. Kiểm tra `CONTEXT-MANIFEST.json`, `foundation.json`, catalog
   manifest và Canvas history.
3. Mở `COFOFO-WEATHER-001-GATE`, rồi xem `.aidlc/runs/...json`: run ghim đúng
   Foundation revision, manifest path và SHA-256 khi bắt đầu.
4. Mở hai task completed để xem artifact, Canvas verdict và evidence ledger;
   mở task stale để thấy snapshot revision 1 bị active revision 2 chặn thật.
5. Muốn tạo delivery mới, start recipe `cofofo-feature` (feature) hoặc
   `cofofo-bugfix` (có diagnosis Canvas). Run mới chỉ được tạo sau `requireReady()` và tự ghim
   active Foundation snapshot.
6. Mark các phase đã sinh xong; ở gate dùng `Review in Canvas`. Extension tự
   khởi động Annotron, mở mọi artifact trong bundle, chờ verdict và ghi
   run state sau khi core kiểm hash lại.
   Tại các evidence phase, dùng
   `AIDLC: CoFoFo: Capture Current RED/GREEN/REFACTOR/VERIFY Evidence`.

Muốn trình diễn lifecycle thay đổi context, chạy `AIDLC: CoFoFo: Prepare
Foundation` với route `Refresh context`, review/publish/activate revision mới,
rồi mở một delivery run cũ: core sẽ yêu cầu rebase/replay thay vì dùng policy
snapshot đã stale.

## Các task seed sẵn

Demo cố ý có cả task đang chạy, task hoàn tất và các đường phục hồi thực tế:

- `COFOFO-WEATHER-FOUNDATION`: Foundation revision 2 hoàn tất, validated và
  active; đây là nguồn context thật của mọi delivery task trong workspace.
- `COFOFO-WEATHER-001-GATE`: delivery mới ghim active Foundation revision 2
  cùng exact manifest SHA-256 trước requirement work.
- `COFOFO-WEATHER-002-CANVAS`: kế hoạch đang chờ content-addressed Canvas.
- `COFOFO-WEATHER-003-RED`: trước khi có RED behavioral evidence.
- `COFOFO-WEATHER-004-REJECTED`: Request changes và feedback phải được rework.
- `COFOFO-WEATHER-005-COMPLETED`: feature hoàn tất đủ mọi phase và artifact.
- `COFOFO-WEATHER-006-BUGFIX-COMPLETED`: bugfix đã ship sau reject/rerun và
  có root-cause, regression, Canvas, evidence, memory, improvement history.
- `COFOFO-WEATHER-007-PROD-DIAGNOSIS`: incident production-only chờ duyệt
  nguyên nhân trước khi viết test.
- `COFOFO-WEATHER-008-RED-WAIVER`: race condition không ổn định, minh họa
  waiver có reviewer/lý do/evidence thay thế, secret screening và Canvas gate
  trên `RED-EVIDENCE.md`.
- `COFOFO-WEATHER-009-STALE-REBASE`: Foundation revision đổi giữa run, bắt
  buộc rebase/replay thay vì tiếp tục trên policy cũ.
- `COFOFO-WEATHER-010-RULE-IMPROVEMENT`: improvement là
  `proposed — not active`, phải đi qua `update-rules` + Canvas mới được áp dụng.

Các task có immutable pipeline snapshot; task cũ có thể dùng
`AIDLC: CoFoFo: Rebase Delivery Run to Active Foundation` sau khi Foundation
sẵn sàng. Re-seed sẽ tạo lại toàn bộ trạng thái demo nhưng không đụng scratch
files ngoài các thư mục fixture sở hữu.

## Phạm vi MVP

Runtime CoFoFo chạy trên **mọi stack detector đã biết**, catalog lọc theo
stack. Multi-stack, monorepo, hoặc không có manifest: `scan-stack` fail-closed,
không đoán bundle và không chuyển sang pipeline khác. Không có network fetch
trong pipeline. Destinations/schemes Xcode không bị bịa.
