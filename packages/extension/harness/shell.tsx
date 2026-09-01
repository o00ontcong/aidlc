/* Dev-only harness rendering the FULL WorkspaceShell so the non-Epic tabs can
 * be screenshot-diffed before/after the v3 Epic change. Not a build input. */
import { createRoot } from 'react-dom/client';
import { WorkspaceShell } from '../src/webview/components/WorkspaceShell';
import { STATE } from './state';
import '../src/webview/styles.css';

(window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
  postMessage: () => {}, getState: () => undefined, setState: () => {},
});

const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'light' ? 'light' : 'dark';
// WorkspaceShell renders ThemeToggle, whose useThemeBridge() runs in 'auto' mode
// by default and would strip a manually-added `.dark` class (it resolves the
// theme from document.body's vscode-* class, absent here). Seed the same global
// the real webview host injects so the bridge forces the mode we asked for.
(window as unknown as { __AIDLC_INITIAL_THEME__?: string }).__AIDLC_INITIAL_THEME__ = theme;
if (theme === 'dark') { document.documentElement.classList.add('dark'); }
// ?discover=none renders the Discover tab's pre-blueprint state.
const discover = params.get('discover') === 'none' ? undefined : STATE.discover;
const view = (params.get('view') ?? 'builder') as 'builder' | 'analyze' | 'tests' | 'epics';

const root = document.getElementById('app');
if (root) {
  document.body.style.margin = '0';
  root.style.height = '100vh';
  root.style.width = '100%';
  createRoot(root).render(<WorkspaceShell state={{ ...STATE, discover, initialView: view }} />);
}
