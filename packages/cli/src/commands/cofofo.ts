import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import {
  CofofoFoundationService,
  RunStateStore,
  StackProfileSchema,
  WorkspaceLoader,
  captureEvidence,
  evidenceStageRevisionsForRun,
  lostCofofoGateSnapshotIssues,
  normalizeStep,
  readEvidenceLedger,
  rebaseRunToCurrentFoundation,
  rollbackCatalog,
  verifyEvidenceLedger,
} from '@aidlc/core';
import { resolveWorkspaceRoot } from '../workspaceRoot';

function foundationService(root: string): CofofoFoundationService {
  const executable = process.argv[1] ? path.dirname(fs.realpathSync(process.argv[1])) : '';
  const bundledCatalog = path.join(executable, 'templates', 'cofofo', 'catalog');
  return fs.existsSync(bundledCatalog)
    ? new CofofoFoundationService(root, bundledCatalog)
    : new CofofoFoundationService(root);
}

function fail(error: unknown): never {
  const value = error as Error & { issues?: string[] };
  console.error(chalk.red(value.message ?? String(error)));
  for (const issue of value.issues ?? []) console.error(chalk.dim(`  ✘ ${issue}`));
  process.exit(1);
}

function printInspection(service: CofofoFoundationService, json = false): void {
  const inspection = service.inspect();
  if (json) {
    console.log(JSON.stringify(inspection, null, 2));
    return;
  }
  const icon = inspection.status === 'ready' ? chalk.green('✔') : chalk.yellow('●');
  console.log(`${icon} Foundation: ${chalk.bold(inspection.status)}`);
  if (inspection.state) console.log(`  revision: ${inspection.state.revision} · route: ${inspection.state.route}`);
  if (inspection.profile?.stack) console.log(`  stack: ${inspection.profile.stack.id} · confidence: ${inspection.profile.confidence}`);
  for (const issue of inspection.issues) console.log(chalk.dim(`  ✘ ${issue}`));
  console.log(chalk.dim(`  next: ${inspection.nextAction}`));
}

export function registerCofofo(program: Command): void {
  const command = program.command('cofofo').description('Inspect legacy CoFoFo state and verify delivery evidence');

  command.command('status')
    .description('Inspect Foundation freshness, manifest hashes, and scan-stack gate')
    .option('--json', 'Print machine-readable JSON')
    .action((opts: { json?: boolean }, action: Command) => {
      try { printInspection(foundationService(resolveWorkspaceRoot(action)), Boolean(opts.json)); }
      catch (error) { fail(error); }
    });

  command.command('doctor')
    .description('Diagnose CoFoFo workspace health and print only repairs that can succeed')
    .option('--json', 'Print machine-readable JSON')
    .action((opts: { json?: boolean }, action: Command) => {
      const root = resolveWorkspaceRoot(action);
      try {
        const service = foundationService(root);
        const inspection = service.inspect();
        const source = WorkspaceLoader.load(root).config.pipelines;
        const snapshotIssues = RunStateStore.list(root).flatMap((run) => {
          const pipeline = source.find((item) => item.id === run.pipelineId);
          return lostCofofoGateSnapshotIssues({ state: run, sourcePipeline: pipeline });
        });
        const bindingIssues = inspection.doctorIssues ?? [];
        const result = {
          ok: inspection.status === 'ready' && snapshotIssues.length === 0 && bindingIssues.length === 0,
          inspection,
          bindingIssues,
          snapshotIssues,
          repair: inspection.status === 'ready' && bindingIssues.length === 0
            ? undefined
            : bindingIssues[0]?.userMessageVi ?? inspection.nextAction,
        };
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printInspection(service);
          for (const issue of bindingIssues) console.log(chalk.red(`  ✘ ${issue.detail}`));
          for (const issue of snapshotIssues) console.log(chalk.red(`  ✘ ${issue}; start a new run`));
          if (result.ok) console.log(chalk.green('✔') + ' CoFoFo workspace is ready. No repair is needed.');
          else if (result.repair) console.log(chalk.yellow(`Repair: ${result.repair}`));
        }
        if (!result.ok) process.exitCode = 2;
      } catch (error) { fail(error); }
    });

  command.command('evidence <stage> <runId>')
    .description('Run an allow-listed command and append tamper-evident VERIFY evidence')
    .option('--command <id>', 'Allow-listed commandId')
    .option('--target <test>', 'Safe targeted test identifier (required by targeted commandIds)')
    .option('--timeout <ms>', 'Timeout in milliseconds', '600000')
    .action((stage: string, runId: string, opts: { command?: string; target?: string; timeout: string }, action: Command) => {
      if (stage !== 'verify') fail(new Error(`Unknown evidence stage: ${stage}`));
      const root = resolveWorkspaceRoot(action);
      try {
        const profilePath = path.join(root, 'docs/project/foundation/STACK-PROFILE.json');
        const profile = StackProfileSchema.parse(JSON.parse(fs.readFileSync(profilePath, 'utf8')));
        const commandId = opts.command ?? 'swift.test';
        const state = RunStateStore.load(root, runId);
        if (!state) throw new Error(`Run "${runId}" does not exist.`);
        const pipeline = state.pipelineSnapshot?.pipeline ?? WorkspaceLoader.load(root).config.pipelines.find((item) => item.id === state.pipelineId);
        if (!pipeline) throw new Error(`Pipeline "${state.pipelineId}" does not exist.`);
        const stageRevisions = evidenceStageRevisionsForRun(state, pipeline);
        const record = captureEvidence({
          workspaceRoot: root, runId, profile, stage: 'verify',
          commandId, target: opts.target, timeoutMs: Number(opts.timeout),
          stepRevision: stageRevisions.verify, stageRevisions,
        });
        const icon = record.accepted ? chalk.green('✔') : chalk.red('✘');
        console.log(`${icon} VERIFY evidence ${record.id}: exit ${record.exitStatus ?? 'none'}, log ${record.logHash.slice(0, 19)}…`);
        if (!record.accepted) process.exitCode = 2;
      } catch (error) { fail(error); }
    });

  command.command('rebase <runId>')
    .description('Pin the active Foundation and reset every delivery phase for replay')
    .action((runId: string, _opts: unknown, action: Command) => {
      const root = resolveWorkspaceRoot(action);
      try {
        const state = RunStateStore.load(root, runId);
        if (!state) throw new Error(`Run "${runId}" does not exist.`);
        const ws = WorkspaceLoader.load(root);
        const pipeline = state.pipelineSnapshot?.pipeline ?? ws.config.pipelines.find((item) => item.id === state.pipelineId);
        if (!pipeline) throw new Error(`Pipeline "${state.pipelineId}" does not exist.`);
        const next = rebaseRunToCurrentFoundation({ state, pipeline, workspaceRoot: root });
        RunStateStore.save(root, next);
        console.log(chalk.green('✔') + ` Rebased ${runId} to Foundation revision ${next.cofofoFoundation?.revision}; all phases must replay.`);
      } catch (error) { fail(error); }
    });

  command.command('verify')
    .description('Verify Foundation and every existing CoFoFo evidence ledger')
    .option('--json', 'Print machine-readable JSON')
    .action((opts: { json?: boolean }, action: Command) => {
      const root = resolveWorkspaceRoot(action);
      try {
        const foundation = foundationService(root).inspect();
        const ledgers = RunStateStore.list(root).map((run) => {
          let records = 0;
          let issues: string[] = [];
          let stages: Record<string, { revision: number; accepted: boolean }> = {};
          try { records = readEvidenceLedger(root, run.runId).length; }
          catch { issues = verifyEvidenceLedger(root, run.runId); }
          const pipeline = run.pipelineSnapshot?.pipeline
            ?? WorkspaceLoader.load(root).config.pipelines.find((item) => item.id === run.pipelineId);
          if (pipeline?.foundation?.mode === 'cofofo') {
            try {
              const ledger = readEvidenceLedger(root, run.runId);
              const revisions = evidenceStageRevisionsForRun(run, pipeline);
              const accepted = ledger.some((record) => record.accepted
                && record.stepRevision === revisions.verify
                && record.stage === 'verify');
              stages.verify = { revision: revisions.verify, accepted };
              const idx = pipeline.steps.findIndex((step) => normalizeStep(step).evidence?.stage === 'verify');
              if (idx >= 0 && run.steps[idx]?.status === 'approved' && !accepted) {
                issues.push(`VERIFY evidence at current revision ${revisions.verify} is missing.`);
              }
            } catch (error) {
              issues.push(error instanceof Error ? error.message : String(error));
            }
          }
          return { runId: run.runId, records, issues, stages };
        }).filter((item) => item.records > 0 || item.issues.length > 0);
        const result = { ok: foundation.status === 'ready' && ledgers.every((item) => item.issues.length === 0), foundation, ledgers };
        if (opts.json) console.log(JSON.stringify(result, null, 2));
        else {
          printInspection(foundationService(root));
          for (const ledger of ledgers) {
            const stageSummary = Object.entries(ledger.stages)
              .map(([stage, value]) => `${stage.toUpperCase()}@${value.revision}:${value.accepted ? 'accepted' : 'missing'}`)
              .join(' · ');
            console.log(`  ${ledger.issues.length ? chalk.red('✘') : chalk.green('✔')} ${ledger.runId}: ${ledger.records} evidence records${stageSummary ? ` · ${stageSummary}` : ''}`);
            for (const issue of ledger.issues) console.log(chalk.red(`    ✘ ${issue}`));
          }
        }
        if (!result.ok) process.exitCode = 2;
      } catch (error) { fail(error); }
    });

  command.command('rollback <token>')
    .description('Restore the installer backup identified by a rollback token')
    .action((token: string, _opts: unknown, action: Command) => {
      try {
        rollbackCatalog(resolveWorkspaceRoot(action), token);
        console.log(chalk.green('✔') + ` Rolled back catalog transaction ${token}.`);
      } catch (error) { fail(error); }
    });
}
