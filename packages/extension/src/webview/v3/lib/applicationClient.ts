// Minimal request/response bridge over `postMessage`, matching the envelope
// `ExtensionV3ApplicationClient`/`V3WorkspacePanel` speak on the host side
// (aidlc.v3.command → aidlc.v3.result, plus unsolicited aidlc.v3.state
// pushes after every durable-state-changing command). QuotaTracker is the
// first v3 component to call the host directly — everything else still
// reads MOCK_* data — so this stays intentionally small rather than a full
// RPC framework.

import { getVsCodeApi } from './vscodeApi';

interface CommandResult {
  commandId: string;
  status: 'ok' | 'waiting-for-user' | 'blocked' | 'error';
  data?: unknown;
}

interface HostMessage {
  type?: string;
  result?: CommandResult;
  state?: Record<string, unknown>;
}

let seq = 0;
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();
const stateListeners = new Set<(state: Record<string, unknown>) => void>();
let listening = false;

function describeError(data: unknown): string {
  if (data && typeof data === 'object' && 'message' in data) return String((data as { message: unknown }).message);
  return 'Command failed';
}

function ensureListening(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (event) => {
    const message = event.data as HostMessage | undefined;
    if (message?.type === 'aidlc.v3.result' && message.result) {
      const entry = pending.get(message.result.commandId);
      if (!entry) return;
      pending.delete(message.result.commandId);
      if (message.result.status === 'error') entry.reject(new Error(describeError(message.result.data)));
      else entry.resolve(message.result.data);
      return;
    }
    if (message?.type === 'aidlc.v3.state' && message.state) {
      for (const listener of stateListeners) listener(message.state);
    }
  });
}

/** Sends `{ type: 'aidlc.v3.command', command }` and resolves with the matching result's `data`. */
export function callCommand<T = unknown>(name: string, payload: unknown = {}): Promise<T> {
  ensureListening();
  seq += 1;
  const id = `v3-${seq}-${Math.random().toString(36).slice(2)}`;
  const vscode = getVsCodeApi();
  if (!vscode) return Promise.reject(new Error('VS Code API unavailable (running outside a webview host).'));
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    vscode.postMessage({ type: 'aidlc.v3.command', command: { id, name, payload } });
  });
}

/** Subscribes to unsolicited `aidlc.v3.state` pushes (poll/fs-watcher-triggered refreshes land here). */
export function onHostState(listener: (state: Record<string, unknown>) => void): () => void {
  ensureListening();
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}
