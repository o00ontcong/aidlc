/**
 * Webview-side type definitions mirroring the host's @aidlc/core shapes.
 * Copied (not imported) because @aidlc/core targets Node and is bundled
 * into the host. The types are stable enough to keep in sync manually.
 */

export type ProjectMode = 'reference' | 'workspace' | 'clone';

export interface ExtraProject {
  type: 'local' | 'github';
  ref: string;
  label: string;
  /** How the project is consumed:
   *  - `reference` — agent reads via API / path, not opened in VS Code
   *  - `workspace` — added to VS Code multi-root workspace (local only)
   *  - `clone` — GitHub repo cloned locally, then added to workspace */
  mode: ProjectMode;
}

export type ThemeMode = 'auto' | 'light' | 'dark';

export type StepStatus =
  | 'pending'
  | 'awaiting_work'
  | 'awaiting_auto_review'
  | 'awaiting_review'
  | 'approved'
  | 'rejected';

export type RunStatus = 'running' | 'completed' | 'failed';

/** Status normalized for the StatusBadge UI component. */
export type UiStatus =
  | 'in_progress'
  | 'done'
  | 'rejected'
  | 'pending'
  | 'awaiting_review'
  | 'awaiting_work'
  /** Step was previously approved but a downstream `requestStepUpdate`
   * reset it to pending — its history is intact, just needs to be redone. */
  | 'awaiting_update';

export interface ArtifactPath {
  path: string;
  exists: boolean;
}

export interface ActiveRun {
  runId: string;
  pipelineId: string;
  currentStepIdx: number;
  totalSteps: number;
  currentAgent: string;
  stepAgents: string[];
  currentStepStatus: StepStatus | string;
  revision: number;
  rejectReason?: string;
  feedback?: string;
  produces: ArtifactPath[];
  requires: ArtifactPath[];
  currentSlashCommand?: string;
}

export interface RecentEpicRef {
  id: string;
  title: string;
  status: string;
  statePath: string;
}

export interface SlashCommandRef {
  name: string;
  target: string;
}

export interface TemplateRef {
  id: string;
  name: string;
  description: string;
  /** True when the built-in preset ships a user guide Markdown file. */
  hasGuide?: boolean;
}

export interface PipelineRef {
  id: string;
  stepCount: number;
  onFailure: 'stop' | 'continue';
}

export interface SkillTemplateRef {
  id: string;
  description: string;
  /** Coarse grouping used by the AddSkill picker to split a long flat
   *  list into filterable category tabs (general / frontend / backend
   *  / mobile / devops / data / refactor / docs). */
  category: string;
}

export type McpStatus = 'connected' | 'needs_auth' | 'failed' | 'unknown';

export interface McpServerInfo {
  name: string;
  endpoint: string;
  transport: string;
  status: McpStatus;
  statusText: string;
}

/** Per-provider CLI diagnostic surfaced in the sidebar Provider section. */
export interface ProviderDiagnostic {
  ok: boolean;
  message: string;
}

export interface ProviderInfo {
  id: string;
  displayName: string;
  /** True after user clicks Apply — one-way; syncs commands for this provider. */
  enabled: boolean;
  cli: string;
  /** Fallback model used for provider commands without a workflow phase. */
  model?: string;
  /** Models reported by the local provider CLI, when discovery is supported. */
  models?: string[];
  isDefault: boolean;
  diagnostic: ProviderDiagnostic;
}

/** Canonical Claude model id → provider-specific model id. */
export type ModelMappings = Record<string, Record<string, string>>;

export interface ProviderConfig {
  defaultProvider: string;
  providers: ProviderInfo[];
  modelMappings?: ModelMappings;
}

export type SuggestionSeverity = 'high' | 'med' | 'low';

export interface CostSuggestion {
  rule: string;
  severity: SuggestionSeverity;
  scope: string;
  evidence: string;
  action: string;
  /** USD; 0 when the rule doesn't quantify a saving. */
  estSavings: number;
}

// ── Token report ──────────────────────────────────────────────────────────
export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  calls: number;
}

export interface OverviewStats {
  sessions: number;
  projects: number;
  calls: number;
  cacheHitRate: number;
  totalTokens: number;
  totalCost: number;
}

export interface ModelRow extends UsageTotals {
  model: string;
  hitRate: number;
  costShare: number;
}

export interface DailyRow extends UsageTotals {
  date: string;
}

export interface ProjectRow extends UsageTotals {
  project: string;
  displayPath: string;
  lastActive: string;
  costShare: number;
}

export interface HeatmapRow {
  dow: number;
  label: string;
  hours: number[];
  rowTotal: number;
}

export interface TokenReport {
  generatedAt: string;
  windowDays: number;
  overview: OverviewStats;
  byModel: ModelRow[];
  daily: DailyRow[];
  topProjects: ProjectRow[];
  heatmap: HeatmapRow[];
  heatmapPeak: number;
  suggestions: CostSuggestion[];
  estPotentialSavings: number;
}

export interface TokenReportPanelState {
  report: TokenReport | null;
  loading: boolean;
  error: string | null;
  windowDays: number;
}

/** Live snapshot of the agents-observe server, pushed to the Monitor panel. */
export interface AgentObserveStatus {
  serverUp: boolean;
  version: string | null;
  runtime: string | null;
  /** Live consumers — Claude Code sessions currently reporting events. */
  activeConsumers: number | null;
  /** Dashboard browser tabs currently connected. */
  activeClients: number | null;
  /** Total sessions recorded in the db. */
  sessionCount: number | null;
  /** Total events recorded in the db. */
  eventCount: number | null;
  error?: string;
}

/** State for the "Agents" tab of the unified Monitor panel. */
export interface MonitorAgentsState {
  status: AgentObserveStatus;
  dashboardUrl: string;
  dataDir: string;
}

export type MonitorTab = 'tokens' | 'agents' | 'insights';

// ── Session Insights (mirrors src/v2/sessionInsights.ts — keep in sync) ──────

export interface TurnPoint {
  ts: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  contextTokens: number;
  cost: number;
  cumulativeCost: number;
  tools: string[];
}

export interface PromptEntry {
  ts: string;
  text: string;
  source: string | null;
  permissionMode: string | null;
}

export interface HookEvent {
  ts: string;
  subtype: string;
  command: string;
  durationMs: number;
  error: string | null;
}

export interface HookCommandSummary {
  command: string;
  events: string[];
  count: number;
  totalMs: number;
  errorCount: number;
  lastError: string | null;
}

export interface CompactionEvent {
  ts: string;
  preTokens: number | null;
  trigger: string | null;
}

export interface ToolCount {
  name: string;
  count: number;
}

export interface RetrievalSummary {
  byTool: ToolCount[];
  fileReads: number;
  webSearches: number;
  webFetches: number;
  mcpReads: number;
  readPaths: string[];
}

export interface SubagentInsight {
  agentId: string;
  agentType: string | null;
  parentToolUuid: string | null;
  startedAt: string | null;
  endedAt: string | null;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;
  tools: ToolCount[];
}

export interface SessionTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cost: number;
}

export interface SessionInsight {
  sessionId: string;
  project: string;
  projectPath: string;
  cwd: string;
  title: string | null;
  gitBranch: string | null;
  version: string | null;
  startedAt: string | null;
  endedAt: string | null;
  totals: SessionTotals;
  cache: { hitRatio: number; readTokens: number; creationTokens: number };
  context: { peakTokens: number; lastTokens: number };
  turns: TurnPoint[];
  prompts: PromptEntry[];
  hooks: HookEvent[];
  hookSummary: HookCommandSummary[];
  compactions: CompactionEvent[];
  fileEdits: number;
  retrieval: RetrievalSummary;
  toolUse: ToolCount[];
  subagents: SubagentInsight[];
}

export interface SessionListItem {
  sessionId: string;
  project: string;
  projectPath: string;
  jsonlPath: string;
  mtimeMs: number;
  sizeBytes: number;
}

/** State for the "Insights" tab of the unified Monitor panel. */
export interface InsightPanelState {
  sessions: SessionListItem[];
  selectedPath: string | null;
  insight: SessionInsight | null;
  loading: boolean;
}

/** Live OTel snapshot (mirrors src/v2/otelReceiver.ts). */
export interface OtelModelRow { model: string; tokens: number; cost: number; }
export interface OtelSnapshot {
  listening: boolean;
  port: number;
  receiving: boolean;
  lastEventAt: number | null;
  tokensByType: Record<string, number>;
  totalTokens: number;
  totalCostUsd: number;
  byModel: OtelModelRow[];
  sessions: number;
  linesAdded: number;
  linesRemoved: number;
  commits: number;
  envConfigured: boolean;
}

export interface SidebarState {
  /** Resolved AIDLC output language, including the `auto` fallback. */
  displayLanguage: 'en' | 'vi';
  hasFolder: boolean;
  workspaceName: string;
  configExists: boolean;
  agentsCount: number;
  skillsCount: number;
  pipelinesCount: number;
  epicsCount: number;
  recentEpics: RecentEpicRef[];
  slashCommands: SlashCommandRef[];
  builtinTemplates: TemplateRef[];
  projectTemplates: TemplateRef[];
  activeRuns: ActiveRun[];
  /** Lightweight pipeline list for the inline Start-Run modal. */
  pipelines: PipelineRef[];
  /** All existing run ids (any status) — used by the modal to validate uniqueness. */
  runIds: string[];
  /** True when ~/aidlc-demo-project already exists. The "Load Demo Project"
   * button uses this to pop an inline modal asking re-seed vs open-as-is
   * instead of letting the host show a VS Code notification. */
  demoProjectExists: boolean;
  /** True when ~/aidlc-ios-demo already exists. */
  iosDemoProjectExists: boolean;
  /** True when ~/aidlc-cofofo-weather-demo already exists. */
  cofofoWeatherDemoProjectExists: boolean;
  /** MCP servers Claude is currently connected to. null = first load is in
   * flight, [] = none configured. */
  mcpServers: McpServerInfo[] | null;
  mcpLoading: boolean;
  mcpError: string | null;
  /** Extra projects from any in-progress epic (for sidebar display). */
  extraProjects?: ExtraProject[];
  /** Value of the `aidlc.autopilot.enabled` setting. Drives whether the
   * AIDLC Autopilot row in the Common workflows shows "Coming soon"
   * (disabled) or an active "On" state. */
  autopilotEnabled: boolean;
  /** Agent CLI providers (Claude / Cursor / Codex). Mocked in harness step 1. */
  providerConfig?: ProviderConfig;
}

export type AssetScope = 'project' | 'aidlc' | 'global';

export interface AgentSummary {
  id: string;
  scope: AssetScope;
  filePath: string;
  description?: string;
  /** Primary skill id (first entry) — kept for back-compat. */
  skill?: string;
  /** All skills the agent can use. */
  skills?: string[];
  model?: string;
  integrations?: string[];
  /** Human label of the built-in preset that contributed this entry (e.g. "SDLC Pipeline"). Absent for user-created entries. */
  builtinFrom?: string;
}

export interface SkillSummary {
  id: string;
  scope: AssetScope;
  filePath: string;
  description?: string;
  builtinFrom?: string;
}

export interface PipelineStepSummary {
  agent: string;
  name?: string;
  /** Per-step execution model; falls back to the agent model when absent. */
  model?: string;
  /** Skills this step makes available to the agent. */
  skills?: string[];
  enabled: boolean;
  produces: string[];
  /** Content markers asserted against the produced files (E1). */
  produces_contains?: string[];
  requires: string[];
  /** Agent ids this step waits for. Non-empty turns the workflow into a DAG. */
  depends_on?: string[];
  human_review: boolean;
  auto_review: boolean;
  auto_review_runner?: string;
  /** Max ms the auto_review validator may run before it's aborted (C2). */
  auto_review_timeout_ms?: number;
}

export interface PipelineSummary {
  id: string;
  steps: PipelineStepSummary[];
  on_failure: 'stop' | 'continue';
  builtin?: boolean;
  /** Human label for built-in pipelines (e.g. "iOS Native Pipeline"). User-defined pipelines leave this undefined. */
  name?: string;
  /** @deprecated CoFoFo pipelines are all startable; kept for older webview payloads. */
  templateOnly?: boolean;
}

/** A task-type recipe surfaced in the Start-Epic modal (mirrors host RecipeSummary). */
export interface RecipeSummary {
  id: string;
  description?: string;
  /** Source pipeline id the recipe draws from. */
  from: string;
  /** Selected step ids, in order. */
  steps: string[];
  /** Resolved agent ids (ordered) — for capability prompts. */
  agents: string[];
}

export interface AutoReviewVerdict {
  decision: 'pass' | 'reject';
  reason: string;
  at: string;
  runner: string;
}

export type StepHistoryEntry =
  | {
      kind: 'reject';
      at: string;
      revision: number;
      reason?: string;
      sentBackToIdx: number;
    }
  | {
      kind: 'rerun';
      at: string;
      revision: number;
      feedback?: string;
    }
  | {
      kind: 'bug_report';
      at: string;
      revision: number;
      report: string;
    }
  | {
      kind: 'auto_review';
      at: string;
      revision: number;
      decision: 'pass' | 'reject';
      reason: string;
      runner: string;
    }
  | {
      kind: 'approve';
      at: string;
      revision: number;
    }
  | {
      kind: 'skip';
      at: string;
      revision: number;
      reason?: string;
    }
  | {
      /** A Canvas verdict bound to the content-addressed review bundle. */
      kind: 'canvas_verdict';
      at: string;
      revision: number;
      verdict: 'approve' | 'request_changes';
      reviewer: string;
      bundleHash: string;
    }
  | {
      /** Human review deferred to an aggregate delivery-level bundle. */
      kind: 'aggregate_defer';
      at: string;
      revision: number;
      reviewBundleRevision: number;
    }
  | {
      // A /annotate-artifact round that edited the .md, merged from the
      // artifacts folder's `.annotation-history.json` at read time.
      kind: 'annotate';
      at: string;
      revision: number;
      author?: string;
      note?: string;
      summary?: string;
    };

/** Mirror of `epicTokenAttribution.HistoryEventUsage` — kept in sync by hand. */
export interface HistoryEventUsage {
  totalTokens: number;
  cost: number;
  calls: number;
}

/** Mirror of `epicTokenAttribution.StepUsage`. */
export interface StepUsage {
  agent: string;
  startedAt: string | null;
  endedAt: string | null;
  cost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  calls: number;
  history?: HistoryEventUsage[];
}

/** Mirror of `epicTokenAttribution.EpicUsage`. */
export interface EpicUsage {
  total: { cost: number; totalTokens: number; calls: number };
  steps: StepUsage[];
  hasOverlap: boolean;
  computedAt: number;
}

export interface EpicStepDetailFull {
  agent: string;
  /** Phase id / slash command name (e.g. `plan`, `test-plan`) when the
   *  pipeline step carries a separate `name:` distinct from `agent:`. */
  stepName?: string;
  /** Resolved slash command for this step (`/implement` or
   *  `/sdlc-parallel-full-implement`), from workspace.yaml slash_commands. */
  slashCommand?: string;
  /** Basename of the step's first `produces:` path — the file the user
   *  expects to see written by this step (e.g. `PRD.md`). Falls back to
   *  the agent meta artifact when the step doesn't declare one. */
  artifact?: string;
  /** Every artifact declared/recorded for this step, in pipeline order. */
  artifacts?: string[];
  /** Host-computed: true when `artifact` exists on disk right now. */
  artifactExists?: boolean;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  /** Added by migration from an older pipeline and not submitted yet. */
  isNew?: boolean;
  runStatus: StepStatus | null;
  isCurrentRunStep: boolean;
  rejectReason?: string;
  autoReviewVerdict?: AutoReviewVerdict;
  stepHasAutoReview: boolean;
  stepHasHumanReview: boolean;
  /** Content-bound review gate; direct Approve/Reject is intentionally hidden. */
  reviewMode?: 'canvas';
  reviewArtifacts?: string[];
  /** Step config: can a human skip this step from awaiting_work (`skippable: true`)? */
  stepSkippable: boolean;
  /** Agent ids this step waits for (DAG edges) — empty for sequential. */
  dependsOn?: string[];
  startedAt?: string;
  finishedAt?: string;
  /** Append-only timeline of significant transitions (reject / rerun /
   * auto_review / approve). Surfaced verbatim from the run state. */
  history?: StepHistoryEntry[];
  /** Number of times this step has been rejected (cached count for display). */
  rejectCount?: number;
  /** Carried feedback (from cascade reject blame or manual rerun feedback). */
  feedback?: string;
  /** Token usage attributed to this step. */
  tokenUsage?: StepUsage;
  /** Built-in phase metadata for Help + Input/Output when agent meta is empty. */
  stepHelp?: {
    description: string;
    inputs: string;
    outputs: string;
    model: string;
    persona: string;
    acceptanceCriteria: string[];
    nextPhaseId?: string;
  };
}

export interface EpicSummary {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  progress: number;
  statePath: string;
  stepDetails: EpicStepDetailFull[];
  currentStep: number;
  pipeline: string | null;
  /** Recipe that materialized this task's immutable execution snapshot. */
  recipeId?: string;
  agent: string | null;
  runId: string | null;
  runMode: 'guided' | 'autonomous';
  inputs: Record<string, string>;
  epicDir: string;
  existingArtifacts: string[];
  /** Basename → absolute path (includes produces: outside epic/artifacts/). */
  artifactPaths: Record<string, string>;
  createdAt: string;
  /** True when this folder has no state.json/pipeline and the summary was
   *  synthesized from the `.md` files in its artifacts/ folder. Steps are a
   *  straight lifecycle-ordered list with no run controls. */
  artifactsOnly?: boolean;
  /** Aggregate token usage for the epic. */
  tokenUsage?: EpicUsage;
  /** Human-scale graphs checked in beside the epic (Flow, Surfaces, Impact). */
  visualizations?: EpicVisualizations;
  /** True when this epic's artifacts sit at the default `docs/epics/` path
   * instead of the workspace's active epics directory — a config-drift
   * signal. */
  epicsDirMismatch?: boolean;
}

export type FeatureImpactChange = 'add' | 'modify' | 'delete' | 'unchanged';

export interface EpicFeatureImpact {
  id: string;
  name: string;
  change: FeatureImpactChange;
  summary?: string;
}

export interface ScreenAreaDiagram {
  id: string;
  name: string;
  count: number;
  mermaid: string;
}

export interface EpicVisualizations {
  impactMermaid?: string;
  surfacesMermaid?: string;
  flowMermaid?: string;
  screensMermaid?: string;
  /** Per-tab/flow slices — open from the hub map (Auth (15), Profile (28), …). */
  screenAreas?: ScreenAreaDiagram[];
  impactFeatures?: EpicFeatureImpact[];
}

export interface DiffIgnorePatterns {
  patterns: string[];
}

export interface AgentMeta {
  name: string;
  description: string;
  inputs: string;
  outputs: string;
  artifact: string;
  /** Capability ids declared on the agent (used by Start Epic to ask for run-time bindings). */
  capabilities?: string[];
}

export interface ProjectDocumentSummary {
  id: 'agents' | 'project' | 'status' | 'decisions';
  label: string;
  description: string;
  path: string;
  exists: boolean;
  updatedAt?: string;
  excerpt?: string;
}

export interface ProjectWorkspaceSummary {
  initialized: boolean;
  readyCount: number;
  totalCount: number;
  documents: ProjectDocumentSummary[];
}

// ── Discover blueprint (mirrors src/v2/discoverHost.ts) ──────────────────

export type DiscoverStepId =
  | 'idea' | 'product' | 'requirements' | 'features' | 'usecases' | 'userflows'
  | 'architecture' | 'datamodel' | 'techdecisions' | 'structure' | 'plan' | 'skeleton';

export interface DiscoverItem {
  id: string;
  text: string;
  description?: string;
  origin: 'ai' | 'human';
  pinned: boolean;
  flagged: boolean;
  detail?: DiscoverItemDetail;
}

/** Published-context data and canonical edit target for the shared Requirement/Feature dialog. */
export interface DiscoverHistoryEntitySnapshot {
  title: string;
  status: 'draft' | 'review' | 'ready' | 'deprecated';
  fields: Record<string, string[]>;
}

export interface DiscoverItemDetail {
  kind: 'requirement' | 'feature';
  status: 'draft' | 'review' | 'ready' | 'deprecated';
  fields: Record<string, string[]>;
  contextPreview?: { estimatedTokens: number; discoverRevision?: string };
  /** The canonical Markdown item to update; history and derived context stay read-only. */
  editable?: { docPath: string; section: string; revision: number; description: string; updatedAt?: string; origin: 'ai' | 'human' };
  readiness: { required: string[]; missing: string[] };
  links: { references: string[]; coveringFeatureIds: string[]; coveredRequirementIds: string[] };
  evidence: {
    status: 'planned' | 'implemented' | 'stale' | 'orphaned' | 'conflict';
    sourcePaths: string[];
    testPaths: string[];
    entryPoints: string[];
    sourceFileCount: number;
    discoverRevision?: string;
    sourceCommit?: string | null;
  };
  publication: {
    status: 'missing' | 'draft' | 'ready' | 'stale' | 'conflict';
    nextAction: string;
    discoverRevision?: string;
    publishedAt?: string;
    sourceCommit?: string | null;
    dirty?: boolean;
  };
  history: Array<{
    discoverRevision: string;
    publishedAt: string;
    changeType: string;
    changedFields: string[];
    summary: string;
    reason: string;
    breaking: boolean;
    actor: { kind: string; id: string };
    source?: { taskId?: string; jiraKey?: string; runId?: string; command?: string };
    beforeHash: string | null;
    afterHash: string;
    before?: DiscoverHistoryEntitySnapshot;
    after?: DiscoverHistoryEntitySnapshot;
  }>;
}

export interface DiscoverRecord {
  id: string;
  title: string;
  fields: { label: string; value: string; items: string[] }[];
  origin: 'ai' | 'human';
  pinned: boolean;
  flagged: boolean;
}

export interface DiscoverSection {
  key: string;
  heading: string;
  kind: string;
  /** Spec metadata for the editor: id prefix, whether ids carry a group, field labels. */
  idPrefix?: string;
  grouped?: boolean;
  hint?: string;
  fields?: { label: string; list?: boolean; required?: boolean }[];
  prose: string;
  items: DiscoverItem[];
  records: DiscoverRecord[];
  /** Lines under this heading the parser could not read as items. */
  stray: number;
}

export interface DiscoverDoc {
  path: string;
  title: string;
  exists: boolean;
  filePath: string;
  step: DiscoverStepId;
  /** Raw Markdown as stored on disk. */
  raw: string;
  sections: DiscoverSection[];
  updatedAt?: string;
  lastRunId?: string;
}

export interface DiscoverStep {
  id: DiscoverStepId;
  order: number;
  label: string;
  labelVi?: string;
  goal: string;
  files: string[];
  /** The only user-facing step state: docs already have content, or they do not. */
  hasContent: boolean;
}

export interface DiscoverRunSummary {
  id: string;
  step: DiscoverStepId;
  mode: 'fill' | 'refine';
  /** `scan` reconciled every step against the source code in one pass; `edit` wraps a person's direct field edit. */
  kind?: 'step' | 'scan' | 'edit';
  /** 1 = product, 2 = architecture, 3 = plan. Set on scan runs. */
  scanPass?: 1 | 2 | 3;
  startedAt: string;
  finishedAt?: string;
  note?: string;
  diff: { added: string[]; updated: string[]; removed: string[] };
  guardrail: string[];
  revertable: boolean;
  status: 'running' | 'review' | 'kept' | 'reverted';
}

export interface DiscoverDiffRow {
  key: string;
  file: string;
  id: string;
  text: string;
  before?: string;
}

export type CofofoRecipeId =
  | 'cofofo-foundation' | 'cofofo-feature' | 'cofofo-bugfix'
  | 'cofofo-bootstrap' | 'cofofo-refresh-context' | 'cofofo-update-rules'
  | 'cofofo-repin-bundle';

/** Delivery pipelines a Discover phase may start. */
export const DISCOVER_HANDOFF_RECIPE_IDS: CofofoRecipeId[] = [
  'cofofo-feature', 'cofofo-bugfix',
];

export const COFOFO_RECIPE_IDS: CofofoRecipeId[] = [
  'cofofo-foundation', 'cofofo-feature', 'cofofo-bugfix',
  'cofofo-bootstrap', 'cofofo-refresh-context', 'cofofo-update-rules', 'cofofo-repin-bundle',
];

export interface DiscoverPhase {
  id: string;
  title: string;
  goal: string;
  dependsOn: string[];
  deliverables: string[];
  definitionOfDone: string[];
  cites: { id: string; file: string; text: string }[];
  suggestedRecipe: CofofoRecipeId;
  handoff?: { phaseId: string; epicId: string; recipeId: CofofoRecipeId; title: string; at: string };
  /** Cited features already exist in source — hide the default "create epic" action. */
  alreadyBuilt?: boolean;
  builtFiles?: string[];
  searchTokens?: string[];
  missingFeatureIds?: string[];
  scannedFileCount?: number;
}

/** Mirrors `DiscoverScope` in core — which repos the blueprint describes. */
export interface DiscoverScopeSummary {
  layout: 'single' | 'parent' | 'child';
  parentPath?: string;
  repos: { path: string; kind: string; name?: string }[];
  excludes: string[];
  declaredAt: string;
}

/** Payload persisted when the user confirms a repo layout (no timestamp). */
export interface DiscoverScopeDraft {
  layout: 'single' | 'parent' | 'child';
  parentPath?: string;
  repos: { path: string; kind: string; name: string }[];
  excludes: string[];
}

export interface RepoCandidateUi {
  path: string;
  name: string;
  kind: string;
  isRepo: boolean;
  hasBlueprint: boolean;
  manifests: string[];
}

/** Host → webview: open the in-panel repo layout dialog. */
export interface DiscoverScopeModalOpen {
  intent: 'scan' | 'edit';
  mode: 'confirm' | 'wizard';
  probe: {
    suggested: 'single' | 'parent' | 'child';
    self: RepoCandidateUi;
    children: RepoCandidateUi[];
    parentPath?: string;
  };
  existing?: DiscoverScopeSummary;
}

/** Host → webview: open the in-panel commit dialog. */
export interface DiscoverCommitModalOpen {
  defaultMessage: string;
  repoName: string;
  changeCount: number;
}

export type DiscoverEpicSuggestionKind =
  | 'no-skeleton'
  | 'not-implemented'
  | 'docs-stale'
  | 'undocumented'
  | 'doc-gap';

export interface DiscoverEpicSuggestion {
  id: string;
  kind: DiscoverEpicSuggestionKind;
  recipeId: CofofoRecipeId;
  title: string;
  description: string;
  brief: string;
  summary: string;
  details: string[];
  level: 'error' | 'warn' | 'info';
  featureId?: string;
  phaseId?: string;
  docFile?: string;
}

export type DiscoverItemCoverageStatus = 'in-code' | 'missing' | 'stale';
export type DiscoverCoverageKind = 'fr' | 'feature' | 'screen';

export interface DiscoverCoveredItem {
  id: string;
  kind: DiscoverCoverageKind;
  text: string;
  description?: string;
  status: DiscoverItemCoverageStatus;
  group: string;
  coveringFeatureIds: string[];
  coveredFrIds: string[];
  matchedFiles: string[];
  detail?: DiscoverItemDetail;
}

export interface DiscoverItemCoverage {
  sourceFileCount: number;
  items: DiscoverCoveredItem[];
  counts: { inCode: number; missing: number; stale: number };
}

export interface DiscoverSummary {
  id: string;
  title: string;
  seedSentence: string;
  docsRoot: string;
  docsRootPath: string;
  outputLanguage: 'en' | 'vi';
  /** Absent until the user declares the repo layout — the first scan asks. */
  scope?: DiscoverScopeSummary;
  /** True when the commit-target repo has uncommitted changes. */
  hasUncommittedChanges?: boolean;
  currentStep: DiscoverStepId;
  revision: number;
  steps: DiscoverStep[];
  docs: DiscoverDoc[];
  devDocs: { path: string; exists: boolean; filePath: string }[];
  extraFiles: Record<string, string[]>;
  issues: { level: string; code: string; message: string; file?: string; id?: string }[];
  /** Pre-filled epic proposals from docs ↔ code reconciliation. */
  epicSuggestions: DiscoverEpicSuggestion[];
  itemCoverage?: DiscoverItemCoverage;
  /** Latest immutable context publication; Markdown remains editable. */
  context: {
    status: 'missing' | 'draft' | 'ready' | 'stale' | 'conflict';
    discoverRevision?: string;
    publishedAt?: string;
    nextAction: string;
  };
  runs: DiscoverRunSummary[];
  /** Three-pass scan campaign, when one exists. Keep does not start the next pass. */
  scanCampaign?: { status: 'active' | 'done'; lastKeptPass: 0 | 1 | 2 | 3 };
  /** Implementation Plan phases, each one a candidate epic. */
  phases: DiscoverPhase[];
  activeRun?: {
    run: DiscoverRunSummary;
    added: DiscoverDiffRow[];
    updated: DiscoverDiffRow[];
    removed: DiscoverDiffRow[];
  };
}

export interface WorkspaceState {
  hasFolder: boolean;
  workspaceName: string;
  configExists: boolean;
  /** Shared, durable project memory used by every task. */
  projectWorkspace?: ProjectWorkspaceSummary;
  /** The Discover blueprint, when this workspace has one. */
  discover?: DiscoverSummary;
  agents: AgentSummary[];
  skills: SkillSummary[];
  pipelines: PipelineSummary[];
  /** Pipelines available to New Task, including virtual project-local defaults. */
  startPipelines?: PipelineSummary[];
  /** Task-type recipes for the Start-Epic modal's auto-generate path. */
  recipes: RecipeSummary[];
  epics: EpicSummary[];
  /** Current published Project Context, if the workspace has one. */
  /** id → display metadata (pulled from workspace.yaml) for the step-detail card. */
  agentMeta: Record<string, AgentMeta>;
  /** id → slash command string (with leading /). First wins on duplicates. */
  slashCommandsByAgent: Record<string, string>;
  /** Counts for the tab badges. */
  agentsCount: number;
  skillsCount: number;
  pipelinesCount: number;
  epicsCount: number;
  /** All existing run ids (any status) — for inline Start-Run modal uniqueness check. */
  runIds: string[];
  /** Built-in skill templates surfaced for the inline AddSkill modal. */
  skillTemplates: SkillTemplateRef[];
  /** The default CoFoFo Feature pipeline used to prefill a custom pipeline. */
  defaultPipeline?: PipelineSummary;
  /** Suggested next sequential id for the inline Start-Epic modal (e.g. EPIC-007). */
  nextEpicId: string;
  /** All existing epic ids (folders under epicRoot) — for uniqueness check. */
  existingEpicIds: string[];
  requirementRuns?: RequirementRunSummary[];
  /** Initial view to render when the panel first opens. */
  initialView?: WorkspaceView;
  /** Whether testagent.config.yaml exists at the workspace root. */
  testAgentConfigExists?: boolean;
  /** Targets parsed from testagent.config.yaml includes. */
  testAgentTargets?: TestAgentTarget[];
  /** Whether the epic-memory auto-load hook is enabled in ~/.claude/settings.json. */
  epicMemoryHookEnabled?: boolean;
  /** Current epics directory (relative path from project root). */
  epicsDir: string;
  /** Persisted Epics-list UI prefs from extension workspaceState. */
  epicsViewUi?: {
    filter?: EpicFilter;
    search?: string;
    followOpen?: boolean;
    noFollowOpen?: boolean;
    followedIds?: string[];
    listWidth?: number;
  };
  /** Persisted Discover-tab UI prefs from extension workspaceState. */
  discoverViewUi?: {
    railWidth?: number;
    agentPanelOpen?: boolean;
  };
  /** Curated, read-only architecture model for Architecture Studio. */
  architecture: ArchitectureStudioState;
  /** Resolved once in the extension host from aidlc.displayLanguage / VS Code. */
  displayLanguage: 'en' | 'vi';
  /** Active agent provider — mirrored from sidebar for Epic Run / model display. */
  providerConfig?: ProviderConfig;
  /**
   * Jira sprint snapshot, read from cache synchronously so the Sprint tab paints
   * on first open. Live updates arrive as separate `sprintState` messages.
   */
  sprint?: SprintState;
}

export interface ArchitectureStudioNode {
  id: string;
  label: string;
  kind?: string;
  layer?: string;
  file?: string;
  symbol?: string;
  role?: string;
  summary?: string;
  confidence?: string;
  evidence?: string[];
}

export interface ArchitectureStudioEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
  protocol?: string;
  role?: string;
  confidence?: string;
  evidence?: string[];
}

export interface ArchitectureStudioFeature {
  id: string;
  name: string;
  kind?: string;
  summary?: string;
  confidence?: string;
  evidence?: string[];
  parent?: string;
  area?: string;
  module?: string;
  children?: string[];
  entrypoints?: Array<{ label: string; file: string; symbol?: string }>;
  layers?: string[];
}

export interface ArchitectureStudioFeatureFlow {
  featureId: string;
  title?: string;
  nodes: ArchitectureStudioNode[];
  edges: ArchitectureStudioEdge[];
}

export interface ArchitectureStudioState {
  available: boolean;
  message?: string;
  revision?: string;
  generatedAt?: string;
  freshness: 'fresh' | 'stale' | 'unknown';
  sourcePaths: string[];
  warnings: string[];
  nodes: ArchitectureStudioNode[];
  edges: ArchitectureStudioEdge[];
  features: ArchitectureStudioFeature[];
  screens: ArchitectureStudioFeature[];
  screenEdges: ArchitectureStudioEdge[];
  structuralNodes: ArchitectureStudioNode[];
  structuralEdges: ArchitectureStudioEdge[];
  featureFlows: Record<string, ArchitectureStudioFeatureFlow>;
}

export interface TestAgentTarget {
  name: string;
  filePath: string;
  adapter?: string;
  url?: string;
}

export type WorkspaceView =
  | 'project' | 'discover' | 'builder' | 'architecture' | 'epics' | 'sprint' | 'analyze' | 'tests';

// ── Jira Sprint tab ────────────────────────────────────────────────────────
// Mirrors the host shapes in @aidlc/core (JiraTicket) and
// src/v2/jiraSprintLogic.ts (SprintState). Copied, not imported — see the file
// header. The host is the only writer; the webview never constructs these.

export type JiraStatusCategory = 'todo' | 'inprogress' | 'done';
export type JiraTypeKind = 'story' | 'bug' | 'task' | 'spike' | 'subtask' | 'other';
export type SprintScope = 'mine' | 'team';
export type SprintStatus = 'unconfigured' | 'loading' | 'ready' | 'error';

export interface JiraBoardRef { id: number; name: string; }

export interface JiraSprintRef {
  id: number;
  name: string;
  state: 'active' | 'future' | 'closed' | 'unknown';
  startDate: string;
  endDate: string;
}

export interface SprintTicket {
  key: string;
  id: string;
  type: string;
  typeKind: JiraTypeKind;
  summary: string;
  descriptionMd: string;
  acceptanceCriteria: string[];
  status: string;
  statusCategory: JiraStatusCategory;
  assigneeAccountId: string;
  assigneeName: string;
  isMine: boolean;
  points: number | null;
  priority: string;
  labels: string[];
  parentKey: string;
  parentSummary: string;
  existingSubtasks: Array<{ key: string; summary: string; status: string }>;
  /** Jira forbids nesting, so a subtask cannot be a parent. */
  isSubtask: boolean;
  url: string;
  updatedAt: string;
  /** AIDLC task created from this ticket, joined on inputs.jira. */
  linkedEpicId?: string;
  /** `step 4/7` · `xong` · `lỗi` */
  linkedEpicProgress?: string;
}

/** One rendered section of a subtask body, mirroring core's RenderedSection. */
export interface SubtaskSection {
  heading: string;
  kind: 'prose' | 'bulletList' | 'taskList' | 'inlineCode';
  lines: string[];
}

/** A planned subtask, as the preview panel renders it. Host is the only writer. */
export interface SubtaskDraft {
  domain: string;
  summary: string;
  sections: SubtaskSection[];
  /** Preview text — generated from the same model as the ADF payload. */
  descriptionMd: string;
  labels: string[];
  /** Pipeline step ids this subtask stands for. */
  fromSteps: string[];
  selected: boolean;
  /** Already on Jira (our ledger, or a teammate's hand-made subtask). */
  existingKey?: string;
  /** Non-empty = cannot be created; each entry is a human-readable reason. */
  blockedBy: string[];
}

/** Result of planning subtasks for one ticket. */
export interface SubtaskPlan {
  ticketKey: string;
  drafts: SubtaskDraft[];
  /** Planning could not run at all. */
  error?: string;
  /** Non-fatal notes worth showing above the list. */
  notices: string[];
  issueTypeName?: string;
}

/** Outcome of a create, per draft — bulk create succeeds partially. */
export interface SubtaskCreateOutcome {
  ticketKey: string;
  created: Array<{ domain: string; key: string }>;
  failed: Array<{ domain: string; message: string }>;
}

export interface SprintState {
  status: SprintStatus;
  board?: JiraBoardRef;
  sprint?: JiraSprintRef;
  boards: JiraBoardRef[];
  sprints: JiraSprintRef[];
  tickets: SprintTicket[];
  scope: SprintScope;
  errorKind?: string;
  errorMessage?: string;
  lastSyncedAt?: string;
  /** Tickets came from cache rather than a live fetch. */
  fromCache?: boolean;
  /**
   * Tickets could not be re-verified (fetch failed, or the cache is past its
   * refresh window) — readable, but not safe to act on. Narrower than
   * `fromCache`: a cache still inside the refresh window is not stale.
   */
  stale?: boolean;
  subtasksEnabled: boolean;
  /** Settings still missing, for the unconfigured empty state. */
  missing?: string[];
  /** Non-secret values prefilled into the connect dialog. Never the token. */
  connect: { site: string; email: string };
  /** The editable half of `aidlc.jira.*`, as the config dialog shows it. */
  config: {
    projectKey: string;
    /** 0 = no board pinned; the first visible board is used. */
    boardId: number;
    jql: string;
    refreshMinutes: number;
    requestTimeoutSeconds: number;
  };
}

export type EpicFilter = 'all' | 'in_progress' | 'pending' | 'done' | 'failed';

export interface RequirementRunSummary {
  id: string;           // REQ-001
  createdAt: string;    // human-readable date string
  platform: string;     // jira | github | linear | redmine | local
  parentTask: string;   // parent epic key or blank
  source: string;       // requirements_source value
  status: 'pending' | 'complete';
  taskCount: number | null;
  hasRequirements?: boolean;
}

/** SDLC compliance-standard picker webview (GH-69 P3). */
export interface StandardProfileVM {
  id: string;
  name: string;
  description: string;
  /** Standard anchors as [phase, standardName] pairs, for display. */
  anchors: Array<[string, string]>;
  /** Whether this profile enforces any traceability rules. */
  enforce: boolean;
  /** The rule ids this profile runs (empty when enforce is false). */
  rules: string[];
}

export interface StandardPickerState {
  profiles: StandardProfileVM[];
  /** Currently-active profile id (from workspace.yaml `standard:`). */
  current: string;
  /** Set briefly after a successful apply so the UI can confirm. */
  justApplied?: string;
}

declare global {
  interface Window {
    __AIDLC_INITIAL_STATE__?: SidebarState | WorkspaceState | StandardPickerState;
    __AIDLC_INITIAL_THEME__?: ThemeMode;
    __AIDLC_MONITOR_TAB__?: MonitorTab;
    BRAND_ICON_URI?: string;
    EXTENSION_VERSION?: string;
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

export interface VsCodeApi {
  postMessage(message: unknown): void;
  setState<T>(state: T): T;
  getState<T>(): T | undefined;
}

export {};
