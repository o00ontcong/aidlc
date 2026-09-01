/* Dev-only harness rendering the REAL WorkspaceShell wired to the REAL
 * @aidlc/core IdeaService via harness/ideas-bridge.cjs (not a mock — a
 * scratch workspace on disk). Not a build input.
 *
 * Run:
 *   node packages/extension/harness/ideas-bridge.cjs --root <dir> --port 5175
 *   npx vite dev   →   http://localhost:5173/harness/ideas.html
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceShell } from '../src/webview/components/WorkspaceShell';
import { useHostState } from '../src/webview/hooks/useHostState';
import { useThemeBridge } from '../src/webview/hooks/useThemeBridge';
import type { WorkspaceState } from '../src/webview/lib/types';
import '../src/webview/styles.css';

const BRIDGE_ORIGIN = 'http://127.0.0.1:5175';

const messageListeners = new Set<(event: MessageEvent) => void>();
window.addEventListener('message', (event) => {
  for (const listener of messageListeners) listener(event);
});

(window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
  postMessage: (message: unknown) => {
    fetch(`${BRIDGE_ORIGIN}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
      .then((r) => r.json())
      .then((result) => {
        if (!result?.ok) console.warn('[ideas-harness] rpc rejected', message, result);
        else console.log('[ideas-harness] rpc ok', message, result);
      })
      .catch((err) => console.error('[ideas-harness] rpc failed', message, err));
  },
  getState: () => undefined,
  setState: () => {},
});

const source = new EventSource(`${BRIDGE_ORIGIN}/events`);
source.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    window.postMessage(data, '*');
  } catch (err) {
    console.error('[ideas-harness] bad SSE payload', err);
  }
};
source.onerror = (err) => console.error('[ideas-harness] SSE error', err);

const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'light' ? 'light' : 'dark';
(window as unknown as { __AIDLC_INITIAL_THEME__?: string }).__AIDLC_INITIAL_THEME__ = theme;
if (theme === 'dark') { document.documentElement.classList.add('dark'); }

function App() {
  useThemeBridge();
  const state = useHostState<WorkspaceState>();
  return <WorkspaceShell state={state} />;
}

const root = document.getElementById('app');
if (root) {
  document.body.style.margin = '0';
  root.style.height = '100vh';
  root.style.width = '100%';
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
