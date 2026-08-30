/* Map the existing `IdeaSummary` host payload onto the v3 Ideas viewmodel.
 *
 * Mirrors `epic-v3/adapt.ts`'s role for Epics: pure derivation, no message
 * passing, no new state shape. `IdeaSummary` has no per-step array like
 * Epic's `stepDetails` — just a `checkpoint` enum plus `prep.status` /
 * `blockedReason` — so `ideaStepperNodes` derives a fixed 5-station
 * sequence client-side instead of mapping a real per-step list.
 */

import type { IdeaSummary } from '@/lib/types';
import { ideasCopy, type IdeasCheckpoint, type IdeasLanguage } from '@/lib/ideasI18n';

export type Filter = 'all' | 'awaiting_you' | 'agent_running' | 'blocked' | 'done' | 'shelved';

/** Mirrors `IdeaService.inboxBucket` exactly — see docs/design/ideas-tab/ideas-tab-audit.canvas.tsx's INBOX_RULES table. */
export function inboxBucket(idea: IdeaSummary): Filter {
  if (idea.checkpoint === 'shelved') return 'shelved';
  if (idea.blockedReason) return 'blocked';
  if (idea.checkpoint === 'closed' || idea.checkpoint === 'completed') return 'done';
  if (idea.prep.status === 'running') return 'agent_running';
  return 'awaiting_you';
}

export function formatUpdated(iso: string, language: IdeasLanguage): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / 3_600_000);
  if (diffHours < 1) return language === 'vi' ? 'Vừa xong' : 'Just now';
  if (diffHours < 24) return language === 'vi' ? `${diffHours} giờ trước` : `${diffHours}h ago`;
  return date.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', day: 'numeric' });
}

/** Coarse status tone per `Filter` bucket — drives the list row dot and the header badge's color. */
export const FILTER_TONE: Record<Filter, { icon: string; bg: string; fg: string; dot: string }> = {
  // Never looked up via `inboxBucket` (no Idea's own bucket is ever "all") —
  // present only so this stays a valid `Record<Filter, ...>` now that `Filter`
  // includes the "show everything" pill.
  all: { icon: '≡', bg: 'var(--hover)', fg: 'var(--txt2)', dot: 'var(--txt3)' },
  awaiting_you: { icon: '◆', bg: 'var(--acc-bg)', fg: 'var(--acc-txt)', dot: 'var(--acc)' },
  agent_running: { icon: '●', bg: 'var(--warn-bg)', fg: 'var(--warn)', dot: 'var(--warn)' },
  blocked: { icon: '✕', bg: 'var(--err-bg)', fg: 'var(--err)', dot: 'var(--err)' },
  done: { icon: '✓', bg: 'var(--hover)', fg: 'var(--txt2)', dot: 'var(--track)' },
  shelved: { icon: '⏸', bg: 'var(--hover)', fg: 'var(--txt3)', dot: 'var(--track)' },
};

/* ── stepper ──────────────────────────────────────────────────────────────── */

export type IdeaStepKind = 'done' | 'active' | 'todo' | 'failed';

export interface IdeaStepNode {
  key: 'capture' | 'intent' | 'route' | 'delivery' | 'end';
  label: string;
  kind: IdeaStepKind;
}

/** Same 4-kind palette as `epic-v3/flow-layout.ts`'s `NODE_STYLE` + `adapt.ts`'s `FAILED_NODE_STYLE`,
 * transcribed rather than imported — Idea's stepper is a straight line, not the DAG those files draw. */
export const STEP_STYLE: Record<IdeaStepKind, { border: string; bg: string; iconColor: string; labelColor: string }> = {
  done: { border: '1.5px solid var(--acc)', bg: 'var(--acc-bg)', iconColor: 'var(--acc-txt)', labelColor: 'var(--txt3)' },
  active: { border: '2px solid var(--warn)', bg: 'var(--warn-bg)', iconColor: 'var(--warn)', labelColor: 'var(--warn)' },
  failed: { border: '2px solid var(--err-bd)', bg: 'var(--err-bg)', iconColor: 'var(--err)', labelColor: 'var(--err)' },
  todo: { border: '1.5px dashed var(--bd)', bg: 'var(--panel)', iconColor: 'var(--txt3)', labelColor: 'var(--txt3)' },
};
export const STEP_ICON: Record<IdeaStepKind, string> = { done: '✓', active: '●', failed: '✕', todo: '○' };

const STATION_ORDER = ['capture', 'intent', 'route', 'delivery', 'end'] as const;
export type StationKey = (typeof STATION_ORDER)[number];

/** Which station an Idea's checkpoint currently sits at — the stepper's default focus, and what "isCurrent" means for a clicked station. */
export function currentStationKey(idea: IdeaSummary): StationKey {
  return stationForCheckpoint(idea.checkpoint);
}

function stationForCheckpoint(checkpoint: IdeasCheckpoint): StationKey {
  switch (checkpoint) {
    case 'captured':
    case 'preparing':
    case 'awaiting_human':
    case 'shelved':
      return 'capture';
    case 'intent_drafted': return 'intent';
    case 'route_proposed': return 'route';
    case 'in_delivery': return 'delivery';
    case 'closed':
    case 'completed':
      return 'end';
    default:
      return 'capture';
  }
}

function labelFor(key: StationKey, idea: IdeaSummary, copy: ReturnType<typeof ideasCopy>): string {
  if (key === 'capture') {
    if (idea.checkpoint === 'preparing') return copy.checkpointLabel.preparing;
    if (idea.checkpoint === 'awaiting_human') return copy.checkpointLabel.awaiting_human;
    return copy.checkpointLabel.captured;
  }
  if (key === 'intent') return copy.checkpointLabel.intent_drafted;
  if (key === 'route') return copy.checkpointLabel.route_proposed;
  if (key === 'delivery') return copy.checkpointLabel.in_delivery;
  // 'end' — resolved dynamically; a station not yet reached has no fixed
  // outcome to name yet, so it renders glyph-only (empty label).
  if (idea.checkpoint === 'completed') return copy.checkpointLabel.completed;
  if (idea.checkpoint === 'closed') return copy.checkpointLabel.closed;
  return '';
}

/**
 * Always returns the same 5 stations — `capture` (captured/preparing/
 * awaiting_human) → `intent` (intent_drafted) → `route` (route_proposed) →
 * `delivery` (in_delivery) → `end` (closed/completed). `shelved` is a pause,
 * not a forward station: the caller skips rendering the stepper entirely for
 * it (the host does not preserve which station was active before shelving).
 */
export function ideaStepperNodes(idea: IdeaSummary, language: IdeasLanguage): IdeaStepNode[] {
  const copy = ideasCopy(language);
  const currentStation = stationForCheckpoint(idea.checkpoint);
  const currentIdx = STATION_ORDER.indexOf(currentStation);
  const failed = Boolean(idea.blockedReason) || idea.prep.status === 'failed';
  return STATION_ORDER.map((key, idx) => {
    const kind: IdeaStepKind =
      idx < currentIdx ? 'done'
        : idx > currentIdx ? 'todo'
          // Reaching `end` always means a real close/completion, never a
          // failure — any failure happens upstream, at an earlier station.
          : key === 'end' ? 'done'
            : failed ? 'failed' : 'active';
    return { key, label: labelFor(key, idea, copy), kind };
  });
}
