/**
 * Provider quota tracking — types shared by every adapter, the aggregator,
 * and consumers (extension host, CLI).
 *
 * Every quota number must carry `source` + `confidence`: several providers
 * don't expose a quota API, so the number is derived from local logs or not
 * available at all. Consumers must render that honestly (see
 * docs/prompts/quota-tracker-implementation.md §2.2, §4.6) — never present an
 * estimate as an exact figure, and never fabricate a number when a source
 * doesn't exist.
 */

export interface ProbeEnv {
  /** Home directory to probe, injectable so tests never touch the real HOME. */
  home: string;
  /** Process env, injectable for the same reason. */
  env: NodeJS.ProcessEnv;
  /** Whether the user opted in to network probes (`aidlc.quota.allowNetworkProbes`). */
  allowNetworkProbes: boolean;
}

export interface DetectionResult {
  installed: boolean;
  /** Human-readable reason, shown in the "add provider" wizard when not installed/authed. */
  reason?: string;
}

export interface AccountRef {
  /** Stable id used for caching/config, never a raw email or token. */
  id: string;
  /** Display label per design — 'Account 1', never an email. */
  label: string;
}

export type QuotaKind = 'percent' | 'absolute';
export type QuotaSource = 'cli' | 'api' | 'local-log' | 'estimated';
export type QuotaConfidence = 'exact' | 'derived' | 'estimated';

export interface QuotaWindow {
  /** 'session-5h' | 'weekly-7d' | 'daily-24h' | ... */
  id: string;
  /** Display label — 'session (5h)'. */
  label: string;
  kind: QuotaKind;
  /** percent: used = usedPct, limit = 100. absolute: raw units. */
  used: number;
  limit: number;
  /** ISO timestamp; UI formats to 'in 4h 40m'. Absent when the provider doesn't report a reset. */
  resetsAt?: string;
  source: QuotaSource;
  confidence: QuotaConfidence;
}

/** One provider's probe implementation, registered into the ProviderRegistry. */
export interface ProviderProbe {
  id: string;
  displayName: string;
  presentation: { initial: string; iconBg: string; iconFg: string };

  /** Is it installed on this machine — binary on PATH / config dir exists? */
  detect(env: ProbeEnv): Promise<DetectionResult>;

  /** Which accounts are logged in. MUST NOT read or log credential values. */
  accounts(env: ProbeEnv): Promise<AccountRef[]>;

  /** Quota windows for one account. Returns [] (never fabricated numbers) when unavailable. */
  quotas(env: ProbeEnv, account: AccountRef): Promise<QuotaWindow[]>;
}

export interface AccountQuota {
  account: AccountRef;
  quotas: QuotaWindow[];
  /** Set when accounts()/quotas() threw or timed out for this account. */
  error?: string;
}

export type ProviderStatus = 'loading' | 'ready' | 'stale' | 'error' | 'not-connected';

export interface ProviderSnapshot {
  id: string;
  displayName: string;
  presentation: { initial: string; iconBg: string; iconFg: string };
  status: ProviderStatus;
  /** false until config marks it enabled for routing (quota.setEnabled). */
  enabled: boolean;
  detected: boolean;
  detectionReason?: string;
  accounts: AccountQuota[];
  /** ISO timestamp of the last successful probe, for the 'stale' label. */
  lastProbedAt?: string;
  error?: string;
}

export interface QuotaSnapshot {
  providers: ProviderSnapshot[];
  /** ISO timestamp this snapshot was assembled. */
  generatedAt: string;
}
