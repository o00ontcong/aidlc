import { describe, expect, it } from 'vitest';

import {
  architectureGraphFromJson,
  architectureOverviewMermaidFromJson,
  catalogFeaturesFromJson,
  catalogScreensFromJson,
  featureCatalogMermaidFromJson,
  screenCatalogAreaMermaidsFromJson,
  screenCatalogMermaidFromJson,
} from '../src/project/architectureGraphs';

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

  it('renders multi-area catalogs as subgraph groups with individual screen nodes', () => {
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
    // Every screen gets its own node — no count buckets
    expect(mermaid).toMatch(/n_screen_home/);
    expect(mermaid).toMatch(/n_screen_login/);
    expect(mermaid).toMatch(/n_screen_settings/);
    // Groups become subgraphs
    expect(mermaid).toContain('subgraph');
    expect(mermaid).toContain('"Auth"');
    expect(mermaid).toContain('"Main"');
    // Real transitions still present
    expect(mermaid).toContain('authenticated');
    // No lossy count nodes like "Auth (1)"
    expect(mermaid).not.toMatch(/Auth \(\d+\)/);
    expect(mermaid).not.toMatch(/Main \(\d+\)/);
  });

  it('regression: 3+ group values with majority ungrouped — all screens rendered individually', () => {
    // Repro from bug report: 25 screens, 9 grouped (3 distinct labels), 16 ungrouped
    const screens = [
      { id: 'trade-desk', name: 'Trade Desk' },
      { id: 'chart', name: 'Chart' },
      { id: 'strategy', name: 'Strategy' },
      { id: 'paper-trading', name: 'Paper Trading' },
      { id: 'journal', name: 'Journal' },
      { id: 'portfolio', name: 'Portfolio' },
      { id: 'watchlist', name: 'Watchlist' },
      { id: 'alerts', name: 'Alerts' },
      { id: 'screener', name: 'Screener' },
      { id: 'news', name: 'News' },
      { id: 'earnings', name: 'Earnings' },
      { id: 'orders', name: 'Orders' },
      { id: 'positions', name: 'Positions' },
      { id: 'account', name: 'Account' },
      { id: 'support', name: 'Support' },
      { id: 'onboarding', name: 'Onboarding' },
      { id: 'sign-in', name: 'Sign In', flow: 'auth' },
      { id: 'sign-up', name: 'Sign Up', flow: 'auth' },
      { id: 'forgot-password', name: 'Forgot Password', flow: 'auth' },
      { id: 'error-network', name: 'Network Error', tab: 'errors' },
      { id: 'error-session', name: 'Session Expired', tab: 'errors' },
      { id: 'error-unknown', name: 'Unknown Error', tab: 'errors' },
      { id: 'settings-general', name: 'General Settings', tab: 'settings' },
      { id: 'settings-notifications', name: 'Notifications', tab: 'settings' },
      { id: 'settings-security', name: 'Security', tab: 'settings' },
    ];
    const transitions = [
      { source: 'sign-in', target: 'trade-desk', trigger: 'submit sign-in form' },
      { source: 'trade-desk', target: 'settings-general', trigger: "land on '/settings'" },
    ];
    const mermaid = screenCatalogMermaidFromJson({ screens, transitions });

    // Every single screen must appear as its own node
    for (const screen of screens) {
      expect(mermaid).toMatch(new RegExp(`n_screen_${screen.id.replace(/-/g, '_')}`));
    }
    // No "Other (N)" lossy bucket
    expect(mermaid).not.toMatch(/Other \(\d+\)/);
    // Real transitions must be present
    expect(mermaid).toContain('submit sign-in form');
    // Grouped screens appear inside subgraphs
    expect(mermaid).toContain('subgraph');
  });

  it('regression: kind="tab" on a real screen does not erase it or its transitions', () => {
    const mermaid = screenCatalogMermaidFromJson({
      screens: [
        { id: 'settings', name: 'Settings' },
        { id: 'settings-account', name: 'Account', kind: 'tab' },
        { id: 'settings-privacy', name: 'Privacy', kind: 'tab' },
      ],
      transitions: [
        { source: 'settings', target: 'settings-account', trigger: 'tap Account tab' },
        { source: 'settings', target: 'settings-privacy', trigger: 'tap Privacy tab' },
      ],
      roots: ['settings'],
    });
    // Screens with kind:"tab" but no tab:/flow: id prefix must render as real nodes
    expect(mermaid).toMatch(/n_screen_settings_account/);
    expect(mermaid).toMatch(/n_screen_settings_privacy/);
    // Their transitions must survive
    expect(mermaid).toContain('tap Account tab');
    expect(mermaid).toContain('tap Privacy tab');
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
