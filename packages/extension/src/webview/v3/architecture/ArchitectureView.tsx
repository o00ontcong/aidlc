import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, type Edge, type Node, type NodeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import mermaid from 'mermaid';

import type { V3ApplicationClient, V3ArchitectureNode, V3WorkspaceState } from '../contracts';
import { createV3CommandFactory } from '../contracts';

type Level = 'overview' | 'features' | 'flow';
const colors: Record<string, string> = { presentation: '#2563eb', domain: '#7c3aed', data: '#059669', external: '#ea580c' };

function toNodes(nodes: readonly V3ArchitectureNode[]): Node[] {
  return nodes.map((node, index) => ({
    id: node.id,
    position: { x: (index % 3) * 235, y: Math.floor(index / 3) * 120 },
    data: { label: node.label },
    style: { border: `1px solid ${colors[node.layer ?? ''] ?? '#64748b'}`, borderRadius: 9, padding: 8, background: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground)', minWidth: 150 },
  }));
}
function toEdges(edges: readonly { source: string; target: string; label?: string }[]): Edge[] { return edges.map((edge, index) => ({ id: `${edge.source}-${edge.target}-${index}`, source: edge.source, target: edge.target, label: edge.label, animated: false })); }

function MermaidPreview({ source }: { source?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    if (!source) { setSvg(''); return; }
    let live = true;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark' });
    void mermaid.render(`feature-flow-${Date.now()}`, source).then((result) => { if (live) setSvg(result.svg); }).catch(() => { if (live) setSvg(''); });
    return () => { live = false; };
  }, [source]);
  if (!source) return null;
  return <section className="rounded-md border border-border bg-card p-3"><p className="text-xs font-medium text-foreground">Mermaid source</p>{svg ? <div className="mt-2 overflow-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <pre className="mt-2 overflow-auto text-[10px] text-muted-foreground">{source}</pre>}</section>;
}

export function ArchitectureView({ state, client }: { state: V3WorkspaceState; client: V3ApplicationClient }) {
  const architecture = state.architecture;
  const [level, setLevel] = useState<Level>('overview');
  const [featureId, setFeatureId] = useState<string>();
  const [selected, setSelected] = useState<V3ArchitectureNode>();
  const command = createV3CommandFactory('architecture');
  const flow = featureId ? architecture.featureFlows[featureId] : undefined;
  const graph = useMemo(() => {
    if (level === 'overview') return { nodes: architecture.layers, edges: architecture.edges };
    if (level === 'features') return { nodes: architecture.features.map((feature) => ({ id: `feature:${feature.id}`, label: feature.name, kind: 'feature', role: feature.summary })), edges: [] };
    return { nodes: flow?.nodes ?? [], edges: flow?.edges ?? [] };
  }, [architecture, flow, level]);
  const onNodeClick: NodeMouseHandler = (_event, node) => {
    const match = graph.nodes.find((item) => item.id === node.id || `feature:${item.id}` === node.id);
    if (match) setSelected(match);
  };
  if (!architecture.available) return <div className="rounded-md border border-dashed border-border p-6"><h1 className="text-xl font-semibold text-foreground">Architecture Explorer</h1><p className="mt-2 text-sm text-muted-foreground">{architecture.message ?? 'Run Project Context through “Map Features” to generate the feature-centric architecture model.'}</p></div>;
  return <div className="space-y-4"><header><h1 className="text-xl font-semibold text-foreground">Architecture Explorer</h1><p className="mt-1 text-xs text-muted-foreground">Start broad, then follow a feature to its code participants. This is a curated model, not a file-count graph.</p></header>
    <div className="flex flex-wrap gap-2">{(['overview', 'features', 'flow'] as Level[]).map((item) => <button key={item} type="button" onClick={() => setLevel(item)} className={`rounded px-3 py-1.5 text-xs capitalize ${level === item ? 'bg-primary text-primary-foreground' : 'border border-border text-foreground hover:bg-accent'}`}>{item === 'overview' ? '1. Overview' : item === 'features' ? '2. Features' : '3. Feature Flow'}</button>)}</div>
    {level !== 'overview' && <div className="flex flex-wrap gap-2">{architecture.features.map((feature) => <button key={feature.id} type="button" onClick={() => { setFeatureId(feature.id); setLevel('flow'); }} className={`rounded border px-2 py-1 text-xs ${featureId === feature.id ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>{feature.name} · {feature.confidence ?? 'unknown'}</button>)}</div>}
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]"><section className="h-[430px] overflow-hidden rounded-md border border-border bg-card"><ReactFlow nodes={toNodes(graph.nodes)} edges={toEdges(graph.edges)} fitView onNodeClick={onNodeClick}><Background /><Controls /><MiniMap /></ReactFlow></section>
      <aside className="rounded-md border border-border bg-card p-3"><p className="text-xs font-medium text-foreground">{selected?.label ?? 'Select a node'}</p>{selected ? <><p className="mt-2 text-xs text-muted-foreground">{selected.role ?? selected.kind ?? 'Architecture participant'}</p>{selected.file && <><p className="mt-3 break-all font-mono text-[10px] text-muted-foreground">{selected.file}</p><button type="button" className="mt-3 rounded border border-border px-2 py-1 text-xs hover:bg-accent" onClick={() => client.dispatch(command('architecture.source.open', { path: selected.file }))}>Open Source</button></>}</> : <p className="mt-2 text-xs text-muted-foreground">Click a layer, feature, or code participant to inspect its role and open its source.</p>}</aside></div>
    {level === 'flow' && <MermaidPreview source={flow?.mermaid} />}
  </div>;
}
