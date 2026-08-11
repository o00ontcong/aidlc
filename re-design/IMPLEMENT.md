# Hướng dẫn implement — AIDLC VS Code Extension

Version đã chốt: **`AIDLC Workspace v2.dc.html`** (bản làm việc tiếp tục ở `AIDLC Workspace.dc.html`; bản đầu tiên còn ở `AIDLC Extension v1.dc.html`).

Ba tài liệu, ba vai:

| File | Trả lời câu hỏi |
|---|---|
| `AIDLC Workspace v2.dc.html` | **Giao diện trông và cư xử thế nào** — nguồn sự thật duy nhất |
| [`UI_SPEC.md`](./UI_SPEC.md) | Token, số đo, inventory component, công thức toạ độ, checklist layout |
| `IMPLEMENT.md` (file này) | Data model, store, command, viewmodel, protocol, test |

**Quy trình code giống 100%**: đọc §1–2 để có nền, rồi làm theo §5 — mỗi screen có bảng liệt kê **từng element → viewmodel field → command** kèm số đo. Không đoán: chỗ nào thiếu thì mở file `.dc.html`, tìm chuỗi text tiếng Việt của khối đó, đọc `style=` của element chứa nó.

---

## 0. Nguyên tắc kiến trúc rút ra từ thiết kế

1. **Project Context là baseline chung, Feature Epic là đơn vị chạy độc lập.** Epic capture snapshot của context (`capture-context`) rồi tự chạy — không có work package, không có worker epic.
2. **Song song = nhiều feature epic độc lập**, mỗi epic một branch, một PR, một terminal Claude. Extension không tự điều phối agent.
3. **Event log là audit source; state.json chỉ là projection** để đọc nhanh và phục hồi.
4. **Không có CLI chạy ngầm.** Mọi hành động mở một lệnh nhìn thấy được trong terminal Claude.
5. **Hard/human gate không mode nào vượt được.** Agent không merge default branch.
6. **Cấu hình thuộc từng epic** và user sửa được; project chỉ cấp mặc định.
7. **Mọi step có thể fail hoặc bị ngưng** → step nào cũng phải rerun được, và resume phải giữ phase đã approve.
8. **UI không tự suy diễn.** Mọi nhãn, màu, %, badge trong thiết kế đều là **field của viewmodel** (§4). Webview chỉ render, không tính toán nghiệp vụ.

---

## 1. Data model

```ts
// core/model.ts
type EpicState  = 'draft' | 'ready' | 'running' | 'waiting-for-user' | 'blocked' | 'completed';
type StepState  = 'awaiting-work' | 'running' | 'auto-review' | 'human-review' | 'done' | 'failed';
type RunMode    = 'guided' | 'autonomous';
type Scope      = 'project' | 'user';
type Tier       = 'fast' | 'balanced' | 'deep' | 'review';
type Capability = 'figma' | 'files' | 'github' | 'web';

interface ProjectContext {
  revision: string;           // 'rev-7'
  publishedAt: string;
  charter: string;            // path
  steps: string[];            // define-charter … project-rules-sync (7)
  drift?: { checkedAt: string; stale: boolean; ageDays: number };
}

interface Epic {
  id: string;                 // PAYMENTS-001 | DESIGN-001
  title: string;
  state: EpicState;
  pipelineId: string;         // cohesive-feature | redraw-design | project-context
  contextSnapshot: string;    // 'rev-7' — copy tại capture-context
  branch: string;
  pr?: { number: number; url: string; merged: boolean };
  runMode: RunMode;
  type: 'Feature' | 'Bug' | 'Refactor' | 'Spike' | 'Maintenance';
  overrides: Partial<EpicConfig>;   // cái user sửa riêng cho epic
  followed: boolean;                // ★ theo workspace
  currentStepId?: string;
}

interface EpicConfig {          // dòng trong card "Cấu hình của Epic này"
  pipelineId: string;
  contextSnapshot: string;
  branch: string;
  agents: string[];
  skills: string[];
  capabilities: Capability[];
  validators: string[];
  artifacts: string[];
}

interface PipelineStep {
  id: string;                 // implement | design-analyzer
  agent?: string;             // agent id
  skills: string[];
  outputs: string[];          // artifact glob/path
  autoReview: boolean;
  humanReview: boolean;
  onReject?: { rerun: string; withFeedback: boolean };
}

interface Pipeline { id: string; source: 'bundled' | 'project' | 'user'; version: string; steps: PipelineStep[] }

interface Agent {
  id: string; name: string; description: string;
  model: string; tier: Tier;
  skills: string[];
  capabilities: Capability[];
  scope: Scope;
}

interface Skill { id: string; source: 'bundled' | 'design' | 'custom'; description: string; body: string; scope: Scope }

interface StepRun {
  epicId: string; stepId: string; runId: string; revision: number;
  state: StepState; startedAt?: string; error?: string;
  feedback?: string;          // khi reject
  attempts: number;
}

interface QuotaAccount {      // Quota tracker ở sidebar
  provider: string;           // 'Claude Code' | 'OpenAI Codex' | 'Kimi' | 'xAI (Grok)'
  connected: boolean;
  accountLabel?: string;      // 'Account 1'
  enabled: boolean;           // toggle
  quotas: Array<{ label: string; used: number; limit: number; resetAt: string }>;
}
```

**Lưu ở đâu**

| Loại | Project scope | Global scope |
|---|---|---|
| Agent | `.claude/agents/<id>.md` (frontmatter) | `~/.claude/agents/<id>.md` |
| Skill | `.aidlc/skills/<id>.md` | `~/.claude/skills/<id>.md` |
| Pipeline | `.aidlc/pipelines/<id>.yaml` | bundled trong extension |
| Epic state | `.aidlc/epics/<id>/state.json` | — |
| Event log | `.aidlc/epics/<id>/events.ndjson` | — |
| Artifact policy | `.aidlc/artifacts.yaml` | — |
| Quota cache | `globalState` (không ghi repo — có token) | — |

Frontmatter agent:

```md
---
id: design-recreator
name: Design Recreator
description: Dựng lại UI từ Figma/ảnh tham chiếu
model: claude-opus-4
skills: [figma-to-ui, design-system, responsive-layout]
capabilities: [figma, files, github, web]
---
```

---

## 2. Thứ tự implement (mỗi bước ship được độc lập)

### Bước 1 — Store + event log
- `EventLog.append(epicId, event)` ghi NDJSON, redact secret, không bao giờ sửa dòng cũ.
- `StateProjection.rebuild(epicId)` đọc event log → `state.json`. Crash recovery = rebuild.
- Event tối thiểu: `{ at, command, from, to, actor, evidence }` — đúng 5 cột màn Event log.

### Bước 2 — Registry cho skill / agent / pipeline
- `SkillStore`, `AgentStore`, `PipelineStore`: `list() / read(id) / write(entity) / exists(id) / onDidChange`.
- Parse frontmatter bằng gray-matter, **giữ nguyên field lạ** khi ghi lại.
- Ghi file rồi emit change event → UI cập nhật ngay, không đợi reload.
- `validate()` trả về đúng 4 loại lỗi form đang hiển thị (§5.7).

### Bước 3 — CommandBus + slash command
- Mỗi hành động UI = một command id. Bảng đầy đủ ở §3.
- Command **không tự chạy AI**: ghi state/request rồi `terminal.sendText('/aidlc-' + pipelineId + ' ' + epicId)`.
- Autonomous: `/aidlc-autonomous-delivery <delivery-id>`.
- Sau khi ghi skill/agent/pipeline mới → notification có nút **Reload** (`workbench.action.reloadWindow`).

### Bước 4 — Step runner + rerun/resume
- `runStep(epicId, stepId)`: `awaiting-work → running`, mở terminal, chờ `Mark step done`.
- `rerunStep(epicId, stepId, { feedback })`: **revision mới**, **giữ run id**, chạy lại slash command. Không xoá artifact đã approve.
- `resume(epicId)`: đọc checkpoint, chỉ chạy phase failed/chưa xong + downstream. **Không** tạo run mới.
- Reject ở review → `onReject.rerun` kèm feedback, không chạy lại upstream đã approve.

### Bước 5 — Gate
- `GateService.request(kind, payload)` → epic sang `waiting-for-user` + ghi event.
- Hard gate: `merge_default_branch`, `external_communication`, `destructive_changes` — schema **từ chối** config khác `always`. `dependency_changes` là risk-based.
- Reject bắt buộc có lý do; ghi vào event log.
- `project-sync` chỉ chạy sau bằng chứng merge.

### Bước 6 — Webview UI
Theo §4 (viewmodel + protocol) và §5 (bản đồ element). Đọc `UI_SPEC.md` song song.

### Bước 7 — Preset "Redraw Design"
`aidlc.preset.redrawDesign.apply`, idempotent, 3 việc: ghi 5 skill → ghi agent `design-recreator` → ghi pipeline `redraw-design` (YAML ở §6). Không ghi đè pipeline bundled; tạo bản copy project có version.

---

## 3. Bảng command (khớp 1:1 với nút trong thiết kế)

| Command id | Nút trong UI | Tác dụng |
|---|---|---|
| `aidlc.workspace.open` | `Mở Workspace` (sidebar footer) | mở webview tab |
| `aidlc.epic.new` | `+ New Epic` | mở modal New Epic |
| `aidlc.epic.create` | `Tạo draft` / `Tạo & chạy` | ghi epic; bản `& chạy` gọi tiếp `epic.next` |
| `aidlc.epic.autonomous` | `⚡` cạnh New Epic | `/aidlc-autonomous-delivery` |
| `aidlc.epic.follow` | ★ trên row epic | toggle `followed`, lưu theo workspace |
| `aidlc.epic.filter` | pill filter | chỉ state UI, không gọi backend |
| `aidlc.step.run` | `Run with Claude` / `Chạy ngay` | mở terminal + slash command |
| `aidlc.step.markDone` | `Mark step done` | `running → auto-review\|done` |
| `aidlc.step.rerun` | `Run again with Claude` | revision mới, giữ run id |
| `aidlc.step.editFeedback` | `Edit feedback first` | mở input rồi rerun kèm feedback |
| `aidlc.step.skip` | `Skip có lý do` | ghi event + lý do |
| `aidlc.epic.resume` | `Resume interrupted delivery` | resume từ checkpoint |
| `aidlc.gate.approve` | `Approve` | ghi event, chuyển step tiếp |
| `aidlc.gate.reject` | `Reject` / `Reject + feedback` | bắt buộc lý do → `onReject.rerun` |
| `aidlc.context.open` | `Mở context` | mở file charter/context |
| `aidlc.context.refresh` | `Refresh context` | chạy pipeline `project-context` |
| `aidlc.builder.add` | `+ Add pipeline/agent/skill` | mở modal Add tương ứng |
| `aidlc.builder.save` | `Tạo pipeline/agent/skill` | validate → ghi file → emit change |
| `aidlc.preset.redrawDesign.apply` | `Apply preset` | §6 |
| `aidlc.window.reload` | `Reload VS Code` trong toast | `workbench.action.reloadWindow` |
| `aidlc.quota.refresh` | caret Quota tracker | fetch quota các provider |
| `aidlc.quota.toggleProvider` | toggle trên card provider | bật/tắt provider trong routing |
| `aidlc.quota.addProvider` | `Thêm provider` | mở Studio → provider |
| `aidlc.palette.open` | `⌘⇧P` trong header panel | quick pick 41 command |
| `aidlc.doctor.fix` | `Chạy --fix` | doctor auto-fix |

---

## 4. Viewmodel + postMessage protocol

Webview **chỉ render**. Extension gửi viewmodel đã tính sẵn mọi nhãn/màu.

```ts
// webview → extension
{ type: 'command', id: string, args?: unknown }

// extension → webview (full snapshot, replace toàn bộ)
interface WorkspaceVM {
  theme: 'dark' | 'light';
  tab: 'Home'|'Epics'|'Builder'|'Analyze'|'Tests'|'Guide'|'Studio';
  sidebar: {
    project: { name: string };
    quota: QuotaCardVM[];
    quotaSummary: string;        // '3 connected · 1 chưa nối'
    recent: { title: string; dot: string; starred: boolean }[];
    templates: string[];
    mcp: { name: string; state: string; healthy: boolean }[];
  };
  epics: {
    list: EpicRowVM[];
    filters: { label: string; count: number; active: boolean }[];
    query: string;
    collapsed: boolean;          // rail 46px
    detail: EpicDetailVM;
  };
  statusBar: { branch: string; status: string; cmdHint: string };
}

interface EpicRowVM {
  id: string; title: string; pct: string;      // '62%'
  dot: 'acc'|'warn'|'err'|'track';             // token name, không phải hex
  followed: boolean; selected: boolean;
}

interface EpicDetailVM {
  id: string; title: string; pct: string; tokens: string;
  badge: { icon: '●'|'✕'|'✓'|'○'; label: string; tone: 'warn'|'err'|'acc'|'muted' };
  pipelineLabel: string;         // 'redraw-design · 4 step'
  atLabel: string;              // 'Đang ở: implement · step 7/13'
  flowNote: string;
  flow: { nodes: FlowNodeVM[]; loop?: { from: number; to: number; label: string } };
  config: { k: string; v: string; src: string; fromEpic: boolean }[];
  runModes: { label: string; desc: string; selected: boolean }[];
  gate?: { kind: string; title: string; sub: string; consequence: string; actions: ActionVM[] };
  steps: StepRowVM[];
  history: { at: string; what: string; actor: string; tone: string }[];
  ship: { label: string; done: boolean }[];
}

interface FlowNodeVM { name: string; meta: string; kind: 'done'|'active'|'gate'|'todo' }
interface StepRowVM { name: string; meta: string; kind: FlowNodeVM['kind']|'rerun'|'failed'; error?: string; actions: ActionVM[] }
interface ActionVM  { label: string; command: string; args?: unknown; variant: 'primary'|'default'|'danger'|'ghost' }

interface QuotaCardVM {
  provider: string; initial: string; connected: boolean; enabled: boolean;
  stateLine: string;             // 'Account 1 · 2 quota' | 'No connections'
  availPct: string;              // '85%' — min của các quota
  tone: 'acc'|'warn'|'err'|'muted';
  quotas: { label: string; used: string; pct: string; tone: string; reset: string }[];
}
```

**Bốn quy tắc bắt buộc**

1. Nút render từ `ActionVM[]` — thêm nút = thêm phần tử array, **không** sửa markup.
2. Màu truyền bằng **tên token** (`'warn'`), webview map sang `var(--warn)`. Không truyền hex.
3. Mọi số phần trăm tính ở extension. Webview không chia.
4. Snapshot thay toàn bộ, không patch từng field — tránh lệch state.

---

## 5. Bản đồ element → viewmodel → command

Bảng để code giống 100%. Cột "số đo" là giá trị bắt buộc; chi tiết còn lại ở `UI_SPEC.md`.

### 5.1 Shell

| Element | Số đo | Nguồn dữ liệu |
|---|---|---|
| Container | `1440×920`, radius 10, `position:relative` (modal `position:absolute; inset:0`) | — |
| Title bar | h 36, bg `--chrome`, 3 dot 10px `#FF5F57 #FEBC2E #28C840` gap 7 | tên workspace |
| Activity bar | w 48, icon 34×34 r6 gap 4; active: bg `--acc-bg` + thanh dọc 2px `--acc` `left:-7 top:5 bottom:5` | tab hiện tại |
| Sidebar | w 300, bg `--side` | `vm.sidebar` |
| Editor tabs | h 34; tab active bg `--bg` + `border-top:1px solid --acc` | — |
| View tabs | 7 tab, padding `11px 13px`, 12.5px; active `border-bottom:2px solid --acc` | `vm.tab` |
| Live indicator | dot 7px `--acc` + `animation:aidlcPulse 1.6s infinite` | có step running |
| Status bar | h 24, bg `--acc`, chữ `--on-acc` 11px | `vm.statusBar` |

### 5.2 Sidebar

| Element | Số đo | Field | Command |
|---|---|---|---|
| Project bar | padding `11px 12px 9px`; nhãn 10px uppercase `.09em` | `sidebar.project.name` | — |
| `Ask AIDLC` / `Analyze` | flex 1, padding 8, r6, 12px | — | `aidlc.ask` / `epic.analyze` |
| Quota tracker | §5.6 | `sidebar.quota` | `quota.*` |
| Recent epics | row padding `6px 8px` r6; dot 7px | `sidebar.recent` | `workspace.open` |
| Templates | chip mono 11px padding `4px 8px` r5 | `sidebar.templates` | — |
| MCP servers | dot + tên mono + state 10.5px | `sidebar.mcp` | — |
| `Mở Workspace` | padding 9 r6 viền `--acc-bd` chữ `--acc-txt` | — | `workspace.open` |

### 5.3 Epics — cột trái

| Element | Số đo | Field | Command |
|---|---|---|---|
| Cột | w **316** mở / **46** rail | `epics.collapsed` | — |
| Header | padding `7px 10px`; nút vuông 24×24 r6 | `filters`, `query` | — |
| Chip lọc | 10px padding `1px 7px` r999; active `--acc-bg`/`--acc-txt` | filter active | — |
| Ô search | bg `--panel2` r6 padding `6px 9px`, input 11.5px | `epics.query` | — |
| Pill filter | 10.5px padding `3px 7px` r999 + count | `epics.filters` | `epic.filter` |
| Khu Following/Not | nhãn 10px uppercase + caret `▾/▸` + count | `followed` | — |
| **EpicRow** | h ~26: padding `5px 8px` r5 gap 8 — dot 7px · tên 11.5px · bar 26×2 · % 10px mono w30 · ★ 11px; selected bg `--acc-bg` viền `--acc-bd`; `cursor:grab` | `EpicRowVM` | select / `epic.follow` |
| Rail | dot 26×26 r6, ★ 8px góc phải trên | `epics.list` | select |
| Empty state | ô 38×38 dashed + `No epics match` 12.5px + nút `Xoá bộ lọc` | `list.length === 0` | reset filter |
| Footer | `+ New Epic` flex1 padding 7 + `⚡` icon | — | `epic.new` / `epic.autonomous` |

### 5.4 Epics — cột phải (thứ tự khối, gap 14, padding `16px 18px`, mỗi khối `flex:none`)

| # | Khối | Số đo | Field |
|---|---|---|---|
| 1 | Charter strip | viền `--warn-bd` bg `--warn-bg` r7 padding `9px 12px` | `detail.alignment` |
| 2 | Header epic | id mono 11.5px · title **17px/700** · badge r999 padding `3px 9px`; progress 6px; chip run mode + dropdown w280 | `detail.badge`, `pct`, `tokens` |
| 3 | Project Context card | 7 chip mono 11px + badge `published · rev-7` | `context` |
| 4 | Parallel epics | mỗi dòng: mark · id mono **w130** · title · branch · PR **w52** · state **w98** phải | `parallel[]` |
| 5 | Flow canvas | §5.5 | `detail.flow` |
| 6 | Epic config | `k` **w96** / `v` mono / nguồn (`epic override`→`--acc-txt`, `từ project`→`--txt3`) / `Sửa`; + 2 radio run mode | `detail.config`, `runModes` |
| 7 | Gate banner | viền **2px** `--err-bd` bg `--err-bg` r8; 🔒 + 13px/700 + badge + hộp hậu quả + hàng nút | `detail.gate` |
| 8 | Step list | icon **w18** giữa · tên 12.5px · meta 11px mono · nút phải; fail: bg `--err-bg` + lỗi mono thụt **28px** | `detail.steps` |
| 9 | Chi tiết step + History | grid `1.35fr 1fr` | `stepDetail`, `history` |
| 10 | Ship strip + action bar | dot 8px + nhãn + gạch nối 18×1 | `detail.ship` |

Badge map: `In progress → ● / --warn-bg / --warn / waiting-for-user` · `Failed → ✕ / --err-bg / --err / blocked` · `Done → ✓ / --acc-bg / --acc-txt / completed` · `Pending → ○ / --hover / --txt2 / draft`.

### 5.5 Flow canvas — code copy được

```ts
const NODE_W = 208, NODE_H = 52, PITCH_X = 224, PITCH_Y = 128, X0 = 12, Y0 = 40;
const COLS = 5, SCALE = 0.628, GRID_W = 1120;
const nx = (i: number) => X0 + PITCH_X * (i % COLS);
const ny = (i: number) => Y0 + PITCH_Y * Math.floor(i / COLS);
const cx = (i: number) => nx(i) + NODE_W / 2;      // 104
const cy = (i: number) => ny(i) + NODE_H / 2;      // 26

function paths(nodes: FlowNodeVM[], loop?: { from: number; to: number }) {
  const out: { d: string; tone: 'acc'|'track'|'warn'; dash: boolean }[] = [];
  nodes.forEach((n, i) => {
    if (i === nodes.length - 1) return;
    const done = nodes[i].kind === 'done' || nodes[i + 1].kind === 'done';
    const tone = done ? 'acc' : 'track';
    if ((i + 1) % COLS === 0) {                     // xuống hàng
      const c = ny(i) + 88;                         // corridor
      out.push({ d: `M${cx(i)},${ny(i) + NODE_H} L${cx(i)},${c} L${cx(i + 1)},${c} L${cx(i + 1)},${ny(i + 1)}`, tone, dash: !done });
    } else {                                        // nối ngang
      out.push({ d: `M${nx(i) + NODE_W},${cy(i)} L${nx(i + 1)},${cy(i)}`, tone, dash: !done });
    }
  });
  if (loop) {
    const y = ny(loop.from) + 76;                   // corridor loop
    out.push({ d: `M${cx(loop.from)},${ny(loop.from) + NODE_H} L${cx(loop.from)},${y} L${cx(loop.to)},${y} L${cx(loop.to)},${ny(loop.to) + NODE_H}`, tone: 'warn', dash: true });
  }
  return out;
}

const rows     = Math.ceil(nodes.length / COLS);
const loopY    = loop ? ny(loop.from) + 76 : 0;
const gridH    = Math.max(loopY + 20, Y0 + PITCH_Y * rows + 12);
const viewBox  = `0 0 ${GRID_W} ${gridH}`;
const wrapperH = Math.round(gridH * SCALE);         // container overflow:hidden
const loopLbl  = { left: nx(loop.to) + 116, top: loopY - 20 };
```

- SVG: `preserveAspectRatio="none"`, `position:absolute; inset:0; width:100%; height:100%`; node `position:absolute` theo px grid; scale cả cụm bằng `transform:scale(.628)` + `transform-origin:left top`.
- 3 marker: `ar` (`--txt3`), `ara` (`--acc`), `arw` (`--warn`), `markerWidth/Height 7`, `refX 6 refY 3.5`. Đã đi: liền + `ara`. Chưa tới: `stroke-dasharray="5 4"` + `ar`. Loop: `1.6px` + `4 4` + `arw`.
- Node style: `done` `1.5px solid --acc`/`--acc-bg`/`✓` · `active` `2px solid --warn`/`--warn-bg`/`●` · `gate` `2px solid --err-bd`/`--err-bg`/`🔒` · `todo` `1.5px dashed --bd`/`--panel`/`○`.
- Vì cụm bị scale, chữ trong canvas dùng **13.5 / 14 / 14.5 / 16px** (giữ đúng, đừng "sửa cho hợp thang").
- Dòng đầu canvas (`left:12 top:6`): ghi chú pipeline + legend `✓ xong · ● đang chạy · ○ chưa tới · 🔒 human gate`. **Không** nhồi legend vào header card.
- Test với **cả 4 và 13 step** trước khi coi là xong.

### 5.6 Quota tracker

| Element | Số đo | Field |
|---|---|---|
| Header | `QUOTA TRACKER` 10px uppercase + summary + caret | `quotaSummary` |
| Card | bg `--panel2` viền `--bd` r7 | `QuotaCardVM` |
| Dòng đầu | padding `7px 9px` gap 8: icon **22×22** r6 · tên 11.5px/600 + state (dot 5px + 10px) · **% 12.5px/700** + `available` 9.5px · toggle **26×15** | `availPct`, `enabled` |
| Quota row | border-top `--bd2` padding `6px 9px 7px`: dot 5px + label 10.5px + `used / limit` 10px mono + **% 10.5px/600 mono**; bar 3px + reset 9.5px **w62** phải | `quotas[]` |
| Footer | `Thêm provider` / `Routing` flex 1 | — |

**Công thức**: `pct = (limit - used) / limit` — hiển thị **quota còn lại**, một mẫu số mỗi dòng. `availPct` của card = `Math.min(...quotas.map(availPct))`. Ngưỡng: `≥60 → acc`, `25–59 → warn`, `<25 → err`. Chưa nối: `—`, `No connections`, toggle tắt, viền `--bd2`.

### 5.7 Modal + validation

| Modal | width | max-h | Field |
|---|---|---|---|
| Gate | 620 | — | `detail.gate` |
| New Epic | 820 | 790 | `newEpicVM` |
| Add pipeline/agent/skill | 780 | 770 | `addVM` |
| Command palette | 640 | 560 | `paletteVM` |

Chung: overlay `rgba(0,0,0,.5)`, panel bg `--panel2` r8–9, `box-shadow:0 30px 70px rgba(0,0,0,.5)`, header/footer `flex:none`, body `flex:1; overflow:auto; padding:16px; gap:14px`, nút `esc` ở header, footer trái là **lệnh CLI tương đương**.

`ValidationPanel` — 4 check, đúng thứ tự trong thiết kế:

```ts
function validate(kind, draft, stores) {
  const checks = [];
  const push = (ok, label, fix?) => checks.push({ ok, label, fix });

  push(!!draft.id && !stores[kind].exists(draft.id),
       !draft.id ? 'Chưa nhập id' : stores[kind].exists(draft.id) ? `Id "${draft.id}" đã tồn tại` : 'Id chưa dùng');

  if (kind === 'agent') {
    const missing = draft.skills.filter(s => !stores.skill.exists(s));
    push(missing.length === 0, missing.length ? `Skill không tồn tại: ${missing[0]}` : 'Tất cả skill đã có trong project', 'Tạo skill');
    push(draft.skills.length > 0, draft.skills.length ? `Đã gán ${draft.skills.length} skill` : 'Chưa gán skill nào');
    push(draft.capabilities.length > 0, draft.capabilities.length ? `Capabilities: ${draft.capabilities.join(' · ')}` : 'Chưa chọn capability');
  }
  if (kind === 'pipeline') {
    const bad = draft.steps.filter(s => s.agent && !stores.agent.exists(s.agent));
    push(bad.length === 0, bad.length ? `Step tham chiếu agent chưa có: ${bad[0].agent}` : 'Mọi step trỏ tới agent đã tồn tại', 'Tạo agent');
    push(draft.steps.some(s => s.humanReview), 'Có ít nhất một step human gate');
  }
  if (kind === 'skill') {
    push(!!draft.name && !!draft.description, 'Frontmatter có name và description');
    push(/## /.test(draft.body), 'Có mục hướng dẫn: đầu vào · quy tắc · đầu ra mong đợi');
  }
  return { checks, failCount: checks.filter(c => !c.ok).length };
}
```

Badge: `failCount ? `${failCount} lỗi cần sửa`` (bg `--err-bg`) : `'Hợp lệ'` (bg `--acc-bg`).

### 5.8 Toast

Góc phải dưới: `right:18 bottom:38`, w **352**, bg `--panel2`, viền `--acc-bd`, r8, `box-shadow:0 18px 44px rgba(0,0,0,.45)`. `✓` + tiêu đề 12px/600 + body 11.5px + nút `✕`; hàng nút: `Reload VS Code` (primary) / `Để sau`. Hiện sau `builder.save` và `preset.apply`.

### 5.9 Quy tắc chống lỗi layout (đã gặp thật)

1. Chip/badge/nút trong header: `flex:none; white-space:nowrap`. Chỉ **một** element co giãn (`flex:1; min-width:0`).
2. Text cắt: `min-width:0` + `white-space:nowrap` + `overflow:hidden` + `text-overflow:ellipsis` — thiếu `min-width:0` là flex không co.
3. Card trong cột cuộn: `flex:none` (thiếu → bị bóp chiều cao).
4. Vùng cuộn: `box-sizing:border-box` (thiếu → cắt nội dung cuối).
5. Header quá 5 element → chuyển bớt vào body (như legend flow canvas).
6. Toạ độ vẽ: derive từ công thức, không viết tay.
7. Không đặt glyph `→` cạnh đường SVG cùng chức năng.

---

## 6. Preset "Redraw Design"

```yaml
# .aidlc/pipelines/redraw-design.yaml
id: redraw-design
version: 1.0.0
steps:
  - id: design-analyzer
    agent: design-recreator
    skills: [figma-to-ui, image-to-ui]
    outputs: [DESIGN-ANALYSIS.md]
    auto_review: true
  - id: design-recreator
    agent: design-recreator
    skills: [design-system, responsive-layout]
    outputs: ["src/ui/**"]
  - id: visual-reviewer
    agent: design-recreator
    skills: [visual-review]
    outputs: [VISUAL-DIFF.md]
    auto_review: true
  - id: human-review
    human_review: true
    on_reject: { rerun: design-recreator, with_feedback: true }
```

5 skill kèm mô tả (dùng đúng chuỗi này trong UI):

| id | mô tả |
|---|---|
| `figma-to-ui` | Đọc frame Figma → token, layout, component; không copy pixel |
| `image-to-ui` | Suy ra grid, spacing, typography từ ảnh tham chiếu |
| `design-system` | Bắt buộc dùng token/component của design system, không tự tạo màu |
| `responsive-layout` | Quy tắc breakpoint, thứ tự reflow, hit target tối thiểu |
| `visual-review` | So sánh kết quả với tham chiếu và liệt kê sai lệch có thể sửa |

---

## 7. Test

```
validation.spec.ts    id trùng · skill không tồn tại · step trỏ agent chưa có · thiếu human gate
agent-store.spec.ts   ghi + đọc lại frontmatter skills/capabilities, giữ nguyên field lạ
linking.spec.ts       agent–skill và workflow–agent còn đúng sau reload
rerun.spec.ts         reject ở human-review chạy lại design-recreator kèm feedback, không chạy analyzer
resume.spec.ts        resume giữ phase approved, chỉ chạy phase failed + downstream
events.spec.ts        state.json rebuild được từ events.ndjson
gate.spec.ts          hard gate không bypass được ở mọi mode; reject bắt buộc có lý do
quota.spec.ts         pct = (limit-used)/limit; availPct card = min; ngưỡng màu 60/25
flow-layout.spec.ts   paths() với 4 và 13 node: số đường, endpoint khớp cạnh node, gridH đúng
regression.spec.ts    cohesive-feature (13 step) và project-context (7 step) không đổi
```

`npm test`. E2E webview: `@vscode/test-electron` mở workspace mẫu, apply preset, assert 3 file được ghi + notification Reload.

**Visual regression** (để giữ 100%): screenshot từng screen ở cả dark/light, so với `AIDLC Workspace v2.dc.html` mở trong browser cùng bề rộng 1440. Ngưỡng lệch cho phép: 0 với token màu, ±1px với spacing.

---

## 8. Ví dụ dùng end-to-end

```
1. Sidebar AIDLC → Workflows → Cohesive Delivery → Overwrite & apply → Install
2. Start Epic → project-context → chạy 7 step → publish-context (rev-7)
3. Builder → Preset Redraw Design → Apply preset → Reload VS Code
4. + New Epic → title "Redraw checkout screen" → pipeline redraw-design → Tạo & chạy
5. Run with Claude từng step → Mark step done
6. human-review: Approve, hoặc Reject + feedback → design-recreator chạy lại revision 2
7. open-pr → await-merge (human merge) → project-sync
```

Chạy song song: tạo `PAYMENTS-001`, `EXPORT-001`, `NOTIFICATIONS-001` — mỗi epic một terminal, một branch, một PR. Trước khi chạy, kiểm tra checklist độc lập trong card "Feature epic đang chạy song song".

---

## 9. Checklist "giống 100%"

- [ ] Copy nguyên 2 khối token từ helmet, không đổi giá trị nào
- [ ] Inter + JetBrains Mono; **mọi** id/path/command/số liệu dùng mono
- [ ] Shell 5 lớp đúng chiều cao §5.1
- [ ] 14 component ở `UI_SPEC.md` §6 + 4 biến thể nút
- [ ] Mọi nút render từ `ActionVM[]`, màu truyền bằng tên token
- [ ] Epics cột trái đúng 3 trạng thái bề rộng (316 / 46 / search mở)
- [ ] FlowCanvas dùng hàm §5.5, pass `flow-layout.spec`
- [ ] Quota tracker: % là **available**, một mẫu số mỗi dòng
- [ ] 4 modal + ValidationPanel 4 check + Toast
- [ ] Chạy checklist §5.9 trên từng screen
- [ ] Visual regression dark + light, lệch spacing ≤ 1px
