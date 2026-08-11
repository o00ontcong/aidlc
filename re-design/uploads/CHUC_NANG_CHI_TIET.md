# Chi tiết chức năng — AIDLC Monorepo (cấp lệnh / API / UI)

> Tài liệu này bổ sung cho [PHAN_TICH_CHUC_NANG.md](PHAN_TICH_CHUC_NANG.md) (tổng quan kiến trúc) bằng một bản kiểm kê **chi tiết đến từng chức năng nhỏ**: mọi subcommand + flag của CLI, mọi command trong `CommandBus` của `@aidlc/core`, và mọi command/tính năng UI của VS Code extension — bao gồm câu trả lời trực diện cho câu hỏi "epic có search/follow không".

**Ghi chú bắt buộc đọc trước**: repo có **2 tầng hệ thống song song** (xem mục 2, PHAN_TICH_CHUC_NANG.md):
- **Tầng v2 (legacy, đã ổn định)**: `workspace.yaml` → agent/skill/pipeline → `run`/`step` → `docs/epics/<id>/state.json` (epic "legacy", scaffold thủ công). CLI: `run`, `step`, `watch`, `tail`, `dashboard`, `epic list` (deprecated). Extension: webview V2 (`EpicsView.tsx`, `EpicCard.tsx`).
- **Tầng v3 (redesign, đang xây)**: `AidlcApplication`/`CommandBus` → `EpicService`/`EpicStore` → `.aidlc/epics/<id>/{state.json,events.ndjson,workflow.json}`. CLI: `epic-v3`/`project`/`context`/`gate`/`guide-v3`/`artifact`/`migration`. Extension: webview `v3/*`.

Nhiều chức năng (đặc biệt **search** và **follow** epic) **chỉ tồn tại ở một tầng, không tồn tại ở tầng kia** — xem mục 4 để so sánh trực tiếp.

---

## 1. CLI (`packages/cli/src/commands/*.ts`)

### 1.0 Global options (`packages/cli/src/index.ts`)

| Option | Hành vi |
|---|---|
| `-w, --workspace <path>` | Root workspace; fallback `AIDLC_WORKSPACE` env → `process.cwd()` |
| `-q, --quiet` | Tắt các dòng `info()` trang trí (không tắt lỗi/JSON) |
| `--version` | Từ `package.json` |

Hook `preAction` tự động chọn backend lưu run-state (`persistence` trong `workspace.yaml`) trước mọi subcommand. **Không có** `--json` toàn cục — mỗi subcommand tự khai `--json` riêng.

### 1.1 `agent` — CRUD agent trong `workspace.yaml`

| Subcommand | Flags | Hành vi |
|---|---|---|
| `agent add` | `--id`, `--name` (bắt buộc), `--skills <ids>` (CSV, bắt buộc), `--model` (mặc định `claude-sonnet-4-5`), `--capabilities`, `--description`, `--runner` (`default`/`custom`), `--runner-path` | Bắt buộc mọi skill id đã tồn tại trong `doc.skills` trước khi thêm; `--runner custom` mà thiếu `--runner-path` → lỗi; validate schema trước khi ghi |
| `agent list` | `--json` | List agent (model, runner khác default, description) |
| `agent show <id>` | — | In toàn bộ object agent |
| `agent remove <id>` | — | Xóa agent theo id |
| `agent run <id>` | `--message`, `--context <k=v>` (lặp), `--context-file`, `--dry-run` | **One-shot**: spawn Claude trực tiếp với skill của agent, **không tạo run state file** (khác `run start`); `--dry-run` chỉ in system prompt |

**Không có `agent update`/`edit`** — sửa chỉ qua remove + add lại, hoặc sửa tay YAML.

### 1.2 `skill` — CRUD skill

| Subcommand | Flags | Hành vi |
|---|---|---|
| `skill add` | `--id`, `--template <name>` **hoặc** `--path <file>` (bắt buộc chọn đúng 1) | Với `--template`: ghi file `.md` thật vào `.aidlc/skills/<id>.md` từ template có sẵn. Với `--path`: chỉ tham chiếu file đã có, không copy |
| `skill list` | `--json`, `--templates` (list template built-in) | |
| `skill show <id>` | — | Builtin → in ghi chú; có `path` → đọc nội dung file thật |
| `skill remove <id>` | — | Xóa entry khỏi `workspace.yaml`; **không xóa file `.md`** trên đĩa |

Không có `skill edit`.

### 1.3 `pipeline` — CRUD pipeline + phân loại task-type (recipe)

| Subcommand | Flags | Hành vi |
|---|---|---|
| `pipeline add` | `--id`, `--steps <agents>` (CSV theo thứ tự, bắt buộc), `--human-review`, `--on-failure <stop\|continue>`, `--produces <paths>` (phân đoạn `:` theo step) | Validate mọi agent id đã tồn tại |
| `pipeline recipes` | `--json` | List `doc.recipes` |
| `pipeline classify <brief...>` | `--llm` (dùng `claude` phân loại, fallback heuristic khi lỗi/timeout 60s), `--generate` (assemble luôn), `--id`, `--epic`, `--json` | Phân loại brief text → 1 recipe (task-type) |
| `pipeline generate` | `--recipe <id>` (bắt buộc), `--id`, `--epic`, `--from <pipelineId>`, `--dry-run` | Assemble pipeline mới từ 1 recipe có sẵn |
| `pipeline list` | `--json` | List pipeline + chain step |
| `pipeline show <id>` | — | Chi tiết từng step, đánh dấu `[review]` |
| `pipeline remove <id>` | — | Xóa pipeline |

### 1.4 `epic` — Epic lifecycle (LEGACY + cầu nối sang engine unified)

File này **vừa** đọc trực tiếp `docs/epics/<id>/state.json` (legacy) **vừa** dispatch sang `AidlcApplication` (unified) tùy tình huống.

| Subcommand | Flags | Hành vi |
|---|---|---|
| `epic list` | `--json`, `--status <pending\|in_progress\|done\|failed>` | **DEPRECATED** (cảnh báo khi chạy) — đọc `docs/epics/*/state.json`, filter theo status, in bảng |
| `epic status <id>` (alias `show`) | `--json` | Thử load qua engine unified trước; chỉ rơi về legacy nếu epic không tồn tại trong hệ mới |
| `epic start [epicId]` | Legacy: `--recipe`, `--pipeline`, `--brief`, `--llm`, `--from`; Unified: `--title`, `--desc`, `--type`, `--profile`; chung: `--json`, `--input <k=v>` | 2 nhánh tách biệt theo có cờ legacy hay không — legacy scaffold `docs/epics/<id>/state.json`; unified dispatch `epic.start` |
| `epic run <id>` | `--mode <guide\|assist\|auto\|unattended>`, `--pack` (mặc định `sdlc-core`), `--json` | Dispatch `epic.run` — compile + start workflow run trong engine unified |
| `epic prepare/next/explain/resume/review/ship <id>` | `--json` | Mỗi lệnh chỉ dispatch `epic.<action>` sang `AidlcApplication` — không có logic riêng ở CLI |

**Không có `epic search`.** Filter gần nhất: `epic list --status <status>` (chỉ theo trạng thái, không theo từ khóa/tag).

### 1.5 `run` — vòng đời run (pipeline engine legacy, 521 dòng)

| Subcommand | Flags | Hành vi |
|---|---|---|
| `run start <pipelineId>` | `--id`, `--context`, `--context-file` | Tạo run mới |
| `run mark-done <runId>` | — | **Validate artifact `produces` phải tồn tại thật trên đĩa** trước khi advance |
| `run approve <runId>` | `--comment` | Approve step đang `awaiting_review` |
| `run reject <runId>` | `--reason` (bắt buộc) | Reject, gợi ý `run rerun` |
| `run rerun <runId>` | `--feedback` | Bump revision, reset step hiện tại |
| `run request-update <runId> <step>` | `--feedback` | Mở lại step đã approved để sửa (cascade reset các step sau) |
| `run delete <runId>` | `--force` | Xóa run |
| `run open <runId>` | `--path` | In JSON state hoặc path file |
| `run exec <runId>` | `--until`, `--auto-approve`, `--require-complete`, `--message`, `--dry-run`, `--json` | **Chạy tự động**: spawn Claude thật, stream output, tự advance qua step, dừng ở `human_review` trừ `--auto-approve`; exit code 0/2/1 dùng cho CI gating |
| `run verify <runId>` | `--json` | Read-only: kiểm tra drift artifact |
| `run report <runId>` | `--format <md\|json>`, `--output` | Render report |

### 1.6 `step` — điều khiển trực tiếp từng step

| Subcommand | Hành vi |
|---|---|
| `step start <runId> <step>` | Set step → `awaiting_work`, demote step trước đó về `pending` |
| `step done <runId> <step>` | Set step → `approved`, **không validate `produces`** (khác `run mark-done`) |
| `step skip <runId> <step>` | Giống `done` với feedback cố định "Skipped via aidlc step skip." |
| `step reset <runId> <step>` | Reset step về `pending`, không cascade |
| `step set <runId> <step> <status>` | Set status tùy ý (`pending/awaiting_work/awaiting_auto_review/awaiting_review/approved/rejected`) |
| `step jump <runId> <step>` | Di chuyển pointer, **tự auto-approve mọi step pending phía trước** |

### 1.7 `watch` — theo dõi run real-time (full-screen re-render)

`aidlc watch [runId]` — cơ chế: `chokidar.watch('.aidlc/runs/*.json')` (fs-events + `awaitWriteFinish` polling 30ms nội bộ để chờ file ghi ổn định) + debounce 150ms trước khi render lại, `clearScreen()` mỗi frame. Không có `runId` → bảng nhiều run; có `runId` → chi tiết pipeline 1 run với marker `▶` ở step hiện tại. Dừng bằng Ctrl+C.

### 1.8 `tail` — theo dõi run real-time (event-diff, giống `tail -f`)

`aidlc tail [runId]` — `--json` (NDJSON). Khác `watch`: **không** debounce, **không** clear screen — giữ snapshot trước/sau của mỗi run và in **chỉ phần thay đổi** (`run_new`, `run_gone`, `run_status`, `pointer`, `step_status`, `step_revision`) theo từng dòng log có timestamp. `--json` để pipe vào `jq`/bot Slack.

### 1.9 `dashboard` — web dashboard (HTTP + Server-Sent Events, không dùng WebSocket)

`aidlc dashboard` — `-p/--port` (mặc định 8787), `--host` (mặc định 127.0.0.1).

- API: `GET /api/runs`, `GET /api/runs/:id`, `GET /api/workspace`, `GET /api/epics` (legacy), `GET /events` (SSE, heartbeat 15s), `POST /api/action` (approve/reject/rerun/mark-done).
- **Live update**: `chokidar` watch `runs/*.json` + `workspace.yaml` + `docs/epics/*/state.json` → debounce 100ms → broadcast `data: refresh` qua SSE tới mọi client browser đang mở.
- UI 3 tab: **Runs** (list + panel action approve/reject/rerun/mark-done — "click-to-approve"), **Builder** (Workflows/Agents/Skills, chỉ đọc), **Epics** (filter theo status all/in_progress/pending/done/failed, client-side).

### 1.10 `status` / `list` — xem nhanh

- `aidlc status [runId]`: không truyền id → list phẳng mọi run (không filter); có id → chi tiết run + từng step.
- `aidlc list`: tổng hợp cả 3 loại cấu hình (agents/skills/pipelines) trong 1 lệnh, gọn hơn các lệnh `list` riêng của từng nhóm.

### 1.11 `recipe` / `preset`

- `recipe init` (`--dry-run`): back-fill recipes từ pipeline có sẵn cho workspace tạo trước khi có khái niệm recipe; idempotent.
- `preset list` (`--json`): list 4 preset built-in (`code-review`, `release-notes`, `sdlc`, `cohesive-delivery`) + preset đã lưu.
- `preset apply <name>`: merge **additive-only** (`addIfMissing` theo id, không bao giờ overwrite) agent/skill/pipeline/recipe vào workspace; preset `sdlc`/`cohesive-delivery` còn cài file markdown vào `~/.claude/`.
- `preset save <name>`: serialize toàn bộ `workspace.yaml` hiện tại thành `.aidlc/presets/<name>.json`.

### 1.12 `monitor` — plugin `agents-observe` (quan sát session Claude, khác dashboard AIDLC)

`aidlc monitor` — `--dry-run`, `--open`, `--start`, `--json`. Phát hiện/cài plugin ngoài `agents-observe` (cổng cố định `4981`), pin `AGENTS_OBSERVE_LOCAL_DATA_ROOT` trong `~/.claude/settings.json` (chỉ sửa key `env`, backup `.bak` trước khi ghi), `--start` khởi chạy server (Docker hoặc local), `--open` mở dashboard trình duyệt.

### 1.13 `globals` — cài/gỡ workflow toàn cục + memory-hook

| Subcommand | Hành vi |
|---|---|
| `globals status` | List trạng thái cài đặt mọi built-in workflow dưới `~/.claude/` |
| `globals install [ids...]` | Ghi agent/skill markdown vào `~/.claude/{agents,skills}`; luôn cài kèm annotron + epic-memory + `/annotate-artifact`, `/epic-context` |
| `globals uninstall [ids...]` | Gỡ có phạm vi — giữ file còn dùng chung bởi workflow khác |
| `globals memory-hook <enable\|disable\|status>` | Toggle hook `UserPromptSubmit` trong `~/.claude/settings.json` — tự inject `epic-memory.json` digest khi prompt nhắc epic |

### 1.14 `cohesive` — Cohesive Delivery orchestration (project-level autonomous delivery)

| Subcommand | Hành vi |
|---|---|
| `cohesive run` | Tạo `DeliveryRequest` (title/description/acceptance/constraint/source), chạy orchestrator, in tiến trình chi tiết theo stage/step |
| `cohesive resume <id>` | Resume delivery, in `lastFailure`/`lastError` trước khi tiếp tục |
| `cohesive status [id]` | List mọi delivery hoặc chi tiết 1 delivery |
| `cohesive logs <id>` | `--tail`, `--json` — execution failure log durable, đánh dấu `current` vs `recovered` |
| `cohesive add-task <id>` | Thêm task review thủ công, có thể gắn vào run/step cụ thể |
| `cohesive rework <id>` | Route pending human task, rerun phần bị ảnh hưởng |
| `cohesive review <id>` | In/đường dẫn Markdown review tổng hợp |
| `cohesive resume-after-merge <id>` | Chạy await-merge/project-sync sau khi PR merge |
| `cohesive confirm-context <id>` | Ghi nhận chỉnh sửa tay lên "project charter" đã suy luận, mặc định trigger rework có chọn lọc |
| `cohesive reconcile-validators` | Giải quyết xung đột `.aidlc-new` (validator bundle mới) — interactive diff hoặc `--keep`/`--accept`/`--list` |

### 1.15 `analyze` — phân tích requirement → task breakdown tương tác

`aidlc analyze` — `--source`, `--text`, `--platform <jira|github|linear|redmine|local>`, `--parent`, `--project-key`, `--brief`, `--instruction`, `--id`, `-y`. Không cần `workspace.yaml`. Mọi flag thiếu được hỏi qua `readline`. Sinh `runId` dạng `REQ-NNN` tự tăng, ghi `inputs.json` vào `docs/task-breakdowns/<runId>/`, tự cài slash command `/analyze-requirements` vào `.claude/commands/` nếu chưa có. **Chỉ scaffold — không tự phân tích bằng LLM** (gợi ý chạy `/analyze-requirements` trong Claude).

### 1.16 `init` / `validate` / `doctor` / `guide` / `ask`

| Lệnh | Hành vi |
|---|---|
| `init --name` | Scaffold `.aidlc/{workspace.yaml,skills/,runs/}`, idempotent |
| `validate --strict --json` | Validate schema + referential integrity (agent/skill/recipe tham chiếu tồn tại); không `--strict` → chỉ warning |
| `doctor --json` | 7 health-check: workspace, `claude` binary, chế độ auth hiệu lực, skill file tồn tại, custom runner path, run state đọc được, Node ≥18 |
| `guide` | In tĩnh reference card, không gọi LLM |
| `ask <prompt...>` | Spawn Claude với system prompt nhúng toàn bộ `AIDLC_KNOWLEDGE`, stream trả lời — hỏi về AIDLC, không phải về code |

### 1.17 `v3/registerRedesign.ts` — command surface engine unified (adapter thuần, không chứa logic)

Mọi lệnh nhóm này chỉ dispatch `{command, payload}` sang `AidlcApplication.bus` và in JSON kết quả (exit code `ok`→0, `waiting-for-user`→2, `blocked`→3, khác→1).

| Nhóm | Subcommand | Flags chính |
|---|---|---|
| `epic-v3` (alias `epic3`) | `start <id>`, `status/show <id>`, `resume <id>`, `run <id>`, `prepare/next/explain/review/ship <id>` | `--title`, `--type`, `--profile`, `--mode`, `--pack`, `--json` |
| `project` (alias `project-v3/project3`) | `setup`, `analyze`, `recommend`, `recommend-accept`, `recommend-lock`, `recommend-override`, `context-refresh`, `context status/refresh` | `--confirm`, `--force-claude-command`, `--project-id`, `--source-commit`, `--profile`, `--json` |
| `context` (alias `context-v3/context3`) | `refresh`, `status` | `--project-id`, `--source-commit`, `--json` |
| `gate` (alias `gate-v3/gate3`) | `preview`, `approve <epic-id> <gate-id>`, `reject <epic-id> <gate-id>` | `--content-summary`, `--mode`, `--stage`, `--mutation`, `--destructive`, `--merge-default-branch`, `--external-communication`, `--risk`, `--reason`, `--json` |
| `guide-v3` (alias `guide3`) | `help [topic]`, `doctor`, `why-blocked <epic-id>` (alias `why`) | `--json` |
| `artifact` (alias `artifact-v3/artifact3`) | `preview-commit <epic-id> <type...>` | `--json` (chỉ preview, không commit thật) |
| `migration` / `migrate` | `preview`, `apply <id>`, `rollback <id>` | `--confirm`, `--json` |

**Lưu ý**: nhóm `epic-v3` là alias tương thích — lệnh chính thức `epic` (không hậu tố) do §1.4 đăng ký và dispatch cùng payload.

---

## 2. Core Application (`@aidlc/core` — `AidlcApplication` + `CommandBus`)

### 2.1 Toàn bộ 37 command đăng ký trong `CommandBus` (xác nhận đầy đủ, không thiếu)

| Command | Input chính | Effect |
|---|---|---|
| `epic.start` | `CreateEpicInput` | Tạo epic (idempotent) |
| `epic.run` | `epicId, packId?, mode?` | Đổi autonomy mode nếu có, compile workflow, start run |
| `epic.prepare` | `epicId` | `draft` → `ready` |
| `epic.next` | `epicId` | Chạy action kế tiếp của workflow |
| `epic.status` | `epicId` | Trả epic hiện tại |
| `epic.resume` | `epicId` | Resume epic đang `waiting-for-user/blocked/paused` |
| `epic.explain` | `epicId` | Epic + blocker + pending gate |
| `epic.review` | `epicId` | `running` → `review` |
| `epic.ship` | `epicId` | `review` → `shipping` → `completed` |
| `epic.stage.autonomy.set` | `epicId, stageId, autonomy` | Set autonomy riêng cho 1 stage |
| `project.context.refresh` | `projectId?, sourceCommit?` | Quét + ghi, bump revision |
| `project.analyze` | như trên | Chỉ đọc, không ghi |
| `project.context.status` | `sourceCommit?` | `{context, stale}` |
| `project.recommend` | — | Sinh `ProjectRecommendation`, ghi proposal |
| `project.setup` | `confirm?, forceClaudeCommand?` | Preview layout; chỉ apply khi `confirm:true` |
| `gate.preview` | `subject, mode?, epicId?, stageId?` | Mô phỏng gate, không mutate |
| `migration.preview/apply/rollback` | `migrationId?, confirm?` | Cầu nối dữ liệu legacy → unified |
| `gate.request` | `epicId, stageId, actionId?, subject` | Có thể chuyển epic sang `waiting-for-user` |
| `gate.approve` | `epicId, gateId, reason?` | Approve gate; nếu có `actionId` thì **thực thi ngay** action đó |
| `gate.reject` | `epicId, gateId, reason?` | Epic → `paused` |
| `artifact.preview.commit` | `types[], epicId` | Preview, không ghi |
| `artifact.policy.update` | `policy` | Ghi `.aidlc/artifacts.yaml` |
| `workflow.compile` | `epicId, packId, ...` | Compile + lưu `CompiledWorkflow` |
| `capability.enabled.set` | `capabilityId, enabled` | Ghi `.aidlc/capabilities.yaml` |
| `model.diagnose` | — | Danh sách `ProviderDiagnostic` |
| `model.provider.default.set` | `providerId` | Ghi `.aidlc/providers.yaml` |
| `project.recommend.accept/override/lock` | — | Đổi status proposal; `lock` ghi file mới `recommendation.lock.yaml` |
| `guide.explain` | `stage` | `GuideMetadata` tĩnh |
| `guide.doctor` | — | Health-check capabilities + model providers |
| `guide.help` | `topic?` | `GuideHelpTopic` tĩnh |
| `guide.why.blocked` | `epicId?`/`error?` | Giải thích + recovery actions |
| `epic.review.feedback` | `epicId, artifactId, feedback` | Ghi audit event, không đổi status |
| `recovery.apply` | `epicId?, action, reason?` | `epic.resume`/`retry`/`apply-fix` → resume; else chỉ trả nextAction |

`CommandBus.register()` throw nếu đăng ký trùng tên — chống trùng lặp command (không phải cơ chế CRUD dữ liệu).

### 2.2 `EpicService` + `EpicStore` — chi tiết state machine

| Method | Hành vi |
|---|---|
| `create()` | Tạo epic `status:'draft', revision:0`; throw nếu id đã tồn tại |
| `start()` | Idempotent wrapper của `create()` |
| `load()` / `require()` | Đọc epic (`null` vs throw nếu không có) |
| `list()` | **Trả toàn bộ**, sort theo `updatedAt` giảm dần — **không có filter theo status/tag** (model `Epic` không có field `tag`) |
| `update()` | Optimistic-lock bằng `expectedRevision`; chặn đổi `stages` khi có run active |
| `transition()` | Chuyển status theo state machine hợp lệ; validate pending gate phải approve trước khi resume |
| `startRun()` | Tạo `EpicRun` đầu tiên, epic → `running` |
| `updateRunProgress()` | Ghi audit event **trước**, rồi mới lưu 2 projection (`EpicRun`, `Epic`) |
| `resume()` | Chỉ resume trạng thái chờ — quyết định gate chỉ do `AutonomyRunCoordinator.decide()` |
| `events()` | Gộp epic-level + run-level event |
| `record()` | Ghi 1 audit record không đổi status (vd. review feedback) |

`EpicStore` (filesystem, `.aidlc/epics/`, `.aidlc/runs/`): optimistic-lock bằng file `.lock`, **append-only** `events.ndjson` (redact secrets), ghi atomic (tmp + fsync + rename), tự phục hồi projection từ event log nếu crash giữa lúc ghi (`recoverProjection`).

### 2.3 Workflow — compile, chạy, approve/reject action

- **`WorkflowCompiler.compileWorkflow()`**: chọn stage hiển thị theo profile (`quick` bỏ stage `plan`), lấy action từ pack, validate DAG (id kebab-case, không trùng, không tự phụ thuộc, không thiếu capability/dependency, không cycle qua DFS) → hash SHA-256 deterministic.
- **`WorkflowRuntimeService.next()`**: tìm action kế tiếp theo dependency graph; mode `guide` → chỉ trả guidance; cần approval → gọi `AutonomyRunCoordinator.guard()`.
- **`executeApproved()`**: alias của `next()` với `approvedActionId` — cách 1 action đã được approve **thực sự chạy**.
- **`execute()`** (nội bộ): resolve model qua `ModelProviderRegistry` → gọi `provider.execute()` → lưu evidence (hash SHA-256, ghi `.aidlc/runs/<run>/evidence/<action>.json`) → retry tối đa `autonomy.recovery.maxAttempts`, hết lượt → epic `blocked`.
- **Luồng approve/reject đầy đủ**: `epic.next` → action cần gate → epic `waiting-for-user` + tạo `PendingGate` → `gate.approve`/`gate.reject` → `AutonomyRunCoordinator.decide()` → approved: `EpicService.resume()` rồi `AidlcApplication` tự gọi `runtime.executeApproved()`; rejected: epic → `paused`.
- **`CompiledWorkflowStore`**: `.aidlc/epics/<id>/workflow.json` + tự sinh `plan.md` (checklist theo stage).

### 2.4 Autonomy — cơ chế "hard gate" (implement chính xác ở đâu)

- `HARD_GATE_KINDS = ['destructive_changes', 'merge_default_branch', 'external_communication']` (`contracts/autonomy.ts`).
- `resolveGatePolicy()`: nếu là hard gate → luôn `{enforcement:'always', hard:true}` **bất kể config** đặt gì.
- `isGateBypassableInMode()`: nếu `hard` → luôn `false`, **không mode nào (kể cả `unattended`) bypass được**.
- Enforce **2 lần độc lập**: (a) schema Zod reject config đặt hard gate khác `'always'`; (b) `resolveGatePolicy` bỏ qua config bất kể schema có bị lách hay không.
- `AutonomyController.gateForSubject()`: map field boolean của action (`destructive`, `mergeDefaultBranch`, `externalCommunication`) → gate kind tương ứng.
- `AutonomyRunCoordinator.guard()/decide()/recover()`: đánh giá gate → tạo `PendingGate`; so khớp decision; chính sách retry (`planRecovery`: hết lượt → escalate, `onValidationFailure:'ask'` → hỏi người dùng, `'stop'` → escalate, else → retry).
- `AutonomyPolicyStore`: đọc/ghi `.aidlc/autonomy.yaml`, fallback default policy nếu chưa có.

### 2.5 `CapabilityRegistry`

`register()`/`unregister()`/`list()`/`get()` (throw nếu không tồn tại) — `isEnabled()` đọc override, fallback `enabledByDefault` — `setEnabled()` set override in-memory (ghi đĩa do `AidlcApplication` gọi `CapabilityPolicyStore.save()` ngay sau) — `health()`/`healthAll()` — `resolveRequirements()` check capability bắt buộc có `enabled && healthy`. Policy override lưu `.aidlc/capabilities.yaml`.

### 2.6 Model provider

- `ModelProviderRegistry`: `register()`/`unregister()` (tự chọn default mới nếu default bị xóa)/`setDefault()`/`getDefault()`/`resolve()` (rank ứng viên, thử theo điểm cao→thấp, throw kèm diagnostics nếu không ai thỏa)/`diagnose()`.
- `ModelProviderConfigStore`: `.aidlc/providers.yaml { defaultProvider }` — **không lưu credential**.
- `ModelSelectionLockStore.record()`: ghi `.aidlc/catalog/selection.lock.yaml` — audit trail model đã dùng cho từng tổ hợp epic/stage/action (không phải hard-lock ngăn đổi provider).
- `rankModelCandidates()`: hard filter = `tier` khớp + `contextWindowTokens` đủ + `supportsTools` (nếu cần); soft score = khớp `latencyClass`/`costClass` (+20 mỗi cái) + context headroom (tối đa +5); tie-break bằng so sánh chuỗi để **deterministic**.

### 2.7 `ProjectIntelligenceService`

| Method | Hành vi | Ghi file |
|---|---|---|
| `analyze()` | Quét `package.json`, tên file/dir (Xcode/Swift, domain trading qua từ khóa path, CI config, monorepo, hotspot theo dir, `.ast-graph/graph.db`) | Không ghi |
| `refreshContext()` | `analyze()` + bump revision | `.aidlc/project.yaml` |
| `contextStatus()` | Xác định context "stale" (uninitialized hoặc source commit không khớp) | Không ghi |
| `recommend()` | Sinh role/profile gợi ý (`regulated` nếu domain trading, else `standard`) | Không ghi |
| `propose()` | `recommend()` + lưu | `.aidlc/catalog/recommendation.proposal.yaml` |
| `accept()`/`override()` | Đổi status proposal / thay roles+profile | Ghi lại **cùng file** proposal |
| `lock()` | Yêu cầu proposal đã accepted/overridden | Ghi **file mới** `recommendation.lock.yaml` — duy nhất workflow compiler thực sự đọc |

### 2.8 Loader — CRUD agent/skill tầng thấp thực sự nằm ở đâu

**Điểm quan trọng**: `packages/core/src/loader/` (`AssetDiscovery.ts`, `SkillLoader.ts`, `WorkspaceLoader.ts`) **chỉ đọc (discover/load)** — không có method ghi hoặc xóa skill/agent.

- `AssetDiscovery`: quét 3 scope theo ưu tiên `project > aidlc > global` (`.claude/{skills,agents}` dự án, `.aidlc/{skills,agents}` workspace, `~/.claude/{skills,agents}` toàn cục). Cùng id ở nhiều scope → đánh dấu `overridden:true` (không throw lỗi — đây là "validate trùng tên" thực tế). `targetPath()` chỉ **tính** đường dẫn ghi cho asset mới, không tự ghi.
- **Việc ghi file thật (`fs.writeFileSync`, check "already exists → overwrite?") nằm ở `packages/extension/src/v2/wizards.ts`** — ngoài `core/src`. Core chỉ cung cấp discovery + tính path; add/remove file thật là trách nhiệm CLI/Extension.
- `SkillLoader`: đọc nội dung markdown skill khai báo trong `workspace.yaml` (builtin theo map cố định hoặc path tương đối), cache theo instance — thuộc **hệ workspace.yaml pipeline cũ**, khác với discovery 3-scope trên.

### 2.9 `ArtifactPolicyService`

`preview()`: resolve artifact type → path thật, chỉ giữ `commit:true`, throw nếu 2 type resolve trùng path. Policy **không phải allow-list glob path** mà là registry theo "artifact type" (path template có placeholder `{epic}/{stage}/{action}/{id}`). Default: `commit:false` cho mọi type — **không loại artifact nào tự động commit** trừ khi khai báo opt-in. Có `assertSafeRelative()` chặn path tuyệt đối hoặc chứa `..`.

### 2.10 `GuideService`

`explain(stage)` (metadata tĩnh) — `next()`/`nextOrFallback()` (never "cụt đường") — `doctor()`/`diagnose()` (health-check capability + model provider) — `whyBlocked()`/`whyEpicBlocked()` (giải thích + gợi ý command khắc phục) — `help(topic)` (tĩnh).

### 2.11 Xác nhận: không có "search"/"follow"/"watch"/"subscribe" trong `core/src`

Grep toàn bộ `core/src` (bao gồm `epic/`, `workflows/`, `application/`):
- `filter` chỉ là `Array.prototype.filter()` thông thường trong logic nội bộ.
- `search` chỉ có 1 kết quả không liên quan (`String.prototype.search()` tìm marker trong `charterArtifacts.ts`).
- `watch`/`subscribe`/`EventEmitter`/`fs.watch`/`chokidar`: **0 implementation thật** trong `core/src` — chỉ xuất hiện trong comment/help text mô tả lệnh CLI (`aidlc watch`/`tail`/`dashboard`/`monitor`).
- `follow`: chỉ nghĩa "việc cần làm tiếp theo" (`severity: 'follow-up'`), không liên quan theo dõi real-time.

→ **Engine Epic "redesign" (unified) hiện chưa có API search/filter/follow/watch nào.** Cơ chế theo dõi duy nhất là poll thủ công (`epic.status`/`epic.explain`) hoặc đọc audit log (`EpicService.events()`).

---

## 3. VS Code Extension (`packages/extension`)

### 3.1 Kiến trúc 3 lớp

- **V2** (`src/v2/*` + `src/webview/{sidebar,workspace,monitor,report,standard}`): hệ chính, dựa `workspace.yaml`. **Đây là nơi duy nhất có search/follow epic đầy đủ.**
- **V3** (`src/v3/*` + `src/webview/v3/*`): surface mới, dispatch qua `AidlcApplication.bus` (37 command ở §2.1). Mở bằng `aidlc.v3.open`.
- **AST Graph** (`src/v2/astGraph/*`): tích hợp phụ trợ (binary CLI, MCP server, report webview).

### 3.2 Toàn bộ 41 command trong Command Palette (`contributes.commands`)

| Command ID | Title | Chức năng |
|---|---|---|
| `aidlc.project.analyze` | Analyze Project (Unified) | Dispatch `project.analyze` (V3) |
| `aidlc.project.setup` | Preview Project Setup (Unified) | Dispatch `project.setup` (V3) |
| `aidlc.epic.next` | Run Next Epic Action (Unified) | Hỏi Epic id → dispatch `epic.next` (V3) |
| `aidlc.epic.resume` | Resume Epic (Unified) | Dispatch `epic.resume` (V3) |
| `aidlc.v3.open` | Open AIDLC Workspace | Mở panel `aidlc.v3.workspace` |
| `aidlc.openBuilder` | Open Workspace Builder | Mở webview Builder |
| `aidlc.showWorkspaceConfig` | Show Workspace Config | In `workspace.yaml` ra Output channel |
| `aidlc.initWorkspace` | Init Sample Workspace | QuickPick preset/empty → scaffold |
| `aidlc.openGettingStarted` | Open Getting Started Guide | Mở markdown preview |
| `aidlc.ask` | Ask AIDLC | Prompt → Claude → preview trả lời |
| `aidlc.addSkill` | Add Skill | Wizard (template/paste/upload/blank) |
| `aidlc.addAgent` | Add Agent | Wizard tạo agent |
| `aidlc.addPipeline` | Add Pipeline (chain agents) | Wizard nối agent thành pipeline |
| `aidlc.generateFromRecipe` | Generate Pipeline from Recipe | Sinh pipeline từ recipe |
| `aidlc.openClaudeTerminal` | Open Claude CLI Terminal | Mở terminal, chạy `claude` |
| `aidlc.savePreset` | Save Workspace as Template | Lưu preset |
| `aidlc.applyPreset` | Load Template | Áp preset |
| `aidlc.deletePreset` | Delete Saved Template | Xóa preset đã lưu |
| `aidlc.installWorkflowGlobals` | Install Workflow Globals (~/.claude) | Cài workflow toàn cục |
| `aidlc.uninstallWorkflowGlobals` | Uninstall Workflow Globals | Gỡ |
| `aidlc.migrateEpics` | Migrate Epic State Files | Migrate state file legacy |
| `aidlc.startEpic` | Start Epic | Wizard khởi tạo epic |
| `aidlc.startAutonomousDelivery` | Start Autonomous Delivery for Existing Project | Bắt đầu Cohesive Delivery |
| `aidlc.resumeAutonomousDelivery` | Resume Autonomous Delivery | Resume delivery |
| `aidlc.openAutonomousReviewSummary` | Open Autonomous Delivery Review Summary | Mở review summary |
| `aidlc.addAutonomousReviewTask` | Add Autonomous Delivery Review Task | Thêm task review |
| `aidlc.editInferredProjectContext` | Edit and Confirm Inferred Project Context | Sửa/xác nhận context suy luận |
| `aidlc.resumeAutonomousAfterMerge` | Resume Autonomous Delivery After Merge | Resume sau merge |
| `aidlc.reconcileValidatorConflicts` | Resolve Validator Conflicts | Giải quyết conflict validator |
| `aidlc.analyzeRequirements` | Analyze Requirements → Create Tasks | Wizard phân tích requirement |
| `aidlc.openEpicsList` | Open Epics List | Mở tab Epics |
| `aidlc.insertDemoEpic` | Insert Demo Epic (EPIC-100) | Chèn epic demo |
| `aidlc.loadDemoProject` | Load Demo Project (6 epics) | Load project demo |
| `aidlc.showTokenUsage` | Show Claude Token Usage | Mở Token Report |
| `aidlc.refreshTokenUsage` | Refresh Claude Token Usage | Re-scan `~/.claude/projects/*.jsonl` |
| `aidlc.openMonitor` | Open AIDLC Monitor | Mở panel Monitor |
| `aidlc.astGraph.openReport` | Open AST Graph Report | Mở report webview |
| `aidlc.astGraph.rescan` | Rescan AST Graph (clean) | Rescan sạch |
| `aidlc.astGraph.reregisterMcp` | Re-register AST Graph MCP Server | Đăng ký lại MCP |
| `aidlc.selectStandard` | Select SDLC Standard | Chọn chuẩn compliance |
| `aidlc.refreshSidebar` | Refresh Skills & Agents Catalog | Refresh sidebar |

### 3.3 Command ẩn (đăng ký nhưng KHÔNG trong Command Palette — chỉ gọi từ webview)

| Command ID | Gọi từ đâu |
|---|---|
| `aidlc.v3.command` | Transport nội bộ webview V3 |
| `aidlc.savePresetInline` | Nút "Save current as template" |
| `aidlc.runStepWithFeedback` | Nút "Run with Claude"/"Update with feedback" trong `EpicCard` |
| `aidlc.startPipelineRun` | Nút "Start pipeline run" |
| `aidlc.markStepDone` / `.approveStep` / `.rejectStep` / `.rerunStep` / `.runAutoReview` | Nút gate trong `RunGate` (EpicCard) |
| `aidlc.verifyRun` / `.runReport` / `.openRunState` / `.deleteRun` / `.deleteEpic` | Nút Verify/Report/Open state.json/Delete trong `EpicCard` |

### 3.4 Menu / cấu hình đáng chú ý

- `menus.view/title` trên sidebar: Open Builder, Open Epics List, Open Claude Terminal, Open AST Graph Report, Open Monitor, Start Autonomous Delivery, Select Standard, Refresh Sidebar, Ask AIDLC.
- Không có keybinding tùy chỉnh; có 1 walkthrough `aidlc.gettingStarted` (6 bước).
- Setting đáng chú ý: `aidlc.monitor.pollIntervalSeconds` (10s), `aidlc.tokenMonitor.refreshSeconds` (60s), `aidlc.astGraph.autoRescanDebounceSeconds` (5s), `aidlc.workspace.epicsDirectory` (mặc định `docs/epics`).

### 3.5 AST Graph — luồng chi tiết

Binary `ast-graph` (pin version, SHA256 verify, strip macOS quarantine) → `scanner.ts` chạy `ast-graph scan` ghi `.ast-graph/graph.db`, tự watch nguồn (`**/*.{ts,tsx,js,...}`, debounce theo setting) + watch git HEAD (rescan khi đổi branch) → `mcpRegister.ts` đăng ký MCP server (`claude mcp add ast-graph --scope local`) → `claudeMdHint.ts` ghi block hướng dẫn vào `.claude/CLAUDE.md` → **Report webview**: KPI Files/Nodes/Edges/Languages, nút Rescan/Re-register MCP/Reveal .db, section **Hotspots** (bảng + ô lọc theo tên/kind), **By kind**, **HTTP routes**, và **Symbol explorer** (ô tìm kiếm symbol, debounce 500ms, ≥3 ký tự, hiển thị cây callers/callees, click → mở file đúng dòng).

### 3.6 Lớp V3 — client CommandBus

`ExtensionV3ApplicationClient` validate envelope message → `ExtensionV3Host.dispatch()` (override `capability.ast.graph.open`/`capability.annotation.open`, còn lại forward vào `AidlcApplication.bus`, 37 command ở §2.1) → `V3WorkspacePanel` render + `subscribe()`/`notifyDurableStateChanged()` (push state real-time qua `FileSystemWatcher` trên `.aidlc/{epics,runs,project.yaml,autonomy.yaml,...}` — **event-driven, không polling**).

### 3.7 Webview — chức năng UI theo từng khu vực

| Khu vực | Chức năng |
|---|---|
| **Sidebar** (`AppSidebar.tsx`) | Project bar, StatsGrid (Agents/Skills/Flows/Epics), **Recent Epics** (3 gần nhất, không search/filter), Workflows (template), MCP servers. Không có nút run/approve/reject — chỉ launcher. |
| **Workspace → Builder** (`BuilderView.tsx`) | CRUD agent/skill/pipeline (Add/Edit/Rename/Delete), preview pipeline dạng DAG |
| **Workspace → Epics** (`EpicsView.tsx`) | **Xem mục 4 — đây là nơi search + follow epic thật sự tồn tại** |
| **Workspace → Analyze** (`AnalyzeView.tsx`) | Form phân tích requirement, publish Jira/GitHub/Linear |
| **Workspace → Tests** (`TestAgentView.tsx`) | Pipeline 7 bước Explore→Plan→Confirm(gate)→Generate→Execute→Heal→Verdict cho E2E test AI |
| **Monitor** (`AgentsView.tsx`, `InsightsView.tsx`, `TokenReportView.tsx`) | Live session/events từ `agents-observe`; đọc `~/.claude/projects/**.jsonl` (fs.watch live-append); dashboard token theo model/ngày/project/heatmap |
| **Standard** (`StandardPicker.tsx`) | Chọn chuẩn SDLC compliance |
| **V3 → Home** (`HomeView.tsx`) | Project readiness, nút Analyze/Publish context/Generate recommendation, card Current Epic |
| **V3 → Epics** (`v3/epics/EpicsView.tsx`) | **Chỉ list đơn giản — không search, không filter** (đối lập hoàn toàn với V2, xem mục 4) |
| **V3 → Guide** (`GuideDiagnosticsView.tsx`) | Giải thích why/inputs/outputs/doneWhen/next của stage; "Doctor" diagnostics có nút fix |
| **V3 → Studio** (`StudioView.tsx`) | Chọn workflow pack, quản lý model provider, sửa artifact policy JSON, toggle capability |

---

## 4. Trả lời trực diện: "Search epic" và "Follow epic" có tồn tại không?

| Nơi | Search (tìm theo từ khóa/tag) | Follow (theo dõi real-time) |
|---|---|---|
| **CLI** | ❌ Không có lệnh `search`. Gần nhất: `epic list --status <x>` (chỉ filter theo trạng thái, legacy, deprecated) | ⚠️ Có `aidlc watch`/`aidlc tail`/`aidlc dashboard`, nhưng theo dõi **`RunStateStore`** (pipeline cũ) + `docs/epics/*/state.json` (epic legacy) — **không phải** `EpicService`/`EpicStore` của engine unified |
| **Core (`@aidlc/core`)** | ❌ `EpicService.list()` trả toàn bộ, không filter theo status/tag (model `Epic` không có field `tag`) | ❌ Không có `EventEmitter`/`fs.watch`/`subscribe` nào trong `core/src`. Theo dõi chỉ qua poll thủ công (`epic.status`) hoặc đọc audit log (`events()`) |
| **Extension — V2** (`webview/components/EpicsView.tsx`) | ✅ **Có thật**: ô `<input type="search">` lọc theo `id`/`title`/`description`, tức thời (không debounce); 5 nút filter theo status (All/In progress/Pending/Done/Failed, kèm đếm số lượng) | ✅ **Có thật**: nút Follow (biểu tượng ⭐ Star) trên mỗi `EpicCard`, chia 2 khu **Follow / No-follow**, kéo-thả (`draggable`) giữa 2 khu; trạng thái filter/search/follow được **persist** qua `workspaceState` (`src/v2/workspaceUiPrefs.ts`) — nhớ lại khi mở lại panel |
| **Extension — V3** (`webview/v3/epics/EpicsView.tsx`) | ❌ Chỉ là `<aside>` liệt kê toàn bộ epic, không ô tìm kiếm, không filter | ❌ Không có nút follow/star nào — chỉ click chọn epic để xem chi tiết |

**Tóm lại**: "Search epic" và "Follow epic" là tính năng UI **thật, đã triển khai đầy đủ**, nhưng **chỉ tồn tại ở lớp V2 (webview cũ)**. Đây là 2 tính năng UI-only (React state + `postMessage` để persist), **không có API tương ứng ở tầng CLI hay Core** — nghĩa là không gõ được `aidlc epic search ...` hay `aidlc epic follow ...`, và cũng không có command nào trong `CommandBus` (37 command ở §2.1) hỗ trợ 2 việc này. Khi hệ thống hoàn tất chuyển sang V3 (unified), 2 tính năng này **sẽ biến mất** trừ khi được port sang — hiện `v3/epics/EpicsView.tsx` chưa có.

---

## 5. Tổng hợp CRUD Agent / Skill / Pipeline / Workflow — ai làm ở đâu

| Thao tác | CLI | Core API | Extension UI | Ghi chú |
|---|---|---|---|---|
| **Agent — Add** | `aidlc agent add` | — (core chỉ discover, không ghi) | `aidlc.addAgent` (wizard) | Cả 2 UI đều ghi trực tiếp vào `workspace.yaml`/`.aidlc/agents` |
| **Agent — List/Show** | `aidlc agent list/show` | `AssetDiscovery.discoverAssets()` (đọc 3 scope) | Sidebar StatsGrid, Builder tab Agents | |
| **Agent — Remove** | `aidlc agent remove` | — | Builder → Delete | |
| **Agent — Update** | ❌ không có | ❌ không có | Builder → Edit (chỉ ở Extension) | CLI phải remove+add lại |
| **Skill — Add** | `aidlc skill add --template/--path` | — | `aidlc.addSkill` (wizard: template/paste/upload/blank) | |
| **Skill — List/Show** | `aidlc skill list/show`, `aidlc skill list --templates` | `AssetDiscovery`, `SkillLoader.load()` | Builder tab Skills | |
| **Skill — Remove** | `aidlc skill remove` (chỉ xóa entry, giữ file `.md`) | — | Builder → Delete | |
| **Skill — Update** | ❌ không có | ❌ không có | Builder → Edit | |
| **Pipeline — Add** | `aidlc pipeline add`, `pipeline generate` (từ recipe) | — | `aidlc.addPipeline`, `aidlc.generateFromRecipe` | |
| **Pipeline — Classify từ brief** | `aidlc pipeline classify --llm` | — | (qua Analyze tab gián tiếp) | Heuristic hoặc gọi Claude phân loại |
| **Pipeline — List/Show/Remove** | `pipeline list/show/remove` | — | Builder tab Workflows (preview DAG) | |
| **Workflow (unified) — Compile** | `aidlc workflow compile` (qua v3 dispatch nếu có) hoặc tự động trong `epic run`/`epic-v3 run` | `workflow.compile` command, `WorkflowCompiler.compileWorkflow()` | V3 Studio (chọn pack) | Chỉ tồn tại ở tầng unified, không có khái niệm "workflow" riêng ở tầng legacy (dùng "pipeline") |
| **Preset — Apply/Save (áp cả bộ agent+skill+pipeline)** | `aidlc preset apply/save/list` | — | `aidlc.applyPreset`/`.savePreset`/`.deletePreset` | Merge additive-only, không overwrite |

---

## 6. Những gì đã xác nhận KHÔNG tồn tại (để tránh giả định sai)

- Không có lệnh CLI `epic search`, `agent update`, `skill update`, `pipeline update`.
- Không có `EventEmitter`/`fs.watch`/`chokidar`/`subscribe` nào trong `packages/core/src` — mọi cơ chế real-time nằm ở **CLI** (`chokidar` trong `watch.ts`/`tail.ts`/`dashboard.ts`) hoặc **Extension** (`FileSystemWatcher` của VS Code API).
- Không có command nào trong `CommandBus` (37 command) tên `epic.search`, `epic.follow`, `epic.list.filter`.
- `EpicService.list()` không hỗ trợ filter theo status/tag — phải tự filter phía client sau khi lấy toàn bộ danh sách.
- Lớp V3 (`v3/epics/EpicsView.tsx`) chưa có search box, filter dropdown, hay follow/star — kém tính năng hơn V2 ở khía cạnh này.
- Nhóm command Command Palette VS Code **không có** `monitor.*`, `annotation.*`, hay `ast.*` (chỉ có `astGraph.*`) — phần lớn 37 command của `CommandBus` chỉ truy cập được qua `aidlc.v3.command` nội bộ (webview), không lộ ra Command Palette.
