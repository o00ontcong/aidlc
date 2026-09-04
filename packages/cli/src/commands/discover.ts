import { Command } from 'commander';
import chalk from 'chalk';
import { DiscoverContextPublisher } from '@aidlc/core';
import { resolveWorkspaceRoot } from '../workspaceRoot';

/** Migration is explicit because legacy prose must never silently become a canonical requirement. */
export function registerDiscover(program: Command): void {
  const discover = program.command('discover').description('Inspect and migrate Discover Context compatibility data');
  discover.command('migration-preview')
    .description('Read old Foundation and Epic INTENT/REQUIREMENT files without changing them')
    .option('--json', 'Print machine-readable output')
    .action((options: { json?: boolean }, command: Command) => {
      const preview = new DiscoverContextPublisher(resolveWorkspaceRoot(command)).previewLegacyMigration();
      if (options.json) { console.log(JSON.stringify(preview, null, 2)); return; }
      console.log(`${chalk.bold('Legacy Discover migration')} · ${preview.sources.length} source file(s)`);
      for (const source of preview.sources) console.log(`  ${chalk.dim(source.kind)}  ${source.path}`);
      for (const warning of preview.warnings) console.log(chalk.yellow(`  ! ${warning}`));
      console.log(chalk.dim('Run `aidlc discover migrate --confirm` to create the inventory and (if needed) one migration baseline.'));
    });

  discover.command('migrate')
    .description('Create an idempotent Discover migration baseline; legacy sources are preserved')
    .requiredOption('--confirm', 'Confirm additive migration')
    .option('--reason <text>', 'Audit reason stored on the migration revision')
    .option('--json', 'Print machine-readable output')
    .action((options: { confirm: boolean; reason?: string; json?: boolean }, command: Command) => {
      try {
        const result = new DiscoverContextPublisher(resolveWorkspaceRoot(command)).migrateLegacy({
          confirm: options.confirm === true,
          reason: options.reason,
        });
        if (options.json) { console.log(JSON.stringify(result, null, 2)); return; }
        console.log(`${chalk.green('✔')} Discover ${result.context.discoverRevision}${result.createdBaseline ? ' migration baseline created' : ' already migrated'}.`);
        console.log(`  inventory: ${result.inventoryPath}`);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
      }
    });
}
