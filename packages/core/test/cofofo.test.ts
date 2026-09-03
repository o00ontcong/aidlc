import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CofofoFoundationService,
  RunStateStore,
  WorkspaceLoader,
  applyArtifactReviewVerdict,
  assemblePipeline,
  buildReviewBundle,
  canStartStep,
  createDefaultRules,
  detectStack,
  generatedCofofoWorkspace,
  foundationPipelineForRoute,
  hashFile,
  installCatalog,
  markStepDone,
  normalizeStep,
  previewCatalogInstall,
  rebaseRunToCurrentFoundation,
  resolveInside,
  rollbackCatalog,
  renderProjectRules,
  rulesSourceHash,
  startRun,
  validateProjectRules,
  validateRulesMarkdown,
  validateMemoryHandoff,
  validateStackProfile,
  ContextManifestV2Schema,
  COFOFO_BUNDLE_BINDING_PATH,
  diagnoseCofofoBinding,
  renderProviderContext,
  buildBundleBinding,
  selectCatalog,
  type PipelineConfig,
  type RunState,
} from '../src';

function temporary(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cofofo-'));
}

function write(root: string, relative: string, content: string): void {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, 'utf8');
}

/**
 * `prepare()` no longer pre-seeds these — a real `define-rules`/`map-system`
 * step run by an agent would produce them. Tests have no agent to call, so
 * they simulate that step's output directly before marking it done, exactly
 * like `write()` above stands in for any other agent-written artifact.
 */
function simulateDefineRules(root: string, revision = 1): void {
  const rules = createDefaultRules(detectStack(root), revision, new Date().toISOString());
  write(root, 'docs/project/foundation/PROJECT-RULES.json', JSON.stringify(rules, null, 2));
  write(root, 'docs/project/foundation/PROJECT-RULES.md', renderProjectRules(rules));
  write(root, 'docs/project/foundation/RULE-DRIFT.md', '# Rule Drift\n\n## Findings\n\n- No current violations.\n');
}
function simulateMapSystem(root: string): void {
  write(root, 'docs/project/foundation/ARCHITECTURE-MAP.md', '# Architecture Map\n\n## Layer Map\n\n- (test placeholder)\n');
}

function swiftFixture(): string {
  const root = temporary();
  write(root, 'src/Package.swift', '// swift-tools-version: 5.9\nimport PackageDescription\nlet package = Package(name: "Demo")\n');
  write(root, 'src/Sources/Demo/Domain/City.swift', 'public struct City {}\n');
  write(root, 'src/Sources/Demo/Presentation/Dashboard.swift', 'import SwiftUI\npublic struct Dashboard {}\n');
  write(root, 'src/Tests/DemoTests/CityTests.swift', 'import XCTest\n');
  return root;
}

describe('CoFoFo stack detection and policy', () => {
  it('detects one SwiftPM stack with content-addressed evidence', () => {
    const root = swiftFixture();
    const profile = detectStack(root, '2026-08-28T00:00:00.000Z');
    expect(profile.mode).toBe('cofofo');
    expect(profile.stack?.id).toBe('ios-swift');
    expect(profile.confidence).toBeGreaterThanOrEqual(0.9);
    expect(validateStackProfile(root, profile)).toEqual([]);

    write(root, 'src/Package.swift', '// swift-tools-version: 6.0\n');
    expect(validateStackProfile(root, profile)).toContain('src/Package.swift: content changed');
  });

  it('fails closed for a multi-stack repository without switching pipelines', () => {
    const root = swiftFixture();
    write(root, 'web/package.json', '{"name":"web","engines":{"node":">=20"}}\n');
    const profile = detectStack(root);
    expect(profile.mode).toBe('cofofo');
    expect(profile.repositoryKind).toBe('multi-stack');
    expect(profile.stack).toBeUndefined();
    expect(profile.closed?.reason).toMatch(/does not guess a bundle/);
    expect(selectCatalog(profile)).toBeNull();
    const prepared = new CofofoFoundationService(root).prepare();
    expect(prepared.status).toBe('pending-review');
    expect(prepared.issues.join('\n')).toMatch(/does not guess a bundle/);
  });

  it('ignores an AI provider tool directory bootstrapping its own package.json', () => {
    const root = swiftFixture();
    // `opencode` (like `.cursor`/`.codex`/`.claude`) can install its own local
    // node_modules for a repo it's active in. That is provider tooling, not a
    // second project stack, so it must not trip multi-stack detection.
    write(root, '.opencode/package.json', '{"name":"opencode-local","dependencies":{"zod":"^4.0.0"}}\n');
    write(root, '.opencode/node_modules/zod/package.json', '{"name":"zod"}\n');
    const profile = detectStack(root);
    expect(profile.mode).toBe('cofofo');
    expect(profile.repositoryKind).toBe('single-stack');
    expect(profile.stack?.id).toBe('ios-swift');
  });

  it('selects the ios-swift catalog for Xcode without guessing destinations', () => {
    const root = temporary();
    write(root, 'Demo.xcodeproj/project.pbxproj', '// !$*UTF8*$!\n');
    const profile = detectStack(root);
    expect(profile.mode).toBe('cofofo');
    expect(profile.stack?.packageManager).toBe('xcode');
    const selection = selectCatalog(profile);
    expect(selection?.stackId).toBe('ios-swift');
    expect(selection?.commands.map((command) => command.id)).toEqual(['swift.xcode-build', 'swift.xcode-test']);
    expect(selection?.commands.every((command) => !command.args.includes('-destination') && !command.args.includes('-scheme'))).toBe(true);
    const result = new CofofoFoundationService(root).prepare();
    expect(result.status).toBe('pending-review');
    expect(result.profile?.mode).toBe('cofofo');
  });

  it('binds PROJECT-RULES.md to canonical JSON and blocks a forbidden import', () => {
    const root = swiftFixture();
    const profile = detectStack(root);
    const workspace = generatedCofofoWorkspace({ version: '1.0', name: 'Demo' });
    expect(workspace.pipelines.find((pipeline) => pipeline.id === 'cofofo-delivery')?.foundation?.mode).toBe('cofofo');
    // define-rules writes this for real during a run; simulate it here first
    // so prepare()'s command-file hash embedding has something real to hash.
    const rules = createDefaultRules(profile, 1, '2026-08-28T00:00:00.000Z');
    const markdown = renderProjectRules(rules);
    write(root, 'docs/project/foundation/PROJECT-RULES.json', JSON.stringify(rules, null, 2));
    write(root, 'docs/project/foundation/PROJECT-RULES.md', markdown);
    const service = new CofofoFoundationService(root);
    service.prepare({ now: '2026-08-28T00:00:00.000Z' });
    expect(markdown).toContain(rulesSourceHash(rules));
    expect(validateRulesMarkdown(rules, markdown)).toEqual([]);
    expect(validateProjectRules({ workspaceRoot: root, rules, profile }).some((issue) => issue.ruleId === 'LAYER-1')).toBe(false);
    expect(fs.readFileSync(path.join(root, '.codex/skills/aidlc-cofofo-delivery-create-plan/SKILL.md'), 'utf8'))
      .toContain(hashFile(path.join(root, 'docs/project/foundation/PROJECT-RULES.json')));

    write(root, 'src/Sources/Demo/Domain/City.swift', 'import SwiftUI\npublic struct City {}\n');
    expect(validateProjectRules({ workspaceRoot: root, rules, profile })).toContainEqual(expect.objectContaining({ ruleId: 'LAYER-1', severity: 'block' }));
  });

  it('builds the exact phase slice for every Foundation route', () => {
    const workspace = generatedCofofoWorkspace({ version: '1.0', name: 'Demo' });
    const pipeline = workspace
      .pipelines.find((item) => item.id === 'cofofo-foundation')!;
    expect(foundationPipelineForRoute(pipeline, 'refresh-context').steps.map((step) => typeof step === 'string' ? step : step.name))
      .toEqual(['scan-stack', 'map-system', 'publish-context']);
    expect(foundationPipelineForRoute(pipeline, 'update-rules').steps.map((step) => typeof step === 'string' ? step : step.name))
      .toEqual(['define-rules', 'publish-context']);
    expect(foundationPipelineForRoute(pipeline, 'repin-bundle').steps.map((step) => typeof step === 'string' ? step : step.name))
      .toEqual(['select-ecc-catalog', 'install-ecc-assets', 'publish-context']);
    const delivery = workspace.pipelines.find((item) => item.id === 'cofofo-delivery')!;
    const requirement = delivery.steps.find((step) => (typeof step === 'string' ? step : step.name) === 'requirement') as { human_review?: boolean; review?: { artifacts: string[] } };
    const red = delivery.steps.find((step) => (typeof step === 'string' ? step : step.name) === 'reproduce') as { human_review?: boolean; review?: { artifacts: string[] } };
    const diagnose = delivery.steps.find((step) => (typeof step === 'string' ? step : step.name) === 'diagnose') as { requires?: string[]; produces_contains?: string[] };
    expect(requirement).toMatchObject({ human_review: true, review: { artifacts: [
      'docs/epics/{epic}/artifacts/INTENT.md',
      'docs/epics/{epic}/artifacts/EVIDENCE.md',
      'docs/epics/{epic}/artifacts/OPTIONS.md',
      'docs/epics/{epic}/artifacts/REQUIREMENT.md',
    ] } });
    expect(red).toMatchObject({ human_review: true, review: { artifacts: ['docs/epics/{epic}/artifacts/RED-EVIDENCE.md'] } });
    expect(diagnose.requires).toContain('docs/epics/{epic}/artifacts/BUG-REPORT.md');
    expect(diagnose.produces_contains).toContain('## Resume From');
    const feature = assemblePipeline(workspace, { recipeId: 'cofofo-feature', pipelineId: 'FEATURE-1' });
    const assembledRequirement = feature.steps.find((step) => normalizeStep(step).name === 'requirement');
    expect(normalizeStep(assembledRequirement!).review?.artifacts).toContain('docs/epics/{epic}/artifacts/REQUIREMENT.md');
  });

  it('previews installs without writing, detects drift, and restores a rollback backup', () => {
    const root = swiftFixture();
    const profile = detectStack(root);
    const preview = previewCatalogInstall({ workspaceRoot: root, profile });
    expect(preview.issues).toEqual([]);
    expect(preview.assets.every((asset) => asset.action === 'create')).toBe(true);
    expect(fs.existsSync(path.join(root, '.aidlc/cofofo/vendor/ecc'))).toBe(false);

    const first = installCatalog({ workspaceRoot: root, profile, foundationRevision: 1 });
    const target = path.join(root, first.assets[0]!.installedPath);
    write(root, first.assets[0]!.installedPath, 'local reviewed edit\n');
    expect(() => installCatalog({ workspaceRoot: root, profile, foundationRevision: 2 })).toThrow(/drift/);
    const forced = installCatalog({ workspaceRoot: root, profile, foundationRevision: 2, force: true });
    expect(fs.readFileSync(target, 'utf8')).not.toBe('local reviewed edit\n');
    rollbackCatalog(root, forced.rollbackToken);
    expect(fs.readFileSync(target, 'utf8')).toBe('local reviewed edit\n');
  });

  it('refuses write targets whose intermediate directory is a symlink', () => {
    const root = swiftFixture();
    const outside = temporary();
    fs.mkdirSync(path.join(root, '.aidlc/cofofo'), { recursive: true });
    fs.symlinkSync(outside, path.join(root, '.aidlc/cofofo/vendor'));
    expect(() => resolveInside(root, '.aidlc/cofofo/vendor/ecc/skill.md')).toThrow(/symlink/);
    expect(() => installCatalog({ workspaceRoot: root, profile: detectStack(root), foundationRevision: 1 })).toThrow(/symlink/);
  });

  it('runs CoFoFo and closes scan-stack when no stack manifest exists', () => {
    const root = temporary();
    const profile = detectStack(root);
    expect(profile.mode).toBe('cofofo');
    expect(profile.repositoryKind).toBe('unsupported');
    expect(profile.closed?.reason).toMatch(/No supported stack manifest/);
    expect(selectCatalog(profile)).toBeNull();
    const prepared = new CofofoFoundationService(root).prepare();
    expect(prepared.status).toBe('pending-review');
    expect(prepared.issues.join('\n')).toMatch(/No supported stack manifest/);
  });

  it('keeps memory bounded, unreviewed, and free of credentials', () => {
    expect(validateMemoryHandoff('# Memory\n\nunreviewed\n')).toEqual([]);
    expect(validateMemoryHandoff('# Memory\n\ntoken=super-secret-value-123456\n')).toEqual(expect.arrayContaining([
      expect.stringMatching(/unreviewed/),
      expect.stringMatching(/secret/),
    ]));
    expect(validateMemoryHandoff(`unreviewed\n${'x'.repeat(70_000)}`)).toContainEqual(expect.stringMatching(/exceeds/));
  });
});

describe('CoFoFo catalog selection is stack-dynamic', () => {
  const SHARED = ['ecc-tdd-guide', 'ecc-tdd-workflow', 'ecc-security-review'];
  const SWIFT_ONLY = ['ecc-swift-reviewer', 'ecc-swift-protocol-di-testing'];

  const fixtures: Array<{ name: string; files: Record<string, string>; stackId: string; testCommand: string }> = [
    { name: 'python', files: { 'pyproject.toml': '[project]\nname = "demo"\nrequires-python = ">=3.11"\n' }, stackId: 'python', testCommand: 'python.test' },
    { name: 'node-typescript', files: { 'package.json': '{"name":"demo","engines":{"node":">=20"}}\n' }, stackId: 'node-typescript', testCommand: 'node.test' },
    { name: 'go', files: { 'go.mod': 'module example.com/demo\n\ngo 1.22\n' }, stackId: 'go', testCommand: 'go.test' },
    { name: 'rust', files: { 'Cargo.toml': '[package]\nname = "demo"\nversion = "0.1.0"\n' }, stackId: 'rust', testCommand: 'rust.test' },
    { name: 'java-maven', files: { 'pom.xml': '<project></project>\n' }, stackId: 'java', testCommand: 'java.maven-test' },
    { name: 'java-gradle', files: { 'build.gradle': 'plugins {}\n' }, stackId: 'java', testCommand: 'java.gradle-test' },
    { name: 'dotnet', files: { 'Demo.csproj': '<Project><TargetFramework>net8.0</TargetFramework></Project>\n' }, stackId: 'dotnet', testCommand: 'dotnet.test' },
  ];

  for (const fixture of fixtures) {
    it(`selects a CoFoFo catalog for ${fixture.name} instead of falling back`, () => {
      const root = temporary();
      for (const [relative, content] of Object.entries(fixture.files)) write(root, relative, content);
      const profile = detectStack(root);
      expect(profile.mode).toBe('cofofo');
      expect(profile.stack?.id).toBe(fixture.stackId);
      const selection = selectCatalog(profile);
      expect(selection).not.toBeNull();
      expect(selection!.commands.map((command) => command.id)).toContain(profile.stack!.buildCommandId);
      expect(selection!.commands.map((command) => command.id)).toContain(fixture.testCommand);
      expect(selection!.assets.map((asset) => asset.id)).toEqual(expect.arrayContaining(SHARED));
      for (const id of SWIFT_ONLY) {
        expect(selection!.assets.map((asset) => asset.id)).not.toContain(id);
      }
      const rules = createDefaultRules(profile, 1, '2026-08-28T00:00:00.000Z');
      expect(rules.rules.some((rule) => rule.kind === 'commandId' && rule.matcher.commandId === fixture.testCommand)).toBe(true);
      expect(new CofofoFoundationService(root).prepare().status).toBe('pending-review');
    });
  }

  it('ignores .opencode/package.json and still catalogs a Python repo', () => {
    const root = temporary();
    write(root, 'pyproject.toml', '[project]\nname = "demo"\nrequires-python = ">=3.11"\n');
    write(root, '.opencode/package.json', '{"name":"opencode-local"}\n');
    const profile = detectStack(root);
    expect(profile.mode).toBe('cofofo');
    expect(profile.stack?.id).toBe('python');
    expect(profile.repositoryKind).toBe('single-stack');
    const selection = selectCatalog(profile)!;
    expect(selection.commands.map((command) => command.id)).toContain('python.test');
    expect(selection.assets.some((asset) => asset.id === 'ecc-tdd-workflow')).toBe(true);
    expect(selection.assets.some((asset) => asset.id === 'ecc-swift-protocol-di-testing')).toBe(false);
    expect(new CofofoFoundationService(root).prepare().status).toBe('pending-review');
  });
});

function approveCurrentCanvas(root: string, state: RunState, pipeline: PipelineConfig): RunState {
  const index = state.currentStepIdx;
  const config = pipeline.steps[index]!;
  const artifacts = typeof config === 'string' ? [] : config.review?.artifacts ?? [];
  const bundle = buildReviewBundle({
    workspaceRoot: root,
    runId: state.runId,
    stepIdx: index,
    stepRevision: state.steps[index]!.revision,
    reviewRevision: 1,
    artifacts,
    context: state.context,
  });
  return applyArtifactReviewVerdict({ workspaceRoot: root, state, pipeline, bundle, verdict: { verdict: 'approve', reviewer: 'Demo Reviewer <reviewer@example.test>' } });
}

describe('CoFoFo Foundation lifecycle and mandatory rebase', () => {
  beforeEach(() => RunStateStore.resetBackend());

  it('refuses to mark scan-stack done when detection is closed', () => {
    const root = swiftFixture();
    write(root, 'web/package.json', '{"name":"web","engines":{"node":">=20"}}\n');
    const service = new CofofoFoundationService(root);
    expect(service.prepare().status).toBe('pending-review');
    const foundation = WorkspaceLoader.load(root).config.pipelines.find((pipeline) => pipeline.id === 'cofofo-foundation')!;
    const run = startRun({ runId: 'FOUNDATION-CLOSED', pipeline: foundation, context: {}, workspaceRoot: root });
    expect(() => markStepDone({ state: run, pipeline: foundation, workspaceRoot: root })).toThrow(/scan-stack is closed/);
  });

  it('does not demand a catalog Canvas approval for the update-rules route', () => {
    const root = swiftFixture();
    const service = new CofofoFoundationService(root);
    service.prepare({ route: 'update-rules' });
    const foundation = WorkspaceLoader.load(root).config.pipelines.find((pipeline) => pipeline.id === 'cofofo-foundation')!;
    const route = foundationPipelineForRoute(foundation, 'update-rules');
    let run = startRun({ runId: 'FOUNDATION-RULES', pipeline: route, context: {}, workspaceRoot: root });
    simulateDefineRules(root); // this route's first step is define-rules, not scan-stack
    run = markStepDone({ state: run, pipeline: route, workspaceRoot: root });
    run = approveCurrentCanvas(root, run, route);
    RunStateStore.save(root, run);

    expect(() => service.install('FOUNDATION-RULES')).not.toThrow();
  });

  it('requires content-bound approvals before install/activation and pins delivery runs', () => {
    const root = swiftFixture();
    const service = new CofofoFoundationService(root);
    const prepared = service.prepare();
    expect(prepared.status).toBe('pending-review');

    const workspace = WorkspaceLoader.load(root);
    const foundation = workspace.config.pipelines.find((pipeline) => pipeline.id === 'cofofo-foundation')!;
    let state = startRun({ runId: 'FOUNDATION-R1', pipeline: foundation, context: {}, workspaceRoot: root });
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root }); // scan
    simulateDefineRules(root);
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root }); // rules -> Canvas
    RunStateStore.save(root, state);
    expect(() => service.install('FOUNDATION-R1')).toThrow(/Canvas/);
    state = approveCurrentCanvas(root, state, foundation);
    simulateMapSystem(root);
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root }); // map
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root }); // selection -> Canvas
    state = approveCurrentCanvas(root, state, foundation);
    RunStateStore.save(root, state);

    service.install('FOUNDATION-R1');
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root }); // install
    RunStateStore.save(root, state);
    service.publish('FOUNDATION-R1');
    // Provider files are intentionally not review artifacts. A concurrent
    // tool write must not invalidate the PROVIDER-CONTEXT Canvas bundle.
    write(root, 'CLAUDE.md', '# Existing provider instructions\n\nwritten while the Canvas gate is open\n');
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root }); // publish -> Canvas
    state = approveCurrentCanvas(root, state, foundation);
    RunStateStore.save(root, state);
    expect(service.inspect().status).toBe('pending-review');
    service.activate('FOUNDATION-R1');
    expect(service.inspect().status).toBe('ready');
    expect(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')).toContain('written while the Canvas gate is open');
    expect(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')).toContain('aidlc:cofofo-context start');

    // Git clone / branch checkout changes mtime, not content. Hash-bound
    // Foundation readiness must remain valid in that case.
    const rulesPath = path.join(root, 'docs/project/foundation/PROJECT-RULES.json');
    const now = new Date();
    fs.utimesSync(rulesPath, now, new Date(now.getTime() + 60_000));
    expect(service.inspect().status).toBe('ready');

    const delivery = WorkspaceLoader.load(root).config.pipelines.find((pipeline) => pipeline.id === 'cofofo-delivery')!;
    const run = startRun({ runId: 'FEATURE-1', pipeline: delivery, context: { epic: 'FEATURE-1' }, workspaceRoot: root });
    expect(run.cofofoFoundation?.revision).toBe(1);
    // `requirement` requires INTENT.md — normally snapshotted by the Discover
    // handoff; this run was started directly,
    // so the test stands in for that provenance the same way a manually
    // authored epic would.
    write(root, 'docs/epics/FEATURE-1/artifacts/INTENT.md', '# Intent\n\nAdd a heat alert.\n');
    expect(canStartStep({ state: run, pipeline: delivery, workspaceRoot: root })).toEqual({ ok: true });

    service.prepare({ route: 'refresh-context' });
    const gate = canStartStep({ state: run, pipeline: delivery, workspaceRoot: root });
    expect(gate.ok).toBe(false);
    if (gate.ok) throw new Error('expected stale Foundation');
    expect(gate.missing.join('\n')).toMatch(/invalid CoFoFo foundation/);

    // A pending revision cannot be pinned. Once the new revision is reviewed
    // and activated, rebase resets every phase and preserves audit history.
    expect(() => rebaseRunToCurrentFoundation({ state: run, pipeline: delivery, workspaceRoot: root })).toThrow();

    const refreshedDefinition = WorkspaceLoader.load(root).config.pipelines
      .find((pipeline) => pipeline.id === 'cofofo-foundation')!;
    const refreshPipeline = foundationPipelineForRoute(refreshedDefinition, 'refresh-context');
    let refreshRun = startRun({ runId: 'FOUNDATION-R2', pipeline: refreshPipeline, context: {}, workspaceRoot: root });
    refreshRun = markStepDone({ state: refreshRun, pipeline: refreshPipeline, workspaceRoot: root }); // scan
    simulateMapSystem(root);
    refreshRun = markStepDone({ state: refreshRun, pipeline: refreshPipeline, workspaceRoot: root }); // map
    RunStateStore.save(root, refreshRun);
    service.publish('FOUNDATION-R2');
    refreshRun = markStepDone({ state: refreshRun, pipeline: refreshPipeline, workspaceRoot: root }); // publish -> Canvas
    refreshRun = approveCurrentCanvas(root, refreshRun, refreshPipeline);
    RunStateStore.save(root, refreshRun);
    service.activate('FOUNDATION-R2');

    const rebased = rebaseRunToCurrentFoundation({ state: run, pipeline: delivery, workspaceRoot: root });
    expect(rebased.cofofoFoundation?.revision).toBe(2);
    expect(rebased.foundationRebases).toHaveLength(1);
    expect(rebased.steps[0]?.status).toBe('awaiting_work');
    expect(rebased.steps.slice(1).every((step) => step.status === 'pending')).toBe(true);
  });

  it('publish writes BUNDLE-BINDING.json and CONTEXT-MANIFEST v2 with bindingHash (C0 — until C3)', () => {
    const root = swiftFixture();
    const service = new CofofoFoundationService(root);
    service.prepare();
    const foundation = WorkspaceLoader.load(root).config.pipelines.find((pipeline) => pipeline.id === 'cofofo-foundation')!;
    let state = startRun({ runId: 'FOUNDATION-BIND', pipeline: foundation, context: {}, workspaceRoot: root });
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    simulateDefineRules(root);
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    state = approveCurrentCanvas(root, state, foundation);
    simulateMapSystem(root);
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    state = approveCurrentCanvas(root, state, foundation);
    RunStateStore.save(root, state);
    service.install('FOUNDATION-BIND');
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    RunStateStore.save(root, state);
    const manifest = service.publish('FOUNDATION-BIND');
    const bindingPath = path.join(root, COFOFO_BUNDLE_BINDING_PATH);
    expect(fs.existsSync(bindingPath)).toBe(true);
    const parsed = ContextManifestV2Schema.parse(manifest);
    expect(parsed.bindingPath).toBe(COFOFO_BUNDLE_BINDING_PATH);
    expect(parsed.bindingHash).toBe(hashFile(bindingPath));
  });

  it('inspect is ready only when workspace agents match bundle binding (C0 — until C4 doctor)', () => {
    const root = swiftFixture();
    const service = new CofofoFoundationService(root);
    service.prepare();
    const foundation = WorkspaceLoader.load(root).config.pipelines.find((pipeline) => pipeline.id === 'cofofo-foundation')!;
    let state = startRun({ runId: 'FOUNDATION-DOCTOR', pipeline: foundation, context: {}, workspaceRoot: root });
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    simulateDefineRules(root);
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    state = approveCurrentCanvas(root, state, foundation);
    simulateMapSystem(root);
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    state = approveCurrentCanvas(root, state, foundation);
    RunStateStore.save(root, state);
    service.install('FOUNDATION-DOCTOR');
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    RunStateStore.save(root, state);
    service.publish('FOUNDATION-DOCTOR');
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    state = approveCurrentCanvas(root, state, foundation);
    RunStateStore.save(root, state);
    service.activate('FOUNDATION-DOCTOR');
    expect(service.inspect().status).toBe('ready');

    const workspacePath = path.join(root, '.aidlc/workspace.yaml');
    const tampered = fs.readFileSync(workspacePath, 'utf8').replace(
      'ecc-tdd-workflow',
      'ecc-not-installed-skill',
    );
    fs.writeFileSync(workspacePath, tampered, 'utf8');
    expect(service.inspect().status).not.toBe('ready');
  });
});

describe('CoFoFo ensureRecipesRegistered — Discover is CoFoFo-only regardless of stack detection', () => {
  it('registers the six cofofo-* recipes and both pipelines even for a project with no code at all', () => {
    const root = temporary();
    const service = new CofofoFoundationService(root);
    const prepared = service.prepare();
    expect(prepared.status).toBe('pending-review');
    expect(prepared.issues.join('\n')).toMatch(/No supported stack manifest/);

    service.ensureRecipesRegistered();
    const config = WorkspaceLoader.load(root).config;
    expect(config.pipelines.map((p) => p.id)).toEqual(expect.arrayContaining(['cofofo-foundation', 'cofofo-delivery']));
    const recipeIds = (config.recipes ?? []).map((r) => r.id);
    expect(recipeIds).toEqual(expect.arrayContaining([
      'cofofo-bootstrap', 'cofofo-refresh-context', 'cofofo-update-rules',
      'cofofo-repin-bundle', 'cofofo-feature', 'cofofo-bugfix',
    ]));
  });

  it('is idempotent and preserves an unrelated pipeline already in workspace.yaml', () => {
    const root = temporary();
    write(root, '.aidlc/workspace.yaml', 'version: "1.0"\nname: x\nenvironment: {}\npipelines:\n  - id: custom-pipeline\n    steps:\n      - agent: custom-agent\n');
    const service = new CofofoFoundationService(root);
    service.ensureRecipesRegistered();
    service.ensureRecipesRegistered();
    const config = WorkspaceLoader.load(root).config;
    expect(config.pipelines.filter((p) => p.id === 'cofofo-foundation')).toHaveLength(1);
    expect(config.pipelines.some((p) => p.id === 'custom-pipeline')).toBe(true);
  });

  it('does not require prepare() to have run first, and still seeds STACK-PROFILE.json for scan-stack to read', () => {
    const root = temporary();
    const service = new CofofoFoundationService(root);
    const stackJsonPath = path.join(root, 'docs/project/foundation/STACK-PROFILE.json');
    expect(fs.existsSync(stackJsonPath)).toBe(false);
    expect(() => service.ensureRecipesRegistered()).not.toThrow();
    expect(fs.existsSync(stackJsonPath)).toBe(true);
  });
});

describe('CoFoFo C4 — provider context + doctor', () => {
  it('renderProviderContext includes role, phase, registry, and command tables', () => {
    const root = swiftFixture();
    const profile = detectStack(root);
    const selection = selectCatalog(profile)!;
    const installed = installCatalog({ workspaceRoot: root, profile, foundationRevision: 1 });
    const binding = buildBundleBinding({ selection, installed, foundationRevision: 1 });
    const rendered = renderProviderContext({
      foundationRevision: 1,
      stackId: profile.stack!.id,
      catalogRevision: installed.catalogRevision,
      binding,
    });
    expect(rendered).toContain('## Role → ECC skills');
    expect(rendered).toContain('## Phase → ECC skills');
    expect(rendered).toContain('## Installed skill registry');
    expect(rendered).toContain('## Command allow-list');
    expect(rendered).toContain('cofofo-developer');
    expect(rendered).toContain('ecc-tdd-workflow');
    expect(rendered).toContain('swift.test');
  });

  it('diagnoseCofofoBinding flags tampered ecc skills with Vietnamese repair copy', () => {
    const root = swiftFixture();
    const service = new CofofoFoundationService(root);
    service.prepare();
    const foundation = WorkspaceLoader.load(root).config.pipelines.find((pipeline) => pipeline.id === 'cofofo-foundation')!;
    let state = startRun({ runId: 'DOCTOR-TAMPER', pipeline: foundation, context: {}, workspaceRoot: root });
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    simulateDefineRules(root);
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    state = approveCurrentCanvas(root, state, foundation);
    simulateMapSystem(root);
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    state = approveCurrentCanvas(root, state, foundation);
    RunStateStore.save(root, state);
    service.install('DOCTOR-TAMPER');
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    RunStateStore.save(root, state);
    service.publish('DOCTOR-TAMPER');
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    state = approveCurrentCanvas(root, state, foundation);
    RunStateStore.save(root, state);
    service.activate('DOCTOR-TAMPER');

    const workspacePath = path.join(root, '.aidlc/workspace.yaml');
    fs.writeFileSync(
      workspacePath,
      fs.readFileSync(workspacePath, 'utf8').replace('ecc-tdd-workflow', 'ecc-not-installed-skill'),
      'utf8',
    );

    const doctorIssues = diagnoseCofofoBinding(root);
    expect(doctorIssues.some((issue) => issue.kind === 'skill-not-installed')).toBe(true);
    expect(doctorIssues.some((issue) => issue.userMessageVi.includes('INSTALLED-ASSETS'))).toBe(true);

    const inspection = service.inspect();
    expect(inspection.status).not.toBe('ready');
    expect(inspection.doctorIssues?.length).toBeGreaterThan(0);
  });

  it('diagnoseCofofoBinding reports workspace-not-composed after install before publish', () => {
    const root = swiftFixture();
    const service = new CofofoFoundationService(root);
    service.prepare();
    const foundation = WorkspaceLoader.load(root).config.pipelines.find((pipeline) => pipeline.id === 'cofofo-foundation')!;
    let state = startRun({ runId: 'DOCTOR-COMPOSE', pipeline: foundation, context: {}, workspaceRoot: root });
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    simulateDefineRules(root);
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    state = approveCurrentCanvas(root, state, foundation);
    simulateMapSystem(root);
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root });
    state = approveCurrentCanvas(root, state, foundation);
    RunStateStore.save(root, state);
    service.install('DOCTOR-COMPOSE');

    const issues = diagnoseCofofoBinding(root);
    expect(issues.some((issue) => issue.kind === 'workspace-not-composed')).toBe(true);
    expect(issues.some((issue) => issue.userMessageVi.includes('publish-context'))).toBe(true);
  });
});
