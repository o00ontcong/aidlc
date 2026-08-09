import type { V3ApplicationClient, V3CommandName, V3WorkspaceState } from '../contracts';
import { createV3CommandFactory, currentEpic } from '../contracts';
import { RecoveryActions } from '../shell/RecoveryActions';
import { V3EmptyState } from '../shell/AsyncState';

const readinessLabel: Record<V3WorkspaceState['project']['readiness'], string> = {
  'not-ready': 'Project setup needed',
  analyzing: 'Analyzing project',
  ready: 'Project ready',
  'needs-attention': 'Project needs attention',
};

export function HomeView({ state, client, onOpenEpics, onOpenStudio }: {
  state: V3WorkspaceState;
  client: V3ApplicationClient;
  onOpenEpics: () => void;
  onOpenStudio: () => void;
}) {
  const epic = currentEpic(state);
  const command = createV3CommandFactory('home');
  const recommendation = state.project.recommendation;
  const directCommand = epic?.nextAction?.command && DIRECT_EPIC_COMMANDS.includes(epic.nextAction.command as V3CommandName)
    ? epic.nextAction.command as V3CommandName
    : undefined;
  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{readinessLabel[state.project.readiness]}</p>
        <h1 className="mt-1 text-xl font-semibold text-foreground">{state.project.name || 'Open a project to begin'}</h1>
        {state.project.contextRevision && <p className="mt-1 text-xs text-muted-foreground">Project context revision {state.project.contextRevision}</p>}
      </header>

      {state.legacyMigration && <section className="rounded-md border border-amber-500/50 bg-amber-500/5 p-4"><h2 className="text-sm font-semibold text-foreground">Legacy state detected</h2><p className="mt-1 text-xs text-muted-foreground">{state.legacyMigration.itemCount} legacy state mapping(s) are available. AIDLC will not migrate or delete them automatically.</p><button type="button" onClick={() => client.dispatch(command('migration.preview', {}))} className="mt-3 rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">Preview migration</button><code className="mt-2 block text-[10px] text-muted-foreground">{state.legacyMigration.command}</code></section>}

      {state.project.readiness !== 'ready' && (
        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Start with project analysis</h2>
          <p className="mt-1 text-xs text-muted-foreground">Analysis is read-only. It proposes a workflow, agents, skills, and model tier for your confirmation.</p>
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => client.dispatch(command('project.analyze', {}))} className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Analyze project</button><button type="button" onClick={() => client.dispatch(command('project.context.refresh', {}))} className="rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">Publish context explicitly</button><button type="button" onClick={() => client.dispatch(command('project.recommend', {}))} className="rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">Generate recommendation</button></div>
        </section>
      )}

      {recommendation && (
        <section className="rounded-md border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Recommended setup</h2>
              <p className="mt-1 text-xs text-muted-foreground">{recommendation.rationale}</p>
            </div>
            <span className="rounded bg-secondary px-2 py-1 text-[10px] text-muted-foreground">{Math.round(recommendation.confidence * 100)}% confidence</span>
          </div>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Profile</dt><dd className="capitalize text-foreground">{recommendation.profile}</dd></div>
            <div><dt className="text-muted-foreground">Agent</dt><dd className="text-foreground">{recommendation.agentRole}</dd></div>
            <div><dt className="text-muted-foreground">Model tier</dt><dd className="text-foreground">{recommendation.modelTier}</dd></div>
          </dl>
          <button type="button" onClick={onOpenStudio} className="mt-3 text-xs font-medium text-primary hover:underline">Review recommendations in Studio</button>
        </section>
      )}

      {epic ? (
        <section className="rounded-md border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase text-muted-foreground">Current Epic · {epic.id}</p>
              <h2 className="mt-1 text-base font-semibold text-foreground">{epic.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{epic.nextAction?.summary ?? 'No action is waiting.'}</p>
            </div>
            <span className="rounded bg-secondary px-2 py-1 text-[10px] capitalize text-muted-foreground">{epic.autonomy}</span>
          </div>
          {epic.blocker && (
            <div className="mt-3 rounded border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-xs font-medium text-foreground">{epic.blocker.summary}</p>
              <RecoveryActions epicId={epic.id} actions={epic.blocker.recoveryActions} client={client} />
            </div>
          )}
          <div className="mt-3 flex gap-2">
            {directCommand && <button type="button" onClick={() => client.dispatch(command(directCommand, { epicId: epic.id }))} className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">{epic.nextAction?.summary}</button>}
            <button type="button" onClick={onOpenEpics} className="rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">Open Epic</button>
          </div>
        </section>
      ) : (
        <V3EmptyState title="No Epic yet" description="Create an Epic from the CLI or Claude command after reviewing the project recommendation. AIDLC keeps all delivery modes in this single Epic model." />
      )}
    </div>
  );
}

const DIRECT_EPIC_COMMANDS: readonly V3CommandName[] = ['epic.prepare', 'epic.next', 'epic.status', 'epic.explain', 'epic.resume', 'epic.review', 'epic.ship'];
