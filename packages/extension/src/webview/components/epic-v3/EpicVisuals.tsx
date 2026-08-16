import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import mermaid from 'mermaid';

import type { EpicSummary, EpicVisualizations } from '@/lib/types';
import { briefingSummary, isBriefingPipeline, primaryFlowMermaid } from './epic-logic';
import { Card, CardHeader, CardNote, CardTitle, Spacer } from './primitives';

export function EpicVisualsCard({ epic }: { epic: EpicSummary }) {
  const graphs = epic.visualizations;
  const hasAny = Boolean(graphs?.impactMermaid || graphs?.surfacesMermaid || graphs?.flowMermaid);
  const briefing = isBriefingPipeline(epic.pipeline);
  if (!hasAny && !briefing) return null;
  if (briefing) return <BriefingVisuals epic={epic} empty={!hasAny} />;
  return <TabbedVisuals graphs={graphs} empty={!hasAny} />;
}

type GraphTab = { id: string; label: string; src: string; title: string };

function graphTabs(graphs: EpicVisualizations | undefined, isContext: boolean, always = false): GraphTab[] {
  const tabs: GraphTab[] = [];
  if (always || graphs?.flowMermaid) {
    tabs.push({
      id: 'flow',
      label: isContext ? 'Kiến trúc' : 'Luồng',
      src: graphs?.flowMermaid ?? '',
      title: isContext ? 'Graph kiến trúc repo' : 'Luồng feature (đề xuất / as-built)',
    });
  }
  if (always || graphs?.surfacesMermaid) {
    tabs.push({
      id: 'surfaces',
      label: 'Surfaces',
      src: graphs?.surfacesMermaid ?? '',
      title: 'Màn hình / API epic chạm tới',
    });
  }
  if (always || graphs?.impactMermaid) {
    tabs.push({
      id: 'impact',
      label: 'Cây feature',
      src: graphs?.impactMermaid ?? '',
      title: 'Feature thêm / sửa / xoá',
    });
  }
  return tabs;
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
  const isContext = (epic.pipeline ?? '').startsWith('project-context') || epic.pipeline === 'project-context';
  const tabs = useMemo(
    () => graphTabs(epic.visualizations, isContext, !empty),
    [epic.visualizations, isContext, empty],
  );
  const preferred = primaryFlowMermaid(epic.visualizations);
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
            ? 'SUMMARY + graph kiến trúc. Phase nội bộ không Approve từng cái.'
            : 'SUMMARY + graph. Agent code theo một MISSION.md — không SPEC/PLAN/CONTRACT riêng.'}
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
          Pack chưa đủ — thiếu FLOW + AC + In/Out. Jira một dòng không được Start.
          Dán MISSION.md đủ heading hoặc copy từ spike.
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
              {active.id === 'impact' && <ImpactLegend />}
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
        <CardNote>Graph cho human. Agent code theo MISSION.md.</CardNote>
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
    <div style={{ minHeight: 280, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, padding: '6px 10px' }}>
        <button type="button" title="Thu nhỏ graph" onClick={() => setZoom((value) => Math.max(50, value - 25))} disabled={zoom <= 50} style={zoomBtn}>{'\u2212'}</button>
        <button type="button" title="Reset zoom 100% và về giữa. Zoom: Ctrl + lăn chuột" onClick={() => { viewRef.current = { x: 0, y: 0 }; applyTransform(100); setZoom(100); }} style={zoomBtn}>{zoom}%</button>
        <button type="button" title="Phóng to graph" onClick={() => setZoom((value) => Math.min(250, value + 25))} disabled={zoom >= 250} style={zoomBtn}>+</button>
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
        style={{ flex: 1, minHeight: 240, cursor: 'grab', overflow: 'hidden', userSelect: 'none' }}
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

const zoomBtn: CSSProperties = {
  minWidth: 28, height: 24, borderRadius: 6, border: '1px solid var(--bd)',
  background: 'transparent', color: 'var(--txt2)', font: 'inherit', fontSize: 11, cursor: 'pointer',
};
