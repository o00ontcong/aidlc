/**
 * Orchestrates the provider registry + policy + time-series recording into
 * the snapshot the extension/CLI hand to the UI.
 *
 * `list()` is synchronous and never touches disk/process — it returns
 * whatever `refresh()` last produced (or a loading placeholder), so the
 * sidebar can render instantly from cache while a background `refresh()`
 * probes for real (§2.5 "không bao giờ để sidebar chờ I/O"). Persisting the
 * cache across VS Code restarts is the extension's job (globalState) — call
 * `seed()` with the last persisted snapshot on startup.
 */

import { nowIso } from '../../contracts';
import type { ProviderRegistry } from './registry';
import type { QuotaPolicyStore } from './QuotaPolicyStore';
import type { AccountQuota, ProbeEnv, ProviderProbe, ProviderSnapshot, QuotaSnapshot } from './types';
import { withTimeout, ProbeTimeoutError } from './util/withTimeout';
import type { QuotaTimeSeriesStore } from './timeSeries';

const PROBE_TIMEOUT_MS = 3000;

function errorMessage(err: unknown): string {
  if (err instanceof ProbeTimeoutError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

export class QuotaService {
  private lastSnapshot: QuotaSnapshot | undefined;

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly policy: QuotaPolicyStore,
    private readonly envFactory: () => ProbeEnv,
    private readonly timeSeries?: QuotaTimeSeriesStore,
  ) {}

  /** Prime the in-memory cache from a persisted snapshot (extension startup). */
  seed(snapshot: QuotaSnapshot): void {
    this.lastSnapshot = snapshot;
  }

  /** Non-blocking read of the last known snapshot; never probes. */
  list(): QuotaSnapshot {
    if (this.lastSnapshot) return this.lastSnapshot;
    const probes = this.registry.list();
    const policy = this.policy.load();
    return {
      generatedAt: nowIso(),
      providers: probes.map((probe) => this.loadingSnapshot(probe, policy)),
    };
  }

  /** Force a fresh probe of every registered provider, in parallel. */
  async refresh(): Promise<QuotaSnapshot> {
    const env = this.envFactory();
    const policy = this.policy.load();
    const providers = await Promise.all(
      this.registry.list().map((probe) => this.probeOne(probe, env, policy)),
    );
    const snapshot: QuotaSnapshot = { providers, generatedAt: nowIso() };
    this.lastSnapshot = snapshot;
    this.timeSeries?.record(snapshot);
    return snapshot;
  }

  setEnabled(providerId: string, enabled: boolean): QuotaSnapshot {
    const current = this.policy.load();
    this.policy.save({ ...current, [providerId]: enabled });
    if (this.lastSnapshot) {
      this.lastSnapshot = {
        ...this.lastSnapshot,
        providers: this.lastSnapshot.providers.map((p) => (p.id === providerId ? { ...p, enabled } : p)),
      };
    }
    return this.list();
  }

  private loadingSnapshot(probe: ProviderProbe, policy: Record<string, boolean>): ProviderSnapshot {
    return {
      id: probe.id,
      displayName: probe.displayName,
      presentation: probe.presentation,
      status: 'loading',
      enabled: policy[probe.id] ?? true,
      detected: false,
      accounts: [],
    };
  }

  private async probeOne(
    probe: ProviderProbe,
    env: ProbeEnv,
    policy: Record<string, boolean>,
  ): Promise<ProviderSnapshot> {
    const enabled = policy[probe.id] ?? true;
    const base = {
      id: probe.id,
      displayName: probe.displayName,
      presentation: probe.presentation,
      enabled,
      lastProbedAt: nowIso(),
    };
    try {
      const detection = await withTimeout(probe.detect(env), PROBE_TIMEOUT_MS);
      if (!detection.installed) {
        return { ...base, status: 'not-connected', detected: false, detectionReason: detection.reason, accounts: [] };
      }

      const accountRefs = await withTimeout(probe.accounts(env), PROBE_TIMEOUT_MS);
      if (accountRefs.length === 0) {
        return { ...base, status: 'not-connected', detected: true, accounts: [] };
      }

      const accounts: AccountQuota[] = await Promise.all(
        accountRefs.map(async (account) => {
          try {
            const quotas = await withTimeout(probe.quotas(env, account), PROBE_TIMEOUT_MS);
            return { account, quotas };
          } catch (err) {
            return { account, quotas: [], error: errorMessage(err) };
          }
        }),
      );
      return { ...base, status: 'ready', detected: true, accounts };
    } catch (err) {
      return { ...base, status: 'error', detected: false, accounts: [], error: errorMessage(err) };
    }
  }
}
