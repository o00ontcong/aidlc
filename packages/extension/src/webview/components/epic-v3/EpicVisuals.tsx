import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import mermaid from 'mermaid';

import type { EpicSummary, EpicVisualizations, ScreenAreaDiagram } from '@/lib/types';
import { usePanelFullscreen } from '@/hooks/usePanelFullscreen';
import { useSvgDiagramViewport } from '@/hooks/useSvgDiagramViewport';
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
  const screenAreas = epic.visualizations?.screenAreas ?? [];
  const [screenAreaId, setScreenAreaId] = useState('map');
  useEffect(() => {
    if (tabId !== 'screens') setScreenAreaId('map');
  }, [tabId]);
  const screenSource = screenAreaId === 'map'
    ? active?.src
    : (screenAreas.find((area) => area.id === screenAreaId)?.mermaid ?? active?.src);

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
              {active.id === 'screens' && screenAreas.length > 0 && (
                <ScreenAreaBar
                  areas={screenAreas}
                  activeId={screenAreaId}
                  onSelect={setScreenAreaId}
                />
              )}
              <EpicMermaid
                source={active.id === 'screens' ? screenSource : active.src}
                empty="Graph này chưa có Mermaid."
                curve={active.id === 'screens' ? 'linear' : 'basis'}
                onNodeActivate={active.id === 'screens' && screenAreaId === 'map'
                  ? (label) => {
                    const id = screenAreaFromLabel(label, screenAreas);
                    if (id) setScreenAreaId(id);
                  }
                  : undefined}
              />
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

function screenAreaFromLabel(label: string, areas: ScreenAreaDiagram[]): string | undefined {
  const text = label.replace(/\s+/g, ' ').trim();
  return areas.find((area) =>
    text === area.name || text.startsWith(`${area.name} (`) || text === `${area.name} (${area.count})`,
  )?.id;
}

function ScreenAreaBar({
  areas, activeId, onSelect,
}: {
  areas: ScreenAreaDiagram[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ padding: '8px 14px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--txt3)' }}>
        {activeId === 'map'
          ? 'Bản đồ nhóm. Bấm một ô (ví dụ Profile (28)) hoặc nút bên dưới để xem màn hình và nút bên trong.'
          : 'Đang xem chi tiết nhóm. Bấm Bản đồ để quay lại.'}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button type="button" onClick={() => onSelect('map')} style={chipStyle(activeId === 'map')}>Bản đồ</button>
        {areas.map((area) => (
          <button
            key={area.id}
            type="button"
            onClick={() => onSelect(area.id)}
            style={chipStyle(activeId === area.id)}
          >
            {area.name} ({area.count})
          </button>
        ))}
      </div>
    </div>
  );
}

function chipStyle(active: boolean): CSSProperties {
  return {
    cursor: 'pointer', font: 'inherit', fontSize: 11, padding: '4px 10px', borderRadius: 7,
    border: `1px solid ${active ? 'var(--acc)' : 'var(--bd)'}`,
    background: active ? 'var(--acc-bg)' : 'transparent',
    color: active ? 'var(--acc-txt)' : 'var(--txt2)',
    fontWeight: active ? 600 : 500,
  };
}

function EpicMermaid({ source, empty, curve = 'basis', onNodeActivate }: {
  source?: string; empty: string; curve?: 'basis' | 'linear'; onNodeActivate?: (label: string) => void;
}) {
  const [svg, setSvg] = useState<string>();
  const [error, setError] = useState<string>();
  const { fullscreen, toggle: toggleFullscreen } = usePanelFullscreen();
  const {
    zoom, zoomIn, zoomOut, resetZoom, canZoomIn, canZoomOut,
    viewportRef, canvasRef, panHandlers,
  } = useSvgDiagramViewport(svg);
  useEffect(() => {
    if (!source) { setSvg(undefined); setError(undefined); return; }
    let active = true;
    setError(undefined);
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
      flowchart: { curve, htmlLabels: false, nodeSpacing: curve === 'linear' ? 28 : 50, rankSpacing: curve === 'linear' ? 48 : 50 },
    });
    void mermaid.render(`aidlc-epic-${Date.now()}`, source)
      .then((result) => { if (active) setSvg(result.svg); })
      .catch((reason: unknown) => {
        if (active) { setSvg(undefined); setError(reason instanceof Error ? reason.message : 'Không render được Mermaid.'); }
      });
    return () => { active = false; };
  }, [curve, source]);

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
        <button type="button" title="Thu nhỏ graph" onClick={zoomOut} disabled={!canZoomOut} style={zoomBtn}>{'\u2212'}</button>
        <button type="button" title="Reset zoom 100% và về giữa. Zoom: Ctrl + lăn chuột" onClick={resetZoom} style={zoomBtn}>{zoom}%</button>
        <button type="button" title="Phóng to graph" onClick={zoomIn} disabled={!canZoomIn} style={zoomBtn}>+</button>
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
        {...panHandlers}
        style={{ flex: 1, minHeight: fullscreen ? 0 : 240, cursor: 'grab', overflow: 'hidden', userSelect: 'none' }}
      >
        <div
          ref={canvasRef}
          onClick={onNodeActivate ? (event) => {
            const node = (event.target as Element | null)?.closest?.('.node');
            const label = node?.textContent?.replace(/\s+/g, ' ').trim();
            if (label) onNodeActivate(label);
          } : undefined}
          style={{
            minHeight: '100%', minWidth: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
            ...(onNodeActivate ? { cursor: 'pointer' } : {}),
          }}
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
