import { useEffect, useMemo, useState } from 'react';
import mermaid from 'mermaid';

import type { ArchitectureEdge, ArchitectureExplorerState, ArchitectureFeature, ArchitectureNode } from '@/lib/types';
import { postMessage } from '@/lib/bridge';

type Level = 'overview' | 'features' | 'flow';
type Language = 'en' | 'vi';

const copy = {
  en: {
    title: 'Architecture', intro: 'Read the project from its overall shape to a feature, then its code flow.',
    overview: '1. Overview', features: '2. Features', flow: '3. Feature Flow', selectFeature: 'Choose a feature to view its code flow.',
    generateProject: 'Generate Overview + Features', generateFlow: 'Generate Feature Flow…', noDiagram: 'No diagram is available for this feature yet.',
  },
  vi: {
    title: 'Kiến trúc', intro: 'Đọc dự án từ hình dạng tổng thể, đến tính năng, rồi đến luồng mã nguồn.',
    overview: '1. Tổng quan', features: '2. Tính năng', flow: '3. Luồng tính năng', selectFeature: 'Chọn một tính năng để xem luồng mã nguồn.',
    generateProject: 'Tạo Tổng quan + Tính năng', generateFlow: 'Tạo Luồng tính năng…', noDiagram: 'Tính năng này chưa có sơ đồ luồng.',
  },
} as const;

function id(value: string): string { return `n_${value.replace(/[^A-Za-z0-9_]/g, '_')}`; }
function label(value: string): string { return value.replace(/"/g, '\\"').replace(/\n/g, '<br/>'); }

function overviewDiagram(nodes: readonly ArchitectureNode[], edges: readonly ArchitectureEdge[]): string {
  const lines = ['flowchart TD'];
  for (const node of nodes) lines.push(`  ${id(node.id)}["${label(node.label)}"]`);
  for (const edge of edges) {
    const edgeLabel = edge.label && edge.label.length <= 28 ? `|${label(edge.label)}|` : '';
    lines.push(`  ${id(edge.source)} -->${edgeLabel} ${id(edge.target)}`);
  }
  return lines.join('\n');
}

/** Level 2 is deliberately feature-first: app → feature → real entry/code participant. */
function featureMapDiagram(features: readonly ArchitectureFeature[]): string {
  const lines = ['flowchart TD', '  app["APP"]'];
  for (const feature of features) {
    const featureId = id(`feature_${feature.id}`);
    lines.push(`  app --> ${featureId}["${label(feature.name)}"]`);
    for (const [index, entry] of (feature.entrypoints ?? []).slice(0, 4).entries()) {
      const participantId = id(`entry_${feature.id}_${index}`);
      const participant = entry.symbol ? `${entry.label}<br/><small>${entry.symbol}</small>` : entry.label;
      lines.push(`  ${featureId} --> ${participantId}["${label(participant)}"]`);
    }
  }
  return lines.join('\n');
}

function MermaidDiagram({ source, empty }: { source?: string; empty: string }) {
  const [svg, setSvg] = useState<string>();
  useEffect(() => {
    if (!source) { setSvg(undefined); return; }
    let active = true;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default', flowchart: { curve: 'basis', htmlLabels: true } });
    void mermaid.render(`aidlc-diagram-${Date.now()}`, source)
      .then((result) => { if (active) setSvg(result.svg); })
      .catch(() => { if (active) setSvg(undefined); });
    return () => { active = false; };
  }, [source]);
  if (!source) return <p className="p-6 text-sm text-muted-foreground">{empty}</p>;
  return <div className="overflow-auto p-5 [&_svg]:min-w-full [&_svg]:max-w-none" dangerouslySetInnerHTML={{ __html: svg ?? '' }} />;
}

/** Additive, feature-centric explorer. It consumes generated artifacts only and never owns Epic state. */
export function ArchitectureExplorer({ architecture, language }: { architecture: ArchitectureExplorerState; language: Language }) {
  const text = copy[language];
  const [level, setLevel] = useState<Level>('overview');
  const [featureId, setFeatureId] = useState<string>();
  const flow = featureId ? architecture.featureFlows[featureId] : undefined;
  const source = useMemo(() => {
    if (level === 'overview') return overviewDiagram(architecture.layers, architecture.edges);
    if (level === 'features') return featureMapDiagram(architecture.features);
    return flow?.mermaid;
  }, [architecture, flow?.mermaid, level]);

  if (!architecture.available) {
    return <div className="rounded-md border border-dashed border-border bg-card p-6"><h1 className="text-lg font-semibold text-foreground">{text.title}</h1><p className="mt-2 text-sm text-muted-foreground">{architecture.message}</p><DiagramActions text={text} /></div>;
  }

  return <div className="space-y-4">
    <header><h1 className="text-lg font-semibold text-foreground">{text.title}</h1><p className="mt-1 text-xs text-muted-foreground">{text.intro}</p></header>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => setLevel('overview')} className={tabClass(level === 'overview')}>{text.overview}</button>
      <button type="button" onClick={() => setLevel('features')} className={tabClass(level === 'features')}>{text.features}</button>
      <button type="button" onClick={() => setLevel('flow')} className={tabClass(level === 'flow')}>{text.flow}</button>
    </div>
    <DiagramActions compact text={text} />
    {level === 'flow' && <div className="flex flex-wrap gap-2">{architecture.features.map((feature) => <button key={feature.id} type="button" onClick={() => setFeatureId(feature.id)} className={`rounded-md border px-2.5 py-1 text-xs ${feature.id === featureId ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}>{feature.name}</button>)}</div>}
    <section className="min-h-[520px] overflow-hidden rounded-md border border-border bg-card">
      <MermaidDiagram source={source} empty={level === 'flow' && !featureId ? text.selectFeature : text.noDiagram} />
    </section>
  </div>;
}

function DiagramActions({ compact = false, text }: { compact?: boolean; text: typeof copy.en | typeof copy.vi }) {
  return <div className={`flex flex-wrap gap-2 ${compact ? '' : 'mt-4'}`}>
    <button type="button" onClick={() => postMessage({ type: 'generateArchitectureProjectMap' })} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">{text.generateProject}</button>
    <button type="button" onClick={() => postMessage({ type: 'generateArchitectureFeatureFlow' })} className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">{text.generateFlow}</button>
  </div>;
}

function tabClass(active: boolean): string {
  return active ? 'rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground' : 'rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent';
}
