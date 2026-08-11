import { useState } from 'react';
import { NeedsLogic } from '../shell/NeedsLogic';
import { useI18n } from '../../lib/i18n';

const KINDS = ['pipeline', 'agent', 'skill'] as const;
type Kind = (typeof KINDS)[number];

/**
 * Add pipeline/agent/skill modal (`re-design/AIDLC Workspace
 * v3.dc.html:213-378`). Entirely `<NeedsLogic>` — there is no
 * `registry.agent|skill|pipeline.create` command in `V3_COMMAND_NAMES` or
 * `ExtensionV3Host` yet, only the read-only registry projection and the
 * run/rerun/gate commands. Renders the intended layout so the shape is
 * visible ahead of that backend work.
 */
export function AddRegistryItemModal({ initialKind = 'pipeline', onClose }: { initialKind?: Kind; onClose: () => void }) {
  const t = useI18n();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [id, setId] = useState('');
  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center bg-black/50 pt-14" role="dialog" aria-modal="true" aria-label="Add registry item">
      <div className="flex max-h-[calc(100vh-3.5rem)] w-[780px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-2xl">
        <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3.5">
          <h2 className="flex-1 text-[13.5px] font-bold text-foreground">{t.addItem.titlePrefix}{t.kinds[kind]}</h2>
          <button type="button" onClick={onClose} className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground">{t.common.esc}</button>
        </header>
        <div className="flex-1 space-y-3.5 overflow-auto p-4">
          <div className="flex gap-1.5">
            {KINDS.map((item) => <button type="button" key={item} onClick={() => setKind(item)} className={`flex-1 rounded-md py-2 text-xs ${kind === item ? 'border border-primary/40 bg-primary/10 text-primary' : 'border border-border text-foreground'}`}>{t.kinds[item]}</button>)}
          </div>
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {t.addItem.idLabel}
            <input value={id} onChange={(event) => setId(event.target.value)} placeholder={`${t.addItem.idPlaceholderPrefix}${kind}`} className="rounded border border-border bg-card px-3 py-2 font-mono text-xs text-foreground outline-none" />
          </label>
          <NeedsLogic block note={`Chưa có registry.${kind}.create/update/delete command`}>
            <div className="w-full rounded-md border border-dashed border-border bg-card p-3 text-[11px] text-muted-foreground">
              {t.addItem.notWiredBody.replace('{kind}', t.kinds[kind])}
            </div>
          </NeedsLogic>
        </div>
        <footer className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
          <p className="flex-1 truncate font-mono text-[11px] text-muted-foreground">.aidlc/{kind}s/{id.trim() || '<id>'}{kind === 'pipeline' ? '.yaml' : '.md'}</p>
          <button type="button" onClick={onClose} className="rounded border border-border px-3.5 py-2 text-xs text-foreground">{t.common.cancel}</button>
          <NeedsLogic note={`Chưa có registry.${kind}.create command`}><button type="button" className="rounded bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">{t.addItem.createPrefix}{t.kinds[kind]}</button></NeedsLogic>
        </footer>
      </div>
    </div>
  );
}
