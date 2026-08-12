// v3-handoff/types.ts
// Kiểu dữ liệu cho toàn bộ webview v3. Webview CHỈ render — mọi %, nhãn, tone
// đều do extension tính sẵn (IMPLEMENT.md §4, quy tắc 2–3).
// Màu luôn truyền bằng TÊN TOKEN, không bao giờ hex.

export type Tone = 'acc' | 'warn' | 'err' | 'muted' | 'txt' | 'track';
export type TabId = 'Home' | 'Epics' | 'Builder' | 'Analyze' | 'Tests' | 'Guide' | 'Studio';
export type BuilderTabId = 'Workflows' | 'Agents' | 'Skills';
export type ThemeId = 'dark' | 'light';
export type ExecutionMode = 'guide' | 'assist' | 'auto' | 'unattended';
export type RunModeLabel = 'Guided' | 'Autonomous Delivery';
export type EpicStateLabel = 'In progress' | 'Pending' | 'Done' | 'Failed';
export type Scope = 'project (.aidlc)' | 'user (~/.claude)';
export type Tier = 'fast' | 'balanced' | 'deep' | 'review';
export type Capability = 'figma' | 'files' | 'github' | 'web';
export type ButtonVariant = 'primary' | 'default' | 'danger' | 'ghost';

export interface ActionVM { label: string; command: string; args?: unknown; variant?: ButtonVariant }

/* ── Sidebar ─────────────────────────────────────────────── */
export interface QuotaRowVM {
  label: string;          // 'session (5h)'
  used: number;           // 15
  limit: number;          // 100
  resetAt: string;        // 'in 4h 40m'
}
export interface QuotaCardVM {
  provider: string;       // 'Claude Code'
  initial: string;        // 'C'
  iconBg: string;         // riêng từng provider (xem mock-data)
  iconFg: string;
  connected: boolean;
  accountLabel?: string;  // 'Account 1'
  enabled: boolean;       // trạng thái toggle
  quotas: QuotaRowVM[];
}
export interface RecentEpicVM { id: string; title: string; tone: Tone; starred: boolean }
export interface McpServerVM { name: string; state: string; healthy: boolean }
export interface SidebarVM {
  projectName: string;
  quota: QuotaCardVM[];
  recent: RecentEpicVM[];
  templates: string[];
  mcp: McpServerVM[];
}

/* ── Epics ───────────────────────────────────────────────── */
export interface EpicRowVM {
  id: string;                 // 'EPIC-142'
  title: string;              // 'Partial refunds'
  state: EpicStateLabel;
  pct: string;                // '62%'  (chuỗi, đã tính ở extension)
  tone: Tone;                 // dot màu
  next: string;               // dùng cho search, không hiển thị ở row
  pipelineId?: string;        // 'redraw-design' → đổi flow + config + steps
}
export interface EpicHeaderVM {
  id: string; title: string; pct: string; tokens: string; // '412K tokens · $6.48'
  badge: { icon: '●' | '✕' | '✓' | '○'; label: string; tone: Tone };
}
export interface ParallelEpicVM {
  id: string; title: string; branch: string; pr: string; state: string;
  mark: string; tone: Tone;
}
export interface ConfigRowVM { k: string; v: string; src: string; fromEpic: boolean }
export interface StepRowVM {
  name: string; meta: string;
  kind: 'done' | 'active' | 'gate' | 'todo' | 'rerun' | 'failed';
  error?: string;
  actions: ActionVM[];
}
export interface HistoryVM { at: string; what: string; actor: string; tone: Tone }
export interface ShipVM { label: string; tone: Tone; active: boolean }
export interface LifecycleVM { name: string; x: number; w: number; kind: 'done' | 'active' | 'todo' }

/* ── Builder ─────────────────────────────────────────────── */
export interface FlowSummaryVM { id: string; steps: number; nodes: string[] }
export interface AgentVM {
  name: string; tier: Tier; model: string; desc?: string;
  skills: string[]; capabilities?: Capability[]; frontmatter?: string;
}
export interface SkillVM { id: string; source: 'bundled' | 'design' | 'custom'; desc: string }
export interface PresetStepVM { i: string; name: string; tag: 'auto-review' | 'human gate'; desc: string }

/* ── Studio ──────────────────────────────────────────────── */
export interface PackVM { id: string; desc: string; agents: string }
export interface ProviderVM { id: string; note: string; mark: string; tone: Tone; action: string }
export interface CapabilityVM { name: string; kind: 'bundled' | 'optional'; healthy: boolean; enabled: boolean }

/* ── Guide / Tests / Analyze / Home ──────────────────────── */
export interface CodeLineVM { t: string; tone: Tone }
export interface CheckVM { ok: boolean; label: string; fix?: string }
export interface DoctorVM { mark: string; tone: Tone; label: string; action: string }
export interface TestStepVM { name: string; meta: string; kind: 'done' | 'active' | 'todo'; gate: boolean }
export interface AnalysisVM { id: string; title: string; meta: string }
export interface ReadinessVM { mark: string; tone: Tone; label: string; value: string; action: string; actionTone: Tone }

/* ── Snapshot toàn cục ───────────────────────────────────── */
export interface WorkspaceVM {
  theme: ThemeId;
  tab: TabId;
  sidebar: SidebarVM;
  epics: { list: EpicRowVM[]; selectedId: string; detail: EpicDetailVM };
  statusBar: { branch: string; status: string; cmdHint: string };
}
export interface EpicDetailVM {
  header: EpicHeaderVM;
  alignmentWarning?: string;
  contextSteps: string[];
  contextBadge: string;         // 'published · rev-7'
  parallel: ParallelEpicVM[];
  independence: { mark: string; tone: Tone; label: string }[];
  pipelineLabel: string;        // 'cohesive-feature · 13 step'
  atLabel: string;              // 'Đang ở: implement · step 7/13'
  flowNote: string;
  flow: { nodes: { name: string; meta: string; kind: 'done'|'active'|'gate'|'todo' }[]; loop?: { from: number; to: number; label: string } };
  lifecycle: LifecycleVM[];
  config: ConfigRowVM[];
  runModes: { label: RunModeLabel; desc: string }[];
  gate?: { title: string; sub: string; badge: string; consequence: string; actions: ActionVM[] };
  steps: StepRowVM[];
  stepDetail: { k: string; v: string }[];
  artifacts: string[];
  history: HistoryVM[];
  ship: ShipVM[];
  actionBar: ActionVM[];
}

/* ── UI-only state (không gửi lên extension) ─────────────── */
export interface UiState {
  theme: ThemeId;                 // prop `theme`,  default 'dark'
  tab: TabId;                     // prop `startTab`, default 'Epics'
  mode: ExecutionMode;            // prop `executionMode`, default 'auto'
  query: string;                  // ''
  filter: 'All' | EpicStateLabel; // 'All'
  selectedEpicId: string;         // 'EPIC-142'
  follow: Record<string, boolean>;// { 'EPIC-142': true, 'EPIC-139': true }
  listCollapsed: boolean;         // false → 316px, true → 46px rail
  toolsOpen: boolean;             // false — khối search + pill filter
  followSectionOpen: boolean;     // true
  restSectionOpen: boolean;       // true
  quotaOpen: boolean;             // true
  autonomyOpen: boolean;          // false — dropdown chọn mode
  runMode: RunModeLabel;          // 'Guided'
  builderTab: BuilderTabId;       // 'Workflows'
  presetOpen: boolean;            // true
  presetApplied: boolean;         // false
  platform: 'Jira' | 'GitHub' | 'Linear' | 'Redmine' | 'Local'; // 'Jira'
  pack: string;                   // 'sdlc-core'
  capsEnabled: Record<string, boolean>;
  logsOpen: boolean;              // false
  // modal
  gateOpen: boolean;  gateReason: string;
  newEpicOpen: boolean;
  newTitle: string; newType: string; newProfile: string; newPack: string; newMode: ExecutionMode;
  addOpen: boolean;
  addSrc: string; addScope: Scope; addId: string; addTier: Tier;
  addSkills: Record<string, boolean>; addCaps: Record<Capability, boolean>;
  toastOpen: boolean;
}
