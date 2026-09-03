# Kế hoạch: nạp ticket sprint từ Jira vào AIDLC Workspace

> **Trạng thái: P0–P4 đã implement xong; P3 (ghi ngược trạng thái) sau đó đã gỡ** — xem §9 và §12.
> Còn lại là kiểm thử tay trên Jira site thật (§13).
>
> Wireframe kèm theo: [`docs/wireframes/jira-sprint-view.html`](wireframes/jira-sprint-view.html)
> Mẫu subtask: [`packages/core/templates/jira/subtask-template.yaml`](../packages/core/templates/jira/subtask-template.yaml)

## 1. Mục tiêu

Mở VS Code, bấm một tab, thấy đúng những ticket Jira đang assign cho mình trong sprint đang chạy,
chọn một cái là có ngay một AIDLC task với brief đã điền sẵn, và bộ subtask theo đúng mẫu của team
được tạo dưới ticket đó.

Ba quyết định đã chốt:

| Quyết định | Lựa chọn |
| --- | --- |
| Vị trí UI | Tab **Sprint** cấp cao mới trong `WorkspaceShell`, cạnh Project / Tasks |
| Kết nối | Jira Cloud REST + Agile API, API token lưu trong VS Code `SecretStorage` |
| Phạm vi ghi | Chỉ tạo subtask theo mẫu Confluence STT/Sub-task — AIDLC không tự đổi trạng thái ticket |

### Trong phạm vi

- Kết nối Jira Cloud (site + email + API token), kiểm tra kết nối, ngắt kết nối.
- Chọn board / sprint; mặc định lấy sprint đang `active`.
- Danh sách ticket của tôi (và toàn team qua toggle), filter theo status + theo “chưa có task”, tìm kiếm.
- Chi tiết ticket: description (ADF → markdown), acceptance criteria, labels, epic cha, points.
- Từ ticket tạo AIDLC task với id/title/description prefill, neo liên kết qua `inputs.jira`.
- Hiển thị ticket nào đã nối với task nào, và task đó đang ở bước mấy.
- Sửa cấu hình `aidlc.jira.*` ngay trong tab (dialog config), thay vì phải mở settings thô.
- **Tạo subtask theo mẫu** dưới ticket: đề xuất theo domain, preview, tick chọn, tạo hàng loạt.
- **Import mẫu từ Confluence** thành file YAML trong repo, có diff để review trước khi lưu.

### Ngoài phạm vi (lần này)

- **Đẩy trạng thái Jira theo tiến độ pipeline** — đã implement ở P3 rồi gỡ, xem §9.
- Jira Server / Data Center (chỉ nhắm Cloud).
- Comment kết quả pipeline lên ticket, tạo ticket cấp cao, log work, đổi assignee.
- Cập nhật lại subtask đã tạo từ artifact sinh ra sau đó (xem §14 — bước kế tiếp).
- Đồng bộ hai chiều liên tục (webhook, polling nền khi tab đóng).
- Nhiều Jira site cùng lúc trong một workspace.

## 2. Tại sao dùng REST thay vì đường MCP hiện có

`workspaceWebview.loadRequirementForWebview()` đã fetch được **một** issue Jira bằng cách spawn
`claude --print` và trông vào Atlassian MCP. Đường này không mở rộng được cho tính năng này, và
chính comment trong code đã nói lý do: headless `claude` chỉ thấy MCP server trong CLI config, chứ
không thấy claude.ai connector — nên hàm đó phải mang theo cả một mảng `refusalSignals` để đoán xem
model có đang xin lỗi thay vì trả dữ liệu hay không.

Với một danh sách 20–50 ticket cần status, points, assignee, thì:

- REST: một request, ~300–800 ms, JSON có schema, lỗi là HTTP status rõ ràng.
- MCP qua agent: vài chục giây, output là prose cần parse, và fail theo cách không phân biệt được
  “sprint rỗng” với “không đọc được Jira”.

Ghi subtask càng phải đi REST: tạo issue là thao tác có side effect, cần biết chính xác đã tạo cái
gì với key nào để không tạo trùng lần sau.

Đường MCP cũ **giữ nguyên**, không đụng tới — nó vẫn là cách nạp requirement ad-hoc cho một ticket lẻ.

## 3. Kiến trúc

```
┌───────────────────────── extension host ─────────────────────────┐
│  jiraCredentials.ts     context.secrets  ← API token             │
│  jiraSprintService.ts   fetch + cache (workspaceState) + refresh │
│  jiraSubtaskService.ts  plan → preview → bulk create → ledger    │
│         │  postMessage 'sprintState'          ▲ 'sprintRefresh'  │
└─────────┼──────────────────────────────────────┼─────────────────┘
          ▼                                      │
┌──────── webview (React) ─────────────────────────────────────────┐
│  SprintView.tsx → SprintTicketList / SprintTicketDetail          │
│  SubtaskPreviewPanel · JiraConnectModal · JiraConfigPanel        │
└──────────────────────────────────────────────────────────────────┘
          ▲
┌─────────┴──────── @aidlc/core (thuần, test được) ────────────────┐
│  JiraClient · sprintQuery · adfToMarkdown                        │
│  subtaskTemplate · subtaskPlanner · adfBuilder                   │
│  ConfluenceClient · templateImporter                             │
└──────────────────────────────────────────────────────────────────┘
```

Nguyên tắc: mọi thứ **thuần** (build JQL, parse issue, flatten ADF, resolve
template, sinh ADF subtask) nằm trong `@aidlc/core` và có unit test; extension host chỉ lo
credential, cache, message và VS Code UI. Không dependency mới — Node 20 đã có `fetch` toàn cục,
`js-yaml` và `zod` đã là dependency của core.

## 4. Cấu hình và bí mật

Thêm vào `contributes.configuration` của `packages/extension/package.json`:

| Key | Type | Default | Ý nghĩa |
| --- | --- | --- | --- |
| `aidlc.jira.site` | string | `""` | `silvertiger.atlassian.net` |
| `aidlc.jira.email` | string | `""` | email của account Atlassian |
| `aidlc.jira.projectKey` | string | `""` | để tự tìm board; bỏ trống thì dùng JQL |
| `aidlc.jira.boardId` | number | `0` | board đã chọn (0 = chưa chọn) |
| `aidlc.jira.jql` | string | `""` | override JQL, khi bỏ trống dùng mặc định ở §5 |
| `aidlc.jira.refreshMinutes` | number | `10` | tự làm mới khi tab Sprint đang mở |
| `aidlc.jira.requestTimeoutSeconds` | number | `20` | timeout mỗi request |
| `aidlc.jira.subtasks.enabled` | boolean | `false` | bật tạo subtask |
| `aidlc.jira.subtasks.templatePath` | string | `.aidlc/jira-subtask-template.yaml` | |
| `aidlc.jira.subtasks.confluencePageUrl` | string | `""` | nguồn để re-import mẫu |
| `aidlc.jira.subtasks.issueTypeName` | string | `"auto"` | `auto` = resolve từ createmeta |
| `aidlc.jira.subtasks.assignToMe` | boolean | `true` | |

Năm key giữa (`projectKey` → `requestTimeoutSeconds`) cùng `subtasks.enabled` sửa được ngay trong
dialog config của tab Sprint (§9). `site` / `email` chỉ đi qua dialog kết nối, vì chúng phải được
Jira xác thực cùng token. Phần `subtasks.*` còn lại nằm ở settings thô, mở từ chính dialog đó.

**API token không bao giờ nằm trong settings.** Lưu qua `context.secrets` với key
`aidlc.jira.apiToken`. `settings.json` bị commit và bị Settings Sync mang đi nơi khác; SecretStorage
thì không. Cùng token đó đọc được Confluence nếu account có quyền — không cần credential thứ hai.

Command mới:

- `aidlc.connectJira` — wizard command-palette (site / email / token tuần tự). Trong tab Sprint, nút
  “Kết nối Jira” mở **dialog một form** thay vì wizard này; cả hai đi chung
  `verifyAndStoreJiraCredentials()`, nên chỉ một chỗ quyết định thế nào là “đã kết nối”.
- `aidlc.disconnectJira` — xoá secret, xoá cache.
- `aidlc.testJiraConnection` — in kết quả vào Output channel (site, account, số sprint active).
- `aidlc.openSprintView`, `aidlc.refreshSprint`.
- `aidlc.importJiraSubtaskTemplate` — kéo trang Confluence → sinh YAML nháp → mở diff để review.
- `aidlc.openJiraSubtaskTemplate` — mở file mẫu (tự scaffold từ bản ship kèm nếu chưa có).

Panel preview subtask không có command riêng: nó mở từ nút **Subtask…** trong action bar của ticket,
nơi đã có sẵn ngữ cảnh ticket nào đang được chọn.

## 5. Hợp đồng với Jira / Confluence API

Auth: `Authorization: Basic base64(email:apiToken)`, `Accept: application/json`.

### Đọc

| Việc | Endpoint |
| --- | --- |
| Xác thực + lấy accountId | `GET /rest/api/3/myself` |
| Liệt kê board | `GET /rest/agile/1.0/board?type=scrum&projectKeyOrId={key}` |
| Sprint của board | `GET /rest/agile/1.0/board/{boardId}/sprint?state=active,future` |
| Issue trong sprint | `GET /rest/agile/1.0/sprint/{sprintId}/issue?fields=…&maxResults=100` |
| Không có board | `POST /rest/api/3/search/jql` (endpoint phân trang mới, thay cho `GET /rest/api/3/search` đã deprecate) |
| Resolve field points | `GET /rest/api/3/field` → tìm name `Story Points` / `Story point estimate` |
| Metadata tạo issue | `GET /rest/api/3/issue/createmeta/{projectIdOrKey}/issuetypes` |
| Trang mẫu Confluence | `GET /wiki/api/v2/pages/{id}?body-format=storage` |

### Ghi

| Việc | Endpoint |
| --- | --- |
| Tạo nhiều subtask | `POST /rest/api/3/issue/bulk` body `{"issueUpdates":[…]}` (tối đa 50) |
| Tạo một subtask | `POST /rest/api/3/issue` |

JQL mặc định:

```
assignee = currentUser() AND sprint IN openSprints() ORDER BY status ASC, priority DESC
```

Toggle “Cả team” bỏ mệnh đề `assignee`, và đánh dấu `isMine` phía client theo `accountId`.

`fields` yêu cầu khi đọc: `summary,description,status,issuetype,priority,assignee,labels,parent,subtasks,updated`
cộng id custom field của story points (khác nhau theo site, nên phải resolve rồi cache — thường là
`customfield_10016` nhưng **không được hardcode**).

Năm chi tiết dễ vỡ, phải xử lý ngay từ đầu:

1. **Description là ADF**, không phải text. API v3 trả `{"type":"doc","version":1,"content":[…]}`.
   Cần `adfToMarkdown()` trong core, vì text này chảy thẳng vào brief của task. Phạm vi node cần hỗ trợ:
   `paragraph`, `text` + marks (`strong`/`em`/`code`/`link`), `heading`, `bulletList`/`orderedList`/
   `listItem`, `taskList`/`taskItem`, `codeBlock`, `blockquote`, `hardBreak`, `rule`, `table` (cơ bản),
   `mention` → `@tên`, `emoji` → text, `media*` → placeholder `[ảnh]`. Node lạ thì đệ quy vào
   `content` và lấy text, không throw.
2. **Ghi description cũng phải là ADF.** Không dùng bộ chuyển markdown → ADF tổng quát; mẫu subtask
   là cấu trúc đóng (§6) nên `adfBuilder` sinh trực tiếp từ model của mẫu. Đổi lại được một thứ đáng
   giá: mục Checklist ra `taskList`/`taskItem`, tức **checkbox thật** trên Jira, không phải mấy dòng
   `- [ ]` dạng text.
3. **Issue type của subtask khác nhau theo site** (`Sub-task` / `Subtask` / `Sub-Task`). Resolve từ
   `createmeta`, lấy entry có `subtask === true`; nhiều hơn một thì lấy theo config.
4. **Field bắt buộc theo project.** `createmeta` cho biết field nào `required` mà không có default.
   Thiếu thì **chặn trước khi gọi API** và liệt kê ra, thay vì để Jira trả 400 rồi đoán.
5. **429.** Jira Cloud giới hạn theo cost và trả `Retry-After`. `JiraClient` retry tối đa 2 lần với
   backoff theo header đó, rồi mới báo lỗi.

## 6. Mẫu subtask

Trang Confluence STT/Sub-task là văn bản cho người đọc: nó quy định tiêu đề có prefix domain, thân
gồm 5 mục, và cho một khối copy-paste. Nó không phải thứ máy đọc được, và cũng không nên fetch mỗi
lần tạo subtask — cấu trúc trang wiki thì lỏng, còn tạo issue thì phải xác định.

Nên: **import một lần thành YAML trong repo, commit, và tạo subtask từ file đó.**

Bản mặc định ship kèm extension nằm ở
[`packages/core/templates/jira/subtask-template.yaml`](../packages/core/templates/jira/subtask-template.yaml),
được scaffold vào project của người dùng tại `.aidlc/jira-subtask-template.yaml` (cạnh
`workspace.yaml`). Ba thứ nó mã hoá:

**Taxonomy tiêu đề** — `[{{domain}}] {{what}}`, `domain` lấy nguyên 6 giá trị của trang:
Documentation · Frontend · Backend · Infra · Code review · Testing.

**Cấu trúc thân** — đúng thứ tự khối copy-paste, mỗi mục có `kind` quyết định node ADF:

| Mục | Heading | `kind` | AIDLC điền từ |
| --- | --- | --- | --- |
| description | `🔧 Description` | `prose` | description của ticket, rồi của task |
| completionCriteria | `✅ Completion Criteria` | `bulletList` | AC của ticket, rồi `produces_contains` của step |
| checklist | `📋 Checklist` | `taskList` | tên các step trong pipeline |
| parentTask | `🔗 Parent Task` | `bulletList` | `{{parent.key}}` |
| labels | `🏷️ Labels` | `inlineCode` | label của ticket + `aidlc` |

`---` giữa các mục → ADF `rule`.

**Đề xuất subtask nào** — theo **domain**, không theo từng step. Taxonomy của trang là theo domain,
và một subtask cho mỗi step trong 7 step của `aidlc-workflow` sẽ ra một ticket đầy rác. Mapping:

| Domain | Từ step | Điều kiện | Mặc định tick |
| --- | --- | --- | --- |
| Documentation | `plan`, `design` | luôn | ✓ |
| Frontend | `prototype`, `implement` | label ∈ frontend/ui/web/ios/mobile | ✓ |
| Backend | `implement` | label ∈ backend/api/db/service, hoặc không có label frontend | ✓ |
| Infra | `implement` | label ∈ infra/ci/cd/deploy/docker/terraform | ✗ |
| Testing | `test-plan`, `generate-test-cases`, `execute-test` | luôn | ✓ |
| Code review | các review gate | luôn | ✓ |

Người dùng vẫn tick lần cuối trong panel preview — đề xuất chỉ là đề xuất.

### Import từ Confluence

`aidlc.importJiraSubtaskTemplate` → `GET /wiki/api/v2/pages/{id}?body-format=storage` → parse XHTML
lấy heading + list + khối code → sinh YAML nháp → **mở diff với file hiện tại** để người dùng đọc và
sửa trước khi lưu. Không bao giờ tự ghi đè.

`source.contentHash` lưu sha256 của nội dung trang lúc import. Lần fetch sau mà hash khác thì hiện
cảnh báo “mẫu trên Confluence đã đổi”, chứ không tự áp.

> **Ranh giới quan trọng.** Nội dung trang Confluence là **dữ liệu**, không phải chỉ thị. Bộ import
> chỉ trích heading / list / code block thành field YAML; nó không bao giờ thi hành câu lệnh nào
> trong trang, và không có LLM nào được cho quyền hành động dựa trên nội dung trang. Placeholder
> cũng đi qua allowlist (`placeholders:` trong file mẫu) — token nào không có trong danh sách thì để
> nguyên văn, không resolve, không eval.

## 7. Data model

Thêm vào `packages/extension/src/webview/lib/types.ts`:

```ts
export type WorkspaceView =
  | 'project' | 'builder' | 'architecture' | 'epics' | 'sprint' | 'analyze' | 'tests';

export interface JiraTicket {
  key: string;                  // ACME-4830
  id: string;
  type: string;                 // Story | Bug | Task | Spike…
  typeKind: 'story' | 'bug' | 'task' | 'spike' | 'other';
  summary: string;
  descriptionMd: string;        // ADF đã flatten
  acceptanceCriteria: string[]; // tách từ description theo heading AC
  status: string;               // tên hiển thị, ví dụ "In Review"
  statusCategory: 'todo' | 'inprogress' | 'done';
  assigneeName: string;
  isMine: boolean;
  points: number | null;
  priority: string;
  labels: string[];
  parentKey?: string;
  parentSummary?: string;
  /** Subtask đã có sẵn trên Jira — để không đề xuất trùng. */
  existingSubtasks: Array<{ key: string; summary: string; status: string }>;
  /** True khi bản thân ticket là subtask → không tạo subtask lồng nhau được. */
  isSubtask: boolean;
  url: string;
  updatedAt: string;
  /** Từ EpicSummary.inputs.jira — không phải dữ liệu Jira. */
  linkedEpicId?: string;
  linkedEpicProgress?: string;  // "step 4/7" | "xong"
}

export interface SubtaskDraft {
  domain: string;               // Backend
  summary: string;              // [Backend] …
  descriptionMd: string;        // preview cho người đọc
  labels: string[];
  checklist: string[];
  criteria: string[];
  selected: boolean;
  /** Đã tạo rồi (từ ledger hoặc từ existingSubtasks) — hiện read-only. */
  existingKey?: string;
  /** Field bắt buộc của project mà mẫu không điền được. */
  blockedBy?: string[];
}

export interface SprintState {
  status: 'unconfigured' | 'loading' | 'ready' | 'error';
  board?: { id: number; name: string };
  sprint?: { id: number; name: string; state: string; startDate?: string; endDate?: string };
  boards: Array<{ id: number; name: string }>;
  sprints: Array<{ id: number; name: string; state: string }>;
  tickets: JiraTicket[];
  /** 'auth' | 'forbidden' | 'not_found' | 'timeout' | 'rate_limited' | 'unknown' */
  errorKind?: string;
  errorMessage?: string;
  lastSyncedAt?: string;
  fromCache?: boolean;
  subtasksEnabled: boolean;
  /** Nửa sửa được của `aidlc.jira.*`, để dialog config render không cần round trip. */
  config: {
    projectKey: string; boardId: number; jql: string;
    refreshMinutes: number; requestTimeoutSeconds: number;
  };
  /** Cảnh báo khi mẫu Confluence đã đổi so với contentHash đã lưu. */
  templateStale?: boolean;
}
```

`WorkspaceState` nhận thêm `sprint?: SprintState`.

### Liên kết và sổ ghi

**Liên kết ticket ↔ task**: không cần store mới. `scaffoldEpic()` đã ghi `inputs` xuống
`docs/epics/<ID>/inputs.json`, và `EpicSummary.inputs` đã được đọc lên webview
(`packages/extension/src/webview/lib/types.ts:639`). Đặt `inputs.jira = "ACME-4830"` là đủ:

- Badge liên kết trong Sprint view = join `tickets[].key` với `epics[].inputs.jira`.
- `jiraSubtaskService` tìm ticket key của một epic bằng cách đọc `inputs.json` của epic đó.

`demoProject.ts` vốn đã ghi `jira:` vào `inputs.json`, nên quy ước này không phải phát minh mới.

**Sổ ghi thao tác Jira**: file sidecar mới `docs/epics/<ID>/jira.json`. `inputs.json` mang nghĩa
“capability input lúc bắt đầu”, không phải nhật ký đồng bộ — đừng trộn hai thứ.

```json
{
  "site": "silvertiger.atlassian.net",
  "ticket": "ACME-4830",
  "sprintId": 24,
  "subtasks": [
    { "domain": "Backend", "key": "ACME-4855", "createdAt": "2026-08-22T09:14:02Z",
      "templateHash": "sha256:…" }
  ]
}
```

File này làm hai việc: chống tạo trùng (đã có `domain` trong `subtasks` thì không đề xuất lại) và
làm vết kiểm tra được commit cùng epic.

## 8. Message protocol

Webview → host (thêm `case` vào `workspaceWebview.handleMessage`):

| Message | Payload |
| --- | --- |
| `sprintRefresh` | `{ force?: boolean }` |
| `sprintSelectBoard` / `sprintSelectSprint` | `{ boardId }` / `{ sprintId }` |
| `sprintSetScope` | `{ scope: 'mine' \| 'team' }` |
| `sprintConnect` / `sprintDisconnect` | — |
| `sprintStartTask` | `{ key: string }` |
| `sprintOpenInJira` | `{ key: string }` |
| `sprintOpenLinkedTask` | `{ epicId: string }` |
| `sprintPlanSubtasks` | `{ key: string }` → host trả `subtaskDrafts` |
| `sprintCreateSubtasks` | `{ key: string, drafts: SubtaskDraft[] }` |
| `sprintImportTemplate` | — |
| `sprintSetConfig` | `{ config: { projectKey?, boardId?, jql?, refreshMinutes?, requestTimeoutSeconds?, subtasksEnabled? } }` — chỉ field đã đổi |
| `sprintOpenSettings` | — (mở settings thô `aidlc.jira`) |

Host → webview:

| Message | Ý nghĩa |
| --- | --- |
| `sprintState` | toàn bộ `SprintState` (kể cả trạng thái lỗi) |
| `subtaskDrafts` | `{ key, drafts: SubtaskDraft[] }` |
| `subtaskCreateResult` | `{ key, created: […], failed: [{ domain, message }] }` |
| `openStartEpicModal` | đã có sẵn; mở rộng thêm `prefill: { epicId, title, description, inputs }` |

`sprintStartTask` không tạo task ngay — nó chỉ mở `StartEpicModal` đã prefill. `sprintCreateSubtasks`
cũng không tự chạy: nó là kết quả của một lần bấm trong panel preview.

## 9. Cấu hình Jira ngay trong tab (thay cho ghi ngược trạng thái)

Ghi ngược trạng thái **đã gỡ**. Nó từng là P3 (§12) với bảng mapping event → status, hook một dòng
trong `saveRun()`, và ledger `transitions[]` trong `jira.json`. Lý do gỡ: đó là đường ghi tự động
duy nhất lên board của cả team — mọi thứ quanh nó (mặc định tắt, hỏi trước, không lùi trạng thái,
Done luôn hỏi, ledger chống double-fire) tồn tại chỉ để làm cho một hành vi tự động trở nên an toàn,
và cái giá đó không xứng với việc tự tay kéo ticket. AIDLC giờ **không tự đổi trạng thái ticket**;
đường ghi duy nhất còn lại là tạo subtask, có preview và mặc định tắt.

Đúng dialog cũ (mở từ “Jira settings” trong header, và từ chỉ thị ở footer chi tiết ticket) giờ hiện
chính khối `aidlc.jira.*` để sửa tại chỗ. Có nó vì tab Sprint là nơi một giá trị sai lộ ra: danh
sách rỗng thường là `boardId`, `projectKey` hoặc `jql`, mà `settings.json` không nói được là cái nào.

Hai nửa, cố ý khác nhau:

- **Credential** (site · email · token) chỉ đọc ở đây, sửa qua dialog kết nối — ba giá trị đó chỉ có
  nghĩa khi được xác thực cùng nhau, và `verifyAndStoreJiraCredentials()` là chỗ duy nhất chạm vào
  token. Token không bao giờ được đọc ra để hiển thị.
- **Cấu hình thường** (`projectKey` · `boardId` · `jql` · `refreshMinutes` ·
  `requestTimeoutSeconds` · `subtasks.enabled`) sửa cục bộ trong form, ghi khi bấm **Lưu**.

Ba quyết định:

1. **Ghi theo Save, không theo từng ký tự.** Mỗi `config.update` bắn config watcher trong
   `extension.ts`, và watcher đó force refresh sprint — ghi theo keystroke là một request Jira cho
   mỗi ký tự. Lưu xong thì đóng dialog, vì refresh sẽ đẩy về đúng state vừa gửi.
2. **Chỉ gửi field đã đổi.** `.vscode/settings.json` nhận đúng key người dùng sửa, không bị đổ cả
   khối mặc định vào.
3. **Scope Workspace.** Repo này đọc project / board nào là thuộc tính của repo, không của máy —
   cùng scope mà site/email đang dùng. Chưa mở folder thì `config.update` throw, và host báo lỗi
   thay vì để dialog trông như đã lưu.

## 10. Tạo subtask

Luồng, ba bước, không bước nào tự chạy:

```
plan                          preview                        create
────                          ───────                        ──────
ticket + pipeline + mẫu   →   panel: 4-6 draft, tick chọn,  →  POST /issue/bulk
+ jira.json (đã tạo gì)       sửa được summary/criteria       → ghi jira.json
+ createmeta (field bắt buộc)  → cảnh báo field thiếu          → toast + link từng key
```

**Bước plan** (`subtaskPlanner`, thuần, test được):

1. Đọc mẫu; hash không khớp `source.contentHash` → set `templateStale`, vẫn chạy.
2. Với mỗi entry trong `plan:` — xét `when` theo label của ticket → được chọn hay không.
3. Bỏ những domain đã có trong `jira.json.subtasks`, và những domain khớp
   `ticket.existingSubtasks` theo prefix `[Domain]` (người khác đã tạo tay).
4. Resolve placeholder qua allowlist → `summary`, `checklist`, `criteria`, `labels`.
5. Đối chiếu `createmeta`: field bắt buộc nào mẫu không điền được → `blockedBy`, draft hiện disabled
   kèm lý do, thay vì để Jira trả 400.

**Bước create**: `POST /rest/api/3/issue/bulk`, tối đa 50 issue một lần. Bulk trả lỗi **theo từng
index** — phải map ngược về draft và hiện “3 tạo được, 1 lỗi: field X bắt buộc”, chứ không phải một
thông báo lỗi chung. Tạo được cái nào thì ghi ngay cái đó vào `jira.json`, để lần retry không tạo trùng.

Hai chặn cứng:

- Ticket đang chọn `isSubtask === true` → không cho tạo (Jira không cho subtask lồng nhau), hiện lý do.
- `aidlc.jira.subtasks.enabled === false` (mặc định) → panel hiện nhưng nút create tắt, kèm link bật.

## 11. Danh sách file

### Thêm mới

| File | Nội dung |
| --- | --- |
| `packages/core/src/integrations/jira/JiraClient.ts` | fetch có auth, timeout, retry 429, map HTTP → `errorKind` |
| `packages/core/src/integrations/jira/JiraTypes.ts` | kiểu raw API + kiểu đã chuẩn hoá |
| `packages/core/src/integrations/jira/adfToMarkdown.ts` | flatten ADF (đọc) |
| `packages/core/src/integrations/jira/adfBuilder.ts` | sinh ADF từ model mẫu (ghi), có `taskList` |
| `packages/core/src/integrations/jira/sprintQuery.ts` | build JQL, chọn `fields`, resolve field points, parse issue |
| `packages/core/src/integrations/jira/subtaskTemplate.ts` | schema zod + load/validate + resolve placeholder |
| `packages/core/src/integrations/jira/subtaskPlanner.ts` | ticket + pipeline + ledger → `SubtaskDraft[]` |
| `packages/core/src/integrations/jira/createMeta.ts` | resolve issue type subtask + field bắt buộc |
| `packages/core/src/integrations/jira/subtaskPayload.ts` | build payload create issue + normalize label |
| `packages/core/src/integrations/confluence/ConfluenceClient.ts` | đọc trang v2 API |
| `packages/core/src/integrations/confluence/templateImporter.ts` | XHTML storage → YAML nháp |
| `packages/core/templates/jira/subtask-template.yaml` | **đã tạo** — mẫu mặc định |
| `packages/core/test/jira-adf.test.ts` | ADF đọc: mọi loại node + node lạ |
| `packages/core/test/jira-adf-builder.test.ts` | ADF ghi: 5 mục, `taskList`, `rule` |
| `packages/core/test/jira-sprint-query.test.ts` | JQL, parse issue, points field, sprint rỗng |
| `packages/core/test/jira-subtask-template.test.ts` | schema, placeholder allowlist, hash |
| `packages/core/test/jira-subtask-planner.test.ts` | `when` theo label, dedupe, `blockedBy` |
| `packages/core/test/confluence-template-import.test.ts` | parse trang STT/Sub-task thật (fixture) |
| `packages/extension/src/v2/jiraCredentials.ts` | SecretStorage + wizard connect/disconnect/test |
| `packages/extension/src/v2/jiraSprintService.ts` | fetch, cache `workspaceState`, auto-refresh |
| `packages/extension/src/v2/jiraSprintLogic.ts` | logic thuần Sprint view (config, cache, linkage) |
| `packages/extension/src/v2/jiraLedger.ts` | logic thuần của ledger `jira.json` |
| `packages/extension/src/v2/jiraSubtaskLogic.ts` | logic thuần subtask (steps, guard chọn draft) |
| `packages/extension/src/v2/jiraSubtaskService.ts` | plan / create / ledger `jira.json` (§10) |
| `packages/extension/src/v2/jiraTemplateImport.ts` | command import mẫu từ Confluence + diff |
| `packages/extension/src/webview/components/SprintView.tsx` | khung 2 cột + header + filter |
| `packages/extension/src/webview/components/sprint/SprintTicketList.tsx` | nhóm + row |
| `packages/extension/src/webview/components/sprint/SprintTicketDetail.tsx` | chi tiết + action bar |
| `packages/extension/src/webview/components/sprint/SubtaskPreviewPanel.tsx` | draft + tick + cảnh báo |
| `packages/extension/src/webview/components/sprint/SprintEmptyStates.tsx` | 4 trạng thái ở §C wireframe |
| `packages/extension/src/webview/components/sprint/JiraConnectModal.tsx` | dialog kết nối một form, lỗi hiện tại chỗ |
| `packages/extension/src/webview/components/sprint/JiraConfigPanel.tsx` | dialog cấu hình `aidlc.jira.*` (§9) |

### Sửa

| File | Thay đổi |
| --- | --- |
| `packages/extension/package.json` | 12 config key + 7 command + menu |
| `packages/extension/src/extension.ts` | đăng ký command, truyền `context.secrets` xuống webview |
| `packages/extension/src/webview/lib/types.ts` | `WorkspaceView += 'sprint'`, `JiraTicket`, `SubtaskDraft`, `SprintState` |
| `packages/extension/src/webview/components/WorkspaceShell.tsx` | pill Sprint + route + `prefill` cho StartEpicModal |
| `packages/extension/src/webview/components/StartEpicModal.tsx` | prop `prefill?` + khối “subtask sẽ tạo” |
| `packages/extension/src/v2/workspaceWebview.ts` | 12 `case` mới + push `sprint` vào state |
| `packages/core/src/index.ts` | export module jira + confluence |
| `packages/extension/templates/jira/subtask-template.yaml` | mirror bản core (theo pattern sẵn có) |

## 12. Phase

Mỗi phase tự đứng được và có thể merge riêng.

### P0 — nền, chưa có UI ✅ **xong**

Toàn bộ tầng `@aidlc/core` đã có và có test. 11 module + 8 file test, **297 test**, `tsc --noEmit`
sạch, và cả suite của core vẫn xanh (810 test / 68 file).

| Module | Test |
| --- | --- |
| `integrations/jira/JiraTypes.ts` | — (chỉ kiểu) |
| `integrations/jira/JiraClient.ts` | `jira-client.test.ts` (56) |
| `integrations/jira/adfToMarkdown.ts` | `jira-adf.test.ts` (41) |
| `integrations/jira/adfBuilder.ts` | `jira-adf-builder.test.ts` (19) |
| `integrations/jira/sprintQuery.ts` | `jira-sprint-query.test.ts` (54) |
| `integrations/jira/createMeta.ts` | `jira-create-meta.test.ts` (20) |
| `integrations/jira/subtaskTemplate.ts` | `jira-subtask-template.test.ts` (42) |
| `integrations/jira/subtaskPlanner.ts` | `jira-subtask-planner.test.ts` (30) |
| `integrations/confluence/ConfluenceClient.ts` | `confluence-template-import.test.ts` (41) |
| `integrations/confluence/templateImporter.ts` | ↑ cùng file, có fixture trang thật |

Ba điểm đáng ghi lại từ lúc code:

- **`normalizeSite` từng bịa ra host.** `new URL()` biến `http://` thành origin `https://http`, và
  lỗi đó sẽ hiện ra sau đó dưới dạng DNS/404 khiến người dùng đi tìm vấn đề permission không tồn tại.
  Giờ hostname phải có dấu chấm (hoặc là `localhost`), sai thì trả '' ngay tại chỗ còn nói được
  "đây không phải site".
- **Parser XHTML của Confluence phải cân bằng tag.** Regex non-greedy `<li>…</li>` dừng ở thẻ đóng
  của item lồng đầu tiên, nên domain đầu ra thành `"Prefix with the domain: Documentation"`. Phải
  viết scanner theo độ sâu (`balancedBlocks` / `allBlocks`), và bỏ subtree lồng trước khi lấy direct
  item.
- **Preview và payload dùng một model.** `buildSubtaskAdf()` và `renderSubtaskMarkdown()` nhận cùng
  `RenderedSection[]`, nên bản preview người dùng bấm đồng ý không thể lệch với cái được ghi lên
  Jira. Có test khoá bất biến này.

### P1 — Sprint view read-only ✅ **xong**

Tab Sprint chạy end-to-end: credentials, service, UI, và cả phần prefill của P2 (vì không có nó thì
nút chính của tab không dẫn tới đâu). 5 command, 17 config key, **56 test host mới**, cả hai
`tsc --noEmit` sạch, webview bundle build được.

| File | Vai trò |
| --- | --- |
| `src/v2/jiraSprintLogic.ts` | logic thuần: config, cache key, linkage, gom nhóm, error → banner |
| `src/v2/jiraCredentials.ts` | SecretStorage + wizard connect / disconnect / test |
| `src/v2/jiraSprintService.ts` | fetch, cache `workspaceState`, in-flight token, push `sprintState` |
| `src/webview/components/SprintView.tsx` | header sprint/board, filter bar, điều phối |
| `src/webview/components/sprint/SprintTicketList.tsx` | nhóm + row + badge liên kết |
| `src/webview/components/sprint/SprintTicketDetail.tsx` | chi tiết + action bar |
| `src/webview/components/sprint/SprintEmptyStates.tsx` | unconfigured · loading · error · empty · no-sprint |
| `test/jiraSprintLogic.test.ts` | 56 test |

Sửa: `WorkspaceShell.tsx` (pill + route + `sprintState`/`selectEpic`/prefill), `StartEpicModal.tsx`
(prop `prefill`), `workspaceWebview.ts` (8 case + `state.sprint` + attach/detach),
`workspaceUiPrefs.ts` + `types.ts` (`WorkspaceView += 'sprint'`), `extension.ts` + `package.json`.

Năm quyết định đáng ghi lại:

- **Tab Sprint sống trên cả project chưa có `workspace.yaml` và cả khi chưa mở folder.** Đọc Jira chỉ
  cần credentials. Nhánh `sprint` vì thế nằm *trên* cổng `configExists`; yêu cầu workspace vẫn xuất
  hiện đúng lúc — trong `StartEpicModal`.
- **`snapshot()` đồng bộ, coi cache là bằng chứng đã từng có credentials.** SecretStorage là async nên
  không đọc được token trong lúc build state; nếu không giả định như vậy thì mỗi lần mở panel người
  đã kết nối vẫn thấy nhoáng lên empty state “chưa kết nối”.
- **Fetch mang token, reply cũ bị bỏ.** Bấm qua vài sprint là có vài fetch chồng nhau; không có token
  thì cái chậm nhất về sau cùng sẽ ghi đè cái người dùng đang xem.
- **Cache key gồm mọi thứ làm đổi tập kết quả** (site, email, board, JQL, scope, sprint). Lệch key =
  coi như không có cache, nên ticket của query cũ không bao giờ hiện dưới nhãn query mới.
- **Cache thì đọc được nhưng không hành động được.** Khi lỗi, banner hiện trên danh sách cache và nút
  “Start task in AIDLC” bị vô hiệu — tạo task từ ticket chưa xác minh lại là cách tạo task cho một
  ticket người khác đã đóng.

Một điều chỉnh ngoài kế hoạch: `StartEpicModal` có effect tự phân tích khi task id trông giống Jira
key, và nó sẽ nạp lại ticket qua đường MCP chậm. Đã chặn khi key đến từ prefill — Sprint tab vừa lấy
ticket đó qua REST rồi.

*Xong khi:* ✅ mở tab thấy đúng ticket của mình trong sprint đang chạy · ✅ 401/403/404/timeout ra
banner + gợi ý khắc phục khác nhau · ✅ mở lại tab hiện cache tức thì rồi mới revalidate · ✅ không có
token thì thấy empty state liệt kê thứ còn thiếu, không phải lỗi.

### P2 — liên kết và prefill ◐ **phần lớn xong**

Đã có: badge liên kết (join `inputs.jira`), filter “chưa có task”, `Start task in AIDLC` →
`StartEpicModal` prefill (id/title/brief/`inputs.jira`), click badge nhảy sang task.

Còn: kiểm tra tay rằng `docs/epics/<ID>/inputs.json` có `"jira": "<KEY>"` sau khi tạo task, và badge
xuất hiện mà không cần refresh Jira.

### P3 — ghi ngược trạng thái ⛔ **đã ship rồi gỡ**

Từng có: `jiraStatusSyncLogic.ts` (thuần, 38 test), `jiraStatusSync.ts` (vscode),
`JiraTransitionMapPanel.tsx`, hook một dòng trong `saveRun()`, và mảng `transitions[]` trong
`docs/epics/<ID>/jira.json`.

Đã gỡ hết: hai file trên, panel mapping, sáu key `aidlc.jira.transitions.*`, `transitions.ts` của
core cùng test của nó, và ba call site `onRunStateSaved` (saveRun, epic wizard, “Start pipeline
run”). `JiraClient` bỏ luôn `transitions()` / `transitionIssue()` / `issue()` — cả ba chỉ tồn tại
cho đường ghi này. `jiraStatusSyncLogic.ts` đổi tên thành `jiraLedger.ts` và chỉ còn phần subtask,
vì đó là thứ duy nhất còn ghi vào `jira.json`.

Hai điều đáng giữ lại từ lần này:

- **Cả bộ luật an toàn là dấu hiệu, không phải thành tựu.** Mặc định tắt, hỏi trước mỗi lần, không
  lùi trạng thái, Done luôn hỏi, ledger chống double-fire — năm luật cho *một* hành vi tự động.
  Khi hàng rào nhiều hơn tính năng thì chính tính năng đó là chỗ nên xem lại.
- **Ledger vẫn đúng chỗ.** `jira.json` sinh ra cho write-back nhưng có giá trị độc lập: nó là thứ
  chặn tạo trùng subtask. Gỡ write-back không cần gỡ ledger, chỉ cần thu hẹp nó.

Chỗ dialog đó giờ là **dialog cấu hình Jira** (§9).

### P4 — subtask theo mẫu ✅ **xong**

`subtaskPayload.ts` (core, 14 test), `jiraSubtaskLogic.ts` (thuần, 27 test), `jiraSubtaskService.ts`,
`SubtaskPreviewPanel.tsx`, `jiraTemplateImport.ts`, 2 command. Core 824 test xanh, extension 187 test
xanh, cả hai typecheck sạch, `pnpm compile` chạy được.

Bốn quyết định đáng ghi lại:

- **Webview không bao giờ là nguồn của cái được ghi lên Jira.** Panel chỉ gửi lại *domain nào được
  tick*; nội dung được plan lại phía host từ mẫu rồi mới build payload. `selectableDrafts()` chặn ba
  thứ cùng lúc: domain chưa tick, domain đã có trên Jira, và draft bị block — cố ý không tin
  `draft.selected` từ webview, vì nó chỉ là đề xuất của planner và lệch ngay khi người dùng bỏ tick.
- **Strip prefix `aidlc-` khi đọc pipeline.** Pipeline trong `workspace.yaml` tham chiếu *agent*
  (`aidlc-developer`), còn `fromSteps` của mẫu đặt theo *phase* (`implement`). Không strip thì không
  step nào khớp và mọi checklist ra rỗng.
- **Ghi ledger theo từng element, không đợi hết batch.** `POST /issue/bulk` thành công một phần; ghi
  ledger chỉ khi cả batch xong sẽ khiến lần retry tạo trùng những cái đã landed.
- **Import mở diff, không tự áp.** Fetch trang → merge → `vscode.diff` → người dùng sửa được ngay
  trong diff → validate lại bản cuối trước khi lưu. Trang wiki là văn bản của người; mẫu là cấu hình
  máy đọc.

Hai chỗ lệch nhẹ so với wireframe, đều là để dùng thật cho tiện:

- Panel mở từ nút **Subtask…** trong action bar của ticket (bị vô hiệu khi ticket là subtask hoặc
  danh sách đang là cache), không chỉ từ modal tạo task.
- Mẫu được **scaffold vào `.aidlc/jira-subtask-template.yaml` ngay lần dùng đầu** từ bản ship kèm
  extension, nên tính năng chạy được trước khi có ai sửa gì.

*Xong khi:* ✅ chọn ticket → panel hiện draft đúng taxonomy `[Domain] …`, tick sẵn theo mapping §6 ·
✅ mỗi draft xem trước được 5 mục, Checklist hiện là checkbox · ✅ ledger chặn tạo trùng · ✅ field bắt
buộc lạ → draft disable kèm tên field, không có 400 lọt ra · ✅ ticket là subtask → chặn với lý do rõ ·
✅ import kéo trang ra YAML nháp và mở diff, không tự ghi. Còn cần thử tay trên site thật: bấm tạo và
xem subtask hiện lên Jira.

## 13. Test

- **Unit (core, vitest).** ADF đọc: từng loại node + node lạ. ADF ghi: 5 mục, `taskList`, `rule`,
  inline code cho labels. Build JQL theo scope/board/override. Parse issue thiếu field
  (`description: null`, không assignee, không points). Resolve field points khi site đặt tên khác.
  Map HTTP status → `errorKind`. Template:
  schema hợp lệ / thiếu field / placeholder ngoài allowlist. Planner: `when` theo label, dedupe theo
  ledger và theo `existingSubtasks`, `blockedBy` từ createmeta. Importer: parse fixture chính là
  trang STT/Sub-task.
- **Host.** `jiraSprintService` với `fetch` bị stub: cache hit/miss, TTL, huỷ request đang bay khi
  đổi sprint. `jiraSubtaskService`: bulk trả lỗi từng index → ghi ledger đúng phần đã tạo.
- **Tay, trên Jira site thật.** Site có board scrum + sprint active; site không có board (JQL path);
  token bị thu hồi giữa phiên; sprint 50+ ticket (phân trang); project có field bắt buộc custom;
  ticket vốn đã có subtask tạo tay.

## 14. Rủi ro

| Rủi ro | Giảm thiểu |
| --- | --- |
| Custom field points khác nhau theo site | Resolve qua `/rest/api/3/field` rồi cache; không hardcode |
| Issue type subtask khác tên theo site | Resolve từ `createmeta` theo `subtask === true` |
| Field bắt buộc của project làm create fail | Đối chiếu `createmeta` trước, chặn ở UI kèm tên field |
| Tạo subtask trùng khi bấm lại / rerun | Ledger `jira.json` + đối chiếu `existingSubtasks` theo prefix |
| Bulk create thành công một phần | Ghi ledger theo từng cái tạo được, hiện lỗi theo từng index |
| ADF phức tạp làm brief bị mất nội dung | Flatten có test theo từng loại node; node lạ vẫn lấy được text |
| Trang Confluence đổi mà mẫu chưa đổi | `contentHash` → cảnh báo `templateStale`, không tự áp |
| Nội dung trang wiki bị coi là chỉ thị | Importer chỉ trích cấu trúc; placeholder qua allowlist; không LLM nào hành động theo nội dung trang |
| Ghi sai lên Jira của team | Chỉ còn một đường ghi (subtask), mặc định tắt, có preview, mọi lần ghi đều log |
| Token rò rỉ | Chỉ SecretStorage, không log, không đưa vào `SprintState` gửi sang webview |
| Rate limit 429 | Retry theo `Retry-After` 2 lần, sau đó hiện banner + dùng cache |
| Endpoint `/rest/api/3/search` đã deprecate | Dùng `POST /rest/api/3/search/jql`; đường board/agile là đường chính |
| Jira Server / DC | Nêu rõ chỉ hỗ trợ Cloud trong empty state và README |

## 15. Ước lượng

| Phase | Khối lượng |
| --- | --- |
| P0 | ~450 LOC core + ~200 LOC host + test |
| P1 | ~550 LOC React + ~250 LOC service |
| P2 | ~150 LOC (join dữ liệu + prop prefill) |
| P3 | ~300 LOC + bảng mapping — **đã gỡ**, xem §12 |
| P4 | ~600 LOC core (template/planner/adfBuilder/importer) + ~350 LOC panel + test |

Bấm được sớm nhất sau P1. P2 và P4 là phần biến nó thành một vòng làm việc khép kín: chọn ticket →
có task → subtask theo đúng quy ước của team đã nằm dưới ticket.

## 16. Bước kế tiếp (không làm lần này)

**Bồi nội dung subtask từ artifact.** Lúc tạo task thì `[Testing]` chỉ có AC của ticket, vì
TEST-PLAN.md chưa tồn tại. Sau khi step `test-plan` xong, có thể `PUT /rest/api/3/issue/{key}` để
thay mục Completion Criteria bằng nội dung thật từ artifact. Đáng giá, nhưng là sửa issue đã tạo —
cần thêm chính sách merge (ghi đè? append? bỏ qua nếu người khác đã sửa tay?) nên tách ra một vòng riêng.
