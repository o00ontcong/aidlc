import type { V3ApplicationClient, V3CommandName, V3WorkspaceState } from '../contracts';
import { createV3CommandFactory, currentEpic } from '../contracts';
import { RecoveryActions } from '../shell/RecoveryActions';
import { V3EmptyState } from '../shell/AsyncState';
import { useI18n } from '../../lib/i18n';

export function HomeView({ state, client, onOpenEpics, onOpenStudio }: {
  state: V3WorkspaceState;
  client: V3ApplicationClient;
  onOpenEpics: () => void;
  onOpenStudio: () => void;
}) {
  const t = useI18n();
  const readinessLabel: Record<V3WorkspaceState['project']['readiness'], string> = {
    'not-ready': t.home.readinessNotReady,
    analyzing: t.home.readinessAnalyzing,
    ready: t.home.readinessReady,
    'needs-attention': t.home.readinessNeedsAttention,
  };
  const epic = currentEpic(state);
  const command = createV3CommandFactory('home');
  const recommendation = state.project.recommendation;
  const directCommand = epic?.nextAction?.command && DIRECT_EPIC_COMMANDS.includes(epic.nextAction.command as V3CommandName)
    ? epic.nextAction.command as V3CommandName
    : undefined;
  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{readinessLabel[state.project.readiness]}</p>
        <h1 className="mt-1 text-xl font-semibold text-foreground">{state.project.name || t.home.openProjectPrompt}</h1>
        {state.project.contextRevision && <p className="mt-1 text-xs text-muted-foreground">{t.home.contextRevisionPrefix}{state.project.contextRevision}</p>}
      </header>

      {state.legacyMigration && <section className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-4"><h2 className="text-sm font-semibold text-foreground">{t.home.legacyTitle}</h2><p className="mt-1 text-xs text-muted-foreground">{state.legacyMigration.itemCount}{t.home.legacyBodySuffix}</p><button type="button" onClick={() => client.dispatch(command('migration.preview', {}))} className="mt-3 rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">{t.home.previewMigration}</button><code className="mt-2 block text-[10px] text-muted-foreground">{state.legacyMigration.command}</code></section>}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-3.5 py-2.5"><h2 className="text-xs font-semibold text-foreground">{t.home.readinessCardTitle}</h2></div>
          {state.project.diagnostics.length === 0 ? (
            <div className="flex items-center gap-2.5 px-3.5 py-3"><span className="text-primary">✓</span><p className="text-xs text-muted-foreground">{t.home.noReadinessIssues}</p></div>
          ) : state.project.diagnostics.map((diagnostic) => (
            <div key={diagnostic.id} className="flex items-center gap-2.5 border-b border-border/60 px-3.5 py-2.5 last:border-b-0">
              <span className={diagnostic.severity === 'error' ? 'text-destructive' : diagnostic.severity === 'warning' ? 'text-amber-500' : 'text-muted-foreground'}>{diagnostic.severity === 'error' ? '✕' : diagnostic.severity === 'warning' ? '▲' : 'ℹ'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-foreground">{diagnostic.summary}</p>
                {diagnostic.detail && <p className="truncate font-mono text-[11px] text-muted-foreground">{diagnostic.detail}</p>}
              </div>
              {diagnostic.fix && <button type="button" onClick={() => client.dispatch(command('recovery.apply', { epicId: epic?.id, action: diagnostic.fix?.command ?? diagnostic.fix?.kind }))} className="shrink-0 rounded border border-border px-2.5 py-1 text-[11.5px] text-foreground">{diagnostic.fix.label}</button>}
            </div>
          ))}
          <div className="flex flex-wrap gap-1.5 border-t border-border p-3">
            <button type="button" onClick={() => client.dispatch(command('project.analyze', {}))} className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">{t.home.analyzeProject}</button>
            <button type="button" onClick={() => client.dispatch(command('project.context.refresh', {}))} className="rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">{t.home.publishContext}</button>
            <button type="button" onClick={() => client.dispatch(command('project.recommend', {}))} className="rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">{t.home.recommend}</button>
          </div>
        </section>

        {epic ? (
          <section className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-card p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-primary">{t.home.currentEpic}</p>
            <h2 className="text-base font-bold text-foreground">{epic.id} · {epic.title}</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">{epic.nextAction?.summary ?? t.home.noActionWaiting}</p>
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-1.5 bg-primary" style={{ width: `${Math.round((epic.stages.filter((s) => s.status === 'completed').length / Math.max(epic.stages.length, 1)) * 100)}%` }} /></span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">{epic.autonomy}</span>
            </div>
            {epic.blocker && (
              <div className="rounded border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-xs font-medium text-foreground">{epic.blocker.summary}</p>
                <RecoveryActions epicId={epic.id} actions={epic.blocker.recoveryActions} client={client} />
              </div>
            )}
            <div className="flex gap-2">
              {directCommand && <button type="button" onClick={() => client.dispatch(command(directCommand, { epicId: epic.id }))} className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">{epic.nextAction?.summary}</button>}
              <button type="button" onClick={onOpenEpics} className="rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">{t.home.openEpic}</button>
            </div>
          </section>
        ) : (
          <V3EmptyState title={t.home.noEpicYetTitle} description={t.home.noEpicYetDesc} />
        )}
      </div>

      {recommendation && (
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t.home.recommendedSetup}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{recommendation.rationale}</p>
            </div>
            <span className="rounded bg-secondary px-2 py-1 text-[10px] text-muted-foreground">{Math.round(recommendation.confidence * 100)}{t.home.confidenceSuffix}</span>
          </div>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
            <div><dt className="text-muted-foreground">{t.home.profile}</dt><dd className="capitalize text-foreground">{recommendation.profile}</dd></div>
            <div><dt className="text-muted-foreground">{t.home.agent}</dt><dd className="text-foreground">{recommendation.agentRole}</dd></div>
            <div><dt className="text-muted-foreground">{t.home.modelTier}</dt><dd className="text-foreground">{recommendation.modelTier}</dd></div>
          </dl>
          <button type="button" onClick={onOpenStudio} className="mt-3 text-xs font-medium text-primary hover:underline">{t.home.reviewInStudio}</button>
        </section>
      )}
    </div>
  );
}

const DIRECT_EPIC_COMMANDS: readonly V3CommandName[] = ['epic.prepare', 'epic.next', 'epic.status', 'epic.explain', 'epic.resume', 'epic.review', 'epic.ship'];
