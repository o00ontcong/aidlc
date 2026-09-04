# Discover Context Unification — Kế hoạch triển khai

Ngày chốt: 2026-09-04  
Trạng thái: bước 1–2 hoàn tất; bước 3–5 đã triển khai phần chính; bước 6 đã có
migration baseline và kiểm thử trọng tâm (xem "Ghi chú tiến độ 2026-09-04
(phiên 3)" ngay dưới).
Wireframe tham khảo: `/Users/cong/.codex/visualizations/2026/09/04/01a06b48-2e4e-76a2-a13e-f9e1fd6a1f0a/discover-detail-history-dialog-wireframe.html`

## Ghi chú tiến độ 2026-09-04 (phiên 2) — đọc trước khi làm tiếp

Phiên trước (phiên 1) dừng giữa chừng bước 3 với một lỗi cú pháp làm gãy
build (`DiscoverContextPublisher.ts` thiếu dấu `]`). Phiên 2 (phiên này) đã:

1. Sửa lỗi cú pháp, build lại core + extension sạch.
2. Phát hiện agent phiên 1 đã **xoá hẳn** pipeline nội bộ `cofofo-foundation`
   (6 bước scan-stack→…→publish-context, cơ chế chọn/cài ECC catalog có
   Canvas review) khỏi `generatedCofofoWorkspace()`, làm gãy toàn bộ
   `FoundationService`/`CofofoDoctor`/`WorkflowGenerator` cũ và ~10 test.
   Đây là một fork kiến trúc thật (không chỉ lỗi cú pháp) nên đã hỏi lại
   người dùng cách xử lý ECC catalog dưới flow "Publish Context" mới.
   **Người dùng đã chọn: để `DiscoverContextPublisher.publish()` tự động cài
   ECC bundle, bỏ hẳn bước chọn/review thủ công, xoá luôn cơ chế
   install/activate/render-rules cũ và test liên quan.**
3. Đã triển khai theo đúng lựa chọn đó:
   - `FoundationService.ts` chỉ còn `ensureWorkflowRegistered()` (đăng ký 2
     pipeline feature/bugfix) + `inspect()`/`requireReady()` **read-only**
     cho các project cũ còn snapshot Foundation legacy (backward-compat, không
     ghi file mới). Đã xoá `prepare/install/previewInstall/renderRules/
     publish/activate` — đây là các hàm từng ghi `docs/project/foundation/
     {STACK-PROFILE,PROJECT-RULES,RULE-DRIFT,ARCHITECTURE-MAP,
     ECC-CATALOG-SELECTION,PROVIDER-CONTEXT}.{json,md}`, đúng thứ mục 4.4 của
     kế hoạch này cấm tiếp tục sinh mới.
   - `WorkflowGenerator.ts` chỉ còn 6 delivery phase (`analyze, diagnose,
     create-plan, reproduce, implement, test`), không còn Foundation phase/
     `ROUTE_PHASES`/`foundationPipelineForRoute`.
   - `DiscoverContextPublisher.publish()` (`packages/core/src/discover/
     DiscoverContextPublisher.ts`) giờ tự động: `detectStack` → `selectCatalog`
     → `installCatalog` (force, không cần Canvas review) → `buildBundleBinding`
     → `composeWorkspaceFromBundle` → ghi lại `.aidlc/workspace.yaml` và
     provider command files. Best-effort: nếu không detect được 1 stack duy
     nhất hoặc install lỗi, bỏ qua lặng lẽ, không chặn Publish
     Requirements/Features.
   - Artifact ECC dời từ `docs/project/foundation/*` sang
     `.aidlc/discover/runtime/{ecc-assets.json,bundle-binding.json}` (đúng
     mục 4.3). `Installer.ts` (`MANIFEST_PATH`) và `BundleBinding.ts`
     (`COFOFO_BUNDLE_BINDING_PATH`) đã đổi sang path mới.
     `CofofoDoctor.ts::diagnoseCofofoBinding` đọc path mới trước, fallback
     path cũ cho project legacy.
   - Xoá 4 command VS Code công khai (`aidlc.prepareCofofoFoundation`,
     `installCofofoFoundation`, `publishCofofoContext`,
     `activateCofofoFoundation`) khỏi `package.json` + `workspaceCommands.ts`
     + `cofofoCommands.ts` (đúng mục 4.1 "loại khỏi command palette công
     khai"). Giữ lại `showCofofoStatus` (đổi tên "Legacy... (compat)"),
     `rebaseCofofoRun` (đã sửa để nhận cả gate `discover_context` mới lẫn
     `foundation` cũ), `captureCofofoEvidence` (fallback `detectStack` khi
     không còn `STACK-PROFILE.json`), `reportCofofoBug`, `cofofoDoctor`.
   - Bug thật phát hiện thêm khi viết test: regex trong `parseDetailFields`
     (`DiscoverContextPublisher.ts`) không strip đúng `**` đóng SAU dấu `:`
     (dạng `**Label:**` — đúng format ví dụ trong doc-comment của chính hàm
     đó) — đã sửa.
   - Test mới: `packages/core/test/discover-context-publisher.test.ts` (8 test,
     pass) phủ publish/idempotent/history/reason-required/context-pack
     token-budget/ECC auto-install/tampered-skill-detection — đây là phần khởi
     đầu cho yêu cầu test bắt buộc ở mục 8.2.
   - Đã cập nhật/xoá test cũ: `cofofo.test.ts`, `cofofo-rogue-pipelines.test.ts`
     (mong đợi 2 pipeline thay vì 3).
4. **Trạng thái build/test khi dừng phiên này:**
   - `packages/core`: `tsc --noEmit` sạch. `vitest run`: 1043/1044 pass — 1
     fail còn lại (`git-run-state-store.test.ts` — timeout git clone) là
     **flaky pre-existing**, đã xác nhận lỗi giống hệt ngay từ lần chạy full
     suite đầu tiên của phiên này (trước khi đụng vào bất kỳ file nào) → không
     liên quan tới thay đổi trong phiên.
   - `packages/extension`: `tsc --noEmit` (cả `tsconfig.json` lẫn
     `tsconfig.webview.json`) sạch — có 4 lỗi TS pre-existing trong
     `DiscoverScopeModal.tsx` (đã xác nhận bằng `git stash` về HEAD, lỗi vẫn
     còn y nguyên) — **không phải do phiên này**, không đụng vào.
   - `vitest run` cho extension: **1 test đang fail, đã biết nguyên nhân,
     CHƯA sửa xong khi bị ngắt**:
     `packages/extension/test/default-workflow.test.ts` — test
     `"orders startable CoFoFo pipelines before optional workflows"` (dòng
     ~21) còn assert thứ tự cũ (`cofofo-foundation` xếp trước `custom`), trong
     khi `defaultWorkflow.ts::DEFAULT_PIPELINE_ORDER` (đã có sẵn, không đổi
     trong phiên này) chỉ xếp hạng `cofofo-feature`/`cofofo-bugfix`; do
     `Array.prototype.sort` ổn định, `cofofo-foundation` giờ rơi vào cùng
     nhóm "không xếp hạng" với `custom` và giữ nguyên thứ tự input (custom
     đứng trước). **Việc cần làm ngay khi tiếp tục:** sửa assertion kỳ vọng
     thành `['cofofo-feature', 'cofofo-bugfix', 'custom', 'cofofo-foundation']`
     (input test đưa `custom` trước `cofofo-foundation`). Không đụng gì vào
     `defaultWorkflow.ts`.

### Ghi chú tiến độ 2026-09-04 (phiên 3)

Đã tiếp tục triển khai và xác minh phần còn dang dở của bước 3–6:

1. Sửa assertion extension về thứ tự pipeline legacy; `custom` giữ vị trí trước
   `cofofo-foundation` vì Foundation không còn priority/startable.
2. `DiscoverContextPublisher` nay ghi code evidence thật vào
   `.aidlc/discover/code-index.json`: dependency manifest, entry point,
   source/test path theo FR/Feature, status evidence và reconciliation với
   `ARCHITECTURE.md`, `MODULES.md`, `PROJECT_STRUCTURE.md`, `TECH_STACK.md`.
   Context pack lấy source/test/entry path của slice thay vì `sourcePaths: []`.
   `sourceTreeHash` cũng phân biệt từng git diff thay vì chỉ có cờ dirty.
3. Discover header đã có trạng thái/revision context và nút **Publish context**.
   Host hỏi change reason, gọi publisher, rồi refresh UI. Không còn cần hoặc
   cho phép chạy Foundation để chuẩn bị context mới.
4. Đã thêm dialog dùng chung `DiscoverItemDetailDialog` cho Requirement,
   NFR và Feature: hai tab Chi tiết/Lịch sử; semantic field diff từ immutable
   object snapshots; ARIA dialog/tab, Escape/backdrop/X/nút Đóng, focus trap
   và trả focus về nút mở. `DiscoverItemDetailUi`/webview type nay mang đầy
   đủ before/after hash, provenance và context token preview.
5. Có API/CLI migration explicit:
   `aidlc discover migration-preview` (read-only) và
   `aidlc discover migrate --confirm`. Migration chỉ inventory
   `docs/project/foundation` + Epic `INTENT`/`REQUIREMENT`, không suy diễn
   thành canonical prose; nếu cần nó tạo Discover skeleton và một baseline
   revision với `actor.kind=migration`, idempotent.
6. Đã xoá các CLI surface Foundation write cũ (`prepare`, `render-rules`,
   `install`, `publish`, `activate`); thông báo New Task/workflow chỉ còn
   Feature/Bugfix và hướng người dùng về Publish Context.
7. Core suite hiện xanh 1046 test; CLI compile/bundle xanh. Extension webview
   typecheck vẫn dừng ở bốn lỗi `DiscoverScopeModal.tsx` đã có từ trước phiên
   này (không nằm trong thay đổi 3–6).

### Việc còn lại (thứ tự đề xuất)

1. Epic/New Task UI cho Stale/Compare/Rebase (mục 7.3) — backend
   (`rebaseRunToCurrentDiscoverContext`, `discoverContextIssues`) đã có trong
   `PipelineRunner.ts`/`core/src/index.ts`, nhưng UI hiển thị Stale +
   nút Rebase cho task chưa làm.
2. Mở rộng verification matrix mục 8.3 với fixture greenfield, brownfield có
   conflict và nhiều revision; migration hiện chỉ inventory an toàn, không
   tự chuyển prose legacy mơ hồ thành Discover canonical.
3. Khi cửa sổ compatibility kết thúc, rà lại các surface legacy Foundation còn
   giữ cho workspace/snapshot cũ để có thể loại bỏ theo một migration được
   người dùng xác nhận.

### Cách xác minh nhanh khi mở lại

```bash
pnpm --filter @aidlc/core build
npx tsc --noEmit -p packages/core/tsconfig.json
pnpm --filter @aidlc/core test -- --run
cd packages/extension && npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.webview.json && cd -
pnpm --filter aidlc-o00ontcong test -- --run
```

Tài liệu này là handoff đầy đủ cho agent triển khai. Không suy diễn lại kiến
trúc cũ và không thực hiện lại bước 1–2. Worktree có thể đang chứa thay đổi chưa
commit của bước 1–2; phải đọc `git status`, giữ nguyên thay đổi không liên quan
và tuyệt đối không reset worktree.

---

## 1. Mục tiêu đã chốt

1. Tab **Discover** là giao diện foundation/context công khai duy nhất và là
   nguồn tài liệu được chỉnh sửa duy nhất.
2. `cofofo-foundation` không còn là pipeline người dùng có thể chạy. Logic kiểm
   tra an toàn của nó được giữ lại và chuyển thành bộ máy **Publish Context** nội
   bộ của Discover.
3. Chỉ còn hai pipeline task công khai: `cofofo-feature` và
   `cofofo-bugfix`.
4. Requirements và Features phải đủ chi tiết để human đọc hiểu, agent lập kế
   hoạch/triển khai mà không phải đoán, đồng thời không sao chép nội dung của
   nhau.
5. Mỗi lần Publish tạo một revision bất biến và semantic history có lý do,
   provenance và diff theo entity.
6. Feature/Bugfix chỉ nhận context slice vừa đủ, content-addressed, mặc định
   không vượt khoảng 3.000 token.
7. Task luôn pin một Discover revision. Revision mới chỉ làm task thành
   `Stale`; không tự động rebase.

### Không làm

- Không tạo một bộ tài liệu Foundation prose song song với Discover.
- Không biến derived JSON/cache thành nguồn chỉnh sửa thứ hai.
- Không nhúng toàn bộ Discover docs, history hoặc source code vào prompt đầu.
- Không redesign tab Discover hiện tại.
- Không thêm detail pane thường trực cho Requirements/Features.
- Không tự động ghi đè conflict hoặc tự động migrate nội dung không chắc chắn.
- Không tự động rebase task đang chạy.

---

## 2. Trạng thái công việc

| Bước | Trạng thái | Kết quả |
|---|---|---|
| 1. CoFoFo mặc định | Hoàn tất | `cofofo-workflow` và `cofofo-feature` là mặc định; workflow được ensure tự động; UI install thủ công đã bị loại bỏ |
| 2. Audit Discover/Foundation/Epic | Hoàn tất | Đã xác định duplicate về stack, architecture, rules, context và các entry path thiếu provenance |
| 3. Discover Publisher + canonical model | Đã triển khai, còn rà soát | Publish Context nội bộ, code evidence/reconciliation và không còn Foundation writer công khai |
| 4. Context pack + history + Feature/Bugfix contract | Đã triển khai phần chính | Context bất biến, history semantic và slice có source/test evidence |
| 5. UI/schema/docs đồng bộ | Đã triển khai phần chính | Nút Publish + dialog Chi tiết/Lịch sử; còn stale/compare/rebase task UI |
| 6. Migration/test/cleanup | Đã triển khai một phần | Migration baseline/inventory idempotent, core/CLI test xanh; verification matrix còn thiếu |

---

## 3. Invariant kiến trúc

### 3.1 Một khái niệm chỉ có một editable source

| Khái niệm | Editable source canonical | Derived, không chỉnh tay |
|---|---|---|
| Product intent | `docs/project/product/IDEA.md`, `PRODUCT.md` | Discover index |
| Requirements | `docs/project/product/REQUIREMENTS.md` | normalized entity objects, link graph, context pack |
| Features | `docs/project/product/FEATURES.md` | normalized entity objects, code evidence, context pack |
| Use cases / flows | `USE_CASES.md`, `USER_FLOWS.md` | graph/index |
| Architecture | `docs/project/architecture/*` | code evidence/reconciliation result |
| Project rules | `docs/project/development/PROJECT_RULES.md` | `compiled-rules.json` |
| Delivery plan | `docs/project/plans/*` | phase/task slices |

Mọi derived file phải có header/schema field nói rõ `generated`,
`doNotEdit`, `discoverRevision`, `sourceCommit`, `sourceTreeHash` và hash của
input. Nếu derived file bị sửa tay, lần Publish kế tiếp được quyền tái tạo nó.

### 3.2 Ranh giới nội dung

- **Requirement** mô tả nghĩa vụ hoặc kết quả quan sát được phải đúng.
- **Feature** mô tả capability/solution đáp ứng một hay nhiều Requirement ID.
- **Use Case/User Flow** mô tả sequence tương tác; Feature chỉ tham chiếu ID.
- **Architecture/Module/ADR** mô tả technical design; Feature chỉ tham chiếu ID.
- **Rule** mô tả constraint thực thi; entity khác chỉ tham chiếu `RULE-ID`.
- **Code evidence** chỉ ánh xạ entity ID sang path/test/entry point; không viết
  lại product prose.

---

## 4. Bước 3 — Thay `cofofo-foundation` bằng Discover Publisher

### 4.1 Public surface

- Loại `cofofo-foundation` khỏi New Task, picker, startable pipeline list,
  command palette công khai và user documentation.
- Không xóa ngay các kiểm tra trong `FoundationService`/`CofofoDoctor`. Refactor
  chúng thành `DiscoverContextPublisher` hoặc một service tương đương do
  Discover gọi nội bộ.
- Nút **Publish context** trong Discover là entry point công khai duy nhất để
  validate/index/compile context.
- `cofofo-feature` và `cofofo-bugfix` phải yêu cầu một published Discover
  revision hợp lệ thay vì Foundation READY riêng.

### 4.2 Luồng Publish bắt buộc

1. Đọc và khóa snapshot của toàn bộ canonical Discover docs.
2. Parse Requirements, Features và mọi stable-ID relationship.
3. Validate completeness, ID uniqueness, broken links, orphan và conflict.
4. Detect stack từ manifest/source thật; reconcile với `TECH_STACK.md`.
5. Scan module, dependency, entry point, public API và test seam.
6. Reconcile code evidence với `ARCHITECTURE.md`, `MODULES.md`,
   `PROJECT_STRUCTURE.md` và ADR.
7. Compile `PROJECT_RULES.md` thành rule index máy đọc được.
8. Chọn/ensure ECC assets và provider runtime bindings.
9. Chuẩn hóa entity objects, tính hash, semantic diff với parent revision.
10. Yêu cầu `changeReason` khi canonical content khác parent revision.
11. Ghi revision manifest, history events, code index và context manifest bằng
    transaction/atomic rename.
12. Chỉ cập nhật latest pointer và trạng thái `READY` khi không còn blocker.

Publish phải idempotent: cùng normalized input tạo cùng revision/context hash và
không sinh history event giả. Greenfield được Publish với status
`planned/skeleton`; không được đòi source manifest đã tồn tại. Brownfield phải
ghi evidence từ code thật.

### 4.3 Derived storage đã chốt

```text
.aidlc/discover/
  index.json
  published-context.json
  code-index.json
  compiled-rules.json
  context-packs/
    <packHash>.json
  history/
    index.json
    revisions/
      <discoverRevision>.json
  objects/
    <sha256>.json
  runtime/
    ecc-assets.json
    bundle-binding.json
```

- `published-context.json` là mutable pointer tới revision READY mới nhất.
- `history/revisions/*`, `objects/*` và `context-packs/*` là immutable.
- `discoverRevision` dùng `DREV-<12 ký tự đầu của SHA-256 canonical manifest>`.
- Publish không thay đổi nội dung trả về cùng revision; không tăng counter giả.
- `code-index.json` chỉ chứa stable ID, status, source paths, test paths, entry
  points và evidence hash.
- Status evidence chuẩn: `planned`, `implemented`, `stale`, `orphaned`,
  `conflict`.

### 4.4 Prose Foundation phải ngừng sinh mới

Không tạo mới các tài liệu song song như:

- `STACK-PROFILE.md`
- `ARCHITECTURE-MAP.md`
- một bản `PROJECT-RULES.md` thứ hai
- `RULE-DRIFT.md`
- `ECC-CATALOG-SELECTION.md`
- `PROVIDER-CONTEXT.md` dài

Compatibility reader có thể đọc output cũ trong thời gian migration, nhưng
không được dùng nó làm nguồn canonical hoặc tiếp tục ghi định dạng cũ.

---

## 5. Canonical schema cho Requirements và Features

### 5.1 Requirement entity

Stable ID:

- Functional: `FR-###`
- Non-functional: `NFR-###`

Trường bắt buộc khi entity muốn ở trạng thái `Ready`:

```ts
interface DiscoverRequirement {
  id: `FR-${string}` | `NFR-${string}`;
  title: string;
  type: "functional" | "non-functional";
  status: "draft" | "review" | "ready" | "deprecated";
  priority: "critical" | "high" | "medium" | "low";
  statement: string;              // nghĩa vụ/kết quả kiểm chứng được
  rationale: string;              // vì sao cần, user/business value
  actors: string[];
  preconditions: string[];
  trigger?: string;
  expectedOutcome: string;
  acceptanceCriteria: AcceptanceCriterion[];
  constraints: string[];          // ưu tiên RULE-ID/NFR-ID
  dependencies: string[];         // stable IDs
  relatedFeatureIds: string[];
  relatedUseCaseIds: string[];
  verificationMethod: string;
  assumptions: string[];
  openQuestions: string[];
  owner: string;
  provenance: SourceReference[];
  createdRevision: string;
  lastChangedRevision: string;
}
```

Acceptance criterion phải đo được hoặc theo Given/When/Then. `Ready` bị chặn
nếu criterion chỉ dùng từ mơ hồ như “nhanh”, “ổn”, “thân thiện” mà không có
ngưỡng/cách xác minh.

### 5.2 Feature entity

Stable ID: `F-###`.

```ts
interface DiscoverFeature {
  id: `F-${string}`;
  title: string;
  status: "draft" | "review" | "ready" | "deprecated";
  phaseId: string;
  priority: "critical" | "high" | "medium" | "low";
  problem: string;
  desiredOutcome: string;
  personas: string[];
  requirementIds: string[];       // không copy requirement prose
  useCaseIds: string[];
  userFlowIds: string[];
  inScope: string[];
  outOfScope: string[];
  behaviorRules: string[];
  mainFlowSummary: string;
  alternateCases: string[];
  edgeAndFailureCases: string[];
  dataImpact: string[];
  interfaceAndIntegrationImpact: string[];
  securityPrivacyAccessibilityObservability: string[];
  definitionOfDone: string[];
  dependencies: string[];
  rolloutAndMigration: string[];
  moduleIds: string[];
  adrIds: string[];
  codeEvidenceStatus: "planned" | "implemented" | "stale" | "orphaned" | "conflict";
  owner: string;
  provenance: SourceReference[];
  createdRevision: string;
  lastChangedRevision: string;
}
```

Feature `Ready` phải có ít nhất một Requirement ID hợp lệ. Trường hợp khám phá
một capability chưa có requirement phải giữ `Draft` và báo validation; không
tự tạo requirement prose bằng model.

### 5.3 Validation

Publisher phải phát hiện tối thiểu:

- ID trùng hoặc đổi ID không có migration record.
- Stable-ID link không tồn tại.
- Requirement không có Feature đáp ứng.
- Feature không có Requirement.
- Acceptance criterion không kiểm chứng được.
- Entity `Ready` còn open question blocking.
- Requirement và Feature mâu thuẫn trực tiếp.
- Architecture/code evidence bị stale, orphaned hoặc conflict.
- Rule reference không tồn tại hoặc bị deprecated.

`Draft` có thể tồn tại với warning. Published revision có thể chứa Draft nhưng
chỉ phase/task slice không phụ thuộc Draft mới được READY để handoff. Conflict
blocking phải làm Publish thất bại và giữ nguyên latest READY pointer.

---

## 6. Bước 4 — Revision history và context contract

### 6.1 Published history

Mỗi lần Publish có thay đổi tạo một immutable revision manifest. Mỗi entity đổi
tạo semantic event:

```ts
interface DiscoverHistoryEvent {
  discoverRevision: string;
  parentRevision: string | null;
  publishedAt: string;
  actor: { kind: "human" | "agent" | "migration" | "system"; id: string };
  source: { taskId?: string; jiraKey?: string; runId?: string; command?: string };
  entityType: "requirement" | "feature" | "use-case" | "flow" | "architecture" | "rule" | "plan";
  entityId: string;
  changeType: "created" | "updated" | "deprecated" | "restored" | "relinked";
  changedFields: string[];
  beforeHash: string | null;
  afterHash: string;
  summary: string;
  reason: string;                 // bắt buộc, human-readable
  breaking: boolean;
}
```

- Audit đã Publish không được sửa hoặc xóa.
- Restore tạo canonical draft từ object cũ, sau đó Publish thành revision mới
  có `changeType=restored`.
- Git commit là provenance bổ sung, không thay history vì Publish có thể xảy ra
  khi worktree chưa commit.
- Draft autosave/save được hiển thị thành một dòng `Draft changes` riêng và có
  thể khôi phục sau crash, nhưng chưa phải immutable published history. Khi
  Publish, draft changes được squash thành semantic events của revision mới.
- Full history không được tự động đưa vào agent prompt.

### 6.2 Context reference trên task

```ts
interface TaskContextRef {
  discoverRevision: string;
  contextHash: string;            // toàn published context
  phaseId?: string;
  bugScopeId?: string;
  packHash: string;               // slice riêng của task
  sourceCommit: string | null;
  sourceTreeHash: string;
  dirty: boolean;
}
```

Task lưu reference, không copy full Discover docs vào Epic. `INTENT.md` và
`REQUIREMENT.md` không còn là editable source. Compatibility reader chỉ dùng
cho dữ liệu cũ.

### 6.3 Context slicing và token budget

Đồ thị slice:

```text
phase/task
  → feature
  → FR/NFR
  → use case / user flow
  → module / data flow / ADR
  → applicable RULE-ID
  → source / test / entry-point evidence
```

Budget mặc định:

- Base context: 500–800 token.
- Task slice: 1.500–2.000 token.
- Tổng mục tiêu: không quá khoảng 3.000 token.
- Khi vượt budget: bỏ/rút gọn prose phụ trước; luôn giữ stable IDs, current
  values, acceptance criteria liên quan, hash và file references.
- Agent drill-down theo nhu cầu qua resolver tương đương
  `aidlc context get <ID>` và `aidlc context history <ID>`.
- Với task đã pin revision cũ, chỉ đưa relevant semantic delta khi human đang
  xem xét Rebase; không đưa toàn timeline vào execution prompt.

### 6.4 Feature/Bugfix behavior

`cofofo-feature`:

```text
analyze → create-plan → implement → test
```

- Analyze tạo `EVIDENCE`, `OPTIONS`, `TASK-DECISIONS`.
- Không tạo `REQUIREMENT.md` trùng canonical Requirements.
- Task plan tham chiếu stable IDs và acceptance criteria.
- Scope/requirement/architecture delta phải quay lại Discover, có change reason,
  Publish revision mới rồi Rebase rõ ràng.

`cofofo-bugfix`:

- Giữ `BUG-REPORT` vì đây là quan sát riêng của incident, không phải product
  requirement copy.
- Link bug vào Feature/Module/Rule IDs và context slice hiện hành.
- Root cause làm thay đổi product/architecture phải tạo Discover delta.

Mọi entry path phải dùng cùng task-context resolver:

- Discover handoff
- New Task
- Jira
- file/manual command

Feature mới từ Jira/file/manual phải được import/confirm vào canonical Discover
phase và Publish trước khi chạy. Bug có thể tạo trực tiếp nhưng phải map được
Feature/Module ID hoặc bị đánh dấu `orphaned` cần xử lý.

---

## 7. Bước 5 — UI, dialog Chi tiết/Lịch sử và schema đồng bộ

### 7.1 Ràng buộc design

- Giữ nguyên layout, navigation, typography, màu, component library,
  list/card/table và edit flow hiện có của Discover.
- Không copy CSS của wireframe vào production.
- Không thêm detail pane thường trực hoặc route/page mới.
- Chỉ thêm nút **Chi tiết** theo action pattern hiện có trên từng Requirement và
  Feature.
- Dùng một dialog component chung cho cả Requirement và Feature.

### 7.2 Dialog

Khi bấm **Chi tiết**:

- Mở đúng entity đã chọn.
- Header có stable ID, title, status và nút đóng.
- Default ở tab **Chi tiết**.
- Có đúng hai tab: **Chi tiết** và **Lịch sử**.
- Dialog là read-only view. Action **Chỉnh sửa**, nếu hiển thị, phải chuyển về
  edit flow hiện có; không tạo editor/canonical source thứ hai trong dialog.

Tab **Chi tiết — Requirement** hiển thị:

- status, type, priority, owner, current revision;
- statement;
- rationale/user value;
- actors/scope, constraints;
- acceptance criteria;
- verification method;
- assumptions/open questions;
- Feature/Use-case/Phase stable-ID links;
- preview gọn về context agent sẽ nhận và token estimate.

Tab **Chi tiết — Feature** hiển thị:

- status, phase, priority, owner, current revision;
- problem và desired outcome;
- personas, in/out scope;
- behavior/main flow;
- alternate/edge/failure cases;
- data/API/integration/security impact khi áp dụng;
- Definition of Done và rollout notes;
- Requirement/Use-case/Module/ADR stable-ID links;
- preview gọn về context agent sẽ nhận và token estimate.

Link chỉ hiển thị ID/chip; không sao chép prose. Khi click, dùng navigation hiện
có hoặc thay entity bên trong cùng dialog. Không mở modal lồng.

Tab **Lịch sử**:

- Timeline theo entity, mới nhất trước.
- Mỗi event hiển thị revision, timestamp, actor/source, change type, reason và
  breaking badge khi có.
- Chọn event hiển thị semantic field diff before/after, before/after hash và
  source task/Jira/run.
- History read-only.
- Nếu expose Restore, Restore phải tạo draft/revision mới, không sửa audit.
- Draft changes phải có label khác published revision.
- Empty/migrated/loading/error/conflict states phải rõ ràng.

Interaction/accessibility:

- Đóng bằng X, nút Đóng, Escape và backdrop theo convention component hiện có.
- Trap focus trong dialog và trả focus về đúng nút Chi tiết đã mở.
- Có ARIA dialog/tab semantics và keyboard tab order.
- Responsive trong chiều rộng sidebar nhỏ, không clipping hoặc nested scroll
  không cần thiết.

### 7.3 Discover/Epic status

Discover hiển thị `Draft`, `Publishing`, `Ready`, `Stale`, `Conflict`, revision,
source commit/tree hash, context hash, publish time và conflict. Handoff chỉ bật
khi slice liên quan READY.

Epic/New Task chỉ hiển thị Feature/Bugfix, pinned revision/hash, slice, Stale và
Rebase. Trước Rebase, human xem relevant Requirement/Feature delta.

Đổi field/event còn tên `recipe` thành pipeline/context contract bằng migration
tương thích có thời hạn. UI mới không dùng từ Foundation/recipe/INTENT.

---

## 8. Bước 6 — Migration, test và cleanup

### 8.1 Migration

- Đọc `docs/project/foundation`, Epic `INTENT`/`REQUIREMENT` và
  Requirement/Feature cũ.
- Cấp stable ID deterministic khi có thể.
- Chuyển nội dung xác định được vào canonical docs.
- Chuyển evidence/runtime sang `.aidlc/discover`.
- Tạo baseline revision với `actor.kind=migration`.
- Không bịa required fields hoặc change reason. Trường thiếu thành
  warning/blocker theo status.
- Conflict không tự ghi đè; Publish dừng và giữ latest READY.
- Giữ backup/compatibility reader ít nhất một version window.
- Migration phải idempotent và chạy lại không sinh duplicate revision/event.

### 8.2 Test bắt buộc

Core/unit:

- Requirement/Feature parse, schema và completeness.
- Stable IDs, link graph, orphan/conflict detection.
- Semantic diff và required change reason.
- Append-only revision history.
- Content hashing/object dedup/idempotent Publish.
- Restore-as-new-revision.
- Token budget và relevant-history selection.
- Greenfield planned/skeleton và brownfield evidence.

UI/component:

- Mỗi Requirement/Feature có nút Chi tiết.
- Click mở đúng entity và default tab Chi tiết.
- Đổi sang Lịch sử không mất entity selection.
- Chọn history event cập nhật semantic diff.
- Linked ID không mở modal lồng.
- X/Đóng/Escape/backdrop hoạt động đúng convention.
- Focus trap và return focus đúng trigger.
- ARIA role/tab state đúng.
- Draft/Ready/Conflict/loading/empty/error/migrated states.
- Responsive không clipping.
- Dialog read-only không tạo editable source thứ hai.
- Edit action quay về flow hiện có.

Integration/regression:

- Publish → context pack → Feature/Bugfix task.
- Pin → Publish revision mới → Stale → Compare → Rebase.
- Discover/Jira/manual/file entry path cho cùng resolver result.
- Không còn startable Foundation.
- Không sinh Foundation prose trùng.
- Cùng normalized input tạo cùng revision/pack hash.
- Sửa Requirement/Feature tạo đúng semantic event.
- Unrelated history không vào task prompt.
- Existing Discover screen không thay đổi ngoài action/status đã chốt.

### 8.3 Verification matrix

Chạy tối thiểu:

- core tests;
- extension tests;
- webview component tests;
- compile/typecheck;
- production bundle;
- `git diff --check`;
- migration fixture greenfield;
- migration fixture brownfield;
- project cũ có Foundation READY;
- project có conflict;
- project có nhiều Discover revisions.

Không coi task hoàn tất nếu chỉ test happy path.

---

## 9. Điểm vào code cần kiểm tra trước khi sửa

Agent phải dùng AST graph cho câu hỏi structural nếu graph hiện hành, sau đó đọc
body code liên quan. Danh sách khởi đầu:

- `packages/core/src/discover/DocSpec.ts`
- `packages/core/src/discover/DiscoverService.ts`
- `packages/core/src/discover/handoff.ts`
- `packages/core/src/cofofo/FoundationService.ts`
- `packages/core/src/cofofo/CofofoDoctor.ts`
- `packages/core/src/cofofo/WorkflowGenerator.ts`
- `packages/core/src/runs/EpicScaffold.ts`
- `packages/core/src/runs/PipelineRunner.ts`
- `packages/extension/src/v2/discoverHost.ts`
- `packages/extension/src/webview/components/discover/DiscoverWorkspace.tsx`
- `packages/extension/src/webview/components/discover/HandoffPanel.tsx`
- shared webview message/types và các test tương ứng.

Tên file/service mới trong tài liệu là intent, không phải bắt buộc nếu repo đã có
abstraction phù hợp hơn. Invariant, data ownership, output contract và behavior
là bắt buộc.

---

## 10. Thứ tự triển khai đề xuất

```text
A. Viết failing tests cho canonical entity/history/hash
   ↓
B. Thêm parser + stable-ID graph + publisher storage transaction
   ↓
C. Refactor Foundation checks thành Discover internal publisher
   ↓
D. Context resolver/slicer + Feature/Bugfix pin contract
   ↓
E. Migration/compatibility readers
   ↓
F. UI status + nút Chi tiết + dialog Chi tiết/Lịch sử
   ↓
G. Epic stale/compare/rebase UI
   ↓
H. Xóa public Foundation/legacy writers, cập nhật docs
   ↓
I. Chạy toàn bộ verification matrix
```

Không xóa legacy writer/reader trước khi migration tests pass. Không nối UI vào
mock data; dialog phải đọc cùng parsed/normalized entity model được Publisher sử
dụng.

---

## 11. Definition of Done

- Discover là editable source duy nhất cho product, requirement, feature,
  architecture, rules và plan context.
- `cofofo-foundation` không còn là public/startable pipeline.
- Requirement/Feature đủ chi tiết, liên kết bằng stable ID và không lặp prose.
- Mọi Publish có revision/hash/provenance/semantic history truy ngược được.
- Dialog Chi tiết/Lịch sử dùng design/component hiện tại và không tạo editor thứ
  hai.
- Feature/Bugfix từ mọi entry path nhận cùng contract và context không vượt
  budget mặc định.
- Task pin revision; stale/rebase luôn tường minh.
- Không còn Foundation prose duplicate hoặc INTENT/REQUIREMENT copy mới.
- Project cũ migrate idempotent, không mất dữ liệu, conflict không bị ghi đè.
- Toàn bộ verification matrix pass và `git diff --check` sạch.
