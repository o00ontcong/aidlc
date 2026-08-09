import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import {
  validateWorkspace,
  assemblePipeline,
  recipePipelineId,
  PipelineAssembleError,
  heuristicClassify,
  scaffoldEpic,
  EpicScaffoldError,
  stepAgentId,
  AidlcApplication,
  slugEpicId,
  type PipelineConfig,
} from '@aidlc/core';
import { resolveWorkspaceRoot } from '../workspaceRoot';
import { readYaml, requireYaml, writeYaml, existingIds } from '../yamlIO';
import { listEpics, loadEpic, type EpicStatus, type EpicSummary } from '../epicsList';
import { classifyWithLlm } from './pipeline';

export function registerEpic(program: Command): void {
  const cmd = program
    .command('epic')
    .description('Unified Epic lifecycle; legacy recipe/pipeline flags remain available with deprecation guidance');

  // ── list ───────────────────────────────────────────────────────────────────
  cmd
    .command('list')
    .description('List all epics found under workspace state.root (default: docs/epics/)')
    .option('--json', 'Output raw JSON')
    .option('--status <status>', 'Filter by status (pending | in_progress | done | failed)')
    .action((opts: { json?: boolean; status?: string }, actionCmd: Command) => {
      console.error(chalk.yellow('Deprecated legacy Epic list. Use `aidlc migration preview`, then unified `aidlc epic status <id>`.'));
      const root = resolveWorkspaceRoot(actionCmd);
      const doc  = readYaml(root);
      let epics  = listEpics(root, doc);

      if (opts.status) {
        epics = epics.filter(e => e.status === opts.status);
      }

      if (opts.json) {
        console.log(JSON.stringify(epics, null, 2));
        return;
      }

      if (epics.length === 0) {
        console.log(chalk.dim('No epics found.'));
        console.log(chalk.dim(`  state.root = ${doc?.state ? (doc.state as Record<string, unknown>).root ?? 'docs/epics' : 'docs/epics'}`));
        return;
      }

      const table = new Table({
        head: [chalk.bold('Epic'), chalk.bold('Title'), chalk.bold('Progress'), chalk.bold('Status'), chalk.bold('Pipeline')],
        style: { head: [], border: [] },
      });

      for (const epic of epics) {
        const total = epic.stepDetails.length;
        const done  = epic.stepDetails.filter(s => s.status === 'done').length;
        const pct   = total ? Math.round((done / total) * 100) : 0;
        const stepLabel = total ? `${done}/${total} (${pct}%)` : '—';

        table.push([
          chalk.bold(epic.id),
          truncate(epic.title || chalk.dim('(untitled)'), 40),
          stepLabel,
          colorEpicStatus(epic.status),
          chalk.dim(epic.pipeline ?? '—'),
        ]);
      }

      console.log(table.toString());
      console.log(chalk.dim(`\n${epics.length} epic${epics.length !== 1 ? 's' : ''}`));
    });

  // ── status / show ──────────────────────────────────────────────────────────
  cmd
    .command('status <id>')
    .alias('show')
    .description('Show full status of one epic — step pipeline, inputs, paths')
    .option('--json', 'Output raw EpicSummary JSON')
    .action(async (id: string, opts: { json?: boolean }, actionCmd: Command) => {
      const root  = resolveWorkspaceRoot(actionCmd);
      if (new AidlcApplication(root).epics.load(id)) {
        await dispatchUnified(actionCmd, 'epic.status', { epicId: id }, opts);
        return;
      }
      const doc   = readYaml(root);
      console.error(chalk.yellow(`Legacy Epic ${id} detected. Run \`aidlc migration preview\` for its unified mapping.`));
      const epic  = loadEpic(root, doc, id);

      if (!epic) {
        const all = listEpics(root, doc).map(e => e.id);
        console.error(chalk.red(`Epic "${id}" not found.`));
        if (all.length > 0) {
          console.error(chalk.dim(`Available: ${all.join(', ')}`));
        }
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify(epic, null, 2));
        return;
      }

      printEpicDetail(epic);
    });

  // ── start ────────────────────────────────────────────────────────────────────
  cmd
    .command('start [epicId]')
    .description('Start a unified Epic; legacy recipe/pipeline flags remain supported for one migration window')
    .option('--recipe <id>', 'assemble a right-sized pipeline from this recipe')
    .option('--pipeline <id>', 'use an existing pipeline as-is')
    .option('--brief <text...>', 'classify this requirement brief into a recipe, then assemble')
    .option('--llm', 'use the `claude` CLI to classify --brief (falls back to heuristic)')
    .option('--from <pipelineId>', 'override the recipe\'s source pipeline')
    .option('--title <title>', 'epic title')
    .option('--desc <description>', 'epic description / requirement snapshot')
    .option('--description <description>', 'unified Epic requirement snapshot')
    .option('--type <type>', 'feature | bug | refactor | spike | maintenance')
    .option('--profile <profile>', 'quick | standard | parallel | regulated')
    .option('--json', 'Output typed command result JSON')
    .option('--input <kv>', 'capability input as key=value (repeatable)', collectKv, [] as string[])
    .action(async (epicId: string | undefined, opts: {
      recipe?: string; pipeline?: string; brief?: string[]; llm?: boolean;
      from?: string; title?: string; desc?: string; description?: string; type?: string; profile?: string; json?: boolean; input: string[];
    }, actionCmd: Command) => {
      const root = resolveWorkspaceRoot(actionCmd);
      const modes = [opts.recipe, opts.pipeline, opts.brief?.length ? 'brief' : undefined]
        .filter(Boolean).length;
      if (modes === 0) {
        if (!opts.title?.trim()) {
          console.error(chalk.red('Unified Epic start requires --title <title>.'));
          process.exitCode = 1;
          return;
        }
        await dispatchUnified(actionCmd, 'epic.start', {
          id: epicId ?? `EPIC-${slugEpicId(opts.title) || 'UNTITLED'}`,
          title: opts.title,
          description: opts.description ?? opts.desc ?? '',
          type: opts.type,
          profile: opts.profile,
        }, opts);
        return;
      }
      if (!epicId) {
        console.error(chalk.red('Legacy recipe/pipeline Epic start requires <epicId>.'));
        process.exitCode = 1;
        return;
      }
      const doc  = requireYaml(root);
      console.error(chalk.yellow('Deprecated legacy Epic start flags. Use `aidlc epic start [id] --title <title> [--profile ...]`.'));
      if (modes !== 1) {
        console.error(chalk.red('Pick exactly one of --recipe <id>, --pipeline <id>, or --brief <text>.'));
        process.exit(1);
      }

      let config;
      try {
        config = validateWorkspace(doc, '.aidlc/workspace.yaml');
      } catch (err) {
        console.error(chalk.red('workspace.yaml is invalid — fix it before starting an epic:'));
        console.error(chalk.dim(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      // Resolve the target pipeline — either an existing one, or one assembled
      // from a recipe (chosen directly or via classification) and written back.
      let pipelineCfg: PipelineConfig;
      if (opts.pipeline) {
        const found = (doc.pipelines as Array<Record<string, unknown>>)
          .find((p) => String(p.id) === opts.pipeline);
        if (!found) {
          console.error(chalk.red(`Pipeline "${opts.pipeline}" not found in workspace.yaml.`));
          process.exit(1);
        }
        pipelineCfg = found as unknown as PipelineConfig;
      } else {
        if (config.recipes.length === 0) {
          console.error(chalk.red('No recipes defined — task-type suggestion needs them.'));
          console.error(chalk.dim('  Back-fill from your existing pipeline: aidlc recipe init'));
          console.error(chalk.dim('  Or apply the preset that ships them:    aidlc preset apply sdlc'));
          process.exit(1);
        }
        let recipeId = opts.recipe;
        if (!recipeId) {
          const brief = (opts.brief ?? []).join(' ').trim();
          // Instant heuristic first (provisional), then refine with the LLM —
          // same two-stage flow the extension uses for fast feedback.
          const heur = heuristicClassify(brief, config.recipes);
          let verdict = heur;
          if (opts.llm) {
            console.log(chalk.dim(`Provisional → ${heur.recipeId} (${heur.confidence}, heuristic) — refining with claude…`));
            verdict = classifyWithLlm(brief, config.recipes) ?? heur;
          }
          recipeId = verdict.recipeId;
          console.log(chalk.dim(`Classified → ${chalk.bold(recipeId)} (${verdict.confidence}, ${verdict.source})`));
        }
        if (opts.from) {
          const recipe = config.recipes.find((r) => r.id === recipeId);
          if (recipe) { recipe.from = opts.from; }
        }
        const pipelineId = recipePipelineId({ recipeId, epicId, taken: existingIds(doc.pipelines) });
        try {
          pipelineCfg = assemblePipeline(config, { recipeId, pipelineId });
        } catch (err) {
          if (err instanceof PipelineAssembleError) {
            console.error(chalk.red('Could not assemble pipeline: ') + chalk.dim(err.message));
            process.exit(1);
          }
          throw err;
        }
        doc.pipelines.push(pipelineCfg as unknown as Record<string, unknown>);
        try {
          validateWorkspace(doc, '.aidlc/workspace.yaml');
        } catch (err) {
          console.error(chalk.red('Assembled pipeline failed validation — not written:'));
          console.error(chalk.dim(err instanceof Error ? err.message : String(err)));
          process.exit(1);
        }
        writeYaml(root, doc);
        console.log(chalk.dim(`Assembled pipeline ${chalk.bold(pipelineCfg.id)} from recipe ${chalk.bold(recipeId)}`));
      }

      const agents = Array.isArray(pipelineCfg.steps)
        ? (pipelineCfg.steps as unknown[]).map(stepAgentId)
        : [];

      const inputs: Record<string, string> = {};
      for (const kv of opts.input) {
        const eq = kv.indexOf('=');
        if (eq > 0) { inputs[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim(); }
      }

      try {
        const { epicDir } = scaffoldEpic({
          workspaceRoot: root,
          doc,
          epicId,
          title: opts.title?.trim() ?? '',
          description: opts.desc?.trim() ?? '',
          target: { kind: 'pipeline', id: pipelineCfg.id },
          agents,
          inputs,
          pipeline: pipelineCfg,
        });
        const steps = agents.join(' → ');
        console.log(chalk.green('✔') + ` Started epic ${chalk.bold(epicId)}`);
        console.log(chalk.dim(`  Pipeline: ${pipelineCfg.id}`));
        console.log(chalk.dim(`  Steps:    ${steps}`));
        console.log(chalk.dim(`  Dir:      ${epicDir}`));

        // Resolve the slash command Claude actually has for the first step.
        // Commands are registered in workspace.yaml `slash_commands` and
        // namespaced to the *source* pipeline (e.g. `/sdlc-parallel-full-implement`),
        // not the per-epic pipeline — so we can't just print `/<agent>`. Match
        // by the step's DAG name + agent, falling back to a bare `/<name>`.
        const firstStep = (Array.isArray(pipelineCfg.steps) ? pipelineCfg.steps[0] : undefined) as
          { name?: string; agent?: string } | undefined;
        const firstName = firstStep?.name ?? firstStep?.agent ?? agents[0];
        const slashCmds = (Array.isArray(doc.slash_commands) ? doc.slash_commands : []) as
          Array<{ name?: string; agent?: string }>;
        const match = slashCmds.find(
          (c) => typeof c.name === 'string' && c.name.endsWith(`-${firstName}`) && c.agent === agents[0],
        ) ?? slashCmds.find((c) => typeof c.name === 'string' && c.name.endsWith(`-${firstName}`));
        const runCmd = match?.name ?? `/${firstName}`;
        console.log(`\nRun ${chalk.cyan(`${runCmd} ${epicId}`)} in Claude to begin.`);
      } catch (err) {
        if (err instanceof EpicScaffoldError) {
          console.error(chalk.red(err.message));
          process.exit(1);
        }
        throw err;
      }
    });

  cmd.command('run <id>')
    .description('Compile and start the authoritative workflow run')
    .option('--mode <mode>', 'guide | assist | auto | unattended')
    .option('--pack <pack>', 'Workflow pack id', 'sdlc-core')
    .option('--workflow-hash <hash>', 'Deprecated compatibility input')
    .option('--json', 'Output typed command result JSON')
    .action(async (id: string, opts: { mode?: string; pack: string; workflowHash?: string; json?: boolean }, actionCmd: Command) =>
      dispatchUnified(actionCmd, 'epic.run', { epicId: id, mode: opts.mode, packId: opts.pack, workflowHash: opts.workflowHash }, opts));

  for (const action of ['prepare', 'next', 'explain', 'resume', 'review', 'ship'] as const) {
    cmd.command(`${action} <id>`)
      .description(`${action} a unified Epic`)
      .option('--json', 'Output typed command result JSON')
      .action(async (id: string, opts: { json?: boolean }, actionCmd: Command) =>
        dispatchUnified(actionCmd, `epic.${action}`, { epicId: id }, opts));
  }
}

let unifiedCommandSequence = 0;
async function dispatchUnified(command: Command, name: string, payload: unknown, options: { json?: boolean }): Promise<void> {
  const app = new AidlcApplication(resolveWorkspaceRoot(command));
  unifiedCommandSequence += 1;
  const result = await app.bus.dispatch(app.bus.command(`cli-${Date.now()}-${unifiedCommandSequence}`, name, { kind: 'user', id: 'cli' }, payload));
  process.exitCode = result.status === 'ok' ? 0 : result.status === 'waiting-for-user' ? 2 : result.status === 'blocked' ? 3 : 1;
  void options;
  console.log(JSON.stringify(result, null, 2));
}

/** Commander collector for repeatable `--input key=value` flags. */
function collectKv(value: string, acc: string[]): string[] {
  acc.push(value);
  return acc;
}

// ── Rendering helpers ─────────────────────────────────────────────────────────

function printEpicDetail(epic: EpicSummary): void {
  console.log();
  console.log(chalk.bold(epic.id) + '  ' + colorEpicStatus(epic.status));
  if (epic.title)       { console.log(chalk.dim('  title:    ') + epic.title); }
  if (epic.description) { console.log(chalk.dim('  desc:     ') + epic.description); }
  if (epic.pipeline)    { console.log(chalk.dim('  pipeline: ') + epic.pipeline); }
  if (epic.createdAt)   { console.log(chalk.dim('  created:  ') + epic.createdAt); }
  console.log(chalk.dim('  state:    ') + chalk.dim(epic.statePath));
  console.log();

  if (epic.stepDetails.length > 0) {
    epic.stepDetails.forEach((s, i) => {
      const isCurrent = i === epic.currentStep && epic.status === 'in_progress';
      const marker    = isCurrent ? chalk.yellow('▶') : ' ';
      const status    = colorEpicStatus(s.status);
      const agent     = isCurrent ? chalk.bold(s.agent || '?') : chalk.dim(s.agent || '?');
      const finished  = s.finishedAt ? chalk.dim(` ✓ ${s.finishedAt.slice(0, 19).replace('T', ' ')}`) : '';
      console.log(`  ${marker} ${chalk.dim((i + 1) + '.')} ${agent.padEnd(20)} ${status}${finished}`);
    });
    console.log();
  }

  const inputKeys = Object.keys(epic.inputs);
  if (inputKeys.length > 0) {
    console.log(chalk.bold('Inputs:'));
    for (const key of inputKeys) {
      const val = epic.inputs[key];
      const display = val.length > 80 ? val.slice(0, 77) + '…' : val;
      console.log(`  ${chalk.dim(key + ':')} ${display}`);
    }
    console.log();
  }
}

function colorEpicStatus(status: EpicStatus): string {
  switch (status) {
    case 'done':        return chalk.green(status);
    case 'in_progress': return chalk.yellow(status.replace('_', ' '));
    case 'failed':      return chalk.red(status);
    case 'pending':
    default:            return chalk.dim(status);
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
