// v3/main.tsx — mount, VS Code bridge (theme + mock-visible only; this UI is
// mock-data-driven, it does not consume aidlc.v3.state), Vite entry
// `src/webview/v3/main.tsx` per vite.config.ts (kept — renaming would need an
// extra host-adjacent edit for zero benefit).
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// `@tailwindcss/vite` only scans the module graph reachable from wherever
// `@import "tailwindcss"` lives (in `../styles.css`) — without this import,
// none of this tree's Tailwind classes get generated at all, regardless of
// `cssCodeSplit:false` merging the *emitted* CSS text together. Every other
// webview entry (`sidebar/main.tsx`, `workspace/main.tsx`, …) imports it for
// the same reason.
import '../styles.css';
import './styles/tokens.css';
import { UiStoreProvider } from './state/store';
import type { ThemeId } from './data/types';
import { getVsCodeApi } from './lib/vscodeApi';

declare global {
  interface Window {
    __AIDLC_SHOW_MOCK__?: boolean;
  }
}

/** VS Code stamps `vscode-dark`/`vscode-light`/`vscode-high-contrast*` on
 * <body>; there is no ColorThemeKind push into the webview. Mirrors the
 * MutationObserver pattern the previous v3 main.tsx used, but drives the
 * design's own `thm-dark`/`thm-light` class instead of Tailwind's `.dark`. */
function useFollowVsCodeTheme(): ThemeId {
  const compute = (): ThemeId => (document.body.classList.contains('vscode-light') ? 'light' : 'dark');
  const [theme, setTheme] = React.useState<ThemeId>(compute);
  React.useEffect(() => {
    setTheme(compute());
    const observer = new MutationObserver(() => setTheme(compute()));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

function Root() {
  const theme = useFollowVsCodeTheme();
  const [mockVisible, setMockVisible] = React.useState<boolean>(() => window.__AIDLC_SHOW_MOCK__ ?? true);

  React.useEffect(() => {
    document.documentElement.classList.toggle('mock-visible', mockVisible);
  }, [mockVisible]);

  React.useEffect(() => {
    const vscode = getVsCodeApi();
    vscode?.postMessage({ type: 'aidlc.v3.ready' });
    const onMessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; value?: unknown } | undefined;
      if (message?.type === 'aidlc.v3.mockVisible') setMockVisible(Boolean(message.value));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <UiStoreProvider theme={theme}>
      <App />
    </UiStoreProvider>
  );
}

const container = document.getElementById('root');
if (container) createRoot(container).render(<Root />);
