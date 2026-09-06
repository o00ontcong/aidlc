import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import {
  CofofoFoundationService,
  WorkspaceLoader,
  createDefaultRules,
  detectStack,
  generatedCofofoWorkspace,
  installCatalog,
  installCofofoPhaseSkills,
  installCofofoProviderCommands,
  COFOFO_REQUIREMENT_REQUIRED_HEADINGS,
  COFOFO_PHASE_REQUIRED_HEADINGS,
  normalizeStep,
  previewCatalogInstall,
  resolveInside,
  rollbackCatalog,
  renderProjectRules,
  rulesSourceHash,
  validateProjectRules,
  validateRulesMarkdown,
  validateMemoryHandoff,
  validateStackProfile,
  COFOFO_BUNDLE_BINDING_PATH,
  diagnoseCofofoBinding,
  renderProviderContext,
  buildBundleBinding,
  selectCatalog,
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

  it('fails closed for a multi-stack repository without switching pipelines', () => {
    const root = swiftFixture();
    write(root, 'web/package.json', '{"name":"web","engines":{"node":">=20"}}\n');
    const profile = detectStack(root);
    expect(profile.mode).toBe('cofofo');
    expect(profile.repositoryKind).toBe('multi-stack');
    expect(profile.stack).toBeUndefined();
    expect(profile.closed?.reason).toMatch(/does not guess a bundle/);
    expect(selectCatalog(profile)).toBeNull();
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
  });

  it('binds PROJECT-RULES.md to canonical JSON and blocks a forbidden import', () => {
    const root = swiftFixture();
    const profile = detectStack(root);
    const workspace = generatedCofofoWorkspace({ version: '1.0', name: 'Demo' });
    expect(workspace.pipelines.find((pipeline) => pipeline.id === 'cofofo-feature')?.discover_context).toBeDefined();
    const rules = createDefaultRules(profile, 1, '2026-08-28T00:00:00.000Z');
    const markdown = renderProjectRules(rules);
    expect(markdown).toContain(rulesSourceHash(rules));
    expect(validateRulesMarkdown(rules, markdown)).toEqual([]);
    expect(validateProjectRules({ workspaceRoot: root, rules, profile }).some((issue) => issue.ruleId === 'LAYER-1')).toBe(false);

    write(root, 'src/Sources/Demo/Domain/City.swift', 'import SwiftUI\npublic struct City {}\n');
    expect(validateProjectRules({ workspaceRoot: root, rules, profile })).toContainEqual(expect.objectContaining({ ruleId: 'LAYER-1', severity: 'block' }));
  });

  it('generates exactly two public delivery pipelines with a Discover context gate', () => {
    const workspace = generatedCofofoWorkspace({ version: '1.0', name: 'Demo' });
    expect(workspace.pipelines.map((pipeline) => pipeline.id).sort()).toEqual(['cofofo-bugfix', 'cofofo-feature']);
    const feature = workspace.pipelines.find((item) => item.id === 'cofofo-feature')!;
    const bugfix = workspace.pipelines.find((item) => item.id === 'cofofo-bugfix')!;
    expect(feature.discover_context?.manifest).toBe('.aidlc/discover/published-context.json');
    expect(bugfix.discover_context?.manifest).toBe('.aidlc/discover/published-context.json');
    expect(feature.steps.map((s) => normalizeStep(s).name)).toEqual(['analyze', 'create-plan', 'implement', 'test']);
    expect(bugfix.steps.map((s) => normalizeStep(s).name)).toEqual(['diagnose', 'reproduce', 'implement', 'test']);
    const analyze = normalizeStep(feature.steps.find((step) => normalizeStep(step).name === 'analyze')!);
    expect(analyze.requires).toContain('{context_pack}');
    expect(analyze.produces).toEqual(['docs/epics/{epic}/artifacts/REQUIREMENT.md']);
    expect(analyze.produces_contains).toEqual([...COFOFO_REQUIREMENT_REQUIRED_HEADINGS]);
    expect(analyze.review).toEqual({
      mode: 'canvas',
      artifacts: ['docs/epics/{epic}/artifacts/REQUIREMENT.md'],
    });
    expect(normalizeStep(feature.steps[1]!).requires).toContain('docs/epics/{epic}/artifacts/REQUIREMENT.md');
    const po = workspace.agents.find((agent) => agent.id === 'cofofo-product-owner');
    expect(po?.capabilities).toEqual(['files', 'jira']);
    const diagnose = bugfix.steps.find((step) => normalizeStep(step).name === 'diagnose') as { requires?: string[]; produces_contains?: string[] };
    expect(diagnose.requires).toEqual(expect.arrayContaining(['{context_pack}', 'docs/epics/{epic}/artifacts/BUG-REPORT.md']));
    expect(diagnose.produces_contains).toContain('## Resume From');
  });

  it('installs the analyze skill with mandatory screen and API requirement headings', () => {
    const root = temporary();
    installCofofoPhaseSkills(root);
    const skill = fs.readFileSync(path.join(root, '.aidlc/cofofo/skills/analyze.md'), 'utf8');
    for (const heading of COFOFO_REQUIREMENT_REQUIRED_HEADINGS) {
      expect(skill).toContain(heading);
    }
    expect(skill).toContain('do not wait for Jira MCP');
    expect(skill).toContain('REQUIREMENT.md');
    expect(skill).toContain('USER-NOTE.md');
    expect(skill).toContain('outranks');
    expect(skill).toContain('## 9. Research / citations');
    expect(skill).toContain('## 10. Options & task decisions');
    expect(skill).toContain('leftover from a retired analyze split');
    expect(skill).not.toContain('Do not delete them');
    expect(skill).not.toContain('Do not write OPTIONS.md');
    const plan = fs.readFileSync(path.join(root, '.aidlc/cofofo/skills/create-plan.md'), 'utf8');
    expect(plan).toContain('Read REQUIREMENT.md only');
    expect(plan).toContain('## RED / GREEN Contract');
    expect(plan).not.toContain('do not delete them');
    expect(plan).not.toContain('OPTIONS.md');
  });

  it('installs every phase skill and slash command with the headings its produces_contains gate requires', () => {
    const root = temporary();
    const workspace = generatedCofofoWorkspace({ version: '1.0', name: 'Demo' });
    installCofofoPhaseSkills(root);
    installCofofoProviderCommands(root, workspace);
    for (const pipeline of workspace.pipelines.filter((item) => item.id.startsWith('cofofo-'))) {
      for (const raw of pipeline.steps) {
        const step = normalizeStep(raw);
        const phase = step.name as keyof typeof COFOFO_PHASE_REQUIRED_HEADINGS;
        expect(step.produces_contains).toEqual([...COFOFO_PHASE_REQUIRED_HEADINGS[phase]]);
        const skill = fs.readFileSync(path.join(root, `.aidlc/cofofo/skills/${phase}.md`), 'utf8');
        const command = fs.readFileSync(path.join(root, `.claude/commands/${pipeline.id}-${phase}.md`), 'utf8');
        for (const marker of step.produces_contains) {
          expect(skill).toContain(marker);
          expect(command).toContain(marker);
        }
      }
    }
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
  });
});

describe('CoFoFo ensureWorkflowRegistered — project-local default workflow', () => {
  it('registers only the two delivery pipelines even for a project with no code at all', () => {
    const root = temporary();
    const service = new CofofoFoundationService(root);
    service.ensureWorkflowRegistered();
    const config = WorkspaceLoader.load(root).config;
    expect(config.pipelines.map((p) => p.id).filter((id) => id.startsWith('cofofo-')).sort()).toEqual([
      'cofofo-bugfix', 'cofofo-feature',
    ]);
    expect((config.recipes ?? []).filter((r) => r.id.startsWith('cofofo-'))).toEqual([]);
  });

  it('is idempotent and preserves an unrelated pipeline already in workspace.yaml', () => {
    const root = temporary();
    write(root, '.aidlc/workspace.yaml', 'version: "1.0"\nname: x\nenvironment: {}\npipelines:\n  - id: custom-pipeline\n    steps:\n      - agent: custom-agent\n');
    const service = new CofofoFoundationService(root);
    service.ensureWorkflowRegistered();
    service.ensureWorkflowRegistered();
    const config = WorkspaceLoader.load(root).config;
    expect(config.pipelines.filter((p) => p.id === 'cofofo-feature')).toHaveLength(1);
    expect(config.pipelines.some((p) => p.id === 'custom-pipeline')).toBe(true);
  });

  it('does not require a stack to already be detected', () => {
    const root = temporary();
    const service = new CofofoFoundationService(root);
    expect(() => service.ensureWorkflowRegistered()).not.toThrow();
    const config = WorkspaceLoader.load(root).config;
    expect(config.pipelines.some((p) => p.id === 'cofofo-feature')).toBe(true);
  });

  it('inspect() reports missing for a project with no legacy Foundation snapshot', () => {
    const root = temporary();
    const service = new CofofoFoundationService(root);
    service.ensureWorkflowRegistered();
    expect(service.inspect().status).toBe('missing');
  });
});

describe('CoFoFo provider context rendering', () => {
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

  it('diagnoseCofofoBinding flags a rogue cofofo-* pipeline id', () => {
    const root = temporary();
    write(root, '.aidlc/workspace.yaml', [
      'version: "1.0"', 'name: x', 'environment: {}',
      'pipelines:', '  - id: cofofo-legacy-recipe', '    steps:', '      - agent: some-agent',
    ].join('\n'));
    const issues = diagnoseCofofoBinding(root);
    expect(issues.some((issue) => issue.kind === 'rogue-cofofo-pipeline')).toBe(true);
  });

  it('COFOFO_BUNDLE_BINDING_PATH now lives under the Discover runtime directory', () => {
    expect(COFOFO_BUNDLE_BINDING_PATH).toBe('.aidlc/discover/runtime/bundle-binding.json');
  });
});
