/**
 * Native status bar item + threshold/reset notifications for quota (§4.4).
 * Shares its `QuotaService` (and therefore its probe cache) with the
 * Activity Bar sidebar via `quotaServiceHost.ts` — this module only adds a
 * second *view* onto the same data, not a second prober.
 */

import * as vscode from 'vscode';
import { cardAvailPct, type QuotaSnapshot } from '@aidlc/core';
import { getQuotaService } from './quotaServiceHost';

const OPEN_COMMAND = 'aidlc.v3.open';

type Bucket = 'ok' | 'warn' | 'critical';
const SEVERITY: Record<Bucket, number> = { ok: 0, warn: 1, critical: 2 };

function bucketFor(pct: number, warn: number, critical: number): Bucket {
  if (pct <= critical) return 'critical';
  if (pct <= warn) return 'warn';
  return 'ok';
}

export function registerQuotaStatusBar(context: vscode.ExtensionContext, output: vscode.OutputChannel): void {
  const cfg = () => vscode.workspace.getConfiguration('aidlc.quota');
  if (!cfg().get<boolean>('enabled', true)) {
    output.appendLine('Quota status bar disabled by setting (aidlc.quota.enabled).');
    return;
  }

  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 95);
  item.command = OPEN_COMMAND;
  item.text = '$(zap) …';
  item.tooltip = 'AIDLC quota — loading…';
  item.show();
  context.subscriptions.push(item);

  const lastBucket = new Map<string, Bucket>();
  let inFlight = false;

  const notifyTransitions = (snapshot: QuotaSnapshot, warn: number, critical: number): void => {
    for (const provider of snapshot.providers) {
      if (!provider.enabled) { continue; }
      const pct = cardAvailPct(provider);
      if (pct === undefined) { continue; }
      const bucket = bucketFor(pct, warn, critical);
      const prev = lastBucket.get(provider.id);
      lastBucket.set(provider.id, bucket);
      if (prev === undefined || prev === bucket) { continue; }
      if (SEVERITY[bucket] > SEVERITY[prev]) {
        void vscode.window.showWarningMessage(`${provider.displayName} quota low: ${pct}% available.`);
      } else if (bucket === 'ok') {
        void vscode.window.showInformationMessage(`${provider.displayName} quota reset — ${pct}% available.`);
      }
    }
  };

  const refresh = async (): Promise<void> => {
    if (inFlight) { return; }
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) { item.text = '$(zap) —'; item.tooltip = 'AIDLC quota — open a workspace folder'; return; }
    inFlight = true;
    try {
      const warn = cfg().get<number>('warnThreshold', 25);
      const critical = cfg().get<number>('criticalThreshold', 10);
      const snapshot = await getQuotaService(root).refresh();
      notifyTransitions(snapshot, warn, critical);

      const pcts = snapshot.providers
        .filter((p) => p.enabled)
        .map((p) => cardAvailPct(p))
        .filter((p): p is number => p !== undefined);
      if (pcts.length === 0) {
        item.text = '$(zap) —';
        item.tooltip = 'AIDLC quota — no provider exposes a usage percentage yet';
      } else {
        const lowest = Math.min(...pcts);
        item.text = `$(zap) ${lowest}%`;
        item.tooltip = 'AIDLC quota — lowest available among enabled providers. Click to open.';
        item.backgroundColor = lowest <= critical
          ? new vscode.ThemeColor('statusBarItem.errorBackground')
          : lowest <= warn
            ? new vscode.ThemeColor('statusBarItem.warningBackground')
            : undefined;
      }
    } catch (err) {
      output.appendLine(`Quota status bar refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      inFlight = false;
    }
  };

  void refresh();
  const seconds = Math.max(15, cfg().get<number>('pollSeconds', 60));
  const timer = setInterval(() => void refresh(), seconds * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  const folderReg = vscode.workspace.onDidChangeWorkspaceFolders(() => void refresh());
  context.subscriptions.push(folderReg);
  const cfgReg = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('aidlc.quota')) { void refresh(); }
  });
  context.subscriptions.push(cfgReg);
}
