import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';

import { useThemeBridge } from '../hooks/useThemeBridge';
import { createV3ApplicationClient, type V3WorkspaceState } from './contracts';
import { V3WorkspaceShell } from './shell';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const vscode = acquireVsCodeApi();

const initialState: V3WorkspaceState = {
  project: { name: '', readiness: 'not-ready', diagnostics: [] },
  epics: [],
  workflowPacks: [],
  providerDiagnostics: [],
  artifactPolicy: {},
  capabilities: [],
  architecture: { available: false, layers: [], edges: [], features: [], structuralNodes: [], structuralEdges: [], featureFlows: {} },
  guide: { title: 'AIDLC guide', why: 'Loading workspace state.', inputs: [], outputs: [], doneWhen: '', next: '', recovery: [] },
};

function App() {
  // V3 shares the extension stylesheet with V2. Keep its token mode in sync
  // with VS Code instead of falling back to the stylesheet's light defaults.
  useThemeBridge();
  const [state, setState] = useState<V3WorkspaceState>(initialState);
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      const message = event.data as { type?: unknown; state?: unknown; result?: { status?: unknown; data?: { message?: unknown }; error?: { summary?: unknown } } };
      if (message?.type === 'aidlc.v3.state' && message.state && typeof message.state === 'object') {
        setState(message.state as V3WorkspaceState);
      } else if (message?.type === 'aidlc.v3.result' && message.result?.status === 'error') {
        const summary = typeof message.result.error?.summary === 'string'
          ? message.result.error.summary
          : typeof message.result.data?.message === 'string' ? message.result.data.message : 'AIDLC command failed.';
        setState((current) => ({
          ...current,
          project: {
            ...current.project,
            diagnostics: [{ id: `command-${Date.now()}`, severity: 'error', summary }, ...current.project.diagnostics],
          },
        }));
      }
    };
    window.addEventListener('message', receive);
    vscode.postMessage({ type: 'aidlc.v3.ready' });
    return () => window.removeEventListener('message', receive);
  }, []);
  return <V3WorkspaceShell state={state} client={createV3ApplicationClient(vscode)} />;
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root for AIDLC V3 webview.');
createRoot(root).render(<App />);
