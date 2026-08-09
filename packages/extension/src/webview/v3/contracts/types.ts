/**
 * UI-only projection types for the v3 AIDLC surface.
 *
 * The extension host remains the source of truth.  These shapes deliberately
 * mirror the stable application contracts instead of importing `@aidlc/core`:
 * webview bundles run in a browser and must not pull in Node-only core code.
 */

export const V3_STAGE_IDS = ['understand', 'plan', 'build', 'verify', 'ship'] as const;
export type V3StageId = (typeof V3_STAGE_IDS)[number];

export const V3_AUTONOMY_MODES = ['guide', 'assist', 'auto', 'unattended'] as const;
export type V3AutonomyMode = (typeof V3_AUTONOMY_MODES)[number];

export type V3ViewId = 'home' | 'epics' | 'studio' | 'guide';
export type V3EpicStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'waiting-for-user'
  | 'blocked'
  | 'paused'
  | 'review'
  | 'shipping'
  | 'completed';
export type V3StageStatus = 'pending' | 'running' | 'waiting-for-user' | 'blocked' | 'review' | 'completed';
export type V3Profile = 'quick' | 'standard' | 'parallel' | 'regulated';
export type V3Readiness = 'not-ready' | 'analyzing' | 'ready' | 'needs-attention';

export interface V3ActionRef {
  readonly id: string;
  readonly summary: string;
  readonly command?: string;
  readonly reason?: string;
}

export interface V3RecoveryAction {
  readonly kind: 'retry' | 'apply-fix' | 'open-diff' | 'change-policy' | 'skip-with-reason' | 'ask-user' | 'refresh-context' | 'escalate';
  readonly label: string;
  readonly description?: string;
  readonly command?: string;
  readonly requiresReason?: boolean;
}

export interface V3Problem {
  readonly code: string;
  readonly summary: string;
  readonly detail?: string;
  readonly recoveryActions: readonly V3RecoveryAction[];
}

export interface V3GatePreview {
  readonly id: string;
  readonly gate: 'destructive_changes' | 'dependency_changes' | 'external_communication' | 'merge_default_branch' | string;
  readonly destination?: string;
  readonly contentSummary: string;
  readonly mutationScope: readonly string[];
  readonly hard: boolean;
}

export interface V3Evidence {
  readonly id: string;
  readonly label: string;
  readonly uri?: string;
  readonly kind: 'artifact' | 'test' | 'validation' | 'review' | 'log';
}

export interface V3Artifact {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly lifecycle: 'draft' | 'review' | 'approved' | 'committed';
  readonly eligibleForCommit: boolean;
}

export interface V3StageSummary {
  readonly id: V3StageId;
  readonly status: V3StageStatus;
  readonly summary?: string;
  readonly autonomy?: V3AutonomyMode;
  readonly action?: V3ActionRef;
}

export interface V3EpicSummary {
  readonly id: string;
  readonly title: string;
  readonly type: 'feature' | 'bug' | 'refactor' | 'spike' | 'maintenance';
  readonly profile: V3Profile;
  readonly status: V3EpicStatus;
  readonly autonomy: V3AutonomyMode;
  readonly stages: readonly V3StageSummary[];
  readonly nextAction?: V3ActionRef;
  readonly blocker?: V3Problem;
  readonly gate?: V3GatePreview;
  readonly artifacts: readonly V3Artifact[];
  readonly evidence: readonly V3Evidence[];
  readonly updatedAt: string;
}

export interface V3Recommendation {
  readonly profile: V3Profile;
  readonly agentRole: string;
  readonly skills: readonly string[];
  readonly modelTier: string;
  readonly rationale: string;
  readonly confidence: number;
}

export interface V3ProjectState {
  readonly name: string;
  readonly readiness: V3Readiness;
  readonly contextRevision?: string;
  readonly recommendation?: V3Recommendation;
  readonly diagnostics: readonly V3Diagnostic[];
}

export interface V3WorkflowPack {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly profiles: readonly V3Profile[];
}

export interface V3CompiledWorkflow {
  readonly profile: V3Profile;
  readonly stages: readonly V3StageId[];
  readonly summary: string;
}

export interface V3ProviderDiagnostic {
  readonly providerId: string;
  readonly modelId?: string;
  readonly status: 'ready' | 'needs-auth' | 'unavailable';
  readonly message: string;
  readonly selected?: boolean;
}

export interface V3Capability {
  readonly id: 'ast-graph' | 'artifact-annotation' | 'test-agent' | 'observability' | string;
  readonly label: string;
  readonly category: 'bundled' | 'optional';
  readonly enabled: boolean;
  readonly healthy: boolean;
  readonly message?: string;
}

export interface V3Diagnostic {
  readonly id: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly summary: string;
  readonly detail?: string;
  readonly fix?: V3RecoveryAction;
}

export interface V3Guide {
  readonly stage?: V3StageId;
  readonly title: string;
  readonly why: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly doneWhen: string;
  readonly next: string;
  readonly recovery: readonly V3RecoveryAction[];
  readonly advancedLog?: string;
}

/** Complete, serializable screen state supplied by the extension host. */
export interface V3WorkspaceState {
  readonly project: V3ProjectState;
  readonly epics: readonly V3EpicSummary[];
  readonly currentEpicId?: string;
  readonly workflowPacks: readonly V3WorkflowPack[];
  readonly compiledWorkflow?: V3CompiledWorkflow;
  readonly providerDiagnostics: readonly V3ProviderDiagnostic[];
  readonly artifactPolicy: Readonly<Record<string, unknown>>;
  readonly legacyMigration?: { readonly id: string; readonly itemCount: number; readonly command: string };
  readonly capabilities: readonly V3Capability[];
  readonly guide: V3Guide;
}
