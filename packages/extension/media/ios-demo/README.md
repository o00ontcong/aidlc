# TodoKit — AIDLC iOS Demo

Demo chạy được của **iOS pipeline hai tầng** trên một app SwiftUI có thật.
`src/` là Swift Package build được bằng `swift build`, không phải code giả.

```bash
cd src && swift build     # Build complete!
cd src && swift test      # 7 tests, 0 failures
```

## Hai pipeline

```
project-foundation   ─ chạy MỘT LẦN cho cả project ────────────────┐
  scan-project              → PROJECT-SCAN.md                      │
  standardize-structure     → CONVENTIONS.md + STRUCTURE-DRIFT.md  │ Approve
  map-system                → ARCHITECTURE-MAP + PROJECT-CONTEXT   │ Approve
  document-business-rules   → BUSINESS-RULES + OPEN-QUESTIONS      │ Approve + auto-review
  publish-context           → docs/README.md + CLAUDE.md + MANIFEST│ Approve
                                                                    │
              ┌─────────────────────────────────────────────────────┘
              │  CONTEXT-MANIFEST.json  ← cổng chặn cứng
              ▼
ios-pipeline         ─ chạy MỘT LẦN cho MỖI epic ─
  requirement → create-plan → ui-spec → implement → fix-bug
```

**Parent tồn tại để làm gì:** một agent mở repo lần đầu không biết `TodoStore` là nơi duy nhất
được mutate, hay vì sao không được validate trong View. Parent ghi những điều đó ra file để
mọi epic sau đọc, thay vì mỗi lần lại tự suy luận lại (và suy sai).

## 5 epic đã seed sẵn

| Epic | Đậu ở đâu | Dạy điều gì |
|---|---|---|
| `DEMO-FOUNDATION-001` | `project-foundation` bước 1 | Chạy parent từ đầu tới cuối |
| `DEMO-TODO-001-GATE` | `requirement`, awaiting_work | **Hard gate**: Mark done sẽ bị chặn tới khi parent publish manifest |
| `DEMO-TODO-002-PLAN` | `create-plan`, awaiting_review | Approve / Reject một artifact |
| `DEMO-TODO-003-BUILD` | `implement`, awaiting_work | **Evidence gate**: auto-review chạy `swift build` + `swift test` thật |
| `DEMO-TODO-004-REJECTED` | `ui-spec`, rejected | Chạy lại kèm feedback |

## Đi theo thứ tự này

1. Mở `DEMO-TODO-001-GATE` → bấm **Mark step done** → bị chặn vì thiếu
   `docs/project/context/CONTEXT-MANIFEST.json`. Đó là parent đang gác cửa.
2. Mở `DEMO-FOUNDATION-001` → chạy 5 bước. Xem `docs/project/` mọc dần ra.
   Bước `document-business-rules` là chỗ đáng xem nhất: agent phải dẫn được
   `**Evidence:**` cho từng luật, không dẫn được thì auto-review reject.
3. Quay lại `DEMO-TODO-001-GATE` → giờ Mark done qua được.
4. `DEMO-TODO-003-BUILD` → chạy `/implement`. Agent sửa code Swift thật, rồi
   auto-review build và test lại. Thử phá một test rồi chạy lại để xem gate chặn.

## Thư mục

| Đường dẫn | Chứa gì |
|---|---|
| `src/` | Swift Package — Domain / Data / Presentation + unit test |
| `.aidlc/workspace.yaml` | 2 pipeline, agent, skill, recipe |
| `.aidlc/skills/` | 10 skill (5 parent + 5 child) |
| `.aidlc/validators/` | `swift-build.mjs`, `business-rules.mjs` — auto-review chạy thật |
| `docs/epics/` | 5 epic demo |
| `docs/project/` | **trống lúc đầu** — parent sinh ra |

Demo này không cần Figma. `/ui-spec` đọc ảnh wireframe trong `screens/` của từng epic —
đúng cơ chế fallback mà skill quy định khi không có Figma MCP.
