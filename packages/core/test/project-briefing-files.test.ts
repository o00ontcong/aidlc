import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  PROJECT_BRIEFING_PATHS,
  architectureGraphFromJson,
  architectureOverviewMermaidFromJson,
  catalogFeaturesFromJson,
  catalogScreensFromJson,
  ensureProjectBriefingFiles,
  featureCatalogMermaidFromJson,
  readProjectContextBriefing,
  screenCatalogAreaMermaidsFromJson,
  screenCatalogMermaidFromJson,
} from '../src/project/projectBriefingFiles';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tmp(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-project-briefing-'));
  roots.push(root);
  return root;
}

describe('architectureGraphFromJson', () => {
  it('maps nodes + from/to like OXUPass architecture JSON', () => {
    const graph = architectureGraphFromJson({
      nodes: [
        { id: 'CoreAuth', kind: 'spm-package' },
        { id: 'OtenPass', kind: 'app-target' },
      ],
      edges: [{ from: 'OtenPass', to: 'CoreAuth', kind: 'depends-on' }],
    });
    expect(graph.nodes).toEqual([
      { id: 'CoreAuth', label: 'CoreAuth', kind: 'spm-package' },
      { id: 'OtenPass', label: 'OtenPass', kind: 'app-target' },
    ]);
    expect(graph.edges).toEqual([{ source: 'OtenPass', target: 'CoreAuth' }]);
  });
});

describe('catalogFeaturesFromJson', () => {
  it('keeps module grouping fields', () => {
    expect(catalogFeaturesFromJson({
      features: [{ id: 'login', name: 'Login', module: 'CoreAuth' }],
    })).toEqual([{ id: 'login', name: 'Login', module: 'CoreAuth' }]);
  });
});

describe('architectureOverviewMermaidFromJson', () => {
  it('maps from/to edges when nodes have id only', () => {
    const mermaid = architectureOverviewMermaidFromJson({
      nodes: [{ id: 'CoreAuth' }, { id: 'OtenPass' }],
      edges: [{ from: 'OtenPass', to: 'CoreAuth' }],
    });
    expect(mermaid).toContain('CoreAuth');
    expect(mermaid).toMatch(/n_OtenPass --> n_CoreAuth/);
  });

  it('accepts layers that only have name, not id', () => {
    const mermaid = architectureOverviewMermaidFromJson({
      layers: [{ name: 'iOS app' }, { name: 'API' }],
      edges: [{ from: 'iOS app', to: 'API' }],
    });
    expect(mermaid).toContain('iOS app');
    expect(mermaid).toContain('API');
    expect(mermaid).toMatch(/n_iOS_app --> n_API/);
  });
});

describe('featureCatalogMermaidFromJson', () => {
  it('draws app to each catalog feature when there is no nest signal', () => {
    const mermaid = featureCatalogMermaidFromJson({
      features: [{ id: 'auth', name: 'Auth' }, { id: 'vault', name: 'Vault' }],
    });
    expect(mermaid).toContain('app["APP"]');
    expect(mermaid).toContain('Auth');
    expect(mermaid).toContain('Vault');
    expect(mermaid).toMatch(/app --> n_feature_auth/);
    expect(mermaid).toMatch(/app --> n_feature_vault/);
  });

  it('groups by module when that is the catalog nest field', () => {
    const mermaid = featureCatalogMermaidFromJson({
      features: [
        { id: 'login', name: 'Login', module: 'CoreAuth' },
        { id: 'mfa', name: 'MFA Verification', module: 'CoreAuth' },
        { id: 'profile', name: 'Profile', module: 'CoreProfile' },
      ],
    });
    expect(mermaid).toMatch(/n_area_CoreAuth --> n_feature_login/);
    expect(mermaid).toMatch(/n_area_CoreAuth --> n_feature_mfa/);
    expect(mermaid).toMatch(/n_area_CoreProfile --> n_feature_profile/);
    expect(mermaid).not.toMatch(/app --> n_feature_login/);
  });

  it('nests parent → child instead of a one-level list', () => {
    const mermaid = featureCatalogMermaidFromJson({
      features: [
        { id: 'passwords', name: 'Passwords' },
        { id: 'vault', name: 'Vault', parent: 'passwords' },
        { id: 'vault-search', name: 'Vault search', parent: 'vault' },
      ],
    });
    expect(mermaid).toMatch(/app --> n_feature_passwords/);
    expect(mermaid).toMatch(/n_feature_passwords --> n_feature_vault/);
    expect(mermaid).toMatch(/n_feature_vault --> n_feature_vault_search/);
    expect(mermaid).not.toMatch(/app --> n_feature_vault[^\w]/);
  });

  it('groups by area and evidence folders, and keeps every feature past 24', () => {
    const features = [
      { id: 'signin', name: 'Sign in', area: 'iOS' },
      { id: 'vault', name: 'Vault', area: 'iOS' },
      { id: 'billing-api', name: 'Billing API', evidence: ['apps/api/billing/charge.ts'] },
      { id: 'billing-webhooks', name: 'Billing webhooks', evidence: ['apps/api/billing/hook.ts'] },
    ];
    for (let i = 0; i < 30; i += 1) {
      features.push({ id: `leaf-${i}`, name: `Leaf ${i}`, parent: 'vault' });
    }
    const mermaid = featureCatalogMermaidFromJson({ features });
    expect(mermaid).toContain('iOS');
    expect(mermaid).toMatch(/n_area_iOS --> n_feature_signin/);
    expect(mermaid).toMatch(/n_dir_billing --> n_feature_billing_api/);
    expect(mermaid).toContain('Leaf 29');
    expect(mermaid).toMatch(/n_feature_vault --> n_feature_leaf_29/);
  });
});

describe('screenCatalogMermaidFromJson', () => {
  it('renders navigation transitions with trigger labels, not tab grouping', () => {
    const mermaid = screenCatalogMermaidFromJson({
      screens: [
        { id: 'login', name: 'Login' },
        { id: 'home', name: 'Home' },
        { id: 'unable-to-sign-in', name: 'Unable to sign in', parent: 'login', kind: 'sheet' },
      ],
      transitions: [
        { source: 'login', target: 'home', trigger: 'Sign in' },
      ],
      roots: ['login'],
    });
    expect(mermaid).toContain('ui["UI"]');
    expect(mermaid).toMatch(/n_screen_login -->.*n_screen_home/);
    expect(mermaid).toContain('Sign in');
    expect(mermaid).toMatch(/n_screen_login -->.*n_screen_unable_to_sign_in/);
    expect(mermaid).not.toMatch(/n_area_/);
  });

  it('renders branching flows with reconverging targets and intermediate steps', () => {
    const mermaid = screenCatalogMermaidFromJson({
      screens: [
        { id: 'profile', name: 'Profile' },
        { id: 'change-password', name: 'Change password' },
        { id: 'verify-password', name: 'Verify password' },
        { id: 'forgot-password', name: 'Forgot password' },
      ],
      transitions: [
        { source: 'profile', target: 'change-password', trigger: 'Change password' },
        { source: 'change-password', target: 'verify-password', trigger: 'Continue' },
        { source: 'forgot-password', target: 'change-password', trigger: 'Reset verified' },
      ],
    });
    expect(mermaid).toMatch(/n_screen_profile -->.*n_screen_change_password/);
    expect(mermaid).toMatch(/n_screen_change_password -->.*n_screen_verify_password/);
    expect(mermaid).toMatch(/n_screen_forgot_password -->.*n_screen_change_password/);
    expect(mermaid).toContain('Change password');
    expect(mermaid).toContain('Verify password');
  });

  it('summarizes multi-area catalogs as a hub map', () => {
    const mermaid = screenCatalogMermaidFromJson({
      screens: [
        { id: 'home', name: 'Home', tab: 'Main' },
        { id: 'login', name: 'Login', tab: 'Auth' },
        { id: 'settings', name: 'Settings', tab: 'Main' },
      ],
      transitions: [
        { source: 'home', target: 'settings', trigger: 'Settings icon' },
        { source: 'login', target: 'home', condition: 'authenticated' },
      ],
      discovery: {
        entryPoints: [{ target: 'login', kind: 'coldStart' }],
      },
    });
    expect(mermaid).toContain('flowchart LR');
    expect(mermaid).toContain('Auth (1)');
    expect(mermaid).toContain('Main (2)');
    expect(mermaid).toContain('authenticated');
    expect(mermaid).not.toContain('subgraph');
    expect(mermaid).not.toMatch(/n_screen_settings/);
  });

  it('renders one readable slice per tab/flow', () => {
    const areas = screenCatalogAreaMermaidsFromJson({
      screens: [
        { id: 'profile', name: 'Profile', tab: 'Profile' },
        { id: 'verify-password', name: 'Verify password', tab: 'Profile' },
        { id: 'change-password', name: 'Change password', tab: 'Profile' },
        { id: 'forgot-password', name: 'Forgot password', flow: 'Auth' },
        { id: 'tab:profile', name: 'Profile tab', kind: 'tab', tab: 'Profile' },
      ],
      transitions: [
        { source: 'profile', target: 'verify-password', trigger: 'Change password' },
        { source: 'verify-password', target: 'change-password', trigger: 'Continue' },
        { source: 'verify-password', target: 'forgot-password', trigger: 'Forgot password' },
      ],
    });
    const profile = areas.find((area) => area.id === 'Profile');
    expect(profile?.count).toBe(3);
    expect(profile?.mermaid).toContain('flowchart LR');
    expect(profile?.mermaid).toMatch(/n_screen_profile -->.*n_screen_verify_password/);
    expect(profile?.mermaid).toMatch(/n_screen_verify_password -->.*n_screen_change_password/);
    expect(profile?.mermaid).toContain('Forgot password');
    expect(profile?.mermaid).not.toContain('subgraph');
    expect(profile?.mermaid).not.toContain('Profile tab');
  });

  it('shows every screen in an area even when most edges are parent/sheet', () => {
    const areas = screenCatalogAreaMermaidsFromJson({
      screens: [
        { id: 'home', name: 'Home dashboard', tab: 'Home' },
        { id: 'home-notifications', name: 'Notifications list', tab: 'Home', parent: 'home' },
        { id: 'home-activity-log', name: 'Activity log', tab: 'Home', parent: 'home' },
        { id: 'login', name: 'Login', tab: 'Auth' },
      ],
      transitions: [
        { source: 'login', target: 'home', trigger: 'Sign in (guest/home)' },
        { source: 'home', target: 'home-notifications', trigger: 'present', kind: 'present' },
      ],
    });
    const home = areas.find((area) => area.id === 'Home');
    expect(home?.count).toBe(3);
    expect(home?.mermaid).toContain('Home dashboard');
    expect(home?.mermaid).toContain('Notifications list');
    expect(home?.mermaid).toContain('Activity log');
    expect(home?.mermaid).toMatch(/n_screen_home -->.*n_screen_home_notifications/);
  });

  it('falls back to tab nesting when transitions are absent', () => {
    const mermaid = screenCatalogMermaidFromJson({
      screens: [
        { id: 'login', name: 'Login', tab: 'Auth' },
        { id: 'unable-to-sign-in', name: 'Unable to sign in', parent: 'login', kind: 'sheet' },
        { id: 'home', name: 'Home', tab: 'Main' },
      ],
    });
    expect(mermaid).toContain('ui["UI"]');
    expect(mermaid).toMatch(/n_area_Auth --> n_screen_login/);
    expect(mermaid).toMatch(/n_screen_login --> n_screen_unable_to_sign_in/);
    expect(mermaid).toMatch(/n_area_Main --> n_screen_home/);
    expect(mermaid).not.toMatch(/app\["APP"\]/);
  });
});

describe('catalogScreensFromJson', () => {
  it('maps tab/flow to area and ignores module', () => {
    expect(catalogScreensFromJson({
      screens: [{ id: 'login', name: 'Login', tab: 'Auth', module: 'CoreAuth' }],
    })).toEqual([{ id: 'login', name: 'Login', area: 'Auth' }]);
  });
});

describe('ensureProjectBriefingFiles', () => {
  it('creates canonical .mmd next to JSON and never reads epic artifacts', () => {
    const root = tmp();
    const viz = path.join(root, 'docs', 'project', 'context', 'visualization');
    const epicArtifacts = path.join(root, 'docs', 'epics', 'PROJECT-CONTEXT-001', 'artifacts');
    fs.mkdirSync(viz, { recursive: true });
    fs.mkdirSync(epicArtifacts, { recursive: true });
    fs.writeFileSync(path.join(viz, 'PROJECT-ARCHITECTURE.json'), JSON.stringify({
      schemaVersion: 1,
      layers: [{ name: 'mobile' }, { name: 'backend' }],
      edges: [{ source: 'mobile', target: 'backend' }],
    }));
    fs.writeFileSync(path.join(viz, 'FEATURE-CATALOG.json'), JSON.stringify({
      schemaVersion: 1,
      features: [{ id: 'signin', name: 'Sign in' }],
    }));
    fs.writeFileSync(path.join(viz, 'SCREEN-CATALOG.json'), JSON.stringify({
      schemaVersion: 1,
      screens: [
        { id: 'login', name: 'Login', tab: 'Auth' },
        { id: 'home', name: 'Home', tab: 'Main' },
      ],
    }));
    fs.writeFileSync(path.join(epicArtifacts, 'FEATURE-FLOW.mmd'), 'flowchart LR\n  wrong --> path\n');

    const created = ensureProjectBriefingFiles(root);
    expect(created).toEqual(expect.arrayContaining([
      PROJECT_BRIEFING_PATHS.architectureMmd,
      PROJECT_BRIEFING_PATHS.catalogMmd,
      PROJECT_BRIEFING_PATHS.screensMmd,
      PROJECT_BRIEFING_PATHS.review,
    ]));

    const briefing = readProjectContextBriefing(root);
    expect(briefing.flowMermaid).toContain('mobile');
    expect(briefing.flowMermaid).not.toContain('wrong');
    expect(briefing.impactMermaid).toContain('Sign in');
    expect(briefing.screensMermaid).toContain('ui["UI"]');
    expect(briefing.screensMermaid).toMatch(/n_area_Auth --> n_screen_login/);
    expect(fs.existsSync(path.join(root, PROJECT_BRIEFING_PATHS.architectureMmd))).toBe(true);
    expect(fs.existsSync(path.join(root, PROJECT_BRIEFING_PATHS.catalogMmd))).toBe(true);
    expect(fs.existsSync(path.join(root, PROJECT_BRIEFING_PATHS.screensMmd))).toBe(true);
  });

  it('creates mermaid stubs at the canonical path when JSON is missing', () => {
    const root = tmp();
    const created = ensureProjectBriefingFiles(root);
    expect(created).toEqual(expect.arrayContaining([
      PROJECT_BRIEFING_PATHS.architectureMmd,
      PROJECT_BRIEFING_PATHS.catalogMmd,
      PROJECT_BRIEFING_PATHS.screensMmd,
    ]));
    expect(fs.readFileSync(path.join(root, PROJECT_BRIEFING_PATHS.architectureMmd), 'utf8'))
      .toContain('not generated yet');
    expect(fs.readFileSync(path.join(root, PROJECT_BRIEFING_PATHS.screensMmd), 'utf8'))
      .toContain('Screen catalog not generated yet');
  });

  it('rewrites a one-level catalog mermaid when JSON can form a tree', () => {
    const root = tmp();
    const viz = path.join(root, 'docs', 'project', 'context', 'visualization');
    fs.mkdirSync(viz, { recursive: true });
    fs.writeFileSync(
      path.join(root, PROJECT_BRIEFING_PATHS.catalogMmd),
      'flowchart TD\n  app["APP"]\n  app --> n_feature_vault["Vault"]\n',
    );
    fs.writeFileSync(path.join(viz, 'FEATURE-CATALOG.json'), JSON.stringify({
      schemaVersion: 1,
      features: [
        { id: 'passwords', name: 'Passwords' },
        { id: 'vault', name: 'Vault', parent: 'passwords' },
      ],
    }));
    ensureProjectBriefingFiles(root);
    const mermaid = fs.readFileSync(path.join(root, PROJECT_BRIEFING_PATHS.catalogMmd), 'utf8');
    expect(mermaid).toMatch(/n_feature_passwords --> n_feature_vault/);
  });

  it('replaces a placeholder .mmd once JSON exists, but does not overwrite a real graph', () => {
    const root = tmp();
    const viz = path.join(root, 'docs', 'project', 'context', 'visualization');
    fs.mkdirSync(viz, { recursive: true });
    fs.writeFileSync(
      path.join(root, PROJECT_BRIEFING_PATHS.architectureMmd),
      'flowchart TD\n  pending["Project architecture not generated yet"]\n',
    );
    fs.writeFileSync(path.join(viz, 'PROJECT-ARCHITECTURE.json'), JSON.stringify({
      layers: [{ name: 'web' }, { name: 'core' }],
      edges: [{ source: 'web', target: 'core' }],
    }));
    ensureProjectBriefingFiles(root);
    expect(fs.readFileSync(path.join(root, PROJECT_BRIEFING_PATHS.architectureMmd), 'utf8'))
      .toContain('web');

    const real = 'flowchart TD\n  kept["Agent wrote this"]\n';
    fs.writeFileSync(path.join(root, PROJECT_BRIEFING_PATHS.architectureMmd), real);
    ensureProjectBriefingFiles(root);
    expect(fs.readFileSync(path.join(root, PROJECT_BRIEFING_PATHS.architectureMmd), 'utf8')).toBe(real);
  });
});
