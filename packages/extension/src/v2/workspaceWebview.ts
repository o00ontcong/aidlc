/**
 * Unified Workspace webview — replaces the previous Builder + Epics panels
 * with a single React-rendered surface. The user navigates between Builder
 * and Epics views via the in-panel pill nav; the host treats both VS Code
 * commands (`aidlc.openBuilder`, `aidlc.openEpicsList`) as `show()` calls
 * with different `initialView` arguments.
 *
 * Visual rendering lives in `src/webview/workspace/main.tsx` (compiled to
 * `out/webviews/workspace.js` by vite). This file owns:
 *   - state aggregation (agents / skills / pipelines / epics)
 *   - message routing (mutation helpers + delegation to commands)
 *   - HTML shell that loads the React bundle with CSP nonce
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Diagnostics for the recipe classifier / requirement loader (Output → "AIDLC Recipe"). */
let recipeLog: vscode.OutputChannel | undefined;
function rlog(msg: string): void {
  if (!recipeLog) { recipeLog = vscode.window.createOutputChannel('AIDLC Recipe'); }
  recipeLog.appendLine(msg);
}

/**
 * Run the `claude` CLI headlessly with stdin CLOSED. Closing stdin (`'ignore'`)
 * is essential: with an open-but-empty stdin pipe, `claude --print` waits ~3s
 * for piped input and prints a "no stdin data received" warning that pollutes
 * output. Mirrors DefaultRunner's stdio. Resolves stdout on exit 0; rejects
 * with `{ stderr }` attached otherwise (or on timeout).
 */
function runClaude(
  args: string[],
  opts: { cwd: string; timeoutMs: number; onChunk?: (chunk: string) => void },
): Promise<string> {
  return new Promise((resolve, reject) => {
    // VS Code launched from the Dock has a minimal PATH (no node/npx/claude
    // from nvm/homebrew), which makes `claude` (and the stdio MCP servers it
    // spawns) fail. Augment PATH with the common install locations.
    const extraPath = ['/opt/homebrew/bin', '/usr/local/bin', `${process.env.HOME ?? ''}/.local/bin`]
      .filter(Boolean)
      .join(':');
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${process.env.PATH ?? ''}:${extraPath}` };
    // Use the user's own `claude` login (claude.ai subscription), not any
    // inherited API key / session vars — a stale or scoped ANTHROPIC_API_KEY
    // (e.g. inherited when VS Code is launched from a Claude Code session)
    // makes the spawned CLI fail with "Invalid API key".
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.ANTHROPIC_BASE_URL;
    delete env.CLAUDE_CODE_ENTRYPOINT;
    delete env.CLAUDE_CODE_SESSION_ID;
    delete env.CLAUDE_CODE_EXECPATH;
    const proc = spawn('claude', args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'], env });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Timed out waiting for the source (the MCP may be slow or unavailable).'));
    }, opts.timeoutMs);
    proc.stdout.on('data', (d: Buffer) => {
      const s = d.toString('utf8');
      out += s;
      opts.onChunk?.(s);
    });
    proc.stderr.on('data', (d: Buffer) => { err += d.toString('utf8'); });
    proc.on('error', (e) => { clearTimeout(timer); rlog(`[runClaude] spawn error: ${String(e)}`); reject(e); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      rlog(`[runClaude] exit=${code}\n  stdout: ${out.trim().slice(0, 600)}\n  stderr: ${err.trim().slice(0, 600)}`);
      if (code === 0) { resolve(out); }
      else { reject(Object.assign(new Error(`claude exited ${code}`), { stderr: err, stdout: out })); }
    });
  });
}

/**
 * Per-source "how to fetch" actions for the `claude` CLI. Claude uses whatever
 * MCP integrations the user has configured (Atlassian, GitHub, Google Drive,
 * web fetch) to retrieve the content. The analysis/JSON spec is appended by
 * {@link WorkspaceWebview.loadRequirementForWebview}.
 */
/** Human label per requirement source, for user-facing messages. */
const SOURCE_LABEL: Record<string, string> = {
  jira: 'Jira', github: 'GitHub', drive: 'Google Drive', url: 'web',
};

const REQUIREMENT_FETCH_ACTION: Record<string, string> = {
  jira:
    'Read the SINGLE Jira issue named in the user message (a key like PROJ-123 or a browse URL): ' +
    'resolve the cloud id if needed, then fetch only that one issue\'s `summary` and `description` fields. ' +
    'Do NOT search, do NOT run JQL, do NOT fetch or enumerate child / linked / related issues, do NOT read files. ' +
    'As soon as you have the summary, STOP and answer — if the description is empty or null, answer immediately ' +
    'using only the summary. Do not look for more context.',
  github:
    'Fetch the GitHub issue or pull request named in the user message (a `owner/repo#123` ref ' +
    'or a github.com URL) using the GitHub CLI via the Bash tool — NOT a web fetch, NOT an MCP tool. ' +
    'Parse the owner, repo and number from the ref, then run exactly one command: ' +
    '`gh issue view <number> --repo <owner>/<repo> --json title,body` ' +
    '(use `gh pr view` instead when the URL path contains /pull/). ' +
    'If that command errors, output NO_CONTENT. Do not browse the web, do not enumerate other issues.',
  drive:
    'Make ONE Google Drive tool call to read only the document named in the user message (a Drive URL or file id).',
  url:
    'Fetch the URL in the user message once and read its main content (the requirement / spec). Do not crawl other pages.',
};

/** Parse a GitHub issue/PR reference (`owner/repo#123` or a github.com URL). */
function parseGithubRef(ref: string): { owner: string; repo: string; num: string; kind: 'issue' | 'pr' } | null {
  const short = ref.trim().match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/);
  if (short) { return { owner: short[1], repo: short[2], num: short[3], kind: 'issue' }; }
  const url = ref.match(/github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull)\/(\d+)/);
  if (url) { return { owner: url[1], repo: url[2], num: url[4], kind: url[3] === 'pull' ? 'pr' : 'issue' }; }
  return null;
}

/**
 * Fetch a GitHub issue/PR directly with the `gh` CLI (host-side, ~1s) instead
 * of routing through the agentic `claude` loop — there's no GitHub claude.ai
 * connector, so the agent would otherwise wander for a minute+. Requires `gh`
 * on PATH + an authenticated login (the extension host inherits the user env).
 */
async function fetchGithubViaGh(ref: string): Promise<{ title: string; body: string; num: string }> {
  const p = parseGithubRef(ref);
  if (!p) {
    throw new Error('Could not parse a GitHub `owner/repo#123` ref or issue/PR URL from the input.');
  }
  const extraPath = ['/opt/homebrew/bin', '/usr/local/bin', `${process.env.HOME ?? ''}/.local/bin`]
    .filter(Boolean).join(':');
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${process.env.PATH ?? ''}:${extraPath}` };
  const { stdout } = await execFileAsync(
    'gh',
    [p.kind === 'pr' ? 'pr' : 'issue', 'view', p.num, '--repo', `${p.owner}/${p.repo}`, '--json', 'title,body'],
    { env, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
  );
  const j = JSON.parse(stdout) as { title?: string; body?: string };
  return { title: String(j.title ?? ''), body: String(j.body ?? ''), num: p.num };
}

/**
 * Surface the useful part of a `claude` failure. In `--print` mode Claude
 * often writes the real error to stdout, so check both streams before falling
 * back to the bare "claude exited N" message.
 */
function describeExecError(err: unknown): string {
  const e = err as { stderr?: unknown; stdout?: unknown; message?: unknown };
  const stderr = typeof e?.stderr === 'string' ? e.stderr.trim() : '';
  const stdout = typeof e?.stdout === 'string' ? e.stdout.trim() : '';
  const detail = stderr || stdout;
  if (detail) {
    return detail.split('\n').filter(Boolean).slice(-4).join(' ').slice(0, 500);
  }
  const msg = typeof e?.message === 'string' ? e.message : String(err);
  if (msg.includes('ENOENT')) { return '`claude` CLI not found on PATH.'; }
  return msg.slice(0, 400);
}

import * as jsYaml from 'js-yaml';
import { readYaml, writeYaml, type YamlDocument } from './yamlIO';
import {
  WORKSPACE_DIR,
  WORKSPACE_FILENAME,
  stepAgentId,
  stepDagId,
  normalizeStep,
  discoverAssets,
  RunStateStore,
  startRun,
  targetPath,
  validateWorkspace,
  assemblePipeline,
  recipePipelineId,
  PipelineAssembleError,
  heuristicClassify,
  buildClassificationPrompt,
  parseClassificationVerdict,
  slugEpicId,
  scaffoldEpic,
  DiscoverService,
  DiscoverContextPublisher,
  DiscoverRevisionConflictError,
  DISCOVER_COMMAND_NAME,
  DISCOVER_PIPELINE_COMMAND_NAME,
  DISCOVER_DEV_DOCS_COMMAND_NAME,
  DISCOVER_SCAN_COMMAND_NAME,
  DISCOVER_COMMIT_COMMAND_NAME,
  DISCOVER_STEPS,
  probeRepoLayout,
  deriveScanSeedSentence,
  formatDiscoverScanArgs,
  canStartScanPass,
  getScanPass,
  isScanPassId,
  type DiscoverScope,
  type ScanPassId,
  DISCOVER_HANDOFF_RECIPE_IDS,
  epicsRoot,
  EpicScaffoldError,
  installAnnotationTools,
  setEpicMemoryHook,
  isEpicMemoryHookEnabled,
  isCofofoPipelineId,
  isRogueCofofoPipelineId,
  generatedCofofoWorkspace,
  CofofoFoundationService,
} from '@aidlc/core';
import { DEFAULT_PIPELINE_ID, orderDefaultPipelines } from '../defaultWorkflow';
import {
  absorbDocChanges,
  buildDiscoverUi,
  isDiscoverDocPath,
  scaffoldEpicFromPhase,
  scaffoldEpicFromSuggestion,
  type DiscoverUi,
} from './discoverHost';
import { jiraCredentials, verifyAndStoreJiraCredentials } from './jiraCredentials';
import { jiraSprintService } from './jiraSprintService';
import { jiraSubtaskService } from './jiraSubtaskService';
import { issueBrowseUrl } from './jiraSubtaskLogic';
import { buildTicketBrief, type EpicLinkSource, type SprintState } from './jiraSprintLogic';
import { SKILL_TEMPLATES } from './skillTemplates';
import {
  loadBuiltinPreset,
  planRecipeMigration,
  getBuiltinPipelineSummary,
  getBuiltinArtifactTemplates,
  getBuiltinWorkflowByPipelineId,
  getAllBuiltinPipelineSummaries,
  getBuiltinRecipeSummaries,
  resolvePrimaryStack,
  builtinClaudeCommand,
  pipelineCommandId,
  workflowCommandPhases,
  writeBuiltinAutoReviewValidators,
  BUILTIN_WORKFLOWS,
} from './builtinPresets';
import { resolveTechStackForRoot } from './techStackResolver';
import { artifactLookupKeys } from './techStackDetector';
import {
  initializeProjectWorkspace,
  readProjectWorkspace,
  type ProjectWorkspaceSummary,
} from './projectWorkspace';
import { uninstallWorkflowGlobalsByIds } from './globalDefaultsInstaller';
import { PresetStore } from './presetStore';
import {
  reconcileValidatorConflictsCommand,
  runTaskWithProviderCommand,
} from './providerManagedRunCommands';

const workspaceOutput = vscode.window.createOutputChannel('AIDLC Workspace');
import { syncBuiltinPipelineCommands } from './presetWizards';
import { buildProviderConfigUi, type ProviderConfigUi } from './providerConfig';
import {
  runSlashCommandWithProvider,
} from './providerRunService';
import type {
  PipelineStepConfig,
  AssetScope,
  DiscoveredAsset,
  PipelineConfig,
  RecipeConfig,
  ScaffoldEpicResult,
  StepStatus,
  AutoReviewVerdict,
  StepHistoryEntry,
  DiscoverStepId,
  DocOp,
} from '@aidlc/core';
import { scopeSavedMessage } from './discoverScopeWizard';
import { executeDiscoverCommit, prepareDiscoverCommitDialog, resolveDiscoverCommitRoot, type DiscoverCommitCopy } from './discoverGitCommit';
import { promptStepConfig, type PipelineStepConfigDraft } from './wizards';
import {
  listEpics,
  enrichEpicsWithUsage,
  mirrorRunStateToEpic,
  setEpicRunMode,
  type EpicSummary as CoreEpicSummary,
} from './epicsList';
import { themeManager } from './themeManager';
import { workspaceUiPrefs, type DiscoverViewPrefs, type EpicsViewPrefs } from './workspaceUiPrefs';
import {
  rejectStepInlineCommand,
  rerunStepInlineCommand,
  requestStepUpdateInlineCommand,
  startPipelineRunInlineCommand,
} from './runCommands';
import { pickAndReadTextFile } from './pickAndReadTextFile';
import { pickBugImages, savePastedBugImage } from './pickBugImages';
import { scaffoldRequirementAnalysis } from './requirementWizard';
import { missingBundleHtml } from './webviewBundleGuard';
import { embedJsonForScript, extensionDisplayName } from './extensionBranding';
import { writeEpicsDirToYaml, DEFAULT_EPICS_DIR } from './epicsDirSync';
import {
  ensureMarkdownOutputLanguagePolicy,
  markdownOutputLanguageInstruction,
  resolveAidlcLanguage,
} from './outputLanguage';
import {
  ARCHITECTURE_STUDIO_RELATIVE_PATH,
  emptyArchitectureStudio,
  readArchitectureStudio,
  type ArchitectureStudioStateUi,
} from './architectureStudioState';

// ── Shared helper: open/reuse the agent terminal and send a slash command ───

function runSlashCommandInProvider(slash: string, root: string, extensionPath: string): void {
  runSlashCommandWithProvider(slash, root, extensionPath);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [];
}

/**
 * Wrap a person's direct field edit in the same run → diff → keep/revert flow
 * an agent run already gets, instead of writing straight to disk with no
 * review step. Folds into whatever is already pending review (an agent's run,
 * or an earlier edit in the same session) so the diff widens rather than
 * stacking a second unresolved run; starts a fresh `kind: 'edit'` run when
 * nothing is pending; and — if an agent is still actively mid-run — leaves
 * the edit untracked rather than risk touching that run's in-flight snapshot.
 */
function withDiscoverEditReview(
  service: DiscoverService,
  docPath: string,
  write: (runId: string | undefined) => void,
): void {
  const existing = service.activeRun();
  let runId: string | undefined;
  if (existing?.status === 'review') {
    runId = existing.id;
  } else if (!existing) {
    const stepId = DISCOVER_STEPS.find((s) => s.files.some((f) => f.path === docPath))?.id;
    if (stepId) { runId = service.startRun(stepId, { kind: 'edit' }).run.id; }
  }
  write(runId);
  if (runId) { service.finishRun(runId); }
}

function discoverCommitCopy(language: 'en' | 'vi'): DiscoverCommitCopy {
  if (language === 'vi') {
    return {
      notRepo: (dir) => `Không phải git repo: ${dir}`,
      nothing: (dir) => `Không có thay đổi để commit trong ${dir}.`,
      success: (dir, hash) => `AIDLC Discover: đã commit ${hash} trong ${path.basename(dir)}.`,
      failed: (detail) => `Commit thất bại: ${detail}`,
    };
  }
  return {
    notRepo: (dir) => `Not a git repo: ${dir}`,
    nothing: (dir) => `Nothing to commit in ${dir}.`,
    success: (dir, hash) => `AIDLC Discover: committed ${hash} in ${path.basename(dir)}.`,
    failed: (detail) => `Commit failed: ${detail}`,
  };
}

/**
 * Push repo-layout dialog state to the webview. QuickPick from a focused
 * webview panel is unreliable, so configuration happens in-panel.
 */
function discoverScopeModalPayload(root: string, intent: 'scan' | 'edit') {
  const service = new DiscoverService(root);
  const existing = service.declaredScope();
  const probe = probeRepoLayout(root);
  return {
    type: 'openDiscoverScopeModal' as const,
    intent,
    mode: (intent === 'scan' && existing ? 'confirm' : 'wizard') as 'confirm' | 'wizard',
    probe: {
      suggested: probe.suggested,
      self: probe.self,
      children: probe.children,
      parentPath: probe.parentPath,
    },
    existing,
  };
}

async function continueDiscoverScan(
  root: string,
  scope: DiscoverScope,
  extensionUri: string,
  refresh: () => void,
  pass: ScanPassId = 1,
  options: { resetCampaign?: boolean } = {},
): Promise<void> {
  const service = new DiscoverService(root);
  if (!service.exists()) {
    try {
      service.init({
        seedSentence: deriveScanSeedSentence(root, scope),
        outputLanguage: resolveDisplayLanguage(),
        scope,
        actor: { kind: 'user', id: 'vscode-user' },
      });
    } catch (error) {
      void vscode.window.showWarningMessage(`AIDLC Discover: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
  }
  const index = service.require();
  const language = resolveDisplayLanguage();
  if (service.activeRun(index)) {
    void vscode.window.showWarningMessage(
      language === 'vi'
        ? 'AIDLC Discover: đang có lượt chưa đóng. Hãy Giữ hoặc Hoàn tác trước.'
        : 'AIDLC Discover: a run is still open. Keep or undo it first.',
    );
    return;
  }
  if (!options.resetCampaign && !canStartScanPass({
    pass,
    lastKeptPass: index.scanCampaign?.lastKeptPass,
    hasActiveRun: false,
  })) {
    void vscode.window.showWarningMessage(
      language === 'vi'
        ? `AIDLC Discover: chưa đến lượt quét ${pass}/3.`
        : `AIDLC Discover: scan pass ${pass}/3 is locked.`,
    );
    return;
  }
  try {
    service.startRun(index.currentStep, { kind: 'scan', scanPass: pass, resetCampaign: options.resetCampaign });
  } catch (error) {
    void vscode.window.showWarningMessage(`AIDLC Discover: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  const spec = getScanPass(pass);
  const label = language === 'vi' ? spec.labelVi : spec.label;
  void vscode.window.showInformationMessage(
    language === 'vi'
      ? `AIDLC Discover: bắt đầu quét bước ${pass}/3 — ${label}`
      : `AIDLC Discover: starting scan pass ${pass}/3 — ${label}`,
  );
  const args = formatDiscoverScanArgs({ pass, scope });
  runSlashCommandInProvider(`/${DISCOVER_SCAN_COMMAND_NAME} ${args}`, root, extensionUri);
  refresh();
}

// ── Webview-side type shapes (must mirror src/webview/lib/types.ts) ───────

type WorkspaceView =
  | 'project' | 'discover' | 'builder' | 'architecture' | 'epics' | 'sprint' | 'analyze' | 'tests';

interface AgentSummary {
  id: string;
  scope: AssetScope;
  filePath: string;
  description?: string;
  skill?: string;
  skills?: string[];
  model?: string;
  integrations?: string[];
  /** Human label of the built-in preset that contributed this entry (e.g. "SDLC Pipeline"). Absent for user-created entries. */
  builtinFrom?: string;
}

interface SkillSummary {
  id: string;
  scope: AssetScope;
  filePath: string;
  description?: string;
  builtinFrom?: string;
}

interface PipelineStepSummary {
  agent: string;
  name?: string;
  /** Per-step execution model; falls back to the agent model when absent. */
  model?: string;
  skills?: string[];
  enabled: boolean;
  produces: string[];
  produces_contains?: string[];
  requires: string[];
  depends_on?: string[];
  human_review: boolean;
  auto_review: boolean;
  auto_review_runner?: string;
  auto_review_timeout_ms?: number;
}

interface PipelineSummary {
  id: string;
  steps: PipelineStepSummary[];
  on_failure: 'stop' | 'continue';
  builtin?: boolean;
  name?: string;
  /** Legacy source template marker. Current CoFoFo pipelines are startable. */
  templateOnly?: boolean;
}

/** A task-type recipe surfaced to the Start-Epic modal. */
interface RecipeSummary {
  id: string;
  description?: string;
  /** Source pipeline id the recipe draws from (resolved; first pipeline if unset). */
  from: string;
  /** Selected step ids, in order. */
  steps: string[];
  /** Resolved agent ids (ordered) for capability prompts in the modal. */
  agents: string[];
}

interface AgentMeta {
  name: string;
  description: string;
  inputs: string;
  outputs: string;
  artifact: string;
  capabilities?: string[];
}

/**
 * Pending workspace.yaml addition computed from a file-based agent
 * (project / global scope) before the pipeline that references it is
 * written. `ensureWorkspaceAgentsForSteps` plans these, `applySyncedAgents`
 * commits them inside the same `mutateYaml` block as the pipeline push.
 */
interface SyncedAgentPlan {
  agent: {
    id: string;
    name: string;
    skills: string[];
    model?: string;
    description?: string;
    capabilities?: string[];
  };
  /** Skill entries to register for the agent. Built-in agents bring their
   *  real preset skills (e.g. aidlc-prd, aidlc-implement); custom file-based
   *  agents get a single synthesized `<id>-skill` pointing at their persona. */
  skills: Array<{ id: string; path: string }>;
}

interface EpicStepDetailFull {
  agent: string;
  /** Optional phase id (= slash command name) for built-in pipelines. */
  stepName?: string;
  slashCommand?: string;
  /** Step's artifact filename (basename of `produces[0]`). Empty when the
   *  step's output is a non-file artifact (branch / tag). */
  artifact?: string;
  /** Every artifact declared/recorded for this step, in pipeline order. */
  artifacts?: string[];
  /** Host-computed: true when `artifact` exists on disk right now. */
  artifactExists?: boolean;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  /** Added by migration onto a newer definition of the same pipeline. */
  isNew?: boolean;
  runStatus: StepStatus | null;
  isCurrentRunStep: boolean;
  rejectReason?: string;
  autoReviewVerdict?: AutoReviewVerdict;
  stepHasAutoReview: boolean;
  stepHasHumanReview: boolean;
  reviewMode?: 'canvas';
  reviewArtifacts?: string[];
  stepSkippable: boolean;
  dependsOn?: string[];
  startedAt?: string;
  finishedAt?: string;
  history?: StepHistoryEntry[];
  rejectCount?: number;
  feedback?: string;
  /** Token usage attributed to this step (cost + token totals). */
  tokenUsage?: EpicStepTokenUsage;
  /** Built-in phase help for the Epic card Help button + I/O fields. */
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

interface EpicStepTokenUsage {
  cost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  calls: number;
  /** Per history-entry usage, parallel to StepHistory entries. */
  history?: Array<{ totalTokens: number; cost: number; calls: number }>;
}

interface EpicTokenUsage {
  total: { cost: number; totalTokens: number; calls: number };
  hasOverlap: boolean;
}

/** Epic-local delivery annotations remain separate from Architecture Studio's
 * curated project model. They are consumed by the Epics visual panels. */
interface EpicFeatureImpactUi {
  id: string;
  name: string;
  change: 'add' | 'modify' | 'delete' | 'unchanged';
  summary?: string;
}

interface EpicVisualizationsUi {
  impactMermaid?: string;
  surfacesMermaid?: string;
  flowMermaid?: string;
  impactFeatures?: EpicFeatureImpactUi[];
}

interface EpicSummaryUi {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  progress: number;
  statePath: string;
  stepDetails: EpicStepDetailFull[];
  currentStep: number;
  pipeline: string | null;
  agent: string | null;
  runId: string | null;
  runMode: 'guided' | 'autonomous';
  inputs: Record<string, string>;
  epicDir: string;
  existingArtifacts: string[];
  /** Basename → absolute path (includes produces: outside epic/artifacts/). */
  artifactPaths: Record<string, string>;
  createdAt: string;
  /** True for folders with no state.json/pipeline, synthesized from artifacts. */
  artifactsOnly?: boolean;
  /** Aggregate token usage for the epic. */
  tokenUsage?: EpicTokenUsage;
  alignment?: { goals: string[]; status?: 'aligned' | 'variance' | 'stale' };
  ship?: { prUrl?: string; status?: 'open' | 'approved' | 'merged'; head?: string; base?: string };
  reviewDiff?: string;
  visualizations?: EpicVisualizationsUi;
  /** True when this epic's artifacts sit at the default `docs/epics/` path
   * instead of the workspace's active epics directory — a config-drift
   * signal, not evidence the mission pack is actually incomplete. */
  epicsDirMismatch?: boolean;
}

interface RequirementRunSummary {
  id: string;
  createdAt: string;
  platform: string;
  parentTask: string;
  source: string;
  status: 'pending' | 'complete';
  taskCount: number | null;
  hasRequirements?: boolean;
}

interface SkillTemplateRef {
  id: string;
  description: string;
  /** Category used by the AddSkill modal to split the picker into tabs. */
  category: string;
}

interface WorkspaceState {
  hasFolder: boolean;
  workspaceName: string;
  configExists: boolean;
  projectWorkspace?: ProjectWorkspaceSummary;
  /** The Discover blueprint, when this workspace has one. */
  discover?: DiscoverUi;
  agents: AgentSummary[];
  skills: SkillSummary[];
  pipelines: PipelineSummary[];
  /** New Task choices, including CoFoFo defaults not materialized yet. */
  startPipelines?: PipelineSummary[];
  recipes: RecipeSummary[];
  epics: EpicSummaryUi[];
  agentMeta: Record<string, AgentMeta>;
  slashCommandsByAgent: Record<string, string>;
  agentsCount: number;
  skillsCount: number;
  pipelinesCount: number;
  epicsCount: number;
  /** All existing run ids (any status) — for inline Start-Run modal uniqueness check. */
  runIds: string[];
  /** Built-in skill templates surfaced for the inline AddSkill modal. */
  skillTemplates: SkillTemplateRef[];
  /** Default CoFoFo Feature pipeline — prefilled by the Add-pipeline modal. */
  defaultPipeline?: PipelineSummary;
  /** Suggested next sequential id for the inline Start-Epic modal. */
  nextEpicId: string;
  /** All existing epic ids (folders under epicRoot) — for uniqueness check. */
  existingEpicIds: string[];
  requirementRuns?: RequirementRunSummary[];
  initialView?: WorkspaceView;
  testAgentConfigExists?: boolean;
  testAgentTargets?: { name: string; filePath: string; adapter?: string; url?: string }[];
  /** Whether the epic-memory auto-load hook is enabled in ~/.claude/settings.json. */
  epicMemoryHookEnabled: boolean;
  /** Current epics directory (relative path from project root). */
  epicsDir: string;
  /** Persisted Epics-list UI prefs (follow/search/filter) from workspaceState. */
  epicsViewUi?: EpicsViewPrefs;
  /** Persisted Discover-tab UI prefs (step-rail width) from workspaceState. */
  discoverViewUi?: DiscoverViewPrefs;
  architecture: ArchitectureStudioStateUi;
  displayLanguage: 'en' | 'vi';
  /** Active agent CLI provider — mirrored from sidebar config. */
  providerConfig?: ProviderConfigUi;
  /**
   * Cached Jira sprint snapshot, so the Sprint tab paints on first open. Live
   * data arrives separately as `sprintState` messages — a network fetch cannot
   * ride along in this synchronous build.
   */
  sprint?: SprintState;
}

const SKILL_TEMPLATE_REFS: SkillTemplateRef[] = SKILL_TEMPLATES.map((t) => ({
  id: t.id,
  description: t.description,
  category: t.category,
}));

// ── State builders ────────────────────────────────────────────────────────

/**
 * Resolve a raw recipe entry into a {@link RecipeSummary}, mapping its step
 * ids to the source pipeline's agent ids (in recipe order). Returns null when
 * the recipe is malformed or its source pipeline is missing — those surface
 * as load-time warnings elsewhere, not in the picker.
 */
function buildRecipeSummary(
  r: Partial<RecipeConfig>,
  pipelines: PipelineConfig[],
): RecipeSummary | null {
  if (!r || typeof r.id !== 'string' || !Array.isArray(r.steps)) { return null; }
  const source = r.from
    ? pipelines.find((p) => String(p.id) === r.from)
    : pipelines[0];
  if (!source || !Array.isArray(source.steps)) { return null; }
  const agentByStep = new Map<string, string>();
  for (const raw of source.steps as PipelineStepConfig[]) {
    agentByStep.set(stepDagId(raw), stepAgentId(raw));
  }
  const agents = r.steps
    .map((id) => agentByStep.get(id))
    .filter((a): a is string => typeof a === 'string');
  return {
    id: r.id,
    description: typeof r.description === 'string' ? r.description : undefined,
    from: String(source.id),
    steps: r.steps,
    agents,
  };
}

function pipelineDisplayName(id: string): string | undefined {
  if (id === 'cofofo-foundation') { return 'Legacy CoFoFo Foundation (compat)'; }
  if (id === 'cofofo-feature') { return 'CoFoFo Feature'; }
  if (id === 'cofofo-bugfix') { return 'CoFoFo Bugfix'; }
  return undefined;
}

function toPipelineSummary(pipeline: PipelineConfig, builtin = false): PipelineSummary {
  const id = String(pipeline.id);
  return {
    id,
    on_failure: pipeline.on_failure === 'continue' ? 'continue' : 'stop',
    builtin: builtin || isCofofoPipelineId(id)
      || BUILTIN_WORKFLOWS.some((workflow) => workflow.pipelineId === id),
    name: pipelineDisplayName(id),
    steps: Array.isArray(pipeline.steps)
      ? (pipeline.steps as PipelineStepConfig[]).map((raw) => {
          const norm = normalizeStep(raw);
          return {
            agent: norm.agent,
            name: norm.name,
            model: norm.model,
            skills: norm.skills,
            enabled: norm.enabled,
            produces: norm.produces,
            produces_contains: norm.produces_contains,
            requires: norm.requires,
            depends_on: norm.depends_on,
            human_review: norm.human_review,
            auto_review: norm.auto_review,
            auto_review_runner: norm.auto_review_runner,
            auto_review_timeout_ms: norm.auto_review_timeout_ms,
          };
        })
      : [],
  };
}

function defaultCofofoWorkspace(workspaceName: string) {
  return generatedCofofoWorkspace({ name: workspaceName || 'CoFoFo Workspace' });
}

function defaultCofofoPipelines(workspaceName: string): PipelineSummary[] {
  return orderDefaultPipelines(
    defaultCofofoWorkspace(workspaceName).pipelines
      .filter((pipeline) => isCofofoPipelineId(pipeline.id))
      .map((pipeline) => toPipelineSummary(pipeline, true)),
  );
}

function mergeStartPipelines(
  cofofoDefaults: PipelineSummary[],
  configured: PipelineSummary[],
): PipelineSummary[] {
  const configuredById = new Map(configured.map((pipeline) => [pipeline.id, pipeline]));
  const merged = [
    ...cofofoDefaults.map((pipeline) => configuredById.get(pipeline.id) ?? pipeline),
    ...configured.filter((pipeline) => !isCofofoPipelineId(pipeline.id)),
  ];
  return orderDefaultPipelines(merged);
}

function buildState(initialView: WorkspaceView): WorkspaceState {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const providerConfig = buildProviderConfigUi(folder?.uri.fsPath);
  if (!folder) {
    return {
      hasFolder: false,
      workspaceName: '',
      configExists: false,
      agents: [], skills: [], pipelines: [], recipes: [], epics: [],
      agentMeta: {}, slashCommandsByAgent: {},
      agentsCount: 0, skillsCount: 0, pipelinesCount: 0, epicsCount: 0,
      runIds: [],
      skillTemplates: SKILL_TEMPLATE_REFS,
      nextEpicId: 'EPIC-001',
      existingEpicIds: [],
      requirementRuns: [],
      initialView: 'project',
      testAgentConfigExists: false,
      testAgentTargets: [],
      epicMemoryHookEnabled: isEpicMemoryHookEnabled(os.homedir()),
      epicsDir: DEFAULT_EPICS_DIR,
      epicsViewUi: workspaceUiPrefs.get().epicsView,
      discoverViewUi: workspaceUiPrefs.get().discoverView,
      architecture: emptyArchitectureStudio('Open a project to view its architecture.'),
      displayLanguage: resolveDisplayLanguage(),
      providerConfig,
    };
  }

  const root = folder.uri.fsPath;
  const doc = readYaml(root);
  const projectWorkspace = readProjectWorkspace(root);
  // Built the same way in every branch below: a blueprint exists as soon as
  // the user types one sentence, with or without a workspace.yaml.
  const discover = buildDiscoverUi(root);
  const discovered = discoverAssets(root);
  const architecture = readArchitectureStudio(root);
  const cofofoWorkspace = defaultCofofoWorkspace(folder.name);
  const cofofoPipelines = defaultCofofoPipelines(folder.name);

  // New Task can use CoFoFo before it has been written to workspace.yaml, so
  // seed its display metadata virtually. Configured entries then override it.
  const agentMeta: Record<string, AgentMeta> = {};
  const slashCommandsByAgent: Record<string, string> = {};
  for (const a of cofofoWorkspace.agents) {
    const id = String(a.id);
    const capabilities = Array.isArray(a.capabilities) ? a.capabilities.map(String).filter(Boolean) : [];
    agentMeta[id] = {
      name: typeof a.name === 'string' ? a.name : id,
      description: typeof a.description === 'string' ? a.description : '',
      inputs: typeof a.inputs === 'string' ? a.inputs : '',
      outputs: typeof a.outputs === 'string' ? a.outputs : '',
      artifact: typeof a.artifact === 'string' ? a.artifact : '',
      capabilities: capabilities.length > 0 ? capabilities : undefined,
    };
  }
  if (doc) {
    for (const a of doc.agents) {
      const id = String(a.id);
      const capsRaw = Array.isArray(a.capabilities) ? (a.capabilities as unknown[]) : [];
      const capabilities = capsRaw.map(String).filter((c) => c);
      agentMeta[id] = {
        name: typeof a.name === 'string' ? a.name : id,
        description: typeof a.description === 'string' ? a.description : '',
        inputs: typeof a.inputs === 'string' ? a.inputs : '',
        outputs: typeof a.outputs === 'string' ? a.outputs : '',
        artifact: typeof a.artifact === 'string' ? a.artifact : '',
        capabilities: capabilities.length > 0 ? capabilities : undefined,
      };
    }
    for (const c of doc.slash_commands) {
      const agent = (c as { agent?: unknown }).agent;
      if (typeof c.name === 'string' && typeof agent === 'string' && !slashCommandsByAgent[agent]) {
        slashCommandsByAgent[agent] = c.name;
      }
    }
  }
  const commandSources = [
    ...(doc?.slash_commands ?? []),
    ...cofofoWorkspace.slash_commands,
  ];
  for (const c of commandSources) {
    const agent = (c as { agent?: unknown }).agent;
    if (typeof c.name === 'string' && typeof agent === 'string' && !slashCommandsByAgent[agent]) {
      slashCommandsByAgent[agent] = c.name;
    }
  }

  const epics = listEpics(root, doc).map((e) => toEpicSummaryUi(e, root));

  // No auto-injection: the Domain dropdown only shows pipelines that are
  // actually declared in workspace.yaml. Users add built-ins via the
  // sidebar's Workflows section ("Load Template"). Without this, deleting
  // a built-in pipeline would silently re-appear on the next refresh
  // because BUILTIN_WORKFLOWS would re-inject it.

  if (!doc) {
    const agents = mergeAgents(null, root, discovered.agents);
    const skills = mergeSkills(null, root, discovered.skills);
    const epicIds0 = listEpicIdsFromDir(root, 'docs/epics');
    // No workspace yet: CoFoFo leads New Task, followed by optional static
    // presets. The selected workflow is materialized only when starting.
    const builtinPipelines: PipelineSummary[] = getAllBuiltinPipelineSummaries().map((p) => ({
      id: p.id,
      name: p.name,
      builtin: true,
      on_failure: p.on_failure,
      steps: p.steps.map((s) => ({
        agent: s.agent, name: s.name, skills: s.skills, enabled: s.enabled,
        produces: s.produces, requires: s.requires, depends_on: s.depends_on,
        human_review: s.human_review, auto_review: s.auto_review,
      })),
    }));
    const startPipelines = mergeStartPipelines(cofofoPipelines, builtinPipelines);
    return {
      hasFolder: true,
      workspaceName: folder.name,
      configExists: false,
      projectWorkspace,
      discover,
      agents, skills,
      pipelines: startPipelines,
      startPipelines,
      recipes: getBuiltinRecipeSummaries(),
      epics,
      agentMeta, slashCommandsByAgent,
      agentsCount: agents.length,
      skillsCount: skills.length,
      pipelinesCount: startPipelines.length,
      epicsCount: epics.length,
      runIds: listRunIds(root),
      skillTemplates: SKILL_TEMPLATE_REFS,
      defaultPipeline: cofofoPipelines.find((pipeline) => pipeline.id === DEFAULT_PIPELINE_ID),
      nextEpicId: suggestNextEpicId(epicIds0),
      existingEpicIds: epicIds0,
      requirementRuns: scanRequirementRuns(root),
      initialView,
      ...(() => { const ta = readTestAgentTargets(root); return { testAgentConfigExists: ta.exists, testAgentTargets: ta.targets }; })(),
      epicMemoryHookEnabled: isEpicMemoryHookEnabled(os.homedir()),
      epicsDir: DEFAULT_EPICS_DIR,
      epicsViewUi: workspaceUiPrefs.get().epicsView,
      discoverViewUi: workspaceUiPrefs.get().discoverView,
      architecture,
      displayLanguage: resolveDisplayLanguage(),
      providerConfig,
    };
  }

  const agents = mergeAgents(doc, root, discovered.agents);
  const skills = mergeSkills(doc, root, discovered.skills);
  const pipelines: PipelineSummary[] = doc.pipelines
    // A recipe materializes an immutable per-task pipeline for RunState. It
    // is not another workflow in Builder; show its source workflow instead.
    .filter((p) => !p.materialized_from_recipe)
    // Only three CoFoFo pipelines are legal; prune legacy delivery/recipe ids.
    .filter((p) => !isRogueCofofoPipelineId(String(p.id)))
    .map((pipeline) => toPipelineSummary(pipeline as PipelineConfig));
  const startPipelines = mergeStartPipelines(cofofoPipelines, pipelines);

  // Recipes → summaries, resolving each to its source pipeline's agents so
  // the modal can show step count + capability prompts without re-deriving.
  const recipes: RecipeSummary[] = (Array.isArray(doc.recipes) ? doc.recipes : [])
    .map((r) => buildRecipeSummary(r as Partial<RecipeConfig>, doc.pipelines as PipelineConfig[]))
    .filter((r): r is RecipeSummary => r !== null);
  rlog(`[state] ${folder.name}: recipes=${recipes.length} (raw=${Array.isArray(doc.recipes) ? doc.recipes.length : 0}), pipelines=${pipelines.length}`);

  const epicRoot = readEpicRoot(doc);
  const epicIds = listEpicIdsFromDir(root, epicRoot);

  return {
    hasFolder: true,
    workspaceName: folder.name,
    configExists: true,
    projectWorkspace,
    discover,
    agents, skills, pipelines, startPipelines, recipes, epics,
    agentMeta, slashCommandsByAgent,
    agentsCount: agents.length,
    skillsCount: skills.length,
    pipelinesCount: pipelines.length,
    epicsCount: epics.length,
    runIds: listRunIds(root),
    skillTemplates: SKILL_TEMPLATE_REFS,
    defaultPipeline: cofofoPipelines.find((pipeline) => pipeline.id === DEFAULT_PIPELINE_ID),
    nextEpicId: suggestNextEpicId(epicIds),
    existingEpicIds: epicIds,
    requirementRuns: scanRequirementRuns(root),
    initialView,
    ...(() => { const ta = readTestAgentTargets(root); return { testAgentConfigExists: ta.exists, testAgentTargets: ta.targets }; })(),
    epicMemoryHookEnabled: isEpicMemoryHookEnabled(os.homedir()),
    epicsDir: epicRoot,
    epicsViewUi: workspaceUiPrefs.get().epicsView,
    discoverViewUi: workspaceUiPrefs.get().discoverView,
    architecture,
    displayLanguage: resolveDisplayLanguage(),
    providerConfig,
  };
}

function resolveDisplayLanguage(): 'en' | 'vi' {
  const configured = vscode.workspace.getConfiguration('aidlc').get<string>('displayLanguage', 'auto');
  return resolveAidlcLanguage(configured, vscode.env.language);
}

function readJsonObject(file: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

function jsonObjects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : [];
}

/** Read the manifest as the single durable identity of published Project Context. */

function scanRequirementRuns(root: string): RequirementRunSummary[] {
  const dir = path.join(root, 'docs', 'task-breakdowns');
  if (!fs.existsSync(dir)) { return []; }
  const results: RequirementRunSummary[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || !/^REQ-\d+$/i.test(e.name)) { continue; }
      const runDir = path.join(dir, e.name);
      const inputsPath = path.join(runDir, 'inputs.json');
      if (!fs.existsSync(inputsPath)) { continue; }
      let inputs: Record<string, string> = {};
      try { inputs = JSON.parse(fs.readFileSync(inputsPath, 'utf8')) as Record<string, string>; } catch { continue; }
      const tasksJsonPath = path.join(runDir, 'tasks.json');
      const tasksMdPath = path.join(runDir, 'tasks.md');
      const reqMdPath = path.join(runDir, 'requirements.md');
      const hasTasks = fs.existsSync(tasksJsonPath) || fs.existsSync(tasksMdPath);
      const hasRequirements = fs.existsSync(reqMdPath);
      let taskCount: number | null = null;
      if (fs.existsSync(tasksJsonPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(tasksJsonPath, 'utf8')) as unknown[];
          taskCount = Array.isArray(parsed) ? parsed.length : null;
        } catch { /* ignore */ }
      }
      const stat = fs.statSync(inputsPath);
      const createdAt = stat.mtime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      results.push({
        id: e.name,
        createdAt,
        platform: inputs.task_platform ?? 'local',
        parentTask: inputs.parent_task ?? '',
        source: inputs.requirements_source ?? '',
        status: hasTasks ? 'complete' : 'pending',
        taskCount,
        hasRequirements,
      });
    }
  } catch { /* ignore */ }
  return results.reverse();
}

function readTestAgentTargets(root: string): { exists: boolean; targets: { name: string; filePath: string; adapter?: string; url?: string }[] } {
  const configPath = path.join(root, 'testagent.config.yaml');
  if (!fs.existsSync(configPath)) { return { exists: false, targets: [] }; }
  try {
    const doc = jsYaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    const rawIncludes = Array.isArray(doc?.targets) ? (doc.targets as unknown[]) : [];
    const targets: { name: string; filePath: string; adapter?: string; url?: string }[] = [];
    for (const entry of rawIncludes) {
      const include = (entry as { include?: unknown }).include;
      if (typeof include !== 'string') { continue; }
      const dir = path.join(root, path.dirname(include));
      const ext = path.basename(include).replace(/^\*/, '');
      if (!fs.existsSync(dir)) { continue; }
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith(ext)) { continue; }
        const filePath = path.join(dir, file);
        try {
          const td = jsYaml.load(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
          targets.push({
            name: typeof td?.name === 'string' ? td.name : path.basename(file, ext),
            filePath,
            adapter: typeof td?.adapter === 'string' ? td.adapter : undefined,
            url: typeof td?.url === 'string' ? td.url : undefined,
          });
        } catch {
          targets.push({ name: path.basename(file, ext), filePath });
        }
      }
    }
    return { exists: true, targets };
  } catch {
    return { exists: true, targets: [] };
  }
}

function listRunIds(root: string): string[] {
  try {
    return RunStateStore.list(root).map((r) => r.runId);
  } catch {
    return [];
  }
}

function readEpicRoot(doc: { state?: unknown }): string {
  const state = doc.state as Record<string, unknown> | undefined;
  if (state && typeof state.root === 'string' && state.root.trim()) {
    return state.root;
  }
  return 'docs/epics';
}

function listEpicIdsFromDir(workspaceRoot: string, epicRoot: string): string[] {
  const dir = path.resolve(workspaceRoot, epicRoot);
  if (!fs.existsSync(dir)) { return []; }
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function suggestNextEpicId(existing: string[]): string {
  const numbered = existing
    .map((n) => n.match(/^EPIC-(\d+)$/i))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => parseInt(m[1], 10));
  const next = numbered.length > 0 ? Math.max(...numbered) + 1 : 1;
  return `EPIC-${String(next).padStart(3, '0')}`;
}

/**
 * Mutates `state.epics` to fill in `tokenUsage` (epic + per-step) using
 * `enrichEpicsWithUsage` against the current workspace's run states. Cheap
 * on cache hit; safe to fire on every refresh.
 */
async function mergeEpicTokenUsageInto(state: WorkspaceState): Promise<void> {
  if (!state.epics || state.epics.length === 0) return;
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;
  const root = folder.uri.fsPath;
  let summaries: CoreEpicSummary[];
  try {
    summaries = listEpics(root, readYaml(root));
  } catch { return; }
  try {
    await enrichEpicsWithUsage(root, summaries);
  } catch { return; }
  const byId = new Map(summaries.map((s) => [s.id, s]));
  for (const epic of state.epics) {
    const e = byId.get(epic.id);
    if (!e) continue;
    if (e.tokenUsage) {
      epic.tokenUsage = { total: e.tokenUsage.total, hasOverlap: e.tokenUsage.hasOverlap };
    }
    for (let i = 0; i < epic.stepDetails.length && i < e.stepDetails.length; i++) {
      const su = e.stepDetails[i].tokenUsage;
      if (!su) continue;
      epic.stepDetails[i].tokenUsage = {
        cost: su.cost,
        totalTokens: su.totalTokens,
        inputTokens: su.inputTokens,
        outputTokens: su.outputTokens,
        cacheReadTokens: su.cacheReadTokens,
        cacheWriteTokens: su.cacheWriteTokens,
        calls: su.calls,
        history: su.history?.map((h) => ({
          totalTokens: h.totalTokens, cost: h.cost, calls: h.calls,
        })),
      };
    }
  }
}

function toEpicSummaryUi(e: CoreEpicSummary, workspaceRoot?: string): EpicSummaryUi {
  const total = e.stepDetails.length || 1;
  const done = e.stepDetails.filter((s) => s.status === 'done').length;
  const progress = Math.round((done / total) * 100);
  const epicDir = e.epicDir;
  const artifactDirs = artifactSearchDirs(workspaceRoot, epicDir, e.id);
  const visualizations = readEpicVisualizations(artifactDirs);
  // Built-in pipeline steps write under the workspace's *active* epics
  // directory now (see resolveArtifactPath/rewriteEpicsRootPrefix) — but an
  // epic whose artifacts were produced before this fix, or whose workspace
  // still runs a pipeline that bakes `docs/epics` into its own skill prose,
  // can have its actual content sitting at the conventional default while
  // `epicDir` (this project's active directory) is empty. Detect that split
  // so the UI can say "wrong root", not "no artifacts".
  const epicsDirMismatch = !visualizations && workspaceRoot
    ? hasArtifactsAtDefaultEpicsDir(workspaceRoot, epicDir, e.id)
    : false;
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    status: e.status,
    progress,
    statePath: e.statePath,
    stepDetails: e.stepDetails.map((s) => ({
      agent: s.agent,
      stepName: s.name,
      slashCommand: s.slashCommand,
      artifact: s.artifact,
      artifacts: s.artifacts,
      artifactExists: s.artifactExists,
      status: s.status,
      isNew: s.isNew,
      runStatus: s.runStatus,
      isCurrentRunStep: s.isCurrentRunStep,
      rejectReason: s.rejectReason,
      autoReviewVerdict: s.autoReviewVerdict,
      stepHasAutoReview: s.stepHasAutoReview,
      stepHasHumanReview: s.stepHasHumanReview,
      reviewMode: s.reviewMode,
      reviewArtifacts: s.reviewArtifacts,
      stepSkippable: s.stepSkippable,
      dependsOn: s.dependsOn,
      startedAt: s.startedAt ?? undefined,
      finishedAt: s.finishedAt ?? undefined,
      history: s.history,
      rejectCount: s.rejectCount,
      feedback: s.feedback,
      tokenUsage: s.tokenUsage
        ? {
            cost: s.tokenUsage.cost,
            totalTokens: s.tokenUsage.totalTokens,
            inputTokens: s.tokenUsage.inputTokens,
            outputTokens: s.tokenUsage.outputTokens,
            cacheReadTokens: s.tokenUsage.cacheReadTokens,
            cacheWriteTokens: s.tokenUsage.cacheWriteTokens,
            calls: s.tokenUsage.calls,
            history: s.tokenUsage.history?.map((h) => ({
              totalTokens: h.totalTokens, cost: h.cost, calls: h.calls,
            })),
          }
        : undefined,
      stepHelp: s.stepHelp,
    })),
    currentStep: e.currentStep,
    pipeline: e.pipeline,
    agent: e.agent,
    runId: e.runId,
    runMode: e.runMode,
    inputs: e.inputs,
    epicDir,
    existingArtifacts: e.existingArtifacts ?? [],
    artifactPaths: e.artifactPaths ?? {},
    createdAt: e.createdAt,
    artifactsOnly: e.artifactsOnly,
    tokenUsage: e.tokenUsage
      ? { total: e.tokenUsage.total, hasOverlap: e.tokenUsage.hasOverlap }
      : undefined,
    visualizations,
    epicsDirMismatch,
  };
}

function defaultArtifactsDir(workspaceRoot: string, epicId: string): string {
  return path.resolve(workspaceRoot, DEFAULT_EPICS_DIR, epicId, 'artifacts');
}

/**
 * True when `<workspaceRoot>/docs/epics/<epicId>/artifacts/` has files even
 * though this epic's *active* `epicDir` (already resolved against
 * `state.root`) does not — i.e. the epics-directory setting and where this
 * epic's content actually landed have drifted apart. Only meaningful when
 * `epicDir` differs from the conventional default in the first place.
 */
function hasArtifactsAtDefaultEpicsDir(workspaceRoot: string, epicDir: string, epicId: string): boolean {
  const defaultArtifacts = defaultArtifactsDir(workspaceRoot, epicId);
  if (path.resolve(epicDir, 'artifacts') === defaultArtifacts) { return false; }
  try {
    return fs.existsSync(defaultArtifacts) && fs.readdirSync(defaultArtifacts).some((f) => !f.startsWith('.'));
  } catch {
    return false;
  }
}

/**
 * Ordered list of directories to look for an epic's briefing/visualization
 * artifacts in: the workspace's *active* `epicDir` first (respects
 * `state.root`), then the conventional `docs/epics/<id>/artifacts` default —
 * because a pipeline driven by CLI skill prose (not this extension's own
 * orchestration) bakes the default path in and ignores `state.root`, so its
 * output can land there even when the active epics directory points
 * elsewhere. See `hasArtifactsAtDefaultEpicsDir`, which flags this same split
 * for the UI's "wrong root" message.
 */
function artifactSearchDirs(workspaceRoot: string | undefined, epicDir: string, epicId: string): string[] {
  const primary = path.join(epicDir, 'artifacts');
  if (!workspaceRoot) return [primary];
  const fallback = defaultArtifactsDir(workspaceRoot, epicId);
  return path.resolve(primary) === fallback ? [primary] : [primary, fallback];
}

function readOptionalText(file: string): string | undefined {
  try {
    if (!fs.existsSync(file)) return undefined;
    const text = fs.readFileSync(file, 'utf8').trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

function readEpicVisualizations(artifactDirs: string[]): EpicVisualizationsUi | undefined {
  const changes = new Set(['add', 'modify', 'delete', 'unchanged']);
  for (const artifacts of artifactDirs) {
    const impact = readJsonObject(path.join(artifacts, 'FEATURE-IMPACT.json'));
    const impactFeatures = Array.isArray(impact?.features)
      ? impact.features.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const feature = item as Record<string, unknown>;
        if (typeof feature.id !== 'string' || typeof feature.name !== 'string') return [];
        if (typeof feature.change !== 'string' || !changes.has(feature.change)) return [];
        return [{
          id: feature.id,
          name: feature.name,
          change: feature.change as EpicFeatureImpactUi['change'],
          summary: typeof feature.summary === 'string' ? feature.summary : undefined,
        }];
      })
      : undefined;
    const visualizations: EpicVisualizationsUi = {
      impactMermaid: readOptionalText(path.join(artifacts, 'FEATURE-IMPACT.mmd')),
      surfacesMermaid: readOptionalText(path.join(artifacts, 'FEATURE-SURFACES.mmd')),
      flowMermaid: readOptionalText(path.join(artifacts, 'FEATURE-FLOW.mmd')),
      impactFeatures: impactFeatures?.length ? impactFeatures : undefined,
    };
    if (visualizations.impactMermaid || visualizations.surfacesMermaid || visualizations.flowMermaid || visualizations.impactFeatures) {
      return visualizations;
    }
  }
  return undefined;
}

function extractSkillIds(a: Record<string, unknown>): string[] {
  if (Array.isArray(a.skills)) {
    return (a.skills as unknown[]).map(String).filter(Boolean);
  }
  if (typeof a.skill === 'string' && a.skill.length > 0) { return [a.skill]; }
  return [];
}

/**
 * Cheap built-in-preset detector. Recognizes two markers we write at the
 * very top of generated content:
 *
 * 1. `<!-- Composed by AIDLC Flow built-in preset "<id>" — phase: <phase> -->`
 *    — written by `composeSkill()` into each `.aidlc/skills/<phase>.md`.
 * 2. `<!-- AIDLC extension built-in — workflow: <id>, kind: agent|skill, id: <id> -->`
 *    — written by `globalDefaultsInstaller` into `~/.claude/agents/`
 *    and `~/.claude/skills/`.
 *
 * Returns the workflow's human name ("SDLC Pipeline", "iOS Native Pipeline", …)
 * so the UI can render "from <name>" subtitles and BUILT-IN badges.
 */
function detectBuiltinSource(filePath: string): string | undefined {
  if (!filePath || !fs.existsSync(filePath)) { return undefined; }
  try {
    const head = fs.readFileSync(filePath, 'utf8').slice(0, 200);
    const composed = head.match(/<!-- Composed by AIDLC Flow built-in preset "([^"]+)"/);
    const installed = head.match(/<!-- AIDLC extension built-in — workflow:\s*([^,\s]+)/);
    const id = composed?.[1] ?? installed?.[1];
    if (!id) { return undefined; }
    const workflow = BUILTIN_WORKFLOWS.find((w) => w.id === id);
    return workflow?.name ?? id;
  } catch { return undefined; }
}

function mergeAgents(doc: YamlDocument | null, root: string, discovered: DiscoveredAsset[]): AgentSummary[] {
  // Use Map to deduplicate by agent ID; precedence: aidlc > project > global
  // so an agent declared in workspace.yaml takes priority over discovered files.
  const byId = new Map<string, AgentSummary>();

  // Workspace.yaml owns the persona ↔ skills binding for AIDLC personas, but
  // the same persona shows up in the Agents tab (and the AddPipeline picker)
  // as a project/global `.md` file. Build a lookup so file-based entries
  // inherit their `skills:` array — the picker hides the AIDLC scope, so
  // without this overlay the per-step skill picker would be empty.
  const yamlSkillsById = new Map<string, string[]>();
  if (doc) {
    for (const a of doc.agents) {
      const skills = extractSkillIds(a);
      if (skills.length > 0) { yamlSkillsById.set(String(a.id), skills); }
    }
  }

  // Add global scope (lowest priority)
  for (const a of discovered.filter((x) => x.scope === 'global')) {
    const fm = parseAgentFrontmatter(a.filePath);
    const fileSkills = fm.skills && fm.skills.length > 0 ? fm.skills : undefined;
    const yamlSkills = yamlSkillsById.get(a.id);
    const resolvedSkills = fileSkills ?? yamlSkills;
    byId.set(a.id, {
      id: a.id,
      scope: 'global',
      filePath: a.filePath,
      description: fm.description,
      model: fm.model,
      integrations: fm.tools,
      skill: resolvedSkills?.[0],
      skills: resolvedSkills,
      builtinFrom: detectBuiltinSource(a.filePath),
    });
  }

  // Add project scope (overrides global)
  for (const a of discovered.filter((x) => x.scope === 'project')) {
    const fm = parseAgentFrontmatter(a.filePath);
    const fileSkills = fm.skills && fm.skills.length > 0 ? fm.skills : undefined;
    const yamlSkills = yamlSkillsById.get(a.id);
    const resolvedSkills = fileSkills ?? yamlSkills;
    byId.set(a.id, {
      id: a.id,
      scope: 'project',
      filePath: a.filePath,
      description: fm.description,
      model: fm.model,
      integrations: fm.tools,
      skill: resolvedSkills?.[0],
      skills: resolvedSkills,
      builtinFrom: detectBuiltinSource(a.filePath),
    });
  }

  // Add aidlc scope (overrides project and global)
  if (doc) {
    // Pre-index workspace.yaml skill declarations by id so we can resolve
    // each agent's primary-skill path (built-in presets now reference
    // `~/.claude/skills/aidlc-<workflow>-<phase>.md`, not `.aidlc/skills/`).
    const skillPathById = new Map<string, string>();
    for (const s of doc.skills) {
      const sid = String(s.id);
      const p = typeof s.path === 'string' ? s.path : '';
      if (!p) { continue; }
      const expanded = expandHomePath(p);
      skillPathById.set(sid, path.isAbsolute(expanded) ? expanded : path.resolve(root, expanded));
    }

    for (const a of doc.agents) {
      const id = String(a.id);
      const skills = extractSkillIds(a);
      // Agents inherit `builtinFrom` from their primary skill — read the marker
      // off whichever .md the skill declaration points at (legacy `.aidlc/skills/`
      // or new `~/.claude/skills/aidlc-*`).
      const primarySkillPath = skillPathById.get(skills[0] ?? id)
        ?? path.join(root, WORKSPACE_DIR, 'skills', `${skills[0] ?? id}.md`);
      byId.set(id, {
        id,
        scope: 'aidlc',
        filePath: '',
        description: typeof a.description === 'string' ? a.description : (typeof a.name === 'string' ? a.name : undefined),
        skill: skills[0],
        skills,
        model: typeof a.model === 'string' ? a.model : undefined,
        integrations: Array.isArray(a.capabilities)
          ? (a.capabilities as unknown[]).map(String)
          : undefined,
        builtinFrom: detectBuiltinSource(primarySkillPath),
      });
    }
  }

  return Array.from(byId.values());
}

/**
 * Pull `description`, `model`, `tools`, and `skills` out of a Claude-native
 * agent `.md` file's YAML frontmatter. Hand-rolled parser (no yaml dep needed
 * for these fields) — reads only the first 4 KB and stops at the closing `---`.
 *
 * `tools` and `skills` accept either inline arrays (`[files, jira]`) or bullet
 * lists under the key. Unknown fields are ignored.
 */
function parseAgentFrontmatter(filePath: string): {
  description?: string;
  model?: string;
  tools?: string[];
  skills?: string[];
} {
  if (!filePath || !fs.existsSync(filePath)) { return {}; }
  let raw: string;
  try { raw = fs.readFileSync(filePath, 'utf8').slice(0, 4096); }
  catch { return {}; }
  // First line that isn't whitespace/marker should be `---`.
  const m = raw.match(/^(?:<!--[^\n]*-->\s*\n)?---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) { return {}; }
  const block = m[1];

  const out: { description?: string; model?: string; tools?: string[]; skills?: string[] } = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fmKey = line.match(/^(\w+)\s*:\s*(.*)$/);
    if (!fmKey) { continue; }
    const key = fmKey[1].toLowerCase();
    const value = fmKey[2].trim();
    if (key === 'description') {
      out.description = stripFrontmatterQuotes(value);
    } else if (key === 'model') {
      out.model = stripFrontmatterQuotes(value);
    } else if (key === 'tools' || key === 'skills') {
      const arrayKey = key as 'tools' | 'skills';
      if (value.startsWith('[') && value.endsWith(']')) {
        out[arrayKey] = value.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      } else if (!value) {
        // YAML list form: collect indented `- item` lines.
        const items: string[] = [];
        for (let j = i + 1; j < lines.length; j++) {
          const m2 = lines[j].match(/^\s*-\s+(.+)$/);
          if (!m2) { break; }
          items.push(m2[1].trim().replace(/^['"]|['"]$/g, ''));
        }
        if (items.length > 0) { out[arrayKey] = items; }
      }
    }
  }
  return out;
}

function stripFrontmatterQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Rewrite a Claude-native agent `.md` file's YAML frontmatter. Each key in
 * `updates` either overwrites the existing field, removes it (when value is
 * an explicit empty array for `tools` or `skills`), or leaves it alone (`undefined`).
 *
 * The body — everything after the closing `---` — is preserved byte-for-byte.
 * If the file has no frontmatter, one is prepended.
 *
 * Used by `editAgentInline` so the modal save round-trips through the
 * same fields `parseAgentFrontmatter` reads back.
 */
function rewriteAgentFrontmatter(
  raw: string,
  updates: {
    name?: string;
    description?: string;
    model?: string;
    tools?: string[];
    skills?: string[];
  },
): string {
  const m = raw.match(/^(?:<!--[^\n]*-->\s*\n)?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const existing: Record<string, string> = {};
  const existingTools: { value: string[] | null } = { value: null };
  const existingSkills: { value: string[] | null } = { value: null };
  let body = raw;
  if (m) {
    body = raw.slice(m[0].length);
    const lines = m[1].split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const kv = line.match(/^(\w+)\s*:\s*(.*)$/);
      if (!kv) { continue; }
      const key = kv[1];
      const value = kv[2].trim();
      if (key === 'tools' || key === 'skills') {
        const targetObj = key === 'tools' ? existingTools : existingSkills;
        if (value.startsWith('[') && value.endsWith(']')) {
          targetObj.value = value.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
        } else if (!value) {
          const items: string[] = [];
          let j = i + 1;
          while (j < lines.length) {
            const item = lines[j].match(/^\s*-\s+(.+)$/);
            if (!item) { break; }
            items.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
            j++;
          }
          if (items.length > 0) { targetObj.value = items; }
          i = j - 1;
        }
      } else {
        existing[key] = value;
      }
    }
  }

  const merged: Record<string, string> = { ...existing };
  if (updates.name !== undefined) { merged.name = updates.name; }
  if (updates.description !== undefined) { merged.description = updates.description; }
  if (updates.model !== undefined) { merged.model = updates.model; }
  const finalTools = updates.tools ?? existingTools.value ?? null;
  const finalSkills = updates.skills ?? existingSkills.value ?? null;

  // Emit in a stable order: name, description, model, tools, skills, then any
  // other keys we preserved (e.g. user-added frontmatter).
  const orderedKeys = ['name', 'description', 'model'];
  const lines: string[] = ['---'];
  for (const k of orderedKeys) {
    if (merged[k] !== undefined && merged[k] !== '') {
      lines.push(`${k}: ${merged[k]}`);
    }
  }
  for (const [k, v] of Object.entries(merged)) {
    if (orderedKeys.includes(k)) { continue; }
    if (v) { lines.push(`${k}: ${v}`); }
  }
  if (finalTools && finalTools.length > 0) {
    lines.push(`tools: [${finalTools.join(', ')}]`);
  }
  if (finalSkills && finalSkills.length > 0) {
    lines.push(`skills: [${finalSkills.join(', ')}]`);
  }
  lines.push('---', '');
  const bodyTrimmed = body.replace(/^\r?\n+/, '');
  return `${lines.join('\n')}\n${bodyTrimmed}`;
}

function expandHomePath(p: string): string {
  if (p.startsWith('~/')) { return path.join(os.homedir(), p.slice(2)); }
  return p;
}

function mergeSkills(
  doc: YamlDocument | null,
  root: string,
  discovered: DiscoveredAsset[],
): SkillSummary[] {
  // Use Map to deduplicate by skill ID; precedence: aidlc > project > global
  // so a skill declared in workspace.yaml takes priority over discovered files.
  const byId = new Map<string, SkillSummary>();

  // Add global scope (lowest priority)
  for (const s of discovered.filter((x) => x.scope === 'global')) {
    byId.set(s.id, { id: s.id, scope: 'global', filePath: s.filePath, builtinFrom: detectBuiltinSource(s.filePath) });
  }

  // Add project scope (overrides global)
  for (const s of discovered.filter((x) => x.scope === 'project')) {
    byId.set(s.id, { id: s.id, scope: 'project', filePath: s.filePath, builtinFrom: detectBuiltinSource(s.filePath) });
  }

  // Add aidlc scope (overrides project and global)
  if (doc) {
    for (const s of doc.skills) {
      const id = String(s.id);
      if (s.builtin) {
        byId.set(id, { id, scope: 'aidlc', filePath: '', description: 'builtin' });
        continue;
      }
      const skillPath = typeof s.path === 'string' ? s.path : undefined;
      const expanded = skillPath ? expandHomePath(skillPath) : '';
      const abs = expanded
        ? (path.isAbsolute(expanded) ? expanded : path.resolve(root, expanded))
        : '';
      byId.set(id, { id, scope: 'aidlc', filePath: abs, builtinFrom: detectBuiltinSource(abs) });
    }
  }

  return Array.from(byId.values());
}

// ── Singleton panel ───────────────────────────────────────────────────────

/** Render an epic-memory.json object as a readable Markdown digest. */
function formatEpicMemoryMarkdown(mem: Record<string, unknown>, epicId: string): string {
  const esc = (v: unknown) => String(v ?? '');
  const entries = Array.isArray(mem.entries) ? (mem.entries as Array<Record<string, unknown>>) : [];
  const reflections = Array.isArray(mem.reflections) ? (mem.reflections as Array<Record<string, unknown>>) : [];
  const lines: string[] = [`# Epic memory — ${esc(mem.epic) || epicId}`];
  if (mem.updatedAt) { lines.push('', `_updated ${esc(mem.updatedAt)}_`); }
  if (mem.summary) { lines.push('', '## Summary', '', esc(mem.summary)); }
  if (entries.length) {
    lines.push('', '## Context & decisions', '');
    for (const e of entries) {
      const who = [e.author, e.at].filter(Boolean).map(esc).join(', ');
      lines.push(`- **[${esc(e.kind) || 'note'}]** ${esc(e.text)}${who ? `  \n  _— ${who}_` : ''}`);
    }
  }
  if (reflections.length) {
    lines.push('', '## Reflections — prompt/work better next time', '');
    for (const r of reflections) {
      const who = [r.author, r.at].filter(Boolean).map(esc).join(', ');
      lines.push(`- ${esc(r.text)}${who ? `  \n  _— ${who}_` : ''}`);
    }
  }
  if (entries.length === 0 && reflections.length === 0 && !mem.summary) {
    lines.push('', '_(empty — add entries with `/epic-context` while working the epic)_');
  }
  return lines.join('\n') + '\n';
}

export class WorkspaceWebview {
  static readonly viewType = 'aidlc.workspace';
  static current: WorkspaceWebview | undefined;
  private disposables: vscode.Disposable[] = [];
  private currentView: WorkspaceView;
  private lastBundleMtime = 0;
  /** Debounce for the Discover docs watcher — an agent saves several times per step. */
  private discoverAbsorbTimer: ReturnType<typeof setTimeout> | undefined;
  static show(extensionUri: vscode.Uri, initialView: WorkspaceView = 'project'): void {
    const column = vscode.ViewColumn.One;
    const title = extensionDisplayName(extensionUri.fsPath);
    if (WorkspaceWebview.current) {
      WorkspaceWebview.current.panel.title = title;
      // Always remount: F5 / window reload can restore a panel whose HTML
      // still points at deleted webview URIs even when the bundle mtime matches.
      WorkspaceWebview.current.remountHtml();
      WorkspaceWebview.current.panel.reveal(column);
      WorkspaceWebview.current.setView(initialView);
      WorkspaceWebview.current.refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      WorkspaceWebview.viewType,
      title,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          extensionUri,
          ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri),
        ],
      },
    );
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.svg');
    WorkspaceWebview.current = new WorkspaceWebview(panel, extensionUri, initialView);
  }

  /**
   * Reveal the Workspace panel without changing the active tab.
   * Creates the panel only when it isn't open — restores lastView from prefs.
   */
  static reveal(extensionUri: vscode.Uri): void {
    if (WorkspaceWebview.current) {
      WorkspaceWebview.current.panel.title = extensionDisplayName(extensionUri.fsPath);
      WorkspaceWebview.current.reloadHtmlIfNeeded();
      // Keep column + tab; do not refresh (avoids remounting Epics UI).
      WorkspaceWebview.current.panel.reveal(undefined, false);
      return;
    }
    const last = workspaceUiPrefs.get().lastView ?? 'project';
    WorkspaceWebview.show(extensionUri, last);
  }

  /** Reclaim a panel restored by VS Code after reload. */
  static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri): void {
    if (WorkspaceWebview.current) {
      // Already have a live panel — dispose the duplicate restore.
      try { panel.dispose(); } catch { /* ignore */ }
      return;
    }
    const last = workspaceUiPrefs.get().lastView ?? 'project';
    WorkspaceWebview.current = new WorkspaceWebview(panel, extensionUri, last);
    // VS Code may write cached HTML *after* deserializeWebviewPanel returns,
    // overwriting loadHtml() from the constructor. Remount on the next tick.
    setTimeout(() => WorkspaceWebview.current?.remountHtml(), 0);
  }

  static registerSerializer(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(WorkspaceWebview.viewType, {
        async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
          WorkspaceWebview.revive(panel, context.extensionUri);
        },
      }),
    );
  }

  /**
   * Open (or reveal) once after activation, preferring a restored panel.
   * Deferred so {@link registerSerializer} can reclaim existing panels first.
   */
  static scheduleAutoOpen(extensionUri: vscode.Uri, fallbackView: WorkspaceView): void {
    setTimeout(() => {
      if (WorkspaceWebview.current) {
        WorkspaceWebview.current.remountHtml();
        WorkspaceWebview.current.refresh();
        return;
      }
      const last = workspaceUiPrefs.get().lastView ?? fallbackView;
      WorkspaceWebview.show(extensionUri, last);
    }, 400);
  }

  /**
   * Open the workspace panel on the Epics view and ask the React side to pop
   * the StartEpicModal. Used by the sidebar's "Start Epic" button so the user
   * gets the inline experience instead of a chain of VS Code dialogs.
   */
  static triggerStartEpic(extensionUri: vscode.Uri): void {
    WorkspaceWebview.show(extensionUri, 'epics');
    void WorkspaceWebview.current?.panel.webview.postMessage({ type: 'triggerStartEpic' });
  }

  /**
   * Open the Builder panel and select one of its internal tabs
   * (workflows / agents / skills / epics). Used by the sidebar stat tiles
   * so a count doubles as a deep link into the matching tab.
   */
  static openBuilderTab(extensionUri: vscode.Uri, tab: string): void {
    WorkspaceWebview.show(extensionUri, 'builder');
    void WorkspaceWebview.current?.panel.webview.postMessage({ type: 'setBuilderTab', tab });
  }

  static openAnalyze(extensionUri: vscode.Uri): void {
    WorkspaceWebview.show(extensionUri, 'analyze');
  }

  /**
   * Re-build + push state to the open Builder panel, if any. Used by
   * install/uninstall workflow-globals commands so the Domain dropdown
   * reflects the new set of installed workflows without a manual reload.
   * No-op when the panel isn't open.
   */
  static refreshCurrent(): void {
    WorkspaceWebview.current?.refresh();
  }

  /** Epics as of the last state build, for the Jira ticket → task linkage. */
  private lastEpicLinks: EpicLinkSource[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    initialView: WorkspaceView,
  ) {
    this.currentView = initialView;
    // The sprint service outlives this panel (it is a module singleton holding
    // the ExtensionContext), so it takes the panel's post/epics hooks while the
    // panel is alive and drops them on dispose.
    jiraSprintService.attach({
      post: (message) => { void this.panel.webview.postMessage(message); },
      epics: () => this.lastEpicLinks,
    });
    jiraSubtaskService.attach({
      post: (message) => { void this.panel.webview.postMessage(message); },
    });
    // Restored panels do not retain the dynamic workspace resource root. Keep
    // it available for local workspace documents and explicit SVG exports.
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.extensionUri,
        ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri),
      ],
    };
    this.loadHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => {
        void this.handleMessage(msg).catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error);
          workspaceOutput.appendLine(`[webview:${String(msg?.type ?? 'unknown')}] ${detail}`);
          workspaceOutput.show(true);
          void vscode.window.showErrorMessage(`AIDLC action failed: ${detail}`);
        });
      },
      null,
      this.disposables,
    );
    this.disposables.push(themeManager.register(this.panel.webview));

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      const refresh = () => this.refresh();

      const yamlPattern = new vscode.RelativePattern(
        vscode.Uri.file(path.join(root, WORKSPACE_DIR)),
        WORKSPACE_FILENAME,
      );
      const yamlWatcher = vscode.workspace.createFileSystemWatcher(yamlPattern);
      yamlWatcher.onDidChange(refresh, null, this.disposables);
      yamlWatcher.onDidCreate(refresh, null, this.disposables);
      yamlWatcher.onDidDelete(refresh, null, this.disposables);
      this.disposables.push(yamlWatcher);

      const projectDocsPattern = new vscode.RelativePattern(
        vscode.Uri.file(root),
        '{AGENTS.md,PROJECT.md,STATUS.md,DECISIONS.md}',
      );
      const projectDocsWatcher = vscode.workspace.createFileSystemWatcher(projectDocsPattern);
      projectDocsWatcher.onDidChange(refresh, null, this.disposables);
      projectDocsWatcher.onDidCreate(refresh, null, this.disposables);
      projectDocsWatcher.onDidDelete(refresh, null, this.disposables);
      this.disposables.push(projectDocsWatcher);

      // Architecture Studio owns one standalone, agent-generated manifest.
      // It deliberately does not watch or consume Epic artifacts.
      const architectureArtifactsPattern = new vscode.RelativePattern(
        vscode.Uri.file(root),
        'docs/project/architecture/ARCHITECTURE-STUDIO.json',
      );
      const architectureArtifactsWatcher = vscode.workspace.createFileSystemWatcher(architectureArtifactsPattern);
      architectureArtifactsWatcher.onDidChange(refresh, null, this.disposables);
      architectureArtifactsWatcher.onDidCreate(refresh, null, this.disposables);
      architectureArtifactsWatcher.onDidDelete(refresh, null, this.disposables);
      this.disposables.push(architectureArtifactsWatcher);

      const statePattern = new vscode.RelativePattern(vscode.Uri.file(root), '**/state.json');
      const stateWatcher = vscode.workspace.createFileSystemWatcher(statePattern);
      stateWatcher.onDidChange(refresh, null, this.disposables);
      stateWatcher.onDidCreate(refresh, null, this.disposables);
      stateWatcher.onDidDelete(refresh, null, this.disposables);
      this.disposables.push(stateWatcher);

      const runsPattern = new vscode.RelativePattern(vscode.Uri.file(root), '.aidlc/runs/*.json');
      const runsWatcher = vscode.workspace.createFileSystemWatcher(runsPattern);
      runsWatcher.onDidChange(refresh, null, this.disposables);
      runsWatcher.onDidCreate(refresh, null, this.disposables);
      runsWatcher.onDidDelete(refresh, null, this.disposables);
      this.disposables.push(runsWatcher);

      // Artifacts dir under each epic — refresh when the agent writes a
      // produced file. Without this, "PRD.md · not produced yet" stays
      // stale until the user triggers another refresh manually.
      const artifactsPattern = new vscode.RelativePattern(
        vscode.Uri.file(root),
        '**/artifacts/**',
      );
      const artifactsWatcher = vscode.workspace.createFileSystemWatcher(artifactsPattern);
      artifactsWatcher.onDidChange(refresh, null, this.disposables);
      artifactsWatcher.onDidCreate(refresh, null, this.disposables);
      artifactsWatcher.onDidDelete(refresh, null, this.disposables);
      this.disposables.push(artifactsWatcher);

      // The Discover docs. An agent writes these files directly — this watcher
      // is the only thing that turns those writes into a reviewable diff, so it
      // debounces (a step is several saves) rather than reacting per save.
      const discoverDocsRoot = new DiscoverService(root).load()?.docsRoot ?? 'docs';
      const discoverPattern = new vscode.RelativePattern(vscode.Uri.file(root), `${discoverDocsRoot}/**/*.md`);
      const discoverWatcher = vscode.workspace.createFileSystemWatcher(discoverPattern);
      const absorb = () => {
        if (this.discoverAbsorbTimer) { clearTimeout(this.discoverAbsorbTimer); }
        this.discoverAbsorbTimer = setTimeout(() => {
          this.discoverAbsorbTimer = undefined;
          absorbDocChanges(root);
          this.refresh();
        }, 1200);
      };
      discoverWatcher.onDidChange(absorb, null, this.disposables);
      discoverWatcher.onDidCreate(absorb, null, this.disposables);
      discoverWatcher.onDidDelete(absorb, null, this.disposables);
      this.disposables.push(discoverWatcher);

      const breakdownPattern = new vscode.RelativePattern(
        vscode.Uri.file(root),
        'docs/task-breakdowns/**',
      );
      const breakdownWatcher = vscode.workspace.createFileSystemWatcher(breakdownPattern);
      breakdownWatcher.onDidChange(refresh, null, this.disposables);
      breakdownWatcher.onDidCreate(refresh, null, this.disposables);
      breakdownWatcher.onDidDelete(refresh, null, this.disposables);
      this.disposables.push(breakdownWatcher);
    }

    this.refresh();
  }

  refresh(): void {
    void this.refreshAsync();
  }

  private async refreshAsync(): Promise<void> {
    try {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (root) { this.ensureWorkflowTemplates(root); }
      const state = this.buildWebviewState();
      await mergeEpicTokenUsageInto(state);
      void this.panel.webview.postMessage({ type: 'state', state });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      workspaceOutput.appendLine(`[workspace refresh] ${detail}`);
    }
  }

  private workspaceBundlePath(): string {
    return path.join(this.extensionUri.fsPath, 'out', 'webviews', 'workspace.js');
  }

  private bundleMtime(): number {
    try { return fs.statSync(this.workspaceBundlePath()).mtimeMs; } catch { return 0; }
  }

  /** Remount when Vite watch deleted/replaced the React bundle (otherwise the tab stays black). */
  private reloadHtmlIfNeeded(): void {
    const mtime = this.bundleMtime();
    if (mtime !== this.lastBundleMtime) this.loadHtml();
  }

  /** Force a full HTML remount (F5 restore race, OPEN WORKSPACE, auto-open). */
  remountHtml(): void {
    this.loadHtml();
  }

  private loadHtml(): void {
    this.panel.title = extensionDisplayName(this.extensionUri.fsPath);
    this.panel.webview.html = this.getHtml();
    this.lastBundleMtime = this.bundleMtime();
  }

  /** Build the curated, script-free state consumed by the React webview. */
  private buildWebviewState(): WorkspaceState {
    const state = buildState(this.currentView);
    // Sprint data is fetched asynchronously, so only the cached snapshot can
    // ride along here; `jiraSprintService` posts `sprintState` once the network
    // call lands. Seeding it means the Sprint tab paints instead of flashing an
    // empty state on every panel open.
    state.sprint = jiraSprintService.snapshot();
    // Remember the epics so the ticket → task linkage does not have to rebuild
    // the whole workspace state (a filesystem scan) on every sprint refresh.
    this.lastEpicLinks = state.epics.map((epic) => ({
      id: epic.id,
      inputs: epic.inputs ?? {},
      status: epic.status,
      currentStep: epic.currentStep,
      stepCount: epic.stepDetails.length,
    }));
    return state;
  }

  setView(view: WorkspaceView): void {
    this.currentView = view;
    void workspaceUiPrefs.setLastView(view);
    void this.panel.webview.postMessage({ type: 'setView', view });
  }

  private dispose(): void {
    WorkspaceWebview.current = undefined;
    jiraSprintService.detach();
    jiraSubtaskService.detach();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) { d.dispose(); }
    }
  }

  /** Start the full provider-aware /annotate-artifact review loop in one click. */
  private annotateArtifact(epicDir: string, filename: string): void {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const resolved = this.resolveArtifactAbsPath(epicDir, filename);
    const conventional = path.join(epicDir, 'artifacts', filename);
    // /annotate-artifact only understands <epicDir>/artifacts/<file> — epicDir
    // already resolved against the workspace's active epics directory (see
    // epicsRoot()), so this is directory-agnostic, not a `docs/epics` hardcode.
    // For produces: outside that folder, open the file for
    // manual edit instead of launching a loop that would look in the wrong place.
    if (resolved && path.resolve(resolved) !== path.resolve(conventional)) {
      void vscode.workspace.openTextDocument(resolved).then((doc) => {
        void vscode.window.showTextDocument(doc, { preview: false });
      });
      void vscode.window.showInformationMessage(
        `${filename} nằm ngoài epic artifacts/ — mở file để sửa trực tiếp. Feedback loop (/annotate-artifact) chỉ hỗ trợ artifacts trong epic.`,
      );
      return;
    }
    if (!resolved || !fs.existsSync(resolved)) {
      void vscode.window.showInformationMessage(`Artifact chưa tồn tại: ${filename}`);
      return;
    }

    const epicId = path.basename(epicDir);
    const skillCmd = `/annotate-artifact ${epicId} ${filename}`;
    const cwd = root && fs.existsSync(root) ? root : epicDir;
    runSlashCommandWithProvider(skillCmd, cwd, this.extensionUri.fsPath);
    void vscode.window.showInformationMessage(
      `Đang mở vòng annotate cho ${filename} bằng provider đang chọn. ` +
        'Provider sẽ render + mở annotron, nhận feedback và sửa Markdown.',
    );
  }

  /**
   * Resolve an artifact basename to an absolute path for this epic.
   * Prefers the indexed produces:/artifacts path from listEpics; falls back
   * to the conventional epicDir/artifacts/<file>.
   */
  private resolveArtifactAbsPath(epicDir: string, filename: string): string | null {
    if (!epicDir || !filename) { return null; }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      try {
        const epic = listEpics(root, readYaml(root)).find((e) => e.epicDir === epicDir);
        const indexed = epic?.artifactPaths?.[filename];
        if (indexed && fs.existsSync(indexed)) { return indexed; }
      } catch { /* fall through */ }
    }
    const conventional = path.join(epicDir, 'artifacts', filename);
    if (fs.existsSync(conventional)) { return conventional; }
    return null;
  }

  /**
   * Read-only preview of an artifact in annotron. Unlike the old "Open HTML"
   * (which opened md-to-html's static `.html` — no Mermaid), this opens the
   * `.md` directly in annotron, which renders Markdown itself (markdown-it +
   * merslim) so **diagrams show as SVG**, matching the Feedback view. No Claude
   * and no feedback loop — the reviewer just looks; the "Feedback" button runs
   * the full /annotate-artifact loop when they want to leave comments.
   *
   * Runs the vendored annotron installed at `~/.claude/tools/annotron` — the
   * same binary the skill uses — so it needs only `node`, not `claude`.
   */
  private viewArtifactInAnnotron(epicDir: string, filename: string): void {
    const mdPath = this.resolveArtifactAbsPath(epicDir, filename);
    if (!mdPath) {
      void vscode.window.showInformationMessage(`Artifact chưa tồn tại: ${filename}`);
      return;
    }
    const annotronBin = path.join(os.homedir(), '.claude', 'tools', 'annotron', 'bin', 'annotron');
    if (!fs.existsSync(annotronBin)) {
      void vscode.window.showWarningMessage(
        'Annotron chưa được cài (~/.claude/tools/annotron). Mở lại project để extension cài lại, hoặc dùng nút Feedback.',
      );
      return;
    }

    const epicId = path.basename(epicDir);
    const termName = `AIDLC · Preview: ${epicId}/${filename}`;
    const existing = vscode.window.terminals.find((t) => t.name === termName);
    if (existing) {
      if (existing.exitStatus === undefined) { existing.show(false); return; }
      existing.dispose();
    }

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const cwd = root && fs.existsSync(root) ? root : epicDir;
    const terminal = vscode.window.createTerminal({
      name: termName,
      cwd,
      iconPath: new vscode.ThemeIcon('eye'),
      location: vscode.TerminalLocation.Panel,
      // Strip the Electron-as-Node vars VS Code injects into terminals it
      // spawns. annotron's `ensureServer` starts `server.js` with
      // `spawn(process.execPath, …, { env: process.env })`; if
      // ELECTRON_RUN_AS_NODE / NODE_OPTIONS (which --requires VS Code
      // internals) leak in, that node either loads VS Code's bootstrap
      // (slow → 3s startup timeout) or crashes → "Server failed to start".
      // Unsetting them (null) gives the whole chain a clean node env.
      env: {
        DISABLE_AUTO_UPDATE: 'true',
        DISABLE_UPDATE_PROMPT: 'true',
        ELECTRON_RUN_AS_NODE: null,
        NODE_OPTIONS: null,
      },
    });
    terminal.show(false);

    // `annotron <file.md>` starts the background server (if needed), registers
    // the file, and opens the rendered preview in the browser — then exits.
    const launch = `node ${JSON.stringify(annotronBin)} ${JSON.stringify(mdPath)}`;
    let sent = false;
    const integ = vscode.window.onDidChangeTerminalShellIntegration((e) => {
      if (e.terminal === terminal && e.shellIntegration && !sent) {
        sent = true;
        e.shellIntegration.executeCommand(launch);
        integ.dispose();
      }
    });
    this.disposables.push(integ);
    setTimeout(() => {
      if (!sent) { sent = true; terminal.sendText(launch, true); integ.dispose(); }
    }, 2000);
  }

  /**
   * Show an epic's memory digest (docs/epics/<epic>/epic-memory.json) as a
   * rendered Markdown preview so anyone can read the shared context (summary,
   * decisions/constraints, reflections) without opening raw JSON.
   */
  private async openEpicMemory(epicDir: string): Promise<void> {
    const p = path.join(epicDir, 'epic-memory.json');
    if (!fs.existsSync(p)) {
      void vscode.window.showInformationMessage(
        `Epic này chưa có memory. Chạy /epic-context ${path.basename(epicDir)} trong Claude Code để bắt đầu tích luỹ context.`,
      );
      return;
    }
    let mem: Record<string, unknown>;
    try {
      mem = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      void vscode.window.showErrorMessage(`epic-memory.json không đọc được (JSON lỗi): ${p}`);
      return;
    }
    const md = formatEpicMemoryMarkdown(mem, path.basename(epicDir));
    const doc = await vscode.workspace.openTextDocument({ content: md, language: 'markdown' });
    await vscode.window.showTextDocument(doc, { preview: true });
    await vscode.commands.executeCommand('markdown.showPreview', doc.uri);
  }

  /**
   * Every Discover write goes through here: a stale `revision` means the tab
   * is looking at an older blueprint than the one on disk, and the fix is to
   * reload rather than to overwrite what changed underneath.
   */
  private handleDiscoverMutation(run: () => void): void {
    try {
      run();
      this.refresh();
    } catch (error) {
      if (error instanceof DiscoverRevisionConflictError) {
        void this.panel.webview.postMessage({ type: 'discoverRevisionConflict', serverRevision: error.actualRevision });
        this.refresh();
        return;
      }
      void vscode.window.showWarningMessage(`AIDLC Discover: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ── Message routing ─────────────────────────────────────────────────────

  private async handleMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.refresh();
        return;

      case 'refreshArchitectureStudio':
        this.refresh();
        return;

      case 'generateArchitectureStudio': {
        const root = this.getRootOrWarn();
        if (!root) { return; }
        try {
          runSlashCommandInProvider('/architecture-studio-generate', root, this.extensionUri.fsPath);
          void this.panel.webview.postMessage({
            type: 'architectureGenerationStarted',
            path: ARCHITECTURE_STUDIO_RELATIVE_PATH,
          });
          void vscode.window.showInformationMessage(
            `Architecture Agent started. It will write ${ARCHITECTURE_STUDIO_RELATIVE_PATH}.`,
          );
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          void this.panel.webview.postMessage({ type: 'architectureGenerationFailed', message: detail });
          void vscode.window.showErrorMessage(`Could not start Architecture Agent: ${detail}`);
        }
        return;
      }

      case 'exportArchitectureSnapshot': {
        const root = this.getRootOrWarn();
        const format = msg.format === 'svg' || msg.format === 'html' ? msg.format : undefined;
        const content = typeof msg.content === 'string' ? msg.content : '';
        const baseName = typeof msg.suggestedName === 'string'
          ? msg.suggestedName.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
          : 'architecture';
        if (!root || !format || !content || content.length > 4_000_000 || /<script\b/i.test(content)) {
          void vscode.window.showWarningMessage('AIDLC: architecture export was rejected because its payload is invalid.');
          return;
        }
        const target = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(path.join(root, 'docs', 'project', 'context', 'visualization', `${baseName || 'architecture'}.${format}`)),
          filters: format === 'svg' ? { 'SVG image': ['svg'] } : { 'HTML document': ['html'] },
          saveLabel: 'Export architecture',
        });
        if (!target) { return; }
        fs.mkdirSync(path.dirname(target.fsPath), { recursive: true });
        fs.writeFileSync(target.fsPath, content, 'utf8');
        void vscode.window.showInformationMessage(`AIDLC: exported Architecture Studio as ${path.basename(target.fsPath)}.`);
        return;
      }

      case 'setTheme': {
        const mode = String(msg.mode ?? '');
        if (mode === 'auto' || mode === 'light' || mode === 'dark') {
          await themeManager.set(mode);
        }
        return;
      }

      case 'openSettings': {
        await vscode.commands.executeCommand('aidlc.openSettings');
        return;
      }

      case 'openDiscoverGuide': {
        const { openDiscoverGuide } = await import('./openGuides');
        await openDiscoverGuide(this.extensionUri.fsPath);
        return;
      }

      case 'setView': {
        const v = msg.view;
        if (v === 'project' || v === 'discover' || v === 'builder' || v === 'architecture' || v === 'epics' || v === 'sprint' || v === 'analyze' || v === 'tests') {
          this.currentView = v;
          void workspaceUiPrefs.setLastView(v);
        }
        return;
      }

      case 'initializeProjectWorkspace': {
        const root = this.getRootOrWarn();
        if (!root) { return; }
        const created = initializeProjectWorkspace(root, path.basename(root));
        this.refresh();
        if (created.length === 0) {
          void vscode.window.showInformationMessage('AIDLC Workspace: shared project context is already initialized.');
        } else {
          void vscode.window.showInformationMessage(
            `AIDLC Workspace: created ${created.length} shared context file${created.length === 1 ? '' : 's'}. Existing files were preserved.`,
          );
        }
        return;
      }

      // ── Discover blueprint ───────────────────────────────────────────────
      // Content lives in Markdown under docsRoot and is authoritative; these
      // handlers only ever go through DiscoverService, never write a doc by
      // hand. See docs/DISCOVER_TAB_PLAN.md.
      case 'initDiscover': {
        const root = this.getRootOrWarn();
        if (!root) { return; }
        const seedSentence = typeof msg.seedSentence === 'string' ? msg.seedSentence.trim() : '';
        if (!seedSentence) { return; }
        this.handleDiscoverMutation(() => {
          new DiscoverService(root).init({
            seedSentence,
            outputLanguage: resolveDisplayLanguage(),
            actor: { kind: 'user', id: 'vscode-user' },
          });
        });
        return;
      }

      case 'applyDiscoverOps': {
        const root = this.getRootOrWarn();
        const docPath = msg.docPath;
        const ops = Array.isArray(msg.ops) ? (msg.ops as DocOp[]) : [];
        if (!root || !isDiscoverDocPath(docPath) || ops.length === 0) { return; }
        const revision = Number(msg.revision);
        const expectedRevision = Number.isInteger(revision) ? revision : undefined;
        this.handleDiscoverMutation(() => {
          const service = new DiscoverService(root);
          // Checked up front: starting a run below bumps the revision itself,
          // which would make this check fire on the run's own bump instead of
          // on a real conflict if it ran after.
          const currentRevision = service.require().revision;
          if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
            throw new DiscoverRevisionConflictError(expectedRevision, currentRevision);
          }
          let issues: string[] = [];
          withDiscoverEditReview(service, docPath, (runId) => {
            issues = service.applyOps(docPath, ops, { actor: { kind: 'user', id: 'vscode-user' }, runId }).issues;
          });
          if (issues.length) {
            void vscode.window.showWarningMessage(`AIDLC Discover: ${issues.join(' · ')}`);
          }
        });
        return;
      }

      case 'saveDiscoverDoc': {
        const root = this.getRootOrWarn();
        const docPath = msg.docPath;
        const content = typeof msg.content === 'string' ? msg.content : undefined;
        if (!root || !isDiscoverDocPath(docPath) || content === undefined) { return; }
        const revision = Number(msg.revision);
        const expectedRevision = Number.isInteger(revision) ? revision : undefined;
        this.handleDiscoverMutation(() => {
          const service = new DiscoverService(root);
          const currentRevision = service.require().revision;
          if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
            throw new DiscoverRevisionConflictError(expectedRevision, currentRevision);
          }
          withDiscoverEditReview(service, docPath, (runId) => {
            service.writeDoc(docPath, content, { actor: { kind: 'user', id: 'vscode-user' }, runId });
          });
        });
        return;
      }

      case 'setDiscoverItemFlags': {
        const root = this.getRootOrWarn();
        const docPath = msg.docPath;
        const id = typeof msg.id === 'string' ? msg.id : '';
        if (!root || !isDiscoverDocPath(docPath) || !id) { return; }
        const flags: { pinned?: boolean; flagged?: boolean } = {};
        if (typeof msg.pinned === 'boolean') { flags.pinned = msg.pinned; }
        if (typeof msg.flagged === 'boolean') { flags.flagged = msg.flagged; }
        this.handleDiscoverMutation(() => { new DiscoverService(root).setItemFlags(docPath, id, flags); });
        return;
      }

      case 'publishDiscoverContext': {
        const root = this.getRootOrWarn();
        if (!root) { return; }
        const reason = await vscode.window.showInputBox({
          title: 'Publish Discover Context',
          prompt: 'Lý do Publish (được lưu trong immutable history)',
          placeHolder: 'Ví dụ: Xác nhận requirement và feature cho handoff đầu tiên',
          ignoreFocusOut: true,
          validateInput: (value) => value.trim() ? undefined : 'Cần một lý do thay đổi.',
        });
        if (!reason?.trim()) { return; }
        try {
          const context = new DiscoverContextPublisher(root).publish({
            actor: { kind: 'user', id: 'vscode-user' },
            reason,
            source: { command: 'Discover: Publish context' },
          });
          this.refresh();
          void vscode.window.showInformationMessage(`AIDLC Discover Context: ${context.discoverRevision} đã sẵn sàng.`);
        } catch (error) {
          const issues = error instanceof Error && 'issues' in error && Array.isArray((error as { issues?: unknown }).issues)
            ? (error as { issues: Array<{ message?: unknown }> }).issues.map((issue) => typeof issue.message === 'string' ? issue.message : '').filter(Boolean)
            : [];
          const detail = error instanceof Error ? error.message : String(error);
          void vscode.window.showWarningMessage(`AIDLC Discover: không thể Publish Context. ${[detail, ...issues].join(' · ')}`);
        }
        return;
      }

      case 'setDiscoverStep': {
        const root = this.getRootOrWarn();
        const step = typeof msg.step === 'string' ? msg.step as DiscoverStepId : undefined;
        if (!root || !step || !DISCOVER_STEPS.some((s) => s.id === step)) { return; }
        this.handleDiscoverMutation(() => { new DiscoverService(root).setCurrentStep(step); });
        return;
      }

      case 'runDiscoverStep':
      case 'runDiscoverPipeline': {
        const root = this.getRootOrWarn();
        if (!root) { return; }
        const service = new DiscoverService(root);
        if (!service.exists()) {
          void vscode.window.showWarningMessage('AIDLC Discover: tạo blueprint trước khi chạy agent.');
          return;
        }
        const requested = typeof msg.step === 'string' ? msg.step as DiscoverStepId : undefined;
        const step = requested && DISCOVER_STEPS.some((s) => s.id === requested) ? requested : service.require().currentStep;
        const note = typeof msg.note === 'string' ? msg.note.trim() : '';
        try {
          // Snapshot BEFORE the agent starts — the diff and every undo hang off it.
          service.startRun(step, { note: note || undefined });
        } catch (error) {
          void vscode.window.showWarningMessage(`AIDLC Discover: ${error instanceof Error ? error.message : String(error)}`);
          return;
        }
        const slash = msg.type === 'runDiscoverPipeline'
          ? `/${DISCOVER_PIPELINE_COMMAND_NAME}${note ? ` ${note}` : ''}`
          : `/${DISCOVER_COMMAND_NAME} ${step}${note ? ` ${note}` : ''}`;
        runSlashCommandInProvider(slash, root, this.extensionUri.fsPath);
        this.refresh();
        return;
      }

      case 'declareDiscoverScope': {
        const root = this.getRootOrWarn();
        if (!root) { return; }
        void this.panel.webview.postMessage(discoverScopeModalPayload(root, 'edit'));
        return;
      }

      case 'scanDiscoverProject': {
        const root = this.getRootOrWarn();
        if (!root) { return; }
        const service = new DiscoverService(root);
        if (service.exists()) {
          const language = resolveDisplayLanguage();
          if (service.activeRun()) {
            void vscode.window.showWarningMessage(
              language === 'vi'
                ? 'AIDLC Discover: đang có lượt chưa đóng. Hãy Giữ hoặc Hoàn tác trước.'
                : 'AIDLC Discover: a run is still open. Keep or undo it first.',
            );
            return;
          }
          const lastKeptPass = service.load()?.scanCampaign?.lastKeptPass;
          if (service.load()?.scanCampaign?.status === 'active') {
            const confirmLabel = language === 'vi' ? 'Bắt đầu lại' : 'Start over';
            const choice = await vscode.window.showWarningMessage(
              language === 'vi'
                ? `Bắt đầu quét mới từ đầu? Chiến dịch hiện tại đang ở bước ${lastKeptPass}/3.`
                : `Start a new scan from pass 1? The current campaign is at pass ${lastKeptPass}/3.`,
              { modal: true },
              confirmLabel,
            );
            if (choice !== confirmLabel) { return; }
          }
        }
        void this.panel.webview.postMessage(discoverScopeModalPayload(root, 'scan'));
        return;
      }

      case 'submitDiscoverScope': {
        const root = this.getRootOrWarn();
        if (!root) { return; }
        const raw = msg.scope;
        if (!raw || typeof raw !== 'object') { return; }
        const draft = raw as {
          layout?: unknown;
          parentPath?: unknown;
          repos?: unknown;
          excludes?: unknown;
        };
        if (draft.layout !== 'single' && draft.layout !== 'parent' && draft.layout !== 'child') { return; }
        if (!Array.isArray(draft.repos) || draft.repos.length === 0) { return; }
        const repos = draft.repos.flatMap((entry) => {
          if (!entry || typeof entry !== 'object') { return []; }
          const r = entry as { path?: unknown; kind?: unknown; name?: unknown };
          if (typeof r.path !== 'string' || typeof r.kind !== 'string') { return []; }
          return [{
            path: r.path,
            kind: r.kind.trim(),
            name: typeof r.name === 'string' ? r.name : r.path,
          }];
        });
        if (repos.length === 0 || repos.some((r) => !r.kind)) { return; }
        const scopeInput = {
          layout: draft.layout as DiscoverScope['layout'],
          parentPath: typeof draft.parentPath === 'string' ? draft.parentPath : undefined,
          repos,
          excludes: Array.isArray(draft.excludes) ? draft.excludes.filter((e): e is string => typeof e === 'string') : [],
        };
        const language = resolveDisplayLanguage();
        try {
          const scope = new DiscoverService(root).persistDeclaredScope(scopeInput);
          void vscode.window.showInformationMessage(scopeSavedMessage(scopeInput, language));
          if (msg.intent === 'scan') {
            await continueDiscoverScan(root, scope, this.extensionUri.fsPath, () => this.refresh(), 1, { resetCampaign: true });
          } else {
            this.refresh();
          }
        } catch (error) {
          void vscode.window.showWarningMessage(`AIDLC Discover: ${error instanceof Error ? error.message : String(error)}`);
        }
        return;
      }

      case 'useDiscoverScopeSaved': {
        const root = this.getRootOrWarn();
        if (!root || msg.intent !== 'scan') { return; }
        const scope = new DiscoverService(root).declaredScope();
        if (!scope) { return; }
        await continueDiscoverScan(root, scope, this.extensionUri.fsPath, () => this.refresh(), 1, { resetCampaign: true });
        return;
      }

      case 'cancelDiscoverScope':
        return;

      case 'commitDiscoverChanges': {
        const root = this.getRootOrWarn();
        if (!root) { return; }
        const service = new DiscoverService(root);
        const language = resolveDisplayLanguage();
        const prepared = prepareDiscoverCommitDialog(
          root,
          service.declaredScope(),
          service.load()?.title,
          discoverCommitCopy(language),
        );
        if (prepared === 'not-repo' || prepared === 'clean') { return; }
        void this.panel.webview.postMessage({ type: 'openDiscoverCommitModal', ...prepared });
        return;
      }

      case 'submitDiscoverCommit': {
        const root = this.getRootOrWarn();
        if (!root) { return; }
        const message = typeof msg.message === 'string' ? msg.message : '';
        if (!message.trim()) { return; }
        const service = new DiscoverService(root);
        const language = resolveDisplayLanguage();
        const ok = await executeDiscoverCommit(
          root,
          service.declaredScope(),
          message,
          discoverCommitCopy(language),
        );
        if (ok) { this.refresh(); }
        return;
      }

      case 'cancelDiscoverCommit':
        return;

      case 'agentDiscoverCommit': {
        const root = this.getRootOrWarn();
        if (!root) { return; }
        const service = new DiscoverService(root);
        const language = resolveDisplayLanguage();
        const copy = discoverCommitCopy(language);
        const prepared = prepareDiscoverCommitDialog(
          root,
          service.declaredScope(),
          service.load()?.title,
          copy,
        );
        if (prepared === 'not-repo' || prepared === 'clean') { return; }
        const dir = resolveDiscoverCommitRoot(root, service.declaredScope());
        const rel = path.relative(root, dir).split(path.sep).join('/') || '.';
        const arg = /[\s"']/.test(rel) ? `"${rel.replace(/"/g, '\\"')}"` : rel;
        runSlashCommandInProvider(`/${DISCOVER_COMMIT_COMMAND_NAME} ${arg}`, root, this.extensionUri.fsPath);
        void vscode.window.showInformationMessage(
          language === 'vi'
            ? 'AIDLC Discover: agent đang commit mọi thay đổi…'
            : 'AIDLC Discover: agent is committing every change…',
        );
        return;
      }

      case 'runDiscoverDevDocs': {
        const root = this.getRootOrWarn();
        if (!root) { return; }
        runSlashCommandInProvider(`/${DISCOVER_DEV_DOCS_COMMAND_NAME}`, root, this.extensionUri.fsPath);
        return;
      }

      case 'finishDiscoverRun':
      case 'keepDiscoverRun':
      case 'revertDiscoverRun': {
        const root = this.getRootOrWarn();
        const runId = typeof msg.runId === 'string' ? msg.runId : '';
        if (!root || !runId) { return; }
        this.handleDiscoverMutation(() => {
          const service = new DiscoverService(root);
          if (msg.type === 'finishDiscoverRun') { service.finishRun(runId); }
          if (msg.type === 'keepDiscoverRun') { service.keepRun(runId); }
          if (msg.type === 'revertDiscoverRun') { service.revertRun(runId); }
        });
        return;
      }

      case 'runDiscoverScanPass': {
        const root = this.getRootOrWarn();
        const pass = msg.pass;
        if (!root || !isScanPassId(pass)) { return; }
        const service = new DiscoverService(root);
        const scope = service.declaredScope() ?? service.effectiveScope();
        if (!scope) { return; }
        await continueDiscoverScan(root, scope, this.extensionUri.fsPath, () => this.refresh(), pass);
        return;
      }

      case 'abandonDiscoverScan': {
        const root = this.getRootOrWarn();
        if (!root) { return; }
        this.handleDiscoverMutation(() => {
          new DiscoverService(root).abandonScanCampaign();
        });
        return;
      }

      case 'revertDiscoverItems': {
        const root = this.getRootOrWarn();
        const runId = typeof msg.runId === 'string' ? msg.runId : '';
        const keys = stringList(msg.keys);
        if (!root || !runId || keys.length === 0) { return; }
        this.handleDiscoverMutation(() => {
          const result = new DiscoverService(root).revertEntries(runId, keys, { kind: 'user', id: 'vscode-user' });
          if (result.issues.length) {
            void vscode.window.showWarningMessage(`AIDLC Discover: ${result.issues.join(' · ')}`);
          }
        });
        return;
      }

      case 'keepDiscoverItems': {
        const root = this.getRootOrWarn();
        const runId = typeof msg.runId === 'string' ? msg.runId : '';
        const keys = stringList(msg.keys);
        if (!root || !runId || keys.length === 0) { return; }
        this.handleDiscoverMutation(() => {
          const result = new DiscoverService(root).keepEntries(runId, keys);
          if (result.issues.length) {
            void vscode.window.showWarningMessage(`AIDLC Discover: ${result.issues.join(' · ')}`);
          }
        });
        return;
      }

      case 'openDiscoverDoc': {
        const root = this.getRootOrWarn();
        const docPath = msg.docPath;
        if (!root || !isDiscoverDocPath(docPath)) { return; }
        const service = new DiscoverService(root);
        const target = service.docFile(docPath, service.load() ?? undefined);
        if (!fs.existsSync(target)) {
          void vscode.window.showInformationMessage(`AIDLC Discover: ${docPath} chưa tồn tại.`);
          return;
        }
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(target), { preview: false });
        return;
      }

      case 'scaffoldEpicFromSuggestion': {
        const root = this.getRootOrWarn();
        const suggestionId = typeof msg.suggestionId === 'string' ? msg.suggestionId : '';
        if (!root || !suggestionId) { return; }
        try {
          const { epicId } = scaffoldEpicFromSuggestion(root, { suggestionId });
          this.refresh();
          void vscode.window.showInformationMessage(`AIDLC Discover: đã tạo ${epicId} từ Kiểm tra.`);
          this.setView('epics');
          void this.panel.webview.postMessage({ type: 'selectEpic', epicId });
        } catch (error) {
          void vscode.window.showWarningMessage(`AIDLC Discover: ${error instanceof Error ? error.message : String(error)}`);
        }
        return;
      }

      case 'scaffoldEpicFromPhase': {
        const root = this.getRootOrWarn();
        const phaseId = typeof msg.phaseId === 'string' ? msg.phaseId : '';
        const recipeId = typeof msg.recipeId === 'string' ? msg.recipeId : '';
        if (!root || !phaseId || !DISCOVER_HANDOFF_RECIPE_IDS.includes(recipeId as (typeof DISCOVER_HANDOFF_RECIPE_IDS)[number])) { return; }
        try {
          const { epicId } = scaffoldEpicFromPhase(root, {
            phaseId,
            recipeId: recipeId as (typeof DISCOVER_HANDOFF_RECIPE_IDS)[number],
            title: typeof msg.title === 'string' ? msg.title : undefined,
          });
          this.refresh();
          void vscode.window.showInformationMessage(`AIDLC Discover: đã tạo ${epicId} từ ${phaseId}.`);
          // Hand the user over to where the work now lives.
          this.setView('epics');
          void this.panel.webview.postMessage({ type: 'selectEpic', epicId });
        } catch (error) {
          void vscode.window.showWarningMessage(`AIDLC Discover: ${error instanceof Error ? error.message : String(error)}`);
        }
        return;
      }

      case 'openDiscoverFile': {
        const root = this.getRootOrWarn();
        const rel = typeof msg.relPath === 'string' ? msg.relPath : '';
        if (!root || !rel) { return; }
        const service = new DiscoverService(root);
        const docsRoot = service.docsRoot(service.load() ?? undefined);
        const target = path.resolve(docsRoot, rel);
        // Anything the webview asks for must resolve inside docsRoot — the tab
        // lists ADRs and development docs by name, and a name is not a promise.
        if (target !== docsRoot && !target.startsWith(`${docsRoot}${path.sep}`)) { return; }
        if (!fs.existsSync(target)) {
          void vscode.window.showInformationMessage(`AIDLC Discover: ${rel} chưa tồn tại.`);
          return;
        }
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(target), { preview: false });
        return;
      }

      case 'revealDiscoverSource': {
        const root = this.getRootOrWarn();
        const rel = typeof msg.path === 'string' ? msg.path : '';
        if (!root || !rel) { return; }
        const abs = path.isAbsolute(rel) ? rel : path.resolve(root, rel);
        const relative = path.relative(root, abs);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          void vscode.window.showWarningMessage('AIDLC: source path must be inside the open workspace.');
          return;
        }
        if (!fs.existsSync(abs)) {
          void vscode.window.showWarningMessage(`Path not found: ${rel}`);
          return;
        }
        await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(abs));
        return;
      }

      case 'reloadDiscover': {
        const root = this.getRootOrWarn();
        if (root) { absorbDocChanges(root); }
        this.refresh();
        return;
      }

      case 'persistEpicsUi': {
        const raw = msg.epicsView;
        if (!raw || typeof raw !== 'object') { return; }
        const patch = raw as EpicsViewPrefs;
        void workspaceUiPrefs.patchEpicsView(patch);
        return;
      }

      case 'persistDiscoverUi': {
        const raw = msg.discoverView;
        if (!raw || typeof raw !== 'object') { return; }
        const patch = raw as DiscoverViewPrefs;
        void workspaceUiPrefs.patchDiscoverView(patch);
        return;
      }

      // ── Jira Sprint tab ───────────────────────────────────────────────────
      case 'sprintRefresh':
        await jiraSprintService.refresh({ force: msg.force === true });
        return;

      case 'sprintSetScope':
        await jiraSprintService.setScope(msg.scope === 'team' ? 'team' : 'mine');
        return;

      case 'sprintSelectSprint':
        await jiraSprintService.selectSprint(Number(msg.sprintId) || 0);
        return;

      case 'sprintSelectBoard':
        await jiraSprintService.selectBoard(Number(msg.boardId) || 0);
        return;

      case 'sprintConnectSubmit': {
        // The token arrives from the connect dialog, goes straight to
        // SecretStorage via verifyAndStoreJiraCredentials, and is never echoed
        // back, logged, or written into any state we push to the webview.
        const result = await verifyAndStoreJiraCredentials({
          site: String(msg.site ?? ''),
          email: String(msg.email ?? ''),
          apiToken: String(msg.token ?? ''),
        });
        void this.panel.webview.postMessage({ type: 'sprintConnectResult', ...result });
        if (result.ok) { await jiraSprintService.refresh({ force: true }); }
        return;
      }

      case 'sprintOpenSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', 'aidlc.jira');
        return;

      case 'sprintSetConfig': {
        // Written at Workspace scope: which project / board / JQL this repo
        // reads is a property of the repo, not of the user's machine — same
        // scope `verifyAndStoreJiraCredentials` uses for site and email.
        const config = vscode.workspace.getConfiguration('aidlc.jira');
        const target = vscode.ConfigurationTarget.Workspace;
        const patch = msg.config as Record<string, unknown> | undefined;
        if (!patch || typeof patch !== 'object') { return; }

        const strings: Array<[string, string]> = [
          ['projectKey', 'projectKey'],
          ['jql', 'jql'],
        ];
        // Clamped rather than rejected: a 0-second timeout would break every
        // call, and the dialog is not the place to argue about it.
        const numbers: Array<[string, string, number]> = [
          ['boardId', 'boardId', 0],
          ['refreshMinutes', 'refreshMinutes', 0],
          ['requestTimeoutSeconds', 'requestTimeoutSeconds', 1],
        ];
        try {
          for (const [field, setting] of strings) {
            if (typeof patch[field] === 'string') {
              await config.update(setting, String(patch[field]).trim(), target);
            }
          }
          for (const [field, setting, min] of numbers) {
            if (patch[field] === undefined) { continue; }
            const value = Number(patch[field]);
            if (!Number.isFinite(value)) { continue; }
            await config.update(setting, Math.max(min, Math.round(value)), target);
          }
          if (typeof patch.subtasksEnabled === 'boolean') {
            await config.update('subtasks.enabled', patch.subtasksEnabled, target);
          }
        } catch (err) {
          // Writing Workspace scope needs an open folder. Say so instead of
          // leaving the dialog looking like it saved.
          void vscode.window.showErrorMessage(
            `Không lưu được cấu hình Jira: ${err instanceof Error ? err.message : String(err)}`,
          );
          return;
        }
        // The config watcher in extension.ts refreshes the sprint state, which
        // is what carries the saved values back to the panel.
        return;
      }

      case 'sprintOpenLinkedTask': {
        const epicId = String(msg.epicId ?? '').trim();
        if (!epicId) { return; }
        this.setView('epics');
        void this.panel.webview.postMessage({ type: 'selectEpic', epicId });
        return;
      }

      case 'sprintPlanSubtasks': {
        const key = String(msg.key ?? '');
        try {
          await jiraSubtaskService.planAndPost(key);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          void this.panel.webview.postMessage({
            type: 'subtaskDrafts', ticketKey: key, drafts: [], notices: [], error: detail,
          });
        }
        return;
      }

      case 'sprintCreateSubtasks': {
        const key = String(msg.key ?? '');
        const domains = Array.isArray(msg.domains) ? msg.domains.map(String) : [];
        try {
          await jiraSubtaskService.createAndPost(key, domains);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          void this.panel.webview.postMessage({
            type: 'subtaskCreateResult',
            ticketKey: key,
            created: [],
            failed: [{ domain: '', message: detail }],
          });
        }
        return;
      }

      case 'sprintSetSubtasksEnabled':
        await vscode.workspace.getConfiguration('aidlc.jira')
          .update('subtasks.enabled', msg.enabled === true, vscode.ConfigurationTarget.Workspace);
        return;

      case 'sprintImportTemplate':
        await vscode.commands.executeCommand('aidlc.importJiraSubtaskTemplate');
        return;

      case 'sprintOpenIssue': {
        // The panel sends a bare issue key — it does not know the Jira site.
        const url = issueBrowseUrl(jiraCredentials.settings().site, String(msg.key ?? ''));
        if (url) { await vscode.env.openExternal(vscode.Uri.parse(url)); }
        return;
      }

      case 'sprintStartTask': {
        // Prefill only — the user still confirms in the Start-Task modal. A
        // ticket that turns into a task without a visible confirmation step is
        // how you end up with tasks nobody meant to create.
        const key = String(msg.key ?? '').trim();
        const ticket = key ? jiraSprintService.cachedTicket(key) : null;
        if (!ticket) {
          void vscode.window.showWarningMessage(
            `Không tìm thấy ticket ${key || '(rỗng)'} trong bản sprint đang có. Bấm Refresh rồi thử lại.`,
          );
          return;
        }
        this.setView('epics');
        void this.panel.webview.postMessage({
          type: 'openStartEpicModal',
          prefill: {
            epicId: ticket.key,
            title: ticket.summary,
            description: buildTicketBrief(ticket),
            inputs: { jira: ticket.key },
          },
        });
        return;
      }

      // Delegations
      case 'init': {
        const workflowId = typeof msg.workflowId === 'string' ? msg.workflowId : undefined;
        await vscode.commands.executeCommand('aidlc.initWorkspace', workflowId);
        return;
      }
      case 'applyPreset':  await vscode.commands.executeCommand('aidlc.applyPreset');   return;
      case 'ensureCofofoDefault': {
        const root = this.getRootOrWarn();
        if (!root) { return; }
        this.ensureDefaultCofofoWorkflow(root);
        this.refresh();
        return;
      }
      // GH-67: open a project folder first, then ensure project-local CoFoFo.
      case 'openProjectAndEnsureCofofo': {
        const folderPath = String(msg.folderPath ?? '').trim();
        if (!folderPath) { return; }
        const uri = vscode.Uri.file(folderPath);
        const existing = vscode.workspace.workspaceFolders ?? [];
        if (!existing.some((f) => f.uri.fsPath === uri.fsPath)) {
          vscode.workspace.updateWorkspaceFolders(existing.length, 0, { uri });
        }
        // Wait for workspace activation then materialize CoFoFo + refresh.
        setTimeout(() => {
          this.ensureDefaultCofofoWorkflow(folderPath);
          this.refresh();
        }, 300);
        return;
      }
      case 'savePreset':   await vscode.commands.executeCommand('aidlc.savePreset');    return;
      case 'startEpic':    await vscode.commands.executeCommand('aidlc.startEpic');     return;
      case 'migrateEpics':
        await vscode.commands.executeCommand('aidlc.migrateEpics');
        this.refresh();
        return;
      case 'setEpicRunMode': {
        const epicId = String(msg.epicId ?? '').trim();
        const mode = msg.mode === 'autonomous' ? 'autonomous' : msg.mode === 'guided' ? 'guided' : null;
        const root = this.getRootOrWarn();
        if (!epicId || !mode || !root) { return; }
        const doc = readYaml(root);
        if (!setEpicRunMode(root, doc, epicId, mode)) {
          void vscode.window.showWarningMessage(`Không thể đổi mode cho epic "${epicId}".`);
          return;
        }
        this.refresh();
        if (mode === 'guided') {
          void vscode.window.showInformationMessage(
            'Task sẽ dừng provider-managed execution ở checkpoint trước phase kế tiếp.',
          );
        }
        return;
      }
      case 'runTaskWithProvider': {
        const epicId = String(msg.epicId ?? '').trim();
        if (!epicId) { return; }
        try {
          await runTaskWithProviderCommand(epicId);
        } catch (error) {
          void vscode.window.showErrorMessage(
            error instanceof Error ? error.message : String(error),
          );
        }
        return;
      }
      case 'reconcileAutonomousValidators':
        await reconcileValidatorConflictsCommand();
        return;
      case 'addAgent':     await vscode.commands.executeCommand('aidlc.addAgent');      return;
      case 'addSkill':     await vscode.commands.executeCommand('aidlc.addSkill');      return;
      case 'addPipeline':  await vscode.commands.executeCommand('aidlc.addPipeline');   return;
      case 'openClaude':   await vscode.commands.executeCommand('aidlc.openAgentTerminal'); return;
      case 'openEpicsList':
        // Same-panel switch — don't re-execute the command (avoid recursion).
        this.setView('epics');
        return;
      case 'openBuilder':
        this.setView('builder');
        return;
      case 'openAnalyzeView':
        this.setView('analyze');
        return;

      case 'openTestAgentsView':
        this.setView('tests');
        return;

      case 'runTestAgent': {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) { void vscode.window.showWarningMessage('AIDLC: Open a project folder first.'); return; }
        const command = String(msg.command ?? 'run');
        const target = typeof msg.target === 'string' && msg.target ? msg.target : undefined;
        const args = [command, ...(target ? [target] : [])].join(' ');
        const term = vscode.window.createTerminal({ name: `ata ${args}`, cwd: root });
        term.show();
        term.sendText(`ata ${args}`);
        return;
      }

      case 'openTestAgentConfig': {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) { return; }
        const cfgPath = path.join(root, 'testagent.config.yaml');
        if (!fs.existsSync(cfgPath)) { void vscode.window.showWarningMessage('testagent.config.yaml not found.'); return; }
        const doc = await vscode.workspace.openTextDocument(cfgPath);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
      }

      case 'openTargetConfig': {
        const filePath = String(msg.filePath ?? '');
        if (!filePath || !fs.existsSync(filePath)) { void vscode.window.showWarningMessage('Target config file not found.'); return; }
        const tdoc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(tdoc, { preview: false });
        return;
      }

      case 'openExternalUrl': {
        const url = String(msg.url ?? '');
        if (url) { await vscode.env.openExternal(vscode.Uri.parse(url)); }
        return;
      }
      case 'openRequirementRun': {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const rId = String(msg.runId ?? '');
        if (!root || !rId) { return; }
        const runDir = path.join(root, 'docs', 'task-breakdowns', rId);
        const fileArg = String(msg.file ?? '');
        const candidates = fileArg === 'requirements'
          ? ['requirements.md', 'inputs.json']
          : ['tasks.md', 'tasks.json', 'inputs.json'];
        let target: string | undefined;
        for (const f of candidates) {
          const p = path.join(runDir, f);
          if (fs.existsSync(p)) { target = p; break; }
        }
        if (!target) { return; }
        const doc = await vscode.workspace.openTextDocument(target);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
      }
      case 'startAnalyzeRequirements': {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) { void vscode.window.showWarningMessage('AIDLC: Open a project folder first.'); return; }
        // scaffoldRequirementAnalysis imported statically at top of file
        const runId = await scaffoldRequirementAnalysis(root, this.extensionUri.fsPath, {
          source: String(msg.source ?? ''),
          platform: String(msg.platform ?? 'local'),
          parentTask: String(msg.parentTask ?? ''),
          instruction: String(msg.instruction ?? ''),
          detailLevel: msg.detailLevel === 'brief' ? 'brief' : 'detailed',
          extraProjects: Array.isArray(msg.extraProjects) ? msg.extraProjects as Array<{type:string;ref:string;label:string}> : undefined,
          businessContext: typeof msg.businessContext === 'string' ? msg.businessContext : undefined,
          itsContext: typeof msg.itsContext === 'string' ? msg.itsContext : undefined,
        });
        if (!runId) { return; }
        this.refresh();
        runSlashCommandInProvider(`/analyze-requirements ${runId}`, root, this.extensionUri.fsPath);
        return;
      }
      case 'openAddPipeline':
        // Switch to the Builder and pop its inline Add-pipeline modal. Used by
        // the Start-Epic modal's "Create new pipeline" button.
        this.setView('builder');
        void this.panel.webview.postMessage({ type: 'triggerAddPipeline' });
        return;
      case 'openProject': {
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
          openLabel: 'Open project',
        });
        if (picked && picked.length > 0) {
          await openFolder(picked[0]);
        }
        return;
      }
      case 'startEpicPickProject': {
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
          openLabel: 'Select project for epic',
          title: 'Pick the project folder where the epic will be created',
        });
        if (!picked || picked.length === 0) { return; }
        // Open folder, then auto-open Start Epic modal after workspace loads.
        await openFolder(picked[0]);
        // Signal the webview to open the Start Epic modal once the view refreshes.
        setTimeout(() => {
          void this.panel.webview.postMessage({ type: 'setView', view: 'epics' });
          void this.panel.webview.postMessage({ type: 'openStartEpicModal' });
        }, 500);
        return;
      }
      case 'loadEpicsFromFolder': {
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
          openLabel: 'Select epics folder',
          title: 'Select a folder containing epics (e.g. docs/epics from another project)',
        });
        if (!picked || picked.length === 0) { return; }
        const epicsFolder = picked[0].fsPath;
        // Walk up to find the project root (has .aidlc/workspace.yaml).
        let projectRoot: string | null = null;
        let dir = path.dirname(epicsFolder);
        for (let i = 0; i < 10; i++) {
          if (fs.existsSync(path.join(dir, WORKSPACE_DIR, WORKSPACE_FILENAME))) {
            projectRoot = dir;
            break;
          }
          const parent = path.dirname(dir);
          if (parent === dir) { break; }
          dir = parent;
        }
        if (projectRoot) {
          // Found a project — open it and set the epics dir relative to it.
          const rel = path.relative(projectRoot, epicsFolder);
          // Pre-write the epics dir so it's ready when the project opens.
          writeEpicsDirToYaml(projectRoot, rel);
          await openFolder(vscode.Uri.file(projectRoot));
        } else {
          // No project found — open the epics folder's parent as the workspace
          // and set the epics dir to point at the selected folder.
          const parent = path.dirname(epicsFolder);
          const rel = path.basename(epicsFolder);
          await openFolder(vscode.Uri.file(parent));
          // Note: the workspace.yaml may not exist yet; the setting will be
          // picked up on next activation via the VS Code setting.
          const EPICS_DIR_KEY = 'aidlc.workspace.epicsDirectory';
          void vscode.workspace.getConfiguration()
            .update(EPICS_DIR_KEY, rel, vscode.ConfigurationTarget.Workspace);
        }
        return;
      }
      case 'loadDemoProject':
        await vscode.commands.executeCommand('aidlc.loadDemoProject');
        return;
      case 'startPipelineRun':
        await vscode.commands.executeCommand('aidlc.startPipelineRun');
        return;

      // File-opening
      case 'openYaml': {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) { return; }
        const yp = path.join(root, WORKSPACE_DIR, WORKSPACE_FILENAME);
        if (!fs.existsSync(yp)) { return; }
        const doc = await vscode.workspace.openTextDocument(yp);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
      }
      case 'openPath': {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const targetPathArg = String(msg.path ?? '');
        if (!root || !targetPathArg) { return; }
        const abs = path.isAbsolute(targetPathArg)
          ? targetPathArg
          : path.resolve(root, targetPathArg);
        const relative = path.relative(root, abs);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          void vscode.window.showWarningMessage('AIDLC: source path must be inside the open workspace.');
          return;
        }
        if (!fs.existsSync(abs)) {
          void vscode.window.showWarningMessage(`Path not found: ${targetPathArg}`);
          return;
        }
        const stat = fs.statSync(abs);
        if (stat.isDirectory()) {
          await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(abs));
          return;
        }
        const doc = await vscode.workspace.openTextDocument(abs);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
      }
      case 'openSkill':
      case 'openAgent': {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const targetPathArg = String(msg.filePath ?? msg.path ?? '');
        if (!targetPathArg) { return; }
        const abs = path.isAbsolute(targetPathArg)
          ? targetPathArg
          : (root ? path.resolve(root, targetPathArg) : targetPathArg);
        if (!fs.existsSync(abs)) {
          void vscode.window.showWarningMessage(`File not found: ${targetPathArg}`);
          return;
        }
        const doc = await vscode.workspace.openTextDocument(abs);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
      }
      case 'openEpicState': {
        const statePath = String(msg.path ?? '');
        if (!statePath || !fs.existsSync(statePath)) { return; }
        const doc = await vscode.workspace.openTextDocument(statePath);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
      }
      case 'openInputsJson': {
        const epicDir = String(msg.epicDir ?? '');
        if (!epicDir) { return; }
        const p = path.join(epicDir, 'inputs.json');
        if (!fs.existsSync(p)) { return; }
        const doc = await vscode.workspace.openTextDocument(p);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
      }
      case 'revealArtifacts': {
        const epicDir = String(msg.epicDir ?? '');
        if (!epicDir) { return; }
        // Prefer an existing produced file's parent (covers outputs
        // under docs/project/context/); else the conventional artifacts/.
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        let revealDir = path.join(epicDir, 'artifacts');
        if (root) {
          try {
            const epic = listEpics(root, readYaml(root)).find((e) => e.epicDir === epicDir);
            const firstPath = epic?.existingArtifacts
              ?.map((name) => epic.artifactPaths?.[name])
              .find((p): p is string => !!p && fs.existsSync(p));
            if (firstPath) { revealDir = path.dirname(firstPath); }
          } catch { /* keep default */ }
        }
        if (!fs.existsSync(revealDir)) { return; }
        await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(revealDir));
        return;
      }
      case 'openArtifactFile': {
        const epicDir = String(msg.epicDir ?? '');
        const filename = String(msg.filename ?? '');
        if (!epicDir || !filename) { return; }
        const filePath = this.resolveArtifactAbsPath(epicDir, filename);
        if (!filePath) { return; }
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc, { preview: false });
        return;
      }
      case 'viewArtifact': {
        // Read-only preview: open the .md in annotron so diagrams render
        // (annotron renders Markdown itself), without the /annotate-artifact
        // feedback loop. See viewArtifactInAnnotron.
        const epicDir = String(msg.epicDir ?? '');
        const filename = String(msg.filename ?? '');
        if (!epicDir || !filename) { return; }
        this.viewArtifactInAnnotron(epicDir, filename);
        return;
      }
      case 'annotateArtifact': {
        const epicDir = String(msg.epicDir ?? '');
        const filename = String(msg.filename ?? '');
        if (!epicDir || !filename) { return; }
        this.annotateArtifact(epicDir, filename);
        return;
      }
      case 'openEpicMemory': {
        const epicDir = String(msg.epicDir ?? '');
        if (!epicDir) { return; }
        await this.openEpicMemory(epicDir);
        return;
      }
      case 'changeEpicsDir': {
        const newDir = String(msg.dir ?? '').trim();
        if (!newDir) { return; }
        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!wsRoot) { return; }
        writeEpicsDirToYaml(wsRoot, newDir);
        // Also update the VS Code setting so the bidirectional sync stays consistent.
        const EPICS_DIR_KEY = 'aidlc.workspace.epicsDirectory';
        void vscode.workspace.getConfiguration()
          .update(EPICS_DIR_KEY, newDir, vscode.ConfigurationTarget.Workspace);
        this.refresh();
        return;
      }
      case 'browseEpicsDir': {
        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!wsRoot) { return; }
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
          defaultUri: vscode.Uri.file(wsRoot),
          openLabel: 'Select epics directory',
        });
        if (!picked || picked.length === 0) { return; }
        const abs = picked[0].fsPath;
        // Use relative path when inside the workspace, absolute otherwise.
        const rel = path.relative(wsRoot, abs);
        const dir = rel.startsWith('..') || path.isAbsolute(rel) ? abs : rel;
        writeEpicsDirToYaml(wsRoot, dir);
        const EPICS_DIR_KEY = 'aidlc.workspace.epicsDirectory';
        void vscode.workspace.getConfiguration()
          .update(EPICS_DIR_KEY, dir, vscode.ConfigurationTarget.Workspace);
        this.refresh();
        return;
      }
      case 'toggleEpicMemoryHook': {
        const enabled = msg.enabled === true;
        // Enabling needs the hook script present under ~/.claude/tools.
        if (enabled) {
          try { installAnnotationTools(this.extensionUri.fsPath); } catch { /* best-effort */ }
        }
        const r = setEpicMemoryHook(enabled, os.homedir());
        void vscode.window.showInformationMessage(
          enabled
            ? 'Epic-memory hook enabled — prompts that mention an epic auto-load its memory.'
            : 'Epic-memory hook disabled.',
        );
        void r;
        this.refresh();
        return;
      }
      case 'copyCommand': {
        const cmd = String(msg.command ?? '');
        if (!cmd) { return; }
        await vscode.env.clipboard.writeText(cmd);
        void vscode.window.setStatusBarMessage(`Copied ${cmd} to clipboard`, 2000);
        return;
      }
      case 'openTemplateGuide': {
        const id = String(msg.id ?? '');
        if (!id) { return; }
        const { openTemplateGuide } = await import('./openGuides');
        await openTemplateGuide(this.extensionUri.fsPath, id);
        return;
      }
      case 'openStepHelp': {
        const pipelineId = String(msg.pipelineId ?? '');
        const stepName = String(msg.stepName ?? '');
        if (!pipelineId || !stepName) { return; }
        const { openStepHelp } = await import('./openGuides');
        await openStepHelp(pipelineId, stepName);
        return;
      }

      // Pipeline-run state machine
      case 'markStepDone':
      case 'skipStep':
      case 'runAutoReview':
      case 'reviewCanvasStep':
      case 'approveStep':
      case 'rejectStep':
      case 'rerunStep':
      case 'verifyRun':
      case 'runReport':
      case 'openRunState': {
        const runId = String(msg.runId ?? '');
        const cmd = `aidlc.${msg.type}`;
        const stepIdx = typeof msg.stepIdx === 'number' && Number.isInteger(msg.stepIdx)
          ? msg.stepIdx
          : undefined;
        await vscode.commands.executeCommand(cmd, runId || undefined, stepIdx);
        return;
      }
      case 'deleteRun': {
        const runId = String(msg.runId ?? '');
        // confirmed: webview already showed an inline ConfirmModal, skip the
        // VS Code warning dialog. Falsy for command-palette invocations.
        await vscode.commands.executeCommand(
          'aidlc.deleteRun',
          runId || undefined,
          msg.confirmed === true,
        );
        return;
      }
      case 'deleteEpic': {
        const epicId = String(msg.epicId ?? '');
        if (!epicId) { return; }
        const runId = typeof msg.runId === 'string' && msg.runId ? msg.runId : undefined;
        // confirmed: DeleteEpicModal already gated this (checkbox + type-to-
        // confirm), so skip the host warning dialog.
        await vscode.commands.executeCommand(
          'aidlc.deleteEpic',
          epicId,
          runId,
          msg.deleteFolder === true,
          msg.confirmed === true,
        );
        return;
      }
      case 'rejectStepInline': {
        const runId = String(msg.runId ?? '');
        const reason = String(msg.reason ?? '');
        const targetIdx = Number(msg.targetIdx);
        const stepIdx = typeof msg.stepIdx === 'number' && Number.isInteger(msg.stepIdx)
          ? msg.stepIdx
          : undefined;
        if (!runId || !Number.isInteger(targetIdx)) { return; }
        await rejectStepInlineCommand(runId, reason, targetIdx, stepIdx);
        return;
      }
      case 'startRunInline': {
        const pipelineId = String(msg.pipelineId ?? '');
        const runId = String(msg.runId ?? '');
        if (!pipelineId || !runId) { return; }
        if (isCofofoPipelineId(pipelineId)) {
          const root = this.getRootOrWarn();
          if (!root) { return; }
          this.ensureDefaultCofofoWorkflow(root);
        }
        await startPipelineRunInlineCommand(pipelineId, runId);
        return;
      }
      case 'addPipelineInline': {
        const draft = msg.draft;
        if (!draft || typeof draft !== 'object') { return; }
        await this.addPipelineInline(draft as Record<string, unknown>);
        return;
      }
      case 'loadDefaultPipelineAssets': {
        const root = this.getRootOrWarn();
        if (!root) { return; }
        this.ensureDefaultCofofoWorkflow(root);
        this.refresh();
        return;
      }
      case 'editPipelineInline': {
        const id = String(msg.id ?? '');
        const draft = msg.draft;
        if (!id || !draft || typeof draft !== 'object') { return; }
        await this.editPipelineInline(id, draft as Record<string, unknown>);
        return;
      }
      case 'addSkillInline': {
        const draft = msg.draft;
        if (!draft || typeof draft !== 'object') { return; }
        await this.addSkillInline(draft as Record<string, unknown>);
        return;
      }
      case 'addAgentInline': {
        const draft = msg.draft;
        if (!draft || typeof draft !== 'object') { return; }
        await this.addAgentInline(draft as Record<string, unknown>);
        return;
      }
      case 'editAgentInline': {
        const draft = msg.draft;
        if (!draft || typeof draft !== 'object') { return; }
        await this.editAgentInline(draft as Record<string, unknown>);
        return;
      }
      case 'startEpicInline': {
        const draft = msg.draft;
        if (!draft || typeof draft !== 'object') { return; }
        await this.startEpicInline(draft as Record<string, unknown>);
        return;
      }
      case 'classifyBrief': {
        // Webview asks the host to classify a requirement into a recipe (the
        // classifier lives in @aidlc/core, which the webview can't bundle).
        void this.classifyBriefForWebview(String(msg.brief ?? ''));
        return;
      }
      case 'loadRequirement': {
        // Fetch a requirement from an external source (Jira / GitHub / Drive /
        // URL) via the `claude` CLI's MCP integrations.
        void this.loadRequirementForWebview(String(msg.source ?? ''), String(msg.ref ?? ''));
        return;
      }
      case 'rerunStepInline': {
        const runId = String(msg.runId ?? '');
        const feedback = String(msg.feedback ?? '');
        const stepIdx = typeof msg.stepIdx === 'number' && Number.isInteger(msg.stepIdx)
          ? msg.stepIdx
          : undefined;
        if (!runId) { return; }
        await rerunStepInlineCommand(runId, feedback, stepIdx);
        return;
      }
      case 'rerunAndRunWithClaude': {
        const runId = String(msg.runId ?? '');
        const slash = String(msg.slashCommand ?? '');
        const feedback = String(msg.feedback ?? '');
        const stepIdx = typeof msg.stepIdx === 'number' && Number.isInteger(msg.stepIdx)
          ? msg.stepIdx
          : undefined;
        if (!runId || !slash || stepIdx === undefined) { return; }
        await rerunStepInlineCommand(runId, feedback, stepIdx);
        await vscode.commands.executeCommand('aidlc.runStepWithFeedback', slash, runId, feedback);
        return;
      }
      case 'runStepWithFeedback': {
        const slash = String(msg.slashCommand ?? '');
        const runId = String(msg.runId ?? '');
        const feedback = String(msg.feedback ?? '');
        if (!slash || !runId) { return; }
        await vscode.commands.executeCommand(
          'aidlc.runStepWithFeedback',
          slash,
          runId,
          feedback,
        );
        return;
      }
      case 'requestStepUpdate': {
        const runId = String(msg.runId ?? '');
        const stepIdx = Number(msg.stepIdx);
        const feedback = String(msg.feedback ?? '');
        if (!runId || !Number.isInteger(stepIdx)) { return; }
        await requestStepUpdateInlineCommand(runId, stepIdx, feedback);
        return;
      }
      case 'reportCofofoBug': {
        const runId = typeof msg.runId === 'string' ? msg.runId : undefined;
        const fields = msg.fields && typeof msg.fields === 'object' ? msg.fields : undefined;
        await vscode.commands.executeCommand('aidlc.reportCofofoBug', runId, fields);
        return;
      }
      case 'cofofoDoctor':
        await vscode.commands.executeCommand('aidlc.cofofoDoctor');
        return;
      case 'savePresetInline': {
        const draft = msg.draft;
        if (!draft || typeof draft !== 'object') { return; }
        await vscode.commands.executeCommand('aidlc.savePresetInline', draft);
        return;
      }
      case 'pickAndReadFile': {
        const requestId = String(msg.requestId ?? '');
        if (!requestId) { return; }
        const reply = await pickAndReadTextFile(requestId);
        void this.panel.webview.postMessage({ type: 'pickAndReadFile:reply', ...reply });
        return;
      }
      case 'pickBugImages': {
        const requestId = String(msg.requestId ?? '');
        const runId = String(msg.runId ?? '');
        const remaining = typeof msg.remaining === 'number' ? msg.remaining : undefined;
        if (!requestId || !runId) { return; }
        const root = this.getRootOrWarn();
        if (!root) { return; }
        const reply = await pickBugImages({ requestId, root, runId, remaining });
        void this.panel.webview.postMessage({ type: 'pickBugImages:reply', ...reply });
        return;
      }
      case 'savePastedBugImage': {
        const requestId = String(msg.requestId ?? '');
        const runId = String(msg.runId ?? '');
        if (!requestId || !runId) { return; }
        const root = this.getRootOrWarn();
        if (!root) { return; }
        const reply = await savePastedBugImage({
          requestId,
          root,
          runId,
          fileName: String(msg.fileName ?? 'paste.png'),
          mime: String(msg.mime ?? 'image/png'),
          base64: String(msg.base64 ?? ''),
        });
        void this.panel.webview.postMessage({ type: 'savePastedBugImage:reply', ...reply });
        return;
      }
      case 'pickFolder': {
        const requestId = String(msg.requestId ?? '');
        if (!requestId) { return; }
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
          openLabel: 'Select project folder',
        });
        const folderPath = picked && picked.length > 0 ? picked[0].fsPath : null;
        void this.panel.webview.postMessage({ type: 'pickFolder:reply', requestId, folderPath });
        return;
      }
      case 'pickChildRepoFolders': {
        const requestId = String(msg.requestId ?? '');
        if (!requestId) { return; }
        const root = this.getRootOrWarn();
        if (!root) {
          void this.panel.webview.postMessage({ type: 'pickChildRepoFolders:reply', requestId, cancelled: true, folders: [] });
          return;
        }
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: true,
          defaultUri: vscode.Uri.file(root),
          openLabel: 'Pick child repo folders',
          title: 'Pick child repo folders',
        });
        if (!picked || picked.length === 0) {
          void this.panel.webview.postMessage({ type: 'pickChildRepoFolders:reply', requestId, cancelled: true, folders: [] });
          return;
        }
        const folders = picked.map((uri) => {
          const relative = path.relative(root, uri.fsPath).split(path.sep).join('/');
          return {
            path: relative === '' ? '.' : relative,
            name: path.basename(uri.fsPath),
          };
        });
        void this.panel.webview.postMessage({ type: 'pickChildRepoFolders:reply', requestId, folders });
        return;
      }
      // GH-67: add a local folder to VS Code's multi-root workspace.
      case 'addProjectToWorkspace': {
        const folderPath = String(msg.folderPath ?? '').trim();
        if (!folderPath) { return; }
        const uri = vscode.Uri.file(folderPath);
        const existing = (vscode.workspace.workspaceFolders ?? []);
        const alreadyOpen = existing.some((f) => f.uri.fsPath === uri.fsPath);
        if (!alreadyOpen) {
          vscode.workspace.updateWorkspaceFolders(existing.length, 0, { uri });
        }
        return;
      }
      // GH-67: clone a GitHub repo into a sibling folder, then add to workspace.
      case 'cloneGithubProject': {
        const ref = String(msg.ref ?? '').trim();
        if (!ref) { return; }
        const root = this.getRootOrWarn();
        if (!root) { return; }
        try {
          const repoName = ref.split('/').pop() ?? ref;
          const parentDir = require('path').dirname(root);
          const cloneTarget = require('path').join(parentDir, repoName);
          const fs = require('fs');
          if (fs.existsSync(cloneTarget)) {
            // Already cloned — just add to workspace.
            const uri = vscode.Uri.file(cloneTarget);
            const existing = (vscode.workspace.workspaceFolders ?? []);
            if (!existing.some((f) => f.uri.fsPath === uri.fsPath)) {
              vscode.workspace.updateWorkspaceFolders(existing.length, 0, { uri });
            }
            void this.panel.webview.postMessage({
              type: 'cloneGithubProject:done', ref, localPath: cloneTarget,
            });
            return;
          }
          const cp = require('child_process');
          cp.execSync(`git clone https://github.com/${ref}.git "${cloneTarget}"`, {
            stdio: 'pipe', timeout: 120_000,
          });
          const uri = vscode.Uri.file(cloneTarget);
          const existing = (vscode.workspace.workspaceFolders ?? []);
          if (!existing.some((f) => f.uri.fsPath === uri.fsPath)) {
            vscode.workspace.updateWorkspaceFolders(existing.length, 0, { uri });
          }
          void this.panel.webview.postMessage({
            type: 'cloneGithubProject:done', ref, localPath: cloneTarget,
          });
        } catch (err) {
          void this.panel.webview.postMessage({
            type: 'cloneGithubProject:error', ref,
            message: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }
      case 'startPipelineRunForEpic': {
        const epicId = String(msg.epicId ?? '').trim();
        const pipelineId = String(msg.pipelineId ?? '').trim();
        if (!epicId || !pipelineId) { return; }
        await this.startPipelineRunForEpic(epicId, pipelineId);
        return;
      }
      case 'refreshEpics':
        this.refresh();
        return;

      // Pipeline / asset mutations
      case 'reorderStep':
        await this.reorderStep(
          String(msg.pipelineId ?? ''),
          Number(msg.fromIdx ?? -1),
          Number(msg.toIdx ?? -1),
        );
        return;
      case 'addStepToPipeline': {
        const pipelineId = String(msg.pipelineId ?? '');
        const agentId = typeof msg.agentId === 'string' ? msg.agentId : undefined;
        const stepName = typeof msg.stepName === 'string' ? msg.stepName : undefined;
        await this.addStepToPipeline(pipelineId, agentId, stepName);
        return;
      }
      case 'addParallelStep': {
        const pipelineId = String(msg.pipelineId ?? '');
        const agentId = typeof msg.agentId === 'string' ? msg.agentId : undefined;
        const stepName = typeof msg.stepName === 'string' ? msg.stepName : undefined;
        const parallelToAgent =
          typeof msg.parallelToAgent === 'string' ? msg.parallelToAgent : '';
        if (!pipelineId || !agentId || !parallelToAgent) { return; }
        await this.addParallelStep(pipelineId, parallelToAgent, agentId, stepName);
        return;
      }
      case 'deleteStep':
        await this.deleteStep(String(msg.pipelineId ?? ''), Number(msg.idx ?? -1));
        return;
      case 'editStepConfig': {
        const inlineConfig =
          msg.config && typeof msg.config === 'object'
            ? (msg.config as Record<string, unknown>)
            : undefined;
        await this.editStepConfig(
          String(msg.pipelineId ?? ''),
          Number(msg.idx ?? -1),
          inlineConfig,
        );
        return;
      }
      case 'deleteAgent':
        await this.deleteItem('agents', String(msg.id ?? ''), msg.confirmed === true);
        return;
      case 'deleteSkill':
        await this.deleteItem('skills', String(msg.id ?? ''), msg.confirmed === true);
        return;
      case 'deletePipeline':
        await this.deletePipeline(String(msg.id ?? ''), msg.confirmed === true);
        return;
      case 'renameAgent':
        await this.renameItem(
          'agents',
          String(msg.id ?? ''),
          typeof msg.newId === 'string' ? msg.newId : undefined,
        );
        return;
      case 'renameSkill':
        await this.renameItem(
          'skills',
          String(msg.id ?? ''),
          typeof msg.newId === 'string' ? msg.newId : undefined,
        );
        return;
      case 'renamePipeline':
        await this.renameItem(
          'pipelines',
          String(msg.id ?? ''),
          typeof msg.newId === 'string' ? msg.newId : undefined,
        );
        return;
      case 'duplicateAgent': await this.duplicateItem('agents', String(msg.id ?? '')); return;
      case 'duplicateSkill': await this.duplicateItem('skills', String(msg.id ?? '')); return;
      case 'duplicatePipeline': await this.duplicateItem('pipelines', String(msg.id ?? '')); return;
      case 'togglePipelineFailure':
        await this.togglePipelineFailure(String(msg.pipelineId ?? ''));
        return;
      case 'runPipeline':
        await vscode.commands.executeCommand(
          'aidlc.startPipelineRun',
          String(msg.pipelineId ?? ''),
        );
        return;
      case 'agentMenu': {
        // Simple action picker — replaces the kebab menu in the React card.
        const id = String(msg.id ?? '');
        const filePath = String(msg.filePath ?? '');
        if (!id) { return; }
        const pick = await vscode.window.showQuickPick(
          [
            { label: 'Open file', value: 'open', detail: filePath },
            { label: 'Rename', value: 'rename' },
            { label: 'Duplicate', value: 'duplicate' },
            { label: 'Delete', value: 'delete' },
          ],
          { placeHolder: `Agent ${id}` },
        );
        if (!pick) { return; }
        if (pick.value === 'open' && filePath) {
          const doc = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(doc, { preview: false });
        } else if (pick.value === 'rename') {
          await this.renameItem('agents', id);
        } else if (pick.value === 'duplicate') {
          await this.duplicateItem('agents', id);
        } else if (pick.value === 'delete') {
          await this.deleteItem('agents', id);
        }
        return;
      }
    }
  }

  // ── Mutation helpers ────────────────────────────────────────────────────

  private getRootOrWarn(): string | undefined {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) { void vscode.window.showWarningMessage('AIDLC: no folder open.'); }
    return root;
  }

  private mutateYaml(fn: (doc: YamlDocument) => boolean | void): void {
    const root = this.getRootOrWarn();
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) {
      void vscode.window.showWarningMessage('AIDLC: no workspace.yaml — initialize first.');
      return;
    }
    const dirty = fn(doc);
    if (dirty !== false) {
      writeYaml(root, doc);
      this.refresh();
    }
  }

  private async reorderStep(pipelineId: string, fromIdx: number, toIdx: number): Promise<void> {
    if (!pipelineId || fromIdx < 0 || toIdx < 0) { return; }
    this.mutateYaml((doc) => {
      const p = doc.pipelines.find((x) => x.id === pipelineId);
      if (!p || !Array.isArray(p.steps)) { return false; }
      const steps = p.steps as PipelineStepConfig[];
      if (fromIdx >= steps.length || toIdx >= steps.length) { return false; }
      const [moved] = steps.splice(fromIdx, 1);
      steps.splice(toIdx, 0, moved);
    });
  }

  private async deleteStep(pipelineId: string, idx: number): Promise<void> {
    if (!pipelineId || idx < 0) { return; }
    this.mutateYaml((doc) => {
      const p = doc.pipelines.find((x) => x.id === pipelineId);
      if (!p || !Array.isArray(p.steps)) { return false; }
      const steps = p.steps as PipelineStepConfig[];
      if (idx >= steps.length) { return false; }

      // Capture the deleted step's agent + its own deps before splicing so
      // we can rewire any child step's `depends_on`. The goal: preserve the
      // visual DAG layout — children of the removed step should stay at the
      // same column they were in before deletion. Achieve that by picking a
      // "sibling" of the deleted step (a step with the *same* dependency
      // set), so the child ends up at the same level. Fall back to the
      // deleted step's own deps when no sibling exists.
      const removed = steps[idx];
      const stepAgent = (s: PipelineStepConfig): string =>
        typeof s === 'string'
          ? s
          : typeof (s as { agent?: unknown }).agent === 'string'
            ? (s as { agent: string }).agent
            : '';
      const stepDeps = (s: PipelineStepConfig): string[] => {
        if (typeof s === 'string') { return []; }
        const d = (s as { depends_on?: unknown }).depends_on;
        return Array.isArray(d) ? d.map(String) : [];
      };
      const removedAgent = stepAgent(removed);
      const removedDeps = stepDeps(removed);

      steps.splice(idx, 1);
      if (!removedAgent) { return; }

      const setsEqual = (a: string[], b: string[]): boolean => {
        if (a.length !== b.length) { return false; }
        const sa = new Set(a);
        for (const x of b) { if (!sa.has(x)) { return false; } }
        return true;
      };
      const siblings = steps
        .filter((s) => setsEqual(stepDeps(s), removedDeps))
        .map(stepAgent)
        .filter((a) => a && a !== removedAgent);
      const replacement = siblings.length > 0 ? siblings.slice(0, 1) : removedDeps;

      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (typeof s === 'string') { continue; }
        const obj = s as { depends_on?: unknown };
        const deps = Array.isArray(obj.depends_on) ? obj.depends_on.map(String) : [];
        if (!deps.includes(removedAgent)) { continue; }
        const rewired = Array.from(new Set(
          deps.flatMap((d) => (d === removedAgent ? replacement : [d])),
        ));
        if (rewired.length > 0) {
          obj.depends_on = rewired;
        } else {
          delete obj.depends_on;
        }
      }
    });
  }

  private async editStepConfig(
    pipelineId: string,
    idx: number,
    /** Webview already collected the new config via inline StepConfigModal —
     * apply it directly and skip promptStepConfig's QuickPick chain. */
    inlineConfig?: Record<string, unknown>,
  ): Promise<void> {
    if (!pipelineId || idx < 0) { return; }
    const root = this.getRootOrWarn();
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) { return; }
    const pipeline = doc.pipelines.find((x) => x.id === pipelineId);
    if (!pipeline || !Array.isArray(pipeline.steps) || idx >= pipeline.steps.length) {
      void vscode.window.showWarningMessage(`Step #${idx + 1} not found in \`${pipelineId}\`.`);
      return;
    }
    const raw = pipeline.steps[idx] as PipelineStepConfig;
    const norm = normalizeStep(raw);
    let draft: PipelineStepConfigDraft;
    // `inlineSkills` is `undefined` when the QuickPick path runs (it doesn't
    // touch skills), and the existing step.skills get preserved via prevObj.
    // An empty array from the inline path means "clear all skills".
    let inlineSkills: string[] | undefined;
    // `depends_on` edited via the modal's "Runs after" picker. Undefined on the
    // QuickPick path → preserve the existing edges; an array (incl. empty)
    // replaces them, letting the user reposition or root a node.
    let inlineDeps: string[] | undefined;
    if (inlineConfig) {
      const requires = Array.isArray(inlineConfig.requires)
        ? (inlineConfig.requires as unknown[]).map(String)
        : [];
      const produces = Array.isArray(inlineConfig.produces)
        ? (inlineConfig.produces as unknown[]).map(String)
        : [];
      if (Array.isArray(inlineConfig.skills)) {
        inlineSkills = (inlineConfig.skills as unknown[]).map(String).filter((s) => s.length > 0);
      }
      if (Array.isArray(inlineConfig.depends_on)) {
        inlineDeps = (inlineConfig.depends_on as unknown[]).map(String).filter((s) => s.length > 0);
      }
      const runnerRaw = inlineConfig.auto_review_runner;
      draft = {
        agent: norm.agent,
        enabled: inlineConfig.enabled === true,
        requires,
        produces,
        human_review: inlineConfig.human_review === true,
        auto_review: inlineConfig.auto_review === true,
        auto_review_runner:
          inlineConfig.auto_review === true && typeof runnerRaw === 'string' && runnerRaw.trim()
            ? runnerRaw.trim()
            : undefined,
      };
    } else {
      const result = await promptStepConfig(norm.agent, {
        enabled: norm.enabled,
        requires: norm.requires,
        produces: norm.produces,
        human_review: norm.human_review,
        auto_review: norm.auto_review,
        auto_review_runner: norm.auto_review_runner,
      });
      if (!result) { return; }
      draft = result;
    }
    this.mutateYaml((d) => {
      const p = d.pipelines.find((x) => x.id === pipelineId);
      if (!p || !Array.isArray(p.steps) || idx >= p.steps.length) { return false; }
      // Preserve `depends_on` (and any other untouched fields like
      // `name`) on the existing step — the config modal manages gate
      // flags + artifact paths only. Rebuilding the step object from
      // scratch wipes DAG edges and collapses the visual layout.
      const prev = p.steps[idx];
      const prevObj: Record<string, unknown> =
        typeof prev === 'object' && prev !== null ? { ...(prev as Record<string, unknown>) } : {};
      const obj: Record<string, unknown> = {
        ...prevObj,
        agent: draft.agent,
        enabled: draft.enabled,
        requires: draft.requires,
        produces: draft.produces,
        human_review: draft.human_review,
        auto_review: draft.auto_review,
      };
      if (draft.auto_review && draft.auto_review_runner) {
        obj.auto_review_runner = draft.auto_review_runner;
      } else {
        delete obj.auto_review_runner;
      }
      // `inlineSkills` is set only on the inline edit path — preserve
      // `step.skills` from `prevObj` when QuickPick (no skills field) was used.
      if (inlineSkills !== undefined) {
        if (inlineSkills.length > 0) {
          obj.skills = inlineSkills;
          delete obj.skill;
        } else {
          delete obj.skills;
          delete obj.skill;
        }
      }
      // Same for `depends_on` — the inline modal sends the full edge set;
      // an empty array roots the step (drops it to the first column).
      if (inlineDeps !== undefined) {
        if (inlineDeps.length > 0) {
          obj.depends_on = inlineDeps;
        } else {
          delete obj.depends_on;
        }
      }
      // Gate fields from the inline modal. Only applied on the inline path;
      // the QuickPick path leaves the existing values (preserved via prevObj).
      if (inlineConfig) {
        const pc = Array.isArray(inlineConfig.produces_contains)
          ? (inlineConfig.produces_contains as unknown[]).map(String).filter((s) => s.length > 0)
          : [];
        if (pc.length > 0) { obj.produces_contains = pc; } else { delete obj.produces_contains; }

        const t = inlineConfig.auto_review_timeout_ms;
        if (draft.auto_review && typeof t === 'number' && Number.isFinite(t) && t > 0) {
          obj.auto_review_timeout_ms = Math.floor(t);
        } else {
          delete obj.auto_review_timeout_ms;
        }
      }
      p.steps[idx] = obj as unknown as PipelineStepConfig;
    });
  }

  /**
   * Apply the AddSkillModal draft: write the .md file at the scope-target
   * path and (for aidlc) register it in workspace.yaml. No overwrite — if
   * the file already exists we surface a warning and abort. Webview's
   * `takenIds` should prevent collisions in normal use.
   */
  private async addSkillInline(draft: Record<string, unknown>): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) {
      void vscode.window.showWarningMessage('AIDLC: no workspace.yaml — initialize first.');
      return;
    }

    const scope = draft.scope as AssetScope;
    const id = String(draft.id ?? '').trim();
    const sourceRaw = draft.source as Record<string, unknown> | undefined;
    if (!id || !sourceRaw) { return; }
    if (scope !== 'project' && scope !== 'aidlc' && scope !== 'global') { return; }

    let content = '';
    let openInEditor = false;
    const kind = String(sourceRaw.kind ?? '');
    if (kind === 'template') {
      const tplId = String(sourceRaw.templateId ?? '');
      const tpl = SKILL_TEMPLATES.find((t) => t.id === tplId);
      if (!tpl) {
        void vscode.window.showWarningMessage(`Skill template "${tplId}" not found.`);
        return;
      }
      content = tpl.content;
    } else if (kind === 'paste') {
      content = String(sourceRaw.content ?? '');
      if (!content.trim()) { return; }
    } else if (kind === 'blank') {
      content = `# ${id}\n\n<!-- Write the system prompt for this skill here. -->\n`;
      openInEditor = true;
    } else {
      return;
    }

    const skillPath = targetPath(root, scope, 'skill', id);
    if (fs.existsSync(skillPath)) {
      void vscode.window.showWarningMessage(
        `Skill file already exists at ${path.relative(root, skillPath) || skillPath}. Delete it first.`,
      );
      return;
    }
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, content, 'utf8');

    if (scope === 'aidlc') {
      this.mutateYaml((d) => {
        d.skills.push({ id, path: `./.aidlc/skills/${id}.md` });
      });
    }

    if (openInEditor || kind === 'template') {
      const docOpen = await vscode.workspace.openTextDocument(skillPath);
      await vscode.window.showTextDocument(docOpen, { preview: false });
    }

    const yamlNote = scope === 'aidlc' ? ' + workspace.yaml' : '';
    const action = await vscode.window.showInformationMessage(
      `Skill "${id}" added (${scope})${yamlNote}. Reload VS Code to see it in the Agents/Skills tabs.`,
      'Reload',
    );
    if (action === 'Reload') {
      void vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }

  /**
   * Apply the AddAgentModal draft. AIDLC scope appends to workspace.yaml
   * `agents:`. Project / global scopes write a Claude Code-native .md file
   * with frontmatter + the picked skills inlined as a starter prompt.
   */
  private async addAgentInline(draft: Record<string, unknown>): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) {
      void vscode.window.showWarningMessage('AIDLC: no workspace.yaml — initialize first.');
      return;
    }

    const scope = draft.scope as AssetScope;
    const id = String(draft.id ?? '').trim();
    const name = String(draft.name ?? '').trim();
    const skillsRaw = Array.isArray(draft.skills) ? (draft.skills as unknown[]) : [];
    const skills = skillsRaw.map(String).filter((s) => s);
    if (!id || !name) { return; }
    if (scope !== 'project' && scope !== 'aidlc' && scope !== 'global') { return; }

    // AIDLC agents store skills in workspace.yaml, so they must be declared there.
    // Project/global agents store skills in the agent file's frontmatter — no workspace.yaml check needed.
    if (scope === 'aidlc') {
      const yamlSkillIds = new Set(doc.skills.map((s) => String(s.id)));
      for (const s of skills) {
        if (!yamlSkillIds.has(s)) {
          void vscode.window.showWarningMessage(
            `Skill "${s}" not declared in workspace.yaml.`,
          );
          return;
        }
      }
    }

    // Common fields surfaced by the modal across every scope.
    const model = String(draft.model ?? '').trim();
    const description = String(draft.description ?? '').trim();
    const capsRaw = Array.isArray(draft.capabilities) ? (draft.capabilities as unknown[]) : [];
    const capabilities = capsRaw.map(String).filter((c) => c);

    if (scope === 'aidlc') {
      if (!model) { return; }
      const envObj = draft.env && typeof draft.env === 'object'
        ? (draft.env as Record<string, unknown>)
        : {};
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(envObj)) { env[k] = String(v); }

      const agent: Record<string, unknown> = { id, name, skills, model };
      if (description) { agent.description = description; }
      if (Object.keys(env).length > 0) { agent.env = env; }
      if (capabilities.length > 0) { agent.capabilities = capabilities; }

      this.mutateYaml((d) => {
        d.agents.push(agent);
      });

      const action = await vscode.window.showInformationMessage(
        `Agent "${id}" added (aidlc · skills: ${skills.join(', ')}, model: ${model}). Reload VS Code to see it in the Agents tab.`,
        'Reload',
      );
      if (action === 'Reload') {
        void vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
      return;
    }

    // project / global: write Claude-native .md. Frontmatter now carries
    // the same fields surfaced in the modal — model + tools (capabilities)
    // — so the user's choices flow through into Claude Code's native
    // agent format instead of being silently dropped.
    const effectiveDescription = description || `${name} agent.`;
    const agentPath = targetPath(root, scope, 'agent', id);
    if (fs.existsSync(agentPath)) {
      void vscode.window.showWarningMessage(
        `Agent file already exists at ${path.relative(root, agentPath) || agentPath}. Delete it first.`,
      );
      return;
    }

    const sections: string[] = [];
    for (const skillId of skills) {
      sections.push(`<!-- ── Skill: ${skillId} ── -->`);
      const decl = doc.skills.find((s) => String(s.id) === skillId);
      const declPath = decl && typeof decl.path === 'string' ? decl.path : '';
      let inlined: string | null = null;
      if (declPath) {
        const resolved = path.isAbsolute(declPath) ? declPath : path.resolve(root, declPath);
        if (fs.existsSync(resolved)) {
          const raw = fs.readFileSync(resolved, 'utf8');
          inlined = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
        }
      }
      sections.push(
        inlined ?? `<!-- TODO: paste content for skill "${skillId}" — file not found -->`,
      );
      sections.push('');
    }

    // Build the YAML frontmatter. `model`, `tools`, and `skills` are Claude Code
    // native frontmatter fields; surfacing them here means the agent file
    // honors the user's modal choices instead of silently dropping them.
    const frontmatterLines = [
      '---',
      `name: ${name}`,
      `description: ${effectiveDescription}`,
    ];
    if (model) { frontmatterLines.push(`model: ${model}`); }
    if (capabilities.length > 0) {
      frontmatterLines.push(`tools: [${capabilities.join(', ')}]`);
    }
    if (skills.length > 0) {
      frontmatterLines.push(`skills: [${skills.join(', ')}]`);
    }
    frontmatterLines.push('---', '');
    const content = `${frontmatterLines.join('\n')}\n${sections.join('\n').trimEnd()}\n`;

    fs.mkdirSync(path.dirname(agentPath), { recursive: true });
    fs.writeFileSync(agentPath, content, 'utf8');

    const docOpen = await vscode.workspace.openTextDocument(agentPath);
    await vscode.window.showTextDocument(docOpen, { preview: false });

    const action = await vscode.window.showInformationMessage(
      `Agent "${id}" added (${scope} · skills: ${skills.join(', ')}). Reload VS Code to see it in the Agents tab.`,
      'Reload',
    );
    if (action === 'Reload') {
      void vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }

  /**
   * Apply the EditAgentModal draft. Supports both file-based scopes
   * (project/global — rewrite YAML frontmatter, preserve body) and the
   * AIDLC scope (mutate workspace.yaml entry). The id is locked by the
   * modal so this never has to handle renames — use `renameAgent` for that.
   */
  private async editAgentInline(draft: Record<string, unknown>): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root) { return; }

    const id = String(draft.id ?? '').trim();
    const scope = draft.scope as AssetScope;
    if (!id || (scope !== 'project' && scope !== 'aidlc' && scope !== 'global')) { return; }

    const name = String(draft.name ?? '').trim();
    const description = String(draft.description ?? '').trim();
    const model = String(draft.model ?? '').trim();
    const capsRaw = Array.isArray(draft.capabilities) ? (draft.capabilities as unknown[]) : [];
    const capabilities = capsRaw.map(String).filter((c) => c);
    // `skills` is only present on edits that opened the modal post-v2 —
    // older payloads omit the field, which we read as "leave skills alone".
    const skillsProvided = Array.isArray(draft.skills);
    const skills = skillsProvided
      ? (draft.skills as unknown[]).map(String).filter((s) => s.length > 0)
      : [];

    if (scope === 'aidlc') {
      this.mutateYaml((doc) => {
        const agent = doc.agents.find((a) => String(a.id) === id);
        if (!agent) { return false; }
        if (name) { agent.name = name; }
        if (description) {
          agent.description = description;
        } else {
          delete agent.description;
        }
        if (model) { agent.model = model; }
        if (capabilities.length > 0) {
          agent.capabilities = capabilities;
        } else {
          delete agent.capabilities;
        }
        if (skillsProvided) {
          if (skills.length > 0) {
            agent.skills = skills;
            delete (agent as Record<string, unknown>).skill;
          } else {
            delete (agent as Record<string, unknown>).skills;
            delete (agent as Record<string, unknown>).skill;
          }
        }
      });
      void vscode.window.showInformationMessage(`Agent "${id}" updated.`);
      return;
    }

    // project / global: rewrite the .md file's frontmatter, keep body intact.
    const agentPath = targetPath(root, scope, 'agent', id);
    if (!fs.existsSync(agentPath)) {
      void vscode.window.showWarningMessage(
        `Agent file not found at ${path.relative(root, agentPath) || agentPath}.`,
      );
      return;
    }
    const raw = fs.readFileSync(agentPath, 'utf8');
    const updated = rewriteAgentFrontmatter(raw, {
      name: name || undefined,
      description: description || undefined,
      model: model || undefined,
      tools: capabilities.length > 0 ? capabilities : undefined,
      skills: skillsProvided && skills.length > 0 ? skills : (skillsProvided ? [] : undefined),
    });
    fs.writeFileSync(agentPath, updated, 'utf8');

    // For project/global scope agents, skills are now stored in the agent file's
    // frontmatter (not workspace.yaml). We no longer need to sync to workspace.yaml
    // for file-based agents — the agent's own `skills:` field is authoritative.
    void vscode.window.showInformationMessage(`Agent "${id}" updated.`);
  }

  /** Materialize the generated CoFoFo workflow and provider assets locally. */
  private ensureDefaultCofofoWorkflow(root: string): void {
    const catalogRoot = path.join(this.extensionUri.fsPath, 'templates', 'cofofo', 'catalog');
    new CofofoFoundationService(root, catalogRoot).ensureWorkflowRegistered();
  }

  /**
   * Ensure a built-in workflow preset is installed in this workspace. If
   * workspace.yaml doesn't exist, applies the full preset. If it exists but
   * lacks the workflow's pipeline, merges agents/skills/pipeline/slash_commands
   * non-destructively.
   *
   * Used at Start-Epic time when the selected pipeline is one of the
   * auto-injected built-ins from `BUILTIN_WORKFLOWS` — without this, the run
   * would fail because the pipeline id appears in the UI but the agent/skill
   * files weren't materialized on disk.
   */
  private ensureBuiltinInWorkspace(root: string, workflow: { id: string; pipelineId: string }): void {
    const doc = readYaml(root);
    if (doc?.pipelines.some((p) => String(p.id) === workflow.pipelineId)) { return; }

    const builtin = BUILTIN_WORKFLOWS.find((w) => w.id === workflow.id);
    if (!builtin) { return; }
    const preset = loadBuiltinPreset(this.extensionUri.fsPath, builtin);
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name ?? path.basename(root);

    if (!doc) {
      PresetStore.applyTo(root, preset, workspaceName);
    } else {
      // workspace.yaml exists — merge preset content in without overwriting existing config.
      // Skill content itself lives in `~/.claude/skills/aidlc-<workflow>-<phase>.md`
      // (installed by globalDefaultsInstaller), so we no longer drop a second
      // copy under `.aidlc/skills/`.

      const existingAgentIds = new Set(doc.agents.map((a) => String(a.id)));
      const existingSkillIds = new Set(doc.skills.map((s) => String(s.id)));
      const existingCmds = new Set(doc.slash_commands.map((c) => String(c.name)));

      for (const a of (preset.workspace.agents as Array<Record<string, unknown>>) ?? []) {
        if (!existingAgentIds.has(String(a.id))) { doc.agents.push(a); }
      }
      for (const s of (preset.workspace.skills as Array<Record<string, unknown>>) ?? []) {
        if (!existingSkillIds.has(String(s.id))) { doc.skills.push(s); }
      }
      for (const c of (preset.workspace.slash_commands as Array<Record<string, unknown>>) ?? []) {
        if (!existingCmds.has(String(c.name))) { doc.slash_commands.push(c); }
      }
      // Merge recipes too so the Auto classifier works after scaffolding.
      const presetRecipes = (preset.workspace as { recipes?: Array<Record<string, unknown>> }).recipes ?? [];
      if (presetRecipes.length) {
        const docRecipes = (doc as { recipes?: Array<Record<string, unknown>> }).recipes ?? [];
        const existingRecipeIds = new Set(docRecipes.map((r) => String(r.id)));
        for (const r of presetRecipes) {
          if (!existingRecipeIds.has(String(r.id))) { docRecipes.push(r); }
        }
        (doc as { recipes?: Array<Record<string, unknown>> }).recipes = docRecipes;
      }
      const builtinSteps = getBuiltinPipelineSummary(builtin).steps.map((s) => {
        const step: Record<string, unknown> = {
          agent: s.agent,
          model: s.model,
          enabled: true,
          requires: [],
          produces: [],
          human_review: s.human_review,
          auto_review: s.auto_review,
        };
        if (s.auto_review && s.auto_review_runner) { step.auto_review_runner = s.auto_review_runner; }
        return step;
      });
      doc.pipelines.push({
        id: workflow.pipelineId,
        steps: builtinSteps,
        on_failure: 'stop',
      });

      writeYaml(root, doc);
    }

    // Create .claude/commands/<slug>-<phase>.md so each slash command is wired
    // as a real Claude Code command. Namespacing keeps two presets' slash
    // commands distinct in the same project.
    const freshDoc = readYaml(root);
    const epicRoot = freshDoc
      ? (() => {
          const state = freshDoc.state as Record<string, unknown> | undefined;
          return typeof state?.root === 'string' ? state.root : 'docs/epics';
        })()
      : 'docs/epics';

    const commandsDir = path.join(root, '.claude', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });
    for (const { pipelineId, phase } of workflowCommandPhases(builtin)) {
      // File is namespaced by pipeline so multiple pipelines can reuse phase
      // names without colliding; the composed body is still keyed by phase id.
      const commandFile = path.join(commandsDir, `${pipelineCommandId(pipelineId, phase.id)}.md`);
      if (!fs.existsSync(commandFile)) {
        const skillBody = preset.skillContents[phase.id] ?? `# ${phase.name}\n\n${phase.description}\n`;
        fs.writeFileSync(commandFile, builtinClaudeCommand(phase, skillBody, epicRoot), 'utf8');
      }
    }

    // Scaffold the JS auto-review runner(s) for the implement step's
    // auto-review if missing. The core AutoReviewer loads these via dynamic
    // import and expects a default-exported function — a shell script can't be
    // imported, so the runner is a `.mjs` module, not `.sh` (issue #27). Each
    // workflow can ship its own `templates/<dir>/validators/ci.mjs`; falls back
    // to the generic SDLC validator when not customized.
    writeBuiltinAutoReviewValidators(this.extensionUri.fsPath, root, builtin);

    // Drop bundled artifact templates for this workflow so the epic's
    // artifacts/ folder gets a structured starting point on the very first run.
    this.ensureWorkflowTemplates(root);

    // Backfill companion-pipeline slash commands + command files when the
    // workspace still carries a phase under the primary pipeline's prefix.
    syncBuiltinPipelineCommands(root, this.extensionUri.fsPath);
  }

  /**
   * Ensure artifact templates exist for every known pipeline in this workspace.
   *
   * - SDLC (built-in): writes bundled templates from `templates/sdlc/artifacts/`
   *   to `.aidlc/aidlc-templates/sdlc-full/` — idempotent, no file I/O if
   *   files already exist.
   * - Custom pipelines: templates are generated by `generatePipelineTemplates`
   *   at pipeline-creation time; this method just ensures the directory exists.
   *
   * Called on every panel refresh so templates are always available before
   * the user starts an epic.
   */
  private ensureWorkflowTemplates(root: string): void {
    // For every built-in pipeline present in workspace.yaml, drop the
    // bundled artifact templates into `.aidlc/aidlc-templates/<pipelineId>/`.
    // No special-casing — every workflow extracts on first apply, idempotent
    // on subsequent panel refreshes.
    const doc = readYaml(root);
    if (!doc) { return; }

    // Keep companion slash commands + command files in sync. Cheap and
    // idempotent — fixes "Unknown command" after a command rename.
    syncBuiltinPipelineCommands(root, this.extensionUri.fsPath);
    // Resolve the project's tech stack once: `stacks` drives `{{#if}}` block
    // rendering (secondary stacks survive), `lookupKeys` picks the most
    // specific base template (e.g. implement.web-react.md → implement.web.md →
    // implement.md). Pure file reads + string ops — safe on this refresh path.
    const stacks = resolveTechStackForRoot(root);
    const lookupKeys = artifactLookupKeys(root, resolvePrimaryStack(stacks));
    for (const p of doc.pipelines) {
      const pId = String(p.id);
      const workflow = getBuiltinWorkflowByPipelineId(pId);
      if (!workflow) { continue; }
      const dir = path.join(root, WORKSPACE_DIR, 'aidlc-templates', pId);
      fs.mkdirSync(dir, { recursive: true });
      const templates = getBuiltinArtifactTemplates(this.extensionUri.fsPath, workflow, { stacks, lookupKeys });
      for (const [fileName, content] of Object.entries(templates)) {
        const dest = path.join(dir, fileName);
        if (!fs.existsSync(dest)) { fs.writeFileSync(dest, content, 'utf8'); }
      }
    }

    // Back-fill recipes for workspaces scaffolded before recipes existed, so
    // the Start-Epic "Auto" task-type suggestion has something to classify
    // against. Idempotent: planRecipeMigration returns null once recipes exist.
    const recipes = planRecipeMigration(doc as { recipes?: unknown; pipelines?: unknown });
    if (recipes) {
      (doc as { recipes?: unknown }).recipes = recipes;
      writeYaml(root, doc);
      rlog(`[migrate] back-filled ${recipes.length} recipe(s) from pipeline "${recipes[0].from}"`);
    }
  }

  /**
   * Apply the StartEpicModal draft. Mirrors `startEpicCommand`:
   * - writes <epicRoot>/<id>/state.json + inputs.json + artifacts/.
   * - when target is a pipeline, scaffolds a RunState (runId === epicId) so
   *   the gate UI lights up immediately.
   *
   * Refuses to overwrite an existing epic dir — the modal's existingEpicIds
   * already blocks collisions in normal use; this is the safety net.
   */
  /**
   * Assemble `recipeId` into a concrete pipeline named after the epic, append
   * it to workspace.yaml, and return the new pipeline id (or null on failure,
   * with a surfaced warning). Mirrors the wizard's `materializeRecipe`.
   */
  private assembleRecipeForEpic(root: string, recipeId: string, epicId: string): string | null {
    const doc = readYaml(root);
    if (!doc) {
      void vscode.window.showWarningMessage('AIDLC: no workspace.yaml — initialize first.');
      return null;
    }
    let config;
    try {
      config = validateWorkspace(doc, '.aidlc/workspace.yaml');
    } catch (err) {
      void vscode.window.showErrorMessage(
        `AIDLC: workspace.yaml is invalid — cannot generate from recipe: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }

    const taken = new Set((doc.pipelines as Array<{ id?: unknown }>).map((p) => String(p.id)));
    // Shared naming convention (core) so the CLI's `epic start` lands the same id.
    const pipelineId = recipePipelineId({ recipeId, epicId, taken });

    let pipeline;
    try {
      pipeline = assemblePipeline(config, { recipeId, pipelineId });
    } catch (err) {
      if (err instanceof PipelineAssembleError) {
        void vscode.window.showErrorMessage(`AIDLC: ${err.message}`);
        return null;
      }
      throw err;
    }

    doc.pipelines.push(pipeline as unknown as Record<string, unknown>);
    try {
      validateWorkspace(doc, '.aidlc/workspace.yaml');
    } catch (err) {
      void vscode.window.showErrorMessage(
        `AIDLC: generated pipeline failed validation — not written: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
    writeYaml(root, doc);
    return pipelineId;
  }

  /**
   * Read + analyze a requirement brief and post the chosen recipe back to the
   * webview (`recipeSuggestion`). Uses the `claude` CLI to actually understand
   * the requirement, falling back to the keyword heuristic when Claude isn't
   * available / times out / returns unparseable output. Silent on empty brief
   * / no recipes.
   */
  private async classifyBriefForWebview(brief: string): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root || !brief.trim()) { return; }
    // Recipes to classify against. Prefer the workspace's own recipes, but fall
    // back to the built-ins when there's no workspace.yaml yet (or it predates
    // recipes). The Start Epic modal already offers the built-in recipes in this
    // case (getStateForWebview), so without this fallback the Auto row would
    // spin on "analyzing" forever — classifyBrief is fired but no recipeSuggestion
    // ever comes back. The built-ins are materialized into the workspace at Start.
    const doc = readYaml(root);
    let config: ReturnType<typeof validateWorkspace> | undefined;
    if (doc) { try { config = validateWorkspace(doc, '.aidlc/workspace.yaml'); } catch { /* fall back */ } }
    const recipes: RecipeConfig[] = config && config.recipes.length > 0
      ? config.recipes
      : getBuiltinRecipeSummaries();
    if (recipes.length === 0) { return; }

    const post = (
      v: { recipeId: string; confidence: string; reasoning: string; title?: string; epicId?: string },
      source: string,
    ) => {
      void this.panel.webview.postMessage({
        type: 'recipeSuggestion',
        recipeId: v.recipeId,
        confidence: v.confidence,
        reasoning: v.reasoning,
        title: v.title ?? '',
        epicId: v.epicId ?? '',
        source,
        brief,
      });
    };

    // 1) Instant heuristic so a recipe shows up immediately (no dead wait while
    //    the LLM thinks). The keyword classify is local + synchronous.
    try {
      post(heuristicClassify(brief, recipes), 'heuristic');
    } catch { /* no-op — fall through to the LLM attempt */ }

    // 2) LLM refine: analyze the requirement → recipe + suggested title + epic
    //    id, and overwrite the provisional pick when it lands. Same
    //    prompt/parser the CLI uses (core) so both pick consistently.
    try {
      const system = buildClassificationPrompt(recipes);
      // Neutral cwd: classification needs no MCP at all, so don't pay the
      // project MCP boot cost (npx sdlc / ast-graph) for it.
      const stdout = await runClaude(
        ['--print', '--append-system-prompt', system, brief],
        { cwd: os.tmpdir(), timeoutMs: 60_000 },
      );
      const verdict = parseClassificationVerdict(stdout, recipes);
      post({
        recipeId: verdict.recipeId,
        confidence: verdict.confidence,
        reasoning: verdict.reasoning,
        title: verdict.title ?? '',
        epicId: verdict.epicId ?? '',
      }, 'llm');
    } catch { /* keep the heuristic suggestion already posted */ }
  }

  /**
   * Fetch a requirement from an external source via the `claude` CLI (which
   * carries the user's MCP integrations), then analyze it into a title +
   * summary + suggested recipe, and post it back (`requirementLoaded`) so the
   * modal can auto-fill the epic. Errors come back as `requirementLoadError`
   * with the real stderr so the user can see why (e.g. the source's MCP isn't
   * available to the CLI).
   *
   * Uses `--dangerously-skip-permissions` so MCP tool calls aren't blocked by
   * the non-interactive permission prompt (which would otherwise hang/fail).
   */
  private async loadRequirementForWebview(source: string, ref: string): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root || !ref.trim()) { return; }
    // NOTE: do NOT gate on workspace.yaml here. Fetching a requirement (Jira /
    // GitHub / Drive / URL) only needs `root` as the claude cwd + `ref` — it
    // never reads the workspace doc. A no-workspace project is exactly when the
    // user loads a requirement to scaffold one, so an early `if (!doc) return`
    // left the modal spinning on "Fetching…" until the 110s watchdog (the doc
    // was never used past the guard anyway).

    // GitHub: fetch directly with `gh` (host-side, ~1s) — there's no GitHub
    // connector, so the agentic path would wander for a minute+. Drop the raw
    // body straight into the description; classification runs off it after.
    if (source === 'github') {
      void this.panel.webview.postMessage({ type: 'requirementLoadStart', source, ref });
      try {
        rlog(`[github] gh fetch "${ref}" (host-side, no claude)`);
        const gh = await fetchGithubViaGh(ref);
        const summary = `${gh.title ? `${gh.title}\n\n` : ''}${gh.body}`.trim();
        rlog(`[github] gh ok — ${summary.length} chars`);
        if (!summary) { throw new Error('That GitHub issue/PR has no body to load.'); }
        void this.panel.webview.postMessage({ type: 'requirementChunk', source, ref, chunk: summary });
        void this.panel.webview.postMessage({
          type: 'requirementLoaded', source, ref, epicId: `GH-${gh.num}`, summary,
        });
      } catch (err) {
        const e = err as { code?: unknown; message?: unknown };
        const message = String(e?.code) === 'ENOENT'
          ? 'GitHub CLI (`gh`) not found on PATH — install it (and run `gh auth login`), or paste the issue text instead.'
          : describeExecError(err);
        void this.panel.webview.postMessage({ type: 'requirementLoadError', source, ref, message });
      }
      return;
    }

    // Fetch + summarize ONLY — recipe classification is decoupled (it runs
    // afterwards off the filled description), so the text shows up as soon as
    // Claude starts writing instead of waiting on the whole analysis.
    const action = REQUIREMENT_FETCH_ACTION[source] ?? REQUIREMENT_FETCH_ACTION.url;
    const system =
      `You fetch and summarize software requirements. ${action}\n\n` +
      `Write a concise plain-text summary of the requirement (2-5 sentences, ` +
      `the key intent + scope). Output ONLY the summary prose — no JSON, no ` +
      `markdown headers, no preamble like "Here is". ` +
      `If you cannot read the source for ANY reason — the tool / connector / MCP ` +
      `is unavailable or not authenticated, access is denied, or the item has no ` +
      `usable content — output EXACTLY the single token NO_CONTENT and nothing ` +
      `else. Do NOT apologize, do NOT explain why, do NOT ask the user to paste ` +
      `a URL or the text, do NOT ask any question. Just NO_CONTENT.`;

    // Tell the webview to clear the field and start streaming into it.
    void this.panel.webview.postMessage({ type: 'requirementLoadStart', source, ref });

    try {
      // Must run in the workspace root: the claude.ai connectors (Atlassian /
      // Drive) are enabled per-project, so a neutral cwd has no Jira tool. This
      // does mean the project's other MCP servers boot too — unavoidable.
      rlog(`[${source}] claude fetch "${ref}" (cwd=root, max-turns 12)`);
      // Stream stdout chunks straight into the description as they arrive.
      const stdout = await runClaude(
        ['--print', '--dangerously-skip-permissions', '--max-turns', '12', '--append-system-prompt', system, ref],
        {
          cwd: root,
          timeoutMs: 90_000,
          onChunk: (chunk) => {
            void this.panel.webview.postMessage({ type: 'requirementChunk', source, ref, chunk });
          },
        },
      );

      const raw = stdout.trim();
      const lower = raw.toLowerCase();
      // The summary sources are claude.ai *connectors* (Atlassian/GitHub/Drive),
      // authenticated interactively in the user's Claude session — a freshly
      // spawned headless `claude` often can't reach them. Despite the NO_CONTENT
      // instruction, it sometimes apologizes + asks the user to paste instead.
      // Catch the common refusal shapes (anywhere in the output) and fail fast +
      // clearly instead of streaming the apology in as if it were the requirement.
      // High-precision phrases only — a real 2-5 sentence requirement summary
      // shouldn't contain these (e.g. "provide the export button" won't match the
      // paste-the-<source> pattern, which requires jira/issue/url/ticket nearby).
      const refusalSignals: RegExp[] = [
        /\bno access to (jira|github|drive|the (jira|atlassian|github|drive|connector))/,
        /\bnot connected\b/, /\bisn'?t connected\b/,
        /\bcannot authenticate\b/, /\bcan'?t authenticate\b/, /\bnot authenticated\b/,
        // First-person inability: "I don't have access to…", "I can't reach…", "I'm unable to fetch…"
        /\bi(?:'m| am)?\s+(can'?t|cannot|could ?n'?t|do(?:n'?t| not)\s+have|am unable to|was unable to|unable to)\b.{0,40}\b(access|fetch|retrieve|reach|read|load|get|connect|tool|connector|mcp|jira|issue|ticket)/,
        /\bunable to (access|fetch|retrieve|reach|read|load|connect)/,
        // "the tool/connector/server/integration … (aren't|isn't|not) (currently) available/connected/authenticated"
        /\b(tool|connector|server|integration|mcp)s?\b.{0,40}\b(aren'?t|isn'?t|is ?not|are ?not|not|un)\s*(currently\s+)?(available|connected|accessible|authenticated|reachable|enabled)/,
        // "may need authentication", "needs to be authenticated"
        /\b(may |might |it |that )?needs?\s+(to be )?(authenticat|to authenticat|sign|log)/,
        // The assistant asking the user to help it fetch
        /\bcould you (either|please)\b/,
        /\b(paste|copy[- ]?paste|share|provide)\b.{0,20}\b(jira|issue|url|link|ticket|requirement|summary|description)\b/,
      ];
      const connectorIssue = refusalSignals.some((re) => re.test(lower));
      const hitMaxTurns = /reached max turns|max turns/.test(lower);
      const noContent = !raw || /\bno_content\b/i.test(raw);
      if (connectorIssue || hitMaxTurns || noContent || /^error[:\s]/i.test(raw)) {
        const label = SOURCE_LABEL[source] ?? 'source';
        // The auto-fetch runs a headless `claude`, which only loads MCP servers
        // from the CLI config (user/project scope) — NOT the claude.ai *app*
        // connectors (those are interactive-only). So a working connector in the
        // chat doesn't mean the headless fetch can see it. The fix is to add an
        // CLI-scoped, OAuth-authenticated MCP server (no API token needed).
        const enableHint = `Couldn't reach ${label}: the auto-fetch runs a headless \`claude\`, which only uses MCP servers in your CLI config — not the claude.ai app connectors. `
          + `Add + authenticate a CLI-scoped ${label} MCP server once (run \`claude\` here → \`/mcp\` → authenticate; OAuth, no API token), then retry — or just paste the requirement text below.`;
        throw new Error(
          connectorIssue || noContent
            ? enableHint
            : hitMaxTurns
              ? `Claude hit its step limit before reading the ${label} item — try again, or paste the text.`
              : `Could not read the ${label} item. Paste the requirement text instead.`,
        );
      }

      // Natural epic id per source: Jira key (LH-50732), GitHub issue (GH-123),
      // else a slug derived from the summary's first line.
      let suggestedEpicId = '';
      if (source === 'jira') {
        suggestedEpicId = ref.match(/([A-Z][A-Z0-9]+-\d+)/)?.[1] ?? '';
      } else if (source === 'github') {
        const n = ref.match(/#(\d+)|\/(?:issues|pull)\/(\d+)/);
        suggestedEpicId = n ? `GH-${n[1] ?? n[2]}` : '';
      }
      if (!suggestedEpicId) { suggestedEpicId = slugEpicId(raw.split('\n')[0] ?? ''); }

      // Done: the description is already filled by the streamed chunks. The
      // webview now runs the standard classify pass on it (recipe + title).
      void this.panel.webview.postMessage({
        type: 'requirementLoaded',
        source,
        ref,
        epicId: suggestedEpicId,
        summary: raw,
      });
    } catch (err) {
      void this.panel.webview.postMessage({
        type: 'requirementLoadError',
        source,
        ref,
        message: describeExecError(err),
      });
    }
  }

  private async startEpicInline(draft: Record<string, unknown>): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root) { return; }

    const targetRaw = draft.target as Record<string, unknown> | undefined;
    const epicId = String(draft.epicId ?? '').trim();
    if (!targetRaw || !epicId) { return; }
    let targetKind = String(targetRaw.kind ?? '');
    let targetId = String(targetRaw.id ?? '').trim();
    if (!targetId) { return; }
    if (targetKind !== 'pipeline' && targetKind !== 'agent' && targetKind !== 'recipe') { return; }

    // Recipe target → assemble a right-sized pipeline named after the epic,
    // write it to workspace.yaml, then continue as a normal pipeline.
    if (targetKind === 'recipe') {
      // Empty project: materialize the built-in workspace (agents/skills/
      // pipeline/recipes) so the recipe has a source pipeline to draw from.
      const existing = readYaml(root) as { recipes?: Array<{ id?: unknown }> } | null;
      const hasRecipe = Array.isArray(existing?.recipes)
        && existing.recipes.some((r) => String(r.id) === targetId);
      if (!hasRecipe) {
        const wf = BUILTIN_WORKFLOWS.find((w) => (w.recipes ?? []).some((r) => r.id === targetId));
        if (wf) { this.ensureBuiltinInWorkspace(root, wf); }
      }
      const generated = this.assembleRecipeForEpic(root, targetId, epicId);
      if (!generated) { return; }
      targetKind = 'pipeline';
      targetId = generated;
    }

    // Auto-scaffold agents/skills/workspace.yaml when a built-in pipeline is
    // selected — covers SDLC plus the 7 stack-specialized workflows.
    if (targetKind === 'pipeline') {
      if (targetId === 'cofofo-foundation') {
        void vscode.window.showWarningMessage('CoFoFo Foundation đã ngừng chạy như một pipeline. Hãy Publish Context từ tab Discover, rồi chọn cofofo-feature hoặc cofofo-bugfix.');
        return;
      }
      if (isRogueCofofoPipelineId(targetId)) {
        void vscode.window.showErrorMessage(
          `AIDLC: pipeline "${targetId}" is not a valid CoFoFo pipeline. ` +
            `CoFoFo delivery only allows cofofo-feature / cofofo-bugfix. ` +
            `Run “Kiểm tra & sửa workspace” to delete rogue pipelines.`,
          'Copy for agent',
        ).then(async (choice) => {
          if (choice !== 'Copy for agent') return;
          await vscode.env.clipboard.writeText([
            'AIDLC startEpic blocked — rogue CoFoFo pipeline',
            `epicId: ${epicId}`,
            `rejectedTarget: { kind: "pipeline", id: "${targetId}" }`,
            'allowedPipelines: cofofo-feature, cofofo-bugfix',
            'fix: removeRogueCofofoPipelinesFromWorkspace / aidlc.cofofoDoctor',
          ].join('\n'));
        });
        return;
      }
      if (isCofofoPipelineId(targetId)) {
        this.ensureDefaultCofofoWorkflow(root);
      }
      const builtinWorkflow = getBuiltinWorkflowByPipelineId(targetId);
      if (builtinWorkflow) { this.ensureBuiltinInWorkspace(root, builtinWorkflow); }
    }

    const doc = readYaml(root);
    if (!doc) {
      void vscode.window.showWarningMessage('AIDLC: no workspace.yaml — initialize first.');
      return;
    }

    const title = String(draft.title ?? '').trim();
    const description = String(draft.description ?? '').trim();
    const selectedGoals = Array.isArray(draft.selectedGoals)
      ? [...new Set(draft.selectedGoals
        .filter((goal): goal is string => typeof goal === 'string')
        .map((goal) => goal.trim())
        .filter(Boolean))]
      : [];
    const whatScope = String(draft.whatScope ?? '').trim();
    const featureConstraints = String(draft.featureConstraints ?? '').trim();
    const inputsRaw = draft.inputs && typeof draft.inputs === 'object'
      ? (draft.inputs as Record<string, unknown>)
      : {};
    const inputs: Record<string, string> = {};
    for (const [k, v] of Object.entries(inputsRaw)) {
      if (typeof v === 'string' && v.trim()) { inputs[k] = v; }
    }

    // GH-67: extra projects attached to the epic.
    const extraProjectsRaw = Array.isArray(draft.extraProjects) ? draft.extraProjects : undefined;
    const extraProjects = extraProjectsRaw?.filter(
      (p): p is { type: 'local' | 'github'; ref: string; label: string; mode?: string } =>
        typeof p === 'object' && p !== null
        && (p.type === 'local' || p.type === 'github')
        && typeof p.ref === 'string' && !!p.ref.trim()
        && typeof p.label === 'string',
    );

    let agents: string[] = [];
    if (targetKind === 'pipeline') {
      const p = (doc.pipelines as PipelineConfig[] | undefined)?.find(
        (x) => x.id === targetId,
      );
      if (!p) {
        void vscode.window.showWarningMessage(`Pipeline "${targetId}" not found.`);
        return;
      }
      agents = Array.isArray(p.steps) ? (p.steps as unknown[]).map(stepAgentId) : [];
    } else {
      const a = doc.agents.find((x) => String(x.id) === targetId);
      if (!a) {
        void vscode.window.showWarningMessage(`Agent "${targetId}" not found.`);
        return;
      }
      agents = [targetId];
    }
    if (agents.length === 0) {
      void vscode.window.showWarningMessage(`Target "${targetId}" has no agents.`);
      return;
    }

    const pipelineCfg = targetKind === 'pipeline'
      ? (doc.pipelines as PipelineConfig[] | undefined)?.find((p) => p.id === targetId)
      : undefined;

    // Scaffold the epic on disk via the shared core helper — same folder
    // layout / state.json / RunState the CLI's `epic start` produces.
    let scaffolded: ScaffoldEpicResult | undefined;
    try {
      const scaffoldArgs = {
        doc,
        target: { kind: targetKind as 'pipeline' | 'agent', id: targetId },
        agents,
        inputs,
        extraProjects: extraProjects && extraProjects.length > 0 ? extraProjects : undefined,
        pipeline: pipelineCfg,
        // aidlc-autopilot is experimental / "coming soon": off unless the user
        // opts in via the `aidlc.autopilot.enabled` setting.
        enableAutopilot: vscode.workspace
          .getConfiguration('aidlc')
          .get<boolean>('autopilot.enabled', false),
      };
      scaffolded = scaffoldEpic({ workspaceRoot: root, epicId, title, description, ...scaffoldArgs });
    } catch (err) {
      if (err instanceof EpicScaffoldError) {
        void vscode.window.showWarningMessage(`AIDLC: ${err.message}`);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      const issues = err instanceof Error && 'issues' in err && Array.isArray((err as { issues?: unknown }).issues)
        ? ((err as { issues: string[] }).issues)
        : [];
      const short = message.includes('CoFoFo foundation is not ready')
        ? 'Không tạo được epic CoFoFo: Context chưa sẵn sàng. Hãy Publish Context từ tab Discover rồi tạo task mới.'
        : `Epic could not be scaffolded: ${message}`;
      const agentBrief = [
        'AIDLC scaffoldEpic failed',
        `epicId: ${epicId}`,
        `target: ${targetKind}/${targetId}`,
        `error: ${message}`,
        ...(issues.length ? [`issues: ${issues.join(' | ')}`] : []),
        'note: Legacy Foundation snapshots cannot unlock a new delivery task.',
        'fix: Discover → Publish context → New task → cofofo-feature hoặc cofofo-bugfix',
      ].join('\n');
      void vscode.window.showErrorMessage(short, 'Copy for agent', 'Open CoFoFo doctor').then(async (choice) => {
        if (choice === 'Copy for agent') {
          await vscode.env.clipboard.writeText(agentBrief);
          void vscode.window.showInformationMessage('Copied scaffold error for the agent.');
        } else if (choice === 'Open CoFoFo doctor') {
          await vscode.commands.executeCommand('aidlc.cofofoDoctor');
        }
      });
      return;
    }

    // GH-67: add workspace-mode projects to VS Code via a named .code-workspace file.
    const wsProjects = (extraProjects ?? []).filter(
      (p) => (p.mode === 'workspace' || p.mode === 'clone') && p.ref,
    );
    if (wsProjects.length > 0) {
      const fs = require('fs') as typeof import('fs');
      const pathMod = require('path') as typeof import('path');
      const folders = [
        { path: root },
        ...wsProjects.map((p) => ({ path: p.ref })),
      ];
      const wsFile = pathMod.join(root, 'aidlc.code-workspace');
      const wsContent = JSON.stringify({ folders, settings: {} }, null, 2) + '\n';
      fs.writeFileSync(wsFile, wsContent, 'utf8');
      // Open the workspace file — VS Code reloads with the named workspace.
      void vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(wsFile));
    }

    // aidlc-autopilot: if a plan was generated, offer to open it before running.
    const pathMod = require('path') as typeof import('path');
    const fsMod = require('fs') as typeof import('fs');
    const planPath = pathMod.join(
      epicsRoot(root, doc),
      epicId,
      'autopilot-plan.md',
    );
    if (fsMod.existsSync(planPath)) {
      void vscode.window
        .showInformationMessage(
          `Started epic "${epicId}" — autopilot generated a plan. Run /${agents[0]} ${epicId} in Claude to begin.`,
          'View plan',
        )
        .then((choice) => {
          if (choice === 'View plan') {
            void vscode.window.showTextDocument(vscode.Uri.file(planPath));
          }
        });
    } else {
      void vscode.window.showInformationMessage(
        `Started epic "${epicId}" — ${agents[0]}. Run /${agents[0]} ${epicId} in Claude to begin.`,
      );
    }
    this.refresh();
  }

  /**
   * Build a pipeline from the React `AddPipelineModal` payload — bypasses
   * the legacy QuickPick wizard chain. Validates id, agents, and runner
   * paths server-side; surfaces issues as a warning and aborts.
   */
  /**
   * Resolve every step's `agent` id. If the id is already in workspace.yaml
   * `agents:` we accept it. If not, look it up in the discovered
   * project/global agent files — when found, plan an auto-sync entry so
   * the runner can resolve the agent later. Returns the missing id when
   * neither lookup succeeds.
   *
   * Doesn't mutate `doc` — caller applies `added` via `applySyncedAgents`
   * inside its own `mutateYaml` block so the write is atomic with the
   * pipeline push.
   */
  /**
   * Map of every built-in workflow agent (aidlc-po, aidlc-qa, …) to its
   * preset definition: the agent entry with its real `skills:` array plus the
   * matching skill `{id, path}` entries. Used so auto-syncing a built-in agent
   * into workspace.yaml writes its true skills (aidlc-prd, aidlc-implement, …)
   * instead of a synthesized `<id>-skill`.
   */
  private builtinAgentDefinitions(): Map<string, { agent: SyncedAgentPlan['agent']; skills: Array<{ id: string; path: string }> }> {
    const m = new Map<string, { agent: SyncedAgentPlan['agent']; skills: Array<{ id: string; path: string }> }>();
    for (const wf of BUILTIN_WORKFLOWS) {
      let preset;
      try { preset = loadBuiltinPreset(this.extensionUri.fsPath, wf); } catch { continue; }
      const ws = preset.workspace as {
        agents?: Array<Record<string, unknown>>;
        skills?: Array<Record<string, unknown>>;
      };
      const skillById = new Map<string, { id: string; path: string }>();
      for (const s of ws.skills ?? []) {
        const sid = String(s.id ?? '');
        if (sid) { skillById.set(sid, { id: sid, path: String(s.path ?? '') }); }
      }
      for (const a of ws.agents ?? []) {
        const aid = String(a.id ?? '');
        if (!aid || m.has(aid)) { continue; }
        const skillIds = Array.isArray(a.skills) ? (a.skills as unknown[]).map(String) : [];
        const skills = skillIds
          .map((sid) => skillById.get(sid))
          .filter((x): x is { id: string; path: string } => Boolean(x));
        m.set(aid, {
          agent: {
            id: aid,
            name: typeof a.name === 'string' ? a.name : aid,
            skills: skillIds,
            model: typeof a.model === 'string' ? a.model : undefined,
            description: typeof a.description === 'string' ? a.description : undefined,
            capabilities: Array.isArray(a.capabilities) ? (a.capabilities as unknown[]).map(String) : undefined,
          },
          skills,
        });
      }
    }
    return m;
  }

  private ensureWorkspaceAgentsForSteps(
    root: string,
    doc: YamlDocument,
    stepsRaw: unknown[],
  ):
    | { ok: true; added: SyncedAgentPlan[] }
    | { ok: false; missing: string }
  {
    const existing = new Set(doc.agents.map((a) => String(a.id)));
    const discovered = discoverAssets(root).agents;
    const byId = new Map<string, DiscoveredAsset>();
    for (const a of discovered) { byId.set(a.id, a); }

    // Built-in agent definitions keyed by agent id (aidlc-po, aidlc-qa, …).
    // These carry the agent's REAL skills (aidlc-prd, aidlc-implement, …) +
    // the matching skill entries, so syncing a built-in agent doesn't invent
    // a bogus `<id>-skill`.
    const builtinAgentDefs = this.builtinAgentDefinitions();

    const added: SyncedAgentPlan[] = [];
    const plannedIds = new Set<string>();

    for (const raw of stepsRaw) {
      if (!raw || typeof raw !== 'object') { continue; }
      const id = String((raw as Record<string, unknown>).agent ?? '').trim();
      if (!id) { return { ok: false, missing: '' }; }
      if (existing.has(id) || plannedIds.has(id)) { continue; }

      // Prefer the built-in definition (real skills) over the generic
      // file-based synthesis.
      const builtinDef = builtinAgentDefs.get(id);
      if (builtinDef) {
        added.push({ agent: builtinDef.agent, skills: builtinDef.skills });
        plannedIds.add(id);
        continue;
      }

      const file = byId.get(id);
      if (!file) { return { ok: false, missing: id }; }

      // Custom file-based agent: synthesize a single skill pointing at its
      // persona file so the runner can load the prompt.
      const fm = parseAgentFrontmatter(file.filePath);
      const skillId = `${id}-skill`;
      added.push({
        agent: {
          id,
          name: id,
          skills: [skillId],
          model: fm.model,
          capabilities: fm.tools,
          description: fm.description,
        },
        skills: [{ id: skillId, path: this.relPathFor(root, file.filePath) }],
      });
      plannedIds.add(id);
    }
    return { ok: true, added };
  }

  /**
   * Append the planned `agents:` + `skills:` entries from
   * `ensureWorkspaceAgentsForSteps` onto `doc`. Idempotent — skips ids
   * already present in case mutateYaml re-read the doc between plan +
   * apply.
   */
  private applySyncedAgents(doc: YamlDocument, added: SyncedAgentPlan[]): void {
    const agentIds = new Set(doc.agents.map((a) => String(a.id)));
    const skillIds = new Set(doc.skills.map((s) => String(s.id)));
    for (const plan of added) {
      if (!agentIds.has(plan.agent.id)) {
        const agent: Record<string, unknown> = {
          id: plan.agent.id,
          name: plan.agent.name,
          skills: plan.agent.skills,
        };
        if (plan.agent.model) { agent.model = plan.agent.model; }
        if (plan.agent.description) { agent.description = plan.agent.description; }
        if (plan.agent.capabilities && plan.agent.capabilities.length > 0) {
          agent.capabilities = plan.agent.capabilities;
        }
        doc.agents.push(agent);
        agentIds.add(plan.agent.id);
      }
      for (const sk of plan.skills) {
        if (!skillIds.has(sk.id)) {
          doc.skills.push({ id: sk.id, path: sk.path });
          skillIds.add(sk.id);
        }
      }
    }
  }

  /**
   * Best-effort path normalization for workspace.yaml `skills[].path`.
   * Files under the workspace get a project-relative path; absolute paths
   * outside (e.g. `~/.claude/agents/aidlc-po.md`) keep the `~/` form so
   * the YAML stays portable across machines.
   */
  private relPathFor(root: string, abs: string): string {
    const home = os.homedir();
    if (abs.startsWith(home)) { return '~' + abs.slice(home.length); }
    const rel = path.relative(root, abs);
    return rel && !rel.startsWith('..') ? rel : abs;
  }

  /**
   * Wire each *named* step of a custom pipeline as a real Claude Code slash
   * command: write `.claude/commands/<pipelineId>-<step>.md` and register a
   * matching `slash_commands` entry in workspace.yaml.
   *
   * Without this, "Run step" on a custom pipeline executes
   * `/<pipelineId>-<step>` (the fallback that `epicsList.slashForStep`
   * resolves to when the command table is empty) but no command file exists,
   * so Claude Code reports "command not found". The built-in preset apply path
   * (`applyWorkflowPreset`) already does this wiring; custom pipelines built in
   * the inline builder never did — this closes that gap.
   *
   * Mutates `doc.slash_commands` in place (caller persists via `mutateYaml`)
   * and writes the command files as a side effect. Idempotent: skips slash
   * entries already present and command files already on disk (so a user's
   * hand-tuned command survives a re-save). Steps without a `name` are skipped
   * — they have no namespaced command id to bind to.
   */
  private writeCustomPipelineCommands(
    root: string,
    pipelineId: string,
    steps: Array<Record<string, unknown>>,
    doc: YamlDocument,
  ): void {
    const state = doc.state;
    const epicRoot = typeof state?.root === 'string' ? state.root : 'docs/epics';

    const commandsDir = path.join(root, '.claude', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });

    const existingCmds = new Set(
      doc.slash_commands.map((c) => String(c.name ?? '')),
    );

    for (const step of steps) {
      const agent = String(step.agent ?? '').trim();
      const stepName = typeof step.name === 'string' ? step.name.trim() : '';
      if (!stepName) { continue; }

      const cmdId = pipelineCommandId(pipelineId, stepName);
      const slashName = `/${cmdId}`;

      // Register the slash command in workspace.yaml — the source of truth
      // the epic step resolver reads (see epicsList `slashForStep`).
      if (!existingCmds.has(slashName)) {
        doc.slash_commands.push({ name: slashName, agent });
        existingCmds.add(slashName);
      }

      // Write the command body, but never clobber a hand-authored one.
      const commandFile = path.join(commandsDir, `${cmdId}.md`);
      if (fs.existsSync(commandFile)) { continue; }

      // Compose the step's linked skill content into the body so the command
      // is self-contained (mirrors how presets use `builtinClaudeCommand`).
      const skillIds = Array.isArray(step.skills)
        ? (step.skills as unknown[]).map(String).filter((s) => s.length > 0)
        : [];
      const skillBodies: string[] = [];
      for (const skillId of skillIds) {
        const decl = doc.skills.find((s) => String(s.id) === skillId);
        const declPath = typeof decl?.path === 'string' ? decl.path : '';
        if (!declPath) { continue; }
        const resolved = path.isAbsolute(declPath) ? declPath : path.resolve(root, declPath);
        if (fs.existsSync(resolved)) { skillBodies.push(fs.readFileSync(resolved, 'utf8')); }
      }

      const title = stepName.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const skillBody = skillBodies.length > 0
        ? skillBodies.join('\n\n---\n\n')
        : `# ${title}\n\nRun the ${stepName} step for this epic.`;

      // `builtinClaudeCommand` only reads `.id`, `.description` and
      // `.artifact` off the phase — synthesize a minimal one for the step.
      const phase = {
        id: stepName,
        name: title,
        description: `Run the ${stepName} step.`,
        artifact: `${stepName.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}-SUMMARY.md`,
      } as Parameters<typeof builtinClaudeCommand>[0];

      fs.writeFileSync(commandFile, builtinClaudeCommand(phase, skillBody, epicRoot), 'utf8');
    }
  }

  private async addPipelineInline(draft: Record<string, unknown>): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) {
      void vscode.window.showWarningMessage('AIDLC: no workspace.yaml — initialize first.');
      return;
    }

    const id = String(draft.id ?? '').trim();
    const onFailure: 'stop' | 'continue' =
      draft.on_failure === 'continue' ? 'continue' : 'stop';
    const stepsRaw = Array.isArray(draft.steps) ? (draft.steps as unknown[]) : [];

    if (!id) {
      void vscode.window.showWarningMessage('Pipeline id is required.');
      return;
    }
    if (doc.pipelines.some((p) => p.id === id)) {
      void vscode.window.showWarningMessage(`Pipeline "${id}" already exists.`);
      return;
    }
    if (stepsRaw.length === 0) {
      void vscode.window.showWarningMessage('Pipeline needs at least one step.');
      return;
    }

    // Resolve every step's agent id. Steps referencing file-based agents
    // (project / global scope) won't have a matching workspace.yaml entry
    // yet — auto-sync one from the persona .md frontmatter so the runner
    // can dispatch them. Aborts only when an id is neither in workspace
    // nor in the discovered file set.
    const sync = this.ensureWorkspaceAgentsForSteps(root, doc, stepsRaw);
    if (!sync.ok) {
      void vscode.window.showWarningMessage(
        `Step references unknown agent "${sync.missing}". Aborting.`,
      );
      return;
    }
    const steps: unknown[] = [];
    for (const raw of stepsRaw) {
      if (!raw || typeof raw !== 'object') { continue; }
      const r = raw as Record<string, unknown>;
      const agent = String(r.agent ?? '').trim();
      const stepName = typeof r.name === 'string' ? r.name.trim() : '';
      const skillsArr = Array.isArray(r.skills)
        ? (r.skills as unknown[]).map(String).filter((s) => s.length > 0)
        : [];
      const dependsOnArr = Array.isArray(r.depends_on)
        ? (r.depends_on as unknown[]).map(String).filter((s) => s.length > 0)
        : [];
      const human_review = r.human_review === true;
      const auto_review = r.auto_review === true;
      const runner = typeof r.auto_review_runner === 'string' ? r.auto_review_runner.trim() : '';
      if (auto_review && !runner) {
        void vscode.window.showWarningMessage(
          `Step "${agent}": auto_review is on but runner path is empty.`,
        );
        return;
      }
      const step: Record<string, unknown> = {
        agent,
        enabled: true,
        requires: [],
        produces: [],
        human_review,
        auto_review,
      };
      if (stepName) { step.name = stepName; }
      if (skillsArr.length > 0) { step.skills = skillsArr; }
      // Parallel structure defined via the modal's "Runs after" picker.
      if (dependsOnArr.length > 0) { step.depends_on = dependsOnArr; }
      if (auto_review) { step.auto_review_runner = runner; }
      steps.push(step);
    }

    this.mutateYaml((d) => {
      // Re-apply the synced workspace.yaml additions on the fresh doc this
      // mutateYaml session reads back from disk. Otherwise the write below
      // would clobber the entries `ensureWorkspaceAgentsForSteps` added on
      // the stale `doc` it received.
      this.applySyncedAgents(d, sync.added);
      d.pipelines.push({ id, steps, on_failure: onFailure });
      // Wire each named step as a slash command (+ `.claude/commands/*.md`)
      // so "Run step" doesn't fail with "command not found" on this pipeline.
      this.writeCustomPipelineCommands(root, id, steps as Array<Record<string, unknown>>, d);
    });

    void vscode.window.showInformationMessage(
      `Pipeline "${id}" added: ${steps
        .map((s) => (s as { agent: string }).agent)
        .join(' → ')}`,
    );

    // Generate artifact templates immediately so they exist before the user
    // starts an epic. Refresh fires after generation completes.
    await this.generatePipelineTemplates(root, id, steps as Array<{ agent: string }>);
    this.refresh();
  }

  /**
   * Use the local `claude` CLI (already authenticated) to generate a per-step
   * artifact template for a custom pipeline. Reads each step's agent description
   * + linked skill content, passes it to `claude -p` and writes the result to
   * `.aidlc/aidlc-templates/<pipelineId>/<stepAgent>.md`.
   *
   * Runs asynchronously after the pipeline is saved — failures are surfaced as
   * a VS Code warning rather than blocking the pipeline creation flow.
   */
  private async generatePipelineTemplates(
    root: string,
    pipelineId: string,
    steps: Array<{ agent: string }>,
  ): Promise<void> {
    const doc = readYaml(root);
    if (!doc) { return; }

    const templatesDir = path.join(root, WORKSPACE_DIR, 'aidlc-templates', pipelineId);
    fs.mkdirSync(templatesDir, { recursive: true });

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Generating artifact templates for pipeline "${pipelineId}"…`,
        cancellable: false,
      },
      async (progress) => {
        const total = steps.length;
        let done = 0;

        for (const step of steps) {
          const agentId = step.agent;
          const destFile = path.join(templatesDir, `${agentId}.md`);
          if (fs.existsSync(destFile)) { done++; continue; }

          // Collect agent + skill context.
          const agentDecl = doc.agents.find((a) => String(a.id) === agentId) as Record<string, unknown> | undefined;
          const agentDesc = agentDecl?.description ?? agentId;
          const skillIds: string[] = Array.isArray(agentDecl?.skills)
            ? (agentDecl!.skills as string[])
            : typeof agentDecl?.skill === 'string'
              ? [agentDecl.skill as string]
              : [];

          const skillBodies: string[] = [];
          for (const skillId of skillIds) {
            const decl = doc.skills.find((s) => String(s.id) === skillId) as Record<string, unknown> | undefined;
            const declPath = typeof decl?.path === 'string' ? decl.path : '';
            if (declPath) {
              const resolved = path.isAbsolute(declPath) ? declPath : path.resolve(root, declPath);
              if (fs.existsSync(resolved)) {
                skillBodies.push(fs.readFileSync(resolved, 'utf8'));
              }
            }
          }

          const prompt = [
            'You are an SDLC assistant. Given this agent\'s role, generate a concise markdown artifact template that Claude should fill in when it runs this step.',
            'Use placeholder text and structured sections (headers, tables, checklists) appropriate to the agent\'s deliverable.',
            'Output ONLY the markdown — no explanation, no code fences around the whole response.',
            markdownOutputLanguageInstruction(resolveDisplayLanguage()),
            '',
            `Agent: ${agentId}`,
            `Description: ${agentDesc}`,
            skillBodies.length > 0
              ? `\nSkill content:\n---\n${skillBodies.join('\n---\n')}`
              : '',
          ].filter(Boolean).join('\n');

          try {
            const { stdout } = await execFileAsync('claude', ['-p', prompt], {
              cwd: root,
              maxBuffer: 2 * 1024 * 1024,
              timeout: 60_000,
              env: process.env,
            });
            if (stdout.trim()) {
              fs.writeFileSync(destFile, stdout.trim() + '\n', 'utf8');
            }
          } catch {
            // Non-fatal — epic can still start without a pre-generated template.
          }

          done++;
          progress.report({ increment: (done / total) * 100, message: `${done}/${total}` });
        }
      },
    );

    void vscode.window.showInformationMessage(
      `Artifact templates ready at .aidlc/aidlc-templates/${pipelineId}/`,
    );
  }

  /**
   * Apply edits from the React `PipelineModal` (edit mode). Replaces the
   * pipeline's `steps` and `on_failure` while preserving each existing step's
   * `requires` / `produces` (which the modal does not expose — those still
   * live on the per-step gear-icon flow). Matching is by agent id, first
   * occurrence — good enough for typical reorder + toggle workflows.
   */
  private async editPipelineInline(
    id: string,
    draft: Record<string, unknown>,
  ): Promise<void> {
    const root = this.getRootOrWarn();
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) { return; }

    const pipeline = doc.pipelines.find((p) => p.id === id);
    if (!pipeline) {
      void vscode.window.showWarningMessage(`Pipeline "${id}" not found.`);
      return;
    }

    const onFailure: 'stop' | 'continue' =
      draft.on_failure === 'continue' ? 'continue' : 'stop';
    const stepsRaw = Array.isArray(draft.steps) ? (draft.steps as unknown[]) : [];
    if (stepsRaw.length === 0) {
      void vscode.window.showWarningMessage('Pipeline needs at least one step.');
      return;
    }

    // Auto-sync workspace.yaml entries for any file-based agents the user
    // picked. Same mechanism as `addPipelineInline` — without this an
    // edit that swaps to a project/global agent would abort here even
    // though the agent file exists.
    const sync = this.ensureWorkspaceAgentsForSteps(root, doc, stepsRaw);
    if (!sync.ok) {
      void vscode.window.showWarningMessage(
        `Step references unknown agent "${sync.missing}". Aborting.`,
      );
      return;
    }

    // Preserve fields the step modal doesn't edit (requires/produces and the
    // gate fields with no UI yet: produces_contains, auto_review_timeout_ms)
    // from the existing pipeline by agent id — first occurrence consumed per
    // match so duplicate-agent steps still pair up with their original
    // entries in order. Without this, re-saving a pipeline through the
    // builder would silently drop hand-authored fields.
    const oldByAgent = new Map<
      string,
      Array<{
        requires: string[];
        produces: string[];
        produces_contains: string[];
        auto_review_timeout_ms?: number;
      }>
    >();
    if (Array.isArray(pipeline.steps)) {
      for (const raw of pipeline.steps as PipelineStepConfig[]) {
        const norm = normalizeStep(raw);
        const arr = oldByAgent.get(norm.agent) ?? [];
        arr.push({
          requires: norm.requires,
          produces: norm.produces,
          produces_contains: norm.produces_contains,
          auto_review_timeout_ms: norm.auto_review_timeout_ms,
        });
        oldByAgent.set(norm.agent, arr);
      }
    }

    const newSteps: unknown[] = [];
    for (const raw of stepsRaw) {
      if (!raw || typeof raw !== 'object') { continue; }
      const r = raw as Record<string, unknown>;
      const agent = String(r.agent ?? '').trim();
      const stepName = typeof r.name === 'string' ? r.name.trim() : '';
      const skillsArr = Array.isArray(r.skills)
        ? (r.skills as unknown[]).map(String).filter((s) => s.length > 0)
        : [];
      const dependsOnArr = Array.isArray(r.depends_on)
        ? (r.depends_on as unknown[]).map(String).filter((s) => s.length > 0)
        : [];
      const human_review = r.human_review === true;
      const auto_review = r.auto_review === true;
      const runner = typeof r.auto_review_runner === 'string' ? r.auto_review_runner.trim() : '';
      if (auto_review && !runner) {
        void vscode.window.showWarningMessage(
          `Step "${agent}": auto_review is on but runner path is empty.`,
        );
        return;
      }

      const carry = oldByAgent.get(agent)?.shift();
      const step: Record<string, unknown> = {
        agent,
        enabled: true,
        requires: carry?.requires ?? [],
        produces: carry?.produces ?? [],
        human_review,
        auto_review,
      };
      if (stepName) { step.name = stepName; }
      if (skillsArr.length > 0) { step.skills = skillsArr; }
      // Carry DAG edges. The modal doesn't let the user edit deps, but a
      // save-without-deps would silently flatten the workflow's columns,
      // so we round-trip whatever the webview sent.
      if (dependsOnArr.length > 0) { step.depends_on = dependsOnArr; }
      if (auto_review) { step.auto_review_runner = runner; }
      // Round-trip gate fields that have no modal UI yet, so editing a
      // pipeline doesn't discard hand-authored values.
      if (carry?.produces_contains && carry.produces_contains.length > 0) {
        step.produces_contains = carry.produces_contains;
      }
      if (typeof carry?.auto_review_timeout_ms === 'number') {
        step.auto_review_timeout_ms = carry.auto_review_timeout_ms;
      }
      newSteps.push(step);
    }

    this.mutateYaml((d) => {
      // Commit synced agents/skills in the same write that updates the
      // pipeline, so the runner never sees a step referencing an agent
      // that hasn't been added yet.
      this.applySyncedAgents(d, sync.added);
      const p = d.pipelines.find((x) => x.id === id);
      if (!p) { return false; }
      p.steps = newSteps;
      p.on_failure = onFailure;
      // Provision slash commands for any newly-named steps (idempotent —
      // existing entries + command files are left untouched).
      this.writeCustomPipelineCommands(root, id, newSteps as Array<Record<string, unknown>>, d);
    });

    void vscode.window.showInformationMessage(
      `Pipeline "${id}" updated: ${newSteps
        .map((s) => (s as { agent: string }).agent)
        .join(' → ')}`,
    );
  }

  /**
   * Append a new step that runs in parallel with an existing step: clone
   * the source step's `depends_on` so the new step lands at the same DAG
   * level. The new step is appended to `pipeline.steps[]`; DAG column
   * placement is driven by `depends_on`, not array order, so it'll render
   * next to the source step.
   *
   * Verifies the chosen agent exists in workspace.yaml. No-op if the source
   * agent isn't in the pipeline (shouldn't happen via UI, defensive).
   */
  private async addParallelStep(
    pipelineId: string,
    parallelToAgent: string,
    agentId: string,
    stepName?: string,
  ): Promise<void> {
    if (!pipelineId || !parallelToAgent || !agentId) { return; }
    const root = this.getRootOrWarn();
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) { return; }
    if (!doc.agents.some((a) => String(a.id) === agentId)) {
      void vscode.window.showWarningMessage(
        `Agent "${agentId}" not found in workspace.yaml. Add it before placing it in a pipeline.`,
      );
      return;
    }

    // Duplicate agent ids are allowed — multiple steps can share one agent
    // with different skills / step names (e.g. several QA phases). DAG edges
    // reference each step's *node id* (`name ?? agent`), not the bare agent,
    // so duplicates stay distinct as long as their names differ. The picker
    // requires a unique step name, which guarantees that.
    const pipeline = doc.pipelines.find((x) => x.id === pipelineId);
    if (!pipeline || !Array.isArray(pipeline.steps)) { return; }

    this.mutateYaml((mdoc) => {
      const pipeline = mdoc.pipelines.find((x) => x.id === pipelineId);
      if (!pipeline || !Array.isArray(pipeline.steps)) { return false; }
      const steps = pipeline.steps as PipelineStepConfig[];

      const stepAgent = (s: PipelineStepConfig): string =>
        typeof s === 'string'
          ? s
          : typeof (s as { agent?: unknown }).agent === 'string'
            ? (s as { agent: string }).agent
            : '';
      const stepNameOf = (s: PipelineStepConfig): string | undefined =>
        typeof s === 'object' && s && typeof (s as { name?: unknown }).name === 'string'
          ? (s as { name: string }).name
          : undefined;
      // Node id keys the DAG (matches PipelineCard + addStepToPipeline).
      const stepNodeId = (s: PipelineStepConfig): string => stepNameOf(s) ?? stepAgent(s);
      const stepDeps = (s: PipelineStepConfig): string[] => {
        if (typeof s === 'string') { return []; }
        const d = (s as { depends_on?: unknown }).depends_on;
        return Array.isArray(d) ? d.map(String) : [];
      };

      // Auto-upgrade linear → DAG when needed. A pipeline with no
      // `depends_on` edges is "linear" — execution order is the array
      // index. If we just append a parallel step there with empty deps,
      // every existing step still has empty deps too, so `hasDagShape`
      // stays false and the UI keeps rendering as a linear chain — the
      // parallel relationship the user just created would be invisible.
      // Fix: when a linear pipeline gains its first parallel step, inflate
      // each existing step's `depends_on` from positional order so the
      // chain becomes an explicit DAG. Chaining keys by node id so the
      // edges line up with the visual nodes (and survive duplicate agents).
      const usesDag = steps.some((s) => stepDeps(s).length > 0);
      if (!usesDag) {
        let prevNodeId = '';
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          const agent = stepAgent(s);
          if (!agent) { continue; }
          const name = stepNameOf(s);
          const inflated: Record<string, unknown> = {
            agent,
            enabled: typeof s === 'string'
              ? true
              : (s as { enabled?: unknown }).enabled !== false,
            requires: typeof s === 'string'
              ? []
              : Array.isArray((s as { requires?: unknown }).requires)
                ? ((s as { requires: unknown[] }).requires as unknown[])
                : [],
            produces: typeof s === 'string'
              ? []
              : Array.isArray((s as { produces?: unknown }).produces)
                ? ((s as { produces: unknown[] }).produces as unknown[])
                : [],
            human_review: typeof s === 'string'
              ? true
              : (s as { human_review?: unknown }).human_review !== false,
            auto_review: typeof s !== 'string'
              && (s as { auto_review?: unknown }).auto_review === true,
          };
          // Preserve name + skills so inflation doesn't wipe them.
          if (name) { inflated.name = name; }
          const skills = typeof s === 'object' && s && Array.isArray((s as { skills?: unknown }).skills)
            ? ((s as { skills: unknown[] }).skills as unknown[])
            : undefined;
          if (skills && skills.length > 0) { inflated.skills = skills; }
          const runner = typeof s === 'string'
            ? undefined
            : (s as { auto_review_runner?: unknown }).auto_review_runner;
          if (typeof runner === 'string') { inflated.auto_review_runner = runner; }
          if (i > 0 && prevNodeId) { inflated.depends_on = [prevNodeId]; }
          steps[i] = inflated as unknown as PipelineStepConfig;
          prevNodeId = name ?? agent;
        }
      }

      // `parallelToAgent` carries the source step's node id (the webview
      // sends `name ?? agent`). Match on node id so the right step is found
      // even when its agent appears more than once.
      const source = steps.find((s) => stepNodeId(s) === parallelToAgent);
      if (!source) { return false; }
      const sourceDeps = stepDeps(source);

      const newStep: Record<string, unknown> = {
        agent: agentId,
        enabled: true,
        requires: [],
        produces: [],
        human_review: true,
        auto_review: false,
      };
      const name = (stepName ?? '').trim();
      if (name && name !== agentId) { newStep.name = name; }
      if (sourceDeps.length > 0) { newStep.depends_on = sourceDeps; }
      steps.push(newStep as unknown as PipelineStepConfig);
    });
  }

  private async addStepToPipeline(pipelineId: string, agentIdArg?: string, stepNameArg?: string): Promise<void> {
    if (!pipelineId) { return; }
    const root = this.getRootOrWarn();
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) { return; }
    if (doc.agents.length === 0) {
      const choice = await vscode.window.showWarningMessage(
        'No agents declared yet — add one before chaining steps.',
        'Add Agent',
      );
      if (choice === 'Add Agent') {
        await vscode.commands.executeCommand('aidlc.addAgent');
      }
      return;
    }
    const pipeline = doc.pipelines.find((x) => x.id === pipelineId);
    if (!pipeline) { return; }

    let chosenId: string | undefined;
    if (agentIdArg) {
      // Webview already showed an inline StepPickerModal — trust the choice
      // but verify the agent still exists in workspace.yaml.
      if (doc.agents.some((a) => String(a.id) === agentIdArg)) {
        chosenId = agentIdArg;
      }
    } else {
      const currentSteps = Array.isArray(pipeline.steps)
        ? pipeline.steps.map(stepAgentId)
        : [];
      const picked = await vscode.window.showQuickPick(
        doc.agents.map((a) => {
          const id = String(a.id);
          const name = typeof a.name === 'string' ? a.name : id;
          const inPipeline = currentSteps.includes(id);
          return {
            label: id,
            description: name,
            detail: inPipeline ? '· already in pipeline (will duplicate)' : '',
            id,
          };
        }),
        { placeHolder: `Append a step to \`${pipelineId}\``, ignoreFocusOut: true, matchOnDetail: true },
      );
      chosenId = picked?.id;
    }
    if (!chosenId) { return; }
    this.mutateYaml((d) => {
      const p = d.pipelines.find((x) => x.id === pipelineId);
      if (!p) { return false; }
      const steps = Array.isArray(p.steps) ? (p.steps as PipelineStepConfig[]) : [];

      // Append semantics:
      //   sequential pipeline (no depends_on anywhere) → bare string, runner
      //     advances by index.
      //   DAG pipeline → new step must depend on the current leaves
      //     (steps nobody else depends on) so it lands *after* them in the
      //     visual flow. Otherwise it gets no deps and lands at level 0
      //     parallel with the roots.
      // Node id keys the DAG: a step's `name` when present, else its agent id
      // (matches PipelineCard.computeDagLevels). `depends_on` references these
      // ids, so leaf detection must compare against node ids, not agent ids.
      const normalized = steps.map((s) => {
        if (typeof s === 'string') { return { nodeId: s, deps: [] as string[] }; }
        const obj = s as { agent?: unknown; name?: unknown; depends_on?: unknown };
        const deps = Array.isArray(obj.depends_on) ? obj.depends_on.map(String) : [];
        const agent = typeof obj.agent === 'string' ? obj.agent : '';
        const nodeId = typeof obj.name === 'string' && obj.name ? obj.name : agent;
        return { nodeId, deps };
      });
      const usesDag = normalized.some((n) => n.deps.length > 0);

      // The step name (chosen first in the picker) becomes the node label and
      // the id `depends_on` references. Fall back to the agent id when blank.
      const name = (stepNameArg ?? '').trim();

      if (!usesDag) {
        // A named step can't be a bare string — emit an object so the name
        // survives. Unnamed (or name === agent) keeps the compact string form.
        if (name && name !== chosenId) {
          steps.push({ agent: chosenId!, name } as unknown as PipelineStepConfig);
        } else {
          steps.push(chosenId!);
        }
      } else {
        const referenced = new Set<string>();
        for (const n of normalized) {
          for (const d of n.deps) { referenced.add(d); }
        }
        // Leaves = node ids nobody depends on → the new step lands after them.
        const leaves = normalized
          .map((n) => n.nodeId)
          .filter((id) => id && !referenced.has(id));
        const newStep: Record<string, unknown> = {
          agent: chosenId!,
          enabled: true,
          requires: [],
          produces: [],
          human_review: true,
          auto_review: false,
        };
        if (name && name !== chosenId) { newStep.name = name; }
        if (leaves.length > 0) { newStep.depends_on = leaves; }
        steps.push(newStep as unknown as PipelineStepConfig);
      }
      p.steps = steps;
    });
  }

  /**
   * Delete a pipeline. For built-in workflows this is a full uninstall:
   * remove the pipeline itself, the workspace.yaml agents / skills /
   * slash_commands that the preset created, the `.claude/commands/<slug>-*.md`
   * files, and the global `~/.claude/agents` + `~/.claude/skills` files.
   * User pipelines fall through to the plain `deleteItem` path which only
   * touches workspace.yaml.
   */
  private async deletePipeline(id: string, skipConfirm = false): Promise<void> {
    if (!id) { return; }
    const builtin = getBuiltinWorkflowByPipelineId(id);
    if (!builtin) {
      await this.deleteItem('pipelines', id, skipConfirm);
      return;
    }

    if (!skipConfirm) {
      const confirm = await vscode.window.showWarningMessage(
        `Delete workflow \`${id}\` and uninstall its unused agents/skills from ~/.claude/?`,
        { modal: true }, 'Delete', 'Cancel',
      );
      if (confirm !== 'Delete') { return; }
    }

    // What this built-in owns, in the *same id-spaces* workspace.yaml uses:
    //   agents → `aidlc-<persona>`, skills → `aidlc-<…>`, slash → `/<phase>`.
    // (The previous version compared bare phase ids against agent/skill ids,
    // which never overlap — so agents + skills were never actually removed
    // and lingered in the counts after the pipeline was deleted.) Derive the
    // owned ids from the generated preset so this stays correct regardless of
    // how skill ids are computed.
    const preset = loadBuiltinPreset(this.extensionUri.fsPath, builtin);
    const ws = preset.workspace as {
      agents?: Array<{ id?: unknown }>;
      skills?: Array<{ id?: unknown }>;
      slash_commands?: Array<{ name?: unknown }>;
    };
    const ownedAgentIds = new Set((ws.agents ?? []).map((a) => String(a.id ?? '')));
    const ownedSkillIds = new Set((ws.skills ?? []).map((s) => String(s.id ?? '')));
    const ownedSlashNames = new Set((ws.slash_commands ?? []).map((c) => String(c.name ?? '')));
    // Phase ids own the `.claude/commands/<phase>.md` files + the step names
    // remaining pipelines reference.
    const myPhaseIds = new Set(builtin.phases.map((p) => p.id));

    this.mutateYaml((doc) => {
      // Sharing-aware: collect what *other* pipelines still reference so a
      // shared agent/skill (used by another applied pipeline) survives.
      const neededAgents = new Set<string>();
      const neededSkills = new Set<string>();
      const neededStepNames = new Set<string>();
      for (const p of doc.pipelines) {
        if (String(p.id) === id) { continue; }
        for (const step of (p.steps ?? []) as Array<string | Record<string, unknown>>) {
          if (typeof step === 'string') { neededAgents.add(step); neededStepNames.add(step); continue; }
          const agent = typeof step.agent === 'string' ? step.agent : '';
          if (agent) { neededAgents.add(agent); }
          const stepName = typeof step.name === 'string' ? step.name : agent;
          if (stepName) { neededStepNames.add(stepName); }
          if (Array.isArray(step.skills)) {
            for (const s of step.skills) { neededSkills.add(String(s)); }
          }
        }
      }

      doc.agents = doc.agents.filter(
        (a) => !(ownedAgentIds.has(String(a.id)) && !neededAgents.has(String(a.id))),
      );
      doc.skills = doc.skills.filter(
        (s) => !(ownedSkillIds.has(String(s.id)) && !neededSkills.has(String(s.id))),
      );
      doc.slash_commands = doc.slash_commands.filter((c) => {
        const name = String(c.name);
        const agent = typeof (c as { agent?: unknown }).agent === 'string'
          ? (c as { agent: string }).agent : '';
        // Drop an owned slash command only when the agent it points at is
        // being removed (i.e. no remaining pipeline still needs that agent).
        return !(ownedSlashNames.has(name) && agent !== '' && !neededAgents.has(agent));
      });
      doc.pipelines = doc.pipelines.filter((p) => String(p.id) !== id);

      // `.claude/commands/<pipeline>-<phase>.md` files for phases no longer
      // referenced by any remaining pipeline. Namespaced by this pipeline id
      // so we only delete this pipeline's command files. Stashed for FS cleanup.
      const removeCmdIds = new Set<string>(
        [...myPhaseIds]
          .filter((pid) => !neededStepNames.has(pid))
          .map((pid) => pipelineCommandId(id, pid)),
      );
      Object.assign(this, { _lastDeletePhaseIds: removeCmdIds });
    });

    const toRemove: Set<string> = (this as unknown as { _lastDeletePhaseIds?: Set<string> })
      ._lastDeletePhaseIds ?? new Set();

    const root = this.getRootOrWarn();
    if (root) {
      const commandsDir = path.join(root, '.claude', 'commands');
      if (fs.existsSync(commandsDir)) {
        for (const file of fs.readdirSync(commandsDir)) {
          if (!file.endsWith('.md')) { continue; }
          const cmdId = file.slice(0, -3);
          if (toRemove.has(cmdId)) {
            try { fs.unlinkSync(path.join(commandsDir, file)); } catch { /* non-fatal */ }
          }
        }
      }
    }

    // Overlap source = workflows still applied in workspace.yaml after the
    // delete. If the user removes their only applied pipeline, every file
    // gets cleaned up — even shared ones — because nothing else needs them.
    // Falling back to "any globally-installed workflow" would over-preserve
    // (the parallel + sequential workflows share `templates/sdlc/`, so each
    // sees the other as installed even when neither is applied).
    const root2 = this.getRootOrWarn();
    const remainingPipelines = root2 ? (readYaml(root2)?.pipelines ?? []) : [];
    const preserveWorkflowIds = remainingPipelines
      .map((p) => getBuiltinWorkflowByPipelineId(String(p.id))?.id)
      .filter((id): id is string => Boolean(id));
    uninstallWorkflowGlobalsByIds(
      [builtin.id],
      undefined,
      this.extensionUri.fsPath,
      preserveWorkflowIds,
    );
    this.refresh();
  }

  private async deleteItem(
    field: 'agents' | 'skills' | 'pipelines',
    id: string,
    /** Webview already confirmed via inline modal — skip the VS Code dialog. */
    skipConfirm = false,
  ): Promise<void> {
    if (!id) { return; }
    if (!skipConfirm) {
      const confirm = await vscode.window.showWarningMessage(
        `Delete ${field.replace(/s$/, '')} \`${id}\`?`,
        { modal: true }, 'Delete', 'Cancel',
      );
      if (confirm !== 'Delete') { return; }
    }
    this.mutateYaml((doc) => {
      const arr = doc[field];
      if (!Array.isArray(arr)) { return false; }
      const idx = arr.findIndex((x) => x.id === id);
      if (idx < 0) { return false; }
      arr.splice(idx, 1);
    });
  }

  private async renameItem(
    field: 'agents' | 'skills' | 'pipelines',
    id: string,
    /** Webview already prompted via inline RenameModal — use this directly
     * and skip the VS Code input box. Falsy for command-palette flows. */
    newIdArg?: string,
  ): Promise<void> {
    if (!id) { return; }
    let newId = newIdArg;
    if (!newId) {
      newId = await vscode.window.showInputBox({
        prompt: `New ID for ${field.replace(/s$/, '')} \`${id}\``,
        value: id,
        validateInput: (v) => v && v.trim() ? null : 'ID cannot be empty',
      });
    }
    const trimmed = newId?.trim();
    if (!trimmed || trimmed === id) { return; }
    this.mutateYaml((doc) => {
      const arr = doc[field];
      if (!Array.isArray(arr)) { return false; }
      const item = arr.find((x) => x.id === id);
      if (!item) { return false; }
      if (arr.some((x) => x.id === trimmed)) { return false; }
      item.id = trimmed;
      // Renaming a pipeline must carry its live references along — slash
      // commands point at the pipeline by id, so leaving them stale would
      // silently break `/start-epic`-style entry points.
      if (field === 'pipelines' && Array.isArray(doc.slash_commands)) {
        for (const cmd of doc.slash_commands as Array<{ pipeline?: unknown }>) {
          if (cmd.pipeline === id) { cmd.pipeline = trimmed; }
        }
      }
    });
  }

  private async duplicateItem(field: 'agents' | 'skills' | 'pipelines', id: string): Promise<void> {
    if (!id) { return; }
    this.mutateYaml((doc) => {
      const arr = doc[field];
      if (!Array.isArray(arr)) { return false; }
      const item = arr.find((x) => x.id === id);
      if (!item) { return false; }
      const newId = id + '-copy';
      const suffix = arr.filter((x) => String(x.id).startsWith(newId)).length;
      const finalId = suffix === 0 ? newId : newId + '-' + suffix;
      const clone = JSON.parse(JSON.stringify(item));
      clone.id = finalId;
      const idx = arr.findIndex((x) => x.id === id);
      arr.splice(idx + 1, 0, clone);
    });
  }

  private async togglePipelineFailure(pipelineId: string): Promise<void> {
    if (!pipelineId) { return; }
    this.mutateYaml((doc) => {
      const p = doc.pipelines.find((x) => x.id === pipelineId);
      if (!p) { return false; }
      p.on_failure = p.on_failure === 'continue' ? 'stop' : 'continue';
    });
  }

  private async startPipelineRunForEpic(
    epicId: string,
    pipelineId: string,
  ): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) { return; }
    const doc = readYaml(root);
    if (!doc) {
      void vscode.window.showWarningMessage('AIDLC: no workspace.yaml found.');
      return;
    }
    const pipeline = (doc.pipelines as PipelineConfig[] | undefined)?.find((p) => p.id === pipelineId);
    if (!pipeline) {
      void vscode.window.showWarningMessage(`Pipeline "${pipelineId}" not found.`);
      return;
    }
    const existing = RunStateStore.load(root, epicId);
    const epic = listEpics(root, doc).find((x) => x.id === epicId);
    if (existing) {
      void vscode.window.showInformationMessage(
        `Run "${epicId}" already exists (status: ${existing.status}).`,
      );
      this.refresh();
      return;
    }
    const context: Record<string, string> = { epic: epicId };
    if (epic) {
      try {
        const inputsPath = path.join(epic.epicDir, 'inputs.json');
        if (fs.existsSync(inputsPath)) {
          const parsed = JSON.parse(fs.readFileSync(inputsPath, 'utf8'));
          if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed)) {
              if (typeof v === 'string') { context[k] = v; }
            }
          }
        }
      } catch { /* ignore */ }
    }
    try {
      const runState = startRun({ runId: epicId, pipeline, context, workspaceRoot: root });
      RunStateStore.save(root, runState);
      mirrorRunStateToEpic(root, runState, readYaml(root));
      void vscode.window.showInformationMessage(
        `Pipeline run "${epicId}" started — current step: ${runState.steps[runState.currentStepIdx].agent}.`,
      );
      this.refresh();
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Failed to start pipeline run: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── HTML shell ──────────────────────────────────────────────────────────

  private getHtml(): string {
    const nonce = makeNonce();
    const webview = this.panel.webview;
    const cspSource = webview.cspSource;
    const title = extensionDisplayName(this.extensionUri.fsPath);
    try {
      const fallback = missingBundleHtml(this.extensionUri.fsPath, 'workspace.js', cspSource, nonce);
      if (fallback) { return fallback; }
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (root) { this.ensureWorkflowTemplates(root); }
      const initialState = this.buildWebviewState();
      const initialTheme = themeManager.current;

      const assetsRoot = vscode.Uri.joinPath(this.extensionUri, 'out', 'webviews');
      // Cache-bust by the bundle's mtime: the webview otherwise serves a stale
      // cached workspace.js after a rebuild (same URI → old JS keeps running).
      const bust = (p: string): string => {
        try { return `?v=${Math.floor(fs.statSync(p).mtimeMs).toString(36)}`; } catch { return ''; }
      };
      const cssPath = vscode.Uri.joinPath(assetsRoot, 'styles.css');
      const entryPath = vscode.Uri.joinPath(assetsRoot, 'workspace.js');
      const cssUri = webview.asWebviewUri(cssPath).toString() + bust(cssPath.fsPath);
      const entryUri = webview.asWebviewUri(entryPath).toString() + bust(entryPath.fsPath);

      return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           img-src ${cspSource} https: data:;
           font-src ${cspSource} https: data:;
           style-src ${cspSource} 'unsafe-inline';
           script-src 'nonce-${nonce}' ${cspSource};
           frame-src ${cspSource};">
<title>${title}</title>
<link rel="stylesheet" href="${cssUri}">
</head>
<body>
<div id="app"><p style="margin:24px;font:13px/1.5 var(--vscode-font-family);color:var(--vscode-descriptionForeground)">Loading AIDLC Workspace…</p></div>
<script nonce="${nonce}">
window.__AIDLC_INITIAL_STATE__ = ${embedJsonForScript(initialState)};
window.__AIDLC_INITIAL_THEME__ = ${embedJsonForScript(initialTheme)};
</script>
<script type="module" nonce="${nonce}" src="${entryUri}"></script>
</body>
</html>`;
    } catch (error) {
      const detail = error instanceof Error ? error.stack ?? error.message : String(error);
      workspaceOutput.appendLine(`[workspace html] ${detail}`);
      return this.errorHtml(`${title} could not load`, detail, cspSource);
    }
  }

  private errorHtml(heading: string, detail: string, cspSource?: string): string {
    const title = extensionDisplayName(this.extensionUri.fsPath);
    const csp = cspSource ?? this.panel.webview.cspSource;
    const safe = detail.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch] ?? ch));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'unsafe-inline';">
<title>${title}</title>
<style>
  body { font-family: var(--vscode-font-family); padding: 24px; color: var(--vscode-foreground); line-height: 1.5; }
  h1 { font-size: 1.05rem; margin: 0 0 12px; }
  pre { white-space: pre-wrap; background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 6px; font-size: 12px; }
</style>
</head>
<body>
<h1>${heading}</h1>
<p>Reload the Extension Development Host after <code>pnpm --filter aidlc-o00ontcong bundle:webviews</code> (or <code>watch</code>) finishes.</p>
<pre>${safe}</pre>
</body>
</html>`;
  }
}

/**
 * Open a folder in VS Code. If a project is already open, ask whether to
 * reuse the current window or open a new one; otherwise reuse silently.
 */
async function openFolder(uri: vscode.Uri): Promise<void> {
  const hasProject = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  let forceNew = false;
  if (hasProject) {
    const choice = await vscode.window.showQuickPick(
      [
        { label: '$(window) Current window', value: 'current', description: 'Replace the current project' },
        { label: '$(empty-window) New window', value: 'new', description: 'Keep the current project open' },
      ],
      { title: 'Open project in…', placeHolder: 'Current window or new window?' },
    );
    if (!choice) { return; } // cancelled
    forceNew = choice.value === 'new';
  }
  await vscode.commands.executeCommand(
    'vscode.openFolder', uri, forceNew ? { forceNewWindow: true } : { forceReuseWindow: true },
  );
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) { out += chars[Math.floor(Math.random() * chars.length)]; }
  return out;
}
