/* Shared mock WorkspaceState for the dev harnesses (not a build input). */
import type {
  AgentMeta, EpicStepDetailFull, EpicSummary, WorkspaceState,
} from '../src/webview/lib/types';
import { MOCK_PROVIDER_CONFIG } from '../src/webview/lib/providers';

const step = (
  o: Partial<EpicStepDetailFull> & { agent: string },
): EpicStepDetailFull => ({
  status: 'pending',
  runStatus: null,
  isCurrentRunStep: false,
  stepHasAutoReview: false,
  stepHasHumanReview: false,
  ...o,
});

const done = (name: string, artifact?: string): EpicStepDetailFull =>
  step({
    agent: name,
    stepName: name,
    status: 'done',
    runStatus: 'approved',
    artifact,
    artifactExists: Boolean(artifact),
    slashCommand: `/${name}`,
  });

const CONTEXT_STEPS: EpicStepDetailFull[] = [
  step({
    agent: 'establish-baseline',
    stepName: 'establish-baseline',
    status: 'in_progress',
    runStatus: 'awaiting_review',
    isCurrentRunStep: true,
    stepHasHumanReview: true,
    artifact: 'CONTEXT-REVIEW.md',
    artifactExists: true,
    slashCommand: '/project-context-establish-baseline',
    autoReviewVerdict: {
      decision: 'pass',
      reason: 'SUMMARY + graph kiến trúc có G-1 · INV-2 · 2 drift advisory',
      at: '2026-08-16T04:10:00Z',
      runner: 'system',
    },
  }),
  step({ agent: 'publish-context', stepName: 'publish-context', artifact: 'CONTEXT-MANIFEST.json' }),
];

const SPIKE_STEPS: EpicStepDetailFull[] = [
  step({
    agent: 'package-mission',
    stepName: 'package-mission',
    status: 'in_progress',
    runStatus: 'awaiting_review',
    isCurrentRunStep: true,
    stepHasHumanReview: true,
    artifact: 'MISSION.md',
    artifactExists: true,
    slashCommand: '/feature-spike-package-mission',
    autoReviewVerdict: {
      decision: 'pass',
      reason: 'MISSION đủ heading · AC-1..3 · Flow mermaid',
      at: '2026-08-16T05:02:00Z',
      runner: 'mission-completeness.mjs',
    },
  }),
];

const IMPLEMENT_STEPS: EpicStepDetailFull[] = [
  step({
    agent: 'implement',
    stepName: 'implement',
    status: 'in_progress',
    runStatus: 'awaiting_review',
    isCurrentRunStep: true,
    stepHasHumanReview: true,
    stepHasAutoReview: true,
    artifact: 'IMPLEMENTATION-SUMMARY.md',
    artifactExists: true,
    slashCommand: '/feature-implement-implement',
    tokenUsage: {
      agent: 'implement', startedAt: null, endedAt: null,
      calls: 14, totalTokens: 412_000, inputTokens: 300_000, outputTokens: 42_000,
      cacheReadTokens: 60_000, cacheWriteTokens: 10_000, cost: 6.48,
    },
    history: [
      { kind: 'approve', at: '2026-08-12T09:47:00Z', revision: 1 },
      { kind: 'reject', at: '2026-08-12T10:02:00Z', revision: 2, reason: 'sheet host dùng GeometryReader — trái MISSION UI spec', sentBackToIdx: 0 },
      { kind: 'auto_review', at: '2026-08-12T10:29:00Z', revision: 3, decision: 'pass', reason: 'BUILD SUCCEEDED', runner: 'system' },
    ],
    rejectCount: 1,
    autoReviewVerdict: {
      decision: 'pass',
      reason: 'BUILD SUCCEEDED · AC-1..3 claimed · chưa có pixel thật',
      at: '2026-08-16T06:40:00Z',
      runner: 'ci.mjs',
    },
  }),
  step({
    agent: 'resolve-bugs',
    stepName: 'resolve-bugs',
    stepHasHumanReview: true,
    artifact: 'BUG-FIX-LOG.md',
    slashCommand: '/feature-implement-resolve-bugs',
  }),
  step({ agent: 'ship', stepName: 'ship', artifact: 'PR-LINK.md' }),
];

const BUG_STEPS: EpicStepDetailFull[] = [
  done('implement', 'IMPLEMENTATION-SUMMARY.md'),
  step({
    agent: 'resolve-bugs',
    stepName: 'resolve-bugs',
    status: 'in_progress',
    runStatus: 'awaiting_review',
    isCurrentRunStep: true,
    stepHasHumanReview: true,
    artifact: 'BUG-FIX-LOG.md',
    artifactExists: true,
    slashCommand: '/feature-implement-resolve-bugs',
    history: [
      { kind: 'bug_report', at: '2026-08-16T07:01:00Z', revision: 1, report: 'Sheet trắng đều top+bottom trên iPhone 15' },
    ],
  }),
  step({ agent: 'ship', stepName: 'ship', artifact: 'PR-LINK.md' }),
];

const THIN_STEPS: EpicStepDetailFull[] = [
  step({
    agent: 'implement',
    stepName: 'implement',
    status: 'in_progress',
    runStatus: 'awaiting_work',
    isCurrentRunStep: true,
    slashCommand: '/feature-implement-implement',
  }),
  step({
    agent: 'resolve-bugs',
    stepName: 'resolve-bugs',
    stepHasHumanReview: true,
    artifact: 'BUG-FIX-LOG.md',
    slashCommand: '/feature-implement-resolve-bugs',
  }),
  step({ agent: 'ship', stepName: 'ship', artifact: 'PR-LINK.md' }),
];

const REDRAW_STEPS: EpicStepDetailFull[] = [
  step({ agent: 'design-analyzer', stepName: 'design-analyzer', status: 'done', runStatus: 'approved', artifact: 'DESIGN-ANALYSIS.md', artifactExists: true }),
  step({ agent: 'design-recreator', stepName: 'design-recreator', status: 'done', runStatus: 'approved' }),
  step({ agent: 'visual-reviewer', stepName: 'visual-reviewer', status: 'done', runStatus: 'approved', stepHasAutoReview: true }),
  step({ agent: 'human-review', stepName: 'human-review', status: 'in_progress', runStatus: 'awaiting_review', isCurrentRunStep: true, stepHasHumanReview: true }),
];

const epic = (o: Partial<EpicSummary> & { id: string; title: string }): EpicSummary => ({
  description: '',
  status: 'pending',
  progress: 0,
  statePath: `.aidlc/runs/${o.id}/state.json`,
  stepDetails: [],
  currentStep: 0,
  pipeline: null,
  agent: null,
  runId: null,
  runMode: 'guided',
  inputs: {},
  epicDir: `docs/epics/${o.id}`,
  existingArtifacts: [],
  artifactPaths: {},
  createdAt: '2026-08-01T09:00:00Z',
  ...o,
});

const ARCH_FLOW = `flowchart TD
  APP[OtenPass iOS] --> AUTH[Auth]
  APP --> PAY[Payments]
  APP --> VAULT[Vault]
  AUTH --> IDP[IDP API]
  PAY --> IDP
  PAY --> LEDGER[Ledger]
`;

const SPIKE_FLOW = `flowchart TD
  email[EmailScreen] --> submit[Submit]
  submit --> exists{Account exists?}
  exists -->|yes| signin[Password / Passkey]
  exists -->|no| sheet[Unable to sign in]
  sheet --> try[Try another email]
  sheet --> admin[Contact admin]
`;

const AS_BUILT_FLOW = `flowchart TD
  email[EmailScreen] --> submit[Submit]
  submit --> exists{Account exists?}
  exists -->|yes| signin[Password / Passkey]
  exists -->|no| sheet[Unable to sign in]
  sheet --> host[SignInErrorSheetFlow]
  host --> try[Try another email]
  host --> admin[Contact admin]
`;

const SURFACES = `flowchart LR
  ios[OtenPass iOS] -->|REST| api[IDP API]
  api -->|config| org[Org support contact]
`;

const IMPACT = `flowchart TD
  APP[APP] --> AUTH[Auth - modify]
  APP --> ONB[Onboarding - delete]
  APP --> VAULT[Vault - unchanged]
`;

const EPICS: EpicSummary[] = [
  epic({
    id: 'CTX-1',
    title: 'OtenPass baseline',
    description: [
      'Baseline repo iOS — Intent đã chốt, Reality vừa scan.',
      '',
      'G-1  Sign-in only, không self-service sign-up',
      'INV-2  Không đụng CoreAuth crypto',
      'Quality  xcodebuild OtenPass · cấm simulator',
      'Drift  2 advisory: sheet host chưa ghi Architecture',
    ].join('\n'),
    status: 'in_progress',
    progress: 72,
    pipeline: 'project-context',
    runId: 'run-ctx-1',
    runMode: 'autonomous',
    currentStep: 0,
    stepDetails: CONTEXT_STEPS,
    inputs: { idea: 'Password manager iOS, Jira PASS-*', context_mode: 'inferred-existing' },
    existingArtifacts: ['CHARTER.json', 'PROJECT-SCAN.md', 'CONTEXT-REVIEW.md'],
    alignment: { goals: ['G-1'], status: 'aligned' },
    visualizations: {
      flowMermaid: ARCH_FLOW,
      impactMermaid: IMPACT,
      impactFeatures: [
        { id: 'auth', name: 'Auth', change: 'unchanged' },
        { id: 'payments', name: 'Payments', change: 'unchanged' },
      ],
    },
  }),
  epic({
    id: 'PAY-S',
    title: 'Checkout spike — bỏ sign-up',
    description: [
      'Đề xuất nhiệm vụ (chưa khóa implement).',
      '',
      'Problem  Apple cấm self-service account creation.',
      'In  Email copy, sheet Unable to sign in (no-org / has-org), gỡ mọi entry tạo account.',
      'Out  Web, đổi IDP.',
      'AC-1  Không còn link tạo account trên email screen.',
      'AC-2  Sheet no-org chỉ Try another email.',
      'AC-3  Happy-path password/passkey không đổi.',
      '',
      'MISSION.md sẵn copy sang implement. Còn OQ: Contact admin lấy từ IDP hay generic?',
    ].join('\n'),
    status: 'in_progress',
    progress: 48,
    pipeline: 'feature-spike',
    runId: 'run-pay-s',
    runMode: 'autonomous',
    currentStep: 0,
    stepDetails: SPIKE_STEPS,
    inputs: {
      jira: 'https://example.atlassian.net/browse/PASS-888',
      figma: 'https://www.figma.com/design/abc?node-id=123-456',
      what_scope: 'iOS sign-in email + error sheet',
      feature_constraints: 'Không GeometryReader đo detent. Token AppColor only.',
    },
    existingArtifacts: ['MISSION.md'],
    alignment: { goals: ['G-1'], status: 'aligned' },
    visualizations: {
      flowMermaid: SPIKE_FLOW,
      surfacesMermaid: SURFACES,
      impactMermaid: IMPACT,
      impactFeatures: [
        { id: 'auth', name: 'Auth', change: 'modify', summary: 'Bỏ sign-up' },
        { id: 'onboarding', name: 'Onboarding', change: 'delete' },
      ],
    },
  }),
  epic({
    id: 'PAY-I',
    title: 'Checkout implement',
    description: [
      'Đã làm gì (as-built) — khóa vào pack từ PAY-S.',
      '',
      'source  spike:PAY-S · docs/epics/PAY-S/spec/MISSION.md',
      'AC-1..3  claimed. T1 EmailView, T2 sheet+host, T3 gỡ entry.',
      'Lệch pack  detent do SignInErrorSheetFlow (host) — đúng constraint spike.',
      'Verify  BUILD SUCCEEDED. Pixel chưa có (cấm simulator) — human trên máy.',
    ].join('\n'),
    status: 'in_progress',
    progress: 62,
    pipeline: 'feature-implement',
    runId: 'run-pay-i',
    runMode: 'guided',
    currentStep: 0,
    stepDetails: IMPLEMENT_STEPS,
    inputs: {
      spec_source: 'spike',
      spec_ref: 'docs/epics/PAY-S/spec/MISSION.md',
      branch: 'feature/PAY-12',
    },
    existingArtifacts: ['MISSION.md', 'IMPLEMENTATION-SUMMARY.md', 'REVIEW-DIFF.md'],
    alignment: { goals: ['G-1'], status: 'variance' },
    ship: { prUrl: 'https://github.com/acme/otenpass/pull/402', status: 'open', head: 'feature/PAY-12', base: 'main' },
    tokenUsage: {
      total: { calls: 41, totalTokens: 412_000, cost: 6.48 },
      steps: [],
      hasOverlap: false,
      computedAt: 0,
    },
    reviewDiff: 'diff --git a/src/SignInErrorSheetFlow.swift b/src/SignInErrorSheetFlow.swift\n@@ -12,6 +12,9 @@\n+    .adaptiveSheetHeight()\n',
    visualizations: {
      flowMermaid: AS_BUILT_FLOW,
      surfacesMermaid: SURFACES,
      impactMermaid: IMPACT,
      impactFeatures: [
        { id: 'auth', name: 'Auth', change: 'modify' },
        { id: 'onboarding', name: 'Onboarding', change: 'delete' },
      ],
    },
  }),
  epic({
    id: 'PAY-BUG',
    title: 'Checkout — sheet trắng 2 đầu',
    description: [
      'Bug trên máy thật sau PAY-I.',
      '',
      'Hiện tại  Sheet Unable to sign in trắng đều top+bottom, iPhone 15.',
      'Mong muốn  Ôm content, detent đúng UI-SPEC node 123:456.',
      'Nghi  host presentationDetents / GeometryReader — không phải padding leaf.',
    ].join('\n'),
    status: 'in_progress',
    progress: 81,
    pipeline: 'feature-implement',
    runId: 'run-pay-bug',
    runMode: 'guided',
    currentStep: 1,
    stepDetails: BUG_STEPS,
    inputs: { spec_source: 'spike', spec_ref: 'docs/epics/PAY-S/spec/MISSION.md' },
    existingArtifacts: ['BUG-FIX-LOG.md', 'BUG-REPORT.md'],
    alignment: { goals: ['G-1'], status: 'aligned' },
    ship: { status: 'open', head: 'feature/PAY-12', base: 'main' },
    visualizations: { flowMermaid: AS_BUILT_FLOW, surfacesMermaid: SURFACES },
  }),
  epic({
    id: 'PAY-THIN',
    title: 'Jira mỏng — thiếu pack',
    description: [
      'PASS-12: bỏ sign up, hiện lỗi khi email chưa có account.',
      '',
      'Thiếu pack (không Start implement được):',
      '· In / Out scope',
      '· AC có cách verify',
      '· Constraints / Tasks',
      '· UI spec (Figma hoặc N/A)',
      '· FLOW mermaid',
    ].join('\n'),
    status: 'in_progress',
    progress: 8,
    pipeline: 'feature-implement',
    runId: 'run-pay-thin',
    runMode: 'guided',
    currentStep: 0,
    stepDetails: THIN_STEPS,
    inputs: { jira: 'https://example.atlassian.net/browse/PASS-12' },
    existingArtifacts: [],
    alignment: { goals: ['G-1'], status: 'stale' },
  }),
  epic({
    id: 'PAY-DONE',
    title: 'Checkout — đã merge',
    description: [
      'As-built đã khóa, PR merged, project-sync xong.',
      '',
      'source  spike:PAY-S',
      'AC-1..3  verified trên máy (human).',
      'PR  #398 merged → main.',
    ].join('\n'),
    status: 'done',
    progress: 100,
    pipeline: 'feature-implement',
    runId: 'run-pay-done',
    runMode: 'autonomous',
    currentStep: 2,
    stepDetails: IMPLEMENT_STEPS.map((item) => ({
      ...item,
      status: 'done' as const,
      runStatus: 'approved' as const,
      isCurrentRunStep: false,
    })),
    inputs: {
      spec_source: 'spike',
      spec_ref: 'docs/epics/PAY-S/spec/MISSION.md',
      branch: 'feature/PAY-11',
    },
    existingArtifacts: ['MISSION.md', 'IMPLEMENTATION-SUMMARY.md', 'PR-LINK.md'],
    alignment: { goals: ['G-1'], status: 'aligned' },
    ship: { prUrl: 'https://github.com/acme/otenpass/pull/398', status: 'merged', head: 'feature/PAY-11', base: 'main' },
    visualizations: { flowMermaid: AS_BUILT_FLOW, surfacesMermaid: SURFACES },
  }),
  epic({
    id: 'DESIGN-001',
    title: 'Redraw checkout screen',
    status: 'in_progress',
    progress: 75,
    pipeline: 'redraw-design',
    runId: 'run-d001',
    currentStep: 3,
    stepDetails: REDRAW_STEPS,
    description: 'Layout cũ 11 block — để so với briefing.',
  }),
];

const agentMeta: Record<string, AgentMeta> = {
  'establish-baseline': {
    name: 'establish-baseline',
    description: 'Một session: charter + reality + graph kiến trúc. Human review SUMMARY.',
    inputs: 'idea / repo',
    outputs: 'CHARTER.json · CONTEXT-REVIEW.md · mermaid kiến trúc',
    artifact: 'CONTEXT-REVIEW.md',
  },
  'package-mission': {
    name: 'package-mission',
    description: 'Viết một MISSION.md đủ AC/Tasks/UI spec/Flow. Research trong cùng session nếu cần.',
    inputs: 'Jira / Figma / charter',
    outputs: 'MISSION.md',
    artifact: 'MISSION.md',
  },
  implement: {
    name: 'implement',
    description: 'Implement đúng MISSION.md đã khóa. Không tự sửa đặc tả. Verify build trong step này.',
    inputs: 'MISSION.md · charter · code repo',
    outputs: 'code + IMPLEMENTATION-SUMMARY.md (as-built)',
    artifact: 'IMPLEMENTATION-SUMMARY.md',
  },
};

export const STATE: WorkspaceState = {
  hasFolder: true,
  workspaceName: 'otenpass-ios',
  configExists: true,
  agents: [], skills: [],
  pipelines: [
    { id: 'project-context', name: 'Project Context', on_failure: 'stop', steps: [] },
    { id: 'feature-spike', name: 'Feature Spike', on_failure: 'stop', steps: [] },
    { id: 'feature-implement', name: 'Feature Implement', on_failure: 'stop', steps: [] },
  ],
  recipes: [],
  epics: EPICS,
  agentMeta,
  slashCommandsByAgent: {},
  agentsCount: 0, skillsCount: 0, pipelinesCount: 3, epicsCount: EPICS.length,
  runIds: EPICS.map((item) => item.runId).filter((id): id is string => Boolean(id)),
  skillTemplates: [],
  nextEpicId: 'PAY-13',
  existingEpicIds: EPICS.map((item) => item.id),
  epicsDir: 'docs/epics',
  epicMemoryHookEnabled: true,
  epicsViewUi: {
    followOpen: true,
    noFollowOpen: true,
    followedIds: ['PAY-I', 'PAY-BUG', 'CTX-1'],
  },
  projectContext: {
    revision: 3,
    generatedAt: '2026-08-16T03:00:00Z',
    manifestPath: 'docs/project/context/CONTEXT-MANIFEST.json',
    artifacts: ['PROJECT-CONTEXT.md', 'ARCHITECTURE-MAP.md', 'FEATURE-CATALOG.json'],
    completedSteps: 1,
    totalSteps: 2,
  },
  charter: {
    present: true,
    revision: 3,
    goals: [
      { id: 'G-1', title: 'Sign-in only, không self-service sign-up', metric: '0 entry tạo account', status: 'active' },
      { id: 'G-2', title: 'Sheet lỗi ôm content', metric: 'detent = content', status: 'active' },
    ],
    invariants: [{ id: 'INV-2', rule: 'Không đụng CoreAuth crypto', severity: 'hard' }],
    techRules: [{ id: 'T-1', kind: 'must', value: 'SwiftUI token AppColor / AppFont' }],
  },
  diffIgnore: ['*.lock'],
  architecture: {
    available: true,
    layers: [
      { id: 'presentation', label: 'Presentation' },
      { id: 'domain', label: 'Domain' },
      { id: 'data', label: 'Data' },
    ],
    edges: [{ source: 'presentation', target: 'domain' }, { source: 'domain', target: 'data' }],
    features: [
      { id: 'auth', name: 'Auth', layers: ['presentation'] },
      { id: 'vault', name: 'Vault', layers: ['domain'] },
    ],
    screens: [
      { id: 'login', name: 'Login', area: 'Auth' },
      { id: 'home', name: 'Home', area: 'Main' },
    ],
    structuralNodes: [],
    structuralEdges: [],
    featureFlows: {},
  },
  displayLanguage: 'vi',
  providerConfig: MOCK_PROVIDER_CONFIG,
};
