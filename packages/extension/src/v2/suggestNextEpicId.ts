/**
 * Suggest the next delivery task id from existing epic folder names.
 *
 * Takes the highest trailing number in any `PREFIX-NNN` folder and returns
 * just that number + 1 (no prefix, no zero-padding) so the New change
 * Task id field stays short next to Title. Callers that need a valid
 * lifecycle {@link EpicId} should wrap via {@link formatSequencedEpicId}.
 *
 * Example: existing `PASS-1059` → `"1060"` (UI) / `EPIC-1060` (storage).
 */

const NUMBERED_ID = /^([A-Z][A-Z0-9]*)-(\d+)$/i;

/** Highest `PREFIX-NNN` number among existing folders, then +1 (min 1). */
export function suggestNextEpicNumber(existing: string[]): number {
  let max = 0;
  for (const name of existing) {
    const match = NUMBERED_ID.exec(name.trim());
    if (!match) { continue; }
    const value = parseInt(match[2]!, 10);
    if (!Number.isFinite(value)) { continue; }
    if (value > max) { max = value; }
  }
  return max + 1;
}

/** Short task-id suggestion for the composer placeholder — digits only. */
export function suggestNextEpicId(existing: string[]): string {
  return String(suggestNextEpicNumber(existing));
}

/** Lifecycle EpicId: `EPIC-{n}` from a bare number or already-prefixed id. */
export function formatSequencedEpicId(numberOrId: string | number): string {
  const raw = String(numberOrId).trim();
  if (/^\d+$/.test(raw)) {
    return `EPIC-${raw}`;
  }
  const match = NUMBERED_ID.exec(raw);
  if (match) {
    return `EPIC-${parseInt(match[2]!, 10)}`;
  }
  return raw;
}
