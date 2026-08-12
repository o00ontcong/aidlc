/**
 * Pure aggregation math over quota windows/snapshots. Mirrors the formula
 * frozen in packages/extension/src/webview/v3/lib/quota.ts §4.1 — kept as a
 * second, framework-neutral copy here because the CLI (`aidlc quota`) has no
 * dependency on the webview package. Do not change the formula in either
 * place without updating both; the numbers must always agree.
 */

import type { QuotaWindow, ProviderSnapshot, AccountQuota } from './types';

export type QuotaTone = 'acc' | 'warn' | 'err' | 'muted';

export function pctAvailable(window: QuotaWindow): number | undefined {
  if (window.limit <= 0) return undefined;
  return Math.round(((window.limit - window.used) / window.limit) * 100);
}

export function windowTone(pct: number): QuotaTone {
  return pct >= 60 ? 'acc' : pct >= 25 ? 'warn' : 'err';
}

/** Lowest available % across an account's windows, or undefined if none/derivable. */
export function accountAvailPct(account: AccountQuota): number | undefined {
  const pcts = account.quotas.map(pctAvailable).filter((p): p is number => p !== undefined);
  return pcts.length === 0 ? undefined : Math.min(...pcts);
}

/**
 * A provider card's headline %: min() across its *enabled* accounts, per
 * §4.7 (multiple accounts aggregate by the worst one currently in rotation).
 * Returns undefined when not connected, no accounts, or no derivable quota —
 * callers must render '—', never fabricate a number.
 */
export function cardAvailPct(snapshot: ProviderSnapshot): number | undefined {
  if (!snapshot.enabled || snapshot.status === 'not-connected' || snapshot.accounts.length === 0) return undefined;
  const pcts = snapshot.accounts.map(accountAvailPct).filter((p): p is number => p !== undefined);
  return pcts.length === 0 ? undefined : Math.min(...pcts);
}

export function cardTone(snapshot: ProviderSnapshot): QuotaTone {
  const pct = cardAvailPct(snapshot);
  return pct === undefined ? 'muted' : windowTone(pct);
}
