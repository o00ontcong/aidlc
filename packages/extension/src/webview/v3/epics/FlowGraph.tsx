import { computeFlowGraph, type FlowNodeInput } from '../../lib/flowGraph';
import type { V3StageSummary } from '../contracts';

/** SVG rendering over the tested, grid-derived layout helper. */
export function FlowGraph({ stages, reject }: { stages: readonly V3StageSummary[]; reject?: { from: string; to: string } }) {
  const nodes: FlowNodeInput[] = stages.map((stage) => ({
    id: stage.id,
    label: stage.id,
    meta: stage.status,
    kind: stage.status === 'completed' ? 'done' : stage.status === 'running' ? 'active' : stage.status === 'waiting-for-user' || stage.status === 'review' ? 'gate' : 'todo',
  }));
  const layout = computeFlowGraph(nodes, reject);
  return <div className="overflow-x-auto rounded-md border border-border bg-card p-2"><svg viewBox={`0 0 1140 ${layout.height}`} className="min-w-[700px]" role="img" aria-label="Pipeline flow graph">
    {layout.connectors.map((connector, index) => <path key={index} d={connector.d} fill="none" stroke="currentColor" className={connector.done ? 'text-primary' : 'text-muted-foreground'} strokeDasharray={connector.done ? undefined : '4 4'} />)}
    {layout.loop && <><path d={layout.loop.d} fill="none" stroke="currentColor" className="text-amber-600" strokeDasharray="4 4" /><text x={layout.loop.label.x} y={layout.loop.label.y} className="fill-amber-600 text-[10px]">reject → rerun</text></>}
    {layout.nodes.map((node) => <g key={node.id} transform={`translate(${node.x} ${node.y})`}><rect width={node.width} height={node.height} rx="6" className={node.kind === 'done' ? 'fill-primary/10 stroke-primary' : node.kind === 'active' ? 'fill-primary/20 stroke-primary' : node.kind === 'gate' ? 'fill-amber-500/10 stroke-amber-500' : 'fill-card stroke-border'} /><text x="10" y="23" className="fill-foreground text-[12px] font-medium capitalize">{node.label}</text><text x="10" y="40" className="fill-muted-foreground text-[10px] capitalize">{node.meta}</text></g>)}
  </svg></div>;
}
