/* The Discover tab proper: one toolbar, two ways of working on the same
 * files (by step, or by document), plus the review surfaces an agent run
 * needs — a diff and a checks list.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Play, RefreshCw } from 'lucide-react';
import type { DiscoverStepId, DiscoverSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { discoverCopy, type DiscoverLanguage } from '@/lib/discoverI18n';
import { AgentPanel } from './AgentPanel';
import { DiffView } from './DiffView';
import { DocsMode } from './DocsMode';
import { MarkdownLite } from './MarkdownLite';
import { RawMarkdownPane } from './RawMarkdownPane';
import { HandoffPanel } from './HandoffPanel';
import { SectionCard } from './SectionCard';
import { StepRail } from './StepRail';
import { docsForStep, missingRequirements, pct } from './lib';

type Mode = 'pipeline' | 'docs' | 'diff' | 'checks';
type StepPane = 'structured' | 'raw' | 'preview';

export function DiscoverWorkspace({ discover, language }: { discover: DiscoverSummary; language: DiscoverLanguage }) {
  const copy = discoverCopy(language);
  const [mode, setMode] = useState<Mode>('pipeline');
  const [viewing, setViewing] = useState<DiscoverStepId>(discover.currentStep);
  const [pane, setPane] = useState<StepPane>('structured');

  // Follow real workflow moves; selecting a step in the rail is navigation only.
  useEffect(() => { setViewing(discover.currentStep); }, [discover.currentStep]);

  const step = discover.steps.find((s) => s.id === viewing) ?? discover.steps[0]!;
  const active = discover.activeRun;

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
              className={`px-2.5 py-1 text-[11px] transition ${
                mode === m ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {m === 'pipeline' ? copy.modePipeline : copy.modeDocs}
            </button>
          ))}
        </div>

        <span className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode(mode === 'checks' ? 'pipeline' : 'checks')}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition ${
              discover.issues.length
                ? 'border-warning/50 bg-warning/10 text-warning hover:bg-warning/20'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {discover.issues.length > 0 && <AlertTriangle className="h-3 w-3" />}
            {copy.checks} {discover.issues.length}
          </button>
          <button
            type="button"
            onClick={() => postMessage({ type: 'reloadDiscover' })}
            title={copy.reload}
            className="rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => postMessage({ type: 'openDiscoverDoc', docPath: step.files[0] })}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />{copy.openInEditor}
          </button>
          <button
            type="button"
            onClick={() => postMessage({ type: 'runDiscoverPipeline' })}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Play className="h-3 w-3" />{copy.runPipeline}
          </button>
        </span>
      </header>

      {active && mode !== 'diff' && (
        <div className="flex flex-wrap items-center gap-2 border-b border-warning/40 bg-warning/10 px-4 py-1.5 text-[11px] text-warning">
          <span className="font-semibold">{copy.runBanner(active.run.id, active.run.mode)}</span>
          <span>
            +{active.added.length} ~{active.updated.length} −{active.removed.length}
          </span>
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={() => setMode('diff')} className="rounded border border-warning/50 px-2 py-0.5 hover:bg-warning/20">{copy.viewDiff}</button>
            <button type="button" onClick={() => postMessage({ type: 'keepDiscoverRun', runId: active.run.id })} className="rounded border border-warning/50 px-2 py-0.5 hover:bg-warning/20">{copy.keep}</button>
            <button type="button" onClick={() => postMessage({ type: 'revertDiscoverRun', runId: active.run.id })} className="rounded border border-warning/50 px-2 py-0.5 hover:bg-warning/20">{copy.revert}</button>
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === 'diff' && <DiffView discover={discover} copy={copy} onBack={() => setMode('pipeline')} />}
        {mode === 'checks' && <ChecksView discover={discover} copy={copy} onBack={() => setMode('pipeline')} />}
        {mode === 'docs' && <DocsMode discover={discover} copy={copy} />}
        {mode === 'pipeline' && (
          <div className="grid h-full min-h-0" style={{ gridTemplateColumns: 'clamp(148px, 17vw, 216px) minmax(0,1fr) clamp(186px, 21vw, 262px)' }}>
            <StepRail discover={discover} viewing={viewing} copy={copy} onSelect={setViewing} />
            <StepDetail discover={discover} stepId={viewing} pane={pane} copy={copy} onPane={setPane} />
            <AgentPanel discover={discover} step={step} copy={copy} onOpenDiff={() => setMode('diff')} />
          </div>
        )}
      </div>
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
  const missing = missingRequirements(step);
  const isCurrent = stepId === discover.currentStep;
  // Only problems with the entry itself. "Not covered" is about a document
  // that has not been written yet, so marking every requirement with it would
  // put a warning on the whole list before the next step even starts.
  const flaggedIds = new Set(
    discover.issues.filter((i) => i.id && i.code === 'dangling-ref').map((i) => i.id!),
  );

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <header className="mb-2">
          <p className="text-[9.5px] font-bold tracking-[0.09em] text-muted-foreground">{copy.selectedStep}</p>
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-bold text-foreground">{step.order} · {step.label}</h2>
            {step.files.map((file) => (
              <code key={file} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{file}</code>
            ))}
            {isCurrent && (
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-primary">{pct(step.completion)}</span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{step.goal}</p>
        </header>

        <div className="mb-2 flex gap-1">
          {(['structured', 'raw', 'preview'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPane(p)}
              className={`rounded border px-2 py-0.5 text-[10.5px] transition ${
                pane === p ? 'border-border bg-secondary font-semibold text-foreground' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {p === 'structured' ? copy.viewStructured : p === 'raw' ? copy.viewMarkdown : copy.viewPreview}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {(stepId === 'plan' || stepId === 'skeleton') && pane === 'structured' && (
            <HandoffPanel discover={discover} copy={copy} />
          )}
          {docs.map((doc) => (
            <div key={doc.path} className="space-y-2">
              {docs.length > 1 && (
                <p className="font-mono text-[10px] text-muted-foreground">{doc.path}</p>
              )}
              {pane === 'structured' && doc.sections.map((section) => (
                <SectionCard
                  key={section.key}
                  docPath={doc.path}
                  revision={discover.revision}
                  section={section}
                  copy={copy}
                  flaggedIds={flaggedIds}
                />
              ))}
              {pane === 'raw' && <RawMarkdownPane doc={doc} revision={discover.revision} copy={copy} />}
              {pane === 'preview' && (
                <div className="rounded-md border border-border bg-card px-3 py-1"><MarkdownLite source={doc.raw} /></div>
              )}
            </div>
          ))}
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2">
        <p className="text-[11px] text-muted-foreground">
          {missing.length === 0
            ? <span className="text-success">{copy.doneWhen}: ✓</span>
            : <>{copy.missing}: <span className="text-warning">{missing.map((m) => m.label + (m.detail ? ` (${m.detail})` : '')).join(' · ')}</span></>}
        </p>
        {isCurrent && (
          <button
            type="button"
            disabled={!step.canAdvance}
            title={step.canAdvance ? undefined : copy.nextStepBlocked}
            onClick={() => postMessage({ type: 'advanceDiscoverStep' })}
            className="ml-auto rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copy.nextStep}
          </button>
        )}
        {!isCurrent && (
          <button
            type="button"
            onClick={() => postMessage({ type: 'setDiscoverStep', step: stepId })}
            className="ml-auto rounded-md border border-border px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {copy.step} → {step.order}
          </button>
        )}
      </footer>
    </div>
  );
}

function ChecksView({
  discover, copy, onBack,
}: { discover: DiscoverSummary; copy: ReturnType<typeof discoverCopy>; onBack: () => void }) {
  const byFile = new Map<string, typeof discover.issues>();
  for (const issue of discover.issues) {
    const key = issue.file ?? '—';
    byFile.set(key, [...(byFile.get(key) ?? []), issue]);
  }
  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      <header className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-bold text-foreground">{copy.checks} · {discover.issues.length}</h2>
        <button type="button" onClick={onBack} className="ml-auto rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent">{copy.back}</button>
      </header>
      {discover.issues.length === 0 && <p className="text-xs text-success">✓</p>}
      {[...byFile].map(([file, issues]) => (
        <section key={file} className="mb-3 overflow-hidden rounded-lg border border-border">
          <header className="flex items-center gap-2 border-b border-border/70 bg-secondary/40 px-3 py-1.5">
            <code className="font-mono text-[10.5px] text-foreground">{file}</code>
            <span className="text-[10px] text-muted-foreground">· {issues.length}</span>
            <button
              type="button"
              onClick={() => postMessage({ type: 'openDiscoverDoc', docPath: file })}
              className="ml-auto text-[10.5px] text-muted-foreground hover:text-foreground hover:underline"
            >
              {copy.openInEditor}
            </button>
          </header>
          <ul>
            {issues.map((issue, idx) => (
              <li key={`${issue.code}-${idx}`} className="flex items-start gap-2 border-b border-border/40 px-3 py-1.5 text-[11px] last:border-b-0">
                <code className={`shrink-0 rounded px-1 font-mono text-[9.5px] ${issue.level === 'error' ? 'bg-destructive/15 text-destructive' : 'bg-secondary text-muted-foreground'}`}>
                  {issue.code}
                </code>
                <span className="text-foreground">{issue.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
