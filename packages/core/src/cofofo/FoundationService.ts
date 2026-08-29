import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import type { WorkspaceConfig } from '../schema/WorkspaceSchema';
import { normalizeStep } from '../schema/WorkspaceSchema';
import { RunStateStore } from '../runs/RunStateStore';
import {
  BundleBindingSchema,
  CofofoFoundationStateSchema,
  ContextManifestSchema,
  InstalledAssetsManifestSchema,
  ProjectRulesSchema,
  StackProfileSchema,
  type CofofoFoundationSnapshot,
  type CofofoFoundationState,
  type ContextManifest,
  type ContextManifestV2,
  type ProjectRules,
  type StackProfile,
} from './contracts';
import { buildBundleBinding, COFOFO_BUNDLE_BINDING_PATH } from './BundleBinding';
import { builtinCofofoCatalogRoot, selectCatalog } from './Catalog';
import { diagnoseCofofoBinding, type CofofoDoctorIssue } from './CofofoDoctor';
import { renderProviderContext } from './ProviderContext';
import { composeWorkspaceFromBundle } from './WorkspaceComposer';
import { detectStack, validateStackProfile } from './StackDetector';
import {
  createDefaultRules,
  renderProjectRules,
  validateProjectRules,
  validateRulesMarkdown,
} from './RuleEngine';
import { installCatalog, previewCatalogInstall, verifyInstalledAssets } from './Installer';
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
  stackMarkdown: `${COFOFO_FOUNDATION_DIR}/STACK-PROFILE.md`,
  rulesJson: `${COFOFO_FOUNDATION_DIR}/PROJECT-RULES.json`,
  rulesMarkdown: `${COFOFO_FOUNDATION_DIR}/PROJECT-RULES.md`,
  drift: `${COFOFO_FOUNDATION_DIR}/RULE-DRIFT.md`,
  architecture: `${COFOFO_FOUNDATION_DIR}/ARCHITECTURE-MAP.md`,
  selection: `${COFOFO_FOUNDATION_DIR}/ECC-CATALOG-SELECTION.md`,
  installed: `${COFOFO_FOUNDATION_DIR}/INSTALLED-ASSETS.json`,
  bundleBinding: COFOFO_BUNDLE_BINDING_PATH,
  providerContext: `${COFOFO_FOUNDATION_DIR}/PROVIDER-CONTEXT.md`,
  context: COFOFO_CONTEXT_MANIFEST_PATH,
} as const;

export type FoundationRoute = 'bootstrap' | 'refresh-context' | 'update-rules' | 'repin-bundle';

export interface CofofoFoundationInspection {
  status: 'missing' | 'pending-review' | 'ready' | 'stale' | 'fallback';
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

function writeJson(root: string, relative: string, value: unknown): void {
  writeAtomic(resolveInside(root, relative), `${JSON.stringify(value, null, 2)}\n`);
}

function profileMarkdown(profile: StackProfile): string {
  const lines = ['# Stack Profile', '', `- Mode: **${profile.mode}**`, `- Repository: **${profile.repositoryKind}**`, `- Confidence: **${profile.confidence}**`];
  if (profile.stack) {
    lines.push(`- Stack: **${profile.stack.id}**`, `- Language: ${profile.stack.language}`, `- Version: ${profile.stack.version}`, `- Package manager: ${profile.stack.packageManager}`, `- Build system: ${profile.stack.buildSystem}`);
  }
  if (profile.fallback) lines.push('', '## Fallback', '', `${profile.fallback.reason} Use ${profile.fallback.pipelineId}.`);
  lines.push('', '## Machine Evidence', '', ...profile.evidence.map((item) => `- ${item.path} — ${item.observed} — ${item.sha256}`), '');
  return lines.join('\n');
}

function sourceFiles(root: string): string[] {
  const ignored = new Set(['.git', '.aidlc', '.build', 'node_modules', 'dist', 'build', 'DerivedData']);
  const output: string[] = [];
  const visit = (directory: string, depth: number): void => {
    if (depth > 5 || output.length >= 200) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute, depth + 1);
      else if (entry.isFile()) output.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  };
  visit(root, 0);
  return output.sort();
}

function architectureMap(root: string, profile: StackProfile): string {
  const files = sourceFiles(root).filter((file) => /(?:Sources|Tests|src|test|Package\.swift)/.test(file));
  const layers = new Map<string, string[]>();
  for (const file of files) {
    const layer = file.includes('/Presentation/') ? 'Presentation'
      : file.includes('/Domain/') ? 'Domain'
        : file.includes('/Data/') ? 'Data'
          : file.includes('/Tests/') || file.includes('/test') ? 'Tests'
            : 'Project';
    const values = layers.get(layer) ?? [];
    values.push(file);
    layers.set(layer, values);
  }
  const lines = ['# Architecture Map', '', `Stack: **${profile.stack?.id ?? 'fallback'}**`, '', '## Layer Map', ''];
  for (const [layer, values] of layers) {
    lines.push(`### ${layer}`, '', ...values.slice(0, 40).map((file) => `- ${file}`), '');
  }
  lines.push('## Dependency Direction', '', 'Presentation → Data → Domain. Domain must not import presentation frameworks.', '', '## Test Seams', '', 'External data is accessed behind protocols and replaced by deterministic fakes.', '');
  return lines.join('\n');
}

function catalogSelectionMarkdown(profile: StackProfile, catalogRoot: string): string {
  const selection = selectCatalog(profile);
  if (!selection) return '# ECC Catalog Selection\n\nNo audited text bundle is available; use generic SDLC.\n';
  const lines = [
    '# ECC Catalog Selection', '',
    `Pinned revision: ${selection.revision}`, '',
    '## Approved Text Assets', '',
    '| ID | Kind | Source | SHA-256 | Modified |',
    '|---|---|---|---|---|',
  ];
  for (const asset of selection.assets) {
    const digest = hashFile(resolveInside(catalogRoot, asset.sourcePath, true));
    lines.push(`| ${asset.id} | ${asset.kind} | ${asset.sourcePath} | ${digest} | ${asset.modified ? 'yes' : 'no'} |`);
  }
  lines.push('', 'Only Markdown agents and skills are selected. Hooks, validators, scripts, and binaries are rejected. Runtime network fetch is disabled.', '');
  return lines.join('\n');
}

function stateOf(root: string): CofofoFoundationState | null {
  return readJson(root, COFOFO_STATE_PATH, (value) => CofofoFoundationStateSchema.parse(value));
}

function assertCanvasApproved(root: string, runId: string, stepName: string): void {
  const state = RunStateStore.load(root, runId);
  if (!state) throw new CofofoFoundationError(`Foundation run "${runId}" does not exist.`);
  const pipeline = state.pipelineSnapshot?.pipeline;
  if (!pipeline || pipeline.id !== 'cofofo-foundation') throw new CofofoFoundationError(`Run "${runId}" is not a CoFoFo foundation run.`);
  const index = pipeline.steps.findIndex((step) => (normalizeStep(step).name ?? normalizeStep(step).agent) === stepName);
  const step = state.steps[index];
  if (index < 0 || !step || step.status !== 'approved' || step.canvasReview?.verdict !== 'approve') {
    throw new CofofoFoundationError(`Step "${stepName}" must be approved through its content-bound Canvas gate first.`);
  }
}

function assertStepApproved(root: string, runId: string, stepName: string): void {
  const state = RunStateStore.load(root, runId);
  const pipeline = state?.pipelineSnapshot?.pipeline;
  const index = pipeline?.steps.findIndex((step) => (normalizeStep(step).name ?? normalizeStep(step).agent) === stepName) ?? -1;
  if (!state || index < 0 || state.steps[index]?.status !== 'approved') {
    throw new CofofoFoundationError(`Foundation step "${stepName}" must be approved before this action.`);
  }
}

function managedBlock(content: string, block: string): string {
  const start = '<!-- aidlc:cofofo-context start -->';
  const end = '<!-- aidlc:cofofo-context end -->';
  const first = content.indexOf(start);
  const last = content.indexOf(end);
  if ((first >= 0) !== (last >= 0) || (first >= 0 && last < first)) {
    throw new CofofoFoundationError('Managed CoFoFo context markers are malformed; refusing to overwrite user-authored content.');
  }
  const rendered = `${start}\n${block.trim()}\n${end}`;
  if (first >= 0) return `${content.slice(0, first)}${rendered}${content.slice(last + end.length)}`;
  return `${content.trimEnd()}${content.trim() ? '\n\n' : ''}${rendered}\n`;
}

function contextHash(manifest: Omit<ContextManifest, 'contentHash'>): string {
  return hashObject(manifest);
}

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

export class CofofoFoundationService {
  readonly workspaceRoot: string;

  constructor(workspaceRoot: string, private readonly catalogRoot = builtinCofofoCatalogRoot()) {
    this.workspaceRoot = fs.realpathSync(path.resolve(workspaceRoot));
  }

  prepare(args: { route?: FoundationRoute; force?: boolean; now?: string } = {}): CofofoFoundationInspection {
    const route = args.route ?? 'bootstrap';
    const now = args.now ?? new Date().toISOString();
    const previous = stateOf(this.workspaceRoot);
    const revision = (previous?.revision ?? 0) + 1;
    const profile = detectStack(this.workspaceRoot, now);
    writeJson(this.workspaceRoot, FILES.stackJson, profile);
    writeAtomic(resolveInside(this.workspaceRoot, FILES.stackMarkdown), profileMarkdown(profile));

    const selection = selectCatalog(profile);
    if (profile.mode !== 'cofofo' || !selection) {
      const fallbackProfile: StackProfile = selection ? profile : StackProfileSchema.parse({
        ...profile,
        mode: 'generic-sdlc',
        repositoryKind: profile.repositoryKind === 'single-stack' ? 'unsupported' : profile.repositoryKind,
        stack: undefined,
        confidence: Math.min(profile.confidence, 0.5),
        fallback: { pipelineId: 'aidlc-workflow-full', reason: `No audited catalog is installed for ${profile.stack?.id ?? 'the detected repository'}.` },
      });
      if (fallbackProfile !== profile) {
        writeJson(this.workspaceRoot, FILES.stackJson, fallbackProfile);
        writeAtomic(resolveInside(this.workspaceRoot, FILES.stackMarkdown), profileMarkdown(fallbackProfile));
      }
      const fallbackState = CofofoFoundationStateSchema.parse({
        schemaVersion: 1, revision, status: 'fallback', route,
        stackProfilePath: FILES.stackJson, fallbackPipelineId: 'aidlc-workflow-full', publishedAt: now,
      });
      writeJson(this.workspaceRoot, COFOFO_STATE_PATH, fallbackState);
      return { status: 'fallback', state: fallbackState, profile: fallbackProfile, manifest: null, issues: [fallbackProfile.fallback!.reason], nextAction: 'Use the existing aidlc-workflow-full pipeline.' };
    }

    let rules: ProjectRules;
    const existingRules = readJson(this.workspaceRoot, FILES.rulesJson, (value) => ProjectRulesSchema.parse(value));
    if (existingRules && route !== 'bootstrap' && route !== 'update-rules') rules = existingRules;
    else if (existingRules && !args.force) rules = ProjectRulesSchema.parse({ ...existingRules, foundationRevision: revision, generatedAt: now });
    else rules = createDefaultRules(profile, revision, now);
    writeJson(this.workspaceRoot, FILES.rulesJson, rules);
    writeAtomic(resolveInside(this.workspaceRoot, FILES.rulesMarkdown), renderProjectRules(rules));
    const violations = validateProjectRules({ workspaceRoot: this.workspaceRoot, rules, profile, now });
    writeAtomic(resolveInside(this.workspaceRoot, FILES.drift), [
      '# Rule Drift', '', '## Findings', '',
      ...(violations.length ? violations.map((issue) => `- **${issue.severity} ${issue.ruleId}** — ${issue.path}: ${issue.message}`) : ['- No current violations.']), '',
    ].join('\n'));
    writeAtomic(resolveInside(this.workspaceRoot, FILES.architecture), architectureMap(this.workspaceRoot, profile));
    writeAtomic(resolveInside(this.workspaceRoot, FILES.selection), catalogSelectionMarkdown(profile, this.catalogRoot));

    installCofofoPhaseSkills(this.workspaceRoot);
    const workspacePath = resolveInside(this.workspaceRoot, '.aidlc/workspace.yaml');
    let current: Partial<WorkspaceConfig> | undefined;
    if (fs.existsSync(workspacePath)) current = yaml.load(fs.readFileSync(workspacePath, 'utf8')) as Partial<WorkspaceConfig>;
    const generated = generatedCofofoWorkspace(current);
    writeAtomic(workspacePath, yaml.dump(generated, { lineWidth: -1, noRefs: true, sortKeys: false }));
    installCofofoProviderCommands(this.workspaceRoot, generated);

    const pending = CofofoFoundationStateSchema.parse({
      schemaVersion: 1, revision, status: 'pending-review', route,
      stackProfilePath: FILES.stackJson, publishedAt: now,
    });
    writeJson(this.workspaceRoot, COFOFO_STATE_PATH, pending);
    return { status: 'pending-review', state: pending, profile, manifest: null, issues: violations.filter((issue) => issue.severity === 'block').map((issue) => `${issue.ruleId}: ${issue.message}`), nextAction: 'Start cofofo-foundation, review policy/catalog in Canvas, then install.' };
  }

  install(runId: string, force = false): ReturnType<typeof installCatalog> {
    const run = RunStateStore.load(this.workspaceRoot, runId);
    const snapshot = run?.pipelineSnapshot?.pipeline;
    const hasCatalogStep = snapshot?.steps.some((step) => (normalizeStep(step).name ?? normalizeStep(step).agent) === 'select-ecc-catalog');
    if (hasCatalogStep) assertCanvasApproved(this.workspaceRoot, runId, 'select-ecc-catalog');
    const state = stateOf(this.workspaceRoot);
    const profile = readJson(this.workspaceRoot, FILES.stackJson, (value) => StackProfileSchema.parse(value));
    if (!state || !profile || state.status === 'fallback') throw new CofofoFoundationError('Prepare a supported CoFoFo foundation before installing.');
    if (state.route === 'bootstrap') assertCanvasApproved(this.workspaceRoot, runId, 'define-rules');
    return installCatalog({ workspaceRoot: this.workspaceRoot, profile, foundationRevision: state.revision, force, catalogRoot: this.catalogRoot });
  }

  previewInstall(): ReturnType<typeof previewCatalogInstall> {
    const profile = readJson(this.workspaceRoot, FILES.stackJson, (value) => StackProfileSchema.parse(value));
    if (!profile || profile.mode !== 'cofofo') {
      throw new CofofoFoundationError('Prepare a supported CoFoFo foundation before previewing the install.');
    }
    return previewCatalogInstall({ workspaceRoot: this.workspaceRoot, profile, catalogRoot: this.catalogRoot });
  }

  renderRules(now = new Date().toISOString()): ReturnType<typeof validateProjectRules> {
    const state = stateOf(this.workspaceRoot);
    const profile = readJson(this.workspaceRoot, FILES.stackJson, (value) => StackProfileSchema.parse(value));
    const rules = readJson(this.workspaceRoot, FILES.rulesJson, (value) => ProjectRulesSchema.parse(value));
    if (!state || !profile || !rules) throw new CofofoFoundationError('Prepare CoFoFo before rendering project rules.');
    if (rules.foundationRevision !== state.revision) {
      throw new CofofoFoundationError(
        `PROJECT-RULES.json targets Foundation revision ${rules.foundationRevision}; expected ${state.revision}.`,
      );
    }
    writeAtomic(resolveInside(this.workspaceRoot, FILES.rulesMarkdown), renderProjectRules(rules));
    const violations = validateProjectRules({ workspaceRoot: this.workspaceRoot, rules, profile, now });
    writeAtomic(resolveInside(this.workspaceRoot, FILES.drift), [
      '# Rule Drift', '', '## Findings', '',
      ...(violations.length
        ? violations.map((issue) => `- **${issue.severity} ${issue.ruleId}** — ${issue.path}: ${issue.message}`)
        : ['- No current violations.']), '',
    ].join('\n'));
    return violations;
  }

  publish(runId: string, now = new Date().toISOString()): ContextManifest {
    const state = stateOf(this.workspaceRoot);
    const profile = readJson(this.workspaceRoot, FILES.stackJson, (value) => StackProfileSchema.parse(value));
    const rules = readJson(this.workspaceRoot, FILES.rulesJson, (value) => ProjectRulesSchema.parse(value));
    const installed = readJson(this.workspaceRoot, FILES.installed, (value) => InstalledAssetsManifestSchema.parse(value));
    if (!state || !profile || !rules || !installed || !profile.stack) throw new CofofoFoundationError('Foundation artifacts are incomplete.');
    if (state.route === 'bootstrap' || state.route === 'repin-bundle') {
      assertStepApproved(this.workspaceRoot, runId, 'install-ecc-assets');
    }
    if (state.route === 'update-rules') {
      assertCanvasApproved(this.workspaceRoot, runId, 'define-rules');
    }
    const issues = [
      ...validateStackProfile(this.workspaceRoot, profile),
      ...validateRulesMarkdown(rules, fs.readFileSync(resolveInside(this.workspaceRoot, FILES.rulesMarkdown, true), 'utf8')),
      ...validateProjectRules({ workspaceRoot: this.workspaceRoot, rules, profile, now }).filter((issue) => issue.severity === 'block').map((issue) => `${issue.ruleId}: ${issue.message}`),
      ...verifyInstalledAssets(this.workspaceRoot, installed),
    ];
    if (issues.length) throw new CofofoFoundationError('Foundation validation failed; context was not published.', issues);

    const selection = selectCatalog(profile);
    if (!selection) {
      throw new CofofoFoundationError('No audited catalog selection is available for this stack.');
    }
    const binding = buildBundleBinding({
      selection,
      installed,
      foundationRevision: state.revision,
    });
    writeJson(this.workspaceRoot, FILES.bundleBinding, binding);

    const workspacePath = resolveInside(this.workspaceRoot, '.aidlc/workspace.yaml');
    let current: Partial<WorkspaceConfig> | undefined;
    if (fs.existsSync(workspacePath)) {
      current = yaml.load(fs.readFileSync(workspacePath, 'utf8')) as Partial<WorkspaceConfig>;
    }
    const skeleton = generatedCofofoWorkspace(current);
    const workspace = composeWorkspaceFromBundle({
      workspaceRoot: this.workspaceRoot,
      skeleton,
      binding,
      installed,
    });
    writeAtomic(workspacePath, yaml.dump(workspace, { lineWidth: -1, noRefs: true, sortKeys: false }));

    const bindingHash = hashFile(resolveInside(this.workspaceRoot, FILES.bundleBinding, true));
    const providerContext = renderProviderContext({
      foundationRevision: state.revision,
      stackId: profile.stack.id,
      catalogRevision: installed.catalogRevision,
      binding,
      rulesJsonPath: FILES.rulesJson,
      architecturePath: FILES.architecture,
      stackProfilePath: FILES.stackJson,
      bundleBindingPath: FILES.bundleBinding,
    });
    // Provider files are installation targets, not review artifacts: other
    // tools may update them while a Canvas gate is open. Review this rendered,
    // immutable source instead and install it only after approval in activate().
    writeAtomic(resolveInside(this.workspaceRoot, FILES.providerContext), `${providerContext}\n`);
    const artifacts = [
      FILES.stackJson, FILES.rulesJson, FILES.architecture, FILES.installed,
      FILES.bundleBinding, FILES.providerContext,
    ].map((relative) => ({ path: relative, sha256: hashFile(resolveInside(this.workspaceRoot, relative, true)) }));
    const draft: Omit<ContextManifestV2, 'contentHash'> = {
      schemaVersion: 2,
      bindingPath: FILES.bundleBinding,
      bindingHash,
      foundationRevision: state.revision,
      catalogRevision: installed.catalogRevision,
      stackId: profile.stack.id,
      generatedAt: now,
      artifacts,
      providers: ['claude', 'cursor', 'codex', 'opencode'],
    };
    const manifest = ContextManifestSchema.parse({ ...draft, contentHash: contextHash(draft) });
    writeJson(this.workspaceRoot, FILES.context, manifest);
    installCofofoProviderCommands(this.workspaceRoot, workspace, manifest.contentHash);
    const docsReadme = resolveInside(this.workspaceRoot, 'docs/README.md');
    const existingDocs = fs.existsSync(docsReadme) ? fs.readFileSync(docsReadme, 'utf8') : '# Project Documentation\n';
    writeAtomic(docsReadme, managedBlock(existingDocs, [
      `Foundation revision: ${manifest.foundationRevision}`, '',
      'Reading order:', `1. ${FILES.context}`, `2. ${FILES.rulesMarkdown}`, `3. ${FILES.architecture}`, `4. ${FILES.selection}`,
    ].join('\n')));
    const pending = CofofoFoundationStateSchema.parse({
      ...state, status: 'pending-review', contextManifestPath: FILES.context,
      contextManifestHash: hashFile(resolveInside(this.workspaceRoot, FILES.context, true)), publishedAt: now,
    });
    writeJson(this.workspaceRoot, COFOFO_STATE_PATH, pending);
    return manifest;
  }

  activate(runId: string): CofofoFoundationState {
    assertCanvasApproved(this.workspaceRoot, runId, 'publish-context');
    const state = stateOf(this.workspaceRoot);
    const manifest = readJson(this.workspaceRoot, FILES.context, (value) => ContextManifestSchema.parse(value));
    if (!state || !manifest) throw new CofofoFoundationError('Publish context before activating the foundation.');
    const issues = validateContext(this.workspaceRoot, manifest);
    if (issues.length) throw new CofofoFoundationError('Context is stale or invalid; activation failed.', issues);
    const providerContextPath = resolveInside(this.workspaceRoot, FILES.providerContext, true);
    const providerContext = fs.readFileSync(providerContextPath, 'utf8');
    for (const relative of ['AGENTS.md', 'CLAUDE.md', '.cursor/rules/cofofo.md', '.opencode/instructions/cofofo.md']) {
      const absolute = resolveInside(this.workspaceRoot, relative);
      const existing = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
      writeAtomic(absolute, managedBlock(existing, providerContext));
    }
    const ready = CofofoFoundationStateSchema.parse({
      ...state, status: 'ready', contextManifestPath: FILES.context,
      contextManifestHash: hashFile(resolveInside(this.workspaceRoot, FILES.context, true)),
    });
    writeJson(this.workspaceRoot, COFOFO_STATE_PATH, ready);
    return ready;
  }

  inspect(): CofofoFoundationInspection {
    let state: CofofoFoundationState | null;
    let profile: StackProfile | null;
    let manifest: ContextManifest | null;
    try {
      state = stateOf(this.workspaceRoot);
      profile = readJson(this.workspaceRoot, FILES.stackJson, (value) => StackProfileSchema.parse(value));
      manifest = readJson(this.workspaceRoot, FILES.context, (value) => ContextManifestSchema.parse(value));
    } catch (error) {
      return { status: 'stale', state: null, profile: null, manifest: null, issues: [error instanceof Error ? error.message : String(error)], nextAction: 'Run `aidlc cofofo prepare --route refresh-context`.' };
    }
    if (!state) return { status: 'missing', state: null, profile, manifest, issues: ['CoFoFo foundation state is missing.'], nextAction: 'Run `aidlc cofofo prepare`.' };
    if (state.status === 'fallback') return { status: 'fallback', state, profile, manifest: null, issues: [profile?.fallback?.reason ?? 'Unsupported repository.'], nextAction: 'Use aidlc-workflow-full.' };
    if (!manifest || state.status === 'pending-review') return { status: 'pending-review', state, profile, manifest, issues: manifest ? [] : ['Context has not been published.'], nextAction: manifest ? 'Approve publish-context in Canvas and activate.' : 'Complete the foundation pipeline and publish context.' };
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
          ? 'Foundation content drifted; prepare the appropriate refresh/update/repin route, review, and reactivate.'
          : 'Foundation is invalid; run `aidlc cofofo prepare --route refresh-context`, review, publish, and activate.',
      };
    }
    return {
      status: 'ready', state, profile, manifest, issues: [], doctorIssues: [], nextAction: 'Start a cofofo-feature or cofofo-bugfix recipe.',
      snapshot: { revision: state.revision, manifestPath: FILES.context, manifestHash: fileHash, capturedAt: new Date().toISOString() },
    };
  }

  requireReady(): CofofoFoundationSnapshot {
    const inspection = this.inspect();
    if (inspection.status !== 'ready' || !inspection.snapshot) throw new CofofoFoundationError('CoFoFo foundation is not ready.', inspection.issues);
    return inspection.snapshot;
  }
}
