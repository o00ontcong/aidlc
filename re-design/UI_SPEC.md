# UI Spec — AIDLC Workspace (pixel-level)

> `IMPLEMENT.md` = kiến trúc (data model, store, command, test).
> **File này = spec UI.** Dùng khi cần dựng lại giao diện giống 100%.

## 0. Nguồn sự thật

**`AIDLC Workspace v2.dc.html` là spec chuẩn, không phải tài liệu này.** Mọi giá trị dưới đây trích từ nó. Khi lệch, tin file.

Cách tra số đo chính xác khi code:

```bash
# mở file trong browser rồi đo trực tiếp
document.querySelector('[style*="width:316px"]')            # cột list epic
getComputedStyle($0).padding                                # padding thật
[...document.querySelectorAll('div')].map(d=>d.style.fontSize)  # thang chữ
```

Quy ước đọc file: mọi style là **inline**, không class. Tìm text tiếng Việt của khối bạn cần rồi đọc `style=` của element chứa nó — đó là spec đầy đủ của khối đó.

---

## 1. Design tokens

Copy nguyên khối `.thm-dark` / `.thm-light` từ `<style>` trong helmet. **Không tự chọn màu mới.**

| Token | Dark | Light | Dùng cho |
|---|---|---|---|
| `--bg` | `#1B1D1E` | `#FFFFFF` | nền editor |
| `--panel` | `#202324` | `#F7F8F8` | nền card |
| `--panel2` | `#262A2B` | `#FFFFFF` | nền nổi trong card, modal |
| `--side` | `#1E2122` | `#F2F2F7` | sidebar, tab bar |
| `--chrome` | `#232729` | `#EFF1F1` | title bar |
| `--bd` | `rgba(255,255,255,.08)` | `rgba(12,12,13,.12)` | viền chính |
| `--bd2` | `rgba(255,255,255,.04)` | `rgba(12,12,13,.06)` | viền phân dòng |
| `--hover` | `rgba(255,255,255,.05)` | `rgba(12,12,13,.04)` | nền chip trung tính |
| `--txt` / `--txt2` / `--txt3` | `#E6E8E8` / `#9AA0A0` / `#6E7574` | `#191C1D` / `#5C5F5F` / `#8A8F8F` | cấp 1 / 2 / 3 |
| `--acc` | `rgb(20,197,96)` | `rgb(20,197,96)` | nền nhấn |
| `--acc-txt` | `rgb(20,197,96)` | `rgb(0,138,64)` | **chữ** nhấn (light phải đậm hơn) |
| `--acc-bg` / `--acc-bd` | `.14` / `.4` alpha | `.12` / `.35` | nền/viền vùng nhấn |
| `--on-acc` | `#0E1A12` | `#FFFFFF` | chữ trên nền `--acc` |
| `--warn` | `#FEBC2E` | `#8A6100` | cảnh báo |
| `--err` | `#F08A84` | `#DE3730` | lỗi |
| `--track` | `rgba(255,255,255,.10)` | `rgba(12,12,13,.10)` | rãnh progress |

Theme áp bằng class trên container gốc (`.thm-dark` / `.thm-light`). Trong extension thật: map sang biến VS Code (`--vscode-editor-background`…) hoặc đọc `ColorThemeKind` rồi set class.

**Font**: Inter (400/500/600/700) cho UI; JetBrains Mono (400/500) cho **mọi** id, path, command, số liệu.

**Thang chữ** (đúng các giá trị đang dùng, không làm tròn):
`9.5 · 10 · 10.5 · 11 · 11.5 · 12 · 12.5 · 13 · 13.5 · 15 · 16 · 17px`
- `10–10.5px` — nhãn phụ, đơn vị, reset time
- `11–11.5px` — meta, nút nhỏ, mô tả
- `12–12.5px` — body, tên item, nút chính
- `13–13.5px` — tiêu đề modal, tiêu đề khối lớn
- `15–17px` — số liệu lớn, tiêu đề epic

**Radius**: `4` (tag nhỏ) · `5` (chip) · `6` (nút, ô input, row) · `7` (card nhỏ) · `8–9` (card lớn, modal) · `999px` (badge tròn, toggle).

**Gap**: `2 · 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 11 · 12 · 14 · 16px`. Luôn dùng flex/grid + `gap`, **không** margin giữa sibling.

---

## 2. Shell — khung ngoài

```
1440 × 920, radius 10, border 1px rgba(255,255,255,.10)
├─ title bar          h 36   bg --chrome   3 dot 10px (#FF5F57 #FEBC2E #28C840), gap 7
├─ body               flex 1
│  ├─ activity bar    w 48   bg --side   icon 34×34 radius 6, gap 4
│  │                         item active: bg --acc-bg, chữ --acc-txt,
│  │                         + thanh dọc 2px --acc ở left:-7 top:5 bottom:5
│  ├─ sidebar         w 300  bg --side, border-right --bd
│  └─ editor area     flex 1
│     ├─ editor tabs  h 34   tab active: bg --bg + border-top 1px --acc
│     ├─ view tabs    h ~40  bg --panel, tab active: border-bottom 2px --acc
│     └─ view body    flex 1, mỗi tab tự cuộn
└─ status bar         h 24   bg --acc, chữ --on-acc 11px
```

**Bắt buộc**: mọi vùng cuộn có `box-sizing:border-box` + `overflow:auto`. Thiếu cái đầu → nội dung cuối bị cắt.

Card trong vùng cuộn dọc phải có `flex:none`, nếu không flex sẽ bóp chiều cao (bug đã gặp với flow canvas).

---

## 3. Sidebar (w 300)

Thứ tự khối, từ trên xuống:

1. **Project bar** — padding `11px 12px 9px`, border-bottom `--bd`. Nhãn `PROJECT` 10px uppercase letter-spacing `.09em` màu `--txt3`; tên project 12.5px 600; nút `Đổi` 11px viền `--bd` radius 5 padding `3px 7px`.
2. **Hai nút** — `Ask AIDLC` (bg `--acc`, chữ `--on-acc`, 600) và `Analyze` (viền `--bd`), mỗi nút `flex:1`, padding 8, radius 6, 12px.
3. **Quota tracker** — xem §7.
4. **Recent epics** — nhãn 10px uppercase + link `Tất cả` (`--acc-txt`, mở tab Epics). Mỗi dòng: dot 7px + tên 12px + ★, padding `6px 8px`, radius 6, bg `--panel2`, viền `--bd`.
5. **Workflow templates** — chip mono 11px, padding `4px 8px`, radius 5.
6. **MCP servers** — dot trạng thái + tên mono + state 10.5px.
7. **Footer** — `Mở Workspace`, viền `--acc-bd`, chữ `--acc-txt`, padding 9, radius 6.

Nội dung giữa cuộn (`flex:1; overflow:auto; padding:11px 12px; gap:14px`); project bar và footer `flex:none`.

---

## 4. Tab Epics — layout 2 cột

### 4.1 Cột trái — list

Ba trạng thái bề rộng:
- mở: **316px**
- gập: **46px** (rail)

**Header (1 dòng, mặc định đóng phần tìm kiếm)** — padding `7px 10px`:
`▸ EPICS` (10px uppercase 600 `--txt3`) + tổng số + chip lọc + nút `⌕` + nút `‹`. Nút vuông 24×24 radius 6 viền `--bd`.
Chip lọc: 10px, `padding:1px 7px`, radius 999; đang lọc → `--acc-bg` / `--acc-txt`, mặc định → `--hover` / `--txt3`.

**Mở phần tìm kiếm** (bấm header hoặc `⌕`): ô search (bg `--panel2`, viền `--bd`, radius 6, padding `6px 9px`, input 11.5px) + dải pill filter (10.5px, `padding:3px 7px`, radius 999) — 5 pill kèm số đếm: `All · In progress · Pending · Done · Failed`.

**Danh sách** — hai khu gập được: `★ FOLLOWING` và `NOT FOLLOWING`, mỗi khu có caret `▾/▸` + số lượng.
Row epic (một dòng, cao ~26px): `padding:5px 8px`, radius 5, gap 8 →
`dot 7px` · `tên 11.5px` (ellipsis) · `thanh progress 26×2px` · `% 10px mono, w30 phải` · `★ 11px`.
Row đang chọn: bg `--acc-bg`, viền `--acc-bd`. `cursor:grab` (kéo đổi khu).

**Rail (46px)**: cột dot 26×26 radius 6, ★ 8px ở góc trên phải; nút `›` để mở lại.

**Empty state**: ô 38×38 viền dashed + `No epics match` 12.5px + gợi ý + nút `Xoá bộ lọc`.

**Footer** — `+ New Epic` (`flex:1`, bg `--acc`) + nút `⚡` icon-only (Autonomous Delivery), padding `7px`.

### 4.2 Cột phải — chi tiết epic

Thứ tự khối (mỗi khối `flex:none`, gap 14, padding `16px 18px`):

1. **Charter alignment strip** — viền `--warn-bd`, bg `--warn-bg`, radius 7, padding `9px 12px`: `▲` + câu giải thích + link `Xem xung đột`.
2. **Header epic** — id mono 11.5px `--txt3` · title 17px 700 · StatusBadge (icon + state, radius 999, `padding:3px 9px`, 600). Dòng dưới: progress 6px + `%` + tokens mono. Bên phải: chip run mode radius 999 viền `--acc-bd` + dropdown 280px.
3. **Project Context card** — pipeline chip + badge `published · rev-7` + 7 step chip mono + nút `Mở context` / `Refresh context`.
4. **Parallel epics card** — mỗi dòng: mark · id mono (w130) · title · branch · PR (w52) · state (w98, phải). Dưới là checklist độc lập.
5. **Flow canvas** — §5.
6. **Epic config card** — 6 dòng `k` (w96) / `v` mono / nguồn (`epic override` màu `--acc-txt` vs `từ project` màu `--txt3`) / nút `Sửa`; dưới là 2 radio run mode.
7. **Gate banner** — viền **2px** `--err-bd`, bg `--err-bg`, radius 8: 🔒 + tiêu đề 13px 700 + badge `waiting-for-user` + hộp mô tả hậu quả + hàng nút.
8. **Step list** — mỗi step: icon trạng thái (w18 giữa) · tên 12.5px · meta 11px mono · nút theo ngữ cảnh. Step fail: bg `--err-bg` + dòng lỗi mono `--err` thụt lề 28px. Cuối: 3 nút chung + `resume từ checkpoint`.
9. **Chi tiết step + History** — grid `1.35fr 1fr`.
10. **Ship strip** + **action bar**.

StatusBadge map (state → icon, bg, fg, nhãn):
| state | icon | bg | fg | nhãn |
|---|---|---|---|---|
| In progress | `●` | `--warn-bg` | `--warn` | waiting-for-user |
| Failed | `✕` | `--err-bg` | `--err` | blocked |
| Done | `✓` | `--acc-bg` | `--acc-txt` | completed |
| Pending | `○` | `--hover` | `--txt2` | draft |

---

## 5. Flow canvas — phần dễ làm sai nhất

**Tuyệt đối không hard-code toạ độ.** Tất cả derive từ grid; đây là lý do bản thiết kế phải sửa nhiều vòng.

```js
// grid: 5 node / hàng
const NODE_W = 208, NODE_H = 52, PITCH_X = 224, PITCH_Y = 128, X0 = 12, Y0 = 40;
const nx = i => X0 + PITCH_X * (i % 5);
const ny = i => Y0 + PITCH_Y * Math.floor(i / 5);

// nối ngang: cạnh phải node i → cạnh trái node i+1, tại tâm y
`M${nx(i)+NODE_W},${ny(i)+NODE_H/2} L${nx(i+1)},${ny(i)+NODE_H/2}`

// xuống hàng (i+1 chia hết 5): corridor y = ny(i)+88
`M${nx(i)+104},${ny(i)+NODE_H} L${nx(i)+104},${ny(i)+88} L${nx(i+1)+104},${ny(i)+88} L${nx(i+1)+104},${ny(i+1)}`

// loop reject: corridor y = ny(from)+76, đáy node → đáy node
`M${nx(from)+104},${ny(from)+NODE_H} L${nx(from)+104},${loopY} L${nx(to)+104},${loopY} L${nx(to)+104},${ny(to)+NODE_H}`

// canvas
gridH   = Math.max(loopY + 20, Y0 + PITCH_Y * rows + 12);
viewBox = `0 0 1120 ${gridH}`;
scale   = 0.628;                      // để lọt cột phải
wrapperH= Math.round(gridH * scale);  // overflow:hidden
```

SVG dùng `preserveAspectRatio="none"`, `position:absolute; inset:0; width:100%; height:100%` — **cùng hệ toạ độ với node**, nên node đặt `position:absolute` theo px của grid rồi scale cả cụm bằng `transform:scale()` + `transform-origin:left top`.

Vì cả cụm bị scale 0.628, **chữ trong canvas phải to hơn**: dùng `13–16px` (sau scale ≈ `8–10px`... không — sau scale ≈ `8.2–10px` là quá nhỏ, nên thực tế thang trong canvas là `13.5 / 14 / 14.5 / 16px` để sau scale ra ≈ `8.5–10px` tương đương `11–12.5px` ở tỉ lệ 1:1 của các khối khác). Cứ giữ đúng các số này.

Node style theo trạng thái:
| kind | icon | border | bg | meta color |
|---|---|---|---|---|
| done | `✓` | `1.5px solid --acc` | `--acc-bg` | `--txt3` |
| active | `●` | `2px solid --warn` | `--warn-bg` | `--warn` |
| gate | `🔒` | `2px solid --err-bd` | `--err-bg` | `--err` |
| todo | `○` | `1.5px dashed --bd` | `--panel` | `--txt3` |

Marker mũi tên: 3 `<marker>` (`ar` xám, `ara` xanh, `arw` vàng), `markerWidth/Height 7`, `refX 6 refY 3.5`. Đường đã đi: liền, `--acc`, `ara`. Chưa tới: `stroke-dasharray="5 4"`, `--track`, `ar`. Loop: `1.6px`, `4 4`, `--warn`, `arw`.

Nhãn loop đặt tại `left: nx(to)+116, top: loopY-20`.

Dòng đầu canvas (`left:12 top:6`) chứa ghi chú pipeline + chú giải `✓ xong · ● đang chạy · ○ chưa tới · 🔒 human gate` — **để trong canvas, không nhồi vào header** (header 724px không đủ chỗ).

Pipeline hiện có: `cohesive-feature` 13 step (3 hàng) · `redraw-design` 4 step (1 hàng) · `project-context` 7 step. Canvas tự co theo số hàng.

---

## 6. Component inventory

Dựng đúng 14 component này là dựng được toàn bộ UI:

| # | Component | Props | Xuất hiện ở |
|---|---|---|---|
| 1 | `StatusBadge` | state | header epic, list |
| 2 | `Pill` (filter/chip) | label, count, active | list filter, template, skill tag |
| 3 | `EpicRow` | epic, selected, followed | cột trái |
| 4 | `ProgressBar` | pct, color, height(2/3/5/6) | khắp nơi |
| 5 | `Toggle` | on | capability, artifact policy, provider |
| 6 | `RadioRow` | label, desc, selected | run mode, pack, autonomy |
| 7 | `Card` | title, chips, actions, body | mọi khối |
| 8 | `KVRow` | k(w96), v(mono), src, action | epic config, lock table |
| 9 | `StepRow` | step, actions[], error | step list |
| 10 | `FlowCanvas` | nodes[], loop{from,to} | epic detail |
| 11 | `GateBanner` | kind, consequence, actions | epic detail |
| 12 | `Modal` | title, sub, body, footer | New Epic, Add *, Gate |
| 13 | `ValidationPanel` | checks[] | mọi form Add |
| 14 | `Toast` | title, body, primary action | sau Apply preset |

Nút — 4 biến thể:
```
primary  bg --acc,      chữ --on-acc, 600
default  viền --bd,     chữ --txt
danger   viền --err-bd, chữ --err
ghost    không viền,    chữ --acc-txt (dùng như link)
```
Cỡ: nhỏ `padding:4px 9px / 11px` · thường `5px 10px / 11.5px` · lớn `9px 14–16px / 12.5px`.

---

## 7. Quota tracker (sidebar)

Card mỗi provider (`--panel2`, viền `--bd`, radius 7):
- **Dòng đầu** `padding:7px 9px`, gap 8: icon 22×22 radius 6 (bg/fg riêng từng provider) · tên 11.5px 600 + dòng state (dot 5px + text 10px) · **% available 12.5px 700** + nhãn `available` 9.5px · toggle 26×15.
- **Quota rows** (border-top `--bd2`, `padding:6px 9px 7px`): mỗi quota là dot 5px + label 10.5px + `used / limit` 10px mono + **% 10.5px 600 mono**; dưới là thanh 3px + thời gian reset 9.5px (w62, phải).

**Quy tắc số**: mọi thanh và % là **quota còn lại** — `pct = (limit - used) / limit`. Một mẫu số cho mỗi dòng. % ở đầu card = quota căng nhất của provider (`Math.min`).

Ngưỡng màu: `≥60%` → `--acc` · `25–59%` → `--warn` · `<25%` → `--err`. Provider chưa nối: `—`, `No connections`, toggle tắt, viền `--bd2`.

Header: `QUOTA TRACKER` + `N connected · M chưa nối` + caret gập. Footer: `Thêm provider` / `Routing`.

---

## 8. Modal

Chung: overlay `rgba(0,0,0,.5)`, `padding-top` 56–90px, panel bg `--panel2`, radius 8–9, `box-shadow:0 30px 70px rgba(0,0,0,.5)`, header/footer `flex:none` + body `flex:1; overflow:auto; padding:16px; gap:14px`. Header có nút `esc`.

| Modal | width | max-height | Nội dung riêng |
|---|---|---|---|
| Gate | 620 | — | viền **2px** `--err-bd`, header bg `--err-bg`, ô reason, dòng "không có tuỳ chọn đừng hỏi lại", 3 nút |
| New Epic | 820 | 790 | title, mô tả, 3 nút nhập nhanh, loại việc, khối context rev-7, pipeline 4 ô + dòng compile, pack + autonomy, bảng lock, cảnh báo context, footer CLI + 3 nút |
| Add pipeline/agent/skill | 780 | 770 | cách tạo, id + hint, path + scope, phần riêng theo loại, ValidationPanel, cảnh báo, footer CLI + 3 nút |
| Command palette | 640 | 560 | ô `> aidlc`, list command + id mono + tag V2/V3/AST |

ValidationPanel: header + badge `N lỗi cần sửa` (`--err-bg`) hoặc `Hợp lệ` (`--acc-bg`); mỗi dòng `✓/✕` + mô tả + link fix (`Tạo agent` / `Tạo skill`).

---

## 9. Quy tắc chống lỗi layout (đã gặp thật)

1. Mọi chip/badge/nút trong header: `flex:none; white-space:nowrap`. Chỉ **một** phần tử co giãn (câu mô tả) với `flex:1; min-width:0`.
2. Text cần cắt: `min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis` — thiếu `min-width:0` thì flex không cho co.
3. Card trong cột cuộn: `flex:none`.
4. Vùng cuộn: `box-sizing:border-box`.
5. Header quá 5 phần tử → chuyển bớt vào body (như legend flow canvas).
6. Toạ độ vẽ: derive từ công thức grid, không viết tay.
7. Không glyph mũi tên `→` nằm cạnh đường SVG cùng chức năng (bị nhân đôi thị giác).

---

## 10. Checklist dựng lại

- [ ] Copy nguyên 2 khối token, không đổi giá trị
- [ ] Load Inter + JetBrains Mono; mọi id/path/command dùng mono
- [ ] Shell 1440×920 với 5 lớp (title · activity · sidebar · editor · status)
- [ ] 14 component ở §6, 4 biến thể nút
- [ ] Epics 2 cột với 3 trạng thái bề rộng cột trái
- [ ] FlowCanvas theo công thức §5, test với cả 4 và 13 step
- [ ] 4 modal ở §8 + ValidationPanel + Toast
- [ ] Quota tracker: % là **available**, một mẫu số/dòng
- [ ] Chạy checklist §9 trên từng screen
- [ ] So sánh side-by-side với `AIDLC Workspace v2.dc.html` ở cả dark và light
