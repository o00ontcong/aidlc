import { useState } from 'react';
import type { V3ApplicationClient, V3EpicSummary, V3Profile, V3WorkspaceState } from '../contracts';
import { createV3CommandFactory } from '../contracts';
import { NeedsLogic } from '../shell/NeedsLogic';
import { useI18n } from '../../lib/i18n';

const TYPES: readonly V3EpicSummary['type'][] = ['feature', 'bug', 'refactor', 'spike', 'maintenance'];
const PROFILE_IDS: readonly V3Profile[] = ['quick', 'standard', 'parallel', 'regulated'];

function slugify(title: string): string {
  const base = title.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${base || 'EPIC'}-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * New Epic modal (`re-design/AIDLC Workspace v3.dc.html:91-211`). Title,
 * description, work type, and profile map to real `CreateEpicInput` fields
 * (`EpicService.ts:64`) and dispatch the existing `epic.create` command.
 * Fields with no backend shape yet (quick-fill sources, workflow-pack picker
 * distinct from profile, starting-autonomy override, locked-config preview)
 * are rendered per the mockup but `<NeedsLogic>`-wrapped and excluded from
 * the submitted payload.
 */
export function NewEpicModal({ state, client, onClose }: { state: V3WorkspaceState; client: V3ApplicationClient; onClose: () => void }) {
  const t = useI18n();
  const PROFILES: readonly { id: V3Profile; label: string; desc: string }[] = PROFILE_IDS.map((id) => ({ id, ...t.profiles[id] }));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<V3EpicSummary['type']>('feature');
  const [profile, setProfile] = useState<V3Profile>('standard');
  const command = createV3CommandFactory('epic');

  const create = () => {
    if (!title.trim()) return;
    client.dispatch(command('epic.create', { id: slugify(title), title: title.trim(), description: description.trim() || undefined, type, profile }));
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

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{t.newEpic.profileLabel}</span>
            <div className="grid grid-cols-4 gap-1.5">
              {PROFILES.map((item) => (
                <button type="button" key={item.id} onClick={() => setProfile(item.id)} className={`rounded-md p-2.5 text-left ${profile === item.id ? 'border border-primary/40 bg-primary/10' : 'border border-border'}`}>
                  <p className="text-xs font-semibold text-foreground">{item.label}</p>
                  <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">{t.newEpic.workflowPackLabel}</span>
              <NeedsLogic block note="Workflow pack chọn ở đây chưa có field trong CreateEpicInput — hiện chỉ compile được sau khi tạo epic, ở tab Studio">
                <div className="w-full rounded-md border border-dashed border-border bg-card p-2.5 text-[11px] text-muted-foreground">{t.newEpic.workflowPackNote}</div>
              </NeedsLogic>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">{t.newEpic.startingAutonomyLabel}</span>
              <NeedsLogic block note="Chưa gửi được: AutonomyPolicy cần đủ schemaVersion/stages/gates/recovery, epic sẽ dùng mặc định project">
                <div className="w-full rounded-md border border-dashed border-border bg-card p-2.5 text-[11px] text-muted-foreground">{t.newEpic.startingAutonomyNote}</div>
              </NeedsLogic>
            </div>
          </div>

          <NeedsLogic block note="Chưa có endpoint xem trước cấu hình sẽ bị lock">
            <div className="w-full rounded-md border border-dashed border-border bg-card p-3 text-[11px] text-muted-foreground">{t.newEpic.lockedConfigNote}</div>
          </NeedsLogic>
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
          <p className="flex-1 truncate font-mono text-[11px] text-muted-foreground">/aidlc epic start {title.trim() ? slugify(title) : '<id>'}</p>
          <button type="button" onClick={onClose} className="rounded border border-border px-3.5 py-2 text-xs text-foreground">{t.common.cancel}</button>
          <NeedsLogic note="Chưa có đường tạo draft riêng (epic.create luôn start epic)"><button type="button" className="rounded border border-border px-3.5 py-2 text-xs text-foreground">{t.newEpic.createDraft}</button></NeedsLogic>
          <button type="button" disabled={!title.trim()} onClick={create} className="rounded bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40">{t.newEpic.createRun}</button>
        </footer>
      </div>
    </div>
  );
}
