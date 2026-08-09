import type { V3ApplicationClient, V3GatePreview } from '../contracts';
import { createV3CommandFactory, gateDecisionPayload } from '../contracts';

export function GatePreview({ epicId, preview, client }: {
  epicId: string;
  preview: V3GatePreview;
  client: V3ApplicationClient;
}) {
  const command = createV3CommandFactory('gate');
  const dispatch = (decision: 'approved' | 'rejected') => {
    client.dispatch(command(decision === 'approved' ? 'gate.approve' : 'gate.reject', gateDecisionPayload(epicId, preview, decision)));
  };
  return (
    <section className="rounded-md border border-amber-500/50 bg-amber-500/5 p-4" aria-label="Approval required">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Approval required</h3>
          <p className="mt-1 text-xs text-muted-foreground">{preview.contentSummary}</p>
        </div>
        {preview.hard && <span className="rounded bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">HARD GATE</span>}
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Gate</dt><dd className="font-mono text-foreground">{preview.gate}</dd></div>
        {preview.destination && <div><dt className="text-muted-foreground">Destination</dt><dd className="break-all text-foreground">{preview.destination}</dd></div>}
      </dl>
      {preview.mutationScope.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Scope: {preview.mutationScope.join(', ')}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => dispatch('approved')} className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Approve</button>
        <button type="button" onClick={() => dispatch('rejected')} className="rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">Reject</button>
      </div>
    </section>
  );
}
