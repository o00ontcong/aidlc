// v3/lib/badge.ts — bảng map EpicStateLabel -> StatusBadge (§6.2), dùng chung
// giữa components/StatusBadge.tsx và state/selectors.ts (statusBar cmdHint).
import type { EpicStateLabel } from '../data/types';

export const EPIC_STATE_BADGE: Record<EpicStateLabel, { icon: '●' | '✕' | '✓' | '○'; bg: string; fg: string; label: string }> = {
  'In progress': { icon: '●', bg: 'var(--warn-bg)', fg: 'var(--warn)', label: 'waiting-for-user' },
  Failed: { icon: '✕', bg: 'var(--err-bg)', fg: 'var(--err)', label: 'blocked' },
  Done: { icon: '✓', bg: 'var(--acc-bg)', fg: 'var(--acc-txt)', label: 'completed' },
  Pending: { icon: '○', bg: 'var(--hover)', fg: 'var(--txt2)', label: 'draft' },
};
