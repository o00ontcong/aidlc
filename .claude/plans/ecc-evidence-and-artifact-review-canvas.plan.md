# Plan: Tích hợp quy trình bằng chứng ECC và Artifact Review Canvas

**Source PRD**: Yêu cầu trực tiếp của người dùng ngày 2026-08-26; trạng thái repository sau revert `9635275`; ECC upstream commit `d8409a4b0813771235555e32e3d8046a73988bfa`
**Selected Milestone**: Biến ECC thành delivery contract được AIDLC thực thi và bắt buộc Canvas verdict cho các Markdown output quan trọng trong built-in workflow
**Complexity**: Large

## Summary

Xây dựng lại phần tích hợp ECC đã bị revert theo hướng core-first và có bằng
chứng máy tạo, thay vì chỉ đổi presentation, prompt hoặc tên phase. AIDLC tiếp
tục là control plane bền vững: pipeline snapshot, run state, provider
abstraction, capability registry và Epic UI chịu trách nhiệm điều phối. ECC bổ
sung engineering contract: research có căn cứ, human approval gắn với đúng nội
dung, RED trước GREEN, review bằng fresh context, final verification độc lập,
memory không mặc nhiên đáng tin và improvement proposal có chủ đích.

Built-in workflow mới:

`research -> planning bundle -> human Canvas approval -> test-red -> implement-green -> refactor -> fresh-review -> verify -> remember -> improve`

Các claim RED, GREEN, refactor và verify không được thỏa mãn chỉ bằng nội dung
Markdown do agent viết. CLI/runtime phải thực thi command đã khai báo, ghi thời
gian bắt đầu/kết thúc, exit status, output đã redact và giới hạn, cùng hash/path
của full log, sau đó append structured evidence vào RunState. RED chỉ hợp lệ khi
command trả non-zero và có expected-failure reason khớp mục tiêu test; GREEN,
refactor và verify chỉ hợp lệ khi command trả zero. Markdown evidence chỉ render
hoặc liên kết tới record này, không thay thế record.

Planning bundle giữ lại thế mạnh sản phẩm hiện có của AIDLC gồm `PRD.md`,
prototype tùy chọn, `TECH-DESIGN.md` và `TEST-PLAN.md`, nhưng xem chúng là một
ECC plan boundary. Không production mutation nào được bắt đầu trước khi mọi
planning artifact bắt buộc đã được người dùng approve trong Canvas trên đúng
SHA-256 hiện tại. Các human gate về sau dùng cùng protocol để review
`IMPLEMENT-SUMMARY.md`, `REVIEW.md`, `VERIFY.md`, `MEMORY-HANDOFF.md` và
`IMPROVEMENT-PROPOSAL.md`.

Canvas review được khai báo theo từng pipeline step qua `review: { mode: canvas,
artifacts: [...] }`. Artifact được chọn chỉ có thể nằm trong hợp của `produces`
và `requires` của step, phải là Markdown và phải đi qua path allow-list của core.
Pipeline cũ không có `review` vẫn giữ confirmation gate hiện tại.

Formal Canvas mode là verdict-driven và fail-closed. `request_changes` trả
annotations/feedback để AIDLC mở revision mới; `approve` chỉ hợp lệ khi artifact
path, run id, step revision, review revision và content hash vẫn khớp. Trong
formal gate, Canvas không được sửa source, auto-apply bằng agent, approve remote
tool hoặc dùng generic Done thay cho approval. Các khả năng này vẫn tồn tại ở
freeform preview/feedback ngoài formal gate.

Milestone này không cài toàn bộ ECC plugin, không sao chép toàn bộ agent/skill
catalog, không thêm background transcript observation và không biến AgentShield
thành runtime dependency. Security review được đưa vào fresh-context review;
AgentShield adapter và Context Budget UI là follow-up riêng sau khi evidence và
trust boundary đã ổn định.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| ECC delivery loop | `https://github.com/affaan-m/ECC/tree/d8409a4b0813771235555e32e3d8046a73988bfa` | Plan trước mutation, tách RED/GREEN, review bằng fresh context, verify độc lập, rồi mới remember và improve. |
| Plan Canvas verdict | `https://github.com/affaan-m/ECC/blob/d8409a4b0813771235555e32e3d8046a73988bfa/skills/plan-canvas/SKILL.md` | Duy trì loopback review session, trả structured feedback và chỉ đóng gate bằng verdict `approve` hoặc `request_changes` rõ ràng của con người. |
| Memory trust boundary | `https://github.com/affaan-m/ECC/blob/d8409a4b0813771235555e32e3d8046a73988bfa/docs/design/ecc-memory-vault.md` | Memory là context `unreviewed`, có thể kiểm tra; không tự trở thành rule, skill hoặc policy nếu chưa qua promotion do con người quản trị. |
| Human-only hard gate | `packages/core/src/contracts/autonomy.ts` | Final decision phải nhận diện user, gắn với đúng preview/content đang review và từ chối non-human approval. |
| Durable run transitions | `packages/core/src/runs/PipelineRunner.ts` và `packages/core/src/runs/RunState.ts` | Clone state, giữ step history append-only, validate transition trong core; UI/CLI chỉ là adapter. |
| Redacted execution evidence | `packages/core/src/runs/ExecutionFailureLog.ts` và `packages/core/src/release/ReleaseVerification.ts` | Lưu command result có giới hạn, redact và hash; không coi prose do agent viết là machine evidence. |
| Immutable pipeline definition | `packages/core/src/runs/PipelineSnapshot.ts` | Snapshot review policy để preset upgrade không đổi approval boundary của run đang chạy. |
| Artifact allow-list | `packages/core/src/schema/WorkspaceSchema.ts` và `packages/core/src/runs/resolveArtifactPath` | Chỉ resolve declared path, rewrite theo active Epic root, không tin arbitrary path do browser gửi. |
| Bundled annotation capability | `packages/core/src/capabilities/CapabilityRegistry.ts` và `packages/core/src/contracts/capability.ts` | Annotation là capability có health check, không phải workflow state machine thứ hai. |
| Local review runtime | `vendor/annotron/src/server.js`, `vendor/annotron/src/chrome.html` và `vendor/annotron/bin/annotron` | Tái sử dụng loopback server, registered-file allow-list, sidecar, rendering, long-polling và restartable session. |
| Provider dispatch | `packages/extension/src/v2/providerRunService.ts` | Giữ provider selection ngoài core; chỉ gọi provider sau `request_changes` đã tạo working revision mới. |
| Existing artifact discovery | `packages/extension/src/v2/epicsList.ts` và `packages/extension/src/v2/workspaceWebview.ts` | Index `produces` path thực tế, hỗ trợ custom Epic root và chiếu artifact history vào step timeline. |
| Test style | `packages/core/test/runs.test.ts`, `packages/core/test/schema.test.ts` và `packages/extension/test/epicsList.test.ts` | Dùng Vitest với temporary workspace; assert durable state, filesystem evidence, compatibility và UI projection. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `AGENTS.md` | UPDATE | Khôi phục ECC contract và canonical plan format, không đụng managed AST-graph block. |
| `docs/ECC_AIDLC_PIPELINE_FLOW.md` | CREATE | Mô tả ownership boundary và các Canvas/evidence gate thực tế. |
| `packages/core/src/schema/WorkspaceSchema.ts` | UPDATE | Thêm backward-compatible `review` policy và validate human gate, declared Markdown path. |
| `packages/core/src/runs/ArtifactReview.ts` | CREATE | Resolve artifact, hash content, tạo bundle, validate verdict và stale/path escape. |
| `packages/core/src/runs/EccEvidence.ts` | CREATE | Định nghĩa ordered ECC evidence và machine-captured result. |
| `packages/core/src/runs/RunState.ts` | UPDATE | Persist bundle revision, artifact state, reviewer, verdict và evidence reference. |
| `packages/core/src/runs/PipelineSnapshot.ts` | UPDATE | Snapshot normalized review policy, giữ compatibility với snapshot cũ. |
| `packages/core/src/runs/PipelineRunner.ts` | UPDATE | Chặn plain approval, apply Canvas verdict atomically và tái dùng reject/rerun semantics. |
| `packages/core/src/runs/execEngine.ts` | UPDATE | Buộc `--auto-approve` và provider-managed execution dừng tại Canvas hard gate. |
| `packages/core/src/runs/runReport.ts` | UPDATE | Báo cáo hash, review round, ECC evidence, limitation và human verdict. |
| `packages/core/src/presets/builtinWorkflows.ts` | UPDATE | Thêm ECC stage, declared Markdown output và Canvas review policy. |
| `packages/core/src/presets/commandModel.ts` | UPDATE | Đồng bộ canonical phase/output name và generated command. |
| `packages/core/src/index.ts` | UPDATE | Export artifact-review/evidence contract không phụ thuộc UI runtime. |
| `packages/core/templates/sdlc/agents/reviewer.md` | CREATE | Định nghĩa fresh-context reviewer cho conformance, regression, security, severity. |
| `packages/core/templates/sdlc/skills/{research,test-red,implement-green,refactor,fresh-review,verify,remember,improve}.md` | CREATE | Cung cấp project-native skill contract cho từng ECC evidence stage. |
| `packages/core/templates/sdlc/artifacts/{research,test-red,implement-green,refactor,fresh-review,verify,remember,improve}.md` | CREATE | Cung cấp canonical Markdown structure cho các evidence output mới. |
| `tools/epic-memory.mjs` | UPDATE | Thêm schema/trust/source/evidence link, chặn malformed/secret-like content. |
| `tools/epic-memory-hook.mjs` | UPDATE | Gắn recalled memory là unreviewed context và giới hạn injection. |
| `vendor/annotron/src/server.js` | UPDATE | Thêm formal review metadata và typed verdict endpoint. |
| `vendor/annotron/src/chrome.html` | UPDATE | Thêm Review mode, identity/hash, verdict, stale UX và khóa mutation trong gate. |
| `vendor/annotron/bin/annotron` | UPDATE | Thêm restartable `review open`, `review await` và `review status`. |
| `vendor/annotron/test/review-verdict.test.mjs` | CREATE | Test allow-list, verdict, stale hash, restart và legacy compatibility. |
| `packages/extension/src/v2/artifactReviewService.ts` | CREATE | Quản lý Annotron multi-file bundle, resume và apply verdict qua core. |
| `packages/extension/src/v2/annotationToolsInstaller.ts` | UPDATE | Cài/upgrade formal-review payload, giữ user customization. |
| `packages/extension/src/v2/runCommands.ts` | UPDATE | Thêm open/resume review và chặn direct approval. |
| `packages/extension/src/v2/workspaceWebview.ts` | UPDATE | Expose review state/action và hỗ trợ declared path ngoài `artifacts/`. |
| `packages/extension/src/webview/lib/types.ts` | UPDATE | Truyền policy, hash/status, progress và typed verdict. |
| `packages/extension/src/webview/components/epic-v3/EpicDetail.tsx` | UPDATE | Thêm Review outputs/progress/reopen/approved/stale state. |
| `packages/extension/src/webview/components/epic-v3/GateModal.tsx` | UPDATE | Hiện exact file/hash và loại bỏ generic approval tại formal gate. |
| `packages/cli/src/commands/run.ts` | UPDATE | Thêm `aidlc run review`, `aidlc run evidence` và không bypass Canvas gate. |
| `.claude/commands/aidlc-provider-managed-task.md` | UPDATE | Buộc provider-managed flow dừng tại human Canvas gate. |
| `packages/core/test/artifact-review.test.ts` | CREATE | Test path safety, hash, bundle, stale detection và atomic verdict. |
| `packages/core/test/ecc-evidence.test.ts` | CREATE | Test command capture, exit semantics, order, redaction và tamper detection. |
| `packages/core/test/{runs,schema,pipeline-snapshot,builtin-step-help}.test.ts` | UPDATE | Test gate enforcement, policy, compatibility và workflow order. |
| `packages/core/test/epic-memory.test.ts` | CREATE | Test trust label, legacy memory, size/secret rejection và no promotion. |
| `packages/extension/test/artifactReviewService.test.ts` | CREATE | Test session, custom path, multi-file, restart và transition. |
| `packages/extension/test/{epicsList,providerRunService}.test.ts` | UPDATE | Test evidence projection và provider behavior sau verdict. |

## Tasks

### Task 1: Khôi phục ECC contract, không phục hồi presentation patch đã revert

- **Action**: Khôi phục repository workflow contract và ownership document; xem
  Idea/Discovery UI hiện có là compatibility input. Ghi rõ milestone và non-goal
  để không tuyên bố full ECC parity chỉ từ thay đổi copy.
- **Mirror**: ECC tách portable engineering protocol khỏi presentation/lifecycle
  adapter của từng harness.
- **Validate**: `AGENTS.md` có đủ evidence order/plan format; managed AST-graph
  block giữ nguyên từng byte; task này không đổi production UI copy.

### Task 2: Thêm declarative artifact review policy có backward compatibility

- **Action**: Thêm optional `review: { mode: canvas, artifacts: [...] }`. Bắt buộc
  `human_review: true`; path phải thuộc hợp normalized của `produces`/`requires`;
  chỉ nhận `.md`; reject duplicate/unresolved placeholder; snapshot policy.
  Không có `review` thì giữ confirmation-only behavior.
- **Mirror**: Zod defaults, immutable snapshot của AIDLC và explicit Canvas
  invocation của ECC.
- **Validate**: Tests bao phủ custom root, nhiều artifact, step cũ, malformed
  policy và old run file.

### Task 3: Xây content-addressed review bundle trong core

- **Action**: Resolve path qua active Epic root, chỉ đọc regular file không
  follow symlink, giới hạn count/size, tính SHA-256 và bind bundle vào
  `runId + stepIdx + stepRevision + reviewRevision`. Persist per-file state và
  append-only event, không lưu full body.
- **Mirror**: ECC Memory Vault threat boundary và content-bound autonomy preview
  của AIDLC.
- **Validate**: Viết RED tests trước cho traversal, symlink, missing file,
  changed hash, duplicate verdict, partial approval, crash-safe retry; implement
  đến GREEN.

### Task 4: Ghi machine-generated ECC command evidence

- **Action**: Thêm executor cho `red`, `green`, `refactor`, `verify`; ghi
  start/end, exit status, bounded/redacted output và full-log hash/path vào
  RunState. RED chỉ nhận non-zero kèm expected-failure reason; stage còn lại chỉ
  nhận zero. Core enforce dependency và timestamp order.
- **Mirror**: Existing execution-failure logging/redaction và ECC evidence
  separation.
- **Validate**: RED tests bắt fabricated Markdown claim, sai exit semantics,
  sai thứ tự, log bị đổi, secret output, timeout, cancellation và retry; rồi
  implement đến GREEN.

### Task 5: Biến Canvas verdict thành approval authority duy nhất

- **Action**: Thêm `applyArtifactReviewVerdict`. `approve` phải nhận diện user và
  khớp mọi current hash; `request_changes` phải có feedback/annotation và tái
  dùng downstream reset. `approveStep`, `--auto-approve`, provider-managed và
  raw UI approval phải fail closed tại Canvas gate.
- **Mirror**: Human-only confirmation của ECC và atomic transition/optimistic
  concurrency của AIDLC.
- **Validate**: Agent/stale tab không approve được; bundle advance đúng một lần;
  request changes tạo đúng revision; legacy gate không đổi.

### Task 6: Nâng Annotron thành formal, typed Plan Canvas mode

- **Action**: Giữ preview/freeform mode, thêm formal mode gắn exact metadata.
  Hiện identity/hash, nhận annotation/chat và chỉ `Approve`/`Request changes`
  là final action. Tắt source editing, auto-apply agent, remote tool approval,
  generic Done. Persist queued verdict để resume.
- **Mirror**: ECC Plan Canvas open/await loop và Annotron allow-list, long-poll,
  sidecar, live reload.
- **Validate**: Node tests và browser walkthrough cho hai verdict, queue, reload,
  restart, cancellation, hai file đồng thời và legacy mode.

### Task 7: Nối multi-artifact Canvas vào extension và CLI

- **Action**: `ArtifactReviewService` mở từng file, expose
  `pending/approved/changes-requested/stale`, resume session và chỉ chuyển typed
  verdict vào core. Dùng declared path để file ngoài `artifacts/` hoạt động.
  Thêm `aidlc run review`; Annotron lỗi chỉ có repair action, không bypass.
- **Mirror**: `resolveArtifactAbsPath`, capability registry, provider selection
  và CLI/extension parity.
- **Validate**: Test custom root, project-level doc, multi-file, missing install,
  reinstall, restart recovery và CLI/UI convergence.

### Task 8: Đặt Canvas đúng tại human review gate

- **Action**: Khi `awaiting_review`, hiện exact file và progress. Canvas step chỉ
  có `Review outputs`/`Resume review`, approved hash và stale warning. Request
  changes đưa comment vào rerun/provider flow. Freeform Feedback ngoài gate phải
  phân biệt rõ với approval.
- **Mirror**: `GateBanner`, `ArtifactChip`, reject/rerun modal và quy tắc Canvas
  approval thay cho “yes/proceed”.
- **Validate**: Component/host tests chứng minh payload đúng, không bypass; kiểm
  tra layout hẹp/rộng và chuỗi tiếng Việt/tiếng Anh.

### Task 9: Xây built-in workflow quanh ECC evidence stage bắt buộc

- **Action**: Thêm phase/dependency cho research, test-red, implement-green,
  refactor, fresh-review, verify, remember, improve. Giữ planning DAG.
  Production mutation phụ thuộc planning approval và RED evidence. Fresh review
  dùng context mới; verify ở phase riêng. In-flight snapshot không đổi.
- **Mirror**: ECC evidence order không merge và AIDLC DAG/preset/snapshot.
- **Validate**: Assert DAG, mutation boundary, recipe pruning, generated command,
  preset migration và old snapshot behavior.

### Task 10: Khai báo và review Markdown output quan trọng

- **Action**: Dùng explicit `produces`/`requires`. Planning gate review `PRD.md`,
  `PROTOTYPE.md`, `TECH-DESIGN.md`, `TEST-PLAN.md`. Delivery gate review
  `IMPLEMENT-SUMMARY.md`, `REVIEW.md`. Closing gate review `VERIFY.md`,
  `MEMORY-HANDOFF.md`, `IMPROVEMENT-PROPOSAL.md`. `RESEARCH.md`,
  `RED-EVIDENCE.md` và refactor evidence là durable input nhưng không thêm human
  interruption; QA gate tiếp tục review `TEST-CASES.md`, `TEST-REPORT.md`.
- **Mirror**: Existing `produces`/`requires` gate và ECC evidence handoff; không
  hard-code filename trong review service.
- **Validate**: Built-in tests/fixture tìm đúng file dưới configured Epic root;
  undeclared Markdown không lọt vào bundle.

### Task 11: Thêm ECC role, skill và artifact contract còn thiếu

- **Action**: Tạo project-native skill/template cho từng stage. Research dẫn
  source; RED có failing command; GREEN trỏ RED; refactor giữ test xanh; review
  có severity/location/conformance/security; verify có actual result/limit;
  remember/improve liên kết hash và không tự sửa policy.
- **Mirror**: AIDLC installer pattern và ECC TDD/review/verify/memory semantics.
- **Validate**: Structural tests kiểm tra generated asset; fake provider chạy
  trọn fixture workflow không skip/merge evidence.

### Task 12: Củng cố memory trước khi dùng làm ECC handoff

- **Action**: Version schema, gắn `unreviewed`, thêm source/evidence link, giới
  hạn recall, lọc secret-like shape và nêu rõ non-authoritative. Improvement
  proposal chờ human promotion; không tự ghi `AGENTS.md`, rule hoặc skill.
- **Mirror**: ECC Memory Vault trust/create-only/secret/promotion boundary.
- **Validate**: Test legacy memory, malformed field, secret, oversized recall,
  duplicate ID và việc recall không thể đổi policy.

### Task 13: Giữ provider, workspace và UI compatibility

- **Action**: Core provider-neutral; provider chỉ chạy sau `request_changes` và
  revision mới. Giữ customized asset, custom Epic root, freeform feedback, old
  YAML/RunState và artifacts-only Epic. Không phục hồi Idea UX patch đã revert.
- **Mirror**: Config-preserving installer, provider adapter, `artifactPaths`
  index và snapshot compatibility.
- **Validate**: Regression tests cho Claude/provider-managed, custom root, old
  workspace/run, artifact ngoài `artifacts/` và annotation reinstall.

### Task 14: Thực thi RED, GREEN, refactor, fresh review và final verification

- **Action**: Chỉ sau khi exact plan được duyệt: viết tests trước và lưu expected
  failure; implement vertical slice nhỏ nhất đến GREEN; refactor khi xanh;
  review toàn diff bằng fresh context; sửa finding kèm regression test; chạy
  final verification riêng.
- **Mirror**: ECC gate của repository và Vitest/temp-workspace pattern.
- **Validate**: Handoff giữ RED output, GREEN result, review
  finding/disposition và toàn bộ final command.

## Validation

```bash
pnpm --filter @aidlc/core test
pnpm --filter @aidlc/core build
pnpm --filter aidlc-o00ontcong test
pnpm --filter aidlc-o00ontcong compile
pnpm --filter aidlc-o00ontcong build:webview
pnpm --filter aidlc build
node --test vendor/annotron/test/review-verdict.test.mjs
pnpm package:extension
git diff --check
```

Manual verification dùng temporary workspace với extension và CLI:

1. Chạy workflow tới planning; mở mọi configured output trong Canvas; request
   changes một file; rerun; approve hash mới.
2. Chứng minh test-red chặn production change cho tới khi có failing result thực;
   sau đó đi qua GREEN và refactor.
3. Chạy fresh-context review, xử lý seeded finding, verify, tạo unreviewed memory
   handoff cùng improvement/no-promotion record, rồi approve closing bundle.
4. Sửa artifact sau approval và chứng minh gate thành stale, không advance.
5. Lặp lại với custom Epic root và declared Markdown ngoài `artifacts/`.
6. Load old snapshot không có `review` và chứng minh old flow vẫn hoạt động.
7. Kiểm tra Tasks UI hẹp/rộng, tiếng Việt/Anh, keyboard, screen reader, progress,
   stale, error và recovery.

Baseline trước implementation tại `9635275`:

- Core: 71 test files, 838 tests passing.
- Extension: 17 test files, 203 tests passing.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Canvas trở thành state machine thứ hai. | High | Core RunState là authoritative; Annotron chỉ lưu session/transport và trả verdict. |
| Stale tab approve nội dung đã đổi. | High | Bind verdict với run/revision/path/SHA-256; recompute và fail closed. |
| Plain/auto/provider approval bypass gate. | High | Enforce trong core; adapter chỉ surface required review action. |
| Formal Canvas sửa file khi approval. | High | Tắt edit/auto-apply/tool approval; request changes mở revision mới. |
| Multi-artifact gây partial approval mơ hồ. | Medium | Track riêng từng artifact; chỉ advance khi cùng revision approve mọi hash. |
| Output quan trọng không có declared path. | High | Khai báo `produces`/`requires` rõ và test generated workspace. |
| Default workflow chậm hoặc nhiều nhiễu. | Medium | Giữ DAG/recipe, evidence gọn; custom flow có thể bỏ stage nhưng không tự nhận ECC-compliant. |
| Preset mới đổi in-flight run. | Low | Immutable snapshot; thiếu `review` là legacy gate. |
| Annotron unavailable/stale. | Medium | Health check, versioned repair, resumable session; không bypass. |
| Memory trở thành executable policy. | High | Unreviewed label, bounded recall, secret screen, human promotion riêng. |
| Scope trượt sang toàn bộ ECC/AgentShield. | Medium | Giữ non-goal rõ; adapter là follow-up sau evidence contract. |

## Acceptance

- [ ] Repository có một ECC delivery contract và giữ managed AST-graph instructions.
- [ ] Built-in workflow có research, approval, RED, GREEN, refactor, fresh-review, verify, remember và improve tách biệt.
- [ ] Production mutation bị chặn tới khi planning artifacts có current human Canvas approval và RED evidence hợp lệ.
- [ ] RED/GREEN/refactor/verify evidence do AIDLC chạy, có timestamp, exit status, redacted output và tamper-evident log hash.
- [ ] Markdown-only claim không thể thỏa machine-evidence gate.
- [ ] Step chọn formal-review Markdown qua declared `produces`/`requires`.
- [ ] Old pipeline/snapshot không có `review` giữ behavior cũ.
- [ ] Canvas verdict typed, restartable, human-authored, content-addressed và atomically applied.
- [ ] Plain Approve, `--auto-approve`, provider mode, stale tab, arbitrary path và agent verdict không bypass gate.
- [ ] Multi-artifact step chỉ advance khi mọi current hash được approve trong cùng bundle revision.
- [ ] Request changes giữ annotation, reopen đúng step và reset downstream đúng semantics.
- [ ] Formal Canvas không edit Markdown, auto-run provider, approve tool hoặc dùng Done làm approval.
- [ ] Freeform Preview/Feedback vẫn có và khác rõ formal approval.
- [ ] Các planning, QA, implementation, review, verify, memory, improve output quan trọng đều declared/reviewable.
- [ ] Fresh-context review và final verify có durable evidence riêng.
- [ ] Epic memory được version, bounded, secret-screened, gắn unreviewed và không tự promote policy.
- [ ] Custom Epic root và declared Markdown ngoài `artifacts/` hoạt động mà không yếu path allow-list.
- [ ] Core, extension, CLI, generated asset, Annotron, package build và `git diff --check` pass.
- [ ] Browser walkthrough bao phủ hai verdict, multi-file, stale, restart, accessibility và song ngữ.
- [ ] RED trước implementation, GREEN sau implementation, review và final verification được ghi riêng.
- [ ] All tasks complete.
- [ ] Validation passes.
- [ ] Patterns mirrored, not reinvented.
