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

  it('fails closed to generic SDLC for a multi-stack repository', () => {
    const root = swiftFixture();
    write(root, 'web/package.json', '{"name":"web","engines":{"node":">=20"}}\n');
    const profile = detectStack(root);
    expect(profile.mode).toBe('generic-sdlc');
    expect(profile.repositoryKind).toBe('multi-stack');
    expect(profile.fallback?.pipelineId).toBe('aidlc-workflow-full');
  });

  it('does not guess an unaudited Xcode command bundle', () => {
    const root = temporary();
    write(root, 'Demo.xcodeproj/project.pbxproj', '// !$*UTF8*$!\n');
    const service = new CofofoFoundationService(root);
    const result = service.prepare();
    expect(result.status).toBe('fallback');
    expect(result.profile?.fallback?.pipelineId).toBe('aidlc-workflow-full');
  });

  it('binds PROJECT-RULES.md to canonical JSON and blocks a forbidden import', () => {
    const root = swiftFixture();
    const profile = detectStack(root);
    const workspace = generatedCofofoWorkspace({ version: '1.0', name: 'Demo' });
    expect(workspace.pipelines.find((pipeline) => pipeline.id === 'cofofo-delivery')?.foundation?.mode).toBe('cofofo');
    const service = new CofofoFoundationService(root);
    service.prepare({ now: '2026-08-28T00:00:00.000Z' });
    const rules = JSON.parse(fs.readFileSync(path.join(root, 'docs/project/foundation/PROJECT-RULES.json'), 'utf8'));
    const markdown = renderProjectRules(rules);
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
    const red = delivery.steps.find((step) => (typeof step === 'string' ? step : step.name) === 'test-red') as { human_review?: boolean; review?: { artifacts: string[] } };
    const diagnose = delivery.steps.find((step) => (typeof step === 'string' ? step : step.name) === 'diagnose') as { requires?: string[]; produces_contains?: string[] };
    expect(requirement).toMatchObject({ human_review: true, review: { artifacts: ['docs/epics/{epic}/artifacts/REQUIREMENT.md'] } });
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

  it('keeps memory bounded, unreviewed, and free of credentials', () => {
    expect(validateMemoryHandoff('# Memory\n\nunreviewed\n')).toEqual([]);
    expect(validateMemoryHandoff('# Memory\n\ntoken=super-secret-value-123456\n')).toEqual(expect.arrayContaining([
      expect.stringMatching(/unreviewed/),
      expect.stringMatching(/secret/),
    ]));
    expect(validateMemoryHandoff(`unreviewed\n${'x'.repeat(70_000)}`)).toContainEqual(expect.stringMatching(/exceeds/));
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

  it('does not demand a catalog Canvas approval for the update-rules route', () => {
    const root = swiftFixture();
    const service = new CofofoFoundationService(root);
    service.prepare({ route: 'update-rules' });
    const foundation = WorkspaceLoader.load(root).config.pipelines.find((pipeline) => pipeline.id === 'cofofo-foundation')!;
    const route = foundationPipelineForRoute(foundation, 'update-rules');
    let run = startRun({ runId: 'FOUNDATION-RULES', pipeline: route, context: {}, workspaceRoot: root });
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
    state = markStepDone({ state, pipeline: foundation, workspaceRoot: root }); // rules -> Canvas
    RunStateStore.save(root, state);
    expect(() => service.install('FOUNDATION-R1')).toThrow(/Canvas/);
    state = approveCurrentCanvas(root, state, foundation);
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
});
