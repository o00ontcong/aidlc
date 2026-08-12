# AIDLC Workspace v3 — Handoff để implement bằng React + TypeScript + Tailwind

**Đích:** `packages/extension/src/webview/v3/`
**Nguồn sự thật duy nhất:** `AIDLC Workspace v3.dc.html` (2221 dòng, ở project root).
Mọi số đo/chuỗi/màu trong tài liệu này trích nguyên văn từ file đó. Khi lệch → tin file.

Kèm theo tài liệu này (copy thẳng vào repo):

| File | Dùng để |
|---|---|
| `v3-handoff/tokens.css` | 2 khối token dark/light + keyframe + CSS tô đỏ mock |
| `v3-handoff/types.ts` | Toàn bộ type của viewmodel + UI state |
| `v3-handoff/flow-layout.ts` | Toán học FlowCanvas (không hard-code toạ độ) |
| `v3-handoff/mock-data.ts` | 100% dữ liệu giả + `MOCK_REGISTRY` |
| `v3-handoff/MockBoundary.tsx` | Component đánh dấu + tô đỏ control dùng mock |

> ⚠️ `IMPLEMENT.md` và `UI_SPEC.md` đang chốt ở **v2**. Danh sách mâu thuẫn v2↔v3 ở **§13** — đọc trước khi code, đừng tự chọn.

---

## 1. Cấu trúc thư mục

```
packages/extension/src/webview/v3/
├─ index.tsx                     # mount React vào #root, MockProvider, VSCodeApi bridge
├─ App.tsx                       # <div class={theme}> shell 1440×920 + modal layer
├─ styles/tokens.css             # ← v3-handoff/tokens.css
├─ tailwind.config.ts            # §2
├─ state/
│  ├─ store.ts                   # useWorkspaceStore (zustand) — UiState ở types.ts
│  ├─ selectors.ts               # derive: visibleEpics, followed/rest, counts, statusBar
│  └─ vscode.ts                  # postMessage('command'|…) + onMessage(snapshot)
├─ data/
│  ├─ mock-data.ts               # ← v3-handoff/mock-data.ts
│  └─ types.ts                   # ← v3-handoff/types.ts
├─ lib/
│  ├─ flow-layout.ts             # ← v3-handoff/flow-layout.ts
│  ├─ quota.ts                   # pct = (limit-used)/limit, tone theo ngưỡng 60/25
│  └─ tone.ts                    # Tone → var(--…)
├─ components/                   # 16 primitive, §5
│  ├─ MockBoundary.tsx  Button.tsx  Card.tsx  Chip.tsx  Pill.tsx  StatusBadge.tsx
│  ├─ ProgressBar.tsx   Toggle.tsx  RadioRow.tsx  KVRow.tsx  CodeBlock.tsx
│  ├─ ValidationPanel.tsx  Modal.tsx  Toast.tsx  IconDot.tsx  SectionHeader.tsx
├─ shell/
│  ├─ TitleBar.tsx  ActivityBar.tsx  Sidebar.tsx  EditorTabs.tsx  ViewTabs.tsx  StatusBar.tsx
│  └─ sidebar/ QuotaTracker.tsx  RecentEpics.tsx  TemplateChips.tsx  McpList.tsx
├─ screens/
│  ├─ HomeScreen.tsx
│  ├─ epics/ EpicsScreen.tsx  EpicList.tsx  EpicRail.tsx  EpicDetail.tsx
│  │         FlowCanvas.tsx  LifecycleStrip.tsx  StepList.tsx  GateBanner.tsx
│  ├─ BuilderScreen.tsx  (PresetCard, FlowCards, AgentCards, SkillTable)
│  ├─ AnalyzeScreen.tsx  TestsScreen.tsx  GuideScreen.tsx  StudioScreen.tsx
└─ modals/ GateModal.tsx  NewEpicModal.tsx  AddModal.tsx
```

Không dùng CSS module / styled-components. Tailwind + `var(--token)`.

---

## 2. Tailwind setup

Token là CSS variable, theme đổi bằng class trên container gốc (`thm-dark` / `thm-light`). Tailwind chỉ ánh xạ tên → biến.

```ts
// tailwind.config.ts
export default {
  content: ['./src/webview/v3/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:'var(--bg)', panel:'var(--panel)', panel2:'var(--panel2)', side:'var(--side)', chrome:'var(--chrome)',
        bd:'var(--bd)', bd2:'var(--bd2)', hover:'var(--hover)',
        txt:'var(--txt)', txt2:'var(--txt2)', txt3:'var(--txt3)',
        acc:'var(--acc)', 'acc-txt':'var(--acc-txt)', 'acc-bg':'var(--acc-bg)', 'acc-bd':'var(--acc-bd)', 'on-acc':'var(--on-acc)',
        warn:'var(--warn)', 'warn-bg':'var(--warn-bg)', 'warn-bd':'var(--warn-bd)',
        err:'var(--err)', 'err-bg':'var(--err-bg)', 'err-bd':'var(--err-bd)',
        info:'var(--info)', track:'var(--track)',
      },
      fontFamily: { sans:['Inter','system-ui','sans-serif'], mono:['JetBrains Mono','monospace'] },
      fontSize: {   // thang chữ CHÍNH XÁC của v3 — không làm tròn, không thêm cỡ mới
        '9.5':'9.5px','10':'10px','10.5':'10.5px','11':'11px','11.5':'11.5px','12':'12px',
        '12.5':'12.5px','13':'13px','13.5':'13.5px','14':'14px','14.5':'14.5px','15':'15px',
        '16':'16px','17':'17px',
      },
      borderRadius: { '4':'4px','5':'5px','6':'6px','7':'7px','8':'8px','9':'9px','10':'10px' },
      boxShadow: {
        modal:'0 30px 70px rgba(0,0,0,0.5)',
        dropdown:'0 16px 40px rgba(0,0,0,0.35)',
        toast:'0 18px 44px rgba(0,0,0,0.45)',
        frame:'0 24px 70px rgba(0,0,0,0.5)',
      },
      animation: { pulse2:'aidlcPulse 1.6s ease-in-out infinite', pulseFast:'aidlcPulse 1.3s ease-in-out infinite' },
    },
  },
};
```

**Quy tắc bắt buộc**

1. Border 1px mặc định: `border border-bd`. Gate banner và modal Gate dùng **2px** `border-err-bd`.
2. Radius: `4` tag nhỏ · `5` chip · `6` nút/input/row · `7` card nhỏ · `8–9` card lớn/modal · `999px` badge & toggle.
3. Gap: chỉ `2 3 4 5 6 7 8 9 10 11 12 13 14 16px`, luôn qua flex/grid `gap`, **không margin giữa sibling**.
4. Mono cho **mọi** id, path, command, số liệu, %, branch, PR.
5. Vùng cuộn: `box-sizing:border-box` + `overflow-auto`. Card trong cột cuộn: `flex-none`.
6. Text cắt: `min-w-0 whitespace-nowrap overflow-hidden text-ellipsis`.
7. Chip/badge/nút trong header: `flex-none whitespace-nowrap`; chỉ **một** element `flex-1 min-w-0`.

**Theme trong extension thật:** đọc `ColorThemeKind` → set class `thm-dark`/`thm-light` trên container gốc. Bộ chuyển Dark/Light nằm **phía trên khung 1440** trong file design chỉ là chrome của design doc — **không** implement trong webview.

---

## 3. Shell 1440×920

```
container  1440×920 · rounded-10 · border 1px rgba(255,255,255,.10) · bg --bg
           display:flex column · position:relative · shadow-frame
           (mọi modal là position:absolute inset-0 bên trong container này)
├ TitleBar     h36 flex-none · bg --chrome · border-b --bd · px13 · gap12
│              3 dot 10px tròn (#FF5F57 #FEBC2E #28C840) gap 7
│              giữa: "payments-service — Visual Studio Code" 11.5px --txt2, flex-1 text-center
│              phải: spacer w56
├ body flex-1 flex min-h-0
│ ├ ActivityBar w48 flex-none · bg --side · border-r --bd · py8 · items-center · gap4
│ │   4 ô 34×34 rounded-6: explorer, search, source-control (3 SVG stroke 1.6, 19×19, --txt3)
│ │   ô thứ 4 = AIDLC: bg --acc-bg, chữ "A" 13px/700 --acc-txt,
│ │   + thanh dọc absolute left:-7 top:5 bottom:5 w2 rounded-2 bg --acc
│ ├ Sidebar     w300 flex-none · bg --side · border-r --bd   → §4
│ └ editor area flex-1 min-w-0 flex-col bg --bg
│   ├ EditorTabs h34 flex-none bg --side border-b --bd
│   │    tab 1 "AIDLC Workspace": px14 gap8 bg --bg, --txt 12px, border-r --bd, border-t 1px --acc
│   │    tab 2 "refunds/service.ts": px14, --txt3 12px, border-r --bd
│   ├ ViewTabs   flex-none px10 border-b --bd bg --panel · gap2
│   │    7 tab: Home Epics Builder Analyze Tests Guide Studio
│   │    tab: py11 px13, 12.5px/500; active → color --txt + border-b 2px --acc; inactive → --txt3 + border-b 2px transparent
│   │    phải: dot 7px --acc animate-pulse2 + chữ "Live" 11px --txt2, gap6
│   └ view body  flex-1 min-h-0 overflow-hidden  → §6–§12
└ StatusBar h24 flex-none bg --acc · px12 · gap14 · --on-acc 11px/500
     "⎇ epic-142-partial-refunds" · "AIDLC · {statusText}" · spacer · {cmdHint} (mono)
```

`statusText` / `cmdHint` theo tab (chuỗi đúng nguyên văn):

| tab | statusText | cmdHint |
|---|---|---|
| Home | `ready · 1 blocker · 1 gate chờ` | `aidlc epic next EPIC-142` |
| Epics | `{epicId} · {badgeLabel}` vd `EPIC-142 · waiting-for-user` | `aidlc gate approve {epicId} merge_default_branch` |
| Builder | `builder · {builderTab.toLowerCase()}` | `aidlc pipeline list` |
| Analyze | `analyze · {platform.toLowerCase()}` | `aidlc analyze --platform {platform}` |
| Tests | `test agent · verdict gate chờ` | `aidlc test run --e2e` |
| Guide | `guide & diagnostics` | `aidlc doctor` |
| Studio | `studio · pack {pack}` | `aidlc project recommend --explain` |

---

## 4. Sidebar (w300)

`flex-col min-h-0`: project bar `flex-none` · body `flex-1 overflow-auto p-[11px_12px] gap-14 flex-col` · footer `flex-none`.

1. **Project bar** — `p-[11px_12px_9px]`, border-b `--bd`, gap8. Nhãn `PROJECT` 10px uppercase `tracking-[.09em]`/600 `--txt3`; tên 12.5px/600 (ellipsis); nút `Đổi` 11px border `--bd` r5 `p-[3px_7px]`.
2. **2 nút** — `Ask AIDLC` (bg `--acc`, `--on-acc`, 600) + `Analyze` (border `--bd`), mỗi nút `flex-1 text-center p-8 r6 12px`.
3. **Quota tracker** — §4.1.
4. **Recent epics** — header: nhãn 10px uppercase + spacer + `Tất cả` (11px `--acc-txt` → tab Epics). Row: `p-[6px_8px]` r6 bg `--panel2` border `--bd` gap8 → dot 7px + tên 12px ellipsis + `★` 11px (`--acc-txt` nếu followed, rỗng nếu không).
5. **Workflow templates** — chip mono 11px `p-[4px_8px]` r5 bg `--panel2` border `--bd` `--txt2`, wrap gap5.
6. **MCP servers** — header nhãn + spacer + `⟳`. Row `p-[5px_8px]` r6 bg `--panel2` border `--bd`: mark (`●` acc / `○` txt3) + tên mono 11.5px + state 10.5px `--txt3`.
7. **Footer** — `Mở Workspace`, `p-9` r6 border `--acc-bd`, chữ `--acc-txt` 12px/600, text-center.

Tất cả nhãn section: `10px uppercase tracking-[.09em] font-600 --txt3`.

### 4.1 Quota tracker  `data-mock-id="sidebar.quota"`

Header row gap7: nhãn `QUOTA TRACKER` (flex-none) · summary `{connected} connected · {n} chưa nối` 10.5px `--txt3` (flex-1 ellipsis) · caret `▾/▸` 10px (toggle mở/gập **tất cả** card).

Card provider: bg `--panel2`, border `--bd` (chưa nối: `--bd2`), r7, overflow-hidden.

- **Dòng đầu** `p-[7px_9px]` gap8, click → chuyển tab Studio:
  - icon 22×22 r6, `bg=iconBg`, `color=iconFg`, chữ initial 11px/700
  - giữa (`flex-1 min-w-0`): tên 11.5px/600 ellipsis; dòng dưới gap5: dot 5px (tone) + state 10px (`Account 1 · 2 quota` hoặc `No connections`, màu `--txt2`/`--txt3`)
  - phải: `%` 12.5px/700 `line-height:1.1` (màu theo tone) + nhãn `available` 9.5px `--txt3`
  - toggle 26×15 r999 `p-2 box-border`, track `--acc`/`--track`, knob 11×11 tròn `--on-acc`/`--txt3`, `justify-content: flex-end|flex-start`
- **Quota rows** (chỉ khi connected && quotaOpen): border-t `--bd2`, `p-[6px_9px_7px]`, gap6 dọc. Mỗi row 2 dòng:
  - dòng 1 gap6: dot 5px + label 10.5px `--txt2` (flex-1 ellipsis) + `used / limit` 10px mono `--txt3` + `%` 10.5px/600 mono (tone)
  - dòng 2 gap6: bar `flex-1 h-3px r2 bg --track`, fill `h-3px r2 bg=tone width=pct` + reset 9.5px `--txt3` `w62 text-right`
- **Footer** 2 nút `flex-1 text-center` 11px `p-[5px_8px]` r5 border `--bd` `--txt2`: `Thêm provider` (→ Studio) / `Routing`.

**Công thức (bắt buộc, tính ở extension):**
```
pctAvailable = Math.round((limit - used) / limit * 100)      // MỘT mẫu số mỗi dòng
tone = pct >= 60 ? 'acc' : pct >= 25 ? 'warn' : 'err'
card.availPct = Math.min(...quotas.map(q => q.pctAvailable)) // '—' nếu chưa nối
```
Với mock hiện tại: Claude Code 85% (acc), OpenAI Codex 32% (warn), Kimi 8% (err), xAI `—`.

> **Cập nhật (quota-tracker-implementation):** khối này không còn đọc `MOCK_QUOTA` — dữ
> liệu thật đi qua `quota.list` / `quota.refresh` / `quota.setEnabled` (xem
> `packages/core/src/providers/quota/`, `ExtensionV3Host` §quota, `useQuota()` ở
> webview). Layout/formula ở trên giữ nguyên pixel-perfect; phần bổ sung duy nhất
> là một nút refresh nhỏ (↻) cạnh caret trong header, cùng các trạng thái mới
> không đổi kích thước khung: `loading` (skeleton), `stale` (nhãn "cập nhật Xm
> trước" nối vào dòng account, ellipsis như cũ), `error` (dot đỏ + "Probe failed"
> thay cho account line, tooltip chứa lý do), và số `estimated` (tiền tố `~`).
> Không có provider nào lộ credential; provider không expose quota (Claude Code,
> Kimi hôm nay) hiện `—` đúng công thức trên, kèm tooltip giải thích tại sao.

---

## 5. Component primitives (16)

| # | Component | Props | Biến thể / số đo |
|---|---|---|---|
| 1 | `Button` | `label, variant, size, onClick, disabled` | `primary` bg `--acc` chữ `--on-acc` 600 · `default` border `--bd` chữ `--txt` · `danger` border `--err-bd` chữ `--err` · `ghost` không viền chữ `--acc-txt`. Size: `xs` `p-[4px_9px]/11px` · `sm` `p-[5px_10px]/11.5px` · `md` `p-[6px_11px]/11.5px` · `lg` `p-[9px_14px]/12.5px` · `xl` `p-[9px_16px]/12.5px` |
| 2 | `Card` | `title, chips[], right, actions[], children, footer` | bg `--panel` border `--bd` r8; header `p-[10px_14px]` hoặc `p-[11px_14px]` border-b `--bd` gap9; title 12.5px/600 |
| 3 | `Chip` | `label, tone, mono` | 10.5px `p-[2px_8px]` r5 bg `--hover`/`--acc-bg` |
| 4 | `Pill` | `label, count, active` | 10.5px `p-[3px_7px]` r999 border; active `--acc-bg`/`--acc-bd`/`--acc-txt` |
| 5 | `StatusBadge` | `state` | r999 `p-[3px_9px]` 11px/600 gap5 — bảng map §6.2 |
| 6 | `ProgressBar` | `pct, tone, height` | height 2 (row epic, w26) · 3 (quota) · 6 (header epic, home) |
| 7 | `Toggle` | `on, size` | quota 26×15 knob 11 · capability 34×19 knob 15; `p-2 box-border` r999 |
| 8 | `RadioRow` | `label, desc, selected, mark` | mark `◉/○` 11px; bg `--acc-bg`/`--panel`; border `--acc-bd`/`--bd`; r6 `p-[7px_10px]` hoặc `p-[8px_11px]` |
| 9 | `KVRow` | `k, v, src, action, kWidth` | k `w96` (epic config) / `w80` (lock, help) / `w70` (step detail) 11–11.5px `--txt3`; v mono 12–12.5px `--txt`; border-b `--bd2`; `p-[9px_14px]` |
| 10 | `CodeBlock` | `lines: {t,tone}[]` | mono 11–11.5px `leading-[1.8]`, bg `--panel2` hoặc `--panel`, border `--bd`, r6, `p-[9px_11px]`…`p-[13px_14px]` |
| 11 | `ValidationPanel` | `checks[], failCount` | §11.3 |
| 12 | `Modal` | `width, maxHeight, title, sub, children, footer, danger` | §11 |
| 13 | `Toast` | `title, body, actions` | §11.4 |
| 14 | `SectionHeader` | `label, count, caret, onToggle` | 10px uppercase `.09em` 600 `--txt3` |
| 15 | `IconDot` | `tone, size` | 5 / 7 / 8px tròn |
| 16 | `MockBoundary` | `id, level` | §12 |

Mọi nút render từ `ActionVM[]` — thêm nút = thêm phần tử mảng, không sửa markup.

---

## 6. Tab Epics (mặc định)

`height:100% flex min-h-0` — cột trái `flex-none` + cột phải `flex-1 min-w-0 overflow-auto p-[16px_18px] flex-col gap-14`.

### 6.1 Cột trái — 3 trạng thái bề rộng

| trạng thái | width | điều kiện |
|---|---|---|
| mở | **316px** | `!listCollapsed` |
| rail | **46px** | `listCollapsed` |
| mở + search | 316px | `toolsOpen` (chèn thêm khối search) |

Nền `--panel`, border-r `--bd`.

**Header** `p-[7px_10px]` gap7 flex-col, border-b `--bd`:
- dòng 1 gap6: vùng click `flex-1 min-w-0` (toggle tools) = caret `▾/▸` 10px + `EPICS` 10.5px uppercase 600 + tổng số 10.5px `--txt3` + chip lọc (10px `p-[1px_7px]` r999; nội dung = `"query"` nếu có query, ngược lại tên filter; active → `--acc-bg`/`--acc-txt`, mặc định `--hover`/`--txt3`); nút `⌕` 24×24 r6 border `--bd`; nút `‹` 24×24 (collapse).
- khối tools (khi `toolsOpen`): ô search bg `--panel2` border `--bd` r6 `p-[6px_9px]` gap7 (icon `⌕` 11px + input 11.5px transparent) + hàng pill wrap gap3: `All · In progress · Pending · Done · Failed` kèm count (`opacity .65`).

**Danh sách** `flex-1 overflow-auto p-[8px_10px] flex-col gap-9`:
- Empty state (khi `visible.length===0`): ô 38×38 r8 border dashed `--bd` chứa `⌕` 15px; `No epics match` 12.5px/600; `Thử xoá từ khoá hoặc chọn filter All.` 11.5px `--txt2`; nút `Xoá bộ lọc` (sm, default) → reset `query=''`, `filter='All'`.
- Section `★ FOLLOWING` (ẩn nếu rỗng) và `NOT FOLLOWING`: header click-to-collapse gap6 = caret + nhãn 10px uppercase + count; body `flex-col gap-2`.
- **EpicRow** `p-[5px_8px]` r5 gap8 `cursor:grab`, border `--bd` (selected: `--acc-bd`), bg `--panel2` (selected: `--acc-bg`):
  dot 7px (tone) · tên 11.5px ellipsis `flex-1 min-w-0` · bar 26×2 (fill = tone, width = pct) · pct 10px mono `--txt3` `w30 text-right` · `★` 11px (`--acc-txt` nếu follow, `--track` nếu không) — click ★ **stopPropagation**, toggle follow.

**Rail (46px)** `flex-col items-center gap-8 py-10`: nút `›` 26×26 r6 border `--bd`; spacer 6px; mỗi epic một ô 26×26 r6 border/bg như row selected, chứa dot 7px, `★` 8px absolute `top:-1 right:-1`.

**Footer** `p-[8px_10px]` border-t `--bd` gap6: `+ New Epic` (`flex-1` primary `p-7` 11.5px/600) + nút `⚡` `p-[7px_10px]` r6 border `--bd` `--txt2` (title="Start Autonomous Delivery").

Lọc/tìm (chạy ở webview, không gọi backend):
```ts
visible = epics
  .filter(r => filter === 'All' || r.state === filter)
  .filter(r => !q || `${r.id} ${r.title} ${r.next}`.toLowerCase().includes(q.toLowerCase()));
```

### 6.2 Cột phải — 11 khối theo đúng thứ tự

Mỗi khối `flex-none`, gap 14.

**① Charter alignment strip** — border `--warn-bd`, bg `--warn-bg`, r7, `p-[9px_12px]` gap10: `▲` 12px `--warn` + câu 12px `--txt` `leading-[1.5]` (`G-02` mono) + link `Xem xung đột` 11.5px/600 `--warn` → tab Guide.

**② Header epic** — `flex items-start gap-14`:
- trái `flex-1 min-w-0`: dòng 1 gap9 = id mono 11.5px `--txt3` · title **17px/700** · StatusBadge. Dòng 2 (`mt-9`) gap10 = ProgressBar h6 (`flex-1`, fill `--acc`) · pct 11.5px mono `--txt2` · tokens 11.5px mono `--txt3`.
- phải `relative`: chip mode `p-[7px_11px]` r999 border `--acc-bd` bg `--acc-bg` chữ `--acc-txt` 12px/600 (mono) + caret `▾` 9px. Dropdown khi mở: `absolute right-0 top-38 w-280 z-10` bg `--panel2` border `--bd` r7 shadow-dropdown — 4 dòng mode `p-[9px_11px]` border-b `--bd2` (label mono 12px/600 + desc 11px `--txt2`), dòng cuối cảnh báo `p-[9px_11px]` 11px `--warn` bg `--warn-bg`: `Đổi sang unattended sẽ chạy liên tiếp nhiều stage — vẫn dừng ở hard gate.`

StatusBadge map:

| state | icon | bg | fg | nhãn |
|---|---|---|---|---|
| In progress | `●` | `--warn-bg` | `--warn` | waiting-for-user |
| Failed | `✕` | `--err-bg` | `--err` | blocked |
| Done | `✓` | `--acc-bg` | `--acc-txt` | completed |
| Pending | `○` | `--hover` | `--txt2` | draft |

**③ Project Context card** — header `p-[10px_14px]` gap9: title `Project Context` · chip mono `project-context · 7 step` (bg `--hover`) · badge r999 `published · rev-7` (`--acc-bg`/`--acc-txt`/600) · spacer · ghi chú 11px `--txt3` `baseline chung — mỗi feature epic capture snapshot để chạy độc lập`.
Body `p-[10px_14px]` flex wrap gap5: 7 chip step (`p-[4px_9px]` r6 border `--acc-bd` bg `--acc-bg`, `✓` 10.5px + tên mono 11px) + spacer + nút `Mở context` (sm default) + `Refresh context` (sm, border `--warn-bd`, chữ `--warn`).

**④ Parallel epics card** — header: title `Feature epic đang chạy song song` + ghi chú `mỗi epic một terminal Claude, một branch, một PR` + spacer + nút `Kiểm tra độc lập`.
Row `p-[9px_14px]` gap10 border-b `--bd2`: mark 11px (tone) · id mono 11.5px **w130** ellipsis · title 12px `--txt2` `flex-1` ellipsis · branch 11px mono `--txt3` · PR 11px mono **w52 text-right** · state 11px mono **w98 text-right** (tone).
Footer `p-[10px_14px]` flex-col gap5: 4 dòng checklist (mark 11px + label 11.5px `--txt2`).

**⑤ Flow card** — header `p-[10px_14px]` gap9 wrap: title `Flow của Feature Epic` · chip mono pipelineLabel (bg `--hover`) · badge r999 bg `--warn-bg` chữ `--warn`/600 gap5 (dot 6px `--warn` `animate-pulseFast` + atLabel) · spacer.
Body = **FlowCanvas** (§6.3). Footer = **LifecycleStrip** (§6.4).

**⑥ Epic config card** — header: title `Cấu hình của Epic này` · chip `ghi đè mặc định project` (`--acc-bg`/`--acc-txt`) · spacer · nút `Sửa tất cả` · `Đặt lại theo project` (chữ `--txt2`).
6 KVRow `p-[9px_14px]` gap11: k **w96** 11.5px `--txt3` · v mono 12.5px ellipsis `flex-1` · src 10.5px (`--acc-txt` nếu `fromEpic`, ngược lại `--txt3`) · `Sửa` 11.5px `--acc-txt`.
Footer `p-[10px_14px]` flex-col gap7: nhãn `CÁCH VẬN HÀNH EPIC NÀY` (11px uppercase `.08em`) + 2 RadioRow `flex-1` (`Guided` / `Autonomous Delivery`) + dòng 11px `--txt3`: `Không có CLI cohesive chạy ngầm — mọi thao tác đều mở lệnh nhìn thấy được trong terminal Claude.`

**⑦ Gate banner** — border **2px** `--err-bd`, bg `--err-bg`, r8, `p-[14px_16px]` flex-col gap11:
dòng 1 gap9: `🔒` 14px + (title 13px/700 `Human gate · await-merge`; sub 11.5px `--txt2`) + badge r999 `waiting-for-user` (`--warn-bg`/`--warn`/600).
hộp hậu quả: bg `--panel2` border `--bd` r6 `p-[11px_12px]` 12.5px `leading-[1.6]`, `+186` màu `--acc-txt`, `−34` màu `--err`.
hàng nút wrap gap7: `Approve` (primary lg) · `Reject` (danger lg) · `Rerun step` · `Run auto-review` · `Run with Claude` (default lg). Approve/Reject mở **modal Gate**.

**⑧ Step list card** — header: title `Step của epic` + spacer + ghi chú 11px `--txt3`.
Mỗi step `p-[10px_14px]` border-b `--bd2`, `bg=rowBg` (active → `--acc-bg`; failed → `--err-bg`; khác → transparent), flex-col gap7:
dòng 1 gap10: icon **w18 text-center** 12px (tone) · (tên 12.5px ellipsis + meta 11px mono `--txt3`) `flex-1` · nhóm nút gap5 (xs/sm theo `ActionVM[]`).
dòng lỗi (nếu có): 11.5px mono `--err` `leading-[1.55]` **pl-28**.
Footer `p-[10px_14px]` wrap gap6: `Run again with Claude` · `Resume interrupted delivery` · `Help & guide` (md default) + spacer + `resume từ checkpoint · giữ phase đã approve` 11px mono `--txt3`.

**⑨ Chi tiết step + History** — `grid grid-cols-[1.35fr_1fr] gap-14`.
- Trái: header title `Chi tiết step · implement` + spacer + `/aidlc epic next EPIC-142` 11px mono `--txt3`. 4 KVRow (k **w70** mono 11px, v 12px `--txt2` `leading-[1.6]`, `p-[9px_13px]`). Footer `p-[10px_13px]` wrap gap6: 3 chip artifact (11px mono, bg `--panel2`, border `--bd`, r5).
- Phải: header `HISTORY` 10.5px uppercase. 5 dòng `p-[8px_13px]` gap9 border-b `--bd2`: giờ 11px mono `--txt3` flex-none + (what 11.5px tone + actor 10.5px mono `--txt3`).

**⑩ Ship strip** — `p-[11px_14px]` r8 border `--bd` bg `--panel` gap12: nhãn `SHIP` + 4 mốc (dot 8px + label 11.5px + gạch nối 18×1 `--bd`) + `artifact policy: 4 / 9` 11.5px mono `--txt3`.

**⑪ Action bar** — wrap gap7 `pb-6`: `Verify · Report · Reveal artifacts · Epic memory` (default) + `Delete` (danger), `p-[8px_13px]` 12px r6.

### 6.3 FlowCanvas — phần dễ sai nhất

Dùng `flow-layout.ts`. Không viết toạ độ bằng tay.

```
wrapper : bg --panel2 · overflow-hidden · height = canvasH = round(gridH * 0.628)
inner   : position:relative · width 1120 · height gridH · transform:scale(.628) · origin left top
svg     : absolute inset-0 w-full h-full · viewBox="0 0 1120 {gridH}" · preserveAspectRatio="none"
markers : #ar  fill var(--txt3) | #ara fill var(--acc) | #arw fill var(--warn)
          markerWidth/Height 7, refX 6, refY 3.5, path "M0,0 L7,3.5 L0,7 z"
node    : absolute left/top theo grid · width 208 · box-border · p-[7px_11px] · r7
          dòng 1 gap5: icon 13px + tên mono 14.5px/600 --txt (ellipsis)
          dòng 2 (mt-2): meta 13px (metaColor) ellipsis
legend  : absolute left:12 top:6 · 13.5px --txt3 · gap14 — flowNote + "✓ xong · ● đang chạy · ○ chưa tới · 🔒 human gate"
loopLbl : absolute left = nx(to)+116, top = loopY-20 · 14px --warn
```

Grid: `NODE_W 208 · NODE_H 52 · PITCH_X 224 · PITCH_Y 128 · X0 12 · Y0 40 · COLS 5 · GRID_W 1120 · SCALE .628`.
Đường ngang: `M nx+208,ny+26 → nx(i+1),ny+26`. Xuống hàng (khi `(i+1)%5===0`): hành lang `y = ny(i)+88`. Loop reject: hành lang `y = ny(from)+76`, đáy→đáy.
`gridH = max(loopY+20, 40 + 128*rows + 12)`.
Tone đường: done → liền, `--acc`, `#ara`; chưa tới → `5 4`, `--track`, `#ar`; loop → `1.6px`, `4 4`, `--warn`, `#arw`. "done" = node nguồn **hoặc** node đích có `kind==='done'`.

Loop mặc định: `cohesive-feature` 8→6, `redraw-design` 3→1 (xem `DEFAULT_LOOP`).
Chữ trong canvas **cố tình lớn** (13 / 13.5 / 14 / 14.5px) vì cả cụm bị scale .628 — giữ nguyên, đừng "sửa cho hợp thang".
Click node → chuyển tab Guide (v3 hiện tại; nên đổi thành mở step detail khi có backend — xem §13.10).
Test bắt buộc với **4 node và 13 node**.

### 6.4 LifecycleStrip — "Vòng đời của step đang chạy"

Nằm trong footer của flow card: `p-[11px_14px]` border-t `--bd` flex-col gap8; nhãn 11px uppercase `.08em` `--txt3`.

```
wrapper: overflow-hidden · height 97
inner  : relative · width 1000 · height 136 · scale(0.705) origin left top
svg    : viewBox "0 0 1000 136", preserveAspectRatio none
  M148,46 L196,46            stroke --acc   w2                 marker #ara
  M332,46 L392,46            stroke --track w2 dash "5 4"      marker #ar
  M524,46 L588,46            stroke --track w2 dash "5 4"      marker #ar
  M736,46 L800,46            stroke --track w2 dash "5 4"      marker #ar
  M264,74 C264,120 196,120 196,80    stroke --warn w1.6 dash "4 4"  marker #arw
  M660,74 C660,126 90,128 90,74      stroke --err  w1.6 dash "4 4"  marker #arw
box  : absolute top:30 · left/width theo LIFECYCLE · p-[6px_9px] · r6 · border 1.5px
       icon 13.5px + tên mono 15px/600 --txt, gap6
nhãn : "Rerun" (left 208, top 100, --warn) · "Reject → về AwaitingWork" (420, 110, --err)
       "Run with Claude" (152,2) · "Mark step done" (340,2) · "pass + cần approve" (530,2) · "Approve" (744,2) — 13.5px --txt3
```

5 box: `AwaitingWork x20 w128 done` · `Running x196 w136 active` · `AutoReview x392 w132 todo` · `HumanReview x588 w148 todo` · `NextStep x800 w110 todo`.
Đây là **sơ đồ tĩnh** trong v3 (toạ độ hard-code). Được phép giữ nguyên hard-code; chỉ `kind` của 5 box là dữ liệu.

### 6.5 Đổi epic đổi những gì

Chọn `DESIGN-001` (`pipelineId==='redraw-design'`) → đổi đồng thời: `flow` (4 node), `pipelineLabel`, `atLabel`, `flowNote`, `rejectLabel`, `config` (6 dòng redraw), `steps` (5 dòng redraw). Các epic còn lại dùng biến thể `cohesive-feature`.
`epic.tokens`, gate banner, history, stepDetail, ship **không đổi theo epic** trong v3 (mock) — xem §13.11.

---

## 7. Tab Home

`overflow-auto p-[20px_22px] flex-col gap-16`.

1. `grid grid-cols-[1fr_1.25fr] gap-16`:
   - **Project readiness** (Card): 3 dòng `p-[11px_14px]` gap11 border-b `--bd2` — mark 12px (tone) · (label 12.5px + value 11px mono `--txt3`) · nút sm (border/chữ theo `actionTone`).
   - **Current epic** (bg `--panel`, border `--acc-bd`, r8, `p-16`, gap12): nhãn `CURRENT EPIC` 10.5px uppercase `--acc-txt` · title 16px/700 · body 12.5px `--txt2` (`main` mono) · hàng gap10: ProgressBar h6 62% + `62%` mono 11.5px + chip mode r999 mono · 2 nút: `Mở Epic` (primary) → tab Epics, `Duyệt gate` (default) → mở modal Gate.
2. **Blocked banner**: bg `--panel`, border `--err-bd`, r8, `p-16`, gap11 — `■` 13px `--err` + tiêu đề 13px/600; hàng 4 nút recovery (12px `p-[7px_12px]` r6 border `--bd` bg `--panel2`).

---

## 8. Tab Builder

`overflow-auto p-[18px_20px] flex-col gap-14`.

**Preset card** (border `--acc-bd`): header wrap gap9 — title `Preset · Redraw Design` · chip mono `redraw-design · 4 step` (`--acc-bg`/`--acc-txt`) · mô tả `flex-1 min-w-0` 11px `--txt3` · nút primary `{presetApplied ? 'Đã cài · Xem pipeline' : 'Apply preset'}` · nút default `{presetOpen ? 'Ẩn chi tiết' : 'Xem chi tiết'}`.
Body (khi mở) `p-[12px_14px] grid grid-cols-2 gap-12`:
- trái: nhãn `SKILLS PRESET CÀI VÀO` + 5 dòng `p-[7px_10px]` r6 border `--acc-bd` bg `--panel2`: `✓` + id mono 11.5px + desc 11px `--txt3` ellipsis.
- phải: nhãn `STEP CỦA REDRAW-DESIGN` + 4 ô `p-[7px_10px]` r6 border (`--err-bd` nếu human gate): dòng 1 = số **w14** mono + tên mono 11.5px + tag 10px `p-[2px_6px]` r4 (`auto-review` → `--hover`/`--txt2`; `human gate` → `--err-bg`/`--err`); dòng 2 desc 11px `--txt3`.
Apply preset → `presetApplied=true`, `toastOpen=true`, `builderTab='Workflows'`.

**Sub-tab bar** gap5: 3 nút `Workflows / Agents / Skills` `p-[7px_13px]` r6 12px border (active `--acc-bd`+`--acc-bg`+`--acc-txt`) + spacer + nút primary `+ Add pipeline|agent|skill` → mở modal Add.

**Workflows** `grid grid-cols-2 gap-12`: card `p-13` gap10 — dòng 1: id mono 12.5px/600 `flex-1` + `{n} step` 11px `--txt3`; dòng 2 = chuỗi node: mỗi node `flex-1 flex items-center` với line 1px `--bd` hai bên và chip `p-[3px_8px]` r5 border `--bd` bg `--panel2` 10.5px `--txt2` nowrap; dòng 3: `Edit` · `Generate from recipe` · `Delete` (danger).

**Agents** `grid grid-cols-2 gap-12`: card `p-13` gap9 — tên 12.5px/600 + chip tier mono (`--acc-bg`/`--acc-txt`); desc 11.5px `--txt3` (chỉ agent có desc); model 11px mono `--txt3`; chip skills wrap 11px; **nếu có capabilities**: hàng `capabilities` + chip (`--acc-bg`) + dòng frontmatter mono 10.5px trong hộp `--panel2` (ellipsis); 3 nút `Edit · Rename · Delete`.

**Skills** = 1 card danh sách: mỗi dòng `p-[9px_14px]` gap11 border-b `--bd2` — id mono 12.5px **w150** ellipsis · desc 11.5px `--txt3` `flex-1` ellipsis · tag source 10.5px r5 (`design` → `--acc-bg`/`--acc-txt`; `custom` → `--warn-bg`/`--warn`; `bundled` → `--hover`/`--txt2`) · `Edit` · `Delete` (`--err`). Footer 11.5px `--txt3`: `Thêm skill bằng 4 cách: chọn template · dán nội dung · upload file · tạo blank.`

---

## 9. Tab Analyze

`overflow-auto p-[20px_22px] flex gap-16`.
- **Trái w520 flex-none** (Card `p-16` gap13): title `Analyze requirement` 13px/600 · ô nguồn requirement (placeholder box bg `--panel2` `min-h-64` 12px `--txt3`) · 5 nút platform `flex-1 text-center p-[9px_6px]` r6 11.5px (active `--acc-bg`/`--acc-bd`/`--acc-txt`) · `grid-cols-2 gap-10`: Parent task `PAY-884` / Project key `PAY` (hộp mono 12px) · hộp xác nhận (`XÁC NHẬN TRƯỚC KHI TẠO` + câu 12px) · nút `Proceed` primary full-width `p-10`.
- **Phải flex-1**: Card `RECENT ANALYSES`; 4 dòng `p-[11px_14px]` gap11 border-b `--bd2`: id mono 11px `--txt3` · title 12.5px `flex-1` · meta 11px `--txt3`.

---

## 10. Tab Tests / Guide / Studio

### 10.1 Tests
`overflow-auto p-[20px_22px] flex-col gap-16`.
- Tiêu đề `Test Agent · E2E pipeline` 13px/600.
- Card `p-[18px_16px]`, stepper ngang: 7 cột `flex-1 flex-col gap-7` — dòng tròn: line `h2 flex-1` + node 28×28 border 2px (radius `50%`, hoặc **`6px` nếu là gate**) + line; tên 11.5px/600 text-center; meta 10.5px `--txt3` text-center.
  Màu node: `done` ring `--acc` fill `--acc` icon `--on-acc` · `active` ring `--warn` fill transparent icon `--warn` · `todo` ring `--track` icon `--txt3` · gate: icon `🔒`, fill transparent, icon color `--warn`, ring `--acc` nếu done ngược lại `--warn`.
  Line trái/phải: `transparent` ở đầu/cuối; `--acc` nếu step done, `--track` nếu chưa.
- `grid-cols-2 gap-14`: card Verdict (border `--acc-bd`): `VERDICT` + `28 pass · 2 healed · 1 fail` 15px/700 + body 12px + nút `Mở report chi tiết`; card gate (border `--warn-bd`): `🔒 2 gate trong pipeline` + giải thích.

### 10.2 Guide
`overflow-auto p-[20px_22px] grid grid-cols-[1.1fr_1fr] gap-16 content-start`.
- Trái: Card `Build · destructive migration` — 5 KVRow (k **w80** mono 11px, tone riêng dòng `why` = `--acc-txt`).
- Phải `flex-col gap-14`:
  1. Card `Ví dụ cấu hình · Redraw Design` (border `--acc-bd`) + link `Copy`; body mono 11.5px `leading-[1.8]` bg `--panel2`, `white-space:pre`.
  2. Card `Test cho Redraw Design` + badge `7 test · pass`; 7 dòng: `✓` + label 11.5px `--txt2` + file mono 10.5px `--txt3`.
  3. Card `Doctor` + link `Chạy --fix`; 5 dòng: mark + label 12.5px + action (`Fix` màu `--warn`).
  4. Hàng gập log: `p-[11px_14px]` r8 border `--bd` — caret + `Log nâng cao · 20 event gần nhất` + `debug`; khi mở hiện CodeBlock 5 dòng mono 11.5px `leading-[1.9]`.

### 10.3 Studio
`overflow-auto p-[20px_22px] flex-col gap-16`.
1. **Workflow pack**: tiêu đề + ghi chú; `grid-cols-4 gap-10`; card `p-13` r8 gap7 (active `--acc-bg`/`--acc-bd`): id mono 12.5px/600 · desc 11.5px `--txt2` · agents 11px `--txt3`.
2. `grid-cols-2 gap-16`:
   - Card `Model provider` + nút `Check providers`; 3 dòng: mark · (id mono 12.5px + note 11px `--txt3`) · action 11.5px (`Đang dùng` `--txt3`, còn lại `--acc-txt`).
   - Card `Capabilities`; 5 dòng click-to-toggle: health `✓/✕` 11px · (tên mono 12.5px + chip kind 10px r4) · Toggle **34×19** knob 15.
3. Card `Artifact policy` + `.aidlc/artifacts.yaml` mono + spacer + `✓ JSON hợp lệ` (`--acc-txt`) + nút `Save` primary; body CodeBlock 9 dòng bg `--panel2` `p-[13px_14px]` `leading-[1.85]`; footer 11.5px `--txt3`.

---

## 11. Modal & Toast

Chung: overlay `absolute inset-0 bg-black/50 flex justify-center items-start`, panel bg `--panel2` border `--bd` r8–9 `shadow-modal`, `flex-col`; header/footer `flex-none`, body `flex-1 min-h-0 overflow-auto p-16 flex-col gap-14`; header có nút `esc` (11px, border `--bd`, r5, `p-[3px_8px]`); footer trái là **lệnh CLI tương đương** (11px mono `--txt3`).

| Modal | z | padding-top overlay | width | max-height |
|---|---|---|---|---|
| Gate | 30 | 90 | 620 | — |
| New Epic | 32 | 56 | 820 | 790 |
| Add (pipeline/agent/skill) | 34 | 60 | 780 | 770 |
| Toast | 36 | — | 352 (`right:18 bottom:38`) | — |

### 11.1 Gate modal
Panel border **2px** `--err-bd`. Header bg `--err-bg` `p-[14px_16px]` gap10: `🔒` + (title 13.5px/700 `Hard gate · merge_default_branch` + sub 11.5px) + `esc`.
Body: đoạn "Vì sao cần duyệt…" 12.5px `--txt2` `leading-[1.65]`; hộp `Nếu approve` (bg `--panel`, border `--bd`, r6, `p-12`, gap7 — nhãn 10.5px uppercase + 2 dòng); field `Lý do (bắt buộc khi reject)` = input bg `--panel` border `--bd` r6 `p-[9px_11px]` 12.5px; dòng `--err` 11.5px.
Footer `p-[12px_16px]` justify-end gap8: `Huỷ` · `Reject` (danger) · `Approve & tiếp tục` (primary xl).

### 11.2 New Epic modal
Header: logo 22×22 `--acc` + (title `New Epic` 13.5px/700 + sub) + `esc`.
Body theo thứ tự: Tiêu đề (input 13px) · Mô tả/AC (textarea placeholder `min-h-62`) + 3 chip nguồn (`Từ REQ-018`, `Từ Jira PAY-884`, `Từ selection trong editor`) · **Loại công việc** 5 nút `flex-1` · banner context (border `--acc-bd`, bg `--acc-bg`, `◉` + 2 dòng + nút `Đổi revision`) · **Pipeline**: nhãn + chip `đề xuất: {Bug ? 'quick-fix' : 'cohesive-feature'}` + `grid-cols-4 gap-6` 4 ô profile (label 12px/600 + desc 10.5px) + dòng compile mono 11.5px trong hộp `--panel` · `grid-cols-2 gap-12`: Workflow pack (4 RadioRow: mark + label mono + note) / Autonomy khởi điểm (4 RadioRow mode + dòng nhắc 11px) · bảng **Sẽ được lock cho Epic này** (header + link `Override`; 5 dòng: k **w80** 11px `--txt3` · v mono 12px ellipsis · why 10.5px `--txt3`) · cảnh báo context (border `--warn-bd`) + link `Refresh trước`.
Footer: CLI `{profile==='project-context' ? '/aidlc-project-context  · hoặc Run with Claude từng step' : (mode==='unattended' ? '/aidlc-autonomous-delivery <delivery-id>' : '/aidlc-{profile} <epic-id>')}` + `Huỷ` · `Tạo draft` · `Tạo & chạy` (primary).

### 11.3 Add modal (3 biến thể theo `builderTab`)
Header: title `Add pipeline|agent|skill` + sub riêng + `esc`.
Body:
- **Cách tạo** — 3 ô (Workflows/Agents) hoặc 4 ô (Skills) `flex-1`: label 12px/600 + desc 10.5px.
- `grid-cols-2 gap-12`: trái = id (label riêng: `Pipeline id` / `Tên agent` / `Skill id`; input **mono** 12.5px; hint 10.5px — `Id đã tồn tại — chọn tên khác` (`--err`) hoặc `chữ thường, gạch ngang` (`--txt3`)). Phải = **Sẽ ghi vào** (hộp mono ellipsis) + 2 chip scope `project (.aidlc)` / `user (~/.claude)`.
  `path = (scope==='user' ? '~/.claude/' : '.aidlc/') + {Workflows:'pipelines/',Agents:'agents/',Skills:'skills/'} + (id||'<id>') + (Skills ? '.md' : '.yaml')` — ⚠ mâu thuẫn §13.4.
- **Workflows**: danh sách step (hàng công cụ: `Copy từ cohesive-feature`, `+ Thêm step`); mỗi step `p-[8px_11px]` r6 border `--bd` bg `--panel`: `⠿` (cursor grab) · số **w16** mono · tên mono 12.5px · tag (`auto` `--hover` / `human gate` `--err-bg`+`--err`) · `Sửa` · `Xoá` (`--err`); ghi chú 11px.
- **Agents**: `grid-cols-2` Tier (4 nút `fast/balanced/deep/review`) + Model (hộp mono, `deep → claude-opus-4`, còn lại `claude-sonnet-4-5`, caret `▾`); System prompt (textarea `min-h-58`); **Skills gán cho agent** — 6 chip toggle (`◉/○` + tên mono 11.5px); **Capabilities** — 4 chip toggle (figma/files/github/web) + CodeBlock frontmatter 8 dòng sinh động theo lựa chọn.
- **Skills**: label body theo nguồn (`Nội dung file đã chọn` / `Nội dung template` / `Nội dung skill`) + CodeBlock 7 dòng `min-h-120` `leading-[1.85]`; hàng xác nhận frontmatter + nút `Validate lại`.
- **ValidationPanel** (mọi biến thể): header `Validation` + badge r999 `{failCount} lỗi cần sửa` (`--err-bg`/`--err`) hoặc `Hợp lệ` (`--acc-bg`/`--acc-txt`); mỗi dòng `p-[8px_12px]` border-b `--bd2`: `✓/✕` + label 11.5px `--txt2` + link fix nếu có.
  **Số check thực tế trong v3: Workflows 3 · Agents 4 · Skills 3** (nội dung ở `IMPLEMENT.md §5.7` — nhưng §13.5).
- Cảnh báo cuối (border `--warn-bd`) — 3 chuỗi riêng theo loại.
Footer: CLI (`aidlc pipeline add {id} --from {src}` / `aidlc agent add {id} --tier {tier}` / `aidlc skill add {id} --scope {project|user}`) + `Huỷ` · `Lưu nháp` · `Tạo pipeline|agent|skill` (primary).

### 11.4 Toast
`absolute right:18 bottom:38 z-36 w352` bg `--panel2` border `--acc-bd` r8 `shadow-toast` `p-[12px_13px]` gap9: `✓` + (title 12px/600 + body 11.5px) + `✕`; 2 nút: `Reload VS Code` (primary sm) · `Để sau` (default sm). Hiện sau `preset.apply` và `builder.save`.

---

## 12. MOCK DATA — bắt buộc

Backend chưa có → **toàn bộ dữ liệu hiển thị hiện là giả**. Yêu cầu:

1. Mọi control bind vào mock phải có `data-mock="true" data-mock-id="<id>"` (dùng `mock()` hoặc `<MockBoundary>` trong `MockBoundary.tsx`). Id lấy đúng từ `MOCK_REGISTRY` trong `mock-data.ts` (41 mục).
2. `data-mock-level="block"` cho **khối/card** (thêm nhãn đỏ `MOCK: <id>` ở góc); `inline` cho từng ô chữ.
3. Lớp phủ đỏ: `outline 1px dashed #FF3B30` + sọc chéo đỏ 10% (block: outline 2px liền + nhãn). CSS đã có sẵn ở `tokens.css`, bật bằng class `.mock-visible` trên `<html>`.
4. Cờ bật: mặc định **BẬT** khi `import.meta.env.DEV`; thêm setting `aidlc.showMockData` + command `aidlc.debug.toggleMock` để bật/tắt trong VS Code. Khi tắt, UI trông đúng 100% như design.
5. Mỗi mock trong registry có cột `replaceWith` = nguồn thật sẽ thay. Khi nối backend: xoá import từ `mock-data.ts`, xoá `data-mock` → hết đỏ.
6. Dữ liệu **CATALOG** (pipeline bundled, mô tả preset, danh sách platform/pack/mode/type) **không** tô đỏ — nhưng vẫn phải đọc từ file thật khi store sẵn sàng.

Khối phải tô đỏ mức `block` (nhìn thấy ngay): Quota tracker · MCP list · Recent epics · Epic list · Parallel epics card · FlowCanvas · LifecycleStrip · Epic config · Gate banner · Step list · Step detail · History · Ship strip · Home readiness/current/blocked · Builder flows/agents/skills · Analyze form + list · Tests pipeline · Guide help/tests/doctor/events · Studio providers/capabilities/policy · New Epic lock table.

Grep để tìm lại: `rg 'data-mock-id="' packages/extension/src/webview/v3` hoặc `rg 'mock-data' -l`.

---

## 13. Mâu thuẫn với tài liệu hiện có — **cần bạn quyết, tôi không tự chọn**

| # | Mâu thuẫn | v3 (file design) | IMPLEMENT.md / UI_SPEC.md | Ảnh hưởng |
|---|---|---|---|---|
| 1 | **Nguồn sự thật** | brief này chốt v3 | cả 2 doc ghi "version đã chốt: `AIDLC Workspace v2.dc.html`" | Cần cập nhật 2 doc, nếu không người sau lại code theo v2 |
| 2 | **Command palette** | **không tồn tại** trong v3 | UI_SPEC §8 + IMPLEMENT §5.7 mô tả modal 640×560; IMPLEMENT §3 có `aidlc.palette.open` "quick pick 41 command" | Implement hay bỏ? Không có spec UI trong v3 để dựng |
| 3 | **LifecycleStrip** | có, hard-code 1000×136 scale .705 | **không được nhắc** ở cả 2 doc | Cần thêm vào doc; toạ độ hard-code có được chấp nhận không? |
| 4 | **Đường dẫn agent** | modal Add ghi `.aidlc/agents/<id>.yaml` (hoặc `~/.claude/agents/<id>.yaml`) | IMPLEMENT §1: agent = `.claude/agents/<id>.md` **frontmatter markdown** | Sai định dạng file sẽ hỏng AgentStore. Đề xuất: sửa v3 → `.md`, nhưng cần bạn xác nhận |
| 5 | **Số check validation** | Workflows **3**, Agents **4**, Skills **3** | IMPLEMENT §5.7 viết "ValidationPanel — 4 check" cho mọi loại | Đếm nào đúng? |
| 6 | **Định danh epic** | list dùng `EPIC-142…`, `DESIGN-001`; card song song dùng `PAYMENTS-001`, `EXPORT-001`, `NOTIFICATIONS-001` | model chỉ nêu `PAYMENTS-001 \| DESIGN-001` | Hai hệ id cùng màn hình — thống nhất theo hệ nào? |
| 7 | **EpicState** | nhãn UI: `In progress / Pending / Done / Failed` | type: `draft/ready/running/waiting-for-user/blocked/completed` | Thiếu bảng map. Đề xuất: `running+waiting-for-user → In progress`, `draft+ready → Pending`, `completed → Done`, `blocked → Failed` — **cần xác nhận** |
| 8 | **2 trục "mode"** | chip header epic = `guide/assist/auto/unattended`; radio trong config = `Guided / Autonomous Delivery` | doc chỉ có `RunMode = 'guided'\|'autonomous'` | Thiếu 1 trục trong model. Đề xuất thêm `executionMode` riêng |
| 9 | **StepState** | UI có kind `rerun` (dòng "· lần trước") | type `StepState` không có `rerun` | Thêm `rerun` hay coi là view-only? |
| 10 | **Click node flow** | mở tab **Guide** | không quy định | Hành vi này giống placeholder; đề xuất mở step detail |
| 11 | **Dữ liệu không đổi theo epic** | tokens, gate banner, history, stepDetail, ship giữ nguyên khi đổi epic; Home luôn 62%/EPIC-142 | doc giả định mọi field theo epic | Là hạn chế của mock hay hành vi mong muốn? Đề xuất: tất cả theo epic |
| 12 | **Thang chữ canvas** | 13 / 13.5 / 14 / 14.5px | UI_SPEC §5 ghi "13.5 / 14 / 14.5 / 16px" | Lấy theo v3 (13 cho meta, không có 16) |
| 13 | **Command còn thiếu** | v3 có: đổi theme, đổi sub-tab Builder, gập section Following/Not, gập Quota, gập tools/search, gập preset, gập log, chọn pack Studio, chọn platform Analyze, toggle capability, `Save` artifact policy, `Proceed` Analyze, `Kiểm tra độc lập`, `Đổi revision`, `Override` lock, `Validate lại`, `Copy` ví dụ cấu hình | IMPLEMENT §3 chỉ liệt kê 25 command | Cần bổ sung ~17 command id (UI-only vs backend) |
| 14 | **WorkspaceVM** | v3 có 7 màn hình | `WorkspaceVM` chỉ khai báo `sidebar` + `epics` | Phải mở rộng VM cho Builder/Analyze/Tests/Guide/Studio (đã có type sẵn ở `types.ts`) |
| 15 | **Bộ chuyển Dark/Light** | nằm ngoài khung 1440 | không nhắc | Là chrome của design doc — **không** implement (theme lấy từ VS Code) |

---

## 14. Checklist nghiệm thu

- [ ] Copy nguyên 2 khối token, không đổi một giá trị nào; theme đổi bằng class gốc.
- [ ] Inter + JetBrains Mono; **mọi** id/path/command/%/số liệu dùng mono.
- [ ] Shell 1440×920 đúng 5 lớp và chiều cao 36 / 34 / 24.
- [ ] 7 tab + statusText/cmdHint đúng bảng §3.
- [ ] Sidebar 300px, quota `% = available`, một mẫu số mỗi dòng, ngưỡng 60/25.
- [ ] Epics: 3 trạng thái bề rộng (316 / 46 / mở search), 2 section gập, filter + search hoạt động, empty state.
- [ ] FlowCanvas dùng `flow-layout.ts`, test **4 node và 13 node**, endpoint khớp cạnh node, `gridH` đúng.
- [ ] Đổi sang `DESIGN-001` đổi đủ 7 thứ ở §6.5.
- [ ] 3 modal + Toast + ValidationPanel đúng số check từng loại.
- [ ] Builder 3 sub-tab; Apply preset → toast + về Workflows.
- [ ] Studio: toggle capability, chọn pack, provider list.
- [ ] **Mọi control mock có `data-mock-id` khớp `MOCK_REGISTRY`; bật `.mock-visible` thấy đỏ, tắt thì trông y hệt design.**
- [ ] So sánh side-by-side với `AIDLC Workspace v3.dc.html` ở **cả dark và light**, lệch spacing ≤ 1px, lệch màu = 0.
