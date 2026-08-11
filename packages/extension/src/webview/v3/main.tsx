import { createRoot } from 'react-dom/client';
import { useEffect, useMemo, useRef, useState } from 'react';

import { createV3ApplicationClient, type V3ApplicationClient, type V3CommandName, type V3WorkspaceState } from './contracts';
import { V3WorkspaceShell, Toast, type ToastState } from './shell';
import { getDict } from '../lib/i18n';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const vscode = acquireVsCodeApi();

const initialState: V3WorkspaceState = {
  language: 'en',
  project: { name: '', readiness: 'not-ready', diagnostics: [] },
  epics: [],
  workflowPacks: [],
  providerDiagnostics: [],
  artifactPolicy: {},
  capabilities: [],
  guide: { title: 'AIDLC guide', why: 'Loading workspace state.', inputs: [], outputs: [], doneWhen: '', next: '', recovery: [] },
  registry: { agents: [], skills: [], pipelines: [], runs: [] },
};

/**
 * V3 has no theme override UI yet (unlike V2's `useThemeBridge`) — this just
 * follows VS Code's real theme so `.dark` tokens in styles.css apply. VS
 * Code stamps `vscode-dark`/`vscode-high-contrast` on `<body>` and updates it
 * live if the user switches themes, hence the MutationObserver.
 */
function useFollowVsCodeTheme(): void {
  useEffect(() => {
    const apply = () => {
      const dark = document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast');
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
}

function App() {
  useFollowVsCodeTheme();
  const [state, setState] = useState<V3WorkspaceState>(initialState);
  const [toast, setToast] = useState<ToastState>();
  const pendingCommands = useMemo(() => new Map<string, V3CommandName>(), []);
  const languageRef = useRef(state.language);
  languageRef.current = state.language;
  const client = useMemo<V3ApplicationClient>(() => {
    const base = createV3ApplicationClient(vscode);
    return {
      dispatch(command) {
        pendingCommands.set(command.id, command.name);
        base.dispatch(command);
      },
    };
  }, [pendingCommands]);
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      const message = event.data as { type?: unknown; state?: unknown; result?: { status?: unknown; commandId?: unknown; data?: { message?: unknown }; error?: { summary?: unknown } } };
      if (message?.type === 'aidlc.v3.state' && message.state && typeof message.state === 'object') {
        setState(message.state as V3WorkspaceState);
      } else if (message?.type === 'aidlc.v3.result') {
        const commandId = typeof message.result?.commandId === 'string' ? message.result.commandId : undefined;
        const commandName = commandId ? pendingCommands.get(commandId) : undefined;
        if (commandId) pendingCommands.delete(commandId);
        if (message.result?.status === 'error') {
          const summary = typeof message.result.error?.summary === 'string'
            ? message.result.error.summary
            : typeof message.result.data?.message === 'string' ? message.result.data.message : getDict(languageRef.current).common.commandFailed;
          setState((current) => ({
            ...current,
            project: {
              ...current.project,
              diagnostics: [{ id: `command-${Date.now()}`, severity: 'error', summary }, ...current.project.diagnostics],
            },
          }));
        } else if (message.result?.status === 'ok' && commandName) {
          const t = getDict(languageRef.current);
          const toastCommands: Partial<Record<V3CommandName, ToastState>> = {
            'preset.redrawDesign.apply': { title: t.toast.presetAppliedTitle, body: t.toast.presetAppliedBody, canReload: true },
            'epic.create': { title: t.toast.epicCreatedTitle, body: t.toast.epicCreatedBody, canReload: false },
          };
          if (toastCommands[commandName]) setToast(toastCommands[commandName]);
        }
      }
    };
    window.addEventListener('message', receive);
    vscode.postMessage({ type: 'aidlc.v3.ready' });
    return () => window.removeEventListener('message', receive);
  }, [pendingCommands]);
  return <>
    <V3WorkspaceShell state={state} client={client} />
    {toast && <Toast toast={toast} onDismiss={() => setToast(undefined)} />}
  </>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root for AIDLC V3 webview.');
createRoot(root).render(<App />);
