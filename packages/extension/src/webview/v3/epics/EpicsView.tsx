import { useEffect, useState } from 'react';
import type { V3ApplicationClient, V3EpicSummary, V3StageSummary, V3WorkspaceState } from '../contracts';
import { createV3CommandFactory, visibleStages } from '../contracts';
import { ArtifactAnnotationAction } from '../capabilities/annotation/ArtifactAnnotationAction';
import { AstGraphContextAction } from '../capabilities/astGraph/AstGraphContextAction';
import { GatePreview } from '../shell/GatePreview';
import { RecoveryActions } from '../shell/RecoveryActions';
import { StageTimeline } from '../shell/StageTimeline';
import { V3EmptyState } from '../shell/AsyncState';

export function EpicsView({ state, client, selectedEpicId, onSelectEpic }: {
  state: V3WorkspaceState;
  client: V3ApplicationClient;
  selectedEpicId?: string;
  onSelectEpic: (epicId: string) => void;
}) {
  const epic = state.epics.find((item) => item.id === selectedEpicId) ?? state.epics[0];
  if (!epic) return <V3EmptyState title="No Epics" description="Create a single unified Epic to plan, run, review, and ship work." />;
  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="space-y-2" aria-label="Epic list">
        <h1 className="text-sm font-semibold text-foreground">Epics</h1>
        {state.epics.map((item) => <EpicListItem key={item.id} epic={item} selected={item.id === epic.id} onSelect={() => onSelectEpic(item.id)} />)}
      </aside>
      <EpicDetail epic={epic} client={client} capabilities={state.capabilities} />
    </div>
  );
}

function EpicListItem({ epic, selected, onSelect }: { epic: V3EpicSummary; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} className={`w-full rounded border p-3 text-left ${selected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent'}`}>
    <span className="block font-mono text-[10px] text-muted-foreground">{epic.id}</span>
    <span className="mt-1 block truncate text-xs font-medium text-foreground">{epic.title}</span>
    <span className="mt-1 block text-[10px] capitalize text-muted-foreground">{epic.status} · {epic.profile}</span>
  </button>;
}

function EpicDetail({ epic, client, capabilities }: { epic: V3EpicSummary; client: V3ApplicationClient; capabilities: V3WorkspaceState['capabilities'] }) {
  const [stage, setStage] = useState<V3StageSummary | undefined>(visibleStages(epic).find((item) => item.status === 'running') ?? visibleStages(epic)[0]);
  useEffect(() => setStage(visibleStages(epic).find((item) => item.status === 'running') ?? visibleStages(epic)[0]), [epic]);
  const command = createV3CommandFactory('epic');
  return <section className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="font-mono text-[10px] text-muted-foreground">{epic.id}</p><h1 className="mt-1 text-xl font-semibold text-foreground">{epic.title}</h1></div>
      <span className="rounded bg-secondary px-2 py-1 text-[10px] capitalize text-muted-foreground">{epic.autonomy}</span>
    </header>
    <StageTimeline stages={visibleStages(epic)} onStageClick={setStage} />
    {stage && <StageDetail epic={epic} stage={stage} client={client} />}
    {epic.gate && <GatePreview epicId={epic.id} preview={epic.gate} client={client} />}
    {epic.blocker && <section className="rounded-md border border-destructive/40 bg-destructive/5 p-4"><h2 className="text-sm font-semibold text-foreground">{epic.blocker.summary}</h2><p className="mt-1 text-xs text-muted-foreground">{epic.blocker.detail}</p><div className="mt-3"><RecoveryActions epicId={epic.id} actions={epic.blocker.recoveryActions} client={client} /></div></section>}
    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-md border border-border bg-card p-4"><h2 className="text-sm font-semibold text-foreground">Artifacts</h2>{epic.artifacts.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No artifacts yet.</p> : <ul className="mt-2 space-y-2">{epic.artifacts.map((artifact) => <li key={artifact.id} className="flex items-center justify-between gap-2 text-xs"><span className="truncate text-foreground">{artifact.label}</span><ArtifactAnnotationAction epicId={epic.id} artifact={artifact} enabled={capabilities.some((c) => c.id === 'artifact-annotation' && c.enabled)} client={client} /></li>)}</ul>}</div>
      <div className="rounded-md border border-border bg-card p-4"><h2 className="text-sm font-semibold text-foreground">Evidence</h2>{epic.evidence.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No evidence collected.</p> : <ul className="mt-2 space-y-1">{epic.evidence.map((evidence) => <li key={evidence.id} className="text-xs text-muted-foreground">{evidence.label} <span className="text-[10px]">({evidence.kind})</span></li>)}</ul>}</div>
    </section>
    <AstGraphContextAction epicId={epic.id} stageId={stage?.id} enabled={capabilities.some((c) => c.id === 'ast-graph' && c.enabled)} client={client} />
    <button type="button" onClick={() => client.dispatch(command('epic.resume', { epicId: epic.id }))} className="rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">Resume Epic</button>
  </section>;
}

function StageDetail({ epic, stage, client }: { epic: V3EpicSummary; stage: V3StageSummary; client: V3ApplicationClient }) {
  const command = createV3CommandFactory('stage');
  return <section className="rounded-md border border-border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold capitalize text-foreground">{stage.id}</h2><p className="mt-1 text-xs text-muted-foreground">{stage.summary ?? stage.action?.summary ?? 'No detailed action is available.'}</p></div><label className="text-xs text-muted-foreground">Autonomy <select value={stage.autonomy ?? epic.autonomy} onChange={(event) => client.dispatch(command('epic.stage.autonomy.set', { epicId: epic.id, stageId: stage.id, autonomy: event.target.value }))} className="ml-2 rounded border border-border bg-background px-2 py-1 text-foreground"><option value="guide">Guide</option><option value="assist">Assist</option><option value="auto">Auto</option><option value="unattended">Unattended</option></select></label></div></section>;
}
