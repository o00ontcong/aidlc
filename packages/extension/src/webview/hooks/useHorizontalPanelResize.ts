import { useCallback, useEffect, useRef, useState } from 'react';

export function useHorizontalPanelResize({
  onResize,
  onCommit,
  min,
  max,
  disabled = false,
}: {
  onResize: (width: number) => void;
  onCommit?: (width: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; width: number } | null>(null);
  const latestRef = useRef(0);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>, width: number) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    startRef.current = { x: event.clientX, width };
    latestRef.current = width;
    setDragging(true);
  }, [disabled]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      if (!startRef.current) return;
      const delta = event.clientX - startRef.current.x;
      const next = Math.max(min, Math.min(max, startRef.current.width + delta));
      latestRef.current = next;
      onResize(next);
    };
    const onUp = () => {
      const finalWidth = latestRef.current;
      startRef.current = null;
      setDragging(false);
      onCommit?.(finalWidth);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, max, min, onCommit, onResize]);

  useEffect(() => {
    if (!dragging) return;
    const prev = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = prev;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging]);

  return { dragging, onPointerDown };
}
