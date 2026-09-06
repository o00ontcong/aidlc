/* The Discover tab proper: one toolbar, two ways of working on the same
 * files (by step, or by document), plus the review surfaces an agent run
 * needs — a diff and a checks list.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, PanelRight, Play, RefreshCw, Rocket, Upload } from 'lucide-react';
import type { ContextProposal, DiscoverEpicSuggestion, DiscoverStepId, DiscoverSummary, ProjectContextHead } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { useHostAction } from '@/hooks/useHostAction';
import { discoverCopy, type DiscoverLanguage } from '@/lib/discoverI18n';
import { AgentPanel } from './AgentPanel';
import { DiffView } from './DiffView';
import { ContextProposalReview, reviewWorthyProposals } from './ContextProposalReview';
import { DocsMode } from './DocsMode';
import { MarkdownLite } from './MarkdownLite';
import { RawMarkdownPane } from './RawMarkdownPane';
import { HandoffPanel } from './HandoffPanel';
import { StepStatusView, stepHasStatusView } from './StepStatusView';
import { DiscoverPublishContextModal } from './DiscoverPublishContextModal';
import { DISCOVER_RAIL_DEFAULT_WIDTH, DISCOVER_RAIL_MAX_WIDTH, DISCOVER_RAIL_MIN_WIDTH, StepRail } from './StepRail';
import { docsForStep } from './lib';
import { cn } from '@/lib/utils';

type Mode = 'pipeline' | 'docs' | 'checks';
type StepPane = 'raw' | 'preview';

function clampRailWidth(value: number): number {
  return Math.max(DISCOVER_RAIL_MIN_WIDTH, Math.min(DISCOVER_RAIL_MAX_WIDTH, Math.round(value)));
}

export function DiscoverWorkspace({
  discover, contextProposals, contextHead, language, savedRailWidth, savedAgentPanelOpen,
}: {
  discover: DiscoverSummary;
  contextProposals: ContextProposal[];
  contextHead?: ProjectContextHead;
  language: DiscoverLanguage;
  savedRailWidth?: number;
  savedAgentPanelOpen?: boolean;
}) {
  const copy = discoverCopy(language);
  const [mode, setMode] = useState<Mode>('pipeline');
  const [viewing, setViewing] = useState<DiscoverStepId>(discover.currentStep);
  const [pane, setPane] = useState<StepPane>('preview');
  const [diffOpen, setDiffOpen] = useState(false);
  const [proposalReviewOpen, setProposalReviewOpen] = useState(false);
  const [publishContextOpen, setPublishContextOpen] = useState(false);
  const proposalsAwaitingReview = reviewWorthyProposals(contextProposals);
  const [agentPanelOpen, setAgentPanelOpen] = useState(savedAgentPanelOpen === true);
  const [railWidth, setRailWidth] = useState(() => {
    if (typeof savedRailWidth !== 'number' || !Number.isFinite(savedRailWidth)) {
      return DISCOVER_RAIL_DEFAULT_WIDTH;
    }
    return clampRailWidth(savedRailWidth);
  });
  const { pending: actionPending, run: runAction, isPending } = useHostAction();

  const persistAgentPanel = (open: boolean) => {
    setAgentPanelOpen(open);
    postMessage({ type: 'persistDiscoverUi', discoverView: { agentPanelOpen: open } });
  };

  // Follow workflow moves only (agent Keep / advance). Rail clicks are local
  // navigation — writing currentStep on every click bumped revision + refreshed
  // the whole workspace and yanked the view around.
  const syncedCurrentStep = useRef(discover.currentStep);
  useEffect(() => {
    if (discover.currentStep === syncedCurrentStep.current) { return; }
    syncedCurrentStep.current = discover.currentStep;
    setViewing(discover.currentStep);
  }, [discover.currentStep]);

  const step = discover.steps.find((s) => s.id === viewing) ?? discover.steps[0]!;
  const active = discover.activeRun;
  const suggestions = discover.epicSuggestions ?? [];
  const contextTone = discover.context.status === 'ready'
    ? 'border-success/50 bg-success/10 text-success'
    : discover.context.status === 'conflict'
      ? 'border-destructive/50 bg-destructive/10 text-destructive'
      : discover.context.status === 'stale'
        ? 'border-warning/50 bg-warning/10 text-warning'
        : 'border-border text-muted-foreground';
  const publishDisabled = discover.context.status === 'ready';
  const publishTitle = publishDisabled
    ? copy.publishContextModal.publishDisabledReady
    : discover.context.nextAction;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <h1 className="truncate text-[13px] font-bold text-foreground">{discover.title}</h1>
        <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{discover.docsRoot}/</code>

        <div className="flex overflow-hidden rounded-md border border-border">
          {(['pipeline', 'docs'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              title={m === 'pipeline' ? copy.hints.showPipeline : copy.hints.showDocs}
              className={`px-2.5 py-1 text-[11px] transition ${
                mode === m ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {m === 'pipeline' ? copy.modePipeline : copy.modeDocs}
            </button>
          ))}
        </div>

        <span className="ml-auto flex items-center gap-1.5">
          <span
            title={discover.context.nextAction}
            className={cn(
              'inline-flex h-[26px] items-center rounded-md border px-2 text-[11px] font-semibold',
              contextTone,
              !discover.context.title && 'font-mono',
            )}
          >
            Context · {discover.context.status}{discover.context.title
              ? ` · ${discover.context.title}`
              : discover.context.discoverRevision
                ? ` · ${discover.context.discoverRevision}`
                : ''}
          </span>
          <button
            type="button"
            onClick={() => { if (!publishDisabled) { setPublishContextOpen(true); } }}
            disabled={publishDisabled}
            data-tour-id="discover-publish-context"
            title={publishTitle}
            className={cn(
              'inline-flex h-[26px] items-center gap-1 rounded-md border px-2 text-[11px] font-semibold transition',
              publishDisabled
                ? 'cursor-not-allowed border-border bg-muted/40 text-muted-foreground opacity-60'
                : 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20',
            )}
          >
            <Upload className="h-3 w-3" />Publish context
          </button>
          <button
            type="button"
            onClick={() => runAction(() => postMessage({ type: 'commitDiscoverChanges' }), 'commit')}
            disabled={actionPending}
            title={copy.hints.commitAll}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition disabled:cursor-wait disabled:opacity-70',
              discover.hasUncommittedChanges
                ? 'border-primary bg-primary font-semibold text-primary-foreground hover:bg-primary/90'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {isPending('commit') ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {isPending('commit') ? 'Committing…' : copy.commitAll}
            {!isPending('commit') && discover.hasUncommittedChanges && (
              <span className="rounded bg-primary-foreground/20 px-1 text-[10px] font-semibold">
                {discover.uncommittedChangeCount ?? 0}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === 'checks' ? 'pipeline' : 'checks')}
            title={copy.hints.showChecks}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition ${
              suggestions.length
                ? 'border-warning/50 bg-warning/10 text-warning hover:bg-warning/20'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {suggestions.length > 0 && <AlertTriangle className="h-3 w-3" />}
            {copy.checks} {suggestions.length}
          </button>
          <button
            type="button"
            onClick={() => runAction(() => postMessage({ type: 'reloadDiscover' }), 'reload')}
            disabled={actionPending}
            title={copy.hints.reloadDocs}
            aria-label={copy.reload}
            className="rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-wait disabled:opacity-70"
          >
            <RefreshCw className={cn('h-3 w-3', isPending('reload') && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={() => postMessage({ type: 'openDiscoverDoc', docPath: step.files[0] })}
            title={copy.hints.openCurrentDoc}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />{copy.openInEditor}
          </button>
          <button
            type="button"
            onClick={() => persistAgentPanel(!agentPanelOpen)}
            title={agentPanelOpen ? copy.hints.hideAgentPanel : copy.hints.showAgentPanel}
            aria-pressed={agentPanelOpen}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition ${
              agentPanelOpen
                ? 'border-primary bg-primary/10 font-semibold text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <PanelRight className="h-3 w-3" />{copy.agent}
          </button>
          <button
            type="button"
            onClick={() => runAction(() => postMessage({ type: 'runDiscoverPipeline' }), 'pipeline')}
            disabled={actionPending}
            title={copy.hints.runPipeline}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
          >
            {isPending('pipeline') ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            {isPending('pipeline') ? 'Starting…' : copy.runPipeline}
          </button>
        </span>
      </header>

      {active && (
        <div className="flex flex-wrap items-center gap-2 border-b border-warning/40 bg-warning/10 px-4 py-1.5 text-[11px] text-warning">
          <span className="font-semibold">
            {active.run.kind === 'edit' ? copy.editBanner(active.run.id, active.run.mode) : copy.runBanner(active.run.id, active.run.mode)}
          </span>
          {active.run.kind === 'scan' && (
            <>
              <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">{copy.scanPassBadge(active.run.scanPass)}</span>
              {active.run.sourceSnapshot?.repos.map((repo) => (
                <span key={repo.path} title={`Scan base: ${repo.path} · ${repo.ref} · ${repo.head || 'uncommitted'}`} className="font-mono text-[10px] text-warning/90">
                  {repo.path}@{repo.head ? repo.head.slice(0, 8) : 'uncommitted'}
                </span>
              ))}
            </>
          )}
          <span>
            +{active.added.length} ~{active.updated.length} −{active.removed.length}
          </span>
          <span className="ml-auto flex gap-2">
            <button type="button" title={copy.hints.showDiff} onClick={() => setDiffOpen(true)} className="rounded border border-warning/50 px-2 py-0.5 hover:bg-warning/20">{copy.viewDiff}</button>
            <button
              type="button"
              title={copy.hints.keepRun}
              disabled={actionPending}
              onClick={() => runAction(() => postMessage({ type: 'keepDiscoverRun', runId: active.run.id }), 'keep')}
              className="inline-flex items-center gap-1 rounded border border-warning/50 px-2 py-0.5 hover:bg-warning/20 disabled:cursor-wait disabled:opacity-70"
            >
              {isPending('keep') && <Loader2 className="h-3 w-3 animate-spin" />}
              {isPending('keep') ? 'Keeping…' : copy.keep}
            </button>
            <button
              type="button"
              title={copy.hints.revertRun}
              disabled={actionPending}
              onClick={() => runAction(() => postMessage({ type: 'revertDiscoverRun', runId: active.run.id }), 'revert')}
              className="inline-flex items-center gap-1 rounded border border-warning/50 px-2 py-0.5 hover:bg-warning/20 disabled:cursor-wait disabled:opacity-70"
            >
              {isPending('revert') && <Loader2 className="h-3 w-3 animate-spin" />}
              {isPending('revert') ? 'Reverting…' : copy.revert}
            </button>
          </span>
        </div>
      )}

      {proposalsAwaitingReview.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-primary/40 bg-primary/5 px-4 py-1.5 text-[11px] text-primary">
          <span className="font-semibold">
            {proposalsAwaitingReview.length} context proposal{proposalsAwaitingReview.length === 1 ? '' : 's'} waiting for review
          </span>
          <button type="button" data-tour-id="context-proposal-review" onClick={() => setProposalReviewOpen(true)} className="ml-auto rounded border border-primary/50 px-2 py-0.5 hover:bg-primary/10">
            Review
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {mode === 'checks' && <ChecksView discover={discover} copy={copy} onBack={() => setMode('pipeline')} />}
        {mode === 'docs' && <DocsMode discover={discover} copy={copy} />}
        {mode === 'pipeline' && (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <StepRail
              discover={discover}
              viewing={viewing}
              copy={copy}
              width={railWidth}
              onWidthChange={setRailWidth}
              onWidthCommit={(next) => {
                setRailWidth(next);
                postMessage({ type: 'persistDiscoverUi', discoverView: { railWidth: next } });
              }}
              onSelect={(id) => {
                setViewing(id);
              }}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <StepDetail discover={discover} stepId={viewing} pane={pane} copy={copy} onPane={setPane} />
            </div>
            {agentPanelOpen && (
              <div className="flex min-h-0 shrink-0 flex-col overflow-hidden" style={{ width: 'clamp(186px, 21vw, 262px)' }}>
                <AgentPanel
                  discover={discover}
                  copy={copy}
                  onOpenDiff={() => setDiffOpen(true)}
                  onClose={() => persistAgentPanel(false)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {diffOpen && <DiffView discover={discover} copy={copy} onClose={() => setDiffOpen(false)} />}
      {proposalReviewOpen && (
        <ContextProposalReview proposals={contextProposals} contextHead={contextHead} onClose={() => setProposalReviewOpen(false)} />
      )}
      {publishContextOpen && (
        <DiscoverPublishContextModal
          language={language}
          history={discover.context.publishHistory ?? []}
          publishDiff={discover.context.publishDiff}
          onClose={() => setPublishContextOpen(false)}
        />
      )}
    </div>
  );
}

function StepDetail({
  discover, stepId, pane, copy, onPane,
}: {
  discover: DiscoverSummary;
  stepId: DiscoverStepId;
  pane: StepPane;
  copy: ReturnType<typeof discoverCopy>;
  onPane: (pane: StepPane) => void;
}) {
  const step = discover.steps.find((s) => s.id === stepId)!;
  const docs = docsForStep(discover, stepId);
  const { pending, run } = useHostAction();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <header className="mb-2">
          <p className="text-[9.5px] font-bold tracking-[0.09em] text-muted-foreground">{copy.selectedStep}</p>
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-bold text-foreground">{step.order} · {copy.stepTitle(step)}</h2>
            {step.files.map((file) => (
              <code key={file} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{file}</code>
            ))}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{step.goal}</p>
        </header>

        <div className="mb-2 flex gap-1">
          {(['preview', 'raw'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPane(p)}
              title={p === 'raw' ? copy.hints.showRaw : copy.hints.showPreview}
              className={`rounded border px-2 py-0.5 text-[10.5px] transition ${
                pane === p ? 'border-border bg-secondary font-semibold text-foreground' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {p === 'raw' ? copy.viewMarkdown : copy.viewPreview}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {stepId === 'skeleton' && (
            <HandoffPanel discover={discover} copy={copy} />
          )}
          {docs.map((doc) => (
            <div key={doc.path} className="space-y-2">
              {docs.length > 1 && (
                <p className="font-mono text-[10px] text-muted-foreground">{doc.path}</p>
              )}
              {pane === 'raw' && <RawMarkdownPane doc={doc} revision={discover.revision} copy={copy} />}
              {pane === 'preview' && stepHasStatusView(stepId) && (
                <StepStatusView discover={discover} stepId={stepId} copy={copy} doc={doc} />
              )}
              {pane === 'preview' && !stepHasStatusView(stepId) && (
                <div className="rounded-md border border-border bg-card px-3 py-1"><MarkdownLite source={doc.raw} /></div>
              )}
            </div>
          ))}
          {stepId === 'plan' && (
            <HandoffPanel discover={discover} copy={copy} />
          )}
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => postMessage({ type: 'runDiscoverStep', step: stepId }))}
          title={copy.hints.runStep}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          {pending ? 'Starting…' : copy.runStep}
        </button>
      </footer>
    </div>
  );
}

function ChecksView({
  discover, copy, onBack,
}: { discover: DiscoverSummary; copy: ReturnType<typeof discoverCopy>; onBack: () => void }) {
  const suggestions = discover.epicSuggestions ?? [];
  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      <header className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-bold text-foreground">{copy.checks} · {suggestions.length}</h2>
        <button type="button" title={copy.hints.back} onClick={onBack} className="ml-auto rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent">{copy.back}</button>
      </header>
      <p className="mb-4 text-[11px] leading-relaxed text-muted-foreground">{copy.checksHint}</p>
      {suggestions.length === 0 && <p className="text-xs text-success">{copy.checksEmpty}</p>}
      <ul className="space-y-3">
        {suggestions.map((s) => (
          <SuggestionCard key={s.id} suggestion={s} copy={copy} />
        ))}
      </ul>
    </div>
  );
}

function SuggestionCard({ suggestion, copy }: { suggestion: DiscoverEpicSuggestion; copy: ReturnType<typeof discoverCopy> }) {
  const levelClass = suggestion.level === 'error'
    ? 'border-destructive/40 bg-destructive/5'
    : suggestion.level === 'warn'
      ? 'border-warning/40 bg-warning/5'
      : 'border-border bg-card';
  const { pending, run } = useHostAction();
  return (
    <li className={`overflow-hidden rounded-lg border ${levelClass}`}>
      <header className="flex flex-wrap items-start gap-2 border-b border-border/50 px-3 py-2">
        <code className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground">
          {copy.suggestionKind(suggestion.kind)}
        </code>
        <span className="min-w-0 flex-1 text-[11.5px] font-semibold text-foreground">{suggestion.title}</span>
        <code className="shrink-0 rounded border border-border bg-secondary/60 px-1.5 font-mono text-[9px] text-muted-foreground">
          {suggestion.recipeId.replace('cofofo-', '')}
        </code>
      </header>
      <div className="space-y-1.5 px-3 py-2">
        <p className="text-[11px] text-foreground">{suggestion.summary}</p>
        {suggestion.details.length > 0 && (
          <ul className="space-y-0.5 border-l-2 border-border/60 pl-2.5">
            {suggestion.details.map((d, i) => (
              <li key={i} className="text-[10.5px] text-muted-foreground">{d}</li>
            ))}
          </ul>
        )}
        {suggestion.docFile && (
          <button
            type="button"
            onClick={() => postMessage({ type: 'openDiscoverDoc', docPath: suggestion.docFile! })}
            title={copy.hints.openDoc(suggestion.docFile)}
            className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
          >
            {copy.openInEditor}: {suggestion.docFile}
          </button>
        )}
      </div>
      <footer className="flex justify-end border-t border-border/40 px-3 py-1.5">
        <button
          type="button"
          disabled={pending}
          title={copy.hints.createEpic}
          onClick={() => run(() => postMessage({ type: 'scaffoldEpicFromSuggestion', suggestionId: suggestion.id }))}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
          {pending ? 'Starting…' : copy.startEpicFromCheck}
        </button>
      </footer>
    </li>
  );
}
