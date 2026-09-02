/* Discover tab — the 12-step blueprint pipeline that replaced the Ideas tab.
 *
 * Markdown under docsRoot is the source of truth; this tab is a structured way
 * to read and edit those files, plus the review surface for what an agent
 * wrote into them. See docs/DISCOVER_TAB_PLAN.md and
 * docs/design/discover-tab/discover-tab-wireframe.html.
 */

import { useState } from 'react';
import { BookOpen, Compass } from 'lucide-react';
import type { WorkspaceState } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { discoverCopy, type DiscoverLanguage } from '@/lib/discoverI18n';
import { DiscoverWorkspace } from './discover/DiscoverWorkspace';

export function DiscoverView({ state }: { state: WorkspaceState }) {
  const language = (state.displayLanguage ?? 'en') as DiscoverLanguage;
  return state.discover
    ? <DiscoverWorkspace discover={state.discover} language={language} />
    : <EmptyState language={language} />;
}

function EmptyState({ language }: { language: DiscoverLanguage }) {
  const copy = discoverCopy(language);
  const [seed, setSeed] = useState('');
  const start = () => { if (seed.trim()) { postMessage({ type: 'initDiscover', seedSentence: seed }); } };

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Compass className="h-4 w-4 text-primary" />
          {copy.emptyTitle}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{copy.emptyBody}</p>

        <div className="mt-4 flex gap-2">
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { start(); } }}
            placeholder={copy.seedPlaceholder}
            title={copy.hints.seedInput}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground"
          />
          <button
            type="button"
            disabled={!seed.trim()}
            onClick={start}
            title={copy.hints.startBlueprint}
            className="rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {copy.start}
          </button>
        </div>

        <p className="mt-4 text-[11px] text-muted-foreground">{copy.emptyHint}</p>
        <button
          type="button"
          onClick={() => postMessage({ type: 'openDiscoverGuide' })}
          title={copy.hints.openGuide}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <BookOpen className="h-3.5 w-3.5" />
          {copy.openGuide}
        </button>
      </div>
    </div>
  );
}
