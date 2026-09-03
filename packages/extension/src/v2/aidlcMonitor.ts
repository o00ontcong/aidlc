/**
 * AIDLC Monitor — command wiring for agent observability via agents-observe
 * (https://github.com/simple10/agents-observe).
 *
 * The Monitor panel itself is opened from the Command Palette
 * (`aidlc.openMonitor`). There is no status-bar surface.
 */
import * as vscode from 'vscode';

import { MonitorWebview } from './monitorWebview';

const OPEN_COMMAND = 'aidlc.openMonitor';

export function registerAidlcMonitor(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  extensionUri: vscode.Uri,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(OPEN_COMMAND, () => {
      MonitorWebview.show(extensionUri, 'agents');
    }),
  );
  output.appendLine('AIDLC Monitor command registered (no status bar item).');
}
