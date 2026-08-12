// Single `acquireVsCodeApi()` call for the whole v3 webview — VS Code throws
// if it's called more than once per webview session, so every module that
// needs to postMessage (main.tsx's ready ping, applicationClient's command
// calls) must go through this shared singleton instead of calling it directly.

export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

let api: VsCodeApi | undefined;
let acquired = false;

export function getVsCodeApi(): VsCodeApi | undefined {
  if (!acquired) {
    acquired = true;
    api = window.acquireVsCodeApi?.();
  }
  return api;
}
