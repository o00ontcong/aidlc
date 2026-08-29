import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, Flag, Lightbulb, Loader2, Plus, RotateCcw } from 'lucide-react';

import type { IdeaQuestion, IdeaSelfAnswered, IdeaSummary, WorkspaceState } from '@/lib/types';
import { cn } from '@/lib/utils';
import { onHostMessage, postMessage } from '@/lib/bridge';
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
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const [switchConfirmOpen, setSwitchConfirmOpen] = useState(false);
  const [conflictIdeaId, setConflictIdeaId] = useState<string | null>(null);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const language = state.displayLanguage;
  const copy = ideasCopy(language);
  const selected = state.ideas.find((idea) => idea.id === selectedIdeaId);

  useEffect(() => {
    return onHostMessage((msg) => {
      if (msg.type === 'ideaRevisionConflict') {
        const ideaId = String(msg.ideaId ?? '');
        if (ideaId) setConflictIdeaId(ideaId);
      }
      if (msg.type === 'ideaSaveFailed') {
        setSavingQuestionId(null);
      }
    });
  }, []);

  useEffect(() => {
    setSavingQuestionId(null);
  }, [selected?.id, selected?.ideaRevision]);

  const trySelectIdea = (ideaId: string) => {
    if (
      selected
      && selected.id !== ideaId
      && (selected.dirty || selected.saveStatus === 'saving' || selected.saveStatus === 'failed' || savingQuestionId)
    ) {
      setPendingSelectId(ideaId);
      setSwitchConfirmOpen(true);
      return;
    }
    onSelectIdea(ideaId);
  };

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
          onSelect={trySelectIdea}
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
                  onClick={() => trySelectIdea(idea.id)}
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
            <IdeaDetail
              idea={selected}
              language={language}
              savingQuestionId={savingQuestionId}
              onSavingQuestion={setSavingQuestionId}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {copy.list.savedAutomatically}
            </div>
          )}
        </section>
      </div>

      {switchConfirmOpen && pendingSelectId && (
        <ConfirmModal
          title={copy.switchConfirm.title}
          body={copy.switchConfirm.body}
          confirmLabel={copy.switchConfirm.discard}
          cancelLabel={copy.switchConfirm.stay}
          onCancel={() => { setSwitchConfirmOpen(false); setPendingSelectId(null); }}
          onConfirm={() => {
            onSelectIdea(pendingSelectId);
            setSwitchConfirmOpen(false);
            setPendingSelectId(null);
            setSavingQuestionId(null);
          }}
        />
      )}

      {conflictIdeaId && (
        <ConfirmModal
          title={copy.conflict.title}
          body={copy.conflict.body}
          confirmLabel={copy.conflict.reload}
          cancelLabel={copy.resume.cancel}
          onCancel={() => setConflictIdeaId(null)}
          onConfirm={() => {
            postMessage({ type: 'reloadIdeasState' });
            setConflictIdeaId(null);
            setSavingQuestionId(null);
          }}
        />
      )}
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

function IdeaDetail({
  idea,
  language,
  savingQuestionId,
  onSavingQuestion,
}: {
  idea: IdeaSummary;
  language: IdeasLanguage;
  savingQuestionId: string | null;
  onSavingQuestion: (questionId: string | null) => void;
}) {
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

      {idea.foundationStale && idea.checkpoint !== 'in_delivery' && idea.checkpoint !== 'completed' && idea.checkpoint !== 'closed' && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="text-[10.5px] leading-relaxed text-foreground">{copy.foundationStaleBanner}</p>
        </div>
      )}

      {(idea.saveStatus === 'failed' || idea.saveStatus === 'saving') && (
        <div className={cn(
          'rounded-lg border p-3',
          idea.saveStatus === 'failed' ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-background/60',
        )}
        >
          <div className="text-xs font-semibold text-foreground">
            {idea.saveStatus === 'failed' ? copy.batch.saveFailed : copy.batch.saving}
          </div>
          {idea.saveStatus === 'failed' && (
            <button
              type="button"
              onClick={() => postMessage({ type: 'reloadIdeasState' })}
              className="mt-2 rounded-md bg-primary px-3 py-1.5 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {copy.batch.retrySave}
            </button>
          )}
        </div>
      )}

      {idea.checkpoint === 'captured' && (
        <PrepPanel state="starting" idea={idea} language={language} />
      )}

      {idea.checkpoint === 'preparing' && (
        <PrepPanel state={idea.prep.status === 'failed' ? 'failed' : 'running'} idea={idea} language={language} />
      )}

      {idea.checkpoint === 'awaiting_human' && (
        <>
          {idea.prep.selfAnswered.length > 0 && <SelfAnsweredList idea={idea} language={language} />}
          <BatchQuestions
            idea={idea}
            language={language}
            savingQuestionId={savingQuestionId}
            onSavingQuestion={onSavingQuestion}
          />
        </>
      )}

      {idea.checkpoint === 'intent_drafted' && (
        idea.blockedReason ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <div className="text-xs font-semibold text-foreground">{copy.route.blockedTitle}</div>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-destructive">{idea.blockedReason}</p>
            <button
              type="button"
              onClick={() => postMessage({ type: 'retryIdeaRoute', ideaId: idea.id, revision: idea.ideaRevision })}
              className="mt-2 rounded-md bg-primary px-3 py-1.5 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {copy.route.retry}
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-background/60 p-4">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <div className="mt-1.5 text-xs font-semibold text-foreground">{copy.intentPending.title}</div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">{copy.intentPending.body}</p>
          </div>
        )
      )}

      {idea.checkpoint === 'route_proposed' && <RoutePanel idea={idea} language={language} />}

      {idea.checkpoint === 'in_delivery' && <DeliveryPanel idea={idea} language={language} />}

      {idea.checkpoint === 'closed' && (
        <div className="rounded-lg border border-border bg-background/60 p-4">
          <div className="text-xs font-semibold text-foreground">{copy.closed.title}</div>
          {idea.routeDraft?.evidence && (
            <p className="mt-1.5 whitespace-pre-wrap text-[10.5px] leading-relaxed text-muted-foreground">{idea.routeDraft.evidence}</p>
          )}
        </div>
      )}

      {idea.checkpoint === 'completed' && (
        <div className="rounded-lg border border-border bg-background/60 p-4">
          <div className="text-xs font-semibold text-foreground">{copy.completed.title}</div>
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

function PrepPanel({
  state,
  idea,
  language,
}: {
  state: 'starting' | 'running' | 'failed';
  idea: IdeaSummary;
  language: IdeasLanguage;
}) {
  const copy = ideasCopy(language);
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        state === 'failed' ? 'border-destructive/40 bg-destructive/5' : 'border-dashed border-border bg-background/60',
      )}
    >
      <div className="flex items-center gap-2">
        {state !== 'failed' && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
        <div className="text-xs font-semibold text-foreground">
          {state === 'starting' ? copy.prep.startingTitle : state === 'failed' ? copy.prep.failedTitle : copy.prep.runningTitle}
        </div>
      </div>
      {state === 'running' && (
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">{copy.prep.runningBody}</p>
      )}
      {state === 'failed' && (
        <>
          {idea.prep.error && <p className="mt-1.5 text-[10.5px] leading-relaxed text-destructive">{idea.prep.error}</p>}
          <button
            type="button"
            onClick={() => postMessage({ type: 'retryIdeaPrep', ideaId: idea.id })}
            className="mt-2 rounded-md bg-primary px-3 py-1.5 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {copy.prep.retry}
          </button>
        </>
      )}
    </div>
  );
}

function SelfAnsweredList({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-background/60">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <div>
          <div className="text-xs font-semibold text-foreground">{copy.prep.selfAnsweredHeader(idea.prep.selfAnswered.length)}</div>
          {!expanded && <p className="mt-0.5 text-[10px] text-muted-foreground">{copy.prep.selfAnsweredCaption}</p>}
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="space-y-1 border-t border-border px-3 py-2">
          {idea.prep.selfAnswered.map((entry, index) => (
            <SelfAnsweredRow key={`${entry.question}-${index}`} ideaId={idea.id} revision={idea.ideaRevision} entry={entry} index={index} language={language} />
          ))}
        </div>
      )}
    </div>
  );
}

function SelfAnsweredRow({
  ideaId,
  revision,
  entry,
  index,
  language,
}: {
  ideaId: string;
  revision: number;
  entry: IdeaSelfAnswered;
  index: number;
  language: IdeasLanguage;
}) {
  const copy = ideasCopy(language);
  return (
    <div className={cn('rounded-md px-2 py-2', entry.flagged && 'bg-destructive/5')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-foreground">{entry.question}</div>
          <div className="mt-0.5 text-[10.5px] text-muted-foreground">{entry.answer}</div>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 font-mono text-[9px] text-secondary-foreground">{entry.source}</span>
      </div>
      {entry.flagged ? (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-destructive">
          <Flag className="h-3 w-3" /> {copy.prep.flagged}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => postMessage({ type: 'flagIdeaSelfAnswer', ideaId, revision, index })}
          className="mt-1 text-[10px] text-muted-foreground underline decoration-dotted hover:text-destructive"
        >
          {copy.prep.flagWrong}
        </button>
      )}
    </div>
  );
}

function BatchQuestions({
  idea,
  language,
  savingQuestionId,
  onSavingQuestion,
}: {
  idea: IdeaSummary;
  language: IdeasLanguage;
  savingQuestionId: string | null;
  onSavingQuestion: (questionId: string | null) => void;
}) {
  const copy = ideasCopy(language);
  const [confirmingDecideRest, setConfirmingDecideRest] = useState(false);
  // Mirrors IdeaService's private eligibleQuestions(): a question only enters
  // the visible batch once every id in its dependsOn already has an answer.
  const eligible = idea.prep.questions.filter((question) => question.dependsOn.every((dep) => Boolean(idea.answers[dep])));
  const answeredCount = eligible.filter((question) => idea.answers[question.id]).length;
  const allAnswered = eligible.length > 0 && answeredCount === eligible.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-medium text-muted-foreground">{copy.batch.progress(answeredCount, eligible.length)}</span>
        <button
          type="button"
          onClick={() => setConfirmingDecideRest(true)}
          className="rounded-md border border-border bg-background px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-accent"
        >
          {copy.batch.decideRest}
        </button>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${eligible.length ? (answeredCount / eligible.length) * 100 : 0}%` }}
        />
      </div>

      {eligible.map((question) => (
        <QuestionCard
          key={question.id}
          ideaId={idea.id}
          revision={idea.ideaRevision}
          question={question}
          selected={idea.answers[question.id]}
          language={language}
          saving={savingQuestionId === question.id}
          onSelect={(choiceId) => {
            onSavingQuestion(question.id);
            postMessage({ type: 'saveIdeaAnswer', ideaId: idea.id, revision: idea.ideaRevision, questionId: question.id, choiceId });
          }}
        />
      ))}

      <button
        type="button"
        disabled={!allAnswered}
        onClick={() => postMessage({ type: 'submitIdeaBatch', ideaId: idea.id, revision: idea.ideaRevision })}
        className="rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {copy.batch.submit}
      </button>

      {confirmingDecideRest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-xl">
            <div className="text-sm font-bold text-foreground">{copy.batch.decideRestConfirmTitle}</div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{copy.batch.decideRestConfirmBody}</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmingDecideRest(false)} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent">
                {copy.resume.cancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  postMessage({ type: 'decideIdeaRest', ideaId: idea.id, revision: idea.ideaRevision });
                  setConfirmingDecideRest(false);
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {copy.batch.decideRestConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  ideaId,
  revision,
  question,
  selected,
  language,
  saving,
  onSelect,
}: {
  ideaId: string;
  revision: number;
  question: IdeaQuestion;
  selected: string | undefined;
  language: IdeasLanguage;
  saving: boolean;
  onSelect: (choiceId: string) => void;
}) {
  const copy = ideasCopy(language);
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11.5px] font-semibold text-foreground">{question.text}</div>
        {saving && <span className="text-[9.5px] text-muted-foreground">{copy.batch.saving}</span>}
      </div>
      <div className="mt-2 space-y-1.5">
        {question.options.map((option) => (
          <label key={option.id} className="flex cursor-pointer items-center gap-2 text-[11px] text-foreground">
            <input
              type="radio"
              name={question.id}
              checked={selected === option.id}
              onChange={() => onSelect(option.id)}
              className="h-3.5 w-3.5 accent-primary"
            />
            {option.label}
            {option.recommended && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[8.5px] font-bold text-primary">{copy.batch.recommended}</span>
            )}
          </label>
        ))}
      </div>
      <p className="mt-2 text-[10px] italic text-muted-foreground">{question.reason}</p>
    </div>
  );
}

function RoutePanel({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  const [confirming, setConfirming] = useState(false);
  const steps = idea.routeDraft?.steps ?? [];
  const hasBootstrap = steps[0]?.recipeId === 'cofofo-bootstrap';

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-foreground">{copy.route.title}</div>
      {hasBootstrap && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="text-[10.5px] leading-relaxed text-foreground">{copy.route.bootstrapBanner}</p>
        </div>
      )}
      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={`${step.recipeId}-${i}`} className="rounded-lg border border-border bg-background/60 p-3">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-bold text-primary">{i + 1}</span>
              <span className="text-[11.5px] font-semibold text-foreground">{step.recipeId}</span>
              <span className="text-[10.5px] text-muted-foreground">· {step.epicTitle}</span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">{step.rationale}</p>
          </div>
        ))}
      </div>
      {idea.assumptions.length > 0 && (
        <div className="rounded-lg border border-border bg-background/60 p-3">
          <div className="text-[10.5px] font-semibold text-foreground">{copy.route.assumptionsHeader(idea.assumptions.length)}</div>
          <div className="mt-1.5 space-y-1">
            {idea.assumptions.map((assumption) => (
              <div key={assumption.id} className="text-[10.5px] text-muted-foreground">
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[8.5px] font-mono text-secondary-foreground">assumption</span>{' '}
                {assumption.label}
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">{copy.route.footerNote}</p>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
      >
        {copy.route.confirm}
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-xl">
            <div className="text-sm font-bold text-foreground">{copy.route.confirm}?</div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{copy.route.footerNote}</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent">
                {copy.resume.cancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  postMessage({ type: 'confirmIdeaRoute', ideaId: idea.id, revision: idea.ideaRevision });
                  setConfirming(false);
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {copy.route.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeliveryPanel({ idea, language }: { idea: IdeaSummary; language: IdeasLanguage }) {
  const copy = ideasCopy(language);
  return (
    <div className="space-y-2">
      {idea.children.map((child) => (
        <div key={child.epicId} className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11.5px] font-semibold text-foreground">{copy.delivery.title(child.recipeId)}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {child.epicId} · {copy.delivery.childStatus}: {child.runStatus}
              </div>
            </div>
            <button
              type="button"
              onClick={() => postMessage({
                type: 'reviewCanvasStep',
                runId: child.epicId,
                stepIdx: child.canvasStepIdx ?? 0,
              })}
              className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {copy.delivery.openCanvas}
            </button>
          </div>
        </div>
      ))}
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

function ConfirmModal({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-xl">
        <div className="text-sm font-bold text-foreground">{title}</div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{body}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
