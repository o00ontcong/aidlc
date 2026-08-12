/* Dev-only visual harness for the v3 Epic screen.
 *
 * Not part of any build input (vite.config.ts rollupOptions.input is unchanged);
 * it exists so the Epic screen can be diffed side-by-side against
 * "AIDLC Workspace v3.dc.html" at 1440px in both themes.
 *
 * Run:  npx vite dev  →  http://localhost:5173/harness/epic-v3.html
 * Query params: ?theme=dark|light  &  ?mock=1 to switch the mock overlay on.
 */

import { createRoot } from 'react-dom/client';
import { EpicsView } from '../src/webview/components/EpicsView';
import { STATE } from './state';
import '../src/webview/styles.css';

// Stub the VS Code bridge so postMessage calls are observable, not fatal.
(window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
  postMessage: (m: unknown) => console.log('[postMessage]', m),
  getState: () => undefined,
  setState: () => {},
});

const params = new URLSearchParams(location.search);
if (params.get('theme') !== 'light') { document.documentElement.classList.add('dark'); }
if (params.get('mock') === '1') { document.documentElement.classList.add('mock-visible'); }

const root = document.getElementById('app');
if (root) {
  // Fill the viewport so the two columns get the same height they have in the panel.
  document.body.style.margin = '0';
  root.style.height = '100vh';
  root.style.display = 'flex';
  createRoot(root).render(
    <div style={{ flex: 1, minWidth: 0, display: 'flex', minHeight: 0 }}>
      <EpicsView state={STATE} />
    </div>,
  );
}
