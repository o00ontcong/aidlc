// AIDLC core — public exports.
//
// This package is pure TypeScript. No `import 'vscode'`. The extension layer
// (packages/extension) imports from here; the core has zero knowledge of the
// VS Code API and runs identically inside the extension host, a CLI, or a
// future test harness / cloud worker.

// Redesign Wave 1. Legacy `EpicStatus` remains exported below during the
// migration window, so the unified contract uses explicit `Unified*` aliases
// at the package boundary rather than silently breaking existing consumers.
export * from './epic';
export * from './models';
export * from './autonomy';
export * from './artifacts';
export * from './guide';
export * from './capabilities';
export * from './project';
export * from './workflows';
export * from './application';
export * from './migration';
export * from './mission';
export * from './runs/PipelineSnapshot';
export * from './packs';
export * from './validators';
export * from './release';
export {
  EpicSchema as UnifiedEpicSchema,
  EpicProfileSchema,
  EpicStatusSchema as UnifiedEpicStatusSchema,
  EPIC_STATUS_TRANSITIONS,
  isValidEpicTransition,
  type Epic as UnifiedEpic,
  type EpicProfile,
  type EpicStatus as UnifiedEpicStatus,
  type EpicRun,
  type RunEvent,
  type Stage,
  type Action,
  type AutonomyPolicy,
  type ModelProvider,
  type ModelRequirement,
  type ResolvedModel,
  type ProjectFacts,
  type ProjectRecommendation,
  type ArtifactPolicy,
  type Capability,
} from './contracts';

export {
  WorkspaceSchema,
  validateWorkspace,
  WorkspaceValidationError,
  normalizeStep,
  stepAgentId,
  stepDagId,
  collectWorkspaceRefIssues,
} from './schema/WorkspaceSchema';
export type {
  WorkspaceConfig,
  AgentConfig,
  SkillConfig,
  SlashCommandConfig,
  PipelineConfig,
  PipelineBudget,
  PipelineStepConfig,
  RecipeConfig,
  NormalizedStep,
  StateConfig,
  PersistenceConfig,
  SidebarConfig,
  SidebarView,
  WorkspaceRefIssue,
  CohesiveExecutionProfileConfig,
  CohesiveDeliveryConfig,
} from './schema/WorkspaceSchema';

export {
  assemblePipeline,
  recipePipelineId,
  PipelineAssembleError,
} from './runs/PipelineAssembler';
export type { AssembleOptions } from './runs/PipelineAssembler';

export {
  heuristicClassify,
  buildClassificationPrompt,
  parseClassificationVerdict,
  slugEpicId,
} from './runs/TaskClassifier';
export type { TaskTypeVerdict, Confidence } from './runs/TaskClassifier';

export {
  buildPhaseCatalog,
  buildAdaptationPrompt,
  parseAdaptationVerdict,
  applyAdaptation,
  PipelineAdaptError,
} from './runs/PipelineAdapter';
export type { PhaseCatalogEntry, AdaptationVerdict } from './runs/PipelineAdapter';

export {
  scaffoldEpic,
  mirrorRunStateToEpic,
  mapStepStatusToEpic,
  epicsRoot,
  EpicScaffoldError,
  MIN_PROJECT_CONTEXT_IDEA_CHARS,
} from './runs/EpicScaffold';
export type {
  EpicStatus,
  ScaffoldEpicArgs,
  ScaffoldEpicResult,
} from './runs/EpicScaffold';

export { collectContext } from './epics/ContextCollector';
export type { EpicContext } from './epics/ContextCollector';
export { generatePlan, renderPlanMarkdown } from './epics/PlanGenerator';
export type {
  AutopilotPlan,
  AgentAllocation,
  Task,
  ScopeComplexity,
} from './epics/PlanGenerator';

export {
  CHARTER_MD_FILES,
  CHARTER_REL_DIR,
  CHARTER_JSON_REL,
  CONVENTIONS_REL,
  DRIFT_REPORT_REL,
  RULES_SYNC_TARGETS,
  defaultCharterTemplatesDir,
  sha256Text,
  sha256File,
  computeCharterMarkdownHash,
  readCharterJson,
  recordHumanCharterEdit,
  seedCharterArtifacts,
  buildCharterRulesBlock,
  syncProjectRules,
  parseCharterMarker,
} from './epics/charterArtifacts';
export type {
  InvariantSeverity,
  TechRuleKind,
  CharterGoal,
  CharterInvariant,
  CharterTechRule,
  DeliveryBudget,
  ShipPolicy,
  CharterDocument,
  SeedCharterResult,
  SyncProjectRulesResult,
  RecordHumanCharterEditResult,
} from './epics/charterArtifacts';

export {
  ALIGNMENT_FILE,
  buildAlignmentSeedFile,
  alignmentDescriptionFromSeed,
  parseServesGoals,
  alignmentPath,
  alignmentExists,
} from './epics/alignmentArtifacts';
export type { AlignmentSeedInput } from './epics/alignmentArtifacts';

export { DeliveryStateStore } from './delivery/DeliveryStateStore';
export {
  DEFAULT_EXISTING_PROJECT_PROFILE,
  validateDeliveryRequest,
} from './delivery/DeliveryTypes';
export {
  AUTONOMOUS_MASTER_COMMAND,
  AUTONOMOUS_EPIC_MASTER_COMMAND,
  ensureAutonomousEpicMasterCommand,
  ensureAutonomousMasterCommand,
  writeAutonomousRequest,
  ensureCohesiveBundleInstalled,
} from './delivery/AutonomousMaster';
export {
  renderDeliveryReviewBundle,
  deliveryReviewSummaryPath,
  writeDeliveryReviewBundle,
} from './delivery/DeliveryReview';
export { DeliveryOrchestrator } from './delivery/DeliveryOrchestrator';
export type {
  DeliveryHooks,
  StartDeliveryOptions,
  AddDeliveryTaskInput,
} from './delivery/DeliveryOrchestrator';
export type {
  DeliveryRequest,
  DeliveryProfile,
  DeliveryStatus,
  DeliveryState,
  DeliveryReviewTask,
  DeliveryReviewTaskTarget,
  DeliveryEvent,
  DeliveryFailureRef,
  DeliverySourceType,
} from './delivery/DeliveryTypes';

export {
  WorkspaceLoader,
  WorkspaceNotFoundError,
  WorkspaceParseError,
  WORKSPACE_FILENAME,
  WORKSPACE_DIR,
} from './loader/WorkspaceLoader';
export type {
  LoadedWorkspace,
  WorkspaceLoaderOptions,
} from './loader/WorkspaceLoader';

export {
  EnvResolver,
  EnvVarMissingError,
} from './loader/EnvResolver';
export type { EnvResolverOptions } from './loader/EnvResolver';

export {
  SkillLoader,
  SkillNotFoundError,
} from './loader/SkillLoader';
export type { SkillLoaderOptions } from './loader/SkillLoader';

export {
  discoverAssets,
  scopePaths,
  targetPath,
} from './loader/AssetDiscovery';
export type {
  AssetScope,
  AssetKind,
  DiscoveredAsset,
  DiscoveryResult,
} from './loader/AssetDiscovery';

export { RunnerRegistry } from './runner/RunnerRegistry';
export { DefaultRunner } from './runner/DefaultRunner';
export type { DefaultRunnerOptions } from './runner/DefaultRunner';
export { isInsideClaudeCodeSession, hasClaudeLogin, buildClaudeSpawnEnv } from './runner/claudeEnv';
export {
  CustomRunnerLoader,
  validateRunnerExport,
} from './runner/CustomRunnerLoader';
export {
  RunnerValidationError,
} from './runner/types';
export type {
  AidlcRunner,
  RunnerContext,
  RunnerResult,
  ClaudeCliWrapper,
} from './runner/types';

// ── Pipeline runs (phase 1) ────────────────────────────────────────
export { RunStateStore, FileRunStateStore, RUN_ID_PATTERN } from './runs/RunStateStore';
export type { RunStateBackend } from './runs/RunStateStore';
export { GitRunStateStore } from './runs/GitRunStateStore';
export type { GitRunStateStoreOptions, GitExec } from './runs/GitRunStateStore';
export {
  resolveRunStateBackend,
  activateRunStateBackend,
  activateBackendFromWorkspace,
} from './runs/resolveBackend';
export {
  startRun,
  canStartStep,
  markStepDone,
  skipStep,
  approveStep,
  rejectStep,
  rerunStep,
  recordBugReport,
  requestStepUpdate,
  submitAutoReviewVerdict,
  PipelineRunError,
} from './runs/PipelineRunner';
export { checkBudget } from './runs/budget';
export type { BudgetCheckArgs, BudgetVerdict } from './runs/budget';
export { runExecLoop } from './runs/execEngine';
export type { ExecOutcome, ExecOptions, ExecHooks } from './runs/execEngine';
export { recordExecutionFailure } from './runs/ExecutionFailureLog';
export type { ExecutionFailureLog, RecordExecutionFailureInput } from './runs/ExecutionFailureLog';
export { verifyRun } from './runs/verifyRun';
export type { VerifyReport, StepDrift } from './runs/verifyRun';
export { renderRunReport } from './runs/runReport';
export { runAutoReview, AutoReviewerError } from './runs/AutoReviewer';
export type { AutoReviewerContext, AutoReviewerFn } from './runs/AutoReviewer';
export {
  resolvePath, resolveArtifactPath, rewriteEpicsRootPrefix, activeEpicsDir, DEFAULT_EPICS_DIR,
} from './runs/RunState';
export type {
  RunState,
  StepRecord,
  StepStatus,
  RunStatus,
  AutoReviewVerdict,
  StepHistoryEntry,
  ExecutionFailureRef,
} from './runs/RunState';

// ── Built-in workflow presets (shared by extension + CLI) ──────────
export {
  BUILTIN_WORKFLOWS,
  PHASES,
  pipelineCommandId,
  commandPipelineIdForPhase,
  workflowCommandPhases,
  builtinTemplatesRoot,
  workflowSlug,
  getBuiltinWorkflow,
  getBuiltinWorkflowByPipelineId,
  getBuiltinPhase,
  getBuiltinStepHelp,
  renderBuiltinStepHelpMarkdown,
  getBuiltinPipelineSummary,
  getSdlcBuiltinPipelineSummary,
  getAllBuiltinPipelineSummaries,
  getBuiltinRecipeSummaries,
  planRecipeMigration,
  loadBuiltinPreset,
  loadAllBuiltinPresets,
  builtinClaudeCommand,
  sdlcClaudeCommand,
  phaseArtifactFileName,
  getBuiltinArtifactTemplates,
  getSdlcArtifactTemplates,
  resolvePrimaryStack,
  writeBuiltinAutoReviewValidators,
  BUILTIN_PRESET_IDS,
  isBuiltinPreset,
} from './presets/builtinWorkflows';
export type {
  BuiltinWorkflow,
  PhaseDef,
  BuiltinStepHelp,
  WorkspacePreset as BuiltinWorkspacePreset,
  WorkspaceRecipe,
  ArtifactTemplateOptions,
} from './presets/builtinWorkflows';

// Human reconciliation for pending `.aidlc/validators/*.aidlc-new` upgrades
// (see `DeliveryOrchestrator.assertValidatorsReady`, which blocks autonomous
// execution while any are pending).
export {
  listValidatorConflicts,
  resolveValidatorConflict,
  VALIDATOR_RECONCILIATION_ERROR_PREFIX,
} from './presets/validatorManifest';
export type { ValidatorConflict } from './presets/validatorManifest';

// Global ~/.claude install of built-in agent/skill files (shared by ext + CLI).
export {
  installGlobalDefaults,
  installWorkflowGlobalsByIds,
  isWorkflowGloballyInstalled,
  uninstallWorkflowGlobalsByIds,
  detectGlobalBuiltinSource,
  DEFAULT_GLOBAL_WORKFLOW_IDS,
} from './presets/globalDefaults';
export { renderTemplate } from './presets/templateRenderer';

// ── Two-layer command model (GH-71) ────────────────────────────────
export {
  CANONICAL_PHASES,
  CANONICAL_PHASE_IDS,
  BACKBONE_COMMAND_ID,
  isCanonicalPhase,
  getCanonicalPhase,
  shortcutCommandId,
  resolveComposition,
  nextEligiblePhase,
  unprovisionedPhases,
  backboneCommandDoc,
  shortcutCommandDoc,
  writeTwoLayerCommands,
  provisionShortcutDocs,
} from './presets/commandModel';
export type {
  CanonicalPhase,
  PhaseComposition,
  EligiblePhase,
  WriteCommandsResult,
} from './presets/commandModel';
// ── Multi-provider command adapters ──────────────────────────────────
export {
  BUNDLED_MODEL_MAPPINGS,
  OPENCODE_FLAGSHIP_MODEL,
  SUPERSEDED_OPENCODE_MODELS,
  upgradeOpenCodeModelId,
  BUILTIN_COMMAND_PROVIDER_IDS,
  BUILTIN_COMMAND_PROVIDERS,
  buildStepCommandBody,
  buildStepCommandSpec,
  renderClaudeCommandFile,
  getCommandProviderAdapter,
  listCommandProviderAdapters,
  commandProviderRegistry,
  syncPipelineCommands,
  syncPipelineCommandsForProvider,
  syncProviderManagedCommandForProvider,
  writeTwoLayerCommandsForProvider,
} from './providers';
export type {
  StepCommandSpec,
  CommandProviderAdapter,
  OneShotInvocation,
  SyncPipelineCommandsResult,
  BuiltinCommandProviderId,
} from './providers';
// Annotation + epic-memory tooling install (shared by ext + CLI).
export {
  installAnnotationTools,
  isEpicMemoryHookEnabled,
  setEpicMemoryHook,
} from './presets/annotationTools';
export type { AnnotationToolsReport } from './presets/annotationTools';

// ── Compliance profiles / SDLC standard (GH-69) ────────────────────
export {
  BUILTIN_PROFILE_IDS,
  DEFAULT_PROFILE_ID,
  PROFILES_DIR,
  TRACE_RULES,
  ProfileSchema,
  isBuiltinProfileId,
  workspaceStandard,
  resolveStandard,
  listProfileManifests,
  loadProfile,
  loadActiveProfile,
  builtinProfiles,
  UnknownStandardError,
  ProfileLoadError,
} from './profiles/StandardProfile';
export type {
  BuiltinProfileId,
  StandardProfile,
  TraceRule,
  ResolveStandardOptions,
} from './profiles/StandardProfile';

// Shared help/knowledge content for `ask` + `guide` (CLI + extension).
export { AIDLC_KNOWLEDGE, AIDLC_CLI_GUIDE_TEXT } from './help/aidlcGuide';

export const AIDLC_CORE_VERSION = '0.1.0';
