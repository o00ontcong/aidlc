/**
 * `resetsAt` (ISO timestamp) → the design's relative-duration label, e.g.
 * 'in 4h 40m'. Also used by the burn-rate/ETA copy in the sidebar tooltip.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Formats a positive duration in ms as '4h 40m' / '6d 7h' / '12m' / '<1m'. */
export function formatDuration(ms: number): string {
  if (ms < MINUTE) return '<1m';
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * `resetsAt` → 'in 4h 40m' | 'resetting soon' | '—'.
 * Handles a reset already in the past (window rolled over but we haven't
 * re-probed yet) and a `now` behind `resetsAt` due to clock skew — both just
 * clamp to 'resetting soon' rather than a negative/garbage duration.
 */
export function formatResetsAt(resetsAt: string | undefined, now: Date = new Date()): string {
  if (!resetsAt) return '—';
  const resetMs = Date.parse(resetsAt);
  if (Number.isNaN(resetMs)) return '—';
  const deltaMs = resetMs - now.getTime();
  if (deltaMs <= 0) return 'resetting soon';
  return `in ${formatDuration(deltaMs)}`;
}
