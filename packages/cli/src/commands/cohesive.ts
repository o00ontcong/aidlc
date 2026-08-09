import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execFileSync } from 'child_process';
import { Command } from 'commander';
import chalk from 'chalk';

import {
  DeliveryOrchestrator,
  DeliveryStateStore,
  deliveryReviewSummaryPath,
  recordHumanCharterEdit,
  listValidatorConflicts,
  resolveValidatorConflict,
  type DeliveryHooks,
  type DeliveryRequest,
  type ValidatorConflict,
} from '@aidlc/core';
import { resolveWorkspaceRoot } from '../workspaceRoot';

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** Prompt for a single line on stdin/stdout. Returns the trimmed answer. */
function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (raw) => {
      rl.close();
      resolve(raw.trim().toLowerCase());
    });
  });
}

/** Best-effort unified diff between two files; falls back to a note if `diff` is unavailable. */
function printDiff(installedPath: string, conflictPath: string): void {
  try {
    console.log(execFileSync('diff', ['-u', installedPath, conflictPath], { encoding: 'utf8' }));
  } catch (error) {
    const stdout = (error as { stdout?: string } | undefined)?.stdout;
    if (stdout) console.log(stdout);
    else console.log(chalk.dim('  (diff unavailable — compare the files directly)'));
  }
}

function hooks(): DeliveryHooks {
  return {
    onDeliveryStage: ({ stage, detail }) => {
      console.log(chalk.bold(`\n◆ ${stage}`) + (detail ? chalk.dim(` — ${detail}`) : ''));
    },
    onStepStart: ({ stepIdx, agent }) => console.log(chalk.cyan(`  ▶ step ${stepIdx}: ${agent}`)),
    onAutoReviewResult: ({ decision, reason }) => {
      const mark = decision === 'pass' ? chalk.green('✔') : chalk.red('✘');
      console.log(`  ${mark} auto-review ${decision}: ${reason}`);
    },
    onReviewDeferred: ({ agent, reviewBundleRevision }) => {
      console.log(chalk.dim(`  ◷ ${agent}: human review deferred to bundle R${reviewBundleRevision}`));
    },
    onOutput: (chunk) => process.stdout.write(chunk),
    onErrorOutput: (chunk) => process.stderr.write(chunk),
    onStepFailed: ({ message, missing, failure }) => {
      console.error(chalk.red(`\n  ✘ ${message ?? 'Step failed.'}`));
      if (missing?.length) console.error(chalk.yellow(`  Missing: ${missing.join(', ')}`));
      if (failure) {
        console.error(chalk.dim(`  Code: ${failure.code}`));
        console.error(chalk.dim(`  Log: ${failure.logPath}`));
        for (const command of failure.recoveryCommands) console.error(chalk.dim(`  Recovery: ${command}`));
      }
    },
  };
}

function reportError(error: unknown): void {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}

/**
 * Walk every pending `.aidlc/validators/*.aidlc-new` conflict, printing a
 * diff and asking keep/accept/skip for each. Called proactively before
 * `run`/`resume` so a pending upgrade is resolved as part of starting
 * delivery rather than surfacing as a mid-run failure; `assertValidatorsReady`
 * still enforces afterward for anything left skipped (or a non-TTY shell).
 * Returns whatever is still pending once the walk finishes.
 */
async function reconcileValidatorConflictsInteractive(root: string): Promise<ValidatorConflict[]> {
  const pending = listValidatorConflicts(root);
  if (!pending.length) return [];
  if (!process.stdin.isTTY) {
    console.log(chalk.yellow(
      `${pending.length} pending validator conflict(s): ${pending.map((c) => c.rel).join(', ')}`,
    ));
    console.log('Non-interactive shell — resolve with `aidlc cohesive reconcile-validators --keep <file>` and/or `--accept <file>`.');
    return pending;
  }

  console.log(chalk.yellow(`\n${pending.length} validator upgrade(s) need reconciliation:`));
  for (const conflict of pending) {
    console.log(`\n${chalk.bold(conflict.rel)}`);
    printDiff(conflict.installedPath, conflict.conflictPath);
    // eslint-disable-next-line no-await-in-loop -- prompts must run one at a time
    const answer = await prompt(
      `Keep installed, accept bundled, or skip ${conflict.rel}? [keep/accept/skip]: `,
    );
    if (answer === 'keep' || answer === 'k') {
      resolveValidatorConflict(root, conflict.rel, 'keep');
      console.log(chalk.green(`✔ Kept installed ${conflict.rel}.`));
    } else if (answer === 'accept' || answer === 'a') {
      resolveValidatorConflict(root, conflict.rel, 'accept');
      console.log(chalk.green(`✔ Accepted bundled ${conflict.rel}.`));
    } else {
      console.log(chalk.dim(`Skipped ${conflict.rel}.`));
    }
  }
  return listValidatorConflicts(root);
}

export function registerCohesive(program: Command): void {
  const cmd = program.command('cohesive')
    .description('Run project-level Cohesive Delivery orchestration');

  cmd.command('run')
    .description('Start and execute Existing Project Autonomous Delivery')
    .requiredOption('--id <id>', 'Delivery / feature id')
    .option('--title <title>', 'Feature title (defaults to id)')
    .option('--description <text>', 'Feature request description')
    .option('--input <file>', 'Read the feature request from a text/Markdown file')
    .option('--acceptance <text>', 'Acceptance criterion (repeatable)', collect, [])
    .option('--constraint <text>', 'Constraint (repeatable)', collect, [])
    .option('--source-type <type>', 'manual|file|jira|github|other')
    .option('--source-ref <ref>', 'Optional source reference')
    .option('--max-workers <count>', 'Maximum parallel package workers', '3')
    .action(async (opts: {
      id: string; title?: string; description?: string; input?: string;
      acceptance: string[]; constraint: string[]; sourceType?: string;
      sourceRef?: string; maxWorkers: string;
    }, actionCmd: Command) => {
      try {
        const root = resolveWorkspaceRoot(actionCmd);
        const fromFile = opts.input
          ? fs.readFileSync(path.resolve(root, opts.input), 'utf8')
          : '';
        const description = (opts.description ?? fromFile).trim();
        const sourceType = (opts.sourceType ?? (opts.input ? 'file' : 'manual')) as DeliveryRequest['source'] extends infer S
          ? S extends { type: infer T } ? T : never : never;
        const request: DeliveryRequest = {
          id: opts.id,
          title: opts.title ?? opts.id,
          description,
          acceptanceCriteria: opts.acceptance,
          constraints: opts.constraint,
          source: { type: sourceType, reference: opts.sourceRef ?? opts.input },
        };
        const maxWorkers = Number(opts.maxWorkers);
        if (!Number.isInteger(maxWorkers) || maxWorkers < 1 || maxWorkers > 32) {
          throw new Error('--max-workers must be an integer between 1 and 32.');
        }
        const orchestrator = new DeliveryOrchestrator(root);
        orchestrator.create(request, {
          profile: { maxParallelWorkers: maxWorkers },
        });
        await reconcileValidatorConflictsInteractive(root);
        const state = await orchestrator.run(opts.id, { hooks: hooks() });
        console.log(chalk.green(`\n✔ Delivery ${state.id} is ready for aggregate human review.`));
        console.log(deliveryReviewSummaryPath(root, state));
      } catch (error) { reportError(error); }
    });

  cmd.command('resume <deliveryId>')
    .description('Resume an interrupted autonomous delivery')
    .action(async (deliveryId: string, _opts: unknown, actionCmd: Command) => {
      try {
        const root = resolveWorkspaceRoot(actionCmd);
        await reconcileValidatorConflictsInteractive(root);
        const orchestrator = new DeliveryOrchestrator(root);
        const previous = orchestrator.load(deliveryId);
        if (previous.lastFailure) {
          console.log(chalk.yellow(`Retrying ${previous.lastFailure.runId} from step ${previous.lastFailure.stepIdx ?? '?'} (${previous.lastFailure.code}).`));
          console.log(chalk.dim(`Previous log: ${previous.lastFailure.logPath}`));
        } else if (previous.lastError) {
          console.log(chalk.yellow(`Retrying legacy blocked delivery ${deliveryId} from its unchanged current step.`));
          console.log(chalk.dim(`Previous error (no structured log was captured by the older version): ${previous.lastError}`));
        }
        const state = await orchestrator.run(deliveryId, { hooks: hooks() });
        console.log(chalk.green(`✔ Delivery ${state.id}: ${state.status}`));
      } catch (error) { reportError(error); }
    });

  cmd.command('status [deliveryId]')
    .description('Show one delivery or list all project-level deliveries')
    .option('--json', 'Print machine-readable JSON')
    .action((deliveryId: string | undefined, opts: { json?: boolean }, actionCmd: Command) => {
      try {
        const root = resolveWorkspaceRoot(actionCmd);
        const value = deliveryId
          ? DeliveryStateStore.load(root, deliveryId)
          : DeliveryStateStore.list(root);
        if (opts.json) console.log(JSON.stringify(value, null, 2));
        else if (!value) console.log(chalk.yellow(`Delivery ${deliveryId} not found.`));
        else if (Array.isArray(value)) {
          for (const state of value) console.log(`${state.id}\t${state.status}\tR${state.reviewRevision}`);
        } else {
          console.log(`${value.id} · ${value.status} · workers ${value.workerRunIds.length} · review R${value.reviewRevision}`);
          if (value.lastFailure) {
            console.log(chalk.red(`  ${value.lastFailure.code}: ${value.lastFailure.summary}`));
            console.log(chalk.dim(`  Log: ${value.lastFailure.logPath}`));
            console.log(chalk.yellow(`  Resume: ${value.lastFailure.resumeCommand}`));
          } else if (value.lastError) {
            console.log(chalk.red(`  Legacy error: ${value.lastError}`));
            console.log(chalk.yellow(`  Resume: aidlc cohesive resume ${value.id}`));
          }
        }
      } catch (error) { reportError(error); }
    });

  cmd.command('logs <deliveryId>')
    .description('Show durable execution failure logs and recovery commands for a delivery')
    .option('--json', 'Print machine-readable JSON')
    .option('--tail <count>', 'Show only the most recent failures', '20')
    .action((deliveryId: string, opts: { json?: boolean; tail: string }, actionCmd: Command) => {
      try {
        const root = resolveWorkspaceRoot(actionCmd);
        const state = new DeliveryOrchestrator(root).load(deliveryId);
        const tail = Number(opts.tail);
        if (!Number.isInteger(tail) || tail < 1 || tail > 1000) throw new Error('--tail must be an integer between 1 and 1000.');
        const failures = (state.failureHistory ?? []).slice(-tail);
        if (opts.json) {
          console.log(JSON.stringify({ deliveryId, current: state.lastFailure, failures, legacyError: state.lastFailure ? undefined : state.lastError }, null, 2));
          return;
        }
        if (!failures.length) {
          if (state.lastError) {
            console.log(chalk.yellow(`Legacy error (no structured log was captured): ${state.lastError}`));
            console.log(`Resume after fixing: aidlc cohesive resume ${deliveryId}`);
          } else {
            console.log(chalk.dim(`Delivery ${deliveryId} has no recorded execution failures.`));
          }
          return;
        }
        for (const failure of failures) {
          const current = state.lastFailure?.id === failure.id ? chalk.red('current') : chalk.green('recovered');
          console.log(`${failure.at} · ${failure.code} · ${failure.runId} · step ${failure.stepIdx ?? '?'} · ${current}`);
          console.log(`  ${failure.summary}`);
          console.log(chalk.dim(`  ${failure.logPath}`));
          console.log(chalk.dim(`  ${failure.recoveryCommands.join(' && ')}`));
        }
      } catch (error) { reportError(error); }
    });

  cmd.command('add-task <deliveryId>')
    .description('Add one task to the aggregate human review')
    .requiredOption('--title <text>', 'Task title')
    .option('--acceptance <text>', 'Acceptance criterion (repeatable)', collect, [])
    .option('--severity <severity>', 'blocking|follow-up', 'blocking')
    .option('--run <runId>', 'Explicit target run')
    .option('--step <step>', 'Explicit target step')
    .action((deliveryId: string, opts: {
      title: string; acceptance: string[]; severity: 'blocking' | 'follow-up'; run?: string; step?: string;
    }, actionCmd: Command) => {
      try {
        const root = resolveWorkspaceRoot(actionCmd);
        const task = new DeliveryOrchestrator(root).addTask(deliveryId, {
          title: opts.title,
          acceptanceCriteria: opts.acceptance,
          severity: opts.severity,
          target: opts.run || opts.step ? { runId: opts.run, step: opts.step } : undefined,
        });
        console.log(chalk.green(`✔ Added ${task.id}: ${task.title}`));
      } catch (error) { reportError(error); }
    });

  cmd.command('rework <deliveryId>')
    .description('Route pending human tasks, selectively rerun affected work, and rebuild the review bundle')
    .action(async (deliveryId: string, _opts: unknown, actionCmd: Command) => {
      try {
        const root = resolveWorkspaceRoot(actionCmd);
        const state = await new DeliveryOrchestrator(root).rework(deliveryId, { hooks: hooks() });
        console.log(chalk.green(`✔ Rework complete; review bundle R${state.reviewRevision} is ready.`));
      } catch (error) { reportError(error); }
    });

  cmd.command('review <deliveryId>')
    .description('Print the aggregate human review Markdown')
    .option('--path', 'Print the summary path only')
    .action((deliveryId: string, opts: { path?: boolean }, actionCmd: Command) => {
      try {
        const root = resolveWorkspaceRoot(actionCmd);
        const state = new DeliveryOrchestrator(root).load(deliveryId);
        const file = deliveryReviewSummaryPath(root, state);
        console.log(opts.path ? file : fs.readFileSync(file, 'utf8'));
      } catch (error) { reportError(error); }
    });

  cmd.command('resume-after-merge <deliveryId>')
    .description('Run await-merge/project-sync after the feature PR has been merged')
    .action(async (deliveryId: string, _opts: unknown, actionCmd: Command) => {
      try {
        const root = resolveWorkspaceRoot(actionCmd);
        const state = await new DeliveryOrchestrator(root).resumeAfterMerge(deliveryId, hooks());
        console.log(chalk.green(`✔ Delivery ${state.id} completed.`));
      } catch (error) { reportError(error); }
    });

  cmd.command('confirm-context <deliveryId>')
    .description('Record manual edits to the inferred project charter and selectively rework delivery context')
    .option('--id <charterId>', 'Confirm only this goal/invariant/tech-rule id (repeatable)', collect, [])
    .option('--no-rework', 'Only record the edit; do not rerun affected delivery steps')
    .action(async (deliveryId: string, opts: { id: string[]; rework: boolean }, actionCmd: Command) => {
      try {
        const root = resolveWorkspaceRoot(actionCmd);
        const orchestrator = new DeliveryOrchestrator(root);
        const state = orchestrator.load(deliveryId);
        if (opts.rework && state.status === 'completed') {
          throw new Error('Completed delivery is immutable; use --no-rework or create a follow-up delivery.');
        }
        const result = recordHumanCharterEdit(root, {
          confirmIds: opts.id,
          confirmAll: opts.id.length === 0,
        });
        console.log(chalk.green(
          `✔ Charter revision ${result.revision} recorded (${result.status}); rules projections updated.`,
        ));
        if (opts.rework) {
          orchestrator.addTask(deliveryId, {
            title: `Human revised project charter to revision ${result.revision}.`,
            acceptanceCriteria: ['Refresh project evidence, drift report, context manifest, and downstream alignment.'],
            target: { runId: state.projectContextRunId, step: 'define-charter' },
          });
          const updated = await orchestrator.rework(deliveryId, { hooks: hooks() });
          console.log(chalk.green(`✔ Delivery refreshed; review bundle R${updated.reviewRevision} is ready.`));
        }
      } catch (error) { reportError(error); }
    });

  cmd.command('reconcile-validators')
    .description('Review pending .aidlc/validators/*.aidlc-new upgrades and keep or accept each one')
    .option('--keep <file>', 'Keep the installed validator as-is (repeatable, skips prompting for it)', collect, [])
    .option('--accept <file>', 'Accept the bundled replacement, discarding local changes (repeatable)', collect, [])
    .option('--list', 'List pending conflicts as JSON and exit; no prompting')
    .action(async (opts: { keep: string[]; accept: string[]; list?: boolean }, actionCmd: Command) => {
      try {
        const root = resolveWorkspaceRoot(actionCmd);
        for (const rel of opts.keep) resolveValidatorConflict(root, rel, 'keep');
        for (const rel of opts.accept) resolveValidatorConflict(root, rel, 'accept');

        if (opts.list) {
          console.log(JSON.stringify(listValidatorConflicts(root).map((c) => c.rel), null, 2));
          return;
        }

        if (!listValidatorConflicts(root).length) {
          console.log(chalk.green('✔ No pending validator conflicts.'));
          return;
        }
        const pending = await reconcileValidatorConflictsInteractive(root);
        if (pending.length) {
          console.log(chalk.yellow(`\n${pending.length} conflict(s) still pending: ${pending.map((c) => c.rel).join(', ')}`));
        } else {
          console.log(chalk.green('\n✔ All validator conflicts resolved.'));
        }
      } catch (error) { reportError(error); }
    });
}
