import { useEffect, useMemo, useState } from 'react';
import { Background, Controls, ReactFlow, type Edge, type Node, type NodeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import mermaid from 'mermaid';

import type { ArchitectureEdge, ArchitectureExplorerState, ArchitectureFeature, ArchitectureNode } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { Modal } from './Modal';

type Level = 'overview' | 'features' | 'flow';

const layerColor: Record<string, string> = {
  presentation: 'var(--vscode-charts-blue, #3794ff)',
  domain: 'var(--vscode-charts-purple, #b180d7)',
  data: 'var(--vscode-charts-green, #89d185)',
  external: 'var(--vscode-charts-orange, #d7ba7d)',
};

function graphNodes(nodes: readonly ArchitectureNode[]): Node[] {
  return nodes.map((node, index) => ({
    id: node.id,
    position: { x: (index % 3) * 250, y: Math.floor(index / 3) * 120 },
    data: { label: node.label },
    style: {
      border: `1px solid ${layerColor[node.layer ?? ''] ?? 'var(--vscode-widget-border)'}`,
      borderRadius: 8,
      minWidth: 160,
      padding: 9,
      background: 'var(--vscode-editor-background)',
      color: 'var(--vscode-editor-foreground)',
    },
  }));
}

function graphEdges(edges: readonly ArchitectureEdge[]): Edge[] {
  return edges.map((edge, index) => ({
    id: `${edge.source}:${edge.target}:${index}`,
    ...edge,
    // Long relationship prose belongs in the selected-node inspector, not
    // across the graph where it obscures the architecture shape.
    label: edge.label && edge.label.length <= 28 ? edge.label : undefined,
  }));
}

/**
 * The catalog currently identifies feature participants/layers, not a second
 * call graph. Derive only the small set of shared-layer links so Level 2 has
 * a useful product map, and label them as dependencies rather than calls.
 */
function featureGraph(features: readonly ArchitectureFeature[], language: Language): { nodes: ArchitectureNode[]; edges: ArchitectureEdge[] } {
  const primaryLayer = (feature: ArchitectureFeature): string | undefined => {
    const layers = feature.layers ?? [];
    return layers.find((layer) => feature.id.includes(layer) || layer.includes(feature.id))
      ?? layers.find((layer) => feature.name.toLowerCase().includes(layer.replace(/-/g, ' ')))
      ?? (layers.length === 1 ? layers[0] : undefined);
  };
  const layerOwners = new Map<string, ArchitectureFeature>();
  for (const feature of features) {
    const layer = primaryLayer(feature);
    if (layer) layerOwners.set(layer, feature);
  }
  const labelFor = (layer: string): string => {
    if (language === 'vi') {
      if (layer === 'pet-shell') return 'mở từ';
      if (layer === 'persistence') return 'lưu vào';
      return 'dùng chung';
    }
    if (layer === 'pet-shell') return 'opens from';
    if (layer === 'persistence') return 'persists to';
    return 'uses shared';
  };
  const edges: ArchitectureEdge[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    for (const layer of feature.layers ?? []) {
      const owner = layerOwners.get(layer);
      if (!owner || owner.id === feature.id) continue;
      const key = `${feature.id}:${owner.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: `feature:${feature.id}`, target: `feature:${owner.id}`, label: labelFor(layer), confidence: 'inferred-shared-layer' });
    }
  }
  return {
    nodes: features.map((feature) => ({ id: `feature:${feature.id}`, label: feature.name, kind: 'feature', layer: primaryLayer(feature), role: feature.summary })),
    edges,
  };
}

function MermaidFlow({ source, title }: { source?: string; title: string }) {
  const [svg, setSvg] = useState<string>();
  useEffect(() => {
    if (!source) { setSvg(undefined); return; }
    let active = true;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default' });
    void mermaid.render(`aidlc-feature-flow-${Date.now()}`, source)
      .then((result) => { if (active) setSvg(result.svg); })
      .catch(() => { if (active) setSvg(undefined); });
    return () => { active = false; };
  }, [source]);
  if (!source) return null;
  return (
    <section className="rounded-md border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {svg ? <div className="mt-3 overflow-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <pre className="mt-3 overflow-auto text-xs text-muted-foreground">{source}</pre>}
    </section>
  );
}

/** Additive, feature-centric explorer. It consumes generated artifacts only and never owns Epic state. */
type Language = 'en' | 'vi';

const copy = {
  en: {
    title: 'Architecture', intro: 'Start with the project shape, choose a feature, then inspect the participating code. This is intentionally not a file-count diagram.',
    overview: '1. Overview', features: '2. Features', flow: '3. Feature Flow', mermaid: 'Mermaid flow',
    generateProject: 'Generate Overview + Features', generateFlow: 'Generate Feature Flow…', close: 'Close', openSource: 'Open Source',
    participant: 'Architecture participant', source: 'Source', role: 'Role', feature: 'Feature',
  },
  vi: {
    title: 'Kiến trúc', intro: 'Bắt đầu từ hình dạng dự án, chọn một tính năng, rồi xem các thành phần mã tham gia. Đây không phải sơ đồ đếm file.',
    overview: '1. Tổng quan', features: '2. Tính năng', flow: '3. Luồng tính năng', mermaid: 'Luồng Mermaid',
    generateProject: 'Tạo Tổng quan + Tính năng', generateFlow: 'Tạo Luồng tính năng…', close: 'Đóng', openSource: 'Mở mã nguồn',
    participant: 'Thành phần kiến trúc', source: 'Mã nguồn', role: 'Vai trò', feature: 'Tính năng',
  },
} as const;

export function ArchitectureExplorer({ architecture, language }: { architecture: ArchitectureExplorerState; language: Language }) {
  const text = copy[language];
  const [level, setLevel] = useState<Level>('overview');
  const [featureId, setFeatureId] = useState<string>();
  const [selected, setSelected] = useState<ArchitectureNode>();
  const flow = featureId ? architecture.featureFlows[featureId] : undefined;
  const graph = useMemo(() => {
    if (level === 'overview') return { nodes: architecture.layers, edges: architecture.edges };
    if (level === 'features') return featureGraph(architecture.features, language);
    return { nodes: flow?.nodes ?? [], edges: flow?.edges ?? [] };
  }, [architecture, flow, language, level]);
  const selectNode: NodeMouseHandler = (_event, node) => {
    const item = graph.nodes.find((candidate) => candidate.id === node.id || `feature:${candidate.id}` === node.id);
    if (item) setSelected(item);
  };

  if (!architecture.available) {
    return <div className="rounded-md border border-dashed border-border bg-card p-6"><h1 className="text-lg font-semibold text-foreground">{text.title}</h1><p className="mt-2 text-sm text-muted-foreground">{architecture.message}</p><DiagramActions text={text} /></div>;
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold text-foreground">{text.title}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{text.intro}</p>
      </header>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setLevel('overview')} className={tabClass(level === 'overview')}>{text.overview}</button>
        <button type="button" onClick={() => setLevel('features')} className={tabClass(level === 'features')}>{text.features}</button>
        <button type="button" onClick={() => setLevel('flow')} className={tabClass(level === 'flow')}>{text.flow}</button>
      </div>
      <DiagramActions compact text={text} />
      {level !== 'overview' && <div className="flex flex-wrap gap-2">{architecture.features.map((feature) => <button key={feature.id} type="button" onClick={() => { setFeatureId(feature.id); setLevel('flow'); }} className={`rounded-md border px-2.5 py-1 text-xs ${feature.id === featureId ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}>{feature.name}</button>)}</div>}
      <section className="aidlc-architecture-flow h-[calc(100vh-310px)] min-h-[520px] overflow-hidden rounded-md border border-border bg-card">
          <ReactFlow nodes={graphNodes(graph.nodes)} edges={graphEdges(graph.edges)} fitView onNodeClick={selectNode}><Background /><Controls /></ReactFlow>
      </section>
      {level === 'flow' && <MermaidFlow source={flow?.mermaid} title={text.mermaid} />}
      {selected && <NodeDialog node={selected} text={text} onClose={() => setSelected(undefined)} />}
    </div>
  );
}


function DiagramActions({ compact = false, text }: { compact?: boolean; text: typeof copy.en | typeof copy.vi }) {
  return <div className={`flex flex-wrap gap-2 ${compact ? '' : 'mt-4'}`}>
    <button type="button" onClick={() => postMessage({ type: 'generateArchitectureProjectMap' })} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">{text.generateProject}</button>
    <button type="button" onClick={() => postMessage({ type: 'generateArchitectureFeatureFlow' })} className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">{text.generateFlow}</button>
  </div>;
}

function NodeDialog({ node, text, onClose }: { node: ArchitectureNode; text: typeof copy.en | typeof copy.vi; onClose: () => void }) {
  return <Modal title={node.label} subtitle={node.kind === 'feature' ? text.feature : text.participant} onClose={onClose} maxWidth="max-w-lg">
    <dl className="space-y-4 text-sm">
      <div><dt className="text-xs font-medium text-muted-foreground">{text.role}</dt><dd className="mt-1 text-foreground">{node.role ?? node.kind ?? text.participant}</dd></div>
      {node.file && <div><dt className="text-xs font-medium text-muted-foreground">{text.source}</dt><dd className="mt-1 break-all font-mono text-xs text-foreground">{node.file}</dd><button type="button" onClick={() => postMessage({ type: 'openPath', path: node.file })} className="mt-3 rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-accent">{text.openSource}</button></div>}
    </dl>
    <div className="mt-5 flex justify-end"><button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">{text.close}</button></div>
  </Modal>;
}

function tabClass(active: boolean): string {
  return active ? 'rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground' : 'rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent';
}
