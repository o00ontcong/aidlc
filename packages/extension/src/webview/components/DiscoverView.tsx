/* Discover tab — the 12-step blueprint pipeline that replaced the Ideas tab.
 *
 * Markdown under docsRoot is the source of truth; this tab is a structured way
 * to read and edit those files, plus the review surface for what an agent
 * wrote into them.
 */

import { useEffect, useState } from 'react';
import { BookOpen, Compass, ScanSearch } from 'lucide-react';
import type { DiscoverCommitModalOpen, DiscoverScopeModalOpen, WorkspaceState } from '@/lib/types';
import { onHostMessage, postMessage } from '@/lib/bridge';
import { discoverCopy, type DiscoverLanguage } from '@/lib/discoverI18n';
import { DiscoverWorkspace } from './discover/DiscoverWorkspace';
import { DiscoverScopeModal } from './discover/DiscoverScopeModal';
import { DiscoverCommitModal } from './discover/DiscoverCommitModal';

export function DiscoverView({ state }: { state: WorkspaceState }) {
  const language = (state.displayLanguage ?? 'en') as DiscoverLanguage;
  const [scopeModal, setScopeModal] = useState<DiscoverScopeModalOpen | null>(null);
  const [commitModal, setCommitModal] = useState<DiscoverCommitModalOpen | null>(null);

  useEffect(() => {
    return onHostMessage((msg) => {
      if (msg.type === 'openDiscoverScopeModal') {
        setScopeModal({
          intent: msg.intent === 'edit' ? 'edit' : 'scan',
          mode: msg.mode === 'confirm' ? 'confirm' : 'wizard',
          probe: msg.probe as DiscoverScopeModalOpen['probe'],
          existing: msg.existing as DiscoverScopeModalOpen['existing'],
        });
      }
      if (msg.type === 'openDiscoverCommitModal') {
        setCommitModal({
          defaultMessage: String(msg.defaultMessage ?? ''),
          repoName: String(msg.repoName ?? ''),
          changeCount: Number(msg.changeCount ?? 0),
        });
      }
    });
  }, []);

  return (
    <div className="h-full min-h-0">
      {state.discover
        ? <DiscoverWorkspace
            discover={state.discover}
            changes={state.changes}
            contextProposals={state.contextProposals}
            contextHead={state.contextHead}
            language={language}
            savedRailWidth={state.discoverViewUi?.railWidth}
            savedAgentPanelOpen={state.discoverViewUi?.agentPanelOpen}
          />
        : <EmptyState language={language} />}
      {scopeModal && (
        <DiscoverScopeModal
          open={scopeModal}
          language={language}
          onClose={() => setScopeModal(null)}
        />
      )}
      {commitModal && (
        <DiscoverCommitModal
          open={commitModal}
          language={language}
          onClose={() => setCommitModal(null)}
        />
      )}
    </div>
  );
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

        <div className="mt-4 flex flex-col gap-2">
          <textarea
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { start(); } }}
            placeholder={copy.seedPlaceholder}
            title={copy.hints.seedInput}
            rows={5}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{copy.seedShortcutHint}</span>
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
        </div>

        <div className="mt-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{copy.orDivider}</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-md border border-border bg-secondary/30 p-3">
          <ScanSearch className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] leading-relaxed text-muted-foreground">{copy.scanExistingHint}</p>
            <button
              type="button"
              onClick={() => postMessage({ type: 'scanDiscoverProject' })}
              title={copy.hints.scanExisting}
              className="mt-2 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-foreground hover:bg-accent"
            >
              {copy.scanExisting}
            </button>
          </div>
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
