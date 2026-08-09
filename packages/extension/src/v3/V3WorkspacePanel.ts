/** V3 webview panel host. V2 WorkspaceWebview remains untouched during migration. */

import * as vscode from 'vscode';

import { ExtensionV3Host } from './ExtensionV3Host';

export class V3WorkspacePanel {
  private static current: V3WorkspacePanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly host: ExtensionV3Host,
  ) {
    panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    panel.webview.onDidReceiveMessage((message) => { void this.handleMessage(message); }, undefined, this.disposables);
    this.disposables.push(host.subscribe((state) => {
      void this.panel.webview.postMessage({ type: 'aidlc.v3.state', state });
    }));
    panel.webview.html = this.renderHtml(panel.webview);
  }

  static show(extensionUri: vscode.Uri, host: ExtensionV3Host): void {
    const column = vscode.window.activeTextEditor?.viewColumn;
    if (V3WorkspacePanel.current) {
      V3WorkspacePanel.current.panel.reveal(column);
      V3WorkspacePanel.current.pushState();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'aidlc.v3.workspace',
      'AIDLC V3',
      column ?? vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    V3WorkspacePanel.current = new V3WorkspacePanel(panel, extensionUri, host);
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (isReadyMessage(message)) {
      this.pushState();
      return;
    }
    const result = await this.host.handleMessage(message);
    if (!result) return;
    await this.panel.webview.postMessage({ type: 'aidlc.v3.result', result });
    if (result.status !== 'error') this.pushState();
  }

  private pushState(): void {
    try {
      void this.panel.webview.postMessage({ type: 'aidlc.v3.state', state: this.host.workspaceState() });
    } catch (error) {
      // A closed/reloaded panel can race a command completion; it will request
      // the fresh durable projection through `aidlc.v3.ready` when available.
      void error;
    }
  }

  private renderHtml(webview: vscode.Webview): string {
    const webviewDir = vscode.Uri.joinPath(this.extensionUri, 'out', 'webviews');
    const entry = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'v3Workspace.js'));
    const vendor = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'vendor.js'));
    const common = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'common.js'));
    const styles = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'styles.css'));
    const nonce = randomNonce();
    return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
<link rel="stylesheet" href="${styles}" /></head>
<body><div id="root"></div>
<script nonce="${nonce}" type="module" src="${vendor}"></script>
<script nonce="${nonce}" type="module" src="${common}"></script>
<script nonce="${nonce}" type="module" src="${entry}"></script>
</body></html>`;
  }

  private dispose(): void {
    if (V3WorkspacePanel.current === this) V3WorkspacePanel.current = undefined;
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}

function isReadyMessage(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && (value as { type?: unknown }).type === 'aidlc.v3.ready');
}

function randomNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index += 1) value += alphabet[Math.floor(Math.random() * alphabet.length)];
  return value;
}
