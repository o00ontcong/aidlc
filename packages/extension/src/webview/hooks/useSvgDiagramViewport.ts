import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

/** Large graphs need headroom beyond 250%; SVG stays crisp because we scale vectors, not raster width. */
export const DIAGRAM_MIN_ZOOM = 25;
export const DIAGRAM_MAX_ZOOM = 800;
export const DIAGRAM_ZOOM_STEP = 25;

export function clampDiagramZoom(value: number): number {
  return Math.max(DIAGRAM_MIN_ZOOM, Math.min(DIAGRAM_MAX_ZOOM, Math.round(value)));
}

/** Keep Mermaid SVG at its native size so CSS scale stays vector-sharp at high zoom. */
export function prepareDiagramSvg(root: HTMLElement | null): void {
  const svg = root?.querySelector('svg');
  if (!svg) return;
  svg.style.maxWidth = 'none';
  svg.style.width = 'auto';
  svg.style.height = 'auto';
  svg.style.display = 'block';
}

function fitZoomForViewport(viewport: HTMLElement, svg: SVGSVGElement): number {
  const padding = 40;
  const viewWidth = Math.max(1, viewport.clientWidth - padding);
  const viewHeight = Math.max(1, viewport.clientHeight - padding);
  const svgWidth = svg.width.baseVal.value || svg.viewBox.baseVal.width || svg.getBoundingClientRect().width;
  const svgHeight = svg.height.baseVal.value || svg.viewBox.baseVal.height || svg.getBoundingClientRect().height;
  if (!svgWidth || !svgHeight) return 100;
  return clampDiagramZoom(Math.min(viewWidth / svgWidth, viewHeight / svgHeight) * 100);
}

type PanState = { pointerId: number; clientX: number; clientY: number; x: number; y: number };

export function useSvgDiagramViewport(svgHtml: string | undefined) {
  const [zoom, setZoom] = useState(100);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const viewRef = useRef({ x: 0, y: 0 });
  const panRef = useRef<PanState | undefined>(undefined);

  const applyTransform = useCallback((nextZoom = zoomRef.current) => {
    const view = viewRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.transformOrigin = 'center center';
    canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${nextZoom / 100})`;
  }, []);

  useEffect(() => {
    if (!svgHtml) return;
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;
    prepareDiagramSvg(canvas);
    const svg = canvas.querySelector('svg');
    if (svg instanceof SVGSVGElement) {
      viewRef.current = { x: 0, y: 0 };
      const fitZoom = fitZoomForViewport(viewport, svg);
      setZoom(fitZoom);
      applyTransform(fitZoom);
      return;
    }
    applyTransform();
  }, [svgHtml, applyTransform]);

  useEffect(() => {
    applyTransform(zoom);
  }, [zoom, applyTransform]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !svgHtml) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const current = zoomRef.current;
      const nextZoom = clampDiagramZoom(current - event.deltaY * 0.08);
      if (nextZoom === current) return;
      const rect = viewport.getBoundingClientRect();
      const ratio = nextZoom / current;
      const view = viewRef.current;
      view.x = (1 - ratio) * (event.clientX - rect.left - rect.width / 2) + ratio * view.x;
      view.y = (1 - ratio) * (event.clientY - rect.top - rect.height / 2) + ratio * view.y;
      applyTransform(nextZoom);
      setZoom(nextZoom);
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [svgHtml, applyTransform]);

  const zoomIn = useCallback(() => setZoom((value) => clampDiagramZoom(value + DIAGRAM_ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((value) => clampDiagramZoom(value - DIAGRAM_ZOOM_STEP)), []);
  const resetZoom = useCallback(() => {
    viewRef.current = { x: 0, y: 0 };
    setZoom(100);
    applyTransform(100);
  }, [applyTransform]);

  const startPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const viewport = event.currentTarget;
    viewport.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x: viewRef.current.x,
      y: viewRef.current.y,
    };
    viewport.style.cursor = 'grabbing';
    event.preventDefault();
  }, []);

  const movePan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    viewRef.current = { x: pan.x + event.clientX - pan.clientX, y: pan.y + event.clientY - pan.clientY };
    applyTransform();
    event.preventDefault();
  }, [applyTransform]);

  const endPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = undefined;
    event.currentTarget.style.cursor = 'grab';
  }, []);

  return {
    zoom,
    zoomIn,
    zoomOut,
    resetZoom,
    canZoomIn: zoom < DIAGRAM_MAX_ZOOM,
    canZoomOut: zoom > DIAGRAM_MIN_ZOOM,
    viewportRef,
    canvasRef,
    panHandlers: { onPointerDown: startPan, onPointerMove: movePan, onPointerUp: endPan, onPointerCancel: endPan },
  };
}
