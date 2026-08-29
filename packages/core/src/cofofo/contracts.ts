import { z } from 'zod';

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/i, 'Must be a sha256:<hex> digest');
const RelativePathSchema = z.string().min(1).refine(
  (value) => !value.startsWith('/') && !value.split(/[\\/]+/).includes('..'),
  'Path must stay relative to the workspace',
);

export const COFOFO_STACK_IDS = [
  'ios-swift',
  'node-typescript',
  'python',
  'go',
  'rust',
  'java',
  'dotnet',
] as const;
export const CofofoStackIdSchema = z.enum(COFOFO_STACK_IDS);
export type CofofoStackId = z.infer<typeof CofofoStackIdSchema>;

export const StackEvidenceSchema = z.object({
  path: RelativePathSchema,
  kind: z.enum(['manifest', 'lockfile', 'source-root', 'test-root', 'toolchain']),
  sha256: Sha256Schema,
  observed: z.string().min(1),
}).strict();

export const StackDescriptorSchema = z.object({
  id: CofofoStackIdSchema,
  language: z.string().min(1),
  version: z.string().min(1),
  packageManager: z.string().min(1),
  buildSystem: z.string().min(1),
  buildCommandId: z.string().min(1),
  testCommandId: z.string().min(1),
}).strict();

export const StackProfileSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(['cofofo', 'generic-sdlc']),
  repositoryKind: z.enum(['single-stack', 'multi-stack', 'unsupported', 'ambiguous']),
  stack: StackDescriptorSchema.optional(),
  candidates: z.array(CofofoStackIdSchema),
  evidence: z.array(StackEvidenceSchema),
  confidence: z.number().min(0).max(1),
  fallback: z.object({ pipelineId: z.literal('aidlc-workflow-full'), reason: z.string().min(1) }).strict().optional(),
  detectedAt: z.string().datetime(),
}).strict().superRefine((profile, ctx) => {
  if (profile.mode === 'cofofo') {
    if (profile.repositoryKind !== 'single-stack' || !profile.stack || profile.candidates.length !== 1) {
      ctx.addIssue({ code: 'custom', message: 'CoFoFo mode requires exactly one supported stack.' });
    }
    if (profile.confidence < 0.9) {
      ctx.addIssue({ code: 'custom', message: 'CoFoFo mode requires confidence >= 0.9.' });
    }
  } else if (!profile.fallback) {
    ctx.addIssue({ code: 'custom', message: 'generic-sdlc mode must explain its fallback.' });
  }
});
export type StackProfile = z.infer<typeof StackProfileSchema>;

const RuleBase = {
  ruleId: z.string().regex(/^[A-Z][A-Z0-9_-]*-[0-9]+$/),
  scope: z.array(z.string().min(1)).min(1),
  severity: z.enum(['block', 'warn']),
  rationale: z.string().min(1),
  exceptions: z.array(z.object({
    path: RelativePathSchema,
    reason: z.string().min(1),
    reviewAfter: z.string().date(),
  }).strict()).default([]),
};

export const ProjectRuleSchema = z.discriminatedUnion('kind', [
  z.object({ ...RuleBase, kind: z.literal('path'), matcher: z.object({
    allowedRoots: z.array(RelativePathSchema).default([]),
    forbiddenPaths: z.array(z.string().min(1)).default([]),
  }).strict() }).strict(),
  z.object({ ...RuleBase, kind: z.literal('naming'), matcher: z.object({
    pattern: z.string().min(1),
    extensions: z.array(z.string().regex(/^\.[A-Za-z0-9]+$/)).default([]),
  }).strict() }).strict(),
  z.object({ ...RuleBase, kind: z.literal('layering'), matcher: z.object({
    from: z.array(z.string().min(1)).min(1),
    forbidImports: z.array(z.string().min(1)).min(1),
  }).strict() }).strict(),
  z.object({ ...RuleBase, kind: z.literal('dependency'), matcher: z.object({
    manifest: RelativePathSchema,
    forbidden: z.array(z.string().min(1)).min(1),
  }).strict() }).strict(),
  z.object({ ...RuleBase, kind: z.literal('commandId'), matcher: z.object({
    commandId: z.string().regex(/^[a-z][a-z0-9.-]+$/),
  }).strict() }).strict(),
]);
export type ProjectRule = z.infer<typeof ProjectRuleSchema>;

export const ProjectRulesSchema = z.object({
  schemaVersion: z.literal(1),
  foundationRevision: z.number().int().positive(),
  generatedAt: z.string().datetime(),
  rules: z.array(ProjectRuleSchema),
}).strict();
export type ProjectRules = z.infer<typeof ProjectRulesSchema>;

export const InstalledAssetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['agent', 'skill']),
  sourcePath: RelativePathSchema,
  installedPath: RelativePathSchema,
  sha256: Sha256Schema,
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
  license: z.literal('MIT'),
  modified: z.boolean(),
}).strict();

export const InstalledAssetsManifestSchema = z.object({
  schemaVersion: z.literal(1),
  foundationRevision: z.number().int().positive(),
  catalogRevision: z.string().regex(/^[a-f0-9]{40}$/),
  installedAt: z.string().datetime(),
  rollbackToken: z.string().min(1),
  assets: z.array(InstalledAssetSchema).min(1),
  attribution: z.object({
    noticePath: RelativePathSchema,
    noticeHash: Sha256Schema,
    licensePath: RelativePathSchema,
    licenseHash: Sha256Schema,
  }).strict(),
}).strict();
export type InstalledAssetsManifest = z.infer<typeof InstalledAssetsManifestSchema>;

export const ContextArtifactSchema = z.object({
  path: RelativePathSchema,
  sha256: Sha256Schema,
}).strict();

export const ContextManifestSchema = z.object({
  schemaVersion: z.literal(1),
  foundationRevision: z.number().int().positive(),
  catalogRevision: z.string().regex(/^[a-f0-9]{40}$/),
  stackId: CofofoStackIdSchema,
  generatedAt: z.string().datetime(),
  artifacts: z.array(ContextArtifactSchema).min(4),
  providers: z.array(z.enum(['claude', 'cursor', 'codex', 'opencode'])).min(1),
  contentHash: Sha256Schema,
}).strict();
export type ContextManifest = z.infer<typeof ContextManifestSchema>;

export const CofofoFoundationStateSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().positive(),
  status: z.enum(['pending-review', 'ready', 'stale', 'fallback']),
  route: z.enum(['bootstrap', 'refresh-context', 'update-rules', 'repin-bundle']),
  stackProfilePath: RelativePathSchema,
  contextManifestPath: RelativePathSchema.optional(),
  contextManifestHash: Sha256Schema.optional(),
  fallbackPipelineId: z.literal('aidlc-workflow-full').optional(),
  publishedAt: z.string().datetime(),
}).strict();
export type CofofoFoundationState = z.infer<typeof CofofoFoundationStateSchema>;

export const COFOFO_EVIDENCE_STAGES = ['red', 'red-waiver', 'green', 'refactor', 'verify'] as const;
export const CofofoEvidenceStageSchema = z.enum(COFOFO_EVIDENCE_STAGES);
export type CofofoEvidenceStage = z.infer<typeof CofofoEvidenceStageSchema>;

export const CofofoEvidenceRecordSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1),
  runId: z.string().min(1),
  sequence: z.number().int().positive(),
  stage: CofofoEvidenceStageSchema,
  /** Revision of the workflow step that captured this record. */
  stepRevision: z.number().int().positive(),
  commandId: z.string().min(1).optional(),
  args: z.array(z.string()).default([]),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  exitStatus: z.number().int().nullable(),
  timedOut: z.boolean(),
  accepted: z.boolean(),
  expectedFailure: z.string().min(1).optional(),
  failureOracleMatched: z.boolean().optional(),
  waiver: z.object({
    reviewer: z.string().min(1),
    reason: z.string().min(1),
    alternativeEvidence: z.string().min(1),
  }).strict().optional(),
  outputPreview: z.string(),
  logPath: RelativePathSchema,
  logHash: Sha256Schema,
  previousHash: Sha256Schema.optional(),
  recordHash: Sha256Schema,
}).strict();
export type CofofoEvidenceRecord = z.infer<typeof CofofoEvidenceRecordSchema>;

export interface CofofoFoundationSnapshot {
  revision: number;
  manifestPath: string;
  manifestHash: string;
  capturedAt: string;
}
