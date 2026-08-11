import { useMemo, useState } from 'react';
import type { V3ApplicationClient, V3AutonomyMode, V3EpicSummary, V3WorkspaceState } from '../contracts';
import { V3_AUTONOMY_MODES, createV3CommandFactory } from '../contracts';
import { NeedsLogic } from '../shell/NeedsLogic';
import { useI18n } from '../../lib/i18n';

const TYPES: readonly V3EpicSummary['type'][] = ['feature', 'bug', 'refactor', 'spike', 'maintenance'];

function slugify(title: string): string {
  const base = title.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${base || 'EPIC'}-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * New Epic modal (`re-design/AIDLC Workspace v3.dc.html:91-211`). Title,
 * description, and work type map to real `CreateEpicInput` fields
 * (`EpicService.ts:64`) and dispatch the existing `epic.create` command.
 * `profile` isn't in the mockup and isn't asked here — omitted from the
 * payload so the backend applies its own default.
 *
 * "Pipeline" and "Workflow pack" are two distinct real systems, both wired:
 * Pipeline = `state.registry.pipelines` (the registry/StepRunner the Epics
 * tab's step flow canvas already renders) — real id, real step count, real
 * compiled chain (`pipeline.steps.map(s => s.id)`), started via the existing
 * `registry.pipeline.run` command. Workflow pack = `state.workflowPacks`
 * (the older compiled-workflow/stage system the Studio tab uses), started
 * via the existing `workflow.compile` command. Neither list nor its step
 * count is fabricated. Quick-fill sources have no backend integration at
 * all. Starting autonomy and the locked-config preview are fully
 * interactive/computed client-side (from the selected pipeline) but still
 * `<NeedsLogic>`-wrapped and excluded from the submitted payload: there is
 * no `epic.create` field that accepts a single autonomy mode (it wants a
 * full `AutonomyPolicy`), and there is no real "lock" enforcement endpoint.
 */
export function NewEpicModal({ state, client, onClose }: { state: V3WorkspaceState; client: V3ApplicationClient; onClose: () => void }) {
  const t = useI18n();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<V3EpicSummary['type']>('feature');
  const [pipelineId, setPipelineId] = useState<string | undefined>(state.registry.pipelines[0]?.id);
  const [packId, setPackId] = useState<string | undefined>(state.workflowPacks[0]?.id);
  const [autonomyMode, setAutonomyMode] = useState<V3AutonomyMode>('guide');
  const command = createV3CommandFactory('epic');
  const selectedPipeline = state.registry.pipelines.find((p) => p.id === pipelineId);
  const epicId = useMemo(() => (title.trim() ? slugify(title) : '<epic-id>'), [title]);

  const create = () => {
    if (!title.trim()) return;
    client.dispatch(command('epic.create', { id: epicId, title: title.trim(), description: description.trim() || undefined, type }));
    if (pipelineId) client.dispatch(command('registry.pipeline.run', { epicId, pipelineId }));
    if (packId) client.dispatch(command('workflow.compile', { epicId, packId }));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center bg-black/50 pt-14" role="dialog" aria-modal="true" aria-label="New Epic">
      <div className="flex max-h-[calc(100vh-3.5rem)] w-[820px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-2xl">
        <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3.5">
          <div className="flex h-5.5 w-5.5 items-center justify-center rounded-md bg-primary text-[12px] font-bold text-primary-foreground">A</div>
          <div className="flex-1">
            <h2 className="text-[13.5px] font-bold text-foreground">{t.newEpic.title}</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">{t.newEpic.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground">{t.common.esc}</button>
        </header>

        <div className="flex-1 space-y-3.5 overflow-auto p-4">
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {t.newEpic.titleLabel}
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t.newEpic.titlePlaceholder} className="rounded border border-border bg-card px-3 py-2.5 text-[13px] text-foreground outline-none" />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{t.newEpic.descLabel}</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t.newEpic.descPlaceholder} className="min-h-16 rounded border border-border bg-card px-3 py-2.5 text-xs text-foreground outline-none" />
            <div className="flex gap-1.5">
              <NeedsLogic note="Chưa có nguồn requirement liên kết"><button type="button" className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground">{t.newEpic.fromReq}</button></NeedsLogic>
              <NeedsLogic note="Chưa có tích hợp Jira"><button type="button" className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground">{t.newEpic.fromJira}</button></NeedsLogic>
              <NeedsLogic note="Chưa có command đọc selection trong editor"><button type="button" className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground">{t.newEpic.fromEditorSelection}</button></NeedsLogic>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{t.newEpic.workType}</span>
            <div className="flex gap-1.5">
              {TYPES.map((item) => (
                <button type="button" key={item} onClick={() => setType(item)} className={`flex-1 rounded-md py-2 text-xs ${type === item ? 'border border-primary/40 bg-primary/10 text-primary' : 'border border-border text-foreground'}`}>{t.workTypes[item]}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-md border border-primary/30 bg-primary/5 p-3">
            <span className="text-primary">◉</span>
            <div className="flex-1">
              <p className="text-xs font-semibold text-foreground">{t.newEpic.projectContextPrefix}{state.project.contextRevision ?? t.newEpic.notPublishedYet}</p>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">{t.newEpic.snapshotNote}</p>
            </div>
          </div>

          {state.registry.pipelines.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">{t.newEpic.pipelineLabel}</span>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {state.registry.pipelines.map((pipeline) => (
                  <button type="button" key={pipeline.id} onClick={() => setPipelineId(pipeline.id)} className={`rounded-md p-2.5 text-left ${pipelineId === pipeline.id ? 'border border-primary/40 bg-primary/10' : 'border border-border'}`}>
                    <p className="truncate font-mono text-xs font-semibold text-foreground">{pipeline.id}</p>
                    <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{pipeline.steps.length} {t.builder.stepUnit} · {pipeline.source}</p>
                  </button>
                ))}
              </div>
              {selectedPipeline && <p className="rounded-md border border-border bg-card px-2.5 py-2 font-mono text-[11.5px] text-muted-foreground">{selectedPipeline.steps.map((s) => s.id).join(' → ')}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {state.workflowPacks.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">{t.newEpic.workflowPackLabel}</span>
                <div className="flex flex-col gap-1">
                  {state.workflowPacks.map((pack) => (
                    <button type="button" key={pack.id} onClick={() => setPackId(pack.id)} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left ${packId === pack.id ? 'border border-primary/40 bg-primary/10' : 'border border-border'}`}>
                      <span className="flex-1 truncate font-mono text-xs text-foreground">{pack.label}</span>
                      <span className="shrink-0 truncate text-[10.5px] text-muted-foreground">{pack.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">{t.newEpic.startingAutonomyLabel}</span>
              <NeedsLogic block note="Chưa gửi được: AutonomyPolicy cần đủ schemaVersion/stages/gates/recovery, epic sẽ dùng mặc định project">
                <div className="flex w-full flex-col gap-1">
                  {V3_AUTONOMY_MODES.map((mode) => (
                    <button type="button" key={mode} onClick={() => setAutonomyMode(mode)} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left ${autonomyMode === mode ? 'border border-primary/40 bg-primary/10' : 'border border-border'}`}>
                      <span className={autonomyMode === mode ? 'text-primary' : 'text-muted-foreground'}>{autonomyMode === mode ? '◉' : '○'}</span>
                      <span className="shrink-0 font-mono text-xs text-foreground">{t.autonomy[mode]}</span>
                      <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground">{t.newEpic.autonomyModeDesc[mode]}</span>
                    </button>
                  ))}
                </div>
              </NeedsLogic>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t.newEpic.startingAutonomyHint}</p>
            </div>
          </div>

          <NeedsLogic block note="Không có endpoint lock thật — preview này chỉ tính từ pipeline đã chọn ở phía client">
            <div className="w-full overflow-hidden rounded-md border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <span className="text-[11.5px] font-semibold text-foreground">{t.newEpic.lockTitle}</span>
                <span className="flex-1" />
                <span className="text-[11px] text-primary">{t.newEpic.lockOverride}</span>
              </div>
              {[
                { k: t.newEpic.lockContextLabel, v: t.newEpic.lockContextValue.replace('{rev}', state.project.contextRevision ?? t.newEpic.notPublishedYet), why: selectedPipeline?.steps[0]?.id ?? '—' },
                { k: t.newEpic.lockBranchLabel, v: t.newEpic.lockBranchValue.replace('{id}', epicId), why: t.newEpic.lockBranchWhy },
                { k: t.newEpic.lockPrLabel, v: t.newEpic.lockPrValue, why: selectedPipeline ? selectedPipeline.steps.slice(-2).map((s) => s.id).join(' / ') : '—' },
                { k: t.newEpic.lockDecompositionLabel, v: t.newEpic.lockDecompositionValue, why: t.newEpic.lockDecompositionWhy },
                { k: t.newEpic.lockArtifactsLabel, v: t.newEpic.lockArtifactsValue, why: t.newEpic.lockArtifactsWhyPrefix + (selectedPipeline?.id ?? '—') },
              ].map((row) => (
                <div key={row.k} className="flex items-center gap-2.5 border-b border-border/60 px-3 py-2 text-[11.5px] last:border-b-0">
                  <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{row.k}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-foreground">{row.v}</span>
                  <span className="shrink-0 text-[10.5px] text-muted-foreground">{row.why}</span>
                </div>
              ))}
            </div>
          </NeedsLogic>
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
          <p className="flex-1 truncate font-mono text-[11px] text-muted-foreground">/aidlc epic start {epicId}</p>
          <button type="button" onClick={onClose} className="rounded border border-border px-3.5 py-2 text-xs text-foreground">{t.common.cancel}</button>
          <NeedsLogic note="Chưa có đường tạo draft riêng (epic.create luôn start epic)"><button type="button" className="rounded border border-border px-3.5 py-2 text-xs text-foreground">{t.newEpic.createDraft}</button></NeedsLogic>
          <button type="button" disabled={!title.trim()} onClick={create} className="rounded bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40">{t.newEpic.createRun}</button>
        </footer>
      </div>
    </div>
  );
}
