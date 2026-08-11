import { useState } from 'react';
import type { V3ApplicationClient, V3WorkspaceState } from '../contracts';
import { createV3CommandFactory, currentEpic } from '../contracts';
import { NeedsLogic } from '../shell/NeedsLogic';
import { RecoveryActions } from '../shell/RecoveryActions';
import { useI18n } from '../../lib/i18n';

const REDRAW_EXAMPLE = `# .aidlc/pipelines/redraw-design.yaml
id: redraw-design
version: 1.0.0
steps:
  - id: design-analyzer
    agent: design-recreator
    skills: [figma-to-ui, image-to-ui]
    outputs: [DESIGN-ANALYSIS.md]
    auto_review: true
  - id: design-recreator
    agent: design-recreator
    skills: [design-system, responsive-layout]
    outputs: ["src/ui/**"]
  - id: visual-reviewer
    agent: design-recreator
    skills: [visual-review]
    outputs: [VISUAL-DIFF.md]
    auto_review: true
  - id: human-review
    human_review: true
    on_reject: { rerun: design-recreator, with_feedback: true }`;

export function GuideDiagnosticsView({ state, client }: { state: V3WorkspaceState; client: V3ApplicationClient }) {
  const t = useI18n();
  const REDRAW_TESTS = t.guide.redrawTests;
  const guide = state.guide;
  const epic = currentEpic(state);
  const command = createV3CommandFactory('guide');
  const [logsOpen, setLogsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const logLines = (guide.advancedLog ?? '').split('\n').filter(Boolean);

  return <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
    <div className="space-y-4">
      <header><p className="text-xs uppercase tracking-wide text-muted-foreground">{t.guide.modeLabel}</p><h1 className="mt-1 text-xl font-semibold text-foreground">{guide.title}</h1></header>
      <section className="rounded-lg border border-border bg-card p-4"><h2 className="text-sm font-semibold text-foreground">{t.guide.whatHappens}</h2><p className="mt-2 text-xs text-muted-foreground">{guide.why}</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><GuideList title={t.guide.inputs} values={guide.inputs} /><GuideList title={t.guide.outputs} values={guide.outputs} /></div><p className="mt-4 text-xs"><span className="font-medium text-foreground">{t.guide.doneWhen}</span><span className="text-muted-foreground">{guide.doneWhen}</span></p><p className="mt-2 text-xs"><span className="font-medium text-foreground">{t.guide.next}</span><span className="text-muted-foreground">{guide.next}</span></p><div className="mt-4"><RecoveryActions epicId={epic?.id} actions={guide.recovery} client={client} /></div></section>
      {epic?.blocker && <section className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-4"><h2 className="text-sm font-semibold text-foreground">{t.guide.whyStopped}</h2><p className="mt-2 text-xs text-muted-foreground">{epic.blocker.summary}</p>{epic.blocker.detail && <p className="mt-1 text-xs text-muted-foreground">{epic.blocker.detail}</p>}<div className="mt-3"><RecoveryActions epicId={epic.id} actions={epic.blocker.recoveryActions} client={client} /></div></section>}
    </div>

    <div className="space-y-4">
      <section className="overflow-hidden rounded-lg border border-primary/30 bg-card">
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
          <h2 className="flex-1 text-xs font-semibold text-foreground">{t.guide.exampleConfigTitle}</h2>
          <button type="button" onClick={() => { void navigator.clipboard.writeText(REDRAW_EXAMPLE); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-[11px] text-primary">{copied ? t.common.copied : t.common.copy}</button>
        </div>
        <pre className="overflow-x-auto bg-background p-3.5 font-mono text-[11.5px] leading-relaxed text-muted-foreground">{REDRAW_EXAMPLE}</pre>
      </section>

      <NeedsLogic block note="Chưa có command mở file test hoặc chạy test suite từ webview">
        <section className="w-full overflow-hidden rounded-lg border border-dashed border-border bg-card">
          <div className="border-b border-border px-3.5 py-2.5"><h2 className="text-xs font-semibold text-foreground">{t.guide.testsForRedraw}</h2></div>
          {REDRAW_TESTS.map((test) => <p key={test} className="border-b border-border/60 px-3.5 py-2 text-[11.5px] leading-relaxed text-muted-foreground last:border-b-0">{test}</p>)}
        </section>
      </NeedsLogic>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
          <h2 className="flex-1 text-xs font-semibold text-foreground">{t.guide.doctor}</h2>
          <NeedsLogic note="Chỉ có fix từng issue (recovery.apply), chưa có lệnh --fix chạy tất cả"><button type="button" className="text-[11.5px] text-primary">{t.guide.runFix}</button></NeedsLogic>
        </div>
        {state.project.diagnostics.length === 0 ? <p className="p-3.5 text-xs text-muted-foreground">{t.guide.noIssuesFound}</p> : state.project.diagnostics.map((diagnostic) => (
          <div key={diagnostic.id} className="flex items-center gap-2.5 border-b border-border/60 px-3.5 py-2.5 last:border-b-0">
            <span className={diagnostic.severity === 'error' ? 'text-destructive' : 'text-amber-500'}>{diagnostic.severity === 'error' ? '✕' : '▲'}</span>
            <p className="flex-1 text-xs text-foreground">{diagnostic.summary}</p>
            {diagnostic.fix && <button type="button" onClick={() => client.dispatch(command('recovery.apply', { epicId: epic?.id, action: diagnostic.fix?.command ?? diagnostic.fix?.kind }))} className="shrink-0 text-[11.5px] text-primary">{diagnostic.fix.label}</button>}
          </div>
        ))}
      </section>

      {guide.advancedLog && <section className="rounded-lg border border-border bg-card">
        <button type="button" onClick={() => setLogsOpen((v) => !v)} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left">
          <span className="text-[11px] text-muted-foreground">{logsOpen ? '▾' : '▸'}</span>
          <span className="flex-1 text-xs text-foreground">{t.guide.advancedLogPrefix}{logLines.length}{t.guide.advancedLogSuffix}</span>
          <span className="text-[11px] text-muted-foreground">{t.guide.debug}</span>
        </button>
        {logsOpen && <pre className="overflow-x-auto border-t border-border p-3.5 font-mono text-[11.5px] leading-relaxed text-muted-foreground">{logLines.join('\n')}</pre>}
      </section>}
    </div>
  </div>;
}

function GuideList({ title, values }: { title: string; values: readonly string[] }) { return <div><h3 className="text-xs font-medium text-foreground">{title}</h3><ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">{values.map((value) => <li key={value}>{value}</li>)}</ul></div>; }
