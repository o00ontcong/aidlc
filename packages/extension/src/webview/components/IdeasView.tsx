import { useEffect, useState } from 'react';
import { AlertTriangle, Lightbulb, Plus, RotateCcw } from 'lucide-react';

import type { IdeaSummary, WorkspaceState } from '@/lib/types';
import { cn } from '@/lib/utils';
import { postMessage } from '@/lib/bridge';
import { ideasCopy, type IdeasCheckpoint, type IdeasLanguage } from '@/lib/ideasI18n';

interface Props {
  state: WorkspaceState;
  selectedIdeaId?: string;
  onSelectIdea: (ideaId: string) => void;
}

type Filter = 'awaiting_you' | 'agent_running' | 'blocked' | 'done' | 'shelved';

/** Mirrors `IdeaService.inboxBucket` exactly — see docs/design/ideas-tab/ideas-tab-audit.canvas.tsx's INBOX_RULES table. */
function inboxBucket(idea: IdeaSummary): Filter {
  if (idea.checkpoint === 'shelved') return 'shelved';
  if (idea.blockedReason) return 'blocked';
  if (idea.checkpoint === 'closed' || idea.checkpoint === 'completed') return 'done';
  if (idea.prep.status === 'running') return 'agent_running';
  return 'awaiting_you';
}

export function IdeasView({ state, selectedIdeaId, onSelectIdea }: Props) {
  const [creating, setCreating] = useState(state.ideas.length === 0);
  const [filter, setFilter] = useState<Filter>('awaiting_you');
  const language = state.displayLanguage;
  const copy = ideasCopy(language);
  const selected = state.ideas.find((idea) => idea.id === selectedIdeaId);

  useEffect(() => {
    if (!selected && selectedIdeaId) {
      // The selected idea vanished from state (e.g. after a restart round-trip) —
      // fall back to nothing selected rather than showing a stale detail pane.
    }
  }, [selected, selectedIdeaId]);

  const counts: Record<Filter, number> = { awaiting_you: 0, agent_running: 0, blocked: 0, done: 0, shelved: 0 };
  for (const idea of state.ideas) counts[inboxBucket(idea)] += 1;
  const visible = state.ideas.filter((idea) => inboxBucket(idea) === filter);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{copy.header.eyebrow}</div>
              <h1 className="mt-1 text-xl font-bold text-foreground">{copy.header.title}</h1>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">{copy.header.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setCreating(true); }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> {copy.newIdea}
          </button>
        </div>
      </section>

      {creating && (
        <CaptureCard
          language={language}
          onClose={() => setCreating(false)}
          onSelect={onSelectIdea}
        />
      )}

      <div className="grid min-h-[470px] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2.5">
            <FilterPill label={`${copy.filters.awaitingYou} (${counts.awaiting_you})`} active={filter === 'awaiting_you'} onClick={() => setFilter('awaiting_you')} />
            <FilterPill label={`${copy.filters.agentRunning} (${counts.agent_running})`} active={filter === 'agent_running'} onClick={() => setFilter('agent_running')} />
            <FilterPill label={`${copy.filters.blocked} (${counts.blocked})`} active={filter === 'blocked'} onClick={() => setFilter('blocked')} />
            <FilterPill label={copy.filters.done} active={filter === 'done'} onClick={() => setFilter('done')} />
            <FilterPill label={copy.filters.shelved} active={filter === 'shelved'} onClick={() => setFilter('shelved')} />
          </div>
          {visible.length === 0 ? (
            <div className="p-5 text-center">
              <Lightbulb className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <div className="mt-2 text-xs font-semibold text-foreground">{copy.list.emptyTitle}</div>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">{copy.list.emptyBody}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visible.map((idea) => (
                <button
                  key={idea.id}
                  type="button"
                  onClick={() => onSelectIdea(idea.id)}
                  className={cn(
                    'w-full px-4 py-3 text-left transition-colors hover:bg-accent/60',
                    selected?.id === idea.id && 'bg-primary/5',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <CheckpointBadge checkpoint={idea.checkpoint} language={language} />
                    <span className="text-[9.5px] text-muted-foreground">{formatUpdated(idea.updatedAt, language)}</span>
                  </div>
                  <div className="mt-1.5 line-clamp-2 text-xs font-semibold leading-relaxed text-foreground">{idea.title}</div>
                  {idea.blockedReason && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-destructive">
                      <AlertTriangle className="h-3 w-3" /> {idea.blockedReason}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </aside>
        <section className="rounded-xl border border-border bg-card p-5">
          {selected ? (
            <IdeaDetail idea={selected} language={language} />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {copy.list.savedAutomatically}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CaptureCard({
  language,
  onClose,
  onSelect,
}: {
  language: IdeasLanguage;
  onClose: () => void;
  onSelect: (ideaId: string) => void;
}) {
  const copy = ideasCopy(language);
  const [seed, setSeed] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = () => {
    if (!seed.trim() || submitting) return;
    setSubmitting(true);
    postMessage({ type: 'createIdea', seedSentence: seed.trim() });
    onClose();
  };

  return (
    <section className="mx-auto max-w-xl rounded-xl border border-primary/30 bg-card p-5">
      <label className="text-sm font-semibold text-foreground">{copy.capture.prompt}</label>
      <textarea
        autoFocus
        value={seed}
        onChange={(e) => setSeed(e.target.value)}
        placeholder={copy.capture.placeholder}
        rows={3}
        className="mt-2 w-full resize-none rounded-md border border-border bg-background p-3 text-sm text-foreground focus:border-primary focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          if (e.key === 'Escape') onClose();
        }}
      />
      <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">{copy.capture.hint}</p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground hover:bg-accent">
          {copy.resume.cancel}
        </button>
        <button
          type="button"
          disabled={!seed.trim() || submitting}
          onClick={submit}
          className="rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copy.capture.start}
        </button>
      </div>
    </section>
  );
}

function IdeaDetail({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  const [confirmingRestart, setConfirmingRestart] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CheckpointBadge checkpoint={idea.checkpoint} language={language} />
          <h2 className="mt-1.5 text-base font-bold text-foreground">{idea.title}</h2>
          <p className="mt-1 text-[10.5px] text-muted-foreground">
            {copy.resume.savedAt(new Date(idea.updatedAt).toLocaleTimeString(language === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' }))}
          </p>
        </div>
        {idea.checkpoint !== 'shelved' && idea.checkpoint !== 'completed' && (
          <button
            type="button"
            onClick={() => setConfirmingRestart(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[10.5px] text-muted-foreground hover:bg-accent"
          >
            <RotateCcw className="h-3 w-3" /> {copy.resume.restart}
          </button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background/60 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{copy.capture.prompt}</div>
        <p className="mt-1 text-sm text-foreground">{idea.seedSentence}</p>
      </div>

      {idea.checkpoint === 'captured' && (
        <div className="rounded-lg border border-dashed border-border bg-background/60 p-4">
          <div className="text-xs font-semibold text-foreground">{copy.prepPending.title}</div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">{copy.prepPending.body}</p>
        </div>
      )}

      {idea.checkpoint === 'shelved' && (
        <button
          type="button"
          onClick={() => postMessage({ type: 'reopenIdea', ideaId: idea.id, revision: idea.ideaRevision })}
          className="rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {copy.actions.reopen}
        </button>
      )}
      {idea.checkpoint !== 'shelved' && idea.checkpoint !== 'closed' && idea.checkpoint !== 'completed' && (
        <button
          type="button"
          onClick={() => postMessage({ type: 'shelveIdea', ideaId: idea.id, revision: idea.ideaRevision })}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-[10.5px] text-muted-foreground hover:bg-accent"
        >
          {copy.actions.shelve}
        </button>
      )}

      {confirmingRestart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-xl">
            <div className="text-sm font-bold text-foreground">{copy.resume.restartConfirmTitle}</div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{copy.resume.restartConfirmBody}</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmingRestart(false)} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent">
                {copy.resume.cancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  postMessage({ type: 'restartIdea', ideaId: idea.id, revision: idea.ideaRevision });
                  setConfirmingRestart(false);
                }}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90"
              >
                {copy.resume.restartConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors',
        active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
}

function CheckpointBadge({ checkpoint, language }: { checkpoint: IdeasCheckpoint; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  return (
    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[9.5px] font-semibold text-secondary-foreground">
      {copy.checkpointLabel[checkpoint]}
    </span>
  );
}

function formatUpdated(iso: string, language: IdeasLanguage): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / 3_600_000);
  if (diffHours < 1) return language === 'vi' ? 'Vừa xong' : 'Just now';
  if (diffHours < 24) return language === 'vi' ? `${diffHours} giờ trước` : `${diffHours}h ago`;
  return date.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', day: 'numeric' });
}
