// v3/lib/quota.ts — Công thức quota tracker, trích §4.1 V3_HANDOFF.md.
// pctAvailable = Math.round((limit - used) / limit * 100)      // MỘT mẫu số mỗi dòng
// tone = pct >= 60 ? 'acc' : pct >= 25 ? 'warn' : 'err'
// card.availPct = Math.min(...quotas.map(q => q.pctAvailable)) // '—' nếu chưa nối

import type { QuotaCardVM, QuotaRowVM, Tone } from '../data/types';

export function pctAvailable(row: QuotaRowVM): number {
  return Math.round(((row.limit - row.used) / row.limit) * 100);
}

export function quotaTone(pct: number): Tone {
  return pct >= 60 ? 'acc' : pct >= 25 ? 'warn' : 'err';
}

/** '—' nếu chưa nối provider hoặc không có quota row nào. */
export function cardAvailPct(card: QuotaCardVM): number | '—' {
  if (!card.connected || card.quotas.length === 0) return '—';
  return Math.min(...card.quotas.map(pctAvailable));
}

export function cardTone(card: QuotaCardVM): Tone {
  const pct = cardAvailPct(card);
  return pct === '—' ? 'muted' : quotaTone(pct);
}
