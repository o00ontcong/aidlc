import { useEffect, useMemo, useRef, useState } from 'react';
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
    zoomOut: 'Zoom out', zoomIn: 'Zoom in', resetZoom: 'Reset zoom', panHint: 'Drag to pan · scroll to zoom',
  },
  vi: {
    title: 'Kiến trúc', intro: 'Đọc dự án từ hình dạng tổng thể, đến tính năng, rồi đến luồng mã nguồn.',
    overview: '1. Tổng quan', features: '2. Tính năng', flow: '3. Luồng tính năng', selectFeature: 'Chọn một tính năng để xem luồng mã nguồn.',
    generateProject: 'Tạo Tổng quan + Tính năng', generateFlow: 'Tạo Luồng tính năng…', noDiagram: 'Tính năng này chưa có sơ đồ luồng.',
    zoomOut: 'Thu nhỏ', zoomIn: 'Phóng to', resetZoom: 'Đặt lại tỷ lệ', panHint: 'Giữ chuột để kéo · lăn chuột để zoom',
  },
} as const;

function id(value: string): string { return `n_${value.replace(/[^A-Za-z0-9_]/g, '_')}`; }
function label(value: string): string {
  // Mermaid's parser is stricter than HTML: preserve readable text while
  // removing grammar tokens that can turn generated repository labels into
  // diagram syntax.
  return value.replace(/[\\"\[\]{}|<>]/g, '').replace(/[\r\n]+/g, ' ').trim();
}

function overviewDiagram(nodes: readonly ArchitectureNode[], edges: readonly ArchitectureEdge[]): string {
  const lines = ['flowchart TD'];
  for (const node of nodes) lines.push(`  ${id(node.id)}["${label(node.label)}"]`);
  for (const edge of edges) lines.push(`  ${id(edge.source)} --> ${id(edge.target)}`);
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
      lines.push(`  ${featureId} --> ${participantId}["${label(entry.label)}"]`);
    }
  }
  return lines.join('\n');
}

function MermaidDiagram({ source, empty, text }: { source?: string; empty: string; text: typeof copy.en | typeof copy.vi }) {
  const [svg, setSvg] = useState<string>();
  const [error, setError] = useState<string>();
  const [zoom, setZoom] = useState(100);
  const [isPanning, setIsPanning] = useState(false);
  const diagramRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; clientX: number; clientY: number; scrollLeft: number; scrollTop: number } | undefined>(undefined);
  useEffect(() => {
    if (!source) { setSvg(undefined); setError(undefined); return; }
    let active = true;
    setError(undefined);
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default', flowchart: { curve: 'basis', htmlLabels: false } });
    void mermaid.render(`aidlc-diagram-${Date.now()}`, source)
      .then((result) => { if (active) setSvg(result.svg); })
      .catch((reason: unknown) => { if (active) { setSvg(undefined); setError(reason instanceof Error ? reason.message : 'Mermaid could not render this diagram.'); } });
    return () => { active = false; };
  }, [source]);
  useEffect(() => {
    const element = diagramRef.current?.querySelector('svg');
    if (!element) return;
    element.style.width = `${zoom}%`;
    element.style.height = 'auto';
    element.style.maxWidth = 'none';
  }, [svg, zoom]);
  const zoomAtPointer = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const viewport = event.currentTarget;
    const rect = viewport.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const contentX = viewport.scrollLeft + offsetX;
    const contentY = viewport.scrollTop + offsetY;
    const nextZoom = Math.max(50, Math.min(250, zoom - event.deltaY * 0.08));
    if (nextZoom === zoom) return;
    const ratio = nextZoom / zoom;
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = contentX * ratio - offsetX;
      viewport.scrollTop = contentY * ratio - offsetY;
    });
  };
  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const viewport = event.currentTarget;
    viewport.setPointerCapture(event.pointerId);
    panRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop };
    setIsPanning(true);
  };
  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.currentTarget.scrollLeft = pan.scrollLeft - (event.clientX - pan.clientX);
    event.currentTarget.scrollTop = pan.scrollTop - (event.clientY - pan.clientY);
  };
  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = undefined;
    setIsPanning(false);
  };
  if (!source) return <p className="p-6 text-sm text-muted-foreground">{empty}</p>;
  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  return <div className="flex min-h-[520px] flex-col">
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
      <span className="text-xs text-muted-foreground">{text.panHint}</span>
      <div className="flex items-center gap-1">
      <button type="button" title={text.zoomOut} aria-label={text.zoomOut} onClick={() => setZoom((value) => Math.max(50, value - 25))} disabled={zoom <= 50} className="h-7 w-7 rounded border border-border text-sm text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">−</button>
      <button type="button" title={text.resetZoom} aria-label={text.resetZoom} onClick={() => setZoom(100)} className="min-w-12 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent">{zoom}%</button>
      <button type="button" title={text.zoomIn} aria-label={text.zoomIn} onClick={() => setZoom((value) => Math.min(250, value + 25))} disabled={zoom >= 250} className="h-7 w-7 rounded border border-border text-sm text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">+</button>
      </div>
    </div>
    <div ref={diagramRef} onWheel={zoomAtPointer} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} className={`min-h-0 flex-1 overflow-auto p-5 select-none [&_svg]:max-w-none ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`} dangerouslySetInnerHTML={{ __html: svg ?? '' }} />
  </div>;
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
      <MermaidDiagram source={source} empty={level === 'flow' && !featureId ? text.selectFeature : text.noDiagram} text={text} />
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
