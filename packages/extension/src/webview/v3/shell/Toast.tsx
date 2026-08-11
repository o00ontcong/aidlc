import { NeedsLogic } from './NeedsLogic';
import { useI18n } from '../../lib/i18n';

export interface ToastState {
  readonly title: string;
  readonly body: string;
  readonly canReload: boolean;
}

/**
 * Bottom-right confirmation toast from the redesign
 * (`re-design/AIDLC Workspace v3.dc.html:1357-1372`), shown by
 * `V3WorkspaceShell` after a successful preset-apply / epic-create result.
 * "Reload VS Code" is `<NeedsLogic>` — no v3 reload-window bridge exists yet.
 */
export function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  const t = useI18n();
  return (
    <div className="fixed bottom-8 right-5 z-40 w-88 max-w-[22rem] rounded-lg border border-primary/40 bg-popover p-3 shadow-2xl">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-primary">✓</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">{toast.title}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{toast.body}</p>
        </div>
        <button type="button" onClick={onDismiss} aria-label={t.common.dismiss} className="text-muted-foreground">✕</button>
      </div>
      {toast.canReload && (
        <div className="mt-3 flex gap-2">
          <NeedsLogic block note="Chưa có command reload VS Code cho v3"><button type="button" className="flex-1 rounded bg-primary py-1.5 text-[11px] font-medium text-primary-foreground">{t.toast.reloadVsCode}</button></NeedsLogic>
          <button type="button" onClick={onDismiss} className="rounded border border-border px-3 py-1.5 text-[11px] text-foreground">{t.common.later}</button>
        </div>
      )}
    </div>
  );
}
