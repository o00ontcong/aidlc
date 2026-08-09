import { Command } from 'commander';
import {
  AidlcApplication,
  type GateSubject,
} from '@aidlc/core';
import { resolveWorkspaceRoot } from '../../workspaceRoot';

/**
 * V3's terminal adapter deliberately owns parsing and presentation only.  It
 * must not reimplement Epic, project, gate, or artifact behaviour: every
 * invocation crosses the same AidlcApplication command boundary as the
 * extension host and the Claude command template.
 *
 * The `-v3` group names avoid changing the legacy CLI during the migration
 * window.  They can become the canonical groups when the compatibility
 * commands are retired.
 */

type JsonOptions = { json?: boolean };
type CommandActor = { kind: 'user'; id: string };
type CommandResult = Awaited<ReturnType<AidlcApplication['bus']['dispatch']>>;

const actor: CommandActor = { kind: 'user', id: 'cli' };
let commandSequence = 0;

function invocationId(name: string): string {
  commandSequence += 1;
  return `cli-v3-${Date.now()}-${commandSequence}-${name.replace(/[^a-z0-9]+/g, '-')}`;
}

function application(command: Command): AidlcApplication {
  return new AidlcApplication(resolveWorkspaceRoot(command));
}

function print(result: CommandResult | Record<string, unknown>, options: JsonOptions = {}): void {
  // Structured result output is intentionally the default: it is stable for
  // Claude, shell automation, and the Extension's terminal hand-off.  The
  // --json switch remains an explicit compatibility/documentation affordance.
  void options;
  console.log(JSON.stringify(result, null, 2));
}

function setExitCode(status: CommandResult['status']): void {
  process.exitCode = status === 'ok' ? 0 : status === 'waiting-for-user' ? 2 : status === 'blocked' ? 3 : 1;
}

async function dispatch<Payload>(
  command: Command,
  name: string,
  payload: Payload,
  options: JsonOptions,
): Promise<void> {
  const aidlc = application(command);
  const id = invocationId(name);
  try {
    const request = aidlc.bus.command(id, name, actor, payload);
    const result = await aidlc.bus.dispatch(request);
    setExitCode(result.status);
    print(result, options);
  } catch (error) {
    // Domain validation errors are still part of the public command protocol,
    // rather than an unstructured Commander stack trace.  The application
    // remains responsible for behaviour; this adapter only serializes failure.
    process.exitCode = 1;
    print({
      schemaVersion: 1,
      commandId: id,
      status: 'error',
      warnings: [],
      evidence: [],
      recoveryActions: [],
      error: {
        code: 'command.execution_failed',
        summary: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString(),
        recoveryActions: [],
      },
    }, options);
  }
}

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

/** Register the migration-safe AIDLC v3 command surface. */
export function registerRedesignCommands(program: Command): void {
  registerEpicCommands(program); // compatibility alias; canonical `epic` is registered by the legacy adapter.
  registerProjectCommands(program);
  registerContextCommands(program);
  registerGateCommands(program);
  registerArtifactCommands(program);
  registerGuideCommands(program);
  registerMigrationCommands(program);
}

function registerMigrationCommands(program: Command): void {
  const migration = program.command('migration').description('Preview, apply, or roll back legacy state migration');
  migration.command('preview').option('--json', 'Print typed JSON').action(async (options: JsonOptions, command: Command) =>
    dispatch(command, 'migration.preview', {}, options));
  migration.command('apply <migration-id>').requiredOption('--confirm', 'Confirm additive migration').option('--json', 'Print typed JSON')
    .action(async (migrationId: string, options: JsonOptions & { confirm: boolean }, command: Command) =>
      dispatch(command, 'migration.apply', { migrationId, confirm: options.confirm }, options));
  migration.command('rollback <migration-id>').requiredOption('--confirm', 'Confirm rollback of unchanged migration projections').option('--json', 'Print typed JSON')
    .action(async (migrationId: string, options: JsonOptions & { confirm: boolean }, command: Command) =>
      dispatch(command, 'migration.rollback', { migrationId, confirm: options.confirm }, options));

  // §12.1 originally documented the option-style spelling. Keep it for at
  // least one migration window while `migration preview|apply|rollback` is the
  // canonical, composable command group.
  program.command('migrate')
    .description('Compatibility alias for legacy migration commands')
    .option('--preview', 'Preview source-to-target mappings without writing')
    .option('--apply <migration-id>', 'Apply a previously previewed migration')
    .option('--rollback <migration-id>', 'Roll back unchanged projections created by a migration')
    .option('--confirm', 'Confirm apply or rollback')
    .option('--json', 'Print typed JSON')
    .action(async (options: JsonOptions & { preview?: boolean; apply?: string; rollback?: string; confirm?: boolean }, command: Command) => {
      const selected = [options.preview === true, Boolean(options.apply), Boolean(options.rollback)].filter(Boolean).length;
      if (selected !== 1) throw new Error('Use exactly one of --preview, --apply <migration-id>, or --rollback <migration-id>.');
      if (options.preview) return dispatch(command, 'migration.preview', {}, options);
      if (!options.confirm) throw new Error('Migration apply/rollback requires --confirm.');
      return options.apply
        ? dispatch(command, 'migration.apply', { migrationId: options.apply, confirm: true }, options)
        : dispatch(command, 'migration.rollback', { migrationId: options.rollback!, confirm: true }, options);
    });
}

function registerEpicCommands(program: Command): void {
  const epic = program
    .command('epic-v3')
    .alias('epic3')
    .description('Unified Epic commands (redesign v3; all state flows through AidlcApplication)');

  epic.command('start <id>')
    .description('Create a unified Epic or return the existing idempotent result')
    .requiredOption('--title <title>', 'Epic title')
    .option('--description <text>', 'Requirement snapshot', '')
    .option('--type <type>', 'feature | bug | refactor | spike | maintenance', 'feature')
    .option('--profile <profile>', 'quick | standard | parallel | regulated')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (id: string, options: JsonOptions & { title: string; description: string; type: string; profile: string }, command: Command) =>
      dispatch(command, 'epic.start', {
        id,
        title: options.title,
        description: options.description,
        type: options.type,
        profile: options.profile,
      }, options));

  epic.command('status <id>')
    .alias('show')
    .description('Read unified Epic status and its next safe action')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (id: string, options: JsonOptions, command: Command) =>
      dispatch(command, 'epic.status', { epicId: id }, options));

  epic.command('resume <id>')
    .description('Resume a paused, blocked, or waiting unified Epic')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (id: string, options: JsonOptions, command: Command) =>
      dispatch(command, 'epic.resume', { epicId: id }, options));

  epic.command('run <id>')
    .description('Create or resume the durable workflow run for an Epic')
    .option('--workflow-hash <hash>', 'Deprecated compatibility input; compiler output is authoritative')
    .option('--pack <pack>', 'Workflow pack id', 'sdlc-core')
    .option('--mode <mode>', 'guide | assist | auto | unattended — updates Epic default autonomy before run')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (id: string, options: JsonOptions & { workflowHash?: string; pack: string; mode?: string }, command: Command) =>
      dispatch(command, 'epic.run', {
        epicId: id,
        workflowHash: options.workflowHash,
        packId: options.pack,
        ...(options.mode ? { mode: options.mode } : {}),
      }, options));

  for (const action of ['prepare', 'next', 'explain', 'review', 'ship'] as const) {
    epic.command(`${action} <id>`)
      .description(`${action} a unified Epic through the shared application boundary`)
      .option('--json', 'Print the typed command result as JSON')
      .action(async (id: string, options: JsonOptions, command: Command) =>
        dispatch(command, `epic.${action}`, { epicId: id }, options));
  }
}

function registerProjectCommands(program: Command): void {
  const project = program
    .command('project')
    .aliases(['project-v3', 'project3'])
    .description('Project intelligence commands (redesign v3)');

  project.command('setup')
    .description('Preview or apply the standard AIDLC layout and install the Claude /aidlc command')
    .option('--confirm', 'Apply the layout preview (required to write files)')
    .option('--force-claude-command', 'Overwrite an existing .claude/commands/aidlc.md that differs')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (options: JsonOptions & { confirm?: boolean; forceClaudeCommand?: boolean }, command: Command) =>
      dispatch(command, 'project.setup', {
        confirm: options.confirm === true,
        forceClaudeCommand: options.forceClaudeCommand === true,
      }, options));

  project.command('analyze')
    .description('Read-only project analysis; never refreshes context implicitly')
    .option('--project-id <id>', 'Project id (defaults to workspace)')
    .option('--source-commit <sha>', 'Commit the facts are derived from')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (options: JsonOptions & { projectId?: string; sourceCommit?: string }, command: Command) =>
      dispatch(command, 'project.analyze', {
        projectId: options.projectId,
        sourceCommit: options.sourceCommit,
      }, options));

  project.command('recommend')
    .description('Create a recommendation proposal from the current or read-only analyzed context')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (options: JsonOptions, command: Command) => dispatch(command, 'project.recommend', {}, options));

  for (const action of ['accept', 'lock'] as const) {
    project.command(`recommend-${action}`)
      .description(`${action} the current recommendation proposal`)
      .option('--json', 'Print the typed command result as JSON')
      .action(async (options: JsonOptions, command: Command) => dispatch(command, `project.recommend.${action}`, {}, options));
  }
  project.command('recommend-override')
    .requiredOption('--profile <profile>', 'quick | standard | parallel | regulated')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (options: JsonOptions & { profile: string }, command: Command) =>
      dispatch(command, 'project.recommend.override', { workflowProfile: options.profile }, options));

  project.command('context-refresh')
    .alias('refresh-context')
    .description('Explicitly create a new Project Context revision')
    .option('--project-id <id>', 'Project id (defaults to workspace)')
    .option('--source-commit <sha>', 'Commit the facts are derived from')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (options: JsonOptions & { projectId?: string; sourceCommit?: string }, command: Command) =>
      dispatch(command, 'project.context.refresh', {
        projectId: options.projectId,
        sourceCommit: options.sourceCommit,
      }, options));

  const projectContext = project.command('context').description('Published Project Context commands');
  projectContext.command('status')
    .option('--source-commit <sha>', 'Current source commit to compare')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (options: JsonOptions & { sourceCommit?: string }, command: Command) =>
      dispatch(command, 'project.context.status', { sourceCommit: options.sourceCommit }, options));
  projectContext.command('refresh')
    .option('--project-id <id>', 'Project id (defaults to workspace)')
    .option('--source-commit <sha>', 'Commit the facts are derived from')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (options: JsonOptions & { projectId?: string; sourceCommit?: string }, command: Command) =>
      dispatch(command, 'project.context.refresh', { projectId: options.projectId, sourceCommit: options.sourceCommit }, options));
}

function registerContextCommands(program: Command): void {
  const context = program
    .command('context')
    .aliases(['context-v3', 'context3'])
    .description('Explicit Project Context actions (redesign v3)');

  context.command('refresh')
    .description('Alias of project-v3 context-refresh')
    .option('--project-id <id>', 'Project id (defaults to workspace)')
    .option('--source-commit <sha>', 'Commit the facts are derived from')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (options: JsonOptions & { projectId?: string; sourceCommit?: string }, command: Command) =>
      dispatch(command, 'project.context.refresh', {
        projectId: options.projectId,
        sourceCommit: options.sourceCommit,
      }, options));

  context.command('status')
    .description('Report whether the published Project Context is stale without refreshing it')
    .option('--source-commit <sha>', 'Current source commit to compare')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (options: JsonOptions & { sourceCommit?: string }, command: Command) =>
      dispatch(command, 'project.context.status', { sourceCommit: options.sourceCommit }, options));
}

function registerGateCommands(program: Command): void {
  const gate = program
    .command('gate')
    .aliases(['gate-v3', 'gate3'])
    .description('Preview autonomy approval gates without mutation (redesign v3)');

  gate.command('preview')
    .description('Explain whether an operation needs human approval; performs no operation')
    .requiredOption('--content-summary <text>', 'Human-readable summary of the proposed action')
    .option('--mode <mode>', 'guide | assist | auto | unattended', 'guide')
    .option('--epic-id <id>', 'Use the Epic autonomy policy instead of the default guide policy')
    .option('--stage <stage>', 'understand | plan | build | verify | ship')
    .option('--mutation', 'The operation mutates local state')
    .option('--destructive', 'The operation deletes or overwrites material state')
    .option('--merge-default-branch', 'The operation merges into the default branch')
    .option('--external-communication <kind>', 'pull-request | issue | comment | email-chat | release-announcement | publish-package')
    .option('--gate <kind>', 'Custom policy gate kind')
    .option('--risk <risk>', 'low | medium | high | critical')
    .option('--destination <destination>', 'Target branch, repository, or external destination')
    .option('--mutation-scope <path>', 'Path affected by the operation (repeatable)', collect, [])
    .option('--json', 'Print the typed command result as JSON')
    .action(async (options: JsonOptions & {
      mode: GateSubject extends never ? never : 'guide' | 'assist' | 'auto' | 'unattended';
      epicId?: string;
      stage?: 'understand' | 'plan' | 'build' | 'verify' | 'ship';
      mutation?: boolean;
      destructive?: boolean;
      mergeDefaultBranch?: boolean;
      externalCommunication?: GateSubject['externalCommunication'];
      gate?: GateSubject['gate'];
      risk?: GateSubject['risk'];
      destination?: string;
      contentSummary: string;
      mutationScope: string[];
    }, command: Command) => {
      const subject: GateSubject = {
        mutation: options.mutation,
        destructive: options.destructive,
        mergeDefaultBranch: options.mergeDefaultBranch,
        externalCommunication: options.externalCommunication,
        gate: options.gate,
        risk: options.risk,
        destination: options.destination,
        contentSummary: options.contentSummary,
        mutationScope: options.mutationScope,
      };
      await dispatch(command, 'gate.preview', {
        subject,
        mode: options.mode,
        epicId: options.epicId,
        stageId: options.stage,
      }, options);
    });

  for (const outcome of ['approve', 'reject'] as const) {
    gate.command(`${outcome} <epic-id> <gate-id>`)
      .description(`${outcome} one durable pending gate`)
      .option('--reason <text>', 'Decision reason')
      .option('--json', 'Print the typed command result as JSON')
      .action(async (epicId: string, gateId: string, options: JsonOptions & { reason?: string }, command: Command) =>
        dispatch(command, `gate.${outcome}`, { epicId, gateId, reason: options.reason }, options));
  }
}

function registerGuideCommands(program: Command): void {
  const guide = program.command('guide-v3').alias('guide3').description('Contextual guide and diagnostics commands (redesign v3)');
  guide.command('help [topic]')
    .description('Show the AIDLC command reference (topics: start)')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (topic: string | undefined, options: JsonOptions, command: Command) =>
      dispatch(command, 'guide.help', { topic: topic ?? '' }, options));
  guide.command('doctor')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (options: JsonOptions, command: Command) => dispatch(command, 'guide.doctor', {}, options));
  guide.command('why-blocked <epic-id>')
    .alias('why')
    .description('Explain why an Epic is waiting or blocked, with recovery actions')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (epicId: string, options: JsonOptions, command: Command) =>
      dispatch(command, 'guide.why.blocked', { epicId }, options));
}

function registerArtifactCommands(program: Command): void {
  const artifact = program
    .command('artifact')
    .aliases(['artifact-v3', 'artifact3'])
    .description('Artifact policy commands (redesign v3)');

  artifact.command('preview-commit <epic-id> <type...>')
    .description('List only policy-selected artifacts eligible for a local commit; never commits')
    .option('--json', 'Print the typed command result as JSON')
    .action(async (epicId: string, types: string[], options: JsonOptions, command: Command) =>
      dispatch(command, 'artifact.preview.commit', { epicId, types }, options));
}
