/**
 * Shared `QuotaService` accessor for the v2 surfaces (Activity Bar sidebar +
 * status bar item) — one instance per workspace root, reused across calls so
 * its in-memory snapshot cache and incremental log-read offsets survive
 * between probes instead of re-reading provider logs from scratch every
 * time. The V3 panel keeps its own instance via `AidlcApplication.quota`
 * (a separate command-bus boundary); unifying all three into one is future
 * work, not required for either surface to work correctly today.
 */

import * as os from 'os';
import * as vscode from 'vscode';
import { createDefaultProviderRegistry, QuotaPolicyStore, QuotaService, type ProbeEnv } from '@aidlc/core';

let cache: { root: string; service: QuotaService } | undefined;

export function getQuotaService(root: string): QuotaService {
  if (cache?.root !== root) {
    const policy = new QuotaPolicyStore(root);
    const envFactory = (): ProbeEnv => ({
      home: os.homedir(),
      env: process.env,
      allowNetworkProbes: vscode.workspace.getConfiguration('aidlc.quota').get<boolean>('allowNetworkProbes', false),
    });
    cache = { root, service: new QuotaService(createDefaultProviderRegistry(), policy, envFactory) };
  }
  return cache.service;
}
