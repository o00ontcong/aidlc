import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const LIB = path.join(__dirname, '..', 'templates', 'cohesive', 'validators', 'lib.mjs');

type Lib = {
  validateArchitectureGraph: (doc: unknown, opts?: { workspaceRoot?: string }) => string[];
  validateFeatureCatalogCompleteness: (doc: unknown, opts?: { workspaceRoot?: string }) => string[];
  validateScreenCatalogNavigation: (doc: unknown, opts?: { workspaceRoot?: string }) => string[];
  validateContextReviewGraphCoverage: (text: string) => string[];
  listNavigationSourceFiles: (root: string) => string[];
  listFeatureModuleDirs: (root: string) => string[];
  listFirstPartyPackages: (root: string) => string[];
};

let lib: Lib;

beforeAll(async () => {
  lib = await import(`${pathToFileURL(LIB).href}?t=${Date.now()}`);
});

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tmp(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-graphs-'));
  tempRoots.push(root);
  return root;
}

function write(root: string, rel: string, body = 'enum Route { home }\n') {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, 'utf8');
}

describe('establish-baseline graph completeness', () => {
  it('scans coordinators, Features folders, and first-party packages', () => {
    const root = tmp();
    write(root, 'src/App/Features/Login/LoginCoordinator.swift');
    write(root, 'src/App/Features/Profile/ProfileCoordinator.swift');
    write(root, 'src/App/Features/Challenge/ChallengeView.swift');
    write(root, 'src/App/Features/Shared/Theme.swift');
    write(root, 'src/CoreAuth/Package.swift', '// swift-tools-version: 5.9\n');
    write(root, 'src/CoreProfile/Package.swift', '// swift-tools-version: 5.9\n');

    expect(lib.listNavigationSourceFiles(root).sort()).toEqual([
      'src/App/Features/Login/LoginCoordinator.swift',
      'src/App/Features/Profile/ProfileCoordinator.swift',
    ]);
    expect(lib.listFeatureModuleDirs(root).sort()).toEqual(['Challenge', 'Login', 'Profile']);
    expect(lib.listFirstPartyPackages(root).sort()).toEqual(['CoreAuth', 'CoreProfile']);
  });

  it('rejects architecture that omits a first-party package', () => {
    const root = tmp();
    write(root, 'src/CoreAuth/Package.swift');
    write(root, 'src/CoreProfile/Package.swift');
    const problems = lib.validateArchitectureGraph({
      schemaVersion: 1,
      nodes: [
        { id: 'app', name: 'App', responsibility: 'UI' },
        { id: 'CoreAuth', name: 'CoreAuth', responsibility: 'Auth' },
      ],
      edges: [{ from: 'app', to: 'CoreAuth' }],
      evidence: 'src/CoreAuth/Package.swift',
    }, { workspaceRoot: root });
    expect(problems.join('\n')).toMatch(/CoreProfile/);
  });

  it('accepts architecture nodes (not only layers) when packages are covered', () => {
    const root = tmp();
    write(root, 'src/CoreAuth/Package.swift');
    write(root, 'src/CoreProfile/Package.swift');
    expect(lib.validateArchitectureGraph({
      schemaVersion: 1,
      nodes: [
        { id: 'CoreAuth', name: 'CoreAuth', responsibility: 'Auth' },
        { id: 'CoreProfile', name: 'CoreProfile', responsibility: 'Profile' },
      ],
      edges: [{ from: 'CoreAuth', to: 'CoreProfile' }],
      evidence: 'Package.swift',
      discovery: { packages: ['src/CoreAuth/Package.swift'], unknowns: [] },
    }, { workspaceRoot: root })).toEqual([]);
  });

  it('rejects a feature catalog that drops a Features folder and has no discovery', () => {
    const root = tmp();
    write(root, 'src/App/Features/Login/LoginView.swift');
    write(root, 'src/App/Features/Profile/ProfileView.swift');
    write(root, 'src/App/Features/Challenge/ChallengeView.swift');
    write(root, 'src/App/Features/Onboarding/OnboardingView.swift');
    const problems = lib.validateFeatureCatalogCompleteness({
      schemaVersion: 1,
      features: [
        { id: 'login', name: 'Login', module: 'CoreAuth', evidence: ['src/App/Features/Login/LoginView.swift'], confidence: 'high' },
        { id: 'profile', name: 'Profile', module: 'CoreProfile', evidence: ['src/App/Features/Profile/ProfileView.swift'], confidence: 'high' },
        { id: 'home', name: 'Home', module: 'App', evidence: ['src/App/Home.swift'], confidence: 'high' },
        { id: 'settings', name: 'Settings', module: 'App', evidence: ['src/App/Settings.swift'], confidence: 'high' },
      ],
    }, { workspaceRoot: root });
    expect(problems.join('\n')).toMatch(/Onboarding|Challenge|discovery/i);
  });

  it('rejects screens that omit a coordinator and collapse a challenge overlay', () => {
    const root = tmp();
    write(root, 'src/App/LoginCoordinator.swift');
    write(root, 'src/App/ProfileCoordinator.swift');
    write(root, 'src/App/ChallengeFullScreenOverlay.swift');
    const problems = lib.validateScreenCatalogNavigation({
      schemaVersion: 1,
      screens: [
        { id: 'login', name: 'Login', evidence: ['LoginView.swift'], confidence: 'high' },
        { id: 'home', name: 'Home', evidence: ['HomeView.swift'], confidence: 'high' },
        { id: 'overlay:challenge', name: 'Challenge', kind: 'overlay', evidence: ['Challenge.swift'], confidence: 'high' },
      ],
      transitions: [
        { source: 'login', target: 'home', evidence: ['LoginCoordinator.swift'], confidence: 'high' },
      ],
      roots: ['login'],
      discovery: {
        method: 'partial',
        routeSources: ['src/App/LoginCoordinator.swift'],
        entryPoints: [{ target: 'overlay:challenge', kind: 'notification' }],
        passes: ['inventory'],
        unknowns: [],
      },
    }, { workspaceRoot: root });
    expect(problems.join('\n')).toMatch(/ProfileCoordinator/);
    expect(problems.join('\n')).toMatch(/Overlay overlay:challenge|Challenge overlay/i);
  });

  it('passes when coordinators, overlay layers, and review coverage are present', () => {
    const root = tmp();
    write(root, 'src/App/LoginCoordinator.swift');
    write(root, 'src/App/ProfileCoordinator.swift');
    write(root, 'src/App/ChallengeFullScreenOverlay.swift');
    expect(lib.validateScreenCatalogNavigation({
      schemaVersion: 1,
      screens: [
        { id: 'login', name: 'Login', evidence: ['LoginView.swift'], confidence: 'high' },
        { id: 'home', name: 'Home', evidence: ['HomeView.swift'], confidence: 'high' },
        { id: 'overlay:challenge', name: 'Challenge overlay', kind: 'overlay', evidence: ['Challenge.swift'], confidence: 'high' },
        { id: 'challenge-methods', name: 'Challenge Layer 1', parent: 'overlay:challenge', evidence: ['Picker.swift'], confidence: 'high' },
        { id: 'challenge-totp', name: 'Challenge TOTP', parent: 'overlay:challenge', evidence: ['Totp.swift'], confidence: 'high' },
      ],
      transitions: [
        { source: 'login', target: 'home', evidence: ['LoginCoordinator.swift'], confidence: 'high' },
        { source: 'overlay:challenge', target: 'challenge-methods', evidence: ['Challenge.swift'], trigger: 'present', confidence: 'high' },
        { source: 'challenge-methods', target: 'challenge-totp', evidence: ['Picker.swift'], trigger: 'totp', confidence: 'high' },
      ],
      roots: ['login'],
      discovery: {
        method: 'coordinators + overlay states',
        routeSources: [
          'src/App/LoginCoordinator.swift',
          'src/App/ProfileCoordinator.swift',
        ],
        entryPoints: [{ target: 'overlay:challenge', kind: 'notification' }],
        passes: ['inventory', 'outbound', 'entry', 'coverage'],
        unknowns: [],
      },
    }, { workspaceRoot: root })).toEqual([]);

    expect(lib.validateContextReviewGraphCoverage(`
## Summary
App

## Graph coverage

### Architecture
2 packages scanned.

### Feature catalog
4 folders catalogued.

### Screen catalog
2 coordinators, challenge Layer 1/2 expanded.

**Verdict:** GO
`)).toEqual([]);
  });

  it('rejects CONTEXT-REVIEW without Graph coverage', () => {
    expect(lib.validateContextReviewGraphCoverage('## Summary\nHi\n\n**Verdict:** GO\n').join('\n'))
      .toMatch(/Graph coverage/);
  });
});
