import { useState } from 'react';
import type { V3ApplicationClient, V3GatePreview } from '../contracts';
import { createV3CommandFactory, gateDecisionPayload } from '../contracts';
import { useI18n } from '../../lib/i18n';

/**
 * Gate approval modal (`re-design/AIDLC Workspace v3.dc.html:58-89`).
 * `reason` is a real field on the core `gate.approve`/`gate.reject` command
 * payload (`AidlcApplication.ts:264`) — not a stub — so it's threaded
 * through for real, required before a reject can be submitted.
 */
export function GatePreview({ epicId, preview, client, onClose }: {
  epicId: string;
  preview: V3GatePreview;
  client: V3ApplicationClient;
  onClose?: () => void;
}) {
  const t = useI18n();
  const [reason, setReason] = useState('');
  const command = createV3CommandFactory('gate');
  const dispatch = (decision: 'approved' | 'rejected') => {
    client.dispatch(command(decision === 'approved' ? 'gate.approve' : 'gate.reject', gateDecisionPayload(epicId, preview, decision, reason.trim() || undefined)));
    onClose?.();
  };
  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center bg-black/50 pt-20" role="dialog" aria-modal="true" aria-label="Approval required">
      <section className="w-[620px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border-2 border-destructive/40 bg-popover shadow-2xl">
        <header className="flex items-center gap-2.5 border-b border-border bg-destructive/10 px-4 py-3.5">
          <span className="text-base">🔒</span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-foreground">{t.gate.approvalRequiredPrefix}<span className="font-mono">{preview.gate}</span></h3>
            {preview.hard && <p className="mt-0.5 text-[11px] text-muted-foreground">{t.gate.hardGateNote}</p>}
          </div>
          {onClose && <button type="button" onClick={onClose} className="shrink-0 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground">{t.common.esc}</button>}
        </header>
        <div className="flex flex-col gap-3 p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">{preview.contentSummary}</p>
          {(preview.destination || preview.mutationScope.length > 0) && (
            <div className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t.gate.ifApproved}</p>
              {preview.destination && <p className="break-all font-mono text-xs text-foreground">{preview.destination}</p>}
              {preview.mutationScope.length > 0 && <p className="text-xs text-muted-foreground">{t.gate.scopePrefix}{preview.mutationScope.join(', ')}</p>}
            </div>
          )}
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {t.gate.reasonLabel}
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t.gate.reasonPlaceholder} className="rounded border border-border bg-background px-2.5 py-2 text-xs text-foreground outline-none" />
          </label>
          {preview.hard && <p className="text-[11px] text-destructive">{t.gate.hardGateNoSkip}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" disabled={!reason.trim()} onClick={() => dispatch('rejected')} className="rounded border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive disabled:opacity-40">{t.common.reject}</button>
            <button type="button" onClick={() => dispatch('approved')} className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">{t.common.approve}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
