# CoFoFo — Danh sách lỗi cần sửa

Ngày: 2026-08-29
Branch: `feat/canvas-review-policy`

Kế hoạch triển khai đi kèm: [COFOFO_FIX_PLAN.md](./COFOFO_FIX_PLAN.md).

Các phát hiện từ việc đối chiếu SkyCast weather demo với quy trình mà một người
thật sẽ đi qua. Mọi mục P0/P1 bên dưới đều đã được **reproduce** trên bản
`@aidlc/core` đã build, chạy trên một workspace SwiftPM thật — không phải suy
luận từ việc đọc code.

Thứ tự sắp theo phạm vi ảnh hưởng, không theo công sức. Chưa mục nào được bắt đầu.

---

## P0 — các bảo đảm của branch này đang vắng mặt trong dự án thật

### F1. `assemblePipeline` làm rơi `review`, `evidence`, `produces_contains`, `skippable`

`assemblePipeline` ([PipelineAssembler.ts:113-129](../packages/core/src/runs/PipelineAssembler.ts))
dựng lại từng step từ một danh sách trường cố định. Nó copy `agent`, `name`,
`model`, `enabled`, `produces`, `requires`, `depends_on`, `auto_review`,
`human_review`, `skills`, `auto_review_runner` — và **âm thầm bỏ mọi thứ còn
lại**, bao gồm đúng hai trường mà cả branch này sinh ra để phục vụ.

Reproduce trên chính workspace demo:

```
### pipeline cofofo-feature (as declared in workspace.yaml)
  create-plan      canvas=YES evidence=—        contains=1
  test-red         canvas=—   evidence=red      contains=1
  implement-green  canvas=YES evidence=green    contains=1
  verify           canvas=YES evidence=verify   contains=1

### recipe weather-alert -> assemblePipeline()
  create-plan      canvas=—   evidence=—        contains=0
  test-red         canvas=—   evidence=—        contains=0
  implement-green  canvas=—   evidence=—        contains=0
  verify           canvas=—   evidence=—        contains=0
```

Hệ quả:

- Mọi Canvas gate tụt xuống thành nút Approve `human_review` thông thường.
  `auditCanvasApprovals` cũng không bắt được, vì nó đọc chính snapshot đó —
  và snapshot không còn khai báo `review`.
- Mọi machine-evidence gate biến mất. `markStepDone` không bao giờ chạm tới
  `requireAcceptedEvidence`, nên RED/GREEN/REFACTOR/VERIFY hoàn toàn không bắt buộc.
- `produces_contains` biến mất, nên artifact chỉ còn được kiểm tra là "có tồn tại".
- `snapshotPipeline` đóng băng pipeline đã mất gate vào run state, nên run đó
  hỏng vĩnh viễn. Chạy lại cũng không sửa được.

Đây là đường đi bình thường, không phải edge case. Các nơi gọi: `epicWizard.ts:374`,
`wizards.ts:951`, `workspaceWebview.ts:4122`, `cli/epic.ts:208`,
`cli/pipeline.ts:175` và `:234`. Trong workspace **được generate**, đó là đường
**duy nhất**: `generatedCofofoWorkspace` chỉ định nghĩa một pipeline
(`cofofo-delivery`) cộng hai recipe `cofofo-feature` / `cofofo-bugfix`, và
`FoundationService.inspect()` bảo người dùng "Start a cofofo-feature or
cofofo-bugfix recipe."

Câu hỏi cần bàn:

- Đổi từ danh sách trắng sang passthrough, hay clone tường minh
  `PipelineStepConfig` sao cho build gãy khi có trường mới chưa được xử lý?
- Có thêm regression test khẳng định **mọi** trường của normalized step sống sót
  qua một vòng round-trip recipe, để lần sau thêm trường mới không im lặng rơi mất?
- `startRun` có nên từ chối một delivery pipeline mà bản gốc khai `evidence`
  hoặc `review` còn bản assembled thì không?

---

## P1 — workflow deadlock hoặc âm thầm mất hiệu lực

### F2. Evidence ledger không thể replay

`expectedNext()` ([EvidenceLedger.ts:68](../packages/core/src/cofofo/EvidenceLedger.ts))
chỉ tiến về phía trước, và `assertStageOrder` từ chối mọi stage đã `accepted`.
Một stage chỉ capture lại được khi nó **vẫn đang fail**.

Reproduce bằng `swift test` chạy thật:

```
OK   RED / GREEN / REFACTOR / VERIFY                (accepted)
FAIL re-capture GREEN right after GREEN : out of order; next required stage is "refactor"
FAIL re-capture GREEN after VERIFY      : out of order; next required stage is "verify"
FAIL re-capture RED after a rebase      : out of order; next required stage is "verify"
```

Dòng đầu tiên là tình huống phổ biến nhất: reviewer trả `implement-green` về,
dev sửa production code, và không còn cách nào chứng minh GREEN lại.

### F3. `requireAcceptedEvidence` không bind theo revision

[EvidenceLedger.ts:244](../packages/core/src/cofofo/EvidenceLedger.ts) chỉ hỏi
"trong ledger của run này có tồn tại record accepted của stage này ở đâu đó
không". Không step revision, không rebase generation, không bind nội dung.

Cộng với F2, một lần rework **không bị kẹt** — nó **được cho qua bằng bằng chứng
của revision trước**. Dev không capture được bằng chứng mới, còn gate thì chấp
nhận bằng chứng cũ.

`rebaseRunToCurrentFoundation` ([PipelineRunner.ts:993](../packages/core/src/runs/PipelineRunner.ts))
reset mọi phase nhưng không đụng tới ledger, nên một lần rebase bắt buộc chỉ
replay phần giấy tờ, còn RED/GREEN/VERIFY được thừa kế nguyên vẹn từ Foundation
revision **trước** — đúng thứ mà rebase sinh ra để chặn.

Test hiện tại không phủ: test lifecycle rebase một run trắng, chưa có ledger.
Demo che mất: `seedEvidenceLedger` chỉ chạy cho run đã completed và epic waiver,
nên `COFOFO-WEATHER-009-STALE-REBASE` không có ledger nào, còn
`006-BUGFIX-COMPLETED` khoe một vòng rerun GREEN trong `history` trong khi ledger
chỉ có đúng một record GREEN.

Câu hỏi cần bàn:

- Bind mỗi record vào `(stepRevision, rebaseGeneration)` và giới hạn
  `expectedNext` / `requireAcceptedEvidence` trong generation hiện tại? Chain vẫn
  append-only và audit trail vẫn giữ đủ mọi lần thử.
- Hoặc thêm một record `supersede` tường minh để chain ghi lại **lý do** một
  stage được mở lại, thay vì suy diễn.
- Kiểu gì thì `rebaseRunToCurrentFoundation` cũng phải mở generation mới, và
  `rejectStep` / `rerun` phải mở lại stage bị ảnh hưởng cùng mọi stage phía sau nó.

### F4. Foundation freshness dùng mtime, nên `git clone` khoá cứng workspace

`validateContext` ([FoundationService.ts:198](../packages/core/src/cofofo/FoundationService.ts))
báo lỗi khi `mtime > generatedAt + 1s`, dù dòng ngay phía trên đã hash-verify
chính file đó rồi.

Reproduce — file y hệt từng byte, chỉ mtime mới:

```
content equal : true
after touch   : stale
   issue: docs/project/foundation/PROJECT-RULES.json: newer than context manifest
startRun            : BLOCKED
canStartStep        : BLOCKED — "run `aidlc cofofo rebase INFLIGHT`"
markStepDone        : BLOCKED
rebase (the advised fix): THROWS -> CoFoFo foundation is not ready.
```

Git không giữ mtime. Mọi lần clone, mọi lần đổi branch có chạm một trong bốn
artifact của manifest, và mọi lần CI checkout đều đẩy workspace vào trạng thái
này — và cách chữa mà chính thông báo lỗi đề nghị lại ném ra đúng lỗi đó. Lối
thoát duy nhất là `prepare --route refresh-context` → duyệt lại Canvas → publish
→ activate: cả một chu trình phê duyệt lại policy chỉ vì một lệnh `git clone`.

Demo né chứ không sửa: `seedActiveFoundation` gọi `fs.utimesSync` để lùi ngày bốn
artifact ([demoCofofoWeatherProject.ts:415](../packages/extension/src/v2/demoCofofoWeatherProject.ts)).

Câu hỏi cần bàn:

- Bỏ hẳn phép so mtime — content hash đã trả lời câu "artifact này có đổi kể từ
  lúc publish không" rồi? Phép kiểm tra mtime định bắt điều gì mà hash không bắt được?
- Nếu vẫn cần một tín hiệu về thứ tự, ghi lại **thứ tự hash quan sát được** tại
  thời điểm publish thay vì dựa vào timestamp của filesystem.
- Độc lập với trên: `canStartStep` / `markStepDone` không nên khuyên
  `aidlc cofofo rebase` cho một tình huống mà rebase không sửa được. Định tuyến
  lỗi content-drift sang `rebase`, còn lỗi foundation-invalid sang `prepare --route …`.

---

## P2 — lỗ hổng chính sách và khả năng phục hồi

### F5. RED waiver là một cửa hông CLI không ai duyệt

`aidlc cofofo waive-red --reviewer "..." --reason "..." --evidence "..."`
([cli/cofofo.ts:183](../packages/cli/src/commands/cofofo.ts)) ghi thẳng một
record `accepted` — không gate, không Canvas, không bên thứ hai — và lập tức thoả
`requireAcceptedEvidence('red')`. Waiver này được **ghi tên**, không được
**duyệt**. Checklist mô tả nó là human waiver; thực tế hôm nay ai có terminal
cũng gõ được tên chính mình.

Câu hỏi cần bàn: waiver có nên là một Canvas gate trên artifact `RED-WAIVER.md`,
để nó đi vào đúng đường review content-addressed như mọi thứ khác? Danh tính
reviewer có bắt buộc phải khác người vận hành run không?

### F6. Canvas `request_changes` không thể trả việc ngược lên trên

`applyArtifactReviewVerdict` gọi `rejectStep({ state, reason, pipeline, stepIdx })`
không truyền `targetIdx` ([PipelineRunner.ts:751](../packages/core/src/runs/PipelineRunner.ts)),
nên một Canvas gate chỉ bật lại được chính nó. Đường reject thường có hỗ trợ chọn
step đích (`pickRejectTarget`), nhưng control đó bị ẩn với Canvas step.

Reviewer ở `fresh-review` kết luận rằng **kế hoạch** mới là chỗ sai thì không có
đường trực tiếp về `create-plan`. Cách vòng là hai thao tác: request changes, rồi
"Request update" lên step phía trên — và feedback Canvas nằm trên record của
step sai.

### F7. Annotron key session theo đường dẫn file, nên hai gate đồng thời làm mù nhau

`sessions` là một `Map` key theo đường dẫn tuyệt đối. Một gate thứ hai đăng ký
cùng file sẽ ghi đè `sess.review`
([vendor/annotron/src/server.js:346](../vendor/annotron/src/server.js)), sau đó
`read()` của gate thứ nhất mismatch vĩnh viễn và "Review in Canvas" của nó chờ
hết deadline 30 phút.

Chạm được thật: hai foundation run (một `bootstrap` còn mở cộng một
`update-rules`) cùng gate `PROJECT-RULES.md` / `docs/README.md` / `CLAUDE.md`.

### F8. `CLAUDE.md` và `AGENTS.md` là Canvas artifact nhưng bị tool khác ghi vào

`publish-context` gate `docs/README.md`, `AGENTS.md` và `CLAUDE.md`. Trong repo
thật, những file này bị các tool khác ghi vào — chính extension của repo này ghi
managed block vào `CLAUDE.md`. Bất kỳ lần ghi nào trong lúc gate đang mở đều làm
approval mất hiệu lực.

Câu hỏi cần bàn: chỉ gate phần nội dung đã render của managed block, hay gate một
artifact published riêng và coi các provider file là đích cài đặt?

### F9. `install()` đòi một approval mà route đó không hề chứa

[FoundationService.ts:280](../packages/core/src/cofofo/FoundationService.ts) gọi
`assertCanvasApproved(root, runId, 'select-ecc-catalog')` vô điều kiện, trong khi
slice `update-rules` là `['define-rules', 'publish-context']`. Chạy install trên
route đó sẽ lỗi vì một step không tồn tại trong run. Nằm ngoài happy path, nhưng
gặp là bế tắc.

### F10. RED oracle được so trên log đã bị cắt

`oracleMatched` so trên chuỗi đã qua `bounded()` 2 MB. Một dòng failure bị lược
ở giữa output của suite lớn sẽ làm một RED thật bị từ chối. Cũng nên kiểm tra
xem quy tắc base64 40 ký tự trong `redact()` có ăn mất chữ trong oracle không.

---

## P3 — độ trung thực của demo

Demo là một fixture tĩnh, điều đó không sao, nhưng hiện nó đang trình bày những
trạng thái mà runtime không tạo ra được và những record mà runtime không bao giờ ghi.

- **F11.** Demo tự viết tay ba pipeline (`cofofo-foundation`, `cofofo-feature`,
  `cofofo-bugfix`) thay vì dùng `cofofo-delivery` + recipe mà dự án thật nhận
  được. Đây chính là thứ che mất F1.
- **F12.** `COFOFO-WEATHER-008-RED-WAIVER` đỗ ở `test-red` / `awaiting_review`,
  nhưng `test-red` của bugfix chỉ khai `auto_review` — không `human_review`,
  không `review:`. Runner không tạo ra trạng thái đó được, mà
  [cofofoWeatherDemo.test.ts:115](../packages/extension/test/cofofoWeatherDemo.test.ts)
  lại assert nó, khoá luôn cái sai.
- **F13.** Ledger được seed ghi `commandId: 'swift.test'` kèm
  `args: ['--filter','SkyCastTests']` — bất khả thi với cả hai command trong
  allow-list (`swift.test` là `['test']`; bản targeted là
  `['test','--filter',<target>]`). Nó nằm ngay trong artifact mà demo mời người
  xem soi như bằng chứng chống giả mạo.
- **F14.** `COFOFO-WEATHER-009` ghi một cú dừng do Foundation stale thành
  `request_changes` của "Demo Reviewer". Cú dừng đó là system gate, không phải
  review verdict.
- **F15.** Không có bằng chứng `swift build` nào được capture, dù `VERIFY.md`
  được seed khẳng định `'swift build': pass`. `swift.build` có trong allow-list
  nhưng không stage nào dùng.
- **F16.** README demo, phần `description` trong `workspace.yaml`, và mọi tiêu
  đề/mô tả epic đều tiếng Việt, trong khi `.claude/CLAUDE.md` yêu cầu prose tiếng
  Anh cho artifact và documentation.
- **F17.** `packages/extension/media/cofofo-weather-demo/src/.build` nặng 230 MB,
  đang untracked, và không có trong `.gitignore`. Đã loại khỏi VSIX và khỏi
  `copyDir`, nhưng chỉ cách repo đúng một lệnh `git add`.

---

## P4 — các mục nhỏ hơn

- **F18.** Docstring của `AnnotronTransport` nói per-session token "is not
  implemented"; server đã implement `verdictTokenOk`. Comment lỗi thời, và nó là
  comment liên quan bảo mật.
- **F19.** Gate token được truyền trong query string của URL đưa cho
  `vscode.env.openExternal` ([runCommands.ts:523](../packages/extension/src/v2/runCommands.ts)),
  nên nó rơi vào lịch sử duyệt web.
- **F20.** Mô tả recipe `bugfix` của demo ghi "requirement → diagnosis Canvas →
  plan → RED → GREEN → verify" nhưng danh sách `steps` liệt kê đủ mười phase.
- **F21.** `recordBugReport` đã được export từ core và webview đã biết render
  các history entry `bug_report`, nhưng không có gì tạo ra được một entry như
  vậy. Nó được import ở
  [runCommands.ts:42](../packages/extension/src/v2/runCommands.ts) rồi không
  dùng; chỉ demo tự seed vào fixture. Primitive mà đề xuất bên dưới cần đã có
  sẵn nhưng không ai chạm tới được.

---

## Bổ sung (2026-08-30) — phát hiện từ phiên phân tích Ideas tab routing

Mục dưới đây không nằm trong đợt reproduce trên workspace SwiftPM ngày
2026-08-29 ở trên; nó đến từ việc đọc code sau khi phân tích riêng vì sao
`IDEA-001` route tới `close` mà không có cách nào trỏ máy-đọc-được tới
`SHAPE-001`. Đánh số tiếp `F22` để không đụng thứ tự F1–F21 đã reproduce, chưa
gắn vào batch nào trong `COFOFO_FIX_PLAN.md`.

### F22. Cả hai điểm tổng hợp của Idea flow đều không đi qua Canvas gate

Rà lại toàn bộ `IdeaService.ts` (không chỉ nhánh `close`): flow có đúng hai chỗ
tổng hợp nội dung tự do thành một artifact chốt, và **cả hai** đều không có
Canvas gate — chỉ có Canvas ở các bước rất muộn, bên trong pipeline của epic
con, sau khi resource đã bị commit.

- **`INTENT.md`** ([renderIdeaBrief.ts:15](../packages/core/src/idea/renderIdeaBrief.ts),
  ghi tại [IdeaService.ts:487](../packages/core/src/idea/IdeaService.ts)) — bản
  tổng hợp seed + câu trả lời đã confirm + assumption, hội tụ ở cuối
  `awaiting_human`/`decideRest`. Comment của chính file gọi nó là "the
  compressed INTENT.md the flow graph's 'intent' node writes once the question
  batch... converges" — đúng định nghĩa một synthesis artifact. Không có gate
  nào ở đây. Nó chỉ được Canvas "mượn" lại rất muộn, gộp chung với
  `REQUIREMENT.md` ở bước `requirement` của epic con
  ([WorkflowGenerator.ts:163](../packages/core/src/cofofo/WorkflowGenerator.ts))
  — và hoàn toàn không được review nếu route là `close`.
- **`ROUTE.md`/`EVIDENCE.md`** ([IdeaService.ts:826](../packages/core/src/idea/IdeaService.ts))
  — bản tổng hợp quyết định `kind` (đóng, hay tạo N epic theo recipe nào,
  kèm rationale). Đây là quyết định tốn tài nguyên nhất trong toàn bộ flow,
  nhưng review duy nhất là một modal "Confirm?" tĩnh (`RoutePanel` trong
  [IdeaDetail.tsx:571](../packages/extension/src/webview/components/idea-v3/IdeaDetail.tsx))
  — không hash-binding, không annotate, không request-changes, không phân
  biệt với thao tác vận hành thông thường.

#### F22a. Nhánh `close` của Idea routing không đi qua Canvas gate nào

`IdeaService.generateRoute()` ([IdeaService.ts:497-511](../packages/core/src/idea/IdeaService.ts))
áp dụng outcome `close` ngay lập tức: ghi `EVIDENCE.md`, chuyển `checkpoint`
sang `closed`, và trả về — không có bước duyệt nào ở giữa. Đây là chủ đích, có
ghi rõ trong comment ngay phía trên
([IdeaService.ts:491-495](../packages/core/src/idea/IdeaService.ts)):

> `outcome: 'close'` finalizes immediately with no human confirmation — the
> flow graph routes `kind → close` directly, bypassing the confirm screen
> entirely, because there is no epic and no irreversible action to confirm.

Lý do đó đúng cho *hành động* (không mutate code, không tạo epic), nhưng không
đúng cho *nội dung quyết định*: khi lý do đóng idea là "tiếp tục công việc đã
có" (như IDEA-001 tham chiếu `SHAPE-001`), rationale đó chỉ là văn bản tự do
trong `EVIDENCE.md` — không ai xác nhận nó đúng trước khi `closed` trở thành
trạng thái cuối. Nếu agent định tuyến sai — ví dụ đóng nhầm một idea lẽ ra cần
epic riêng — không có gate nào chặn lại; người dùng chỉ phát hiện được bằng
cách tự đọc `EVIDENCE.md` sau đó.

So sánh với nhánh `split`: `confirmRouteAndScaffold`
([IdeaService.ts:552](../packages/core/src/idea/IdeaService.ts)) bắt buộc
`actor.kind === 'user'`, và về sau `resolvePlanCanvasStepIndex`
([ideaDeliverySync.ts:34](../packages/core/src/idea/ideaDeliverySync.ts)) mở
Plan Canvas ở bước `requirement` của epic con — nhưng đó là review nội dung
epic, không phải review quyết định định tuyến. Cả hai nhánh outcome đều không
có gate nào xác nhận riêng bản thân quyết định `kind`/`close`/`split`.

Câu hỏi cần bàn:

- Canvas gate ở đây nên review đúng cái gì: bản thân `ROUTE.md`/`EVIDENCE.md`
  (rationale của agent), hay một artifact tường minh hơn buộc agent phải trả
  lời "outcome này có nối tới Shape/epic có sẵn nào không" thay vì để lẫn
  trong văn xuôi tự do?
- Gate này có nên bắt buộc cho mọi outcome `close`, hay chỉ khi rationale nhắc
  tới một Shape/epic có sẵn (tức là có rủi ro đóng nhầm việc lẽ ra cần định
  tuyến lại)?
- Cơ chế bundle content-addressed đang thiết kế trong
  `.claude/plans/ecc-evidence-and-artifact-review-canvas.plan.md`
  (`ArtifactReview.ts`, Task 3) bind bundle vào
  `runId + stepIdx + stepRevision + reviewRevision` — tất cả đều thuộc một
  pipeline run. Quyết định `generateRoute()` xảy ra **trước khi có run nào**,
  nên gate này cần một binding key khác (`ideaId + ideaRevision`?) hay nên đợi
  `ArtifactReview` tổng quát hoá trước?
- Có nên coi đây là một dạng của F6 (Canvas `request_changes` không trả việc
  ngược lên trên) — tức route sai thì "request changes" quay lại đúng bước
  `route` để agent định tuyến lại — thay vì chỉ approve/reject nhị phân?

#### F22b. `INTENT.md` — bản tổng hợp intake — không đi qua Canvas gate nào

`advanceToIntentDrafted()` ([IdeaService.ts:484-489](../packages/core/src/idea/IdeaService.ts))
ghi `INTENT.md` ngay khi câu hỏi cuối cùng hội tụ (0 câu hỏi cần hỏi, batch
`submitBatch` xong, hoặc `decideRest`) và trả về idea ở checkpoint
`intent_drafted` — không có bước duyệt nào chen giữa. Đây là artifact mà
routing agent, rồi (nếu ra epic) agent `requirement`, đều dùng làm input gốc —
sai một giả định ở đây thì sai xuyên suốt phần còn lại của Idea, kể cả khi mọi
Canvas gate phía sau đều approve đúng quy trình, vì chúng chỉ review nội dung
*dựa trên* INTENT.md, không review lại chính INTENT.md.

Riêng batch answer (`saveAnswer`/`submitBatch`) đã có review implicit — người
dùng tự tay chọn từng câu trả lời. Nhưng **assumption tự động** (câu hỏi
không kịp trả lời trong `MAX_BATCH_ROUNDS` vòng, hoặc `decideRest`) thì không
— `assumptionsFor()` ([IdeaService.ts:424](../packages/core/src/idea/IdeaService.ts))
áp option `recommended` mà không ai xác nhận, và assumption đó nằm nguyên
trong `INTENT.md` đi tiếp xuống routing.

---

## Đề xuất cụ thể cho F22 — một Canvas gate trước khi resource bị commit

**Quyết định (2026-08-30): chỉ làm Gate 2, không làm Gate 1.** Lý do: F22b đề
xuất ban đầu gate cả `INTENT.md` trước khi routing chạy, nhưng đó vi phạm
trực tiếp quyết định đã ghi ở `IdeaAssumptionSchema`
([contracts/idea.ts:116-118](../packages/core/src/contracts/idea.ts)) —
assumption "reviewed once at the `requirement` Canvas gate... never a second
review surface inside Ideas". Giữ nguyên quyết định đó; F22b coi như đóng,
không implement Gate 1.

**Gate 2 — thay thế `RoutePanel`'s modal tĩnh, cho cả hai outcome.** Review
`ROUTE.md` (outcome tạo epic) hoặc `EVIDENCE.md` (outcome `close`) như một
Canvas artifact thật — hash-bound, annotate được, `request_changes` quay lại
đúng bước `route` để routing agent chạy lại (trả lời câu hỏi mở "coi đây là
dạng F6" ở trên: có, dùng lại cùng semantics). `close` không còn finalize
ngay; `confirmRouteAndScaffold` cho outcome epic không còn chỉ check
`actor.kind === 'user'` mà check luôn verdict `approve` khớp hash.

Dư âm chấp nhận được: assumption của một idea route tới `close` vẫn không
bao giờ được review (không có bước `requirement` nào cho outcome đó) — nhưng
rủi ro thật của outcome `close` nằm ở rationale đóng (được Gate 2 cover qua
`EVIDENCE.md`), không phải ở assumption riêng lẻ.

Binding key: vì cả hai gate này xảy ra **trước khi có `runId`** (khác mọi
Canvas gate khác trong hệ thống, vốn bind theo `runId + stepIdx + stepRevision`),
chúng cần `ArtifactReview` core nhận thêm một binding key độc lập với run —
đề xuất `ideaId + ideaRevision`, cùng dạng optimistic-concurrency mà
`IdeaService` đã dùng ở mọi method khác (`expectedRevision`). Đây là việc cần
làm trong `ArtifactReview.ts` (Task 3 của
`.claude/plans/ecc-evidence-and-artifact-review-canvas.plan.md`) trước khi
B8 có thể implement — không phải một thiết kế riêng, không phải chờ Task 3
"tổng quát hoá" một cách mơ hồ.

Cố ý **không** đề xuất: gate cho mỗi câu trả lời riêng lẻ trong batch (đã có
review implicit qua UI chọn đáp án); gate cho `close` chỉ khi rationale nhắc
Shape/epic có sẵn (phân biệt đó cần agent tự nhận diện được, chưa kiểm chứng —
áp dụng gate cho **mọi** outcome đơn giản và an toàn hơn).

---

## Đề xuất — người dùng làm gì khi deliverable của `cofofo-feature` có bug

Viết cho đúng đối tượng mà ta nên thiết kế hướng tới: người mô tả được triệu
chứng nhưng không định vị được nó trong pipeline.

`cofofo-feature` không có phase `diagnose` — `diagnose` tồn tại trong
`cofofo-delivery` nhưng recipe feature loại nó ra. Nên "feature này có bug" hiện
chưa có câu trả lời chính thức.

### Ràng buộc cốt lõi

Người không rành lập trình biết **cái gì** sai, không biết **ở đâu**. Họ nói được
"bấm refresh thì hiện dữ liệu hôm qua"; họ không nói được lỗi nằm ở `create-plan`
hay ở `implement-green`.

Nên mọi thiết kế bắt họ chọn step để trả việc về là sai ngay từ gốc — kể cả
`pickRejectTarget` đang có. "Lỗi nằm ở đâu" chính là câu hỏi mà phase `diagnose`
sinh ra để trả lời. Hãy để `diagnose` làm bộ định tuyến; đừng bắt người dùng
định tuyến.

### Cơ chế: một nút, một ô mô tả, hệ thống tự định tuyến

Một action **"Báo lỗi"** trên mọi CoFoFo run. Người dùng điền ba ô bằng ngôn ngữ
thường — tôi đã làm gì, thấy gì, mong đợi gì. Không chọn step, không chọn
severity, không đường dẫn file.

**Ca A — run đã hoàn tất (feature đã ship).**

Báo lỗi mở một run `cofofo-bugfix` **mới**, mang theo mô tả dưới dạng
`BUG-REPORT.md`, kèm trường `relatesTo` trỏ về epic gốc. Phase đầu tiên nó chạm
tới là `diagnose`, sau Canvas gate bắt buộc.

Lý do kiến trúc quan trọng hơn lý do quy trình: **run mới nghĩa là `runId` mới,
nghĩa là evidence ledger mới.** F2 và F3 ở đây không bị né tránh — chúng không
còn áp dụng nữa. RED/GREEN/VERIFY được chứng minh lại trên đúng code ở trạng thái
hiện tại, đúng mục đích ban đầu của các gate đó.

Đường còn lại — `requestStepUpdate` trên run đã hoàn tất — cho ra kết quả tệ nhất
có thể với người không chuyên: hệ thống báo "đã verify" bằng bằng chứng thu được
**trước** khi sửa. Vì vậy `requestStepUpdate` phải bị **từ chối** trên một CoFoFo
delivery run đã completed, và được thay bằng chính action này.

**Ca B — run đang chạy và người dùng thấy sai ở một Canvas gate.**

Giữ nguyên `request_changes`; người dùng chỉ viết mô tả. Step mở lại tại chỗ. Nếu
agent đọc feedback đó và kết luận nguyên nhân gốc nằm ở phase trước, thì **agent
đề xuất** phase cần quay lại và con người **xác nhận** đề xuất đó tại Canvas gate.

Đây là cách sửa F6 được ưu tiên hơn việc thêm bộ chọn step vào Canvas verdict:
người biết ít nhất về kiến trúc không nên chọn tuyến đi, nhưng vẫn phải là người
phê duyệt lựa chọn đó.

### Thay đổi cụ thể

| Thay đổi | Ở đâu |
|---|---|
| Action "Báo lỗi" + modal ba ô, đấu vào `recordBugReport` đã có (F21) | extension: sidebar + epic detail |
| `BUG-REPORT.md` là input của `diagnose` | step config của `cofofo-delivery` |
| `relatesTo` trên epic bugfix | run state + `state.json` của epic |
| `resumeFrom` trong `ROOT-CAUSE.md`, được tôn trọng tại diagnose Canvas gate | contract của `diagnose` + runner |
| Từ chối `requestStepUpdate` trên CoFoFo delivery run đã completed | `PipelineRunner` |

Cố ý **không** đưa vào: một phase `diagnose` optional/skippable trong
`cofofo-feature`. Dưới đề xuất này nó không cần thiết — bug sau khi ship đi qua
run bugfix riêng của nó, bug giữa run đi qua Canvas.

### Ca tệ hơn: khi chính workflow bị kẹt

"`cofofo-feature` không chạy đúng" có thể không phải là feature có bug — mà là
công cụ đang chặn. Với người không chuyên thì đây mới là ca nguy hiểm, vì F4 hiện
không để lại lối thoát nào: sau một `git clone`, mọi thứ báo blocked, thông báo
lỗi bảo chạy `aidlc cofofo rebase`, và lệnh đó ném ra đúng lỗi vừa rồi.

Đề xuất: một action **"Kiểm tra & sửa workspace"**, cùng một lệnh
`aidlc cofofo doctor` tương ứng, nói bằng ngôn ngữ thường:

> Foundation đang bị đánh dấu là cũ vì 4 file có thời gian sửa đổi mới hơn,
> nhưng nội dung không thay đổi. Điều này thường xảy ra sau khi clone repository
> hoặc đổi branch. → **[Sửa ngay]**

Ba lớp, theo thứ tự: (1) loại bỏ nguyên nhân — bỏ phép so mtime ở F4; (2) với
những trạng thái thật sự không tự sửa được, `doctor` phải nêu đúng lệnh có tác
dụng; (3) không bao giờ để một thông báo lỗi trỏ tới cách chữa sẽ ném lỗi.

Lưu ý: `aidlc doctor` hiện có chỉ kiểm tra binary Claude và auth, không kiểm tra
sức khoẻ workspace — đây là một bề mặt mới, không phải phần mở rộng của nó.

### Thứ tự thực hiện

Không mục nào ở trên làm được trước **F1**. Nếu recipe vẫn tước mất `review` và
`evidence`, thì diagnosis Canvas trong run bugfix mới cũng chỉ là một nút Approve
và cả đề xuất này thành đồ trang trí. Tiếp theo là **F2/F3**: Ca A thoát khỏi
chúng nhờ chính cách thiết kế, nhưng Ca B (rework giữa run) vẫn hỏng cho tới khi
hai mục đó được sửa.

### Còn để mở

- "Báo lỗi" có nên dùng được bởi người không phải người vận hành run không, và
  nếu có thì báo cáo có cần danh tính tác giả không?
- Run bugfix có kế thừa `inputs.json` của epic gốc, hay bắt đầu sạch chỉ với
  `BUG-REPORT.md`?
- Nếu một báo cáo đến khi run gốc đang chạy dở **và** lỗi thuộc về một epic đã
  ship trước đó, run nào nhận báo cáo?
- `relatesTo` là một tham chiếu được kiểm tra (epic phải tồn tại) hay chỉ là ghi
  chú audit dạng text tự do?
- Bug trong một feature mà Foundation đã đổi từ lúc đó gộp cả F2, F3 và F4. Ca A
  sống sót qua rebase nhờ thiết kế; cần xác nhận lại điều đó sau khi F2/F3 xong.
