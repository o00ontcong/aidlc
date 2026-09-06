import { useEffect, useState } from 'react';
import type { ProductTourAnchor } from '../../../shared/productTour';

type Rect = { top: number; left: number; width: number; height: number };

/**
 * Optional spotlight, activated only by the user. Four panes leave the target
 * unobscured; `pointer-events: none` means it never turns the tour into a
 * wizard or blocks the underlying action. Escape first returns to coach mode.
 */
export function ProductTourFocusLayer({ anchor, onDismiss }: { anchor?: ProductTourAnchor; onDismiss: () => void }) {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    if (!anchor) { setRect(null); return; }
    let frame = 0;
    const locate = () => {
      const element = document.querySelector<HTMLElement>(`[data-tour-id="${anchor}"]`);
      if (!element) { setRect(null); return; }
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      const next = element.getBoundingClientRect();
      setRect({ top: next.top, left: next.left, width: next.width, height: next.height });
    };
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(locate); };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); window.removeEventListener('keydown', onKey); observer.disconnect(); };
  }, [anchor, onDismiss]);

  if (!anchor || !rect) return null;
  const pad = 7;
  const hole = { top: Math.max(0, rect.top - pad), left: Math.max(0, rect.left - pad), right: Math.min(window.innerWidth, rect.left + rect.width + pad), bottom: Math.min(window.innerHeight, rect.top + rect.height + pad) };
  const pane = 'pointer-events-none fixed z-40 bg-black/50 backdrop-blur-[1px] motion-reduce:backdrop-blur-none';
  return (
    <>
      <div className={pane} style={{ top: 0, left: 0, right: 0, height: hole.top }} />
      <div className={pane} style={{ top: hole.top, left: 0, width: hole.left, bottom: 0 }} />
      <div className={pane} style={{ top: hole.top, left: hole.right, right: 0, bottom: 0 }} />
      <div className={pane} style={{ top: hole.bottom, left: hole.left, right: window.innerWidth - hole.right, bottom: 0 }} />
      <div className="pointer-events-none fixed z-40 rounded-md border-2 border-primary shadow-[0_0_0_3px_rgba(255,255,255,0.2)]" style={{ top: hole.top, left: hole.left, width: hole.right - hole.left, height: hole.bottom - hole.top }} />
    </>
  );
}
