/* Dev-only harness for the extension sidebar (AppSidebar + ProviderSection).
 *
 * Run from packages/extension:
 *   npx vite dev  →  http://localhost:5173/harness/sidebar.html
 *
 * Query: ?theme=light|dark (default dark)
 */

import { createRoot } from 'react-dom/client';
import { AppSidebar } from '../src/webview/components/AppSidebar';
import { SIDEBAR_STATE } from './sidebarState';
import '../src/webview/styles.css';

(window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
  postMessage: (m: unknown) => console.log('[postMessage]', m),
  getState: () => undefined,
  setState: () => {},
});

const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'light' ? 'light' : 'dark';
(window as unknown as { __AIDLC_INITIAL_THEME__?: string }).__AIDLC_INITIAL_THEME__ = theme;
if (theme === 'dark') { document.documentElement.classList.add('dark'); }

const root = document.getElementById('app');
if (root) {
  document.body.style.margin = '0';
  root.style.height = '100vh';
  root.style.width = '280px';
  root.style.display = 'flex';
  createRoot(root).render(<AppSidebar state={SIDEBAR_STATE} />);
}
