import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import mermaid from 'mermaid';

import type { ArchitectureEdge, ArchitectureExplorerState, ArchitectureFeature, ArchitectureNode, EpicFeatureImpact, EpicSummary } from '@/lib/types';
import { postMessage } from '@/lib/bridge';
import { usePanelFullscreen } from '@/hooks/usePanelFullscreen';

type Level = 'overview' | 'features' | 'screens' | 'flow';
type Language = 'en' | 'vi';

const copy = {
  en: {
    title: 'Architecture', intro: 'Read the project from its overall shape to a code feature tree, a screen tree, then a feature flow.',
    overview: '1. Overview', features: '2. Code tree', screens: '3. Screen tree', flow: '4. Feature Flow', selectFeature: 'Choose a feature to view its code flow.',
    generateProject: 'Generate Overview + Trees', generateFlow: 'Generate Feature Flow…', noDiagram: 'No diagram is available for this feature yet.',
    codeFlow: 'Code flow', surfaces: 'Surfaces',
    visualOverview: 'Visual overview', technicalOverview: 'Technical overview', renderVisual: 'Render verified overview',
    zoomOut: 'Zoom out', zoomIn: 'Zoom in', resetZoom: 'Reset zoom', panHint: 'Drag to pan · Ctrl + scroll to zoom',
    enterFullscreen: 'Full screen', exitFullscreen: 'Exit full screen',
    notStarted: 'Not started', inProgress: 'In progress', done: 'Done',
  },
  vi: {
    title: 'Kiến trúc', intro: 'Đọc dự án từ hình dạng tổng thể, cây feature theo code, cây theo màn hình, rồi luồng mã nguồn.',
    overview: '1. Tổng quan', features: '2. Cây code', screens: '3. Cây màn hình', flow: '4. Luồng tính năng', selectFeature: 'Chọn một tính năng để xem luồng mã nguồn.',
    generateProject: 'Tạo Tổng quan + Cây', generateFlow: 'Tạo Luồng tính năng…', noDiagram: 'Tính năng này chưa có sơ đồ luồng.',
    codeFlow: 'Luồng mã', surfaces: 'Surfaces',
    visualOverview: 'Tổng quan trực quan', technicalOverview: 'Tổng quan kỹ thuật', renderVisual: 'Tạo tổng quan đã kiểm chứng',
    zoomOut: 'Thu nhỏ', zoomIn: 'Phóng to', resetZoom: 'Đặt lại tỷ lệ', panHint: 'Giữ chuột để kéo · Ctrl + lăn chuột để zoom',
    enterFullscreen: 'Toàn màn hình', exitFullscreen: 'Thoát toàn màn hình',
    notStarted: 'Chưa làm', inProgress: 'Đang làm', done: 'Đã làm',
  },
} as const;

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function id(value: unknown): string {
  const text = asText(value) || 'unknown';
  return `n_${text.replace(/[^A-Za-z0-9_]/g, '_')}`;
}
function label(value: unknown): string {
  // Mermaid's parser is stricter than HTML: preserve readable text while
  // removing grammar tokens that can turn generated repository labels into
  // diagram syntax.
  return asText(value).replace(/[\\"\[\]{}|<>]/g, '').replace(/[\r\n]+/g, ' ').trim();
}

function overviewDiagram(nodes: readonly ArchitectureNode[], edges: readonly ArchitectureEdge[]): string {
  const lines = ['flowchart TD'];
  for (const node of nodes) {
    if (!asText(node.id) && !asText(node.label)) continue;
    lines.push(`  ${id(node.id || node.label)}["${label(node.label || node.id)}"]`);
  }
  for (const edge of edges) {
    if (!asText(edge.source) || !asText(edge.target)) continue;
    lines.push(`  ${id(edge.source)} --> ${id(edge.target)}`);
  }
  return lines.join('\n');
}

/** Level 2 is a feature tree: app → area/parent → feature → entry. */
function featureMapDiagram(
  features: readonly ArchitectureFeature[],
  epics: readonly EpicSummary[],
  text: typeof copy.en | typeof copy.vi,
): string {
  const impact = impactByFeatureId(epics);
  const byId = new Set(features.map((feature) => feature.id));
  const lines = [
    'flowchart TD',
    '  app["APP"]',
  ];
  const drawn = new Set<string>();
  const areas = new Set<string>();
  for (const feature of features) {
    const area = feature.area?.trim() || feature.module?.trim();
    if (area && !feature.parent) areas.add(area);
  }
  for (const area of areas) {
    const areaId = id(`area_${area}`);
    lines.push(`  app --> ${areaId}["${label(area)}"]`);
  }
  for (const feature of features) {
    if (!asText(feature.id) && !asText(feature.name)) continue;
    drawn.add(feature.id);
    const featureId = id(`feature_${feature.id || feature.name}`);
    const overlay = impact.get(feature.id);
    const status = overlay?.change ?? featureDelivery(feature, epics).status;
    const statusLabel = overlay
      ? overlay.change
      : status === 'done' ? text.done : status === 'in_progress' ? text.inProgress : text.notStarted;
    const parentId = feature.parent && byId.has(feature.parent)
      ? id(`feature_${feature.parent}`)
      : (feature.area?.trim() || feature.module?.trim()) && !feature.parent
        ? id(`area_${(feature.area ?? feature.module)!.trim()}`)
        : 'app';
    lines.push(`  ${parentId} --> ${featureId}["${label(feature.name || feature.id)} (${statusLabel})"]`);
    lines.push(`  style ${featureId} ${featureStyle(status)}`);
    for (const [index, entry] of (feature.entrypoints ?? []).slice(0, 4).entries()) {
      if (!asText(entry.label)) continue;
      const participantId = id(`entry_${feature.id}_${index}`);
      lines.push(`  ${featureId} --> ${participantId}["${label(entry.label)}"]`);
    }
  }
  for (const [featureId, overlay] of impact) {
    if (drawn.has(featureId) || overlay.change === 'unchanged') continue;
    const nodeId = id(`feature_${featureId}`);
    lines.push(`  app --> ${nodeId}["${label(overlay.name || featureId)} (${overlay.change})"]`);
    lines.push(`  style ${nodeId} ${featureStyle(overlay.change)}`);
  }
  return lines.join('\n');
}

function impactByFeatureId(epics: readonly EpicSummary[]): Map<string, EpicFeatureImpact> {
  const map = new Map<string, EpicFeatureImpact>();
  const ordered = [...epics].sort((left, right) => Number(right.status === 'in_progress') - Number(left.status === 'in_progress'));
  for (const epic of ordered) {
    for (const feature of epic.visualizations?.impactFeatures ?? []) {
      if (!map.has(feature.id) || epic.status === 'in_progress') map.set(feature.id, feature);
    }
  }
  return map;
}

function featureStyle(status: string): string {
  if (status === 'add' || status === 'done') return 'fill:#166534,stroke:#4ade80,color:#f0fdf4';
  if (status === 'modify' || status === 'in_progress') return 'fill:#92400e,stroke:#fbbf24,color:#fffbeb';
  if (status === 'delete' || status === 'failed') return 'fill:#7f1d1d,stroke:#f87171,color:#fef2f2';
  return 'fill:#374151,stroke:#9ca3af,color:#f9fafb';
}

type FeatureDeliveryStatus = 'not_started' | 'in_progress' | 'done';

function normalized(value: string | undefined): string {
  return asText(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Architecture features are discovered from the codebase, while delivery
 * progress lives in Epics. Match their stable ids/names conservatively so the
 * explorer can show a useful status without changing either persisted model.
 */
function featureMatchesEpic(feature: ArchitectureFeature, epic: EpicSummary): boolean {
  const featureKeys = [feature.id, feature.name].map(normalized).filter(Boolean);
  const epicKeys = [epic.id, epic.title].map(normalized).filter(Boolean);
  return featureKeys.some((featureKey) => epicKeys.some((epicKey) =>
    featureKey === epicKey || (featureKey.length >= 4 && epicKey.includes(featureKey)) || (epicKey.length >= 4 && featureKey.includes(epicKey)),
  ));
}

function featureDelivery(feature: ArchitectureFeature, epics: readonly EpicSummary[]): {
  status: FeatureDeliveryStatus;
  epic?: EpicSummary;
} {
  const linked = epics.filter((epic) => featureMatchesEpic(feature, epic));
  const active = linked.find((epic) => epic.status === 'in_progress');
  if (active) { return { status: 'in_progress', epic: active }; }
  const completed = linked.find((epic) => epic.status === 'done');
  if (completed) { return { status: 'done', epic: completed }; }
  return { status: 'not_started', epic: linked[0] };
}

function MermaidDiagram({ source, empty, text }: { source?: string; empty: string; text: typeof copy.en | typeof copy.vi }) {
  const [svg, setSvg] = useState<string>();
  const [error, setError] = useState<string>();
  const [zoom, setZoom] = useState(100);
  const { fullscreen, toggle: toggleFullscreen } = usePanelFullscreen();
  const diagramRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const viewRef = useRef({ x: 0, y: 0 });
  const panRef = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number } | undefined>(undefined);
  const applyTransform = (nextZoom = zoom) => {
    const view = viewRef.current;
    const canvas = canvasRef.current;
    if (canvas) canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${nextZoom / 100})`;
  };
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
    const element = canvasRef.current?.querySelector('svg');
    if (!element) return;
    element.style.width = '100%';
    element.style.height = 'auto';
    element.style.maxWidth = 'none';
    applyTransform();
  }, [svg, zoom]);
  useEffect(() => {
    const viewport = diagramRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const current = zoomRef.current;
      const nextZoom = Math.max(50, Math.min(250, current - event.deltaY * 0.08));
      if (nextZoom === current) return;
      const rect = viewport.getBoundingClientRect();
      const ratio = nextZoom / current;
      const view = viewRef.current;
      view.x = (1 - ratio) * (event.clientX - rect.left - rect.width / 2) + ratio * view.x;
      view.y = (1 - ratio) * (event.clientY - rect.top - rect.height / 2) + ratio * view.y;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${nextZoom / 100})`;
      setZoom(nextZoom);
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [svg]);
  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const viewport = event.currentTarget;
    viewport.setPointerCapture(event.pointerId);
    panRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: viewRef.current.x, y: viewRef.current.y };
    viewport.style.cursor = 'grabbing';
    event.preventDefault();
  };
  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    viewRef.current = { x: pan.x + event.clientX - pan.clientX, y: pan.y + event.clientY - pan.clientY };
    applyTransform();
    event.preventDefault();
  };
  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = undefined;
    event.currentTarget.style.cursor = 'grab';
  };
  if (!source) return <p className="p-6 text-sm text-muted-foreground">{empty}</p>;
  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  return <div className={fullscreen ? 'fixed inset-0 z-50 flex flex-col bg-background' : 'flex min-h-[520px] flex-col'} onWheel={fullscreen ? (event) => event.stopPropagation() : undefined}>
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
      <span className="text-xs text-muted-foreground">{text.panHint}</span>
      <div className="flex items-center gap-1">
      <button type="button" title={text.zoomOut} aria-label={text.zoomOut} onClick={() => setZoom((value) => Math.max(50, value - 25))} disabled={zoom <= 50} className="h-7 w-7 rounded border border-border text-sm text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">−</button>
      <button type="button" title={text.resetZoom} aria-label={text.resetZoom} onClick={() => { viewRef.current = { x: 0, y: 0 }; applyTransform(100); setZoom(100); }} className="min-w-12 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent">{zoom}%</button>
      <button type="button" title={text.zoomIn} aria-label={text.zoomIn} onClick={() => setZoom((value) => Math.min(250, value + 25))} disabled={zoom >= 250} className="h-7 w-7 rounded border border-border text-sm text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">+</button>
      <FullscreenButton active={fullscreen} enterLabel={text.enterFullscreen} exitLabel={text.exitFullscreen} onClick={toggleFullscreen} />
      </div>
    </div>
    <div ref={diagramRef} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onDragStart={(event) => event.preventDefault()} className="min-h-0 flex-1 cursor-grab overflow-hidden select-none">
      <div ref={canvasRef} className="flex min-h-full min-w-full items-center justify-center p-5 will-change-transform [&_svg]:max-w-none" dangerouslySetInnerHTML={{ __html: svg ?? '' }} />
    </div>
  </div>;
}

/** Additive, feature-centric explorer. It consumes generated artifacts only and never owns Epic state. */
export function ArchitectureExplorer({ architecture, epics, language }: {
  architecture: ArchitectureExplorerState;
  epics: EpicSummary[];
  language: Language;
}) {
  const text = copy[language];
  const [level, setLevel] = useState<Level>('overview');
  const [featureId, setFeatureId] = useState<string>();
  const [flowKind, setFlowKind] = useState<'code' | 'surfaces'>('code');
  const [overviewRenderer, setOverviewRenderer] = useState<'visual' | 'technical'>(architecture.archifyOverviewSvgBase64 ? 'visual' : 'technical');
  useEffect(() => {
    if (architecture.archifyOverviewSvgBase64) setOverviewRenderer('visual');
  }, [architecture.archifyOverviewSvgBase64]);
  const flow = featureId ? architecture.featureFlows[featureId] : undefined;
  const source = useMemo(() => {
    if (level === 'overview') return overviewDiagram(architecture.layers, architecture.edges);
    if (level === 'features') return featureMapDiagram(architecture.features, epics, text);
    if (level === 'screens') return featureMapDiagram(architecture.screens ?? [], [], text);
    return flowKind === 'surfaces' ? flow?.surfacesMermaid : flow?.mermaid;
  }, [architecture, epics, flow?.mermaid, flow?.surfacesMermaid, flowKind, level, text]);

  if (!architecture.available) {
    return <div className="rounded-md border border-dashed border-border bg-card p-6"><h1 className="text-lg font-semibold text-foreground">{text.title}</h1><p className="mt-2 text-sm text-muted-foreground">{architecture.message}</p><DiagramActions text={text} /></div>;
  }

  return <div className="space-y-4">
    <header><h1 className="text-lg font-semibold text-foreground">{text.title}</h1><p className="mt-1 text-xs text-muted-foreground">{text.intro}</p></header>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => setLevel('overview')} className={tabClass(level === 'overview')}>{text.overview}</button>
      <button type="button" onClick={() => setLevel('features')} className={tabClass(level === 'features')}>{text.features}</button>
      <button type="button" onClick={() => setLevel('screens')} className={tabClass(level === 'screens')}>{text.screens}</button>
      <button type="button" onClick={() => setLevel('flow')} className={tabClass(level === 'flow')}>{text.flow}</button>
    </div>
    <DiagramActions compact text={text} canRender />
    {level === 'overview' && architecture.archifyOverviewSvgBase64 && (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setOverviewRenderer('visual')} className={tabClass(overviewRenderer === 'visual')}>{text.visualOverview}</button>
        <button type="button" onClick={() => setOverviewRenderer('technical')} className={tabClass(overviewRenderer === 'technical')}>{text.technicalOverview}</button>
      </div>
    )}
    {level === 'flow' && <div className="flex flex-wrap gap-2">{architecture.features.map((feature) => <button key={feature.id} type="button" onClick={() => setFeatureId(feature.id)} className={`rounded-md border px-2.5 py-1 text-xs ${feature.id === featureId ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}>{feature.name}</button>)}</div>}
    {level === 'flow' && featureId && (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setFlowKind('code')} className={tabClass(flowKind === 'code')}>{text.codeFlow}</button>
        <button type="button" onClick={() => setFlowKind('surfaces')} className={tabClass(flowKind === 'surfaces')}>{text.surfaces}</button>
      </div>
    )}
    <section className="min-h-[520px] overflow-hidden rounded-md border border-border bg-card">
      {level === 'overview' && overviewRenderer === 'visual' && architecture.archifyOverviewSvgBase64
        ? <ArchifyOverview svgBase64={architecture.archifyOverviewSvgBase64} title={text.visualOverview} text={text} />
        : <MermaidDiagram source={source} empty={level === 'flow' && !featureId ? text.selectFeature : text.noDiagram} text={text} />}
    </section>
  </div>;
}

function ArchifyOverview({ svgBase64, title, text }: { svgBase64: string; title: string; text: typeof copy.en | typeof copy.vi }) {
  const { fullscreen, toggle } = usePanelFullscreen();
  return <div className={fullscreen ? 'fixed inset-0 z-50 flex flex-col bg-background' : 'flex h-[720px] flex-col'} onWheel={fullscreen ? (event) => event.stopPropagation() : undefined}>
    <div className="flex items-center justify-end border-b border-border px-3 py-2">
      <FullscreenButton active={fullscreen} enterLabel={text.enterFullscreen} exitLabel={text.exitFullscreen} onClick={toggle} />
    </div>
    <div className="min-h-0 flex-1 overflow-auto bg-background p-4">
      <img
        src={`data:image/svg+xml;base64,${svgBase64}`}
        alt={title}
        className="block h-auto min-w-[1200px] max-w-none w-full"
      />
    </div>
  </div>;
}

function FullscreenButton({ active, enterLabel, exitLabel, onClick }: {
  active: boolean;
  enterLabel: string;
  exitLabel: string;
  onClick: () => void;
}) {
  const label = active ? exitLabel : enterLabel;
  const Icon = active ? Minimize2 : Maximize2;
  return <button type="button" title={label} aria-label={label} aria-pressed={active} onClick={onClick} className="inline-flex h-7 w-7 items-center justify-center rounded border border-border text-foreground hover:bg-accent">
    <Icon className="h-3.5 w-3.5" />
  </button>;
}

function DiagramActions({ compact = false, text, canRender = false }: { compact?: boolean; text: typeof copy.en | typeof copy.vi; canRender?: boolean }) {
  return <div className={`flex flex-wrap gap-2 ${compact ? '' : 'mt-4'}`}>
    <button type="button" onClick={() => postMessage({ type: 'generateArchitectureProjectMap' })} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">{text.generateProject}</button>
    {canRender && <button type="button" onClick={() => postMessage({ type: 'renderArchifyOverview' })} className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">{text.renderVisual}</button>}
    <button type="button" onClick={() => postMessage({ type: 'generateArchitectureFeatureFlow' })} className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent">{text.generateFlow}</button>
  </div>;
}

function tabClass(active: boolean): string {
  return active ? 'rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground' : 'rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent';
}
