import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleCheck,
  FileCheck2,
  HelpCircle,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

import type { ShapeSummary, WorkspaceState } from '@/lib/types';
import { cn } from '@/lib/utils';
import { onHostMessage, postMessage } from '@/lib/bridge';
import {
  discoveryCopy,
  translateDiscoveryBlocker,
  type DiscoveryLanguage,
} from '@/lib/discoveryI18n';

interface Props {
  state: WorkspaceState;
  selectedShapeId?: string;
  onSelectShape: (shapeId: string) => void;
}

export function DiscoveryView({ state, selectedShapeId, onSelectShape }: Props) {
  const [creating, setCreating] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const selected = state.shapes.find((shape) => shape.id === selectedShapeId) ?? state.shapes[0];
  const language = state.displayLanguage;
  const copy = discoveryCopy(language);

  useEffect(() => {
    if (selected && selected.id !== selectedShapeId) onSelectShape(selected.id);
  }, [selected, selectedShapeId, onSelectShape]);

  const currentStep = discoveryProgress(selected);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{copy.eyebrow}</div>
              <h1 className="mt-1 text-xl font-bold text-foreground">{copy.title}</h1>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">{copy.subtitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setGuideOpen((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent"
            >
              <HelpCircle className="h-3.5 w-3.5 text-primary" />
              {guideOpen ? copy.closeGuide : copy.howItWorks}
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              disabled={state.foundation?.status !== 'ready'}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> {copy.startIdea}
            </button>
          </div>
        </div>

        <ProgressSteps language={language} current={currentStep} />
        {guideOpen && (
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="text-xs font-bold text-foreground">{copy.guideTitle}</div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{copy.guideBody}</p>
          </div>
        )}
        <FoundationCard state={state} language={language} />
      </section>

      {creating && <CreateIdeaWizard language={language} onClose={() => setCreating(false)} />}

      <div className="grid min-h-[470px] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-xs font-bold text-foreground">{copy.ideasTitle}</div>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">{copy.ideasSubtitle}</p>
          </div>
          {state.shapes.length === 0 ? (
            <div className="p-5 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <div className="mt-2 text-xs font-semibold text-foreground">{copy.noIdeasTitle}</div>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">{copy.noIdeasBody}</p>
              <button
                type="button"
                onClick={() => setCreating(true)}
                disabled={state.foundation?.status !== 'ready'}
                className="mt-3 rounded-md bg-primary px-3 py-2 text-[10.5px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                {copy.startIdea}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {state.shapes.map((shape) => (
                <button
                  key={shape.id}
                  type="button"
                  onClick={() => onSelectShape(shape.id)}
                  className={cn(
                    'w-full px-4 py-3 text-left transition-colors hover:bg-accent/60',
                    selected?.id === shape.id && 'bg-primary/5',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={shape.status} language={language} />
                    <span className="text-[9.5px] text-muted-foreground">{formatUpdated(shape.updatedAt, language)}</span>
                  </div>
                  <div className="mt-1.5 line-clamp-2 text-xs font-semibold leading-relaxed text-foreground">{shape.title}</div>
                </button>
              ))}
            </div>
          )}
        </aside>
        <section className="rounded-xl border border-border bg-card">
          {selected
            ? <ShapeDetail shape={selected} language={language} />
            : <EmptyDetail language={language} />}
        </section>
      </div>
    </div>
  );
}

function ProgressSteps({ language, current }: { language: DiscoveryLanguage; current: number }) {
  const copy = discoveryCopy(language);
  return (
    <div className="mt-5 grid gap-2 sm:grid-cols-4">
      {copy.steps.map((step, index) => {
        const complete = index < current;
        const active = index === current;
        return (
          <div
            key={step.label}
            className={cn(
              'rounded-lg border px-3 py-2.5',
              complete && 'border-success/25 bg-success/5',
              active && 'border-primary/30 bg-primary/5',
              !complete && !active && 'border-border bg-background/50',
            )}
          >
            <div className="flex items-center gap-2">
              <span className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold',
                complete ? 'bg-success text-white' : active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground',
              )}>
                {complete ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className="text-[10.5px] font-bold text-foreground">{step.label}</span>
            </div>
            <p className="mt-1 pl-7 text-[9.5px] leading-relaxed text-muted-foreground">{step.description}</p>
          </div>
        );
      })}
    </div>
  );
}

function FoundationCard({ state, language }: { state: WorkspaceState; language: DiscoveryLanguage }) {
  const copy = discoveryCopy(language);
  const foundation = state.foundation;
  const ready = foundation?.status === 'ready';
  const stale = foundation?.status === 'stale';
  const status = ready ? copy.contextReady : stale ? copy.contextNeedsUpdate : copy.contextNeedsSetup;
  const body = ready ? copy.contextReadyBody : stale ? copy.contextUpdateBody : copy.contextSetupBody;

  return (
    <div className={cn('mt-4 rounded-lg border p-3.5', ready ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <FileCheck2 className="h-3.5 w-3.5 text-primary" />
            {copy.contextTitle}
            <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] uppercase', ready ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning')}>
              {status}
            </span>
          </div>
          <p className="mt-1 text-[10.5px] text-muted-foreground">{body}</p>
          {foundation && (
            <details className="mt-2 text-[10px] text-muted-foreground">
              <summary className="cursor-pointer font-semibold hover:text-foreground">{copy.technicalDetails}</summary>
              <div className="mt-1.5 space-y-1 pl-2 font-mono">
                <div>{copy.revision}: {foundation.revision ?? 0}</div>
                {foundation.sourceCommit && <div>{copy.sourceCommit}: {foundation.sourceCommit.slice(0, 10)}</div>}
              </div>
            </details>
          )}
        </div>
        <div className="flex gap-2">
          {state.projectWorkspace && !state.projectWorkspace.initialized && (
            <button
              type="button"
              onClick={() => postMessage({ type: 'initializeProjectWorkspace' })}
              className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[10.5px] font-semibold text-foreground hover:bg-accent"
            >
              {copy.createContext}
            </button>
          )}
          {!ready && (
            <button
              type="button"
              onClick={() => postMessage({ type: 'publishFoundation' })}
              disabled={state.projectWorkspace !== undefined && !state.projectWorkspace.initialized}
              className="rounded-md bg-primary px-2.5 py-1.5 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {stale ? copy.updateContext : copy.prepareContext}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateIdeaWizard({ language, onClose }: { language: DiscoveryLanguage; onClose: () => void }) {
  const copy = discoveryCopy(language);
  const [step, setStep] = useState(0);
  const [problem, setProblem] = useState('');
  const [desiredOutcome, setDesiredOutcome] = useState('');
  const [effortIndex, setEffortIndex] = useState(1);
  const [title, setTitle] = useState('');
  const canContinue = step === 0 ? Boolean(problem.trim()) : step === 1 ? Boolean(desiredOutcome.trim()) : true;

  const submit = () => {
    postMessage({
      type: 'createShape',
      title: title.trim() || suggestedTitle(desiredOutcome, problem),
      problem,
      desiredOutcome,
      appetite: copy.efforts[effortIndex].value,
    });
    onClose();
  };

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-foreground">{copy.wizard.title}</div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            {copy.wizard.step} {step + 1} / 3
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-[11px] font-semibold text-muted-foreground hover:text-foreground">
          {copy.wizard.cancel}
        </button>
      </div>

      <div className="mt-4 h-1 overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-primary transition-all" style={{ width: `${((step + 1) / 3) * 100}%` }} />
      </div>

      <div className="mt-5 max-w-3xl">
        {step === 0 && (
          <WizardQuestion title={copy.wizard.problemTitle} help={copy.wizard.problemHelp}>
            <textarea
              autoFocus
              value={problem}
              onChange={(event) => setProblem(event.target.value)}
              placeholder={copy.wizard.problemPlaceholder}
              className="mt-3 min-h-28 w-full resize-y rounded-lg border border-border bg-background p-3 text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </WizardQuestion>
        )}
        {step === 1 && (
          <WizardQuestion title={copy.wizard.outcomeTitle} help={copy.wizard.outcomeHelp}>
            <textarea
              autoFocus
              value={desiredOutcome}
              onChange={(event) => setDesiredOutcome(event.target.value)}
              placeholder={copy.wizard.outcomePlaceholder}
              className="mt-3 min-h-28 w-full resize-y rounded-lg border border-border bg-background p-3 text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </WizardQuestion>
        )}
        {step === 2 && (
          <WizardQuestion title={copy.wizard.effortTitle} help={copy.wizard.effortHelp}>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {copy.efforts.map((effort, index) => (
                <button
                  key={effort.label}
                  type="button"
                  onClick={() => setEffortIndex(index)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    effortIndex === index ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-accent',
                  )}
                >
                  <div className="text-[11px] font-bold text-foreground">{effort.label}</div>
                  <p className="mt-1 text-[9.5px] leading-relaxed text-muted-foreground">{effort.description}</p>
                </button>
              ))}
            </div>
            <label className="mt-4 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {copy.wizard.shortName}
              <span className="ml-1 font-normal normal-case">— {copy.wizard.shortNameHelp}</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={copy.wizard.shortNamePlaceholder}
                className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </label>
          </WizardQuestion>
        )}
      </div>

      <div className="mt-5 flex gap-2">
        {step > 0 && (
          <button type="button" onClick={() => setStep((value) => value - 1)} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent">
            <ArrowLeft className="h-3.5 w-3.5" /> {copy.wizard.back}
          </button>
        )}
        <button
          type="button"
          disabled={!canContinue}
          onClick={() => step < 2 ? setStep((value) => value + 1) : submit()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {step < 2 ? copy.wizard.continue : copy.wizard.start}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}

function WizardQuestion({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{help}</p>
      {children}
    </div>
  );
}

function ShapeDetail({ shape, language }: { shape: ShapeSummary; language: DiscoveryLanguage }) {
  const copy = discoveryCopy(language);
  const [editing, setEditing] = useState(false);
  const [proposalStatus, setProposalStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(shape.proposalDraft ? 'ready' : 'idle');
  const [generatedProposal, setGeneratedProposal] = useState<Record<string, unknown> | null>(shape.proposalDraft ?? null);
  const [proposalError, setProposalError] = useState('');
  const [draft, setDraft] = useState(() => toDraft(shape));

  useEffect(() => {
    setDraft(toDraft(shape));
    setEditing(false);
    setProposalStatus(shape.proposalDraft ? 'ready' : 'idle');
    setGeneratedProposal(shape.proposalDraft ?? null);
    setProposalError('');
  }, [shape.id, shape.revision, shape.proposalDraft]);

  useEffect(() => onHostMessage((message) => {
    if (message.shapeId !== shape.id) return;
    if (message.type === 'shapeProposalStarted') {
      setProposalStatus('loading');
      setProposalError('');
    }
    if (message.type === 'shapeProposalReady' && Number(message.revision) === shape.revision) {
      const proposal = message.proposal;
      if (proposal && typeof proposal === 'object' && !Array.isArray(proposal)) {
        setGeneratedProposal(proposal as Record<string, unknown>);
        setProposalStatus('ready');
      }
    }
    if (message.type === 'shapeProposalError') {
      setProposalStatus('error');
      setProposalError(typeof message.message === 'string' ? message.message : 'Unknown error');
    }
    if (message.type === 'shapeProposalApplied') {
      setProposalStatus('idle');
      setGeneratedProposal(null);
    }
  }), [shape.id, shape.revision]);

  const canEdit = shape.status !== 'converted' && shape.status !== 'shelved';
  const canMarkReady = shape.status === 'exploring';
  const isReady = shape.readinessBlockers.length === 0;

  const save = () => {
    postMessage({ type: 'updateShape', shapeId: shape.id, revision: shape.revision, patch: fromDraft(draft) });
  };
  const generateProposal = () => {
    setProposalStatus('loading');
    setGeneratedProposal(null);
    setProposalError('');
    postMessage({ type: 'generateShapeProposal', shapeId: shape.id, revision: shape.revision });
  };
  const applyProposal = () => {
    if (!generatedProposal) return;
    postMessage({
      type: 'applyGeneratedShapeProposal',
      shapeId: shape.id,
      revision: shape.revision,
      proposal: generatedProposal,
    });
  };
  const discussProposal = () => {
    if (!generatedProposal) return;
    postMessage({
      type: 'openShapeProposalDiscussion',
      shapeId: shape.id,
      revision: shape.revision,
      proposal: generatedProposal,
    });
  };
  const discardProposal = () => {
    setProposalStatus('idle');
    setGeneratedProposal(null);
    postMessage({ type: 'discardGeneratedShapeProposal', shapeId: shape.id });
  };

  return (
    <div className="p-5">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <StatusBadge status={shape.status} language={language} />
          <h2 className="mt-2 text-lg font-bold text-foreground">{shape.title}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <button type="button" onClick={() => setEditing((value) => !value)} className="rounded-md border border-border bg-background px-3 py-2 text-[10.5px] font-semibold text-foreground hover:bg-accent">
              {editing ? copy.closeEditor : copy.editAnswers}
            </button>
          )}
        </div>
      </div>

      <ProgressSteps language={language} current={discoveryProgress(shape)} />

      {canEdit && proposalStatus === 'idle' && (
        <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3.5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-foreground">{copy.suggestPlan}</div>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{copy.suggestPlanHelp}</p>
              <button type="button" onClick={generateProposal} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90">
                <Sparkles className="h-3.5 w-3.5" /> {copy.suggestPlan}
              </button>
            </div>
          </div>
        </div>
      )}

      {canEdit && proposalStatus === 'loading' && (
        <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <div className="text-[11px] font-bold text-foreground">{copy.generatingPlan}</div>
              <p className="mt-1 text-[10px] text-muted-foreground">{copy.generatingPlanHelp}</p>
            </div>
          </div>
        </div>
      )}

      {canEdit && proposalStatus === 'error' && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="text-[11px] font-bold text-destructive">{copy.generationError}</div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{copy.generationErrorBody}</p>
          {proposalError && (
            <details className="mt-2 text-[9.5px] text-muted-foreground">
              <summary className="cursor-pointer">{copy.technicalDetails}</summary>
              <div className="mt-1 rounded bg-background p-2 font-mono">{proposalError}</div>
            </details>
          )}
          <button type="button" onClick={generateProposal} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-[10.5px] font-semibold text-foreground hover:bg-accent">
            <RotateCcw className="h-3.5 w-3.5" /> {copy.tryAgain}
          </button>
        </div>
      )}

      {canEdit && proposalStatus === 'ready' && generatedProposal && (
        <div className="mt-4 rounded-lg border border-success/30 bg-success/5 p-4">
          <div className="flex items-center gap-2 text-[11px] font-bold text-success">
            <CircleCheck className="h-4 w-4" /> {copy.proposalReady}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{copy.proposalReadyBody}</p>
          <div className="mt-4 rounded-lg border border-border bg-background p-4">
            <div className="text-xs font-bold text-foreground">{copy.proposalPreview}</div>
            <ShapeReadView shape={mergeShapeProposal(shape, generatedProposal)} language={language} hideTitle />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={applyProposal} className="inline-flex items-center gap-1.5 rounded-md bg-success px-3 py-2 text-[10.5px] font-semibold text-white hover:bg-success/90">
              <Check className="h-3.5 w-3.5" /> {copy.applyProposal}
            </button>
            <button type="button" onClick={discussProposal} className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-[10.5px] font-semibold text-primary hover:bg-primary/15">
              <MessageSquare className="h-3.5 w-3.5" /> {copy.discussProposal}
            </button>
            <button type="button" onClick={discardProposal} className="rounded-md border border-border bg-background px-3 py-2 text-[10.5px] font-semibold text-foreground hover:bg-accent">
              {copy.discardProposal}
            </button>
          </div>
        </div>
      )}

      {proposalStatus !== 'ready' && shape.readinessBlockers.length > 0 && shape.status !== 'converted' ? (
        <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3.5">
          <div className="text-[11px] font-bold text-warning">{copy.planNeedsWork}</div>
          <p className="mt-1 text-[10px] text-muted-foreground">{copy.planNeedsWorkBody}</p>
          <ul className="mt-2.5 space-y-2">
            {shape.readinessBlockers.map((blocker) => (
              <li key={blocker} className="flex gap-2 text-[10.5px] leading-relaxed text-foreground">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                {translateDiscoveryBlocker(blocker, language)}
              </li>
            ))}
          </ul>
        </div>
      ) : shape.status === 'exploring' ? (
        <div className="mt-4 rounded-lg border border-success/30 bg-success/5 p-3.5">
          <div className="flex items-center gap-2 text-[11px] font-bold text-success"><CircleCheck className="h-4 w-4" /> {copy.planReady}</div>
          <p className="mt-1 text-[10px] text-muted-foreground">{copy.planReadyBody}</p>
        </div>
      ) : null}

      {editing
        ? <ShapeEditor draft={draft} language={language} onChange={setDraft} onSave={save} onCancel={() => { setDraft(toDraft(shape)); setEditing(false); }} />
        : proposalStatus !== 'ready' ? <ShapeReadView shape={shape} language={language} /> : null}

      <details className="mt-5 border-t border-border pt-4 text-[10px] text-muted-foreground">
        <summary className="cursor-pointer font-semibold hover:text-foreground">{copy.technicalDetails}</summary>
        <div className="mt-2 rounded-md bg-secondary/40 p-3 font-mono leading-relaxed">
          <div>ID: {shape.id}</div>
          <div>{copy.revision}: {shape.revision}</div>
          <div>Foundation: r{shape.foundationRevision} · {shape.foundationHash.slice(0, 10)}</div>
        </div>
      </details>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        {proposalStatus !== 'ready' && canMarkReady && isReady && (
          <button type="button" onClick={() => postMessage({ type: 'markShapeReady', shapeId: shape.id, revision: shape.revision })} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90">
            <Check className="h-3.5 w-3.5" /> {copy.checkPlan}
          </button>
        )}
        {shape.status === 'ready' && (
          <button type="button" onClick={() => postMessage({ type: 'acceptShape', shapeId: shape.id, revision: shape.revision })} className="inline-flex items-center gap-1.5 rounded-md bg-success px-3 py-2 text-[10.5px] font-semibold text-white hover:bg-success/90">
            <Check className="h-3.5 w-3.5" /> {copy.approvePlan}
          </button>
        )}
        {shape.status === 'accepted' && (
          <button type="button" onClick={() => postMessage({ type: 'convertShapeStartEpic', shapeId: shape.id })} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90">
            {copy.startWork} <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
        {shape.status === 'converted' && (
          <span className="rounded-md bg-success/10 px-3 py-2 text-[10.5px] font-semibold text-success">{copy.workStarted}: {shape.convertedEpicId}</span>
        )}
        {(shape.status === 'ready' || shape.status === 'accepted' || shape.status === 'shelved') && (
          <button type="button" onClick={() => postMessage({ type: 'reopenShape', shapeId: shape.id, revision: shape.revision })} className="rounded-md border border-border bg-background px-3 py-2 text-[10.5px] font-semibold text-foreground hover:bg-accent">
            {copy.reopen}
          </button>
        )}
        {canEdit && (
          <button type="button" onClick={() => postMessage({ type: 'shelveShape', shapeId: shape.id, revision: shape.revision })} className="rounded-md border border-border bg-background px-3 py-2 text-[10.5px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground">
            {copy.setAside}
          </button>
        )}
      </div>
    </div>
  );
}

function ShapeReadView({ shape, language, hideTitle = false }: { shape: ShapeSummary; language: DiscoveryLanguage; hideTitle?: boolean }) {
  const copy = discoveryCopy(language);
  const items = [
    [copy.fields.problem, shape.problem],
    [copy.fields.outcome, shape.desiredOutcome],
    [copy.fields.effort, shape.appetite],
    [copy.fields.approach, shape.selectedApproach],
    [copy.fields.rationale, shape.rationale],
    [copy.fields.architecture, shape.architectureImpact],
  ].filter(([, value]) => Boolean(value));

  return (
    <div className="mt-5">
      {!hideTitle && <div className="text-xs font-bold text-foreground">{copy.summaryTitle}</div>}
      <div className="mt-3 space-y-4">
        {items.map(([label, value]) => (
          <div key={label}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{value}</p>
          </div>
        ))}
        <ListBlock title={copy.fields.constraints} values={shape.constraints} />
        <ListBlock title={copy.fields.noGos} values={shape.noGos} />
        <ListBlock title={copy.fields.acceptance} values={shape.acceptanceCriteria} />
        <ListBlock title={copy.fields.risks} values={shape.risks} />
        <ListBlock title={copy.fields.questions} values={shape.openQuestions} />
        {shape.options.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{copy.fields.options}</div>
            <div className="mt-1.5 space-y-2">
              {shape.options.map((option) => (
                <div key={option.id} className="rounded-md bg-secondary/50 p-2.5">
                  <div className="text-[11px] font-semibold text-foreground">{option.title}</div>
                  <p className="mt-1 text-[10.5px] text-muted-foreground">{option.summary}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ShapeEditor({ draft, language, onChange, onSave, onCancel }: {
  draft: ReturnType<typeof toDraft>;
  language: DiscoveryLanguage;
  onChange: (value: ReturnType<typeof toDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const copy = discoveryCopy(language);
  const update = (key: keyof typeof draft, value: string) => onChange({ ...draft, [key]: value });
  const listLabel = (label: string) => `${label} (${copy.onePerLine})`;

  return (
    <div className="mt-5 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={copy.fields.title} value={draft.title} onChange={(value) => update('title', value)} />
        <Field label={copy.fields.effort} value={draft.appetite} onChange={(value) => update('appetite', value)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={copy.fields.problem} multiline value={draft.problem} onChange={(value) => update('problem', value)} />
        <Field label={copy.fields.outcome} multiline value={draft.desiredOutcome} onChange={(value) => update('desiredOutcome', value)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={copy.fields.approach} multiline value={draft.selectedApproach} onChange={(value) => update('selectedApproach', value)} />
        <Field label={copy.fields.rationale} multiline value={draft.rationale} onChange={(value) => update('rationale', value)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={listLabel(copy.fields.noGos)} multiline value={draft.noGos} onChange={(value) => update('noGos', value)} />
        <Field label={listLabel(copy.fields.acceptance)} multiline value={draft.acceptanceCriteria} onChange={(value) => update('acceptanceCriteria', value)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={listLabel(copy.fields.constraints)} multiline value={draft.constraints} onChange={(value) => update('constraints', value)} />
        <Field label={listLabel(copy.fields.risks)} multiline value={draft.risks} onChange={(value) => update('risks', value)} />
      </div>
      <Field label={copy.fields.architecture} multiline value={draft.architectureImpact} onChange={(value) => update('architectureImpact', value)} />
      <Field label={listLabel(copy.fields.questions)} multiline value={draft.openQuestions} onChange={(value) => update('openQuestions', value)} />
      <div className="flex gap-2">
        <button type="button" onClick={onSave} className="rounded-md bg-primary px-3 py-2 text-[10.5px] font-semibold text-primary-foreground hover:bg-primary/90">{copy.save}</button>
        <button type="button" onClick={onCancel} className="rounded-md border border-border bg-background px-3 py-2 text-[10.5px] font-semibold text-foreground hover:bg-accent">{copy.cancel}</button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, multiline = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const className = 'mt-1.5 w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary';
  return (
    <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
      {label}
      {multiline
        ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={cn(className, 'min-h-20 resize-y leading-relaxed')} />
        : <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={className} />}
    </label>
  );
}

function ListBlock({ title, values }: { title: string; values: string[] }) {
  return values.length ? (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{title}</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-foreground">
        {values.map((value) => <li key={value}>{value}</li>)}
      </ul>
    </div>
  ) : null;
}

function StatusBadge({ status, language }: { status: ShapeSummary['status']; language: DiscoveryLanguage }) {
  const colors: Record<ShapeSummary['status'], string> = {
    draft: 'bg-secondary text-muted-foreground',
    exploring: 'bg-primary/10 text-primary',
    ready: 'bg-warning/10 text-warning',
    accepted: 'bg-success/10 text-success',
    converted: 'bg-success/10 text-success',
    shelved: 'bg-secondary text-muted-foreground',
  };
  return (
    <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase', colors[status])}>
      {discoveryCopy(language).status[status]}
    </span>
  );
}

function EmptyDetail({ language }: { language: DiscoveryLanguage }) {
  const copy = discoveryCopy(language);
  return (
    <div className="flex min-h-80 flex-col items-center justify-center p-6 text-center">
      <MessageSquare className="h-7 w-7 text-muted-foreground/60" />
      <div className="mt-3 text-xs font-semibold text-foreground">{copy.emptyDetailTitle}</div>
      <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-muted-foreground">{copy.emptyDetailBody}</p>
    </div>
  );
}

function discoveryProgress(shape: ShapeSummary | undefined): number {
  if (!shape) return 0;
  if (shape.status === 'converted') return 4;
  if (shape.status === 'accepted') return 3;
  if (shape.status === 'ready') return 2;
  if (shape.selectedApproach && shape.rationale) return 2;
  return 1;
}

function suggestedTitle(outcome: string, problem: string): string {
  const source = outcome.trim() || problem.trim();
  const firstSentence = source.split(/[.!?\n]/)[0]?.trim() || source;
  return firstSentence.length > 72 ? `${firstSentence.slice(0, 69).trimEnd()}…` : firstSentence;
}

function mergeShapeProposal(shape: ShapeSummary, proposal: Record<string, unknown>): ShapeSummary {
  const next: ShapeSummary = { ...shape };
  for (const key of ['title', 'problem', 'desiredOutcome', 'appetite', 'selectedApproach', 'rationale', 'architectureImpact'] as const) {
    if (typeof proposal[key] === 'string') next[key] = proposal[key];
  }
  for (const key of ['constraints', 'risks', 'noGos', 'acceptanceCriteria', 'openQuestions'] as const) {
    if (Array.isArray(proposal[key])) {
      next[key] = proposal[key].filter((item): item is string => typeof item === 'string');
    }
  }
  if (Array.isArray(proposal.options)) {
    next.options = proposal.options.flatMap((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const option = value as Record<string, unknown>;
      return [{
        id: typeof option.id === 'string' ? option.id : `option-${index + 1}`,
        title: typeof option.title === 'string' ? option.title : '',
        summary: typeof option.summary === 'string' ? option.summary : '',
        tradeoffs: Array.isArray(option.tradeoffs)
          ? option.tradeoffs.filter((item): item is string => typeof item === 'string')
          : [],
      }];
    });
  }
  return next;
}

function toDraft(shape: ShapeSummary) {
  return {
    title: shape.title,
    problem: shape.problem,
    desiredOutcome: shape.desiredOutcome,
    appetite: shape.appetite,
    constraints: shape.constraints.join('\n'),
    selectedApproach: shape.selectedApproach,
    rationale: shape.rationale,
    risks: shape.risks.join('\n'),
    noGos: shape.noGos.join('\n'),
    acceptanceCriteria: shape.acceptanceCriteria.join('\n'),
    architectureImpact: shape.architectureImpact,
    openQuestions: shape.openQuestions.join('\n'),
  };
}

function fromDraft(draft: ReturnType<typeof toDraft>) {
  const lines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return {
    ...draft,
    constraints: lines(draft.constraints),
    risks: lines(draft.risks),
    noGos: lines(draft.noGos),
    acceptanceCriteria: lines(draft.acceptanceCriteria),
    openQuestions: lines(draft.openQuestions),
  };
}

function formatUpdated(value: string, language: DiscoveryLanguage): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US');
}
