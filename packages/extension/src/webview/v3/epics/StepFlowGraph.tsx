import { useState } from 'react';
import { computeFlowGraph, type FlowNodeInput } from '../../lib/flowGraph';
import type { V3ApplicationClient, V3PipelineRun, V3RegistryPipeline, V3StepRunStatus } from '../contracts';
import { createV3CommandFactory, registryStepPayload } from '../contracts';
import { useI18n } from '../../lib/i18n';

const STATUS_KIND: Record<V3StepRunStatus, FlowNodeInput['kind']> = {
  'awaiting-work': 'todo',
  running: 'active',
  'auto-review': 'active',
  'human-review': 'gate',
  done: 'done',
  failed: 'gate',
};
const STATUS_STYLE: Record<V3StepRunStatus, string> = {
  'awaiting-work': 'fill-card stroke-border',
  running: 'fill-primary/15 stroke-primary',
  'auto-review': 'fill-primary/15 stroke-primary',
  'human-review': 'fill-amber-500/15 stroke-amber-500',
  done: 'fill-primary/10 stroke-primary/60',
  failed: 'fill-destructive/15 stroke-destructive',
};
const STATUS_TEXT: Record<V3StepRunStatus, string> = {
  'awaiting-work': 'text-muted-foreground', running: 'text-primary', 'auto-review': 'text-primary',
  'human-review': 'text-amber-600 dark:text-amber-300', done: 'text-primary', failed: 'text-destructive',
};
const STATUS_ICON: Record<V3StepRunStatus, string> = { 'awaiting-work': '○', running: '●', 'auto-review': '●', 'human-review': '🔒', done: '✓', failed: '✕' };

/**
 * Step-level pipeline flow + action list for the Epics detail view
 * (`re-design/AIDLC Workspace v3.dc.html:743-810` + step list at :864-896).
 * Renders `V3RegistryPipeline`/`V3PipelineRun` — real data that already
 * existed in `contracts/types.ts` but was unused by any view — and dispatches
 * the already-registered `registry.*` commands (`registerRegistryCommands.ts`
 * / `registerV3Extension.ts`'s `registry.` branch). Nothing here is a stub.
 */
export function StepFlowGraph({ epicId, pipeline, run, client }: {
  epicId: string;
  pipeline: V3RegistryPipeline;
  run: V3PipelineRun;
  client: V3ApplicationClient;
}) {
  const t = useI18n();
  const command = createV3CommandFactory('registry');
  const runStepById = new Map(run.steps.map((step) => [step.id, step]));
  const statusOf = (stepId: string): V3StepRunStatus => runStepById.get(stepId)?.status ?? 'awaiting-work';
  const nodes: FlowNodeInput[] = pipeline.steps.map((step) => ({ id: step.id, label: step.id, meta: statusOf(step.id).replaceAll('-', ' '), kind: STATUS_KIND[statusOf(step.id)] }));
  const layout = computeFlowGraph(nodes);
  const act = (name: 'registry.step.run' | 'registry.step.complete' | 'registry.step.rerun' | 'registry.gate.approve', stepId: string) =>
    client.dispatch(command(name, registryStepPayload(epicId, pipeline.id, stepId)));
  const reject = (stepId: string, reason: string) => client.dispatch(command('registry.gate.reject', registryStepPayload(epicId, pipeline.id, stepId, { reason })));

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-md border border-border bg-card p-2">
        <svg viewBox={`0 0 1140 ${layout.height}`} className="min-w-[700px]" role="img" aria-label="Pipeline step flow">
          {layout.connectors.map((connector, index) => <path key={index} d={connector.d} fill="none" stroke="currentColor" className={connector.done ? 'text-primary' : 'text-muted-foreground'} strokeDasharray={connector.done ? undefined : '4 4'} />)}
          {layout.nodes.map((node) => {
            const status = statusOf(node.id);
            const attempt = runStepById.get(node.id)?.attempt ?? 1;
            return (
              <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
                <rect width={node.width} height={node.height} rx="6" className={STATUS_STYLE[status]} />
                <text x="10" y="18" className={`${STATUS_TEXT[status]} fill-current text-[12px]`}>{STATUS_ICON[status]}</text>
                <text x="26" y="23" className="fill-foreground text-[12px] font-medium font-mono">{node.label}</text>
                <text x="10" y="40" className="fill-muted-foreground text-[10px] capitalize">{node.meta}{attempt > 1 ? ` · ${t.stepFlow.attempt} ${attempt}` : ''}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="divide-y divide-border rounded-md border border-border bg-card">
        {pipeline.steps.map((step) => {
          const status = statusOf(step.id);
          const runStep = runStepById.get(step.id);
          return (
            <li key={step.id} className={status === 'failed' ? 'bg-destructive/5' : ''}>
              <div className="flex items-center gap-3 p-3">
                <span className={`w-4 shrink-0 text-center text-xs ${STATUS_TEXT[status]}`}>{STATUS_ICON[status]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-foreground">{step.id}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{status}{step.humanReview ? ` · ${t.stepFlow.humanReview}` : step.autoReview ? ` · ${t.stepFlow.autoReview}` : ''}</p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {status === 'awaiting-work' && <button type="button" onClick={() => act('registry.step.run', step.id)} className="rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-accent">{t.stepFlow.runWithClaude}</button>}
                  {status === 'running' && <button type="button" onClick={() => act('registry.step.complete', step.id)} className="rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-accent">{t.stepFlow.markStepDone}</button>}
                  {(status === 'human-review' || status === 'auto-review') && <>
                    <button type="button" onClick={() => act('registry.gate.approve', step.id)} className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground">{t.common.approve}</button>
                    <RejectAction onReject={(reason) => reject(step.id, reason)} />
                  </>}
                  {status === 'failed' && <button type="button" onClick={() => act('registry.step.rerun', step.id)} className="rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-accent">{t.stepFlow.runAgainWithClaude}</button>}
                  {status === 'done' && <button type="button" onClick={() => act('registry.step.rerun', step.id)} className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent">{t.stepFlow.rerun}</button>}
                </div>
              </div>
              {runStep?.feedback && <p className="px-3 pb-3 pl-10 font-mono text-[11px] leading-relaxed text-destructive">{runStep.feedback}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RejectAction({ onReject }: { onReject: (reason: string) => void }) {
  const t = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="rounded border border-destructive/40 px-2 py-1 text-[11px] text-destructive">{t.common.reject}</button>;
  return (
    <span className="flex items-center gap-1">
      <input autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t.stepFlow.reasonPlaceholder} className="w-28 rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground outline-none" />
      <button type="button" disabled={!reason.trim()} onClick={() => { onReject(reason.trim()); setOpen(false); setReason(''); }} className="rounded bg-destructive px-2 py-1 text-[11px] text-destructive-foreground disabled:opacity-40">{t.common.send}</button>
    </span>
  );
}
