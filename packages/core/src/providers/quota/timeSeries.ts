/**
 * Ring-buffer history of quota snapshots (~7 days) + burn-rate/ETA math.
 * Persistence (globalState vs `.aidlc/quota-history.json`) is the caller's
 * job — this class only holds points in memory and prunes by age; give it a
 * `load()`ed array to seed and read `points()` back out to persist.
 */

import type { QuotaSnapshot } from './types';
import { pctAvailable } from './aggregator';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface QuotaHistoryPoint {
  at: string; // ISO
  providerId: string;
  windowId: string;
  pct: number;
}

export class QuotaTimeSeriesStore {
  private points: QuotaHistoryPoint[] = [];

  constructor(seed: QuotaHistoryPoint[] = []) {
    this.points = seed;
    this.prune();
  }

  record(snapshot: QuotaSnapshot): void {
    for (const provider of snapshot.providers) {
      for (const account of provider.accounts) {
        for (const window of account.quotas) {
          const pct = pctAvailable(window);
          if (pct === undefined) continue;
          this.points.push({ at: snapshot.generatedAt, providerId: provider.id, windowId: window.id, pct });
        }
      }
    }
    this.prune();
  }

  /** All retained points, oldest first — persist this. */
  export(): QuotaHistoryPoint[] {
    return [...this.points];
  }

  series(providerId: string, windowId: string): QuotaHistoryPoint[] {
    return this.points.filter((p) => p.providerId === providerId && p.windowId === windowId);
  }

  /**
   * Burn-rate ETA: linear fit of "% consumed" over the recent window, then
   * how long until 0% available. Returns undefined with too little data
   * (need ≥2 points spanning >0ms) rather than guessing.
   */
  eta(providerId: string, windowId: string, now: Date = new Date()): { etaMs: number; burnPctPerHour: number } | undefined {
    const series = this.series(providerId, windowId);
    if (series.length < 2) return undefined;

    const first = series[0];
    const last = series[series.length - 1];
    const elapsedMs = Date.parse(last.at) - Date.parse(first.at);
    if (elapsedMs <= 0) return undefined;

    const availDrop = first.pct - last.pct; // positive = consuming quota
    if (availDrop <= 0) return undefined; // flat or refilled (reset) — no meaningful burn rate

    const pctPerMs = availDrop / elapsedMs;
    const burnPctPerHour = pctPerMs * 60 * 60 * 1000;
    const etaMs = last.pct / pctPerMs;
    return { etaMs, burnPctPerHour };
  }

  private prune(now: Date = new Date()): void {
    const cutoff = now.getTime() - RETENTION_MS;
    this.points = this.points.filter((p) => Date.parse(p.at) >= cutoff);
  }
}
