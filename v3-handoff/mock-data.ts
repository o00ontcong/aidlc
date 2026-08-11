// v3-handoff/mock-data.ts
// TOÀN BỘ dữ liệu giả của "AIDLC Workspace v3.dc.html", trích nguyên văn.
// Mỗi export có một MOCK ID; khi render phải gắn data-mock="true" data-mock-id="<id>"
// lên control tương ứng (xem MockBoundary.tsx + bảng MOCK_REGISTRY ở cuối file).
//
// PHÂN LOẠI:
//   MOCK    = dữ liệu runtime giả, phải thay bằng backend thật.
//   CATALOG = dữ liệu tĩnh ship kèm extension (pipeline bundled, mô tả preset,
//             danh sách platform…) — KHÔNG cần tô đỏ, nhưng vẫn nên đọc từ file thật.

import type {
  EpicRowVM, QuotaCardVM, RecentEpicVM, McpServerVM, ParallelEpicVM, ConfigRowVM,
  StepRowVM, HistoryVM, ShipVM, LifecycleVM, FlowSummaryVM, AgentVM, SkillVM,
  PresetStepVM, PackVM, ProviderVM, CapabilityVM, CodeLineVM, DoctorVM,
  TestStepVM, AnalysisVM, ReadinessVM, ActionVM,
} from './types';

/* ═══ SHELL ═══════════════════════════════════════════════ MOCK: shell.* */
export const MOCK_WORKSPACE_NAME = 'payments-service';               // titlebar + sidebar
export const MOCK_EDITOR_TABS = ['AIDLC Workspace', 'refunds/service.ts'];
export const MOCK_BRANCH = 'epic-142-partial-refunds';               // status bar

/* ═══ SIDEBAR ═════════════════════════════════════════════ */

// MOCK: sidebar.quota — thay bằng API quota của từng provider (cache ở globalState)
export const MOCK_QUOTA: QuotaCardVM[] = [
  { provider: 'Claude Code',  initial: 'C', iconBg: 'rgba(226,114,91,0.22)', iconFg: '#E2725B',
    connected: true, accountLabel: 'Account 1', enabled: true,
    quotas: [ { label: 'session (5h)', used: 15, limit: 100, resetAt: 'in 4h 40m' },
              { label: 'weekly (7d)',  used: 12, limit: 100, resetAt: 'in 6d 7h'  } ] },
  { provider: 'OpenAI Codex', initial: 'O', iconBg: 'rgba(255,255,255,0.08)', iconFg: '#E6E8E8',
    connected: true, accountLabel: 'Account 1', enabled: true,
    quotas: [ { label: 'session (5h)', used: 68, limit: 100, resetAt: 'in 1h 12m' },
              { label: 'weekly (7d)',  used: 41, limit: 100, resetAt: 'in 3d 4h'  } ] },
  { provider: 'Kimi',         initial: 'K', iconBg: 'rgba(0,136,255,0.18)',  iconFg: 'rgb(90,175,255)',
    connected: true, accountLabel: 'Account 1', enabled: true,
    quotas: [ { label: 'daily (24h)',  used: 92, limit: 100, resetAt: 'in 3h 05m' } ] },
  { provider: 'xAI (Grok)',   initial: 'X', iconBg: 'rgba(255,255,255,0.06)', iconFg: '#6E7574',
    connected: false, enabled: false, quotas: [] },
];

// CATALOG: chip template — đọc từ PipelineStore.list()
export const CATALOG_TEMPLATES = ['sdlc-core', 'speckit', 'cohesive', 'regulated'];

// MOCK: sidebar.mcp — thay bằng danh sách MCP server thật của VS Code
export const MOCK_MCP: McpServerVM[] = [
  { name: 'ast-graph',      state: 'registered', healthy: true  },
  { name: 'agents-observe', state: 'off',        healthy: false },
];

/* ═══ EPICS ═══════════════════════════════════════════════ */

// MOCK: epics.list — thay bằng .aidlc/epics/*/state.json
export const MOCK_EPICS: EpicRowVM[] = [
  { id: 'EPIC-142',   title: 'Partial refunds',           state: 'In progress', tone: 'warn',  pct: '62%',  next: 'Approve hard gate' },
  { id: 'EPIC-139',   title: 'Webhook retry backoff',     state: 'In progress', tone: 'acc',   pct: '78%',  next: 'Verify · contract tests' },
  { id: 'EPIC-136',   title: 'Idempotency keys',          state: 'Failed',      tone: 'err',   pct: '54%',  next: 'Recovery hết lượt' },
  { id: 'EPIC-131',   title: 'Refund audit export',       state: 'Done',        tone: 'acc',   pct: '100%', next: 'PR #311 merged' },
  { id: 'EPIC-128',   title: 'Dispute evidence upload',   state: 'Pending',     tone: 'track', pct: '0%',   next: 'Cần acceptance criteria' },
  { id: 'EPIC-124',   title: 'Payout schedule refactor',  state: 'Pending',     tone: 'track', pct: '22%',  next: 'Chờ quyết định charter' },
  { id: 'DESIGN-001', title: 'Redraw checkout screen',    state: 'In progress', tone: 'warn',  pct: '75%',  next: 'human-review · chờ feedback', pipelineId: 'redraw-design' },
];
export const MOCK_FOLLOW_DEFAULT: Record<string, boolean> = { 'EPIC-142': true, 'EPIC-139': true };

// MOCK: epic.header.tokens
export const MOCK_EPIC_TOKENS = '412K tokens · $6.48';

// MOCK: epic.alignment
export const MOCK_ALIGNMENT_WARNING =
  'Charter alignment: epic mở rộng ngoài phạm vi G-02 — chỉ được thu hẹp từ charter.';

// CATALOG: 7 step của pipeline project-context (tất cả đang là ✓ = MOCK trạng thái)
export const CATALOG_CONTEXT_STEPS = [
  'define-charter', 'scan-project', 'model-project', 'check-drift',
  'review-context', 'publish-context', 'project-rules-sync',
];
export const MOCK_CONTEXT_BADGE = 'published · rev-7';

// CATALOG: 13 step cohesive-feature (name) — MOCK: cột meta + kind
export const MOCK_FLOW_COHESIVE = [
  { name: 'capture-context',  meta: 'snapshot rev-7',                  kind: 'done'   },
  { name: 'specify',          meta: 'SPEC.md',                         kind: 'done'   },
  { name: 'clarify',          meta: 'FR/NFR/AC rõ',                    kind: 'done'   },
  { name: 'plan',             meta: 'PLAN.md',                         kind: 'done'   },
  { name: 'plan-tasks',       meta: 'TASKS.md',                        kind: 'done'   },
  { name: 'analyze-contract', meta: 'CONTRACT frozen',                 kind: 'done'   },
  { name: 'implement',        meta: 'running · 01:12',                 kind: 'active' },
  { name: 'impl-context',     meta: 'hành vi thực tế · traceability',  kind: 'todo'   },
  { name: 'cohesion-review',  meta: 'review độc lập',                  kind: 'todo'   },
  { name: 'system-test',      meta: 'quality gates',                   kind: 'todo'   },
  { name: 'open-pr',          meta: 'PR riêng',                        kind: 'gate'   },
  { name: 'await-merge',      meta: 'human merge',                     kind: 'gate'   },
  { name: 'project-sync',     meta: 'cập nhật Reality',                kind: 'todo'   },
] as const;

export const MOCK_FLOW_REDRAW = [
  { name: 'design-analyzer',  meta: 'layout · màu · type · spacing', kind: 'done' },
  { name: 'design-recreator', meta: 'dựng UI theo phân tích',        kind: 'done' },
  { name: 'visual-reviewer',  meta: 'đã sửa 6 sai lệch',             kind: 'done' },
  { name: 'human-review',     meta: 'chờ duyệt / feedback',          kind: 'gate' },
] as const;

export const FLOW_NOTE = {
  'cohesive-feature': 'Project Context snapshot rev-7 → epic chạy độc lập, không có work package',
  'redraw-design':    'Tham chiếu: figma/checkout-v3 · reject sẽ chạy lại design-recreator kèm feedback',
};
export const FLOW_AT_LABEL = {
  'cohesive-feature': 'Đang ở: implement · step 7/13',
  'redraw-design':    'Đang ở: human-review · step 4/4',
};
export const FLOW_PIPELINE_LABEL = {
  'cohesive-feature': 'cohesive-feature · 13 step',
  'redraw-design':    'redraw-design · 4 step',
};
export const FLOW_LEGEND = ['✓ xong', '● đang chạy', '○ chưa tới', '🔒 human gate'];

// MOCK: epic.parallel
export const MOCK_PARALLEL: ParallelEpicVM[] = [
  { id: 'PAYMENTS-001',      title: 'Partial refunds',      branch: 'feat/payments-001', pr: 'PR #402', state: 'implement 7/13', mark: '●',  tone: 'warn' },
  { id: 'EXPORT-001',        title: 'Refund audit export',  branch: 'feat/export-001',   pr: 'PR #399', state: 'await-merge',    mark: '🔒', tone: 'warn' },
  { id: 'NOTIFICATIONS-001', title: 'Webhook retry notice', branch: 'feat/notif-001',    pr: '—',       state: 'specify 2/13',   mark: '●',  tone: 'acc'  },
];
export const MOCK_INDEPENDENCE = [
  { mark: '✓', tone: 'acc'  as const, label: 'Scope & acceptance criteria tách biệt' },
  { mark: '✓', tone: 'acc'  as const, label: 'Branch và PR riêng cho từng epic' },
  { mark: '!', tone: 'warn' as const, label: 'EXPORT-001 chạm cùng schema refunds — merge trước, refresh context sau' },
  { mark: '✓', tone: 'acc'  as const, label: 'Không có thay đổi charter đang chờ ở epic khác' },
];

// CATALOG (cấu trúc) + MOCK (kind): vòng đời step — toạ độ x/w là HARD-CODED trong v3
export const LIFECYCLE: LifecycleVM[] = [
  { name: 'AwaitingWork', x: 20,  w: 128, kind: 'done'   },
  { name: 'Running',      x: 196, w: 136, kind: 'active' },
  { name: 'AutoReview',   x: 392, w: 132, kind: 'todo'   },
  { name: 'HumanReview',  x: 588, w: 148, kind: 'todo'   },
  { name: 'NextStep',     x: 800, w: 110, kind: 'todo'   },
];

// MOCK: epic.config (2 biến thể theo pipeline)
export const MOCK_CONFIG_COHESIVE: ConfigRowVM[] = [
  { k: 'pipeline',        v: 'cohesive-feature · 13 step',                      src: 'bundled',           fromEpic: false },
  { k: 'context',         v: 'snapshot rev-7 của Project Context',              src: 'capture-context',   fromEpic: false },
  { k: 'branch',          v: 'feat/payments-001',                               src: 'epic riêng',        fromEpic: true  },
  { k: 'PR',              v: 'PR #402 · chưa merge',                            src: 'epic riêng',        fromEpic: true  },
  { k: 'contract',        v: 'FEATURE-CONTRACT.md · frozen',                    src: 'analyze-contract',  fromEpic: false },
  { k: 'phân rã nội bộ',  v: 'Claude tự quyết định — không có work package',    src: 'theo hợp đồng',     fromEpic: false },
];
export const MOCK_CONFIG_REDRAW: ConfigRowVM[] = [
  { k: 'pipeline',     v: 'redraw-design · 4 step',                                          src: 'preset',      fromEpic: true  },
  { k: 'tham chiếu',   v: 'figma/checkout-v3 · 3 ảnh mobile',                                src: 'epic riêng',  fromEpic: true  },
  { k: 'agent',        v: 'design-recreator · claude-opus-4',                                src: 'epic riêng',  fromEpic: true  },
  { k: 'skills',       v: 'figma-to-ui · design-system · responsive-layout · visual-review', src: 'từ agent',    fromEpic: false },
  { k: 'capabilities', v: 'figma · files',                                                   src: 'từ agent',    fromEpic: false },
  { k: 'artifacts',    v: 'DESIGN-ANALYSIS.md · VISUAL-DIFF.md · component',                 src: 'theo step',   fromEpic: false },
];

// MOCK: epic.gate
export const MOCK_GATE = {
  title: 'Human gate · await-merge',
  sub: 'Agent không merge default branch. project-sync chỉ chạy sau bằng chứng merge.',
  badge: 'waiting-for-user',
  consequence: 'Mở PR epic-142-partial-refunds → main và comment vào PAY-884. 4 file · +186 / −34.',
  actions: ['Approve', 'Reject', 'Rerun step', 'Run auto-review', 'Run with Claude'],
};
// MOCK: modal Gate (hard gate)
export const MOCK_HARD_GATE = {
  kind: 'merge_default_branch',
  title: 'Hard gate · merge_default_branch',
  sub: 'Không mode nào bỏ qua được, kể cả unattended',
  why: 'Vì sao cần duyệt: hành động này ghi vào nhánh mặc định và mở giao tiếp ra ngoài repo — hai việc không thể hoàn tác bằng retry.',
  ifApprove: 'Mở Pull Request epic-142-partial-refunds → main, gắn 2 reviewer, comment vào PAY-884.',
  scope: 'Phạm vi: 4 file · +186 / −34 · 1 migration',
  note: 'Hard gate không có tuỳ chọn "đừng hỏi lại".',
};

// MOCK: epic.steps — cohesive
export const MOCK_STEPS_COHESIVE: StepRowVM[] = [
  { name: 'analyze-contract',      meta: 'done · FEATURE-CONTRACT.md frozen',                 kind: 'done',
    actions: [a('Xem artifact','aidlc.artifact.open'), a('Run again with Claude','aidlc.step.rerun')] },
  { name: 'implement',             meta: 'running · terminal Claude đang mở',                 kind: 'active',
    actions: [a('Mark step done','aidlc.step.markDone','primary'), a('Run again with Claude','aidlc.step.rerun'), a('Mở terminal','aidlc.terminal.show')] },
  { name: 'implement · lần trước', meta: 'lệnh Claude đóng khi step còn Awaiting work',       kind: 'rerun',
    actions: [a('Run again with Claude','aidlc.step.rerun'), a('Xem run id','aidlc.run.reveal')] },
  { name: 'cohesion-review',       meta: 'rejected · cần revision mới',                       kind: 'failed',
    error: 'Reject: implementation lệch FEATURE-CONTRACT ở refund rounding — cần revision',
    actions: [a('Run again with Claude','aidlc.step.rerun','primary'), a('Edit feedback first','aidlc.step.editFeedback'), a('Xem review','aidlc.artifact.open')] },
  { name: 'system-test',           meta: 'pending · quality gates',                           kind: 'todo',
    actions: [a('Run with Claude','aidlc.step.run'), a('Xem plan','aidlc.artifact.open')] },
  { name: 'open-pr → await-merge', meta: 'pending · human merge, agent không merge default branch', kind: 'gate',
    actions: [a('Open review summary','aidlc.review.open'), a('Add review task','aidlc.review.addTask'), a('Complete after merge','aidlc.step.markDone')] },
];
// MOCK: epic.steps — redraw
export const MOCK_STEPS_REDRAW: StepRowVM[] = [
  { name: 'design-analyzer',  meta: 'done · DESIGN-ANALYSIS.md · figma-to-ui + image-to-ui',   kind: 'done',
    actions: [a('Xem phân tích','aidlc.artifact.open'), a('Run again with Claude','aidlc.step.rerun')] },
  { name: 'design-recreator', meta: 'done · 1 screen + 4 component · design-system',            kind: 'done',
    actions: [a('Xem diff','aidlc.artifact.open'), a('Run again with Claude','aidlc.step.rerun')] },
  { name: 'visual-reviewer',  meta: 'auto-review · đã sửa 6 sai lệch, còn 2 ghi nhận',          kind: 'done',
    actions: [a('Xem VISUAL-DIFF','aidlc.artifact.open'), a('Run again with Claude','aidlc.step.rerun')] },
  { name: 'human-review',     meta: 'chờ bạn duyệt hoặc nhập feedback',                         kind: 'gate',
    actions: [a('Approve','aidlc.gate.approve','primary'), a('Reject + feedback','aidlc.gate.reject'), a('So sánh side-by-side','aidlc.visual.compare')] },
  { name: 'human-review · lần trước', meta: 'rejected: spacing card sai 8px, font weight nhạt', kind: 'rerun',
    error: 'Feedback đã đưa vào revision 2 và chạy lại design-recreator, không chạy lại design-analyzer',
    actions: [a('Edit feedback first','aidlc.step.editFeedback'), a('Xem revision','aidlc.run.reveal')] },
];

export const MOCK_STEP_DETAIL = [
  { k: 'inputs',    v: 'Plan đã approve · schema snapshot · FEATURE-CONTRACT v4' },
  { k: 'outputs',   v: '2 file source · 1 migration · 1 spec test' },
  { k: 'done when', v: 'Migration chạy sạch trên shadow DB và contract test pass' },
  { k: 'next',      v: 'Verify · validators + human sign-off' },
];
export const MOCK_ARTIFACTS = ['src/refunds/service.ts', 'prisma/0042_partial.sql', 'tests/partial.spec.ts'];
export const MOCK_STEP_DETAIL_CMD = '/aidlc epic next EPIC-142';

export const MOCK_HISTORY: HistoryVM[] = [
  { at: '10:31', what: 'Gate requested · merge_default_branch',      tone: 'warn',  actor: 'agent:senior-backend-developer' },
  { at: '10:29', what: 'Validators passed · 418 unit, 12 contract',  tone: 'acc',   actor: 'system' },
  { at: '10:14', what: 'Rerun sau feedback: tách compat shim',       tone: 'muted', actor: 'user:mai' },
  { at: '10:02', what: 'Step rejected · thiếu decimal guard',        tone: 'err',   actor: 'user:mai' },
  { at: '09:47', what: 'Epic started · profile Standard',            tone: 'muted', actor: 'user:mai' },
];
export const MOCK_SHIP: ShipVM[] = [
  { label: 'Commit preview', tone: 'acc',   active: true  },
  { label: 'PR',             tone: 'warn',  active: true  },
  { label: 'Review',         tone: 'track', active: false },
  { label: 'Merge',          tone: 'track', active: false },
];
export const MOCK_ARTIFACT_POLICY_COUNT = 'artifact policy: 4 / 9';
export const ACTION_BAR: ActionVM[] = [
  a('Verify','aidlc.epic.verify'), a('Report','aidlc.epic.report'),
  a('Reveal artifacts','aidlc.artifact.revealAll'), a('Epic memory','aidlc.epic.memory'),
  a('Delete','aidlc.epic.delete','danger'),
];

/* ═══ HOME ════════════════════════════════════════════════ */
export const MOCK_READINESS: ReadinessVM[] = [
  { mark: '✓', tone: 'acc',  label: 'Project đã setup',            value: '.aidlc · pack sdlc-core@2.3.0', action: 'Xem',              actionTone: 'txt'  },
  { mark: '!', tone: 'warn', label: 'Project context cũ 12 ngày',  value: 'rev-7 · explicit refresh',      action: 'Publish context',  actionTone: 'warn' },
  { mark: '✓', tone: 'acc',  label: 'Recommendation đã lock',      value: '4 agent · 9 skill · sha256 ✓',  action: 'Generate lại',     actionTone: 'txt'  },
];
export const MOCK_HOME_CURRENT = {
  title: 'EPIC-142 · Partial refunds',
  body: 'Việc tiếp theo: duyệt hard gate để mở PR sang main. Không có gì chạy tiếp cho tới khi bạn quyết định.',
  pct: '62%',
};
export const MOCK_HOME_BLOCKED = 'EPIC-136 blocked · contract test thất bại sau 3 lần retry';
export const MOCK_RECOVERY = ['Retry step', 'Resume Epic', 'Apply fix: bump contract v4', 'Đổi policy gate'];

/* ═══ BUILDER ═════════════════════════════════════════════ */
export const MOCK_FLOWS: FlowSummaryVM[] = [
  { id: 'redraw-design',     steps: 4, nodes: ['design-analyzer','design-recreator','visual-reviewer','human-review'] },
  { id: 'sdlc-standard',     steps: 5, nodes: ['understand','plan','build','verify','ship'] },
  { id: 'quick-fix',         steps: 3, nodes: ['understand','build','verify'] },
  { id: 'cohesive-parallel', steps: 5, nodes: ['plan','wp×3','integrate','ship'] },
  { id: 'release-notes',     steps: 2, nodes: ['collect','draft'] },
];
export const MOCK_AGENTS: AgentVM[] = [
  { name: 'design-recreator', tier: 'deep', model: 'claude-opus-4',
    desc: 'Dựng lại UI từ Figma/ảnh tham chiếu rồi tự đối chiếu sai lệch',
    skills: ['figma-to-ui','image-to-ui','design-system','responsive-layout','visual-review'],
    capabilities: ['figma','files','github','web'],
    frontmatter: 'skills: [figma-to-ui, design-system, responsive-layout]' },
  { name: 'senior-backend-developer', tier: 'balanced', model: 'claude-sonnet-4-5', skills: ['fastify','prisma-migrate','decimal-safety'] },
  { name: 'backend-reviewer',         tier: 'review',   model: 'claude-sonnet-4-5', skills: ['vitest','pact','code-review'] },
  { name: 'service-architect',        tier: 'deep',     model: 'claude-opus-4',     skills: ['api-contract','prisma-schema'] },
  { name: 'product-domain-analyst',   tier: 'deep',     model: 'claude-opus-4',     skills: ['payments-domain','acceptance-criteria'] },
];
export const MOCK_SKILLS: SkillVM[] = [
  { id: 'figma-to-ui',        source: 'design',  desc: 'Đọc frame Figma → token, layout, component; không copy pixel' },
  { id: 'image-to-ui',        source: 'design',  desc: 'Suy ra grid, spacing, typography từ ảnh tham chiếu' },
  { id: 'design-system',      source: 'design',  desc: 'Bắt buộc dùng token/component của design system, không tự tạo màu' },
  { id: 'responsive-layout',  source: 'design',  desc: 'Quy tắc breakpoint, thứ tự reflow, hit target tối thiểu' },
  { id: 'visual-review',      source: 'design',  desc: 'So sánh kết quả với tham chiếu và liệt kê sai lệch có thể sửa' },
  { id: 'prisma-migrate',     source: 'bundled', desc: 'Viết migration an toàn, có shadow DB check' },
  { id: 'decimal-safety',     source: 'custom',  desc: 'Quy tắc làm tròn tiền cho refund một phần' },
  { id: 'pact',               source: 'bundled', desc: 'Contract test giữa service' },
  { id: 'payments-domain',    source: 'custom',  desc: 'Thuật ngữ và ràng buộc miền thanh toán' },
  { id: 'api-contract',       source: 'bundled', desc: 'Chuẩn hoá OpenAPI và versioning' },
  { id: 'acceptance-criteria',source: 'bundled', desc: 'Viết AC kiểm chứng được' },
];
// CATALOG: preset Redraw Design (ship kèm extension — không phải mock)
export const PRESET_SKILLS = [
  { id: 'figma-to-ui',       desc: 'frame Figma → token, layout, component' },
  { id: 'image-to-ui',       desc: 'ảnh → grid, spacing, typography' },
  { id: 'design-system',     desc: 'bắt buộc dùng token của design system' },
  { id: 'responsive-layout', desc: 'breakpoint, reflow, hit target' },
  { id: 'visual-review',     desc: 'liệt kê sai lệch so với tham chiếu' },
];
export const PRESET_STEPS: PresetStepVM[] = [
  { i: '1', name: 'design-analyzer',  tag: 'auto-review', desc: 'Trích layout, màu, typography, spacing, component hierarchy từ Figma/ảnh' },
  { i: '2', name: 'design-recreator', tag: 'auto-review', desc: 'Tạo hoặc cập nhật UI/component theo bản phân tích' },
  { i: '3', name: 'visual-reviewer',  tag: 'auto-review', desc: 'Đối chiếu với tham chiếu, sửa sai lệch layout/màu/font/responsive' },
  { i: '4', name: 'human-review',     tag: 'human gate',  desc: 'Chờ bạn duyệt hoặc nhập feedback; reject sẽ chạy lại step phù hợp' },
];
export const PRESET_HEADER = {
  title: 'Preset · Redraw Design',
  chip: 'redraw-design · 4 step',
  desc: 'cài 5 skill + agent design-recreator + pipeline trong một lần, không đụng pipeline hiện có',
};
export const TOAST_PRESET = {
  title: 'Đã cài Redraw Design',
  body: '5 skill · agent design-recreator · pipeline redraw-design. Reload để VS Code nạp lại slash command mới.',
};

// MOCK: id đã tồn tại (dùng cho validation demo) — thật ra phải hỏi *Store.exists()
export const MOCK_TAKEN_IDS = ['prisma-migrate', 'sdlc-standard', 'backend-reviewer'];
// MOCK: preview step khi Add pipeline
export const MOCK_ADD_FLOW_STEPS = [
  { i: '1', name: 'capture-context', tag: 'auto' as const },
  { i: '2', name: 'specify',         tag: 'auto' as const },
  { i: '3', name: 'implement',       tag: 'auto' as const },
  { i: '4', name: 'open-pr',         tag: 'human gate' as const },
];
export const ADD_SOURCE_DEFS = {
  Workflows: [['Từ template','copy pipeline bundled rồi sửa'],['Từ recipe','Claude sinh step từ mô tả'],['Blank','tự thêm từng step']],
  Agents:    [['Từ template','agent role có sẵn'],['Từ recommendation','lấy agent Claude đề xuất'],['Blank','tự khai báo']],
  Skills:    [['Từ template','chọn skill bundled'],['Dán nội dung','paste markdown'],['Upload file','chọn .md từ máy'],['Blank','tạo file trống']],
} as const;

/* ═══ ANALYZE ═════════════════════════════════════════════ */
export const CATALOG_PLATFORMS = ['Jira', 'GitHub', 'Linear', 'Redmine', 'Local'] as const;
export const MOCK_ANALYZE_FORM = { parentTask: 'PAY-884', projectKey: 'PAY',
  confirm: 'Partial refunds for split payments · Jira · parent PAY-884 · REQ-018' };
export const MOCK_ANALYSES: AnalysisVM[] = [
  { id: 'REQ-018', title: 'Partial refunds for split payments', meta: 'Jira · 7 task' },
  { id: 'REQ-017', title: 'Webhook signature rotation',         meta: 'GitHub · 4 task' },
  { id: 'REQ-015', title: 'Dispute evidence upload',            meta: 'Local · 9 task' },
  { id: 'REQ-012', title: 'Payout schedule refactor',           meta: 'Jira · 12 task' },
];

/* ═══ TESTS ═══════════════════════════════════════════════ */
export const MOCK_TEST_STEPS: TestStepVM[] = [
  { name: 'Explore',  meta: 'done',            kind: 'done',   gate: false },
  { name: 'Plan',     meta: 'done',            kind: 'done',   gate: false },
  { name: 'Confirm',  meta: 'gate · approved', kind: 'done',   gate: true  },
  { name: 'Generate', meta: 'done',            kind: 'done',   gate: false },
  { name: 'Execute',  meta: '31 case',         kind: 'done',   gate: false },
  { name: 'Heal',     meta: '2 healed',        kind: 'active', gate: false },
  { name: 'Verdict',  meta: 'gate · chờ duyệt',kind: 'todo',   gate: true  },
];
export const MOCK_TEST_VERDICT = {
  headline: '28 pass · 2 healed · 1 fail',
  body: 'Fail duy nhất ở luồng refund một phần với thẻ 3DS — cần người xác nhận là bug thật hay test cũ.',
  gates: 'Confirm (trước khi sinh test) và Verdict (trước khi ghi kết luận) đều cần người duyệt.',
};

/* ═══ GUIDE ═══════════════════════════════════════════════ */
export const MOCK_HELP = [
  { k: 'why',       v: 'Migration xoá cột nên không reversible — cần người xác nhận trước khi chạm dữ liệu.', tone: 'acc'   as const },
  { k: 'inputs',    v: 'Plan đã approve · schema snapshot · compat shim',                                      tone: 'muted' as const },
  { k: 'outputs',   v: '1 migration · 2 file source thay đổi',                                                 tone: 'muted' as const },
  { k: 'done when', v: 'Migration sạch trên shadow DB và contract test pass',                                  tone: 'muted' as const },
  { k: 'next',      v: 'Verify · validators + human sign-off',                                                 tone: 'muted' as const },
];
// CATALOG: nội dung ví dụ cấu hình (tone: muted=T2, acc=OK, warn, dim=T3)
export const EXAMPLE_LINES: CodeLineVM[] = [
  { t: '# .claude/agents/design-recreator.md', tone: 'muted' },
  { t: '---', tone: 'muted' },
  { t: 'id: design-recreator', tone: 'acc' },
  { t: 'name: Design Recreator', tone: 'muted' },
  { t: 'description: Dựng lại UI từ Figma/ảnh tham chiếu', tone: 'muted' },
  { t: 'model: claude-opus-4', tone: 'muted' },
  { t: 'skills: [figma-to-ui, design-system, responsive-layout]', tone: 'acc' },
  { t: 'capabilities: [figma, files, github, web]', tone: 'acc' },
  { t: '---', tone: 'muted' },
  { t: '', tone: 'muted' },
  { t: '# .aidlc/pipelines/redraw-design.yaml', tone: 'muted' },
  { t: 'steps:', tone: 'muted' },
  { t: '  - id: design-analyzer', tone: 'acc' },
  { t: '    agent: design-recreator', tone: 'muted' },
  { t: '    skills: [figma-to-ui, image-to-ui]', tone: 'muted' },
  { t: '    outputs: [DESIGN-ANALYSIS.md]', tone: 'muted' },
  { t: '    auto_review: true', tone: 'muted' },
  { t: '  - id: design-recreator', tone: 'acc' },
  { t: '    skills: [design-system, responsive-layout]', tone: 'muted' },
  { t: '    outputs: [src/ui/**]', tone: 'muted' },
  { t: '  - id: visual-reviewer', tone: 'acc' },
  { t: '    skills: [visual-review]', tone: 'muted' },
  { t: '    outputs: [VISUAL-DIFF.md]', tone: 'muted' },
  { t: '    auto_review: true', tone: 'muted' },
  { t: '  - id: human-review', tone: 'acc' },
  { t: '    human_review: true', tone: 'warn' },
  { t: '    on_reject: rerun(design-recreator, with_feedback)', tone: 'warn' },
];
export const MOCK_REDRAW_TESTS = [
  ['Từ chối agent id trùng và skill id trùng', 'validation.spec'],
  ['Từ chối skill không tồn tại khi gán vào agent', 'validation.spec'],
  ['Từ chối step trỏ tới agent chưa tồn tại', 'validation.spec'],
  ['Ghi và đọc lại frontmatter skills: [...] của agent', 'agent-store.spec'],
  ['Liên kết agent–skill và workflow–agent sau reload', 'linking.spec'],
  ['Reject ở human-review chạy lại đúng design-recreator kèm feedback', 'rerun.spec'],
  ['Pipeline hiện có (cohesive-feature, sdlc-standard) không đổi', 'regression.spec'],
].map(([label, file]) => ({ mark: '✓', tone: 'acc' as const, label, file }));
export const MOCK_DOCTOR: DoctorVM[] = [
  { mark: '✓', tone: 'acc',  label: 'Claude CLI khả dụng',                action: ''    },
  { mark: '✓', tone: 'acc',  label: 'Git worktree sạch',                  action: ''    },
  { mark: '!', tone: 'warn', label: 'Context rev-7 cũ hơn 12 ngày',       action: 'Fix' },
  { mark: '!', tone: 'warn', label: 'Coverage refunds/ dưới ngưỡng 70%',  action: 'Fix' },
  { mark: '✓', tone: 'acc',  label: 'Không có validator conflict',        action: ''    },
];
export const MOCK_EVENTS = [
  '10:31:04 gate.request running → waiting-for-user',
  '10:29:51 action.execute running → validating',
  '10:22:18 epic.next ready → running',
  '10:20:02 workflow.compile draft → ready',
  '10:19:47 epic.start — → draft',
];

/* ═══ STUDIO ══════════════════════════════════════════════ */
export const CATALOG_PACKS: PackVM[] = [
  { id: 'sdlc-core', desc: 'Waterfall-like theo epic',            agents: 'PO · Tech Lead · Dev · QA' },
  { id: 'speckit',   desc: 'Spec-driven: SPEC → PLAN → TASKS',    agents: 'Analyst · Tech Lead · Dev · QA' },
  { id: 'cohesive',  desc: 'Feature-coordination song song',      agents: 'Curator · Coordinator · WP Engineer' },
  { id: 'regulated', desc: 'Traceability & compliance nặng',      agents: 'Thêm evidence + mandatory gates' },
];
export const MOCK_PROVIDERS: ProviderVM[] = [
  { id: 'claude',      note: 'default · claude-sonnet-4-5, opus-4', mark: '●', tone: 'acc',   action: 'Đang dùng'     },
  { id: 'local-fake',  note: 'test fixture provider',               mark: '○', tone: 'muted', action: 'Use as default' },
  { id: 'custom-http', note: 'chưa cấu hình endpoint',              mark: '✕', tone: 'err',   action: 'Diagnose'      },
];
export const MOCK_CAPABILITIES: CapabilityVM[] = [
  { name: 'ast-graph',            kind: 'bundled',  healthy: true,  enabled: true  },
  { name: 'artifact-annotation',  kind: 'bundled',  healthy: true,  enabled: true  },
  { name: 'test-agent',           kind: 'optional', healthy: true,  enabled: false },
  { name: 'observability',        kind: 'optional', healthy: false, enabled: false },
  { name: 'tracker-adapter',      kind: 'optional', healthy: true,  enabled: false },
];
// MOCK: nội dung .aidlc/artifacts.yaml — phải đọc file thật
export const MOCK_POLICY_LINES: CodeLineVM[] = [
  { t: '{', tone: 'muted' },
  { t: '  "defaults": { "persist": "runtime", "commit": false },', tone: 'muted' },
  { t: '  "types": {', tone: 'muted' },
  { t: '    "specification":  { "path": "docs/epics/{epic}/SPEC.md", "commit": true },', tone: 'acc' },
  { t: '    "architecture-decision": { "path": "docs/decisions/{id}.md", "commit": true },', tone: 'acc' },
  { t: '    "execution-plan": { "persist": "runtime", "commit": false },', tone: 'muted' },
  { t: '    "review-log":     { "persist": "runtime", "commit": false }', tone: 'muted' },
  { t: '  }', tone: 'muted' },
  { t: '}', tone: 'muted' },
];

/* ═══ NEW EPIC MODAL ══════════════════════════════════════ */
export const CATALOG_EPIC_TYPES = ['Feature','Bug','Refactor','Spike','Maintenance'];
export const CATALOG_PROFILES = [
  { id: 'cohesive-feature', desc: '13 step · một feature epic độc lập' },
  { id: 'project-context',  desc: '7 step · charter + context chung, chạy một lần' },
  { id: 'sdlc-standard',    desc: '5 stage cổ điển theo epic' },
  { id: 'quick-fix',        desc: '3 step cho sửa nhỏ' },
];
export const CATALOG_COMPILED: Record<string, string> = {
  'cohesive-feature': 'capture-context → specify → clarify → plan → plan-tasks → analyze-contract → implement → implementation-context → cohesion-review → system-test → open-pr → await-merge → project-sync',
  'project-context':  'define-charter → scan-project → model-project → check-drift → review-context → publish-context → project-rules-sync',
  'sdlc-standard':    'Understand → Plan → Build → Verify → Ship',
  'quick-fix':        'Understand → Build → Verify',
};
export const CATALOG_MODES: [string, string][] = [
  ['guide',      'Giải thích, không mutate — mặc định'],
  ['assist',     'AI dựng plan/diff, bạn duyệt trước khi ghi'],
  ['auto',       'Tự chạy stage, dừng ở gate cấu hình'],
  ['unattended', 'Chạy xuyên stage, chỉ dừng ở hard gate'],
];
export const CATALOG_NEW_PACKS: [string,string][] = [
  ['sdlc-core','mặc định project'], ['speckit','spec-driven'],
  ['cohesive','work package song song'], ['regulated','compliance'],
];
export const MOCK_NEW_LOCK = [
  { k: 'context',   v: 'snapshot rev-7 của Project Context',                why: 'capture-context' },
  { k: 'branch',    v: 'feat/<epic-id>',                                    why: 'branch riêng cho epic' },
  { k: 'PR',        v: 'một PR riêng, merge do human',                      why: 'open-pr / await-merge' },
  { k: 'phân rã',   v: 'Claude tự quyết định số subagent và thứ tự',        why: 'không tạo work package' },
  { k: 'artifacts', v: 'SPEC · PLAN · TASKS · FEATURE-CONTRACT',            why: 'pipeline <profile>' },
];
export const MOCK_NEW_CONTEXT_BANNER =
  'Project context là rev-7 (12 ngày). Epic sẽ dùng revision này — refresh là lệnh riêng, không tự chạy.';

/* ═══ helper ══════════════════════════════════════════════ */
function a(label: string, command: string, variant: ActionVM['variant'] = 'default'): ActionVM {
  return { label, command, variant };
}

/* ═══════════════════════════════════════════════════════════
 * MOCK_REGISTRY — mọi mock id, control gắn nó, và dữ liệu thật thay thế.
 * Dùng đúng id này trong data-mock-id để grep được sau này.
 * ═══════════════════════════════════════════════════════════ */
export const MOCK_REGISTRY: { id: string; where: string; replaceWith: string }[] = [
  { id: 'shell.workspaceName', where: 'Title bar + Sidebar project bar',            replaceWith: 'workspace.name từ VS Code API' },
  { id: 'shell.editorTabs',    where: 'Editor tab strip',                            replaceWith: 'window.tabGroups (chỉ trang trí — có thể bỏ trong extension thật)' },
  { id: 'shell.branch',        where: 'Status bar ⎇',                                replaceWith: 'Git extension API, branch hiện tại' },
  { id: 'sidebar.quota',       where: 'Quota tracker (4 card + quota rows + toggle)', replaceWith: 'aidlc.quota.refresh → API quota từng provider, cache globalState' },
  { id: 'sidebar.mcp',         where: 'MCP servers list',                            replaceWith: 'MCP registry của VS Code / .mcp.json' },
  { id: 'sidebar.recent',      where: 'Recent epics (3 dòng)',                       replaceWith: '3 epic mới nhất theo updatedAt trong .aidlc/epics' },
  { id: 'epics.list',          where: 'Cột trái Epics + rail + filter count',        replaceWith: '.aidlc/epics/*/state.json (projection từ events.ndjson)' },
  { id: 'epic.tokens',         where: 'Header epic — "412K tokens · $6.48"',         replaceWith: 'tổng usage từ event log của epic' },
  { id: 'epic.alignment',      where: 'Charter alignment strip',                     replaceWith: 'kết quả check-drift so charter G-02' },
  { id: 'epic.context',        where: 'Project Context card (7 chip + rev-7)',       replaceWith: 'ProjectContext.revision + steps' },
  { id: 'epic.parallel',       where: 'Card "Feature epic đang chạy song song"',     replaceWith: 'các epic state==="running" + branch/PR thật' },
  { id: 'epic.independence',   where: 'Checklist độc lập 4 dòng',                    replaceWith: 'phân tích overlap schema/scope giữa epic đang chạy' },
  { id: 'epic.flow',           where: 'FlowCanvas — meta + kind mỗi node',           replaceWith: 'PipelineStore.read(pipelineId) + StepRun state' },
  { id: 'epic.lifecycle',      where: 'Dải "Vòng đời của step đang chạy"',           replaceWith: 'StepRun.state của step hiện tại' },
  { id: 'epic.config',         where: 'Card "Cấu hình của Epic này"',                replaceWith: 'Epic.overrides + EpicConfig resolve từ project default' },
  { id: 'epic.gate',           where: 'Gate banner + modal Gate',                    replaceWith: 'GateService.pending(epicId)' },
  { id: 'epic.steps',          where: 'Step list + nút mỗi step',                    replaceWith: 'StepRun[] của epic; actions do extension sinh (ActionVM[])' },
  { id: 'epic.stepDetail',     where: 'Card "Chi tiết step"',                        replaceWith: 'PipelineStep.inputs/outputs/doneWhen' },
  { id: 'epic.artifacts',      where: '3 chip file',                                 replaceWith: 'artifact thật của run hiện tại' },
  { id: 'epic.history',        where: 'Card History',                                replaceWith: '5 event mới nhất trong events.ndjson' },
  { id: 'epic.ship',           where: 'Ship strip + "artifact policy: 4 / 9"',       replaceWith: 'trạng thái PR/review/merge + đếm artifact theo artifacts.yaml' },
  { id: 'home.readiness',      where: 'Card Project readiness',                      replaceWith: 'doctor checks + ProjectContext.drift' },
  { id: 'home.current',        where: 'Card Current epic (62%)',                     replaceWith: 'epic đang chạy gần nhất' },
  { id: 'home.blocked',        where: 'Banner EPIC-136 blocked + 4 nút recovery',    replaceWith: 'epic state==="blocked" + recovery action khả dụng' },
  { id: 'builder.flows',       where: 'Builder → Workflows (5 card)',                replaceWith: 'PipelineStore.list()' },
  { id: 'builder.agents',      where: 'Builder → Agents (5 card)',                   replaceWith: 'AgentStore.list() (.claude/agents/*.md)' },
  { id: 'builder.skills',      where: 'Builder → Skills (11 dòng)',                  replaceWith: 'SkillStore.list()' },
  { id: 'builder.takenIds',    where: 'Validation trong modal Add',                  replaceWith: 'stores[kind].exists(id)' },
  { id: 'builder.addSteps',    where: 'Preview step khi Add pipeline',               replaceWith: 'draft.steps do user soạn' },
  { id: 'analyze.form',        where: 'Parent task PAY-884 / Project key PAY',       replaceWith: 'tracker adapter (Jira/GitHub/Linear…)' },
  { id: 'analyze.list',        where: 'Recent analyses (4 dòng)',                    replaceWith: '.aidlc/analyses/*.json' },
  { id: 'tests.pipeline',      where: 'Tab Tests — 7 step + verdict',                replaceWith: 'Test Agent run state' },
  { id: 'guide.help',          where: 'Card "Build · destructive migration"',        replaceWith: 'help text của step đang chọn' },
  { id: 'guide.redrawTests',   where: 'Card "Test cho Redraw Design"',               replaceWith: 'kết quả chạy test thật (vitest reporter)' },
  { id: 'guide.doctor',        where: 'Card Doctor (5 dòng)',                        replaceWith: 'aidlc doctor' },
  { id: 'guide.events',        where: 'Log nâng cao (5 dòng)',                       replaceWith: '20 dòng cuối events.ndjson' },
  { id: 'studio.providers',    where: 'Model provider (3 dòng)',                     replaceWith: 'provider config + health check' },
  { id: 'studio.capabilities', where: 'Capabilities (5 toggle)',                     replaceWith: 'capability registry + health' },
  { id: 'studio.policy',       where: 'Artifact policy JSON',                        replaceWith: 'nội dung .aidlc/artifacts.yaml' },
  { id: 'newEpic.lock',        where: 'Bảng "Sẽ được lock cho Epic này"',            replaceWith: 'resolve từ pipeline + project context thật' },
];
