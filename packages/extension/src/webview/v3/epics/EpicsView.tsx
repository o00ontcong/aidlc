import { useEffect, useMemo, useState } from 'react';
import type { V3ApplicationClient, V3AutonomyMode, V3EpicStatus, V3EpicSummary, V3StageSummary, V3WorkspaceState } from '../contracts';
import { V3_AUTONOMY_MODES, createV3CommandFactory, visibleStages } from '../contracts';
import { ArtifactAnnotationAction } from '../capabilities/annotation/ArtifactAnnotationAction';
import { AstGraphContextAction } from '../capabilities/astGraph/AstGraphContextAction';
import { GatePreview } from '../shell/GatePreview';
import { NeedsLogic } from '../shell/NeedsLogic';
import { RecoveryActions } from '../shell/RecoveryActions';
import { StageTimeline } from '../shell/StageTimeline';
import { V3EmptyState } from '../shell/AsyncState';
import { FlowGraph } from './FlowGraph';
import { StepFlowGraph } from './StepFlowGraph';
import { NewEpicModal } from './NewEpicModal';
import { useI18n } from '../../lib/i18n';

type FilterKey = 'all' | 'in-progress' | 'pending' | 'done' | 'failed';
const FILTER_STATUSES: Partial<Record<FilterKey, readonly V3EpicStatus[]>> = {
  'in-progress': ['running', 'waiting-for-user', 'review', 'shipping'],
  pending: ['draft', 'ready', 'paused'],
  done: ['completed'],
  failed: ['blocked'],
};

function stageProgress(epic: V3EpicSummary): number {
  const stages = visibleStages(epic);
  if (stages.length === 0) return 0;
  return Math.round((stages.filter((stage) => stage.status === 'completed').length / stages.length) * 100);
}

export function EpicsView({ state, client, selectedEpicId, onSelectEpic }: {
  state: V3WorkspaceState;
  client: V3ApplicationClient;
  selectedEpicId?: string;
  onSelectEpic: (epicId: string) => void;
}) {
  const t = useI18n();
  const FILTERS: { key: FilterKey; label: string; statuses?: readonly V3EpicStatus[] }[] = [
    { key: 'all', label: t.epics.filterAll },
    { key: 'in-progress', label: t.epics.filterInProgress, statuses: FILTER_STATUSES['in-progress'] },
    { key: 'pending', label: t.epics.filterPending, statuses: FILTER_STATUSES.pending },
    { key: 'done', label: t.epics.filterDone, statuses: FILTER_STATUSES.done },
    { key: 'failed', label: t.epics.filterFailed, statuses: FILTER_STATUSES.failed },
  ];
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [following, setFollowing] = useState<Set<string>>(() => new Set());
  const [rail, setRail] = useState(false);
  const [followOpen, setFollowOpen] = useState(true);
  const [restOpen, setRestOpen] = useState(true);
  const [newEpicOpen, setNewEpicOpen] = useState(false);

  const activeFilter = FILTERS.find((item) => item.key === filter)!;
  const filtered = useMemo(() => state.epics.filter((item) => {
    const matchesQuery = `${item.id} ${item.title} ${item.status}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = !activeFilter.statuses || activeFilter.statuses.includes(item.status);
    return matchesQuery && matchesFilter;
  }), [state.epics, query, activeFilter]);
  const followed = filtered.filter((item) => following.has(item.id));
  const rest = filtered.filter((item) => !following.has(item.id));
  const epic = filtered.find((item) => item.id === selectedEpicId) ?? filtered[0] ?? state.epics.find((item) => item.id === selectedEpicId) ?? state.epics[0];

  return (
    <div className={`grid gap-5 ${rail ? 'lg:grid-cols-[3rem_minmax(0,1fr)]' : 'lg:grid-cols-[20rem_minmax(0,1fr)]'}`}>
      <aside className="flex flex-col gap-2 self-start lg:sticky lg:top-0 lg:max-h-[calc(100vh-2.5rem)]" aria-label="Epic list">
        <div className="flex items-center gap-1.5">
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{rail ? 'E' : `${t.epics.heading} (${state.epics.length})`}</h1>
          <button type="button" onClick={() => setRail((value) => !value)} className="h-6 w-6 shrink-0 rounded border border-border text-[10px] text-muted-foreground">{rail ? '›' : '‹'}</button>
        </div>
        {!rail && <>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.epics.searchPlaceholder} className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((item) => {
              const count = item.key === 'all' ? state.epics.length : state.epics.filter((e) => item.statuses?.includes(e.status)).length;
              return <button type="button" key={item.key} onClick={() => setFilter(item.key)} className={`rounded-full px-2 py-0.5 text-[10.5px] ${filter === item.key ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'}`}>{item.label} <span className="opacity-70">{count}</span></button>;
            })}
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">⌕</div>
              <p className="text-xs font-semibold text-foreground">{t.epics.noMatchTitle}</p>
              <p className="text-[11px] text-muted-foreground">{t.epics.noMatchBody}</p>
              <button type="button" onClick={() => { setQuery(''); setFilter('all'); }} className="mt-1 rounded border border-border px-2.5 py-1 text-[11px] text-foreground">{t.epics.clearFilters}</button>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-3 overflow-auto">
              {followed.length > 0 && (
                <section className="flex flex-col gap-1">
                  <button type="button" onClick={() => setFollowOpen((v) => !v)} className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>{followOpen ? '▾' : '▸'}</span>★ {t.epics.following} <span>{followed.length}</span>
                  </button>
                  {followOpen && followed.map((item) => <EpicListItem key={item.id} epic={item} following selected={item.id === epic?.id} onFollow={() => toggleFollow(item.id, setFollowing)} onSelect={() => onSelectEpic(item.id)} />)}
                </section>
              )}
              <section className="flex flex-col gap-1">
                <button type="button" onClick={() => setRestOpen((v) => !v)} className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>{restOpen ? '▾' : '▸'}</span>{t.epics.notFollowing} <span>{rest.length}</span>
                </button>
                {restOpen && rest.map((item) => <EpicListItem key={item.id} epic={item} following={false} selected={item.id === epic?.id} onFollow={() => toggleFollow(item.id, setFollowing)} onSelect={() => onSelectEpic(item.id)} />)}
              </section>
            </div>
          )}
        </>}
        <div className="mt-auto flex gap-1.5 border-t border-border pt-2">
          <button type="button" onClick={() => setNewEpicOpen(true)} className="flex-1 rounded-md bg-primary py-1.5 text-xs font-semibold text-primary-foreground">{rail ? t.epics.newEpicShort : t.epics.newEpic}</button>
          {!rail && <NeedsLogic note="Chưa có command Autonomous Delivery riêng"><button type="button" title={t.epics.startAutonomousDelivery} className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground">⚡</button></NeedsLogic>}
        </div>
      </aside>
      {epic ? <EpicDetail state={state} epic={epic} client={client} capabilities={state.capabilities} /> : state.epics.length === 0 ? (
        <V3EmptyState
          title={t.epics.noEpicsYetTitle}
          description={t.epics.noEpicsYetDesc}
          action={<button type="button" onClick={() => setNewEpicOpen(true)} className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">{t.epics.newEpic}</button>}
        />
      ) : (
        <V3EmptyState title={t.epics.noMatchDetailTitle} description={t.epics.noMatchDetailDesc} />
      )}
      {newEpicOpen && <NewEpicModal state={state} client={client} onClose={() => setNewEpicOpen(false)} />}
    </div>
  );
}

function toggleFollow(id: string, setFollowing: (updater: (current: Set<string>) => Set<string>) => void) {
  setFollowing((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
}

function EpicListItem({ epic, selected, following, onFollow, onSelect }: { epic: V3EpicSummary; selected: boolean; following: boolean; onFollow: () => void; onSelect: () => void }) {
  const pct = stageProgress(epic);
  return (
    <div className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${selected ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-accent'}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${epic.status === 'blocked' ? 'bg-destructive' : epic.status === 'completed' ? 'bg-primary' : epic.status === 'running' ? 'bg-amber-500' : 'bg-muted-foreground'}`} />
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 truncate text-left text-[11.5px] text-foreground">{epic.title}</button>
      <span className="h-0.5 w-6 shrink-0 overflow-hidden rounded-full bg-muted"><span className="block h-0.5 bg-primary" style={{ width: `${pct}%` }} /></span>
      <span className="w-7 shrink-0 text-right font-mono text-[10px] text-muted-foreground">{pct}%</span>
      <button type="button" onClick={onFollow} aria-label={`Follow ${epic.id}`} className={`shrink-0 text-[11px] ${following ? 'text-primary' : 'text-muted-foreground'}`}>★</button>
    </div>
  );
}

function EpicDetail({ state, epic, client, capabilities }: { state: V3WorkspaceState; epic: V3EpicSummary; client: V3ApplicationClient; capabilities: V3WorkspaceState['capabilities'] }) {
  const t = useI18n();
  const [stage, setStage] = useState<V3StageSummary | undefined>(visibleStages(epic).find((item) => item.status === 'running') ?? visibleStages(epic)[0]);
  const [gateOpen, setGateOpen] = useState(false);
  useEffect(() => { setStage(visibleStages(epic).find((item) => item.status === 'running') ?? visibleStages(epic)[0]); setGateOpen(false); }, [epic]);
  const command = createV3CommandFactory('epic');

  const run = state.registry.runs.find((item) => item.epicId === epic.id);
  const pipeline = run ? state.registry.pipelines.find((item) => item.id === run.pipelineId) : undefined;

  const parallel = state.epics.filter((item) => item.id !== epic.id && ['running', 'waiting-for-user', 'review', 'shipping'].includes(item.status));

  return <section className="space-y-3.5">
    <NeedsLogic block note="Chưa có kiểu dữ liệu charter/scope-conflict để kiểm tra thật">
      <div className="flex w-full items-center gap-2.5 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2">
        <span className="text-amber-600 dark:text-amber-300">▲</span>
        <span className="flex-1 text-xs text-muted-foreground">{t.epics.charterNotWired}</span>
      </div>
    </NeedsLogic>
    <header className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-[11px] text-muted-foreground">{epic.id}</p>
          <h1 className="text-lg font-bold text-foreground">{epic.title}</h1>
          <EpicStatusBadge status={epic.status} />
        </div>
        <div className="mt-2 flex items-center gap-2.5">
          <span className="h-1.5 flex-1 max-w-40 overflow-hidden rounded-full bg-muted"><span className="block h-1.5 bg-primary" style={{ width: `${stageProgress(epic)}%` }} /></span>
          <span className="font-mono text-[11.5px] text-muted-foreground">{stageProgress(epic)}%</span>
        </div>
      </div>
      <AutonomyDropdown epic={epic} stage={stage} client={client} />
    </header>

    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5">
        <h2 className="shrink-0 text-xs font-semibold text-foreground">{t.epics.projectContext}</h2>
        {pipeline && <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">{pipeline.id} · {pipeline.steps.length} {t.builder.stepUnit}</span>}
        {state.project.contextRevision && <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-primary">{t.epics.publishedPrefix}{state.project.contextRevision}</span>}
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{t.epics.sharedBaselineNote}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 p-3">
        {pipeline?.steps.map((step) => <span key={step.id} className="rounded border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground">{step.id}</span>)}
        <span className="flex-1" />
        <NeedsLogic note="Chưa có trình xem context riêng"><button type="button" className="rounded border border-border px-2.5 py-1 text-[11.5px] text-foreground">{t.epics.openContext}</button></NeedsLogic>
        <button type="button" onClick={() => client.dispatch(command('project.context.refresh', {}))} className="rounded border border-amber-500/40 px-2.5 py-1 text-[11.5px] text-amber-600 dark:text-amber-300">{t.epics.refreshContext}</button>
      </div>
    </section>

    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5">
        <h2 className="shrink-0 text-xs font-semibold text-foreground">{t.epics.parallelEpics}</h2>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{t.epics.parallelEpicsNote}</span>
        <NeedsLogic note="Chưa có endpoint kiểm tra độc lập"><button type="button" className="shrink-0 rounded border border-border px-2.5 py-1 text-[11.5px] text-foreground">{t.epics.checkIndependence}</button></NeedsLogic>
      </div>
      {parallel.length === 0 ? <p className="p-3 text-[11.5px] text-muted-foreground">{t.epics.noOtherEpicRunning}</p> : parallel.map((item) => (
        <div key={item.id} className="flex items-center gap-2.5 border-b border-border/60 px-3.5 py-2 last:border-b-0">
          <span className="w-28 shrink-0 truncate font-mono text-[11px] text-foreground">{item.id}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{item.title}</span>
          <NeedsLogic note="Chưa có dữ liệu branch/PR thật cho epic khác"><span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">feat/{item.id.toLowerCase()}</span></NeedsLogic>
          <span className="w-24 shrink-0 text-right font-mono text-[11px] capitalize text-muted-foreground">{item.status}</span>
        </div>
      ))}
      <NeedsLogic block note="Chưa có kiểm tra độc lập thật (scope/branch/charter) — đây là danh sách mẫu theo mockup">
        <div className="flex w-full flex-col gap-1.5 border-t border-border px-3.5 py-2.5">
          {t.epics.independenceChecks.map((check) => (
            <div key={check} className="flex items-center gap-2 text-[11.5px] text-muted-foreground"><span className="text-primary">✓</span>{check}</div>
          ))}
        </div>
      </NeedsLogic>
    </section>

    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3.5 py-2.5"><h2 className="text-xs font-semibold text-foreground">{t.epics.featureEpicFlow}</h2></div>
      <div className="p-3">
        {pipeline && run ? <StepFlowGraph epicId={epic.id} pipeline={pipeline} run={run} client={client} /> : <>
          <StageTimeline stages={visibleStages(epic)} onStageClick={setStage} />
          <div className="mt-3"><FlowGraph stages={visibleStages(epic)} /></div>
        </>}
      </div>
    </section>

    <NeedsLogic block note="Chưa có data model EpicConfig thật — bảng dưới tính từ pipeline đã chọn, phần branch/PR là placeholder">
      <section className="w-full overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5">
          <h2 className="shrink-0 text-xs font-semibold text-foreground">{t.epics.epicConfigTitle}</h2>
          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10.5px] text-primary">{t.epics.epicConfigOverrideBadge}</span>
          <span className="flex-1" />
          <span className="shrink-0 cursor-pointer text-[11.5px] text-foreground">{t.epics.editAll}</span>
          <span className="shrink-0 cursor-pointer text-[11.5px] text-muted-foreground">{t.epics.resetToProject}</span>
        </div>
        {[
          { k: t.epics.configPipelineLabel, v: pipeline ? `${pipeline.id} · ${pipeline.steps.length} ${t.builder.stepUnit}` : '—', src: t.epics.configSourceBundled },
          { k: t.epics.configContextLabel, v: t.newEpic.lockContextValue.replace('{rev}', state.project.contextRevision ?? t.newEpic.notPublishedYet), src: pipeline?.steps[0]?.id ?? t.epics.configSourceBundled },
          { k: t.epics.configBranchLabel, v: t.newEpic.lockBranchValue.replace('{id}', epic.id.toLowerCase()), src: t.epics.configSourceOwnEpic },
          { k: t.epics.configPrLabel, v: t.epics.configPrValue.replace('{n}', '402'), src: t.epics.configSourceOwnEpic },
          { k: t.epics.configContractLabel, v: t.epics.configContractValue, src: pipeline?.steps.find((s) => s.id.includes('contract'))?.id ?? t.epics.configSourceByContract },
          { k: t.epics.configDecompositionLabel, v: t.newEpic.lockDecompositionValue, src: t.epics.configSourceByContract },
        ].map((row) => (
          <div key={row.k} className="flex items-center gap-2.5 border-b border-border/60 px-3.5 py-2 last:border-b-0">
            <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{row.k}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{row.v}</span>
            <span className="shrink-0 text-[10.5px] text-primary">{row.src}</span>
            <span className="shrink-0 cursor-pointer text-[11.5px] text-primary">{t.common.edit}</span>
          </div>
        ))}
        <div className="flex flex-col gap-2 border-t border-border p-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{t.epics.runModeTitle}</p>
          <div className="flex flex-wrap gap-1.5">
            {(['guided', 'autonomous'] as const).map((mode) => (
              <button type="button" key={mode} onClick={() => setRunMode(mode)} className={`flex flex-1 items-center gap-2 rounded-md px-2.5 py-2 text-left ${runMode === mode ? 'border border-primary/40 bg-primary/10' : 'border border-border'}`}>
                <span className={runMode === mode ? 'text-primary' : 'text-muted-foreground'}>{runMode === mode ? '◉' : '○'}</span>
                <span>
                  <p className="text-xs font-semibold text-foreground">{mode === 'guided' ? t.epics.runModeGuidedLabel : t.epics.runModeAutonomousLabel}</p>
                  <p className="text-[11px] text-muted-foreground">{mode === 'guided' ? t.epics.runModeGuidedDesc : t.epics.runModeAutonomousDesc}</p>
                </span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">{t.epics.runModeFootnote}</p>
        </div>
      </section>
    </NeedsLogic>

    {epic.gate && (
      <section className="flex flex-col gap-2.5 rounded-lg border-2 border-destructive/40 bg-destructive/5 p-3.5">
        <div className="flex items-center gap-2.5">
          <span>🔒</span>
          <div className="flex-1">
            <p className="text-[13px] font-bold text-foreground">{t.epics.humanGatePrefix}{epic.gate.gate}</p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">{t.epics.agentsNeverMerge}</p>
          </div>
          <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-300">{t.epics.waitingForUser}</span>
        </div>
        <p className="rounded-md border border-border bg-card p-2.5 text-xs leading-relaxed text-foreground">{epic.gate.contentSummary}</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setGateOpen(true)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">{t.common.approve}</button>
          <button type="button" onClick={() => setGateOpen(true)} className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive">{t.common.reject}</button>
          <NeedsLogic note="Chưa xác định step đích cho rerun/auto-review ở gate cấp epic"><button type="button" className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground">{t.epics.rerunStep}</button></NeedsLogic>
          <NeedsLogic note="Chưa xác định step đích ở gate cấp epic"><button type="button" className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground">{t.epics.runAutoReview}</button></NeedsLogic>
        </div>
      </section>
    )}
    {epic.gate && gateOpen && <GatePreview epicId={epic.id} preview={epic.gate} client={client} onClose={() => setGateOpen(false)} />}

    {!pipeline && stage && <StageDetail epic={epic} stage={stage} client={client} />}

    {epic.blocker && <section className="rounded-md border border-destructive/40 bg-destructive/5 p-4"><h2 className="text-sm font-semibold text-foreground">{epic.blocker.summary}</h2><p className="mt-1 text-xs text-muted-foreground">{epic.blocker.detail}</p><div className="mt-3"><RecoveryActions epicId={epic.id} actions={epic.blocker.recoveryActions} client={client} /></div></section>}

    <div className="grid gap-3.5 md:grid-cols-2">
      <NeedsLogic block note="Chưa có kiểu dữ liệu event/audit log riêng cho epic (Guide tab có advancedLog dạng text)">
        <div className="w-full rounded-lg border border-dashed border-border bg-card p-3.5 text-[11px] text-muted-foreground">{t.epics.historyNotModeled}</div>
      </NeedsLogic>
      <div className="rounded-md border border-border bg-card p-4"><h2 className="text-sm font-semibold text-foreground">{t.epics.artifacts}</h2>{epic.artifacts.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">{t.epics.noArtifactsYet}</p> : <ul className="mt-2 space-y-2">{epic.artifacts.map((artifact) => <li key={artifact.id} className="flex items-center justify-between gap-2 text-xs"><span className="truncate text-foreground">{artifact.label}</span><ArtifactAnnotationAction epicId={epic.id} artifact={artifact} enabled={capabilities.some((c) => c.id === 'artifact-annotation' && c.enabled)} client={client} /></li>)}</ul>}</div>
    </div>
    <div className="rounded-md border border-border bg-card p-4"><h2 className="text-sm font-semibold text-foreground">{t.epics.evidence}</h2>{epic.evidence.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">{t.epics.noEvidenceCollected}</p> : <ul className="mt-2 space-y-1">{epic.evidence.map((evidence) => <li key={evidence.id} className="text-xs text-muted-foreground">{evidence.label} <span className="text-[10px]">({evidence.kind})</span></li>)}</ul>}</div>

    <NeedsLogic block note="Chưa có artifact policy checklist theo epic (ship strip)">
      <div className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border bg-card p-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{t.epics.ship}</span>
        <span className="flex-1 text-[11.5px] text-muted-foreground">{t.epics.shipChecklistNotModeled}</span>
      </div>
    </NeedsLogic>

    <div className="flex flex-wrap gap-2">
      <AstGraphContextAction epicId={epic.id} stageId={stage?.id} enabled={capabilities.some((c) => c.id === 'ast-graph' && c.enabled)} client={client} />
      <button type="button" onClick={() => client.dispatch(command('epic.resume', { epicId: epic.id }))} className="rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">{t.epics.resumeEpic}</button>
    </div>
  </section>;
}

function EpicStatusBadge({ status }: { status: V3EpicStatus }) {
  const t = useI18n();
  const BADGE: Record<V3EpicStatus, { icon: string; label: string; cls: string }> = {
    draft: { icon: '○', label: t.epics.badgeDraft, cls: 'bg-secondary text-muted-foreground' },
    ready: { icon: '○', label: t.epics.badgeReady, cls: 'bg-secondary text-muted-foreground' },
    paused: { icon: '○', label: t.epics.badgePaused, cls: 'bg-secondary text-muted-foreground' },
    running: { icon: '●', label: t.epics.badgeInProgress, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' },
    'waiting-for-user': { icon: '●', label: t.epics.badgeInProgress, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' },
    review: { icon: '●', label: t.epics.badgeInProgress, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' },
    shipping: { icon: '●', label: t.epics.badgeInProgress, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-300' },
    blocked: { icon: '✕', label: t.epics.badgeFailed, cls: 'bg-destructive/15 text-destructive' },
    completed: { icon: '✓', label: t.epics.badgeDone, cls: 'bg-primary/15 text-primary' },
  };
  const badge = BADGE[status];
  return <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.cls}`}><span>{badge.icon}</span>{badge.label}</span>;
}

function StageDetail({ epic, stage, client }: { epic: V3EpicSummary; stage: V3StageSummary; client: V3ApplicationClient }) {
  const t = useI18n();
  const command = createV3CommandFactory('stage');
  return <section className="rounded-md border border-border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold capitalize text-foreground">{stage.id}</h2><p className="mt-1 text-xs text-muted-foreground">{stage.summary ?? stage.action?.summary ?? t.epics.noDetailedAction}</p></div><label className="text-xs text-muted-foreground">{t.epics.autonomyLabel} <select value={stage.autonomy ?? epic.autonomy} onChange={(event) => client.dispatch(command('epic.stage.autonomy.set', { epicId: epic.id, stageId: stage.id, autonomy: event.target.value }))} className="ml-2 rounded border border-border bg-background px-2 py-1 text-foreground"><option value="guide">{t.autonomy.guide}</option><option value="assist">{t.autonomy.assist}</option><option value="auto">{t.autonomy.auto}</option><option value="unattended">{t.autonomy.unattended}</option></select></label></div></section>;
}
