import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it, afterEach } from 'vitest';

import type { AccountRef, ProbeEnv, ProviderProbe, QuotaWindow } from '../src/providers/quota/types';
import { ProviderRegistry } from '../src/providers/quota/registry';
import { QuotaService } from '../src/providers/quota/QuotaService';
import { QuotaPolicyStore } from '../src/providers/quota/QuotaPolicyStore';
import { pctAvailable, windowTone, cardAvailPct } from '../src/providers/quota/aggregator';
import { formatResetsAt } from '../src/providers/quota/formatter';
import { QuotaTimeSeriesStore } from '../src/providers/quota/timeSeries';
import { presentQuotaSnapshot } from '../src/providers/quota/present';
import { claudeCodeAdapter } from '../src/providers/quota/adapters/claudeCodeAdapter';
import { openaiCodexAdapter } from '../src/providers/quota/adapters/openaiCodexAdapter';
import { xaiGrokAdapter } from '../src/providers/quota/adapters/xaiGrokAdapter';

const roots: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-quota-'));
  roots.push(dir);
  return dir;
}
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

function env(home: string, overrides: Partial<ProbeEnv> = {}): ProbeEnv {
  return { home, env: {}, allowNetworkProbes: false, ...overrides };
}

function window(over: Partial<QuotaWindow> = {}): QuotaWindow {
  return { id: 'w', label: 'w', kind: 'percent', used: 10, limit: 100, source: 'local-log', confidence: 'exact', ...over };
}

describe('aggregator', () => {
  it('computes pctAvailable with the frozen formula', () => {
    expect(pctAvailable(window({ used: 15, limit: 100 }))).toBe(85);
  });

  it('treats limit=0 as undefined rather than dividing by zero', () => {
    expect(pctAvailable(window({ used: 0, limit: 0 }))).toBeUndefined();
  });

  it('does not clamp used>limit — reports the (negative) overage rather than fabricating 0%', () => {
    expect(pctAvailable(window({ used: 120, limit: 100 }))).toBe(-20);
  });

  it('buckets tone by the frozen thresholds', () => {
    expect(windowTone(85)).toBe('acc');
    expect(windowTone(60)).toBe('acc');
    expect(windowTone(59)).toBe('warn');
    expect(windowTone(25)).toBe('warn');
    expect(windowTone(24)).toBe('err');
  });

  it('cardAvailPct is undefined (never fabricated) when not connected, disabled, or no accounts', () => {
    expect(cardAvailPct({ id: 'p', displayName: 'P', presentation: { initial: 'P', iconBg: '', iconFg: '' }, status: 'not-connected', enabled: true, detected: false, accounts: [] })).toBeUndefined();
    expect(cardAvailPct({ id: 'p', displayName: 'P', presentation: { initial: 'P', iconBg: '', iconFg: '' }, status: 'ready', enabled: false, detected: true, accounts: [{ account: { id: 'a', label: 'A' }, quotas: [window()] }] })).toBeUndefined();
  });

  it('cardAvailPct is min() across accounts', () => {
    const snapshot = {
      id: 'p', displayName: 'P', presentation: { initial: 'P', iconBg: '', iconFg: '' },
      status: 'ready' as const, enabled: true, detected: true,
      accounts: [
        { account: { id: 'a1', label: 'A1' }, quotas: [window({ used: 15, limit: 100 })] },
        { account: { id: 'a2', label: 'A2' }, quotas: [window({ used: 40, limit: 100 })] },
      ],
    };
    expect(cardAvailPct(snapshot)).toBe(60);
  });
});

describe('formatter', () => {
  const now = new Date('2026-08-12T00:00:00.000Z');

  it('formats a future reset as "in Xh Ym"', () => {
    const resetsAt = new Date(now.getTime() + 4 * 3600_000 + 40 * 60_000).toISOString();
    expect(formatResetsAt(resetsAt, now)).toBe('in 4h 40m');
  });

  it('treats a reset already in the past as "resetting soon", not a negative duration', () => {
    const resetsAt = new Date(now.getTime() - 60_000).toISOString();
    expect(formatResetsAt(resetsAt, now)).toBe('resetting soon');
  });

  it('treats clock skew (now after resetsAt due to a backwards jump) the same way', () => {
    const skewedNow = new Date(now.getTime() + 10_000_000);
    expect(formatResetsAt(now.toISOString(), skewedNow)).toBe('resetting soon');
  });

  it('renders — when there is no resetsAt at all', () => {
    expect(formatResetsAt(undefined, now)).toBe('—');
  });
});

describe('presentQuotaSnapshot', () => {
  function snapshotWith(status: 'ready' | 'error' | 'not-connected', lastProbedAt?: string) {
    return {
      generatedAt: '2026-08-12T00:00:00.000Z',
      providers: [{
        id: 'p', displayName: 'P', presentation: { initial: 'P', iconBg: '#000', iconFg: '#fff' },
        status, enabled: true, detected: status === 'ready',
        accounts: status === 'ready' ? [{ account: { id: 'a', label: 'Account 1' }, quotas: [window({ id: 'w', label: 'w', used: 10, limit: 100 })] }] : [],
        lastProbedAt,
      }],
    };
  }

  it('reports a ready provider as connected with a formatted reset label', () => {
    const now = new Date('2026-08-12T00:05:00.000Z');
    const presented = presentQuotaSnapshot(snapshotWith('ready', '2026-08-12T00:04:00.000Z'), now);
    expect(presented.cards[0]).toMatchObject({ id: 'p', connected: true, status: 'ready', accountLabel: 'Account 1' });
    expect(presented.connectedCount).toBe(1);
    expect(presented.notConnectedCount).toBe(0);
  });

  it('downgrades a ready provider to stale once its last probe is old enough', () => {
    const now = new Date('2026-08-12T01:00:00.000Z'); // 55 min after the probe
    const presented = presentQuotaSnapshot(snapshotWith('ready', '2026-08-12T00:05:00.000Z'), now);
    expect(presented.cards[0].status).toBe('stale');
  });

  it('never reports a provider as connected when it errored, even if it has stale account data', () => {
    const presented = presentQuotaSnapshot(snapshotWith('error'));
    expect(presented.cards[0]).toMatchObject({ connected: false, status: 'error' });
    expect(presented.notConnectedCount).toBe(1);
  });
});

describe('QuotaTimeSeriesStore', () => {
  it('computes an ETA from a declining series', () => {
    const store = new QuotaTimeSeriesStore();
    const t0 = '2026-08-12T00:00:00.000Z';
    const t1 = '2026-08-12T01:00:00.000Z';
    store.record({ generatedAt: t0, providers: [{ id: 'p', displayName: 'P', presentation: { initial: 'P', iconBg: '', iconFg: '' }, status: 'ready', enabled: true, detected: true, accounts: [{ account: { id: 'a', label: 'A' }, quotas: [{ ...window({ id: 'w', used: 0, limit: 100 }) }] }] }] });
    store.record({ generatedAt: t1, providers: [{ id: 'p', displayName: 'P', presentation: { initial: 'P', iconBg: '', iconFg: '' }, status: 'ready', enabled: true, detected: true, accounts: [{ account: { id: 'a', label: 'A' }, quotas: [{ ...window({ id: 'w', used: 20, limit: 100 }) }] }] }] });
    const eta = store.eta('p', 'w');
    expect(eta).toBeDefined();
    expect(eta!.burnPctPerHour).toBeCloseTo(20, 5);
    expect(eta!.etaMs).toBeCloseTo(4 * 3600_000, -3);
  });

  it('returns undefined with fewer than 2 points instead of guessing', () => {
    const store = new QuotaTimeSeriesStore();
    expect(store.eta('p', 'w')).toBeUndefined();
  });
});

describe('claudeCodeAdapter (verified: no local quota source exists)', () => {
  it('detects installation via config dir and reports the oauth account without quotas', async () => {
    const home = tempDir();
    fs.mkdirSync(path.join(home, '.claude'));
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { org: 'x' } }));

    const e = env(home);
    expect(await claudeCodeAdapter.detect(e)).toEqual({ installed: true });
    expect(await claudeCodeAdapter.accounts(e)).toEqual([{ id: 'oauth', label: 'Account 1' }]);
    expect(await claudeCodeAdapter.quotas(e, { id: 'oauth', label: 'Account 1' })).toEqual([]);
  });

  it('reports not installed when neither PATH nor config dir exist', async () => {
    const home = tempDir();
    const result = await claudeCodeAdapter.detect(env(home, { env: { PATH: '' } }));
    expect(result.installed).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});

describe('openaiCodexAdapter (verified against a real rollout log shape)', () => {
  function seedRolloutFixture(home: string): void {
    const dayDir = path.join(home, '.codex', 'sessions', '2026', '08', '10');
    fs.mkdirSync(dayDir, { recursive: true });
    fs.copyFileSync(
      path.join(__dirname, 'fixtures', 'quota', 'codex-rollout-sample.jsonl'),
      path.join(dayDir, 'rollout-2026-08-10T06-00-00-fixture.jsonl'),
    );
    fs.writeFileSync(path.join(home, '.codex', 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'redacted' } }));
  }

  it('parses the latest rate_limits entry, mapping windows by minutes and converting resets_at to ISO', async () => {
    const home = tempDir();
    seedRolloutFixture(home);
    const e = env(home);

    expect(await openaiCodexAdapter.detect(e)).toEqual({ installed: true });
    const accounts = await openaiCodexAdapter.accounts(e);
    expect(accounts).toEqual([{ id: 'oauth', label: 'Account 1' }]);

    const quotas = await openaiCodexAdapter.quotas(e, accounts[0]);
    expect(quotas).toHaveLength(2);
    const weekly = quotas.find((q) => q.id === 'weekly-7d')!;
    const session = quotas.find((q) => q.id === 'session-5h')!;
    expect(weekly).toMatchObject({ used: 64, limit: 100, source: 'local-log', confidence: 'exact' });
    expect(weekly.resetsAt).toBe(new Date(1786849673 * 1000).toISOString());
    expect(session).toMatchObject({ used: 12, limit: 100 });
  });

  it('returns [] when no rollout log exists (not installed / never run) rather than fabricating a number', async () => {
    const home = tempDir();
    fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
    const e = env(home);
    expect(await openaiCodexAdapter.quotas(e, { id: 'oauth', label: 'Account 1' })).toEqual([]);
  });
});

describe('xaiGrokAdapter (design requires a permanent not-connected state)', () => {
  it('always reports not installed with no accounts or quotas', async () => {
    const e = env(tempDir());
    expect((await xaiGrokAdapter.detect(e)).installed).toBe(false);
    expect(await xaiGrokAdapter.accounts(e)).toEqual([]);
    expect(await xaiGrokAdapter.quotas(e, { id: 'x', label: 'x' })).toEqual([]);
  });
});

describe('QuotaService', () => {
  function fakeProbe(id: string, behavior: Partial<ProviderProbe> = {}): ProviderProbe {
    return {
      id,
      displayName: id,
      presentation: { initial: id[0], iconBg: '', iconFg: '' },
      detect: async () => ({ installed: true }),
      accounts: async () => [{ id: 'a', label: 'Account 1' }],
      quotas: async () => [window({ id: 'w', used: 10, limit: 100 })],
      ...behavior,
    };
  }

  it('renders a "no providers" snapshot without throwing when the registry is empty', async () => {
    const root = tempDir();
    const service = new QuotaService(new ProviderRegistry(), new QuotaPolicyStore(root), () => env(root));
    expect((await service.refresh()).providers).toEqual([]);
    expect(service.list().providers).toEqual([]);
  });

  it('isolates a throwing/timing-out adapter — other providers still report', async () => {
    const root = tempDir();
    const registry = new ProviderRegistry();
    registry.register(fakeProbe('good'));
    registry.register(fakeProbe('bad', { detect: async () => { throw new Error('boom'); } }));
    const service = new QuotaService(registry, new QuotaPolicyStore(root), () => env(root));

    const snapshot = await service.refresh();
    const good = snapshot.providers.find((p) => p.id === 'good')!;
    const bad = snapshot.providers.find((p) => p.id === 'bad')!;
    expect(good.status).toBe('ready');
    expect(good.accounts[0].quotas[0].used).toBe(10);
    expect(bad.status).toBe('error');
    expect(bad.error).toContain('boom');
  });

  it('setEnabled persists to the policy store and is reflected in the cached snapshot', async () => {
    const root = tempDir();
    const registry = new ProviderRegistry();
    registry.register(fakeProbe('p'));
    const policy = new QuotaPolicyStore(root);
    const service = new QuotaService(registry, policy, () => env(root));

    await service.refresh();
    const updated = service.setEnabled('p', false);
    expect(updated.providers[0].enabled).toBe(false);
    expect(policy.load()).toEqual({ p: false });

    // A fresh service reading the same policy store sees the persisted value.
    const reloaded = new QuotaService(registry, policy, () => env(root));
    expect((await reloaded.refresh()).providers[0].enabled).toBe(false);
  });

  it('list() returns a loading placeholder before the first refresh(), never blocking on I/O', () => {
    const root = tempDir();
    const registry = new ProviderRegistry();
    registry.register(fakeProbe('p'));
    const service = new QuotaService(registry, new QuotaPolicyStore(root), () => env(root));
    expect(service.list().providers).toEqual([
      expect.objectContaining({ id: 'p', status: 'loading', accounts: [] }),
    ]);
  });
});
