/**
 * Maps a `QuotaSnapshot` to a flat, display-ready shape — every %, tone
 * signal, and reset label a consumer (V3 webview, the legacy sidebar, the
 * CLI) needs is computed here, so none of them re-derive it. Kept in core
 * per docs/prompts/quota-tracker-implementation.md §2.1 ("CLI phải dùng lại
 * được") — the extension and CLI both call this instead of duplicating it.
 *
 * A card is 'stale' when its last successful probe is older than
 * `STALE_AFTER_MS` — staleness is a display-time judgement (age relative to
 * "now"), not something the probe itself can know, so it's computed here
 * rather than in QuotaService.
 */

import { formatResetsAt } from './formatter';
import type { ProviderSnapshot, QuotaSnapshot } from './types';

const STALE_AFTER_MS = 10 * 60 * 1000; // 10 minutes with no successful probe

export interface QuotaRowPresentation {
  label: string;
  used: number;
  limit: number;
  resetAt: string;
  source: string;
  confidence: string;
}

export interface QuotaCardPresentation {
  id: string;
  provider: string;
  initial: string;
  iconBg: string;
  iconFg: string;
  connected: boolean;
  accountLabel?: string;
  enabled: boolean;
  quotas: QuotaRowPresentation[];
  status: 'loading' | 'ready' | 'stale' | 'error' | 'not-connected';
  detectionReason?: string;
  error?: string;
  lastProbedAt?: string;
}

export interface QuotaPresentation {
  cards: QuotaCardPresentation[];
  connectedCount: number;
  notConnectedCount: number;
  generatedAt: string;
}

function effectiveStatus(snapshot: ProviderSnapshot, now: Date): QuotaCardPresentation['status'] {
  if (snapshot.status !== 'ready') return snapshot.status;
  if (!snapshot.lastProbedAt) return snapshot.status;
  const age = now.getTime() - Date.parse(snapshot.lastProbedAt);
  return age > STALE_AFTER_MS ? 'stale' : 'ready';
}

function presentCard(snapshot: ProviderSnapshot, now: Date): QuotaCardPresentation {
  // v1 aggregates the primary (first) account only — multi-account rollup is
  // §4.7 follow-up work, tracked separately from this core wiring.
  const primary = snapshot.accounts[0];
  return {
    id: snapshot.id,
    provider: snapshot.displayName,
    initial: snapshot.presentation.initial,
    iconBg: snapshot.presentation.iconBg,
    iconFg: snapshot.presentation.iconFg,
    connected: snapshot.detected && snapshot.accounts.length > 0,
    accountLabel: primary?.account.label,
    enabled: snapshot.enabled,
    quotas: (primary?.quotas ?? []).map((window) => ({
      label: window.label,
      used: window.used,
      limit: window.limit,
      resetAt: formatResetsAt(window.resetsAt, now),
      source: window.source,
      confidence: window.confidence,
    })),
    status: effectiveStatus(snapshot, now),
    detectionReason: snapshot.detectionReason,
    error: snapshot.error ?? primary?.error,
    lastProbedAt: snapshot.lastProbedAt,
  };
}

export function presentQuotaSnapshot(snapshot: QuotaSnapshot, now: Date = new Date()): QuotaPresentation {
  const cards = snapshot.providers.map((provider) => presentCard(provider, now));
  const connectedCount = cards.filter((c) => c.connected).length;
  return {
    cards,
    connectedCount,
    notConnectedCount: cards.length - connectedCount,
    generatedAt: snapshot.generatedAt,
  };
}
