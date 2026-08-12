/** 'lastProbedAt' → 'vừa xong' / '4m trước' / '2h trước', for the §4.6 'stale' label. */
export function relativeTimeFromNow(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const deltaMs = now.getTime() - Date.parse(iso);
  if (Number.isNaN(deltaMs) || deltaMs < 0) return '';
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes}m trước`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h trước`;
}
