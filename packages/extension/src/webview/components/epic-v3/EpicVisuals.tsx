import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import mermaid from 'mermaid';

import type { EpicSummary, EpicVisualizations } from '@/lib/types';
import { usePanelFullscreen } from '@/hooks/usePanelFullscreen';
import { briefingGraphTabs, briefingSummary, isBriefingPipeline, isProjectContextPipeline, primaryFlowMermaid } from './epic-logic';
import { Card, CardHeader, CardNote, CardTitle, Spacer } from './primitives';

export function EpicVisualsCard({ epic }: { epic: EpicSummary }) {
  const graphs = epic.visualizations;
  const hasAny = Boolean(graphs?.impactMermaid || graphs?.surfacesMermaid || graphs?.flowMermaid || graphs?.screensMermaid);
  const briefing = isBriefingPipeline(epic.pipeline);
  if (!hasAny && !briefing) return null;
  if (briefing) return <BriefingVisuals epic={epic} empty={!hasAny} />;
  return <TabbedVisuals graphs={graphs} empty={!hasAny} />;
}

type GraphTab = { id: string; label: string; src: string; title: string };

function graphTabs(graphs: EpicVisualizations | undefined, isContext: boolean, always = false): GraphTab[] {
  return briefingGraphTabs(graphs, isContext ? 'project-context' : 'feature-spike', always);
}

function GraphTabBar({
  tabs, activeId, onSelect,
}: {
  tabs: GraphTab[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (tabs.length === 0) return null;
  return (
    <div
      role="tablist"
      aria-label="Flow graph"
      style={{
        marginLeft: 'auto', display: 'flex', flex: 'none',
        border: '1px solid var(--bd)', borderRadius: 7, overflow: 'hidden',
      }}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            title={tab.title}
            onClick={() => onSelect(tab.id)}
            style={{
              cursor: 'pointer', font: 'inherit', fontSize: 11, padding: '5px 11px',
              border: 0,
              borderRight: index < tabs.length - 1 ? '1px solid var(--bd)' : 0,
              background: selected ? 'var(--acc-bg)' : 'transparent',
              color: selected ? 'var(--acc-txt)' : 'var(--txt2)',
              fontWeight: selected ? 600 : 500,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function BriefingVisuals({ epic, empty }: { epic: EpicSummary; empty: boolean }) {
  const isContext = isProjectContextPipeline(epic.pipeline);
  const tabs = useMemo(
    () => briefingGraphTabs(epic.visualizations, epic.pipeline, !empty),
    [epic.visualizations, epic.pipeline, empty],
  );
  const preferred = primaryFlowMermaid(epic.visualizations, epic.pipeline);
  const defaultId = tabs.find((tab) => tab.src === preferred)?.id ?? tabs[0]?.id ?? 'flow';
  const [tabId, setTabId] = useState(defaultId);
  useEffect(() => {
    if (!tabs.some((tab) => tab.id === tabId)) setTabId(defaultId);
  }, [defaultId, tabId, tabs]);
  const active = tabs.find((tab) => tab.id === tabId) ?? tabs[0];

  return (
    <Card style={{ overflow: 'hidden' }}>
      <CardHeader wrap>
        <CardTitle>{isContext ? 'Baseline repo' : 'Epic này sẽ làm gì'}</CardTitle>
        <CardNote>
          {isContext
            ? 'SUMMARY từ CONTEXT-REVIEW.md. Ba graph: Kiến trúc + Cây code (FEATURE-CATALOG) + Cây màn hình (SCREEN-CATALOG). Surfaces thuộc feature-spike, không phải baseline repo.'
            : 'SUMMARY + AC từ MISSION.md. Ba graph: Luồng / Surfaces / Cây feature — không SPEC/PLAN/CONTRACT.'}
        </CardNote>
        <Spacer />
        <GraphTabBar tabs={tabs} activeId={active?.id ?? defaultId} onSelect={setTabId} />
      </CardHeader>
      {!isContext && empty && (
        <div
          style={{
            margin: '0 14px 10px', padding: '8px 10px', borderRadius: 6,
            border: '1px solid var(--warn-bd)', background: 'var(--warn-bg)',
            color: 'var(--warn)', fontSize: 12, lineHeight: 1.5,
          }}
        >
          Pack chưa đủ — thiếu Summary, AC (testable), Flow mermaid, In/Out. Graph Surfaces/Impact do spike ghi.
        </div>
      )}
      {isContext && empty && (
        <div
          style={{
            margin: '0 14px 10px', padding: '8px 10px', borderRadius: 6,
            border: '1px solid var(--warn-bd)', background: 'var(--warn-bg)',
            color: 'var(--warn)', fontSize: 12, lineHeight: 1.5,
          }}
        >
          Chưa đọc được graph tại `docs/project/context/visualization/` (`PROJECT-ARCHITECTURE`, `FEATURE-CATALOG`, `SCREEN-CATALOG`). Pipeline phải ghi đúng folder đó (cạnh file .json). Reload AIDLC Workspace — extension sẽ tạo file tại đúng path nếu chưa có.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <pre
          style={{
            margin: 0, padding: 14, maxHeight: 220, overflow: 'auto',
            borderBottom: '1px solid var(--bd)',
            fontSize: 12, lineHeight: 1.55, color: 'var(--txt)', whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
          }}
        >
          {briefingSummary(epic)}
        </pre>
        <div style={{ minHeight: 280, overflow: 'hidden' }}>
          {empty || !active ? (
            <p style={{ margin: 0, padding: '12px 14px', fontSize: 12, color: 'var(--txt3)' }}>
              Chưa có graph.
            </p>
          ) : (
            <>
              {active.id === 'impact' && !isContext && <ImpactLegend />}
              <EpicMermaid source={active.src} empty="Graph này chưa có Mermaid." />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function TabbedVisuals({
  graphs, empty,
}: {
  graphs?: EpicVisualizations;
  empty: boolean;
}) {
  const tabs = useMemo(() => graphTabs(graphs, false), [graphs]);
  const [tabId, setTabId] = useState(tabs[0]?.id ?? 'impact');
  useEffect(() => {
    if (!tabs.some((tab) => tab.id === tabId)) setTabId(tabs[0]?.id ?? 'impact');
  }, [tabId, tabs]);
  const active = tabs.find((tab) => tab.id === tabId) ?? tabs[0];

  return (
    <Card style={{ overflow: 'hidden' }}>
      <CardHeader wrap>
        <CardTitle>Epic này sẽ làm gì</CardTitle>
        <CardNote>Luồng / Surfaces / Cây feature. Agent code theo MISSION.md (AC không copy vào graph).</CardNote>
        {!empty && <GraphTabBar tabs={tabs} activeId={active?.id ?? 'impact'} onSelect={setTabId} />}
      </CardHeader>
      {empty || !active
        ? <p style={{ margin: 0, padding: '12px 14px', fontSize: 12, color: 'var(--txt3)' }}>
            Chưa có graph.
          </p>
        : <>
          {active.id === 'impact' && <ImpactLegend />}
          <EpicMermaid source={active.src} empty="Graph này chưa có Mermaid." />
        </>}
    </Card>
  );
}

function ImpactLegend() {
  const items: Array<{ color: string; label: string }> = [
    { color: '#4ade80', label: 'thêm' },
    { color: '#fbbf24', label: 'sửa' },
    { color: '#f87171', label: 'xoá' },
    { color: '#9ca3af', label: 'không đụng' },
  ];
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 14px 0', fontSize: 11, color: 'var(--txt3)' }}>
      {items.map((item) => (
        <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function EpicMermaid({ source, empty }: { source?: string; empty: string }) {
  const [svg, setSvg] = useState<string>();
  const [error, setError] = useState<string>();
  const [zoom, setZoom] = useState(100);
  const { fullscreen, toggle: toggleFullscreen } = usePanelFullscreen();
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
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
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
      flowchart: { curve: 'basis', htmlLabels: false },
    });
    void mermaid.render(`aidlc-epic-${Date.now()}`, source)
      .then((result) => { if (active) setSvg(result.svg); })
      .catch((reason: unknown) => {
        if (active) { setSvg(undefined); setError(reason instanceof Error ? reason.message : 'Không render được Mermaid.'); }
      });
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
    const viewport = viewportRef.current;
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

  if (!source) return <p style={{ margin: 0, padding: '12px 14px', fontSize: 12, color: 'var(--txt3)' }}>{empty}</p>;
  if (error) return <p style={{ margin: 0, padding: '12px 14px', fontSize: 12, color: 'var(--err)' }}>{error}</p>;

  return (
    <div
      onWheel={fullscreen ? (event) => event.stopPropagation() : undefined}
      style={fullscreen
        ? { position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: 'var(--bg)', minHeight: 0 }
        : { minHeight: 280, display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, padding: '6px 10px' }}>
        <button type="button" title="Thu nhỏ graph" onClick={() => setZoom((value) => Math.max(50, value - 25))} disabled={zoom <= 50} style={zoomBtn}>{'\u2212'}</button>
        <button type="button" title="Reset zoom 100% và về giữa. Zoom: Ctrl + lăn chuột" onClick={() => { viewRef.current = { x: 0, y: 0 }; applyTransform(100); setZoom(100); }} style={zoomBtn}>{zoom}%</button>
        <button type="button" title="Phóng to graph" onClick={() => setZoom((value) => Math.min(250, value + 25))} disabled={zoom >= 250} style={zoomBtn}>+</button>
        <button
          type="button"
          title={fullscreen ? 'Thoát toàn màn hình (Esc)' : 'Toàn màn hình'}
          aria-label={fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
          aria-pressed={fullscreen}
          onClick={toggleFullscreen}
          style={zoomBtn}
        >
          <FullscreenGlyph on={fullscreen} />
        </button>
      </div>
      <div
        ref={viewportRef}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          panRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: viewRef.current.x, y: viewRef.current.y };
          event.currentTarget.style.cursor = 'grabbing';
        }}
        onPointerMove={(event) => {
          const pan = panRef.current;
          if (!pan || pan.pointerId !== event.pointerId) return;
          viewRef.current = { x: pan.x + event.clientX - pan.clientX, y: pan.y + event.clientY - pan.clientY };
          applyTransform();
        }}
        onPointerUp={(event) => {
          if (panRef.current?.pointerId !== event.pointerId) return;
          panRef.current = undefined;
          event.currentTarget.style.cursor = 'grab';
        }}
        onPointerCancel={(event) => {
          if (panRef.current?.pointerId !== event.pointerId) return;
          panRef.current = undefined;
          event.currentTarget.style.cursor = 'grab';
        }}
        style={{ flex: 1, minHeight: fullscreen ? 0 : 240, cursor: 'grab', overflow: 'hidden', userSelect: 'none' }}
      >
        <div
          ref={canvasRef}
          style={{ minHeight: '100%', minWidth: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
          dangerouslySetInnerHTML={{ __html: svg ?? '' }}
        />
      </div>
    </div>
  );
}

function FullscreenGlyph({ on }: { on: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {on
        ? <><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></>
        : <><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></>}
    </svg>
  );
}

const zoomBtn: CSSProperties = {
  minWidth: 28, height: 24, borderRadius: 6, border: '1px solid var(--bd)',
  background: 'transparent', color: 'var(--txt2)', font: 'inherit', fontSize: 11, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
