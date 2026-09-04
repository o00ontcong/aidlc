import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import type { WorkspaceConfig } from '../schema/WorkspaceSchema';
import {
  BundleBindingSchema,
  CofofoFoundationStateSchema,
  ContextManifestSchema,
  InstalledAssetsManifestSchema,
  StackProfileSchema,
  type CofofoFoundationSnapshot,
  type CofofoFoundationState,
  type ContextManifest,
  type StackProfile,
} from './contracts';
import { builtinCofofoCatalogRoot } from './Catalog';
import { diagnoseCofofoBinding, type CofofoDoctorIssue } from './CofofoDoctor';
import { stackGateIssues } from './StackDetector';
import { verifyInstalledAssets } from './Installer';
import {
  generatedCofofoWorkspace,
  installCofofoPhaseSkills,
  installCofofoProviderCommands,
} from './WorkflowGenerator';
import { hashFile, hashObject } from './hash';
import { resolveInside, writeAtomic } from './paths';

export const COFOFO_FOUNDATION_DIR = 'docs/project/foundation';
export const COFOFO_STATE_PATH = '.aidlc/cofofo/foundation.json';
export const COFOFO_CONTEXT_MANIFEST_PATH = `${COFOFO_FOUNDATION_DIR}/CONTEXT-MANIFEST.json`;

const FILES = {
  stackJson: `${COFOFO_FOUNDATION_DIR}/STACK-PROFILE.json`,
  installed: `${COFOFO_FOUNDATION_DIR}/INSTALLED-ASSETS.json`,
  context: COFOFO_CONTEXT_MANIFEST_PATH,
} as const;

export interface CofofoFoundationInspection {
  status: 'missing' | 'pending-review' | 'ready' | 'stale';
  state: CofofoFoundationState | null;
  profile: StackProfile | null;
  manifest: ContextManifest | null;
  issues: string[];
  /** Classifies each issue so callers never recommend an ineffective repair. */
  issueDetails?: Array<{ kind: 'content-drift' | 'foundation-invalid'; detail: string }>;
  /** Workspace ↔ bundle binding drift with Vietnamese user-facing copy for the extension. */
  doctorIssues?: CofofoDoctorIssue[];
  nextAction: string;
  snapshot?: CofofoFoundationSnapshot;
}

export class CofofoFoundationError extends Error {
  constructor(message: string, public readonly issues: string[] = []) {
    super(message);
    this.name = 'CofofoFoundationError';
  }
}

function readJson<T>(root: string, relative: string, parser: (value: unknown) => T): T | null {
  const absolute = resolveInside(root, relative);
  if (!fs.existsSync(absolute)) return null;
  return parser(JSON.parse(fs.readFileSync(absolute, 'utf8')));
}

function stateOf(root: string): CofofoFoundationState | null {
  return readJson(root, COFOFO_STATE_PATH, (value) => CofofoFoundationStateSchema.parse(value));
}

function contextHash(manifest: Omit<ContextManifest, 'contentHash'>): string {
  return hashObject(manifest);
}

/**
 * Validate a legacy CONTEXT-MANIFEST.json (and, for schema v2, its bundle
 * binding) against the files on disk. Read-only — this is compatibility
 * verification for a workspace that already went through the retired
 * agent-driven Foundation pipeline, never a source of new writes.
 */
function validateContext(root: string, manifest: ContextManifest): string[] {
  const issues: string[] = [];
  const { contentHash, ...draft } = manifest;
  if (contextHash(draft) !== contentHash) issues.push('CONTEXT-MANIFEST.json contentHash mismatch');
  for (const artifact of manifest.artifacts) {
    try {
      const absolute = resolveInside(root, artifact.path, true);
      if (hashFile(absolute) !== artifact.sha256) issues.push(`${artifact.path}: hash mismatch`);
    } catch { issues.push(`${artifact.path}: missing or unsafe`); }
  }
  const installed = readJson(root, FILES.installed, (value) => InstalledAssetsManifestSchema.parse(value));
  if (!installed) issues.push(`${FILES.installed}: missing`);
  else {
    if (installed.catalogRevision !== manifest.catalogRevision) issues.push('installed catalog revision does not match context');
    issues.push(...verifyInstalledAssets(root, installed));
  }
  if (manifest.schemaVersion === 2) {
    try {
      const bindingAbsolute = resolveInside(root, manifest.bindingPath, true);
      if (hashFile(bindingAbsolute) !== manifest.bindingHash) {
        issues.push(`${manifest.bindingPath}: binding hash mismatch`);
      }
      const binding = BundleBindingSchema.parse(JSON.parse(fs.readFileSync(bindingAbsolute, 'utf8')));
      for (const skill of binding.skills) {
        try {
          const absolute = resolveInside(root, skill.path, true);
          if (hashFile(absolute) !== skill.sha256) issues.push(`${skill.path}: binding skill hash mismatch`);
        } catch { issues.push(`${skill.path}: missing or unsafe`); }
      }
      if (binding.foundationRevision !== manifest.foundationRevision) {
        issues.push('bundle binding foundation revision does not match context manifest');
      }
      if (binding.catalogRevision !== manifest.catalogRevision) {
        issues.push('bundle binding catalog revision does not match context manifest');
      }
      issues.push(...diagnoseCofofoBinding(root).map((issue) => issue.detail));
    } catch { issues.push(`${manifest.bindingPath}: missing or invalid`); }
  }
  return issues;
}

function classifyInspectionIssues(issues: string[]): Array<{ kind: 'content-drift' | 'foundation-invalid'; detail: string }> {
  return issues.map((detail) => ({
    detail,
    // Drift means a ready foundation changed after a delivery run pinned it;
    // malformed/missing foundation material must be rebuilt and reviewed.
    kind: /(?:hash mismatch|different manifest hash|revision does not match)/i.test(detail)
      ? 'content-drift' as const
      : 'foundation-invalid' as const,
  }));
}

/**
 * Compatibility surface for the retired agent-driven `cofofo-foundation`
 * pipeline (scan-stack → … → publish-context, with Canvas-reviewed catalog
 * selection and install/publish/activate steps). Discover's "Publish
 * context" button and `DiscoverContextPublisher` are the only public,
 * currently-writable path for stack detection, rule compilation, and ECC
 * bundle install — this class now only (a) ensures the two CoFoFo delivery
 * pipelines exist in `.aidlc/workspace.yaml`, and (b) reads/validates a
 * legacy Foundation snapshot a workspace may already have on disk from
 * before this migration, so an old pinned `pipeline.foundation` gate keeps
 * resolving without silently going stale.
 */
export class CofofoFoundationService {
  readonly workspaceRoot: string;

  constructor(workspaceRoot: string, private readonly catalogRoot = builtinCofofoCatalogRoot()) {
    this.workspaceRoot = fs.realpathSync(path.resolve(workspaceRoot));
  }

  /**
   * Registers the two delivery pipelines (`cofofo-feature`, `cofofo-bugfix`).
   * Discover Context, not a separately startable Foundation workflow, owns the
   * prerequisite publication. This compatibility-named service remains because
   * existing callers use it to ensure the project-local CoFoFo workflow.
   */
  ensureWorkflowRegistered(): void {
    const workspacePath = resolveInside(this.workspaceRoot, '.aidlc/workspace.yaml');
    let current: Partial<WorkspaceConfig> | undefined;
    if (fs.existsSync(workspacePath)) current = yaml.load(fs.readFileSync(workspacePath, 'utf8')) as Partial<WorkspaceConfig>;
    const generated = generatedCofofoWorkspace(current);
    writeAtomic(workspacePath, yaml.dump(generated, { lineWidth: -1, noRefs: true, sortKeys: false }));
    installCofofoPhaseSkills(this.workspaceRoot);
    installCofofoProviderCommands(this.workspaceRoot, generated);
  }

  /** @deprecated CoFoFo no longer has a recipe layer; use ensureWorkflowRegistered(). */
  ensureRecipesRegistered(): void {
    this.ensureWorkflowRegistered();
  }

  /** Read-only compatibility check for a legacy Foundation snapshot, if one exists. */
  inspect(): CofofoFoundationInspection {
    let state: CofofoFoundationState | null;
    let profile: StackProfile | null;
    let manifest: ContextManifest | null;
    try {
      state = stateOf(this.workspaceRoot);
      profile = readJson(this.workspaceRoot, FILES.stackJson, (value) => StackProfileSchema.parse(value));
      manifest = readJson(this.workspaceRoot, FILES.context, (value) => ContextManifestSchema.parse(value));
    } catch (error) {
      return { status: 'stale', state: null, profile: null, manifest: null, issues: [error instanceof Error ? error.message : String(error)], nextAction: 'This project has an invalid legacy CoFoFo Foundation snapshot. Publish Discover Context instead.' };
    }
    if (!state) return { status: 'missing', state: null, profile, manifest, issues: ['CoFoFo foundation state is missing.'], nextAction: 'Publish Discover Context from the Discover tab.' };
    if (!manifest || state.status === 'pending-review') {
      const gate = profile ? stackGateIssues(profile) : [];
      const issues = [
        ...(manifest ? [] : ['Context has not been published.']),
        ...gate,
      ];
      return {
        status: 'pending-review', state, profile, manifest, issues,
        nextAction: gate.length
          ? 'scan-stack is closed: resolve to a single stack and re-run. CoFoFo does not guess a bundle.'
          : 'Publish Discover Context from the Discover tab.',
      };
    }
    const issues = validateContext(this.workspaceRoot, manifest);
    const doctorIssues = diagnoseCofofoBinding(this.workspaceRoot);
    for (const issue of doctorIssues) {
      if (!issues.includes(issue.detail)) issues.push(issue.detail);
    }
    const fileHash = hashFile(resolveInside(this.workspaceRoot, FILES.context, true));
    if (state.contextManifestHash !== fileHash) issues.push('foundation state points to a different manifest hash');
    if (state.revision !== manifest.foundationRevision) issues.push('foundation revision does not match context manifest');
    if (state.status !== 'ready') issues.push(`foundation status is ${state.status}`);
    if (issues.length) {
      const issueDetails = classifyInspectionIssues(issues);
      const onlyContentDrift = issueDetails.every((issue) => issue.kind === 'content-drift');
      return {
        status: 'stale', state, profile, manifest, issues, issueDetails, doctorIssues,
        nextAction: onlyContentDrift
          ? 'Legacy Foundation content drifted. Publish Discover Context to move this project onto the current mechanism.'
          : 'Legacy Foundation snapshot is invalid. Publish Discover Context to move this project onto the current mechanism.',
      };
    }
    return {
      status: 'ready', state, profile, manifest, issues: [], doctorIssues: [], nextAction: 'Start a cofofo-feature or cofofo-bugfix epic.',
      snapshot: { revision: state.revision, manifestPath: FILES.context, manifestHash: fileHash, capturedAt: new Date().toISOString() },
    };
  }

  requireReady(): CofofoFoundationSnapshot {
    const inspection = this.inspect();
    if (inspection.status !== 'ready' || !inspection.snapshot) {
      const issues = inspection.issues.length > 0
        ? inspection.issues
        : [`status=${inspection.status}`];
      const hint = 'This pipeline still pins a legacy CoFoFo Foundation gate. Publish Discover Context, then start a new task so it pins Discover context instead.';
      const next = inspection.nextAction ? ` Next: ${inspection.nextAction}` : '';
      throw new CofofoFoundationError(
        `CoFoFo foundation is not ready (${inspection.status}): ${issues.join('; ')}. ${hint}${next}`,
        issues,
      );
    }
    return inspection.snapshot;
  }
}
