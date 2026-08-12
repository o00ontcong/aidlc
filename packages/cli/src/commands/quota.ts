import { Command } from 'commander';
import Table from 'cli-table3';
import {
  createDefaultProviderRegistry,
  QuotaPolicyStore,
  QuotaService,
  presentQuotaSnapshot,
  type QuotaPresentation,
  type ProbeEnv,
} from '@aidlc/core';
import * as os from 'os';
import { resolveWorkspaceRoot } from '../workspaceRoot';
import { info } from '../output';

function buildEnv(allowNetworkProbes: boolean): ProbeEnv {
  return { home: os.homedir(), env: process.env, allowNetworkProbes };
}

function renderTable(presented: QuotaPresentation): void {
  const table = new Table({ head: ['Provider', 'Status', 'Account', 'Enabled', 'Window', 'Available', 'Resets'] });
  for (const card of presented.cards) {
    if (card.quotas.length === 0) {
      table.push([
        card.provider, card.status, card.accountLabel ?? '—', card.enabled ? 'yes' : 'no', '—',
        card.connected ? '— (not exposed)' : '—', '—',
      ]);
      continue;
    }
    for (const [i, row] of card.quotas.entries()) {
      const pct = row.limit > 0 ? Math.round(((row.limit - row.used) / row.limit) * 100) : undefined;
      const avail = pct === undefined ? '—' : row.confidence === 'estimated' ? `~${pct}%` : `${pct}%`;
      table.push([
        i === 0 ? card.provider : '', i === 0 ? card.status : '', i === 0 ? (card.accountLabel ?? '—') : '',
        i === 0 ? (card.enabled ? 'yes' : 'no') : '', row.label, avail, row.resetAt,
      ]);
    }
  }
  info(table.toString());
  info(`${presented.connectedCount} connected · ${presented.notConnectedCount} not connected · generated ${presented.generatedAt}`);
}

export function registerQuota(program: Command): void {
  program
    .command('quota')
    .description('Show detected AI coding provider quota (Claude Code, Codex, Kimi, xAI)')
    .option('--json', 'output JSON')
    .option('--watch', 're-probe and re-render every --interval seconds (Ctrl+C to stop)')
    .option('--interval <seconds>', 'poll interval for --watch', '60')
    .option('--allow-network-probes', 'allow adapters to call a provider API over the network (default: false)', false)
    .action(async (opts: { json?: boolean; watch?: boolean; interval: string; allowNetworkProbes?: boolean }, cmd: Command) => {
      const root = resolveWorkspaceRoot(cmd);
      const service = new QuotaService(
        createDefaultProviderRegistry(),
        new QuotaPolicyStore(root),
        () => buildEnv(!!opts.allowNetworkProbes),
      );

      const renderOnce = async (): Promise<void> => {
        const snapshot = await service.refresh();
        const presented = presentQuotaSnapshot(snapshot);
        if (opts.json) {
          console.log(JSON.stringify(presented, null, 2));
        } else {
          renderTable(presented);
        }
      };

      if (!opts.watch) {
        await renderOnce();
        return;
      }

      const seconds = Math.max(15, Number(opts.interval) || 60);
      await renderOnce();
      const timer = setInterval(() => {
        if (!opts.json) { process.stdout.write('\x1B[2J\x1B[H'); }
        void renderOnce();
      }, seconds * 1000);
      process.on('SIGINT', () => {
        clearInterval(timer);
        process.exit(0);
      });
    });
}
