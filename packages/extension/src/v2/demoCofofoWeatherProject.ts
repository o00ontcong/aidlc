/**
 * `aidlc.loadCofofoWeatherDemoProject` — copies a realistic, executable
 * CoFoFo test workspace to `~/aidlc-cofofo-weather-demo`.
 *
 * The fixture deliberately mirrors the iOS TodoKit demo's file-backed seeding
 * pattern: a Swift package and workflow assets live under `media/`, while
 * time-sensitive epic/run state is generated when the user opens the demo.
 * That keeps a VSIX reproducible and makes the gate states feel current.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  CofofoFoundationService,
  WorkspaceLoader,
  assemblePipeline,
  buildBundleBinding,
  buildReviewBundle,
  composeWorkspaceFromBundle,
  createDefaultRules,
  detectStack,
  hashFile,
  hashObject,
  installCatalog,
  installCofofoPhaseSkills,
  installCofofoProviderCommands,
  normalizeStep,
  renderProjectRules,
  renderProviderContext,
  ProjectRulesSchema,
  resolveArtifactPath,
  selectCatalog,
  sha256,
  snapshotPipeline,
  generatedCofofoWorkspace,
  COFOFO_BUNDLE_BINDING_PATH,
  type CofofoFoundationSnapshot,
  type PipelineConfig,
  type WorkspaceConfig,
} from '@aidlc/core';
import { writeYaml, type YamlDocument } from './yamlIO';

const DEMO_DIR_NAME = 'aidlc-cofofo-weather-demo';
const FOUNDATION_RECIPE = 'cofofo-bootstrap';
const FEATURE_RECIPE = 'cofofo-feature';
const BUGFIX_RECIPE = 'cofofo-bugfix';

const TREE_MAP: Array<[string, string]> = [
  ['src', 'src'],
  ['aidlc', '.aidlc'],
  ['claude', '.claude'],
  ['epics', path.join('docs', 'epics')],
];
const ROOT_FILES = ['README.md', 'CLAUDE.md'];

type RunStatus = 'pending' | 'awaiting_work' | 'awaiting_auto_review' | 'awaiting_review' | 'approved' | 'rejected';
type EpicStepStatus = 'pending' | 'in_progress' | 'done';
type DemoRecipe = typeof FOUNDATION_RECIPE | typeof FEATURE_RECIPE | typeof BUGFIX_RECIPE;

interface DemoHistoryEvent {
  kind: 'approve' | 'reject' | 'rerun' | 'auto_review' | 'canvas_verdict' | 'bug_report';
  revision: number;
  reason?: string;
  feedback?: string;
  sentBackToIdx?: number;
  decision?: 'pass' | 'reject';
  runner?: string;
  verdict?: 'approve' | 'request_changes';
  reviewer?: string;
  bundleHash?: string;
  report?: string;
  /** Explicit event time for long-running/stale scenarios. */
  hoursAgo?: number;
}

interface DemoEpicSpec {
  id: string;
  title: string;
  description: string;
  /** Every seeded run is materialized from this real provider-neutral recipe. */
  pipeline: DemoRecipe;
  currentStepIdx: number;
  currentStatus: RunStatus;
  createdHoursAgo: number;
  completed?: boolean;
  /** A system guard, not a reviewer, terminated this illustrative run. */
  failed?: boolean;
  systemBlocked?: boolean;
  updatedHoursAgo?: number;
  feedback?: string;
  inputs?: Record<string, string>;
  history?: Record<number, DemoHistoryEvent[]>;
}

const DEMO_EPICS: DemoEpicSpec[] = [
  {
    id: 'COFOFO-WEATHER-FOUNDATION',
    title: 'CoFoFo: Foundation revision 2 đã active',
    description: 'Bootstrap Foundation đã hoàn tất từ stack profile tới context manifest. Policy/catalog/context đều có Canvas verdict, asset manifest và hash thật; mọi delivery run mới ghim revision 2 trước khi bắt đầu.',
    pipeline: FOUNDATION_RECIPE,
    currentStepIdx: 5,
    currentStatus: 'approved',
    completed: true,
    createdHoursAgo: 120,
  },
  {
    id: 'COFOFO-WEATHER-001-GATE',
    title: 'CoFoFo: delivery ghim Foundation context',
    description: 'Run được tạo sau khi Foundation revision 2 active. Mở run state để thấy revision, manifest path và SHA-256 được ghim; mọi phase sẽ fail closed nếu context hiện tại lệch snapshot này.',
    pipeline: FEATURE_RECIPE,
    currentStepIdx: 0,
    currentStatus: 'awaiting_work',
    createdHoursAgo: 3,
    inputs: { brief: 'Thêm cảnh báo nắng nóng khi nhiệt độ hiện tại vượt ngưỡng của thành phố.' },
  },
  {
    id: 'COFOFO-WEATHER-002-CANVAS',
    title: 'CoFoFo: Canvas review cho kế hoạch',
    description: 'TASK-PLAN.md đã có và đang chờ Canvas verdict. Mở bằng `aidlc run review COFOFO-WEATHER-002-CANVAS` để kiểm thử review content-addressed.',
    pipeline: FEATURE_RECIPE,
    currentStepIdx: 1,
    currentStatus: 'awaiting_review',
    createdHoursAgo: 26,
    inputs: { brief: 'Thêm cảnh báo nắng nóng khi nhiệt độ hiện tại vượt ngưỡng của thành phố.' },
  },
  {
    id: 'COFOFO-WEATHER-003-RED',
    title: 'CoFoFo: implement — RED trước production mutation',
    description: 'Tạo test `testHighTemperatureAlertRequiresThreshold`, capture RED trong phase implement, rồi để validator xác nhận test thật sự đỏ trước khi sửa production code.',
    pipeline: FEATURE_RECIPE,
    currentStepIdx: 2,
    currentStatus: 'awaiting_work',
    createdHoursAgo: 30,
    inputs: { brief: 'Thêm cảnh báo nắng nóng khi nhiệt độ hiện tại vượt ngưỡng của thành phố.' },
  },
  {
    id: 'COFOFO-WEATHER-004-REJECTED',
    title: 'CoFoFo: sửa kế hoạch theo Canvas feedback',
    description: 'Kế hoạch bị yêu cầu làm rõ ownership của ngưỡng nhiệt và test regression. Rerun giữ feedback trên revision mới.',
    pipeline: FEATURE_RECIPE,
    currentStepIdx: 1,
    currentStatus: 'rejected',
    failed: true,
    systemBlocked: true,
    createdHoursAgo: 50,
    feedback: 'Nêu rõ ngưỡng nhiệt thuộc City hay policy, và liên kết mỗi acceptance criterion với test Swift cụ thể.',
    inputs: { brief: 'Thêm cảnh báo nắng nóng khi nhiệt độ hiện tại vượt ngưỡng của thành phố.' },
  },
  {
    id: 'COFOFO-WEATHER-005-COMPLETED',
    title: 'CoFoFo: feature đã ship thành công',
    description: 'Run hoàn tất requirement → plan → implement → test. Mở History để thấy Canvas verdict và machine evidence.',
    pipeline: FEATURE_RECIPE,
    currentStepIdx: 3,
    currentStatus: 'approved',
    completed: true,
    createdHoursAgo: 72,
    inputs: { brief: 'Thêm cảnh báo nắng nóng khi nhiệt độ hiện tại vượt ngưỡng của thành phố.' },
  },
  {
    id: 'COFOFO-WEATHER-006-BUGFIX-COMPLETED',
    title: 'CoFoFo: bugfix đã hoàn tất sau rework',
    description: 'Bug production về forecast cũ sau khi đổi timezone đã được chẩn đoán, tái hiện, sửa và verify. Step implement từng bị Request changes vì thiếu regression test; audit history vẫn giữ nguyên sau rerun.',
    pipeline: BUGFIX_RECIPE,
    currentStepIdx: 3,
    currentStatus: 'approved',
    completed: true,
    createdHoursAgo: 96,
    inputs: { brief: 'Forecast hiển thị dữ liệu của ngày hôm qua sau khi người dùng đổi timezone.' },
    history: {
      0: [
        { kind: 'bug_report', revision: 1, report: 'Current: forecast cũ sau timezone change; expected: ngày hiện tại theo timezone mới.' },
        { kind: 'canvas_verdict', revision: 1, verdict: 'approve', reviewer: 'Demo Reviewer', bundleHash: 'demo-bug-root-cause-v1' },
        { kind: 'approve', revision: 1 },
      ],
      2: [
        { kind: 'auto_review', revision: 1, decision: 'pass', reason: 'GREEN test pass nhưng chưa có regression coverage cho cache key.', runner: '.aidlc/validators/green-weather-alert.mjs' },
        { kind: 'reject', revision: 1, reason: 'Bổ sung regression test cho cache key theo timezone.', sentBackToIdx: 2 },
        { kind: 'rerun', revision: 2, feedback: 'Đã thêm test đổi timezone và cache invalidation.' },
        { kind: 'auto_review', revision: 2, decision: 'pass', reason: 'Regression test pass; output nằm đúng layer Data.', runner: '.aidlc/validators/green-weather-alert.mjs' },
        { kind: 'canvas_verdict', revision: 2, verdict: 'approve', reviewer: 'Demo Reviewer', bundleHash: 'demo-bug-green-v2' },
        { kind: 'approve', revision: 2 },
      ],
    },
  },
  {
    id: 'COFOFO-WEATHER-007-PROD-DIAGNOSIS',
    title: 'CoFoFo: incident production chờ duyệt nguyên nhân',
    description: 'Bug chỉ xảy ra trên thiết bị thật khi API trả 429. ROOT-CAUSE.md đã ghi causal chain và failure oracle; phải duyệt Canvas diagnosis trước khi được viết test hoặc chạm production code.',
    pipeline: BUGFIX_RECIPE,
    currentStepIdx: 0,
    currentStatus: 'awaiting_review',
    createdHoursAgo: 18,
    inputs: { brief: 'Weather API trả 429 khiến màn hình giữ forecast cũ nhưng không báo trạng thái degraded.' },
  },
  {
    id: 'COFOFO-WEATHER-008-RED-WAIVER',
    title: 'CoFoFo: RED waiver cho lỗi không ổn định',
    description: 'Race condition chỉ tái hiện trên production nên simulator không tạo được RED assertion ổn định. Đây là điểm demo đường miễn trừ có reviewer, lý do, evidence thay thế và secret screening — không phải một ô tick tự động.',
    pipeline: BUGFIX_RECIPE,
    currentStepIdx: 1,
    currentStatus: 'awaiting_review',
    createdHoursAgo: 42,
    inputs: { brief: 'Đôi lúc refresh đồng thời làm mất trạng thái loading và hiển thị dữ liệu nửa cũ nửa mới.' },
  },
  {
    id: 'COFOFO-WEATHER-009-STALE-REBASE',
    title: 'CoFoFo: delivery bị dừng vì Foundation đổi',
    description: 'Run đã qua verify nhưng Foundation revision mới thay đổi rule về ownership/cache. Không được tiếp tục trên policy cũ; phải dùng Rebase Delivery Run để replay các phase dưới manifest mới.',
    pipeline: FEATURE_RECIPE,
    currentStepIdx: 2,
    currentStatus: 'rejected',
    createdHoursAgo: 150,
    updatedHoursAgo: 54,
    feedback: 'Foundation revision changed from 1 to 2; rebase is mandatory before implement can continue.',
    inputs: { brief: 'Thêm cảnh báo mưa lớn theo forecast 6 giờ tới.' },
    history: {
      2: [
        { kind: 'auto_review', revision: 1, decision: 'reject', runner: 'cofofo-foundation-guard', reason: 'Foundation revision changed; approved work must be replayed.', hoursAgo: 54 },
      ],
    },
  },
  {
    id: 'COFOFO-WEATHER-010-RULE-IMPROVEMENT',
    title: 'CoFoFo: verification chờ duyệt cuối',
    description: 'Epic chờ Canvas duyệt TEST-REPORT và VERIFY sau khi implement hoàn tất — minh họa gate test cuối pipeline 4 bước.',
    pipeline: FEATURE_RECIPE,
    currentStepIdx: 3,
    currentStatus: 'awaiting_review',
    createdHoursAgo: 84,
    inputs: { brief: 'Chuẩn hóa cache key theo city + timezone cho mọi weather provider.' },
  },
];

export async function loadCofofoWeatherDemoProjectCommand(
  extensionPath: string,
  mode?: 'reseed' | 'open-as-is',
): Promise<void> {
  const demoRoot = path.join(os.homedir(), DEMO_DIR_NAME);
  const exists = fs.existsSync(demoRoot);
  const isAlreadyOpen = (vscode.workspace.workspaceFolders ?? [])
    .some((folder) => path.resolve(folder.uri.fsPath) === path.resolve(demoRoot));
  let action: 'reseed' | 'open-as-is' = 'open-as-is';

  if (exists) {
    if (mode) {
      action = mode;
    } else {
      const choice = await vscode.window.showWarningMessage(
        `CoFoFo Weather demo already exists at ~/${DEMO_DIR_NAME}. Re-seed (overwrites src/, .aidlc/, docs/) or open it as-is?`,
        { modal: false },
        'Re-seed and open',
        'Open as-is',
        'Cancel',
      );
      if (choice === 'Cancel' || choice === undefined) { return; }
      action = choice === 'Re-seed and open' ? 'reseed' : 'open-as-is';
    }
    if (action === 'reseed') {
      try {
        wipeDemo(demoRoot);
        seedCofofoWeatherDemo(demoRoot, extensionPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Không thể tạo lại CoFoFo Weather demo: ${message}`);
        return;
      }
    }
  } else {
    try {
      seedCofofoWeatherDemo(demoRoot, extensionPath);
      action = 'reseed';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Không thể tạo CoFoFo Weather demo: ${message}`);
      return;
    }
  }

  // Opening the folder that is already active is intentionally a no-op in VS
  // Code. Say so explicitly; otherwise a successful Re-seed looks like the
  // button failed even though its files were just replaced.
  if (isAlreadyOpen) {
    await vscode.commands.executeCommand('aidlc.refreshSidebar');
    void vscode.window.showInformationMessage(
      action === 'reseed'
        ? 'CoFoFo Weather demo đã được tạo lại và đang mở.'
        : 'CoFoFo Weather demo đang mở sẵn.',
    );
    return;
  }

  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(demoRoot), false);
}

/** Remove only paths owned by this fixture; scratch files in the demo root survive. */
function wipeDemo(root: string): void {
  for (const rel of ['src', '.aidlc', '.claude', 'docs', 'README.md', 'CLAUDE.md']) {
    fs.rmSync(path.join(root, rel), { recursive: true, force: true });
  }
}

function demoAssetRoot(extensionPath: string): string {
  const dir = path.join(extensionPath, 'media', 'cofofo-weather-demo');
  if (!fs.existsSync(path.join(dir, 'aidlc', 'workspace.yaml'))) {
    throw new Error(`CoFoFo Weather demo assets not found at ${dir} — media/cofofo-weather-demo/ is missing from the extension.`);
  }
  return dir;
}

export function seedCofofoWeatherDemo(root: string, extensionPath: string): void {
  const assets = demoAssetRoot(extensionPath);
  for (const [from, to] of TREE_MAP) {
    copyDir(path.join(assets, from), path.join(root, to));
  }
  for (const file of ROOT_FILES) {
    copyFile(path.join(assets, file), path.join(root, file));
  }
  // These old fixture conveniences would expose slash commands that are not
  // attached to the generated workflow. Keep only validators and let the
  // generator install every phase skill/provider command below.
  fs.rmSync(path.join(root, '.aidlc', 'skills'), { recursive: true, force: true });
  fs.rmSync(path.join(root, '.claude', 'commands'), { recursive: true, force: true });

  // Do not inherit the historical hand-written demo pipelines. The demo is a
  // regression harness for recipe assembly, so every visible run must start
  // from exactly the generator production workspaces use, then overlay the
  // audited ECC bundle binding the way publish-context does in production.
  const generated = generatedCofofoWorkspace({
    version: '1.0',
    name: 'SkyCast CoFoFo Weather Demo',
    environment: {},
  });
  installCofofoPhaseSkills(root);
  const activeFoundation = seedActiveFoundation(root, extensionPath, generated);
  const composed = WorkspaceLoader.load(root).config;
  const materialized = new Map<string, PipelineConfig>();
  for (const spec of DEMO_EPICS) {
    materialized.set(spec.id, assemblePipeline(composed, {
      recipeId: spec.pipeline,
      pipelineId: `${spec.id}-PIPELINE`,
    }));
  }
  // Derived, never hard-coded: `create-plan` is gated on citing every *current*
  // blocking ruleId, so a fixture that lists invented ids dead-ends the moment
  // a human reruns the phase. Reading them back from the rules this seed just
  // wrote keeps the demo honest when the rule engine gains a rule.
  const blockingRuleIds = ProjectRulesSchema
    .parse(JSON.parse(fs.readFileSync(path.join(root, 'docs/project/foundation/PROJECT-RULES.json'), 'utf8')))
    .rules.filter((rule) => rule.severity === 'block')
    .map((rule) => rule.ruleId);

  for (const spec of DEMO_EPICS) {
    const pipeline = materialized.get(spec.id);
    if (!pipeline) throw new Error(`Demo recipe "${spec.pipeline}" was not materialized.`);
    seedProducedArtifacts(root, spec, pipeline, blockingRuleIds);
    writeEpicState(root, spec, pipeline);
    writeRunState(root, spec, pipeline, activeFoundation);
    seedEvidenceLedger(root, spec, pipeline);
  }
}

/**
 * Materialize a trustworthy active Foundation before any delivery run is
 * seeded. This uses the real stack detector, rule renderer and audited catalog
 * installer, then writes the same content-addressed context/state contract the
 * runtime validates. Delivery examples can therefore pin a context that
 * genuinely exists instead of depending on an unfinished demo Epic.
 */
function seedActiveFoundation(
  root: string,
  extensionPath: string,
  skeleton: WorkspaceConfig,
): CofofoFoundationSnapshot {
  const revision = 2;
  const detectedAt = isoOffset(-119.9);
  const rulesAt = isoOffset(-119.4);
  const architectureAt = isoOffset(-118.6);
  const installedAt = isoOffset(-117.7);
  const publishedAt = isoOffset(-117.4);
  const activatedAt = isoOffset(-117.1);
  const foundationDir = path.join(root, 'docs', 'project', 'foundation');
  const stackJson = path.join(foundationDir, 'STACK-PROFILE.json');
  const rulesJson = path.join(foundationDir, 'PROJECT-RULES.json');
  const architecturePath = path.join(foundationDir, 'ARCHITECTURE-MAP.md');
  const installedPath = path.join(foundationDir, 'INSTALLED-ASSETS.json');
  const bundleBindingPath = path.join(foundationDir, 'BUNDLE-BINDING.json');
  const providerContextPath = path.join(foundationDir, 'PROVIDER-CONTEXT.md');
  const contextPath = path.join(foundationDir, 'CONTEXT-MANIFEST.json');

  const profile = detectStack(root, detectedAt);
  if (profile.mode !== 'cofofo' || !profile.stack) {
    throw new Error('SkyCast demo must be detected as one audited SwiftPM stack.');
  }
  writeJson(stackJson, profile);
  writeFile(path.join(foundationDir, 'STACK-PROFILE.md'), [
    '# Stack Profile', '',
    '- schemaVersion: 1',
    `- Stack: ${profile.stack.id}`,
    `- Package manager: ${profile.stack.packageManager}`,
    `- Build system: ${profile.stack.buildSystem}`,
    `- Confidence: ${profile.confidence}`,
    '', '## Machine Evidence', '',
    ...profile.evidence.map((item) => `- ${item.path} — ${item.observed} — ${item.sha256}`),
    '',
  ].join('\n'));

  const rules = createDefaultRules(profile, revision, rulesAt);
  writeJson(rulesJson, rules);
  writeFile(path.join(foundationDir, 'PROJECT-RULES.md'), renderProjectRules(rules));
  writeFile(path.join(foundationDir, 'RULE-DRIFT.md'), '# Rule Drift\n\n## Findings\n\n- No current blocking violations.\n');
  writeFile(architecturePath, [
    '# Architecture Map', '',
    '## Layer Map', '',
    '- `src/Sources/SkyCast/Domain`: immutable weather values.',
    '- `src/Sources/SkyCast/Data`: provider boundary and state ownership.',
    '- `src/Sources/SkyCast/Presentation`: SwiftUI rendering.',
    '- `src/Tests/SkyCastTests`: deterministic behavior tests.',
    '', '## Dependency Direction', '',
    'Presentation → Data → Domain. Domain does not import SwiftUI.',
    '', '## Test Seams', '',
    '`WeatherProviding` is injected and replaced with deterministic fixtures.',
    '',
  ].join('\n'));

  const catalogRoot = resolveDemoCatalogRoot(extensionPath);
  const installed = installCatalog({
    workspaceRoot: root,
    profile,
    foundationRevision: revision,
    catalogRoot,
    now: installedAt,
  });
  writeFile(path.join(foundationDir, 'ECC-CATALOG-SELECTION.md'), [
    '# ECC Catalog Selection', '',
    `Pinned revision: ${installed.catalogRevision}`, '',
    '## Approved Text Assets', '',
    ...installed.assets.map((asset) => `- ${asset.id} · ${asset.kind} · ${asset.sourcePath} · ${asset.sha256}`),
    '', 'Only audited Markdown agents/skills are installed; executable assets and runtime network fetches are rejected.', '',
  ].join('\n'));

  const selection = selectCatalog(profile);
  if (!selection) {
    throw new Error('SkyCast demo requires an audited Swift catalog selection.');
  }
  const binding = buildBundleBinding({ selection, installed, foundationRevision: revision });
  writeJson(bundleBindingPath, binding);

  const workspace = composeWorkspaceFromBundle({
    workspaceRoot: root,
    skeleton: {
      ...skeleton,
      description: 'Built-in CoFoFo workflow set: Foundation source + Delivery source with Feature/Bugfix recipes. Demo scenarios live only as immutable run snapshots.',
    },
    binding,
    installed,
  });
  writeYaml(root, workspace as unknown as YamlDocument);

  const bindingHash = hashFile(bundleBindingPath);
  const providerContext = renderProviderContext({
    foundationRevision: revision,
    stackId: profile.stack.id,
    catalogRevision: installed.catalogRevision,
    binding,
    rulesJsonPath: 'docs/project/foundation/PROJECT-RULES.json',
    architecturePath: 'docs/project/foundation/ARCHITECTURE-MAP.md',
    stackProfilePath: 'docs/project/foundation/STACK-PROFILE.json',
    bundleBindingPath: COFOFO_BUNDLE_BINDING_PATH,
  });
  writeFile(providerContextPath, `${providerContext}\n`);

  // The context manifest trusts bytes, not filesystem timestamps. A clone
  // assigns fresh mtimes even when every canonical artifact is unchanged.
  const contextArtifacts = [
    stackJson, rulesJson, architecturePath, installedPath, bundleBindingPath, providerContextPath,
  ];
  const draft = {
    schemaVersion: 2 as const,
    bindingPath: COFOFO_BUNDLE_BINDING_PATH,
    bindingHash,
    foundationRevision: revision,
    catalogRevision: installed.catalogRevision,
    stackId: profile.stack.id,
    generatedAt: publishedAt,
    artifacts: contextArtifacts.map((absolute) => ({
      path: path.relative(root, absolute).split(path.sep).join('/'),
      sha256: hashFile(absolute),
    })),
    providers: ['claude', 'cursor', 'codex', 'opencode'] as const,
  };
  const manifest = { ...draft, contentHash: hashObject(draft) };
  writeJson(contextPath, manifest);
  const manifestHash = hashFile(contextPath);
  writeJson(path.join(root, '.aidlc', 'cofofo', 'foundation.json'), {
    schemaVersion: 1,
    revision,
    status: 'ready',
    route: 'bootstrap',
    stackProfilePath: 'docs/project/foundation/STACK-PROFILE.json',
    contextManifestPath: 'docs/project/foundation/CONTEXT-MANIFEST.json',
    contextManifestHash: manifestHash,
    publishedAt,
  });

  const managedBlock = [
    '<!-- aidlc:cofofo-context start -->',
    providerContext,
    '<!-- aidlc:cofofo-context end -->',
  ].join('\n');
  writeManagedContext(path.join(root, 'CLAUDE.md'), managedBlock);
  writeManagedContext(path.join(root, 'AGENTS.md'), managedBlock);
  writeManagedContext(path.join(root, '.cursor', 'rules', 'cofofo.md'), managedBlock);
  writeManagedContext(path.join(root, '.opencode', 'instructions', 'cofofo.md'), managedBlock);
  writeFile(path.join(root, 'docs', 'README.md'), [
    '# Project Documentation', '', managedBlock, '',
    'Reading order:',
    '1. `docs/project/foundation/CONTEXT-MANIFEST.json`',
    '2. `docs/project/foundation/PROJECT-RULES.md`',
    '3. `docs/project/foundation/ARCHITECTURE-MAP.md`',
    '4. `docs/project/foundation/BUNDLE-BINDING.json`',
    '',
  ].join('\n'));
  installCofofoProviderCommands(root, workspace, manifest.contentHash);

  const inspected = new CofofoFoundationService(root).requireReady();
  return { ...inspected, capturedAt: activatedAt };
}

function resolveDemoCatalogRoot(extensionPath: string): string {
  const candidates = [
    path.join(extensionPath, 'templates', 'cofofo', 'catalog'),
    path.resolve(extensionPath, '..', 'core', 'templates', 'cofofo', 'catalog'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'LICENSE')));
  if (!found) throw new Error(`CoFoFo catalog assets are missing; checked ${candidates.join(', ')}`);
  return found;
}

function writeManagedContext(target: string, managed: string): void {
  const start = '<!-- aidlc:cofofo-context start -->';
  const end = '<!-- aidlc:cofofo-context end -->';
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  const first = existing.indexOf(start);
  const last = existing.indexOf(end);
  const content = first >= 0 && last >= first
    ? `${existing.slice(0, first)}${managed}${existing.slice(last + end.length)}`
    : `${existing.trimEnd()}${existing.trim() ? '\n\n' : ''}${managed}\n`;
  writeFile(target, content);
}

function phaseName(pipeline: PipelineConfig, idx: number): string {
  const step = pipeline.steps[idx];
  return step ? (normalizeStep(step).name ?? normalizeStep(step).agent) : `step-${idx + 1}`;
}

function agentFor(pipeline: PipelineConfig, idx: number): string {
  const step = pipeline.steps[idx];
  return step ? normalizeStep(step).agent : 'cofofo-foundation-architect';
}

function isFoundationRecipe(spec: DemoEpicSpec): boolean {
  return spec.pipeline === FOUNDATION_RECIPE;
}

/**
 * Completed and currently-reviewed demo tasks need real files on disk so the
 * Epic artifact index, Canvas bundle builder, and produces-content gate all
 * behave exactly as they do after an agent has worked. Existing static
 * artifacts win; the fixture only fills files that the scenario promises.
 */
function seedProducedArtifacts(
  root: string,
  spec: DemoEpicSpec,
  pipeline: PipelineConfig,
  blockingRuleIds: string[],
): void {
  const shouldHaveThrough = spec.completed
    ? pipeline.steps.length - 1
    : ['awaiting_auto_review', 'awaiting_review', 'rejected'].includes(spec.currentStatus)
      ? spec.currentStepIdx
      : -1;
  const context = { epic: spec.id };

  // BUG-REPORT.md is the input that caused a bugfix run to exist at all: the
  // "Report a problem" action writes it before the run is created, so no step
  // declares it under `produces`. Seeding it from `produces` alone would leave
  // `diagnose` permanently blocked on a missing requirement.
  if (spec.pipeline === BUGFIX_RECIPE) {
    const report = path.join(root, `docs/epics/${spec.id}/artifacts/BUG-REPORT.md`);
    if (!fs.existsSync(report)) writeFile(report, demoBugReport(spec));
  }

  // INTENT.md is likewise an input, not an output: a real epic gets it
  // snapshotted by IdeaService.confirmRouteAndScaffold at scaffold time, so
  // no cofofo-delivery step's `produces` ever writes it — but `requirement`
  // now `requires` it (see WorkflowGenerator.ts), so every feature/bugfix
  // demo epic needs one on disk from the start, not just completed ones.
  if (!isFoundationRecipe(spec)) {
    const intent = path.join(root, `docs/epics/${spec.id}/artifacts/INTENT.md`);
    if (!fs.existsSync(intent)) writeFile(intent, demoIntent(spec));
  }

  if (shouldHaveThrough < 0) return;

  for (let idx = 0; idx <= shouldHaveThrough; idx += 1) {
    const norm = normalizeStep(pipeline.steps[idx]!);
    for (const template of norm.produces) {
      const rel = resolveArtifactPath(template, context);
      // Foundation outputs are intentionally not fabricated: the foundation
      // task must still be run for real. Delivery artifacts are epic-local and
      // are safe deterministic fixtures for completed/review scenarios.
      if (!rel.startsWith(`docs/epics/${spec.id}/artifacts/`)) continue;
      const target = path.join(root, rel);
      if (!fs.existsSync(target)) {
        writeFile(target, demoArtifact(spec, norm.name ?? norm.agent, path.basename(target), idx, blockingRuleIds));
      }
    }
  }
}

/**
 * The three plain-language fields the "Report a problem" action collects, in
 * the shape it writes them. The demo needs a real one on disk so `diagnose`
 * can start and so the Canvas bundle has the same inputs a live run would.
 */
function demoBugReport(spec: DemoEpicSpec): string {
  const brief = spec.inputs?.brief ?? 'Weather behavior for the SkyCast demo.';
  return [
    `<!-- CoFoFo demo fixture: reported problem for ${spec.id}. -->`,
    '',
    `# Bug Report — ${spec.id}`,
    '',
    '## What I did',
    'Opened the SkyCast forecast surface and refreshed for the selected city.',
    '',
    '## What I saw',
    brief,
    '',
    '## What I expected',
    'The forecast surface reflects the current city and timezone state after every refresh.',
    '',
  ].join('\n');
}

function demoIntent(spec: DemoEpicSpec): string {
  const brief = spec.inputs?.brief ?? 'Weather behavior for the SkyCast demo.';
  return [
    `<!-- CoFoFo demo fixture: Ideas-tab intake snapshot for ${spec.id}. -->`,
    '',
    `# Intent — ${spec.id}`,
    '',
    '## Seed',
    brief,
    '',
  ].join('\n');
}

function demoArtifact(
  spec: DemoEpicSpec,
  phase: string,
  filename: string,
  idx: number,
  blockingRuleIds: string[],
): string {
  const brief = spec.inputs?.brief ?? 'Weather behavior for the SkyCast demo.';
  const common = `<!-- CoFoFo demo fixture: deterministic artifact for ${spec.id}, phase ${phase}, revision 1. -->\n`;
  switch (phase) {
    case 'requirement':
      return `${common}# Requirement — ${spec.id}\n\n## Scope\n${brief}\n\n## Acceptance Criteria\n- The behavior is observable from the SwiftUI forecast surface.\n- Existing forecast and error states remain backward compatible.\n- A focused XCTest and the full SwiftPM suite cover the change.\n\n## Non-goals\n- No network dependency is introduced by this demo.\n`;
    // `## Resume From` names the phase the approved diagnosis sends work back
    // to, and the Canvas gate refuses the approval without exactly one valid
    // phase name. These bugs are diagnosed before any code was written, so the
    // run resumes at the next phase rather than rewinding.
    case 'diagnose':
      return `${common}# Root Cause — ${spec.id}\n\n## Reproduction\nExercise the deterministic fixture with a timezone/API-response transition.\n\n## Causal Chain\nInput transition → stale state ownership → presentation reads an old snapshot.\n\n## Failure Oracle\nThe next refresh must expose the current city/timezone state instead of the stale snapshot.\n\n## Resume From\nreproduce\n`;
    // Every currently-blocking ruleId must appear verbatim, or `markStepDone`
    // refuses the phase. The list is passed in from the rules this seed wrote
    // rather than hard-coded, so adding a blocking rule cannot silently strand
    // the demo's rerun scenario again.
    case 'create-plan':
      return `${common}# Task Plan — ${spec.id}\n\n## RED / GREEN Contract\nRED asserts the missing weather behavior before production mutation; GREEN changes the smallest Data/Presentation seam; VERIFY runs build, targeted tests, and the full SwiftPM suite.\n\n## Rule Bindings\n${blockingRuleIds.map((ruleId) => `- ${ruleId}: honored by keeping the change inside the SwiftPM targets, out of Domain→SwiftUI imports, and green under the pinned build/test commands.`).join('\n')}\n\n## Files and Tests\n- Sources/SkyCast/Data/ForecastStore.swift\n- Sources/SkyCast/Presentation/WeatherDashboardView.swift\n- Tests/SkyCastTests/ForecastStoreTests.swift\n`;
    case 'reproduce':
      return `${common}# RED Evidence — ${spec.id}\n\n## Expected Failure\nThe targeted assertion reports the missing behavior for this scenario (for example: 'heat alert missing' or 'stale snapshot after timezone change').\n\nCommand: 'swift test --filter SkyCastTests'\nOracle: failure is behavioral, not a compile/import/syntax error.\n`;
    case 'implement':
      if (filename === 'RED-EVIDENCE.md') {
        return `${common}# RED Evidence — ${spec.id}\n\n## Expected Failure\nThe targeted assertion reports the missing behavior for this scenario.\n\nCommand: 'swift test --filter SkyCastTests'\nOracle: failure is behavioral, not a compile/import/syntax error.\n`;
      }
      if (filename === 'REFACTOR-EVIDENCE.md') {
        return `${common}# Refactor Evidence — ${spec.id}\n\n## Refactor Evidence\nNames and ownership were clarified without changing observable behavior.\n`;
      }
      return `${common}# Implementation Summary — ${spec.id}\n\n## Green Evidence\nThe smallest production change satisfies the RED assertion while preserving deterministic provider injection.\n\n## Scope\nOnly the weather domain/data/presentation seams named in the approved plan were changed.\n\n## Verification\n'swift build' and 'swift test' pass for the SwiftPM package.\n`;
    case 'test':
      if (filename === 'REVIEW.md') {
        return `${common}# Fresh Review — ${spec.id}\n\n## Findings\n- P0: none.\n- P1: none.\n- P2: verify the regression test remains deterministic when the device timezone changes.\n\n## Decision\nThe implementation stays within the reviewed scope.\n`;
      }
      if (filename === 'TEST-REPORT.md') {
        return `${common}# Test Report — ${spec.id}\n\n- swift test: pass\n- swift build: pass\n`;
      }
      return `${common}# Verification — ${spec.id}\n\n## Final Verification\n- 'swift test': pass (4 XCTest baseline plus the scenario regression)\n- Project rules: pass\n- Canvas artifacts: content-addressed and reviewed as one bundle\n\n## Limitations\nThe fixture is offline; live provider credentials and production telemetry are not part of this demo.\n`;
    default:
      return `${common}# ${phase} — ${spec.id}\n\nProduced by the deterministic CoFoFo weather fixture (step ${idx + 1}).\n`;
  }
}

function writeEpicState(root: string, spec: DemoEpicSpec, pipeline: PipelineConfig): void {
  const steps = pipeline.steps.map((_step, idx) => phaseName(pipeline, idx));
  const createdAt = isoOffset(-spec.createdHoursAgo);
  const completed = spec.completed === true;
  const stepStates = steps.map((name, idx) => {
    let status: EpicStepStatus = 'pending';
    if (completed || idx < spec.currentStepIdx) { status = 'done'; }
    else if (idx === spec.currentStepIdx) { status = 'in_progress'; }
    return {
      agent: agentFor(pipeline, idx),
      name,
      status,
      startedAt: completed || idx <= spec.currentStepIdx ? isoOffset(-spec.createdHoursAgo + idx * 0.5) : null,
      finishedAt: completed || idx < spec.currentStepIdx ? isoOffset(-spec.createdHoursAgo + idx * 0.5 + 0.4) : null,
    };
  });
  const epicDir = path.join(root, 'docs', 'epics', spec.id);
  writeJson(path.join(epicDir, 'state.json'), {
    id: spec.id,
    title: spec.title,
    description: spec.description,
    pipeline: pipeline.id,
    agent: null,
    agents: steps.map((_, idx) => agentFor(pipeline, idx)),
    currentStep: completed ? steps.length - 1 : spec.currentStepIdx,
    status: completed ? 'done' : spec.failed ? 'failed' : 'in_progress',
    runMode: 'guided',
    createdAt,
    stepStates,
  });
  writeJson(path.join(epicDir, 'inputs.json'), { epic: spec.id, ...(spec.inputs ?? {}) });
}

function writeRunState(
  root: string,
  spec: DemoEpicSpec,
  pipeline: PipelineConfig,
  activeFoundation: CofofoFoundationSnapshot,
): void {
  const steps = pipeline.steps;
  const context = { epic: spec.id };
  const completed = spec.completed === true;
  const records = steps.map((_, idx) => {
    const norm = normalizeStep(pipeline.steps[idx]!);
    const status = completed || idx < spec.currentStepIdx ? 'approved' : idx === spec.currentStepIdx ? spec.currentStatus : 'pending';
    const artifactsProduced = norm.produces
      .map((item) => resolveArtifactPath(item, context))
      .filter((item) => fs.existsSync(path.join(root, item)));
    const history = historyFor(spec, idx, norm.name ?? norm.agent, status, norm.auto_review_runner);
    const revision = Math.max(1, ...(history ?? []).map((event) => Number(event.revision ?? 1)));
    const record: Record<string, unknown> = {
      stepIdx: idx,
      agent: agentFor(pipeline, idx),
      revision,
      status,
      artifactsProduced,
      ...(history && history.length > 0 ? { history } : {}),
    };
    if (idx === spec.currentStepIdx && spec.feedback) {
      record.feedback = spec.feedback;
      record.rejectReason = spec.feedback;
    }
    // A stale Foundation is a system guard, not a Canvas request_changes.
    const decided = (status === 'approved' || status === 'rejected') && !spec.systemBlocked;
    if (decided && norm.review && norm.review.artifacts.every((item) => {
      const resolved = resolveArtifactPath(item, context);
      return fs.existsSync(path.join(root, resolved));
    })) {
      const bundle = buildReviewBundle({
        workspaceRoot: root,
        runId: spec.id,
        stepIdx: idx,
        stepRevision: revision,
        reviewRevision: 1,
        artifacts: norm.review.artifacts,
        context,
      });
      const at = isoOffset(-spec.createdHoursAgo + idx * 0.5 + 0.3);
      record.canvasReview = status === 'rejected'
        ? { verdict: 'request_changes', reviewer: 'Demo Reviewer', at, bundleHash: bundle.bundleHash, reviewRevision: 1, feedback: spec.feedback }
        : { verdict: 'approve', reviewer: 'Demo Reviewer', at, bundleHash: bundle.bundleHash, reviewRevision: 1 };
      if (!record.history || !(record.history as Array<Record<string, unknown>>).some((event) => event.kind === 'canvas_verdict')) {
        const canvasEvent = {
          kind: 'canvas_verdict',
          at,
          revision,
          verdict: status === 'rejected' ? 'request_changes' : 'approve',
          reviewer: 'Demo Reviewer',
          bundleHash: bundle.bundleHash,
        };
        const timeline = [...((record.history as Array<Record<string, unknown>> | undefined) ?? [])];
        const approveIndex = timeline.findIndex((event) => event.kind === 'approve');
        timeline.splice(approveIndex < 0 ? timeline.length : approveIndex, 0, canvasEvent);
        record.history = timeline;
      }
      if (status === 'approved') record.reviewDisposition = 'human-approved';
    }
    return record;
  });
  writeJson(path.join(root, '.aidlc', 'runs', `${spec.id}.json`), {
    schemaVersion: 1,
    runId: spec.id,
    pipelineId: pipeline.id,
    pipelineSnapshot: snapshotPipeline(pipeline, isoOffset(-spec.createdHoursAgo)),
    ...(!isFoundationRecipe(spec)
      ? { cofofoFoundation: foundationSnapshotFor(spec, activeFoundation) }
      : {}),
    context,
    startedAt: isoOffset(-spec.createdHoursAgo),
    updatedAt: isoOffset(-(spec.updatedHoursAgo ?? Math.max(
      0,
      spec.createdHoursAgo - (completed ? (steps.length - 1) * 0.5 + 0.4 : spec.currentStepIdx * 0.5 + 0.2),
    ))),
    currentStepIdx: completed ? steps.length - 1 : spec.currentStepIdx,
    status: completed ? 'completed' : spec.failed ? 'failed' : 'running',
    steps: records,
  });
}

function foundationSnapshotFor(
  spec: DemoEpicSpec,
  activeFoundation: CofofoFoundationSnapshot,
): CofofoFoundationSnapshot {
  if (spec.id !== 'COFOFO-WEATHER-009-STALE-REBASE') return activeFoundation;
  return {
    revision: 1,
    manifestPath: activeFoundation.manifestPath,
    manifestHash: sha256('SkyCast Foundation revision 1 context manifest'),
    capturedAt: isoOffset(-spec.createdHoursAgo),
  };
}

/**
 * Keep the two completed delivery examples and the waiver example backed by
 * the same durable evidence format that a real CLI capture writes. The logs
 * are deterministic, secret-free fixtures; they are intentionally scoped to
 * delivery runs; their Foundation pin is stored separately in each run state.
 */
function seedEvidenceLedger(root: string, spec: DemoEpicSpec, pipeline: PipelineConfig): void {
  const isCompletedDelivery = spec.completed === true && !isFoundationRecipe(spec);
  const isWaiver = spec.id === 'COFOFO-WEATHER-008-RED-WAIVER';
  if (!isCompletedDelivery && !isWaiver) return;

  const stages = isWaiver ? (['red-waiver'] as const) : (['red', 'green', 'refactor', 'verify'] as const);
  const records: Array<Record<string, unknown>> = [];
  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index]!;
    const evidenceStage = stage === 'red-waiver' ? 'red' : stage;
    let phaseIdx = pipeline.steps.findIndex((step) => normalizeStep(step).evidence?.stage === evidenceStage);
    if (phaseIdx < 0 && evidenceStage === 'red') {
      phaseIdx = pipeline.steps.findIndex((step) => normalizeStep(step).name === 'reproduce');
      if (phaseIdx < 0) {
        phaseIdx = pipeline.steps.findIndex((step) => normalizeStep(step).name === 'implement');
      }
    }
    if (phaseIdx < 0 && (evidenceStage === 'green' || evidenceStage === 'refactor')) {
      phaseIdx = pipeline.steps.findIndex((step) => normalizeStep(step).name === 'implement');
    }
    if (phaseIdx < 0 && evidenceStage === 'verify') {
      phaseIdx = pipeline.steps.findIndex((step) => normalizeStep(step).name === 'test');
    }
    if (phaseIdx < 0) throw new Error(`Demo recipe "${pipeline.id}" has no ${evidenceStage} evidence phase.`);
    const stepRevision = Math.max(1, ...(spec.history?.[phaseIdx] ?? []).map((event) => event.revision));
    const sequence = index + 1;
    const at = isoOffset(-spec.createdHoursAgo + sequence * 0.15);
    const logPath = `.aidlc/evidence/${spec.id}/${String(sequence).padStart(4, '0')}-${stage}.log`;
    const log = stage === 'red-waiver'
      ? 'Production trace: concurrent refresh race reproduced on a real device.\nAlternative evidence: Instruments trace + deterministic state-transition log; no credentials included.\n'
      : stage === 'red'
        ? 'swift test --filter SkyCastTests\nXCTAssertTrue failed: heat alert missing (behavioral oracle).\n'
        : `swift test\n${stage} evidence passed for the deterministic SkyCast fixture.\n`;
    writeFile(path.join(root, logPath), log);
    const draft: Record<string, unknown> = {
      schemaVersion: 2,
      id: `${spec.id}-${sequence}-${stage}`,
      runId: spec.id,
      sequence,
      stage,
      stepRevision,
      args: stage === 'red-waiver' ? [] : stage === 'red' ? ['test', '--filter', 'SkyCastTests'] : ['test'],
      ...(stage === 'red-waiver' ? {} : { commandId: stage === 'red' ? 'swift.test-targeted' : 'swift.test' }),
      startedAt: at,
      finishedAt: at,
      exitStatus: stage === 'red' ? 1 : stage === 'red-waiver' ? null : 0,
      timedOut: false,
      accepted: true,
      ...(stage === 'red' ? { expectedFailure: 'heat alert missing', failureOracleMatched: true } : {}),
      ...(stage === 'red-waiver' ? {
        waiver: {
          reviewer: 'On-call Reviewer',
          reason: 'Race condition only reproduces on production hardware and cannot yield a stable simulator assertion.',
          alternativeEvidence: 'Instruments trace plus deterministic state-transition log; no credentials included.',
        },
      } : {}),
      outputPreview: log,
      logPath,
      logHash: sha256(log),
      ...(records.length > 0 ? { previousHash: records[records.length - 1]!.recordHash } : {}),
    };
    records.push({ ...draft, recordHash: hashObject(draft) });
  }
  writeFile(
    path.join(root, '.aidlc', 'evidence', spec.id, 'ledger.jsonl'),
    `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
  );
}

function historyFor(
  spec: DemoEpicSpec,
  idx: number,
  phase: string,
  status: string,
  autoReviewRunner?: string,
): Record<string, unknown>[] | undefined {
  const supplied = spec.history?.[idx];
  if (supplied) {
    return supplied.map((event, eventIdx) => ({
      kind: event.kind,
      at: isoOffset(event.hoursAgo !== undefined
        ? -event.hoursAgo
        : -spec.createdHoursAgo + idx * 0.5 + (eventIdx + 1) * 0.06),
      revision: event.revision,
      ...(event.reason ? { reason: event.reason } : {}),
      ...(event.feedback ? { feedback: event.feedback } : {}),
      ...(event.sentBackToIdx !== undefined ? { sentBackToIdx: event.sentBackToIdx } : {}),
      ...(event.decision ? { decision: event.decision } : {}),
      ...(event.runner ? { runner: event.runner } : {}),
      ...(event.verdict ? { verdict: event.verdict } : {}),
      ...(event.reviewer ? { reviewer: event.reviewer } : {}),
      ...(event.bundleHash ? { bundleHash: event.bundleHash } : {}),
      ...(event.report ? { report: event.report } : {}),
    }));
  }
  if (status !== 'approved' && status !== 'rejected') return undefined;
  const history: Record<string, unknown>[] = [];
  if (autoReviewRunner) {
    history.push({
      kind: 'auto_review',
      at: isoOffset(-spec.createdHoursAgo + idx * 0.5 + 0.2),
      revision: 1,
      decision: 'pass',
      reason: 'Deterministic fixture validator passed the declared evidence boundary.',
      runner: autoReviewRunner,
    });
  }
  if (status === 'rejected') {
    history.push({
      kind: 'reject',
      at: isoOffset(-spec.createdHoursAgo + idx * 0.5 + 0.35),
      revision: 1,
      reason: spec.feedback ?? 'Demo reviewer requested changes.',
      sentBackToIdx: idx,
    });
  } else {
    history.push({
      kind: 'approve',
      at: isoOffset(-spec.createdHoursAgo + idx * 0.5 + 0.35),
      revision: 1,
    });
  }
  return history;
}

function copyDir(from: string, to: string): void {
  if (!fs.existsSync(from)) { return; }
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    // SwiftPM build products are local verification output, never fixture
    // source. Copying them would bloat the demo and make a seeded workspace
    // host-specific before its first build.
    if (entry.name === '.build' || entry.name === '.DS_Store') { continue; }
    const source = path.join(from, entry.name);
    const destination = path.join(to, entry.name);
    if (entry.isDirectory()) { copyDir(source, destination); } else { copyFile(source, destination); }
  }
}

function copyFile(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function writeFile(target: string, content: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function writeJson(target: string, value: unknown): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function isoOffset(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}
