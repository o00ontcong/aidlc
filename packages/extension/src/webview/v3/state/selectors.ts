// v3/state/selectors.ts — derive: visibleEpics, followed/rest, counts, statusBar (§3, §6.1)
import type { EpicRowVM, EpicStateLabel, TabId, UiState } from '../data/types';
import { EPIC_STATE_BADGE } from '../lib/badge';
import { MOCK_BRANCH } from '../data/mock-data';

/** Lọc/tìm chạy ở webview, không gọi backend — trích đúng công thức §6.1. */
export function visibleEpics(epics: EpicRowVM[], filter: UiState['filter'], query: string): EpicRowVM[] {
  const q = query.toLowerCase();
  return epics
    .filter((r) => filter === 'All' || r.state === filter)
    .filter((r) => !q || `${r.id} ${r.title} ${r.next}`.toLowerCase().includes(q));
}

export function splitFollow(visible: EpicRowVM[], follow: Record<string, boolean>): { following: EpicRowVM[]; rest: EpicRowVM[] } {
  const following = visible.filter((e) => follow[e.id]);
  const rest = visible.filter((e) => !follow[e.id]);
  return { following, rest };
}

const FILTER_ORDER: EpicStateLabel[] = ['In progress', 'Pending', 'Done', 'Failed'];

export function filterCounts(epics: EpicRowVM[]): { key: 'All' | EpicStateLabel; count: number }[] {
  return [
    { key: 'All' as const, count: epics.length },
    ...FILTER_ORDER.map((key) => ({ key, count: epics.filter((e) => e.state === key).length })),
  ];
}

export function statusBarFor(
  tab: TabId,
  ctx: { epicId: string; epicState?: EpicStateLabel; builderTab: string; platform: string; pack: string },
): { branch: string; status: string; cmdHint: string } {
  const branch = MOCK_BRANCH;
  switch (tab) {
    case 'Home':
      return { branch, status: 'ready · 1 blocker · 1 gate chờ', cmdHint: 'aidlc epic next EPIC-142' };
    case 'Epics': {
      const badgeLabel = ctx.epicState ? EPIC_STATE_BADGE[ctx.epicState].label : '';
      return { branch, status: `${ctx.epicId} · ${badgeLabel}`, cmdHint: `aidlc gate approve ${ctx.epicId} merge_default_branch` };
    }
    case 'Builder':
      return { branch, status: `builder · ${ctx.builderTab.toLowerCase()}`, cmdHint: 'aidlc pipeline list' };
    case 'Analyze':
      return { branch, status: `analyze · ${ctx.platform.toLowerCase()}`, cmdHint: `aidlc analyze --platform ${ctx.platform}` };
    case 'Tests':
      return { branch, status: 'test agent · verdict gate chờ', cmdHint: 'aidlc test run --e2e' };
    case 'Guide':
      return { branch, status: 'guide & diagnostics', cmdHint: 'aidlc doctor' };
    case 'Studio':
      return { branch, status: `studio · pack ${ctx.pack}`, cmdHint: 'aidlc project recommend --explain' };
    default:
      return { branch, status: '', cmdHint: '' };
  }
}
