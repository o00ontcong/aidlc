# Hướng dẫn implement — AIDLC VS Code Extension

Version đã chốt: **`AIDLC Workspace v2.dc.html`** (bản làm việc tiếp tục ở `AIDLC Workspace.dc.html`; bản đầu tiên còn ở `AIDLC Extension v1.dc.html`).

Tài liệu này map từng phần thiết kế sang code thật. Thiết kế là nguồn sự thật về UX; phần dưới là thứ tự làm để không phá cái đang chạy.

---

## 0. Nguyên tắc kiến trúc rút ra từ thiết kế

1. **Project Context là baseline chung, Feature Epic là đơn vị chạy độc lập.** Epic capture snapshot của context (`capture-context`) rồi tự chạy — không có work package, không có worker epic.
2. **Song song = nhiều feature epic độc lập**, mỗi epic một branch, một PR, một terminal Claude. Extension không tự điều phối agent.
3. **Event log là audit source; state.json chỉ là projection** để đọc nhanh và phục hồi.
4. **Không có CLI chạy ngầm.** Mọi hành động mở một lệnh nhìn thấy được trong terminal Claude.
5. **Hard/human gate không mode nào vượt được.** Agent không merge default branch.
6. **Cấu hình thuộc từng epic** và user sửa được; project chỉ cấp mặc định.
7. **Mọi step có thể fail hoặc bị ngưng** → step nào cũng phải rerun được, và resume phải giữ phase đã approve.

---

## 1. Data model

```ts
// core/model.ts
type EpicState = 'draft' | 'ready' | 'running' | 'waiting-for-user' | 'blocked' | 'completed';
type StepState = 'awaiting-work' | 'running' | 'auto-review' | 'human-review' | 'done' | 'failed';
type RunMode  = 'guided' | 'autonomous';

interface ProjectContext {
  revision: string;           // 'rev-7'
  publishedAt: string;
  charter: string;            // path
  drift?: { checkedAt: string; stale: boolean };
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
  overrides: Partial<EpicConfig>;   // cái user sửa riêng cho epic
  followed: boolean;                // ★ theo workspace
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
  model: string; tier: 'fast' | 'balanced' | 'deep' | 'review';
  skills: string[];
  capabilities: Array<'figma' | 'files' | 'github' | 'web'>;
}

interface Skill { id: string; source: 'bundled' | 'design' | 'custom'; description: string; body: string }
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

Frontmatter agent (đúng như thiết kế yêu cầu):

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
- Event tối thiểu: `{ at, command, from, to, actor, evidence }` — đúng các cột trong màn Event log.

### Bước 2 — Registry cho skill / agent / pipeline
- `SkillStore`, `AgentStore`, `PipelineStore`: `list() / read(id) / write(entity) / exists(id)`.
- Parse frontmatter bằng gray-matter (hoặc parser sẵn có). Ghi file rồi **emit change event** để UI cập nhật ngay, không đợi reload.
- `validate()` trả về đúng 4 loại lỗi mà form đang hiển thị:
  1. id trùng (`exists(id)`)
  2. skill không tồn tại (`skills.filter(s => !skillStore.exists(s))`)
  3. step trỏ agent chưa có (`steps.filter(s => s.agent && !agentStore.exists(s.agent))`)
  4. pipeline không có step nào `humanReview: true`

### Bước 3 — CommandBus + slash command
- Mỗi hành động UI = một command id (`aidlc.epic.next`, `aidlc.step.rerun`, `aidlc.gate.approve`, `aidlc.preset.apply`…).
- Command **không tự chạy AI**. Nó ghi state/request rồi mở terminal Claude:
  `terminal.sendText('/aidlc-' + pipelineId + ' ' + epicId)`.
- Autonomous: `/aidlc-autonomous-delivery <delivery-id>`.
- Sau khi ghi skill/agent/pipeline mới, nếu cần nạp lại slash command → show notification có nút **Reload** (`workbench.action.reloadWindow`).

### Bước 4 — Step runner + rerun/resume
- `runStep(epicId, stepId)`: `awaiting-work → running`, mở terminal, chờ user `Mark step done`.
- `rerunStep(epicId, stepId, { feedback })`: tạo **revision mới**, giữ run id, chạy lại đúng slash command. Không xoá artifact đã approve.
- `resume(epicId)`: đọc checkpoint, báo checkpoint được chọn, chỉ chạy phase failed/chưa xong + downstream. **Không** tạo run mới.
- Reject ở review → `onReject.rerun` (ví dụ `design-recreator`) kèm feedback, không chạy lại upstream đã approve.

### Bước 5 — Gate
- `GateService.request(kind, payload)` đưa epic sang `waiting-for-user` và ghi event.
- Hard/human gate: `merge_default_branch`, `external_communication`, `destructive_changes` — schema **từ chối** config khác `always`.
- `approve/reject` bắt buộc có lý do khi reject; ghi vào event log.
- `project-sync` chỉ chạy sau bằng chứng merge.

### Bước 6 — Webview UI
- Một webview (`AIDLC Workspace`) mở như editor tab, sidebar là tree view riêng.
- Tab: Home · Epics · Builder · Analyze · Tests · Guide · Studio.
- Epics 2 cột: trái list (search + filter đếm + ★ following + gập thành rail), phải chi tiết epic.
- Flow graph: **derive toạ độ từ grid**, đừng hard-code. Công thức đang dùng:
  `x = 12 + 224 * (i % 5)`, `y = 40 + 128 * floor(i / 5)`, node `208×52`;
  connector ngang `M x+208,y+26 → x',y+26`; xuống hàng qua corridor `y+88`;
  loop reject qua corridor `y+76` giữa hai node liên quan.
  Canvas cao `max(loopY+20, 40 + 128*rows + 12)`, scale để lọt cột.
- Postmessage protocol: `{ type: 'command', id, args }` từ webview → extension; `{ type: 'state', epic, steps, events }` ngược lại.

### Bước 7 — Preset "Redraw Design"
Một command `aidlc.preset.redrawDesign.apply` làm đúng 3 việc, idempotent:
1. ghi 5 skill (`figma-to-ui`, `image-to-ui`, `design-system`, `responsive-layout`, `visual-review`) nếu chưa có;
2. ghi agent `design-recreator` với skills + capabilities;
3. ghi pipeline `redraw-design`:

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

Không ghi đè pipeline bundled — tạo bản copy project có version.

---

## 3. Test

```
validation.spec.ts    id trùng · skill không tồn tại · step trỏ agent chưa có · thiếu human gate
agent-store.spec.ts   ghi + đọc lại frontmatter skills/capabilities, giữ nguyên field lạ
linking.spec.ts       agent–skill và workflow–agent còn đúng sau reload
rerun.spec.ts         reject ở human-review chạy lại design-recreator kèm feedback, không chạy analyzer
resume.spec.ts        resume giữ phase approved, chỉ chạy phase failed + downstream
events.spec.ts        state.json rebuild được từ events.ndjson
gate.spec.ts          hard gate không bypass được ở mọi mode; reject bắt buộc có lý do
regression.spec.ts    cohesive-feature (13 step) và project-context (7 step) không đổi
```

Chạy: `npm test`. E2E webview: `@vscode/test-electron` mở workspace mẫu, apply preset, assert 3 file được ghi và notification Reload xuất hiện.

---

## 4. Ví dụ dùng end-to-end

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
