/* Shared mock WorkspaceState for the dev harnesses (not a build input). */
import type {
  AgentMeta, EpicStepDetailFull, EpicSummary, WorkspaceState,
} from '../src/webview/lib/types';

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

const COHESIVE_STEPS: EpicStepDetailFull[] = [
  step({ agent: 'capture-context', stepName: 'capture-context', status: 'done', runStatus: 'approved', artifact: 'CONTEXT-SNAPSHOT.md', artifactExists: true, slashCommand: '/cohesive-feature-capture-context' }),
  step({ agent: 'specify', stepName: 'specify', status: 'done', runStatus: 'approved', artifact: 'SPEC.md', artifactExists: true, slashCommand: '/cohesive-feature-specify' }),
  step({ agent: 'clarify', stepName: 'clarify', status: 'done', runStatus: 'approved', artifact: 'CLARIFY.md', artifactExists: true }),
  step({ agent: 'plan', stepName: 'plan', status: 'done', runStatus: 'approved', artifact: 'PLAN.md', artifactExists: true }),
  step({ agent: 'analyze-contract', stepName: 'analyze-contract', status: 'done', runStatus: 'approved', artifact: 'FEATURE-CONTRACT.md', artifactExists: true }),
  step({ agent: 'tasks-package', stepName: 'tasks-package', status: 'done', runStatus: 'approved', artifact: 'TASKS.md', artifactExists: true }),
  step({
    agent: 'senior-backend-developer',
    stepName: 'implement',
    status: 'in_progress',
    runStatus: 'awaiting_review',
    isCurrentRunStep: true,
    stepHasAutoReview: true,
    stepHasHumanReview: true,
    artifact: 'REVIEW-DIFF.md',
    artifactExists: true,
    slashCommand: '/cohesive-work-package-implement-package',
    tokenUsage: {
      agent: 'senior-backend-developer', startedAt: null, endedAt: null,
      calls: 14, totalTokens: 412_000, inputTokens: 300_000, outputTokens: 42_000,
      cacheReadTokens: 60_000, cacheWriteTokens: 10_000, cost: 6.48,
    },
    stepHelp: {
      description: 'Hiện thực toàn bộ task trong package đã approve, trong worktree riêng.',
      inputs: 'FEATURE-CONTRACT.md · TASKS.md',
      outputs: 'source diff · REVIEW-DIFF.md',
      model: 'claude-opus-4',
      persona: 'senior-backend-developer',
      acceptanceCriteria: ['tests pass', 'contract respected'],
    },
    history: [
      { kind: 'approve', at: '2026-08-12T09:47:00Z', revision: 1 },
      { kind: 'reject', at: '2026-08-12T10:02:00Z', revision: 2, reason: 'thiếu decimal guard cho refund âm', sentBackToIdx: 6 },
      { kind: 'rerun', at: '2026-08-12T10:14:00Z', revision: 3, feedback: 'tách compat shim' },
      { kind: 'auto_review', at: '2026-08-12T10:29:00Z', revision: 3, decision: 'pass', reason: '418 unit, 12 contract', runner: 'system' },
    ],
    rejectCount: 1,
    autoReviewVerdict: { decision: 'pass', reason: 'Validators passed · 418 unit, 12 contract', at: '2026-08-12T10:29:00Z', runner: 'system' },
  }),
  step({ agent: 'package-test', stepName: 'package-test', stepHasAutoReview: true }),
  step({ agent: 'cohesion-review', stepName: 'cohesion-review', stepHasHumanReview: true }),
  step({ agent: 'integrate', stepName: 'integrate' }),
  step({ agent: 'system-test', stepName: 'system-test' }),
  step({ agent: 'await-merge', stepName: 'await-merge', stepHasHumanReview: true }),
  step({ agent: 'project-sync', stepName: 'project-sync' }),
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
  inputs: {},
  epicDir: `docs/epics/${o.id}`,
  existingArtifacts: [],
  artifactPaths: {},
  createdAt: '2026-08-01T09:00:00Z',
  ...o,
});

const EPICS: EpicSummary[] = [
  epic({
    id: 'EPIC-142',
    title: 'Partial refunds',
    status: 'in_progress',
    progress: 62,
    pipeline: 'cohesive-feature',
    runId: 'run-142',
    currentStep: 6,
    stepDetails: COHESIVE_STEPS,
    inputs: { branch: 'feat/payments-001', parent_task: 'PAY-884' },
    existingArtifacts: ['SPEC.md', 'PLAN.md', 'FEATURE-CONTRACT.md', 'REVIEW-DIFF.md'],
    alignment: { goals: ['G-02'], status: 'variance' },
    ship: { prUrl: 'https://github.com/acme/pay/pull/402', status: 'open', head: 'epic-142-partial-refunds', base: 'main' },
    tokenUsage: {
      total: { calls: 41, totalTokens: 412_000, cost: 6.48 },
      steps: [],
      hasOverlap: false,
      computedAt: 0,
    },
    reviewDiff: 'diff --git a/src/refunds/service.ts b/src/refunds/service.ts\n@@ -1,3 +1,6 @@\n+export function partialRefund() {}\n',
  }),
  epic({ id: 'EPIC-139', title: 'Webhook retry backoff', status: 'in_progress', progress: 78, pipeline: 'cohesive-feature', runId: 'run-139', stepDetails: COHESIVE_STEPS.slice(0, 10), inputs: { branch: 'feat/webhook-backoff' }, ship: { prUrl: 'https://github.com/acme/pay/pull/398', status: 'open', head: 'feat/webhook-backoff', base: 'main' } }),
  epic({ id: 'EPIC-136', title: 'Idempotency keys', status: 'failed', progress: 54, pipeline: 'cohesive-feature', runId: 'run-136', stepDetails: COHESIVE_STEPS.slice(0, 8).map((s, i) => (i === 7 ? { ...s, status: 'failed' as const, runStatus: 'rejected' as const, rejectReason: 'contract test thất bại sau 3 lần retry' } : s)) }),
  epic({ id: 'EPIC-131', title: 'Refund audit export', status: 'done', progress: 100, pipeline: 'cohesive-feature', runId: 'run-131', stepDetails: COHESIVE_STEPS.map((s) => ({ ...s, status: 'done' as const, runStatus: 'approved' as const })), ship: { prUrl: 'https://github.com/acme/pay/pull/311', status: 'merged', head: 'feat/audit-export', base: 'main' } }),
  epic({ id: 'EPIC-128', title: 'Dispute evidence upload', status: 'pending', progress: 0 }),
  epic({ id: 'EPIC-124', title: 'Payout schedule refactor', status: 'pending', progress: 22 }),
  epic({ id: 'DESIGN-001', title: 'Redraw checkout screen', status: 'in_progress', progress: 75, pipeline: 'redraw-design', runId: 'run-d001', currentStep: 3, stepDetails: REDRAW_STEPS }),
];

const agentMeta: Record<string, AgentMeta> = {
  'senior-backend-developer': {
    name: 'senior-backend-developer',
    description: 'Hiện thực thay đổi backend theo hợp đồng đã freeze.',
    inputs: 'FEATURE-CONTRACT.md',
    outputs: 'source diff',
    artifact: 'REVIEW-DIFF.md',
  },
};

export const STATE: WorkspaceState = {
  hasFolder: true,
  workspaceName: 'payments-service',
  configExists: true,
  agents: [], skills: [], pipelines: [], recipes: [],
  epics: EPICS,
  agentMeta,
  slashCommandsByAgent: {},
  agentsCount: 0, skillsCount: 0, pipelinesCount: 0, epicsCount: EPICS.length,
  runIds: [], skillTemplates: [],
  nextEpicId: 'EPIC-143',
  existingEpicIds: EPICS.map((e) => e.id),
  epicsDir: 'docs/epics',
  epicMemoryHookEnabled: true,
  charter: {
    present: true,
    revision: 7,
    goals: [
      { id: 'G-01', title: 'Giảm thời gian xử lý refund', metric: 'p95 < 2s', status: 'active' },
      { id: 'G-02', title: 'Hỗ trợ refund một phần', metric: '100% coverage', status: 'active' },
    ],
    invariants: [{ id: 'I-01', rule: 'Không mutate ledger đã đóng', severity: 'hard' }],
    techRules: [],
  },
  diffIgnore: ['*.lock'],
};

