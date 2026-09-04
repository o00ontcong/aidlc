import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildBundleBinding,
  bindingForSelection,
  composeWorkspaceFromBundle,
  detectStack,
  generatedCofofoWorkspace,
  installCatalog,
  normalizeStep,
  selectCatalog,
  COFOFO_BUNDLE_BINDING_PATH,
  type CofofoCatalogSelection,
} from '../src';

function temporary(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cofofo-binding-'));
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
  return root;
}

function installedSwift(root: string, revision = 1) {
  const profile = detectStack(root);
  return installCatalog({ workspaceRoot: root, profile, foundationRevision: revision });
}

describe('CoFoFo bundle binding (C0 — compose fails until C2)', () => {
  it('composeWorkspaceFromBundle merges ecc-tdd-workflow onto cofofo-developer', () => {
    const root = swiftFixture();
    const profile = detectStack(root);
    const selection = selectCatalog(profile)!;
    const installed = installedSwift(root);
    const binding = buildBundleBinding({ selection, installed, foundationRevision: 1 });
    const skeleton = generatedCofofoWorkspace({ version: '1.0', name: 'Demo' });
    const composed = composeWorkspaceFromBundle({ workspaceRoot: root, skeleton, binding, installed });
    const developer = composed.agents.find((agent) => agent.id === 'cofofo-developer');
    expect(developer?.skills).toContain('ecc-tdd-workflow');
  });

  it('composeWorkspaceFromBundle sets implement step skills from binding phases', () => {
    const root = swiftFixture();
    const profile = detectStack(root);
    const selection = selectCatalog(profile)!;
    const installed = installedSwift(root);
    const binding = buildBundleBinding({ selection, installed, foundationRevision: 1 });
    const skeleton = generatedCofofoWorkspace({ version: '1.0', name: 'Demo' });
    const composed = composeWorkspaceFromBundle({ workspaceRoot: root, skeleton, binding, installed });
    const delivery = composed.pipelines.find((pipeline) => pipeline.id === 'cofofo-feature')!;
    const implement = delivery.steps.find((step) => normalizeStep(step).name === 'implement')!;
    expect(normalizeStep(implement).skills).toEqual([
      'cofofo-implement',
      'ecc-tdd-workflow',
      'ecc-swift-protocol-di-testing',
    ]);
  });

  it('composed workspace does not leak hardcoded skills omitted from binding', () => {
    const root = swiftFixture();
    const profile = detectStack(root);
    const full = selectCatalog(profile)!;
    const minimalSelection: CofofoCatalogSelection = {
      ...full,
      assets: full.assets.filter((asset) => asset.id === 'ecc-tdd-workflow'),
    };
    const installed = installedSwift(root);
    const binding = buildBundleBinding({
      selection: minimalSelection,
      installed: {
        ...installed,
        assets: installed.assets.filter((asset) => asset.id === 'ecc-tdd-workflow'),
      },
      foundationRevision: 1,
    });
    const skeleton = generatedCofofoWorkspace({ version: '1.0', name: 'Demo' });
    const composed = composeWorkspaceFromBundle({
      workspaceRoot: root,
      skeleton,
      binding,
      installed: {
        ...installed,
        assets: installed.assets.filter((asset) => asset.id === 'ecc-tdd-workflow'),
      },
    });
    const developer = composed.agents.find((agent) => agent.id === 'cofofo-developer');
    expect(developer?.skills).not.toContain('ecc-swift-protocol-di-testing');
  });
});

describe('CoFoFo bundle binding (C1 — schema + catalog map)', () => {
  it('bindingForSelection only references assets present in the selection', () => {
    const root = swiftFixture();
    const profile = detectStack(root);
    const full = selectCatalog(profile)!;
    const minimal: CofofoCatalogSelection = {
      ...full,
      assets: full.assets.filter((asset) => asset.id === 'ecc-tdd-workflow'),
    };
    const binding = bindingForSelection(minimal);
    expect(binding.phases.implement).toEqual(['ecc-tdd-workflow']);
    expect(binding.phases.test ?? []).toEqual([]);
    expect(binding.roles.developer ?? []).toEqual(['ecc-tdd-workflow']);
    expect(binding.roles.developer ?? []).not.toContain('ecc-swift-protocol-di-testing');
  });

  it('buildBundleBinding produces registry entries aligned with INSTALLED-ASSETS', () => {
    const root = swiftFixture();
    const profile = detectStack(root);
    const selection = selectCatalog(profile)!;
    const installed = installedSwift(root);
    const binding = buildBundleBinding({ selection, installed, foundationRevision: 1 });
    expect(binding.stackId).toBe('ios-swift');
    expect(binding.catalogRevision).toBe(selection.revision);
    for (const entry of binding.skills) {
      const asset = installed.assets.find((item) => item.id === entry.id);
      expect(asset).toBeDefined();
      expect(entry.path).toBe(asset!.installedPath);
      expect(entry.sha256).toBe(asset!.sha256);
    }
    expect(binding.phases.implement).toContain('ecc-tdd-workflow');
    expect(binding.roles['fresh-reviewer']).toContain('ecc-security-review');
  });

  it('buildBundleBinding rejects ids missing from installed manifest', () => {
    const root = swiftFixture();
    const profile = detectStack(root);
    const selection = selectCatalog(profile)!;
    const installed = installedSwift(root);
    expect(() => buildBundleBinding({
      selection,
      installed: { ...installed, assets: installed.assets.slice(0, 2) },
      foundationRevision: 1,
    })).toThrow(/missing catalog id/);
  });

  it('bindingForSelection uses shared TDD skills for Python without Swift extras', () => {
    const root = temporary();
    write(root, 'pyproject.toml', '[project]\nname = "demo"\nrequires-python = ">=3.11"\n');
    const profile = detectStack(root);
    const selection = selectCatalog(profile)!;
    expect(selection.stackId).toBe('python');
    const binding = bindingForSelection(selection);
    expect(binding.roles.developer).toEqual(['ecc-tdd-workflow', 'ecc-tdd-guide']);
    expect(binding.phases.implement).toEqual(['ecc-tdd-workflow']);
    expect(binding.roles['fresh-reviewer']).toEqual(['ecc-security-review']);
    expect(JSON.stringify(binding)).not.toContain('ecc-swift');
  });
});
