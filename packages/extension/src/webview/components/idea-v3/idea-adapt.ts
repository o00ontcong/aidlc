/* Journal-first inbox buckets and phase labels for the Ideas tab v2 redesign. */

import type { IdeaJournalPhase, IdeaSummary } from '@/lib/types';
import { ideasCopy, type IdeasLanguage } from '@/lib/ideasI18n';

export type Filter = 'all' | 'writing' | 'ready' | 'done' | 'shelved' | 'blocked';

export function inboxBucket(idea: IdeaSummary): Filter {
  if (idea.checkpoint === 'shelved') return 'shelved';
  if (idea.blockedReason) return 'blocked';
  if (idea.checkpoint === 'closed' || idea.checkpoint === 'completed' || idea.checkpoint === 'in_delivery') return 'done';
  if (idea.journalPhase === 'ready' && idea.checkpoint === 'captured') return 'ready';
  return 'writing';
}

export function journalPhaseLabel(phase: IdeaJournalPhase, language: IdeasLanguage): string {
  return ideasCopy(language).journal.phases[phase];
}

export function formatUpdated(iso: string, language: IdeasLanguage): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / 3_600_000);
  if (diffHours < 1) return language === 'vi' ? 'Vừa xong' : 'Just now';
  if (diffHours < 24) return language === 'vi' ? `${diffHours} giờ trước` : `${diffHours}h ago`;
  return date.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', day: 'numeric' });
}

export const FILTER_TONE: Record<Filter, { icon: string; bg: string; fg: string; dot: string }> = {
  all: { icon: '≡', bg: 'var(--hover)', fg: 'var(--txt2)', dot: 'var(--txt3)' },
  writing: { icon: '✎', bg: 'var(--acc-bg)', fg: 'var(--acc-txt)', dot: 'var(--acc)' },
  ready: { icon: '◆', bg: 'var(--warn-bg)', fg: 'var(--warn)', dot: 'var(--warn)' },
  blocked: { icon: '✕', bg: 'var(--err-bg)', fg: 'var(--err)', dot: 'var(--err)' },
  done: { icon: '✓', bg: 'var(--hover)', fg: 'var(--txt2)', dot: 'var(--track)' },
  shelved: { icon: '⏸', bg: 'var(--hover)', fg: 'var(--txt3)', dot: 'var(--track)' },
};
