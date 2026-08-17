import { useCallback, useEffect, useState } from 'react';

/**
 * Fill the whole VS Code webview (or harness browser tab) with a panel.
 * Native `requestFullscreen` is typically blocked inside webviews, so this
 * is a `position: fixed; inset: 0` overlay plus Escape to exit.
 */
export function usePanelFullscreen(): {
  fullscreen: boolean;
  toggle: () => void;
  exit: () => void;
} {
  const [fullscreen, setFullscreen] = useState(false);
  const toggle = useCallback(() => setFullscreen((value) => !value), []);
  const exit = useCallback(() => setFullscreen(false), []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setFullscreen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [fullscreen]);

  return { fullscreen, toggle, exit };
}
