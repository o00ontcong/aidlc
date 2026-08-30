# CoFoFo — Kế hoạch triển khai

Ngày: 2026-08-29
Branch: `feat/canvas-review-policy`
Tài liệu đi kèm: [COFOFO_FIX_BACKLOG.md](./COFOFO_FIX_BACKLOG.md) (các phát hiện F1–F21)

Kế hoạch này biến backlog thành công việc có thứ tự, triển khai được. Mọi câu hỏi
còn để mở trong backlog đều được chốt ở đây; chỗ nào quyết định là lựa chọn chủ
quan chứ không phải nước đi bắt buộc thì tôi nêu rõ lý do, để nếu muốn lật lại
thì lật một cách có chủ đích.

---

## Các quyết định đã chốt

| Câu hỏi | Quyết định | Lý do |
|---|---|---|
| Hình dạng bản sửa F1 | Passthrough kèm override tường minh, không mở rộng whitelist | `normalizeStep` vốn đã trả về mọi trường dạng phẳng; whitelist sẽ hỏng lại vào ngày ai đó thêm trường mới |
| Các run đã tạo với snapshot mất gate | Phát hiện và chặn không cho chạy tiếp; không tự động migrate | Chưa có gì ship. Những run đó không có bằng chứng hợp lệ, nên sửa tại chỗ là hợp thức hoá cái sai |
| Cơ chế F2/F3 | Bind mỗi evidence record vào `stepRevision` lúc capture | Tái dùng cơ chế revision sẵn có; binding nằm bên trong record đã hash-chain nên chống giả mạo |
| Reset cascade/downstream | Bắt buộc bump `revision` | Hiện tại không bump, nên chạy lại sẽ validate trúng record cũ. Đây là sửa đúng, độc lập với evidence |
| Phép so mtime ở F4 | Xoá hẳn | Dòng ngay trên đã hash-verify chính file đó. Nội dung có đổi hay không mới là toàn bộ câu hỏi |
| Waiver F5 | Cho `test-red` luôn có Canvas gate trên `RED-EVIDENCE.md` | Dùng cơ chế sẵn có; RED là ranh giới ngay trước khi chạm production code, nên có gate ở đó là đúng bất kể waiver |
| Định tuyến ngược lên F6 | `resumeFrom` trong `ROOT-CAUSE.md`, chỉ cho `diagnose` (Ca A). Ca B hoãn | Phase diagnose ở Ca A sinh ra để trả lời "ở đâu". Ca B cần agent tự chẩn đoán lỗi thuộc phase trên, điều đó chưa được kiểm chứng |
| File provider ở F8 | Gate một `PROVIDER-CONTEXT.md` đã render; ghi `CLAUDE.md`/`AGENTS.md` tại `activate()` | Nên review nội dung, không review file host mà tool khác cũng ghi vào |
| Demo | Dựng lại trên `generatedCofofoWorkspace` + recipe | Ba pipeline viết tay của demo chính là thứ che mất F1 |
| Ngôn ngữ prose của demo | Chuyển sang tiếng Việt, thống nhất với documentation | Theo yêu cầu ngôn ngữ hiện hành của dự án |
| `relatesTo` | Tham chiếu bắt buộc — epic phải tồn tại | Một ghi chú audit trỏ vào hư không còn tệ hơn là không có |
| Input của run bugfix | Bắt đầu sạch, chỉ có `BUG-REPORT.md` | Kế thừa `inputs.json` sẽ kéo lại brief gốc, không phải thứ đang được sửa |

**Không làm:** phase `diagnose` optional/skippable trong `cofofo-feature`; bộ chọn
step trên Canvas verdict; tự động migrate các run đã có.

---

## Thứ tự thực hiện

```
B0  Test fail trước (bộ khung chứng minh)
     │
B1  F1 — recipe giữ được review/evidence     ← mọi thứ khác chỉ là trang trí cho tới khi cái này xong
     │
B2  F2/F3 — replay evidence + bind revision
     │
B3  F4, F9, F10 — các lỗi đúng/sai độc lập   ← chạy song song với B2 được
     │
B4  F5, F7, F8 — toàn vẹn của gate
     │
B5  Luồng báo lỗi + workspace doctor
     │
B6  Dựng lại demo + dọn dẹp
     │
B7  Kiểm chứng lại, cập nhật checklist
```

B3 không phụ thuộc B2, một người thứ hai làm song song được. Phần còn lại theo
đúng thứ tự.

---

## B0 — Viết test fail trước

Viết các test chứng minh từng lỗi **trước khi** sửa, để bản sửa được kiểm chứng
chứ không phải được tin tưởng. Tất cả phải fail trên branch hiện tại.

- [ ] `packages/core/test/pipeline-assembler.test.ts` — khẳng định một vòng
      round-trip qua recipe giữ nguyên `review`, `evidence`,
      `produces_contains`, `skippable` cho mọi step. **Hôm nay fail.**
- [ ] Cùng file — một test table-driven duyệt mọi key của normalized step và
      khẳng định nó sống sót qua assembly, để lần sau thêm trường mới thì suite fail.
- [ ] `packages/core/test/cofofo-evidence.test.ts` — capture lại GREEN sau một
      GREEN đã accepted thì thành công. **Hôm nay fail** (`out of order`).
- [ ] Cùng file — sau một lần rebase, RED capture lại được. **Hôm nay fail.**
- [ ] Cùng file — `requireAcceptedEvidence` từ chối một record được capture dưới
      step revision cũ. **Hôm nay fail** (chưa bind revision).
- [ ] `packages/core/test/cofofo.test.ts` — `touch` một artifact của manifest mà
      không đổi byte nào; `inspect()` vẫn `ready`. **Hôm nay fail.**
- [ ] Cùng file — cascade reject bump `revision` cho cả step trung gian và
      step phía sau. **Hôm nay fail.**

Kiểm chứng: `pnpm --filter @aidlc/core test` hiện đúng các test này fail.

---

## B1 — F1: recipe phải giữ `review` và `evidence`

**File:** [packages/core/src/runs/PipelineAssembler.ts](../packages/core/src/runs/PipelineAssembler.ts) (~dòng 113)

Thay whitelist trường bằng passthrough, chỉ override đúng thứ mà quá trình
assembly thật sự thay đổi:

```ts
const steps = recipe.steps.map((id) => {
  const norm = normalizeStep(byId.get(id)!);
  return {
    ...norm,
    name: norm.name ?? id,
    depends_on: resolveDeps(id, new Set([id])),
  } as PipelineStepConfig;
});
```

- [ ] Áp dụng bản viết lại theo passthrough.
- [ ] Xác nhận `validateWorkspace` vẫn chấp nhận kết quả — `normalizeStep` phát
      ra `undefined` cho các optional vắng mặt; nếu schema từ chối thì lọc bỏ
      các key `undefined`.
- [ ] Thêm một guard sau assembly: nếu step nguồn có khai `review` hoặc
      `evidence` mà bản assembled không có thì ném `PipelineAssembleError`. Rẻ,
      và nó bắt được regression trong tương lai ngay lúc chạy cho những ai đã
      dùng phiên bản này.
- [ ] Thêm phát hiện mất gate cho các run đã có: một run mà `pipelineSnapshot`
      thiếu `review`/`evidence` mà pipeline nguồn có khai thì bị `verifyRun` báo
      cáo và bị từ chối `markStepDone`, kèm thông báo bảo người vận hành mở run mới.
- [ ] Các test assembler ở B0 pass.

**Kiểm chứng:** chạy lại phép so sánh trong backlog — khối
`recipe weather-alert -> assemblePipeline()` phải khớp từng dòng với pipeline
được khai báo.

---

## B2 — F2/F3: replay evidence và bind revision

Ba thay đổi phối hợp. Làm cùng nhau; thiếu bất kỳ cái nào cũng để lại lỗ hổng.

### B2.1 Mọi đường mở lại step đều phải bump revision

**File:** [packages/core/src/runs/PipelineRunner.ts](../packages/core/src/runs/PipelineRunner.ts)

- [ ] `rejectStep` chế độ cascade — các step trung gian (`target < i < idx`)
      nhận `revision: s.revision + 1` (hiện tại **không** có, khoảng dòng 903).
- [ ] `rejectStep` chế độ cascade — step bị reject tại `idx` cũng vậy.
- [ ] `requestStepUpdate` — mọi step phía sau bị reset về `pending` đều bump
      revision, không chỉ step đích.
- [ ] Xác nhận `rebaseRunToCurrentFoundation` đã bump tất cả (đúng vậy) và giữ nguyên.

### B2.2 Evidence record bind vào step revision

**File:** [contracts.ts](../packages/core/src/cofofo/contracts.ts),
[EvidenceLedger.ts](../packages/core/src/cofofo/EvidenceLedger.ts)

- [ ] Thêm `stepRevision: number` bắt buộc vào `CofofoEvidenceRecordSchema`;
      nâng `schemaVersion` của record lên `2`.
- [ ] `captureEvidence` và `recordRedWaiver` nhận `stepRevision` và ghi nó vào
      draft được hash (để nó nằm trong `recordHash`).
- [ ] Thêm `acceptedStages(records, revisions)` — một record chỉ được tính khi
      `record.stepRevision === revisions[record.stage]`.
- [ ] `expectedNext` và `assertStageOrder` dùng `acceptedStages`.
- [ ] `requireAcceptedEvidence(root, runId, stage, stepRevision)` đòi khớp cả
      stage lẫn revision.

### B2.3 Nơi gọi truyền revision vào

- [ ] `markStepDone` ([PipelineRunner.ts:396](../packages/core/src/runs/PipelineRunner.ts))
      truyền `state.steps[idx].revision`.
- [ ] `captureCofofoEvidenceCommand`
      ([cofofoCommands.ts](../packages/extension/src/v2/cofofoCommands.ts)) đọc
      revision từ run state.
- [ ] `aidlc cofofo evidence` / `waive-red`
      ([cli/cofofo.ts](../packages/cli/src/commands/cofofo.ts)) đọc từ run state
      chứ không nhận qua flag — người vận hành không được phép tự chọn giá trị này.
- [ ] `aidlc cofofo verify` báo cáo tính hợp lệ theo từng stage đối chiếu
      revision hiện tại, không chỉ đếm số record.
- [ ] Các test evidence ở B0 pass.

**Kiểm chứng:** diễn lại kịch bản reproduce — capture RED→GREEN→REFACTOR→VERIFY,
mở lại `implement-green`, xác nhận GREEN capture lại được trong khi RED vẫn hợp
lệ. Sau đó rebase và xác nhận cả bốn stage đều phải capture lại.

---

## B3 — F4, F9, F10: các lỗi độc lập

Làm song song với B2 được.

### F4 — Freshness của Foundation

**File:** [FoundationService.ts:198](../packages/core/src/cofofo/FoundationService.ts)

- [ ] Xoá phép so `mtimeMs > generated + 1000` trong `validateContext`.
- [ ] Bỏ cách né bằng `fs.utimesSync` ở
      [demoCofofoWeatherProject.ts:415](../packages/extension/src/v2/demoCofofoWeatherProject.ts)
      — nó tồn tại chỉ để thoả phép kiểm tra vừa bị xoá.
- [ ] Gắn nhãn loại cho các issue của inspection (`content-drift` và
      `foundation-invalid`) để nơi gọi khuyên đúng.
- [ ] `canStartStep` / `markStepDone` chỉ khuyên `aidlc cofofo rebase` cho
      `content-drift`; `foundation-invalid` thì khuyên đúng
      `prepare --route …`. Không bao giờ đưa ra lời khuyên sẽ ném lỗi.
- [ ] Test freshness ở B0 pass.

### F9 — Kiểm tra route trong install()

- [ ] [FoundationService.ts:280](../packages/core/src/cofofo/FoundationService.ts):
      chỉ assert approval của `select-ecc-catalog` khi step đó có mặt trong
      snapshot của run.
- [ ] Test: `install()` trên một run `update-rules` không báo lỗi về một step mà
      route đó loại ra.

### F10 — RED oracle

- [ ] So `expectedFailure` với toàn bộ output gộp **trước** khi `bounded()`; chỉ
      dùng bounding cho việc lưu trữ.
- [ ] Kiểm tra quy tắc base64 40 ký tự trong `redact()` không ăn mất chữ trong
      oracle; thêm test với một chuỗi oracle đủ để kích hoạt quy tắc đó.

---

## B4 — F5, F7, F8: toàn vẹn của gate

### F5 — RED waiver nằm sau một Canvas gate

- [ ] Thêm `human_review: true` + `review: { mode: canvas, artifacts: [RED-EVIDENCE.md] }`
      cho `test-red` trong `generatedCofofoWorkspace`
      ([WorkflowGenerator.ts](../packages/core/src/cofofo/WorkflowGenerator.ts)).
- [ ] `waive-red` ghi nội dung waiver vào cả `RED-EVIDENCE.md` lẫn ledger, để
      người duyệt nhìn thấy đúng thứ họ đang miễn trừ.
- [ ] `waive-red` từ chối khi đã có RED accepted ở step revision hiện tại.
- [ ] Cập nhật phase instruction của `test-red` để nêu rõ Canvas gate.

### F7 — Canvas gate đồng thời trong Annotron

**File:** [vendor/annotron/src/server.js](../vendor/annotron/src/server.js)

- [ ] Key session dạng formal theo `(file, bundleHash)` thay vì chỉ `file`;
      session freeform vẫn giữ key `file` trần.
- [ ] `GET /verdict` nhận `?gate=<bundleHash>`; `POST /verdict` nhận `gate`
      trong body. Bỏ trống = quay về chế độ một session (freeform).
- [ ] `AnnotronTransport` gửi `gate: bundle.bundleHash` ở cả hai.
- [ ] Test: hai gate đăng ký trên cùng một file đều giải quyết độc lập được.

### F8 — Artifact provider context

- [ ] `publish()` render managed block ra
      `docs/project/foundation/PROVIDER-CONTEXT.md`.
- [ ] Canvas artifact của `publish-context` đổi thành
      `[docs/README.md, PROVIDER-CONTEXT.md]` — bỏ `CLAUDE.md`/`AGENTS.md`.
- [ ] `activate()` ghi block đã được duyệt vào `CLAUDE.md`, `AGENTS.md`,
      `.cursor/rules/cofofo.md`, `.opencode/instructions/cofofo.md`.
- [ ] Test: ghi vào `CLAUDE.md` trong lúc gate đang mở không còn làm approval
      mất hiệu lực.

---

## B5 — Luồng báo lỗi và workspace doctor

Hiện thực phần Đề xuất trong backlog.

### B5.1 "Báo lỗi"

- [ ] Đấu dây `recordBugReport` (F21) đã export sẵn vào một command; bỏ import
      chết ở [runCommands.ts:42](../packages/extension/src/v2/runCommands.ts).
- [ ] Modal ba ô (đã làm gì / thấy gì / mong đợi gì) ở sidebar và epic detail.
      Không chọn step, không severity, không đường dẫn.
- [ ] CoFoFo delivery run đã hoàn tất → mở một run `cofofo-bugfix` mới với
      `BUG-REPORT.md` và `relatesTo` (bắt buộc: epic phải tồn tại). Bắt đầu
      sạch; không kế thừa `inputs.json`.
- [ ] Run đang chạy → ghi báo cáo lên step hiện tại (đúng ngữ nghĩa
      `recordBugReport` sẵn có).
- [ ] Từ chối `requestStepUpdate` trên CoFoFo delivery run đã hoàn tất, và trỏ
      người dùng sang "Báo lỗi".
- [ ] Thêm `BUG-REPORT.md` vào `requires` của `diagnose` trong generated
      delivery pipeline.

### B5.2 `resumeFrom` (chỉ Ca A)

- [ ] `ROOT-CAUSE.md` có thêm mục `## Resume From` nêu đúng một phase.
- [ ] Validate tên phase đó theo pipeline của run; từ chối tên lạ.
- [ ] Duyệt diagnose Canvas gate thì áp dụng cascade về đúng phase đó.
- [ ] Test: `Resume From` rỗng hoặc không hợp lệ thì chặn gate, không âm thầm
      dùng giá trị mặc định.

### B5.3 Workspace doctor

- [ ] `aidlc cofofo doctor` + action "Kiểm tra & sửa workspace".
- [ ] Render mọi issue của inspection bằng ngôn ngữ thường, kèm đúng lệnh thật
      sự sửa được.
- [ ] Action sửa chỉ cho những ca tự chữa được; không bao giờ tuyên bố sửa được
      thứ nó không sửa được.
- [ ] Đưa phần phát hiện mất gate ở B1 vào output của nó.
- [ ] Tách riêng khỏi `aidlc doctor` sẵn có (kiểm tra binary Claude và auth).

---

## B6 — Dựng lại demo và dọn dẹp

- [ ] **F11** Dựng lại demo trên `generatedCofofoWorkspace` + recipe
      `cofofo-feature` / `cofofo-bugfix`, thay cho ba pipeline viết tay. Đây
      chính là thay đổi lẽ ra đã bắt được F1.
- [ ] **F12** Đưa `COFOFO-WEATHER-008-RED-WAIVER` về một trạng thái mà runner
      tạo ra được; cập nhật assertion ở
      [cofofoWeatherDemo.test.ts:115](../packages/extension/test/cofofoWeatherDemo.test.ts).
      Sau B4/F5 thì `test-red` có Canvas gate, nên `awaiting_review` trở thành
      hợp lệ — hãy suy ra lại chứ đừng mặc định.
- [ ] **F13** Sửa `commandId`/`args` trong ledger được seed thành một cặp mà
      allow-list thật sự tạo ra được; thêm `stepRevision` từ B2.
- [ ] **F14** Ghi cú dừng do Foundation stale của `COFOFO-WEATHER-009` thành một
      system event, không phải `request_changes` của con người.
- [ ] **F15** Hoặc capture bằng chứng `swift.build`, hoặc thôi khẳng định nó
      trong `VERIFY.md`.
- [ ] **F20** Sửa mô tả recipe `bugfix` cho khớp với mười step của nó.
- [ ] **F16** Rà lại prose của demo (README, `description` trong
      `workspace.yaml`, tiêu đề/mô tả epic) cho nhất quán tiếng Việt và đúng
      chính tả kỹ thuật.
- [ ] **F17** Thêm `packages/extension/media/**/.build/` vào `.gitignore`.
- [ ] **F18** Sửa docstring lỗi thời của `AnnotronTransport` — per-session token
      **đã** được implement (`verdictTokenOk`).
- [ ] **F19** Thôi đặt gate token vào query string của URL
      ([runCommands.ts:523](../packages/extension/src/v2/runCommands.ts)); trao
      nó qua một lần trao đổi dùng một lần, hoặc qua header do trang Canvas yêu cầu.

---

## B7 — Kiểm chứng lại và chốt

- [ ] Chạy toàn bộ suite: core, extension, annotron, build CLI.
- [ ] Chạy lại mọi kịch bản reproduce trong backlog và xác nhận từng cái đã đúng.
- [ ] Seed demo mới và đi hết feature + bugfix qua đường **recipe**, có một lần
      duyệt Canvas thật và một vòng rework thật.
- [ ] Mô phỏng đồng nghiệp: `git clone` demo đã seed sang thư mục khác và xác
      nhận Foundation đọc ra `ready`.
- [ ] Cập nhật [COFOFO_WORKFLOW_CHECKLIST.md](./COFOFO_WORKFLOW_CHECKLIST.md) —
      hiện có vài mục `[x]` không đúng sự thật, đặc biệt là "Make Canvas verdicts
      the only approval authority for Canvas-gated steps" và các mục về
      machine-evidence boundary.
- [ ] Đóng gói lại VSIX và ghi checksum mới.

---

## Hình dung khối lượng

| Batch | Cỡ | Rủi ro | Song song được |
|---|---|---|---|
| B0 | S | không | — |
| B1 | S | thấp — thay đổi nhỏ, phạm vi ảnh hưởng rộng | không |
| B2 | L | trung bình — chạm schema, runner, cả hai client | không |
| B3 | S | thấp | có, cùng lúc với B2 |
| B4 | M | trung bình — F7 đổi HTTP contract của annotron | F5/F7/F8 độc lập với nhau |
| B5 | L | trung bình — bề mặt UX mới | B5.3 độc lập với B5.1/B5.2 |
| B6 | M | thấp, nhưng B6/F11 mới là bài regression test thật cho B1 | phần lớn là có |
| B7 | S | — | không |

Đường tới hạn là B1 → B2 → B5. B3, B4 và phần lớn B6 xen kẽ được.

---

## Hai thứ nên chốt trước khi bắt đầu

1. **Nâng schema của record (B2.2).** Đặt `stepRevision` là bắt buộc và nâng lên
   `schemaVersion: 2` sẽ làm mọi ledger hiện có trở thành không hợp lệ. Chưa có
   gì ship, nên ledger duy nhất bị ảnh hưởng là của demo — mà B6 dù sao cũng
   viết lại. Xác nhận giúp là không có dự án thật nào trên branch này có ledger
   cần giữ.

2. **B4/F5 đổi hình dạng pipeline.** Thêm Canvas gate cho `test-red` nghĩa là mọi
   delivery run đang chạy sẽ có thêm một gate giữa chừng. Cộng với quyết định ở
   B1 là không migrate, điều này cho thấy nên xong B1–B4 trước khi có ai bắt đầu
   việc thật trên branch này.

---

## B8 (đã implement 2026-08-30) — F22: Canvas gate cho quyết định routing của Idea

Xong: `IdeaService.applyRouteReviewVerdict` + `buildRouteReviewBundle`
(`packages/core/src/idea/IdeaService.ts`), `Idea.routeApproval` schema field
(`packages/core/src/contracts/idea.ts`), `aidlc.openIdeaRouteReview` command
(`packages/extension/src/v2/runCommands.ts` + `workspaceCommands.ts`),
webview wiring (`workspaceWebview.ts`'s `openIdeaRouteReview` case,
`IdeaDetail.tsx`'s `RouteReviewGateCard`, `ideasI18n.ts`), và
`ProviderManagedIdeaCommand.ts` cập nhật để agent provider-managed không còn
tự set `checkpoint: closed` hay ghi `routeApproval`. 6 test mới trong
`packages/core/test/idea.test.ts` (describe `F22 — Canvas gate on the routing
decision`) cover approve/request_changes/stale/foreign-bundle/replay/backward-
compat; test cũ cập nhật theo hành vi mới. Core (985 test) + extension (215
test) đều pass; webview + main tsc typecheck sạch (một lỗi tsc tiền hữu ở
`demoCofofoWeatherProject.ts:456` không liên quan, đã tách task riêng).

Chưa làm, cố ý để mở: gate cho `INTENT.md` (F22b) — xem quyết định đã chốt ở
`COFOFO_FIX_BACKLOG.md`.

### Ghi chú lịch sử trước khi implement

Cập nhật 2026-08-30: chỉ làm **Gate 2** (`ROUTE.md`/`EVIDENCE.md`, trước
`confirmRouteAndScaffold`/finalize `close`). Gate 1 (`INTENT.md`) bị loại bỏ —
vi phạm quyết định đã ghi ở `IdeaAssumptionSchema`
([contracts/idea.ts:116-118](../packages/core/src/contracts/idea.ts)): "never
a second review surface inside Ideas" cho assumption. Xem "Đề xuất cụ thể cho
F22" trong `COFOFO_FIX_BACKLOG.md`.

- Gate trên `ROUTE.md` (outcome tạo epic) hoặc `EVIDENCE.md` (outcome
  `close`), thay modal `Confirm?` tĩnh của `RoutePanel` — áp dụng cho cả hai
  outcome. `request_changes` quay lại bước `route` để routing agent chạy lại
  (cùng cơ chế reject-to-target mà F6 cần).
- Binding key: `idea.id` làm `runId` của `ReviewBundle`, `stepIdx: 1` (hằng
  số, không có ý nghĩa thứ tự — chỉ để tái dùng shape có sẵn), `stepRevision:
  idea.ideaRevision` (đã là optimistic-concurrency field sẵn có, không cần
  counter mới), `reviewRevision: 1` (không đổi — request_changes luôn bump
  `ideaRevision` nên tự nhiên vô hiệu hoá bundle cũ, không cần round riêng).
- `buildReviewBundle`/`checkBundleCurrent` ([ArtifactReview.ts](../packages/core/src/runs/ArtifactReview.ts))
  tái dùng nguyên vẹn, không sửa — chúng vốn chỉ cần path+hash, không phụ
  thuộc `RunState`. Phần cần viết mới là tương đương
  `applyArtifactReviewVerdict` nhưng áp lên `Idea` thay vì `RunState`.

Không phụ thuộc B1–B7 và không nằm trên đường tới hạn B1 → B2 → B5; có thể bàn
song song bất cứ lúc nào.
