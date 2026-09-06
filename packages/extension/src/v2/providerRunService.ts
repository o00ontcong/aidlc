import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { getCommandProviderAdapter } from '@aidlc/core';

import { syncBuiltinPipelineCommands } from './presetWizards';
import { readEpicsDirFromYaml, DEFAULT_EPICS_DIR } from './epicsDirSync';
import { availableModelsForProvider, getProviderConfigStore } from './providerConfig';
import {
  buildCodexRunPrompt,
  buildOpenCodeRunPrompt,
  buildProviderCommandPrompt,
  buildHeadlessAnalysisInvocation,
  buildTaskPrompt,
  canonicalModelForSlash,
  resolveRunnableModel,
  terminalNameForProvider,
} from './providerRunLogic';
import {
  ensureMarkdownOutputLanguagePolicy,
  markdownOutputLanguageInstruction,
  resolveAidlcLanguage,
} from './outputLanguage';
import { prepareDeliveryRun } from './cofofoRunPrep';

export {
  buildCodexRunPrompt,
  buildOpenCodeRunPrompt,
  buildProviderCommandPrompt,
  buildHeadlessAnalysisInvocation,
  buildTaskPrompt,
  canonicalModelForSlash,
  resolveRunnableModel,
  slashCommandName,
  terminalNameForProvider,
} from './providerRunLogic';

const TERMINAL_ENV: Record<string, string> = {
  DISABLE_AUTO_UPDATE: 'true',
  DISABLE_UPDATE_PROMPT: 'true',
};

function mappedOrFallbackModel(opts: {
  providerId: string;
  cli: string;
  root: string;
  mappedModel: string | undefined;
  defaultModel: string | undefined;
}): string | undefined {
  const resolved = resolveRunnableModel(
    opts.mappedModel,
    opts.defaultModel,
    (() => {
      const models = availableModelsForProvider(opts.root, opts.providerId, opts.cli);
      return models ? new Set(models) : undefined;
    })(),
  );
  if (resolved.fellBack) {
    void vscode.window.showWarningMessage(
      `AIDLC: ${opts.mappedModel} is unavailable in ${opts.providerId}; using default model ${resolved.model}.`,
    );
  }
  return resolved.model;
}

export function ensureCommandFilesForProvider(
  root: string,
  extensionPath: string,
  providerId: string,
): void {
  try {
    const configured = vscode.workspace.getConfiguration('aidlc').get<string>('displayLanguage', 'auto');
    ensureMarkdownOutputLanguagePolicy(root, resolveAidlcLanguage(configured, vscode.env.language));
    syncBuiltinPipelineCommands(root, extensionPath, { providers: [providerId] });
    syncExtensionCommandsForProvider(root, extensionPath, providerId);
  } catch (err) {
    console.warn('[ensureCommandFilesForProvider]', err);
  }
}

/** Commands owned by the extension rather than a workflow template. */
function syncExtensionCommandsForProvider(
  root: string,
  extensionPath: string,
  providerId: string,
): void {
  const adapter = getCommandProviderAdapter(providerId);
  const store = getProviderConfigStore(root);
  const config = store.loadOrDefault();
  const model = store.modelFor(providerId, undefined, config);
  const commands = [
    {
      commandName: 'annotate-artifact',
      sourceName: 'annotate-artifact.skill.md',
      description: 'Review an epic Markdown artifact interactively in annotron.',
      usesEpicRoot: true,
    },
    {
      commandName: 'architecture-studio-generate',
      sourceName: 'architecture-studio-generate.skill.md',
      description: 'Analyze source code and generate the standalone Architecture Studio manifest.',
      usesEpicRoot: false,
    },
  ];
  // Epic-aware extension commands need their prose rewritten to the active
  // Epic root. Standalone commands (Architecture Studio) deliberately skip
  // that substitution so they remain isolated from Epic configuration.
  const epicsDir = readEpicsDirFromYaml(root);
  for (const command of commands) {
    const source = path.join(extensionPath, 'assets', command.sourceName);
    const destination = adapter.commandFilePath(root, command.commandName);
    if (!fs.existsSync(source) || fs.existsSync(destination)) { continue; }
    const rawBody = fs.readFileSync(source, 'utf8').replace(/^---[\s\S]*?---\n?/, '');
    const body = !command.usesEpicRoot || epicsDir === DEFAULT_EPICS_DIR
      ? rawBody
      : rawBody.replaceAll(DEFAULT_EPICS_DIR, epicsDir);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, adapter.renderCommandFile({
      commandName: command.commandName,
      description: command.description,
      body,
      epicRoot: epicsDir,
    }, model), 'utf8');
  }
}

const busyTerminals = new WeakSet<vscode.Terminal>();
let shellExecutionTrackingReady = false;

/**
 * A reused terminal only stays safe to type a new one-shot command into
 * while its previous command has actually returned to an idle shell prompt.
 * An interactive `claude` session left alive (waiting for the next turn)
 * never fires the shell-integration "end execution" event for the command
 * that launched it, so it correctly stays marked busy for as long as it's
 * alive — without this, `spawnTerminalOneShot` would type the next one-shot
 * invocation as plain chat input into that still-running session instead of
 * launching a new one with the intended model/command.
 */
function ensureShellExecutionTracking(): void {
  if (shellExecutionTrackingReady) { return; }
  shellExecutionTrackingReady = true;
  vscode.window.onDidStartTerminalShellExecution((e) => { busyTerminals.add(e.terminal); });
  vscode.window.onDidEndTerminalShellExecution((e) => { busyTerminals.delete(e.terminal); });
  vscode.window.onDidCloseTerminal((t) => { busyTerminals.delete(t); });
}

export function spawnTerminalOneShot(opts: {
  oneShot: string;
  terminalName: string;
  cwd?: string;
  fresh?: boolean;
}): void {
  ensureShellExecutionTracking();
  const cwd = opts.cwd && fs.existsSync(opts.cwd) ? opts.cwd : undefined;

  if (!opts.fresh) {
    const existing = vscode.window.terminals.find((t) => t.name === opts.terminalName);
    if (existing && existing.exitStatus === undefined && !busyTerminals.has(existing)) {
      existing.show(false);
      existing.sendText(opts.oneShot, true);
      return;
    }
  }

  const terminal = vscode.window.createTerminal({
    name: opts.terminalName,
    cwd,
    iconPath: new vscode.ThemeIcon('rocket'),
    location: vscode.TerminalLocation.Panel,
    env: TERMINAL_ENV,
  });
  terminal.show(false);

  let sent = false;
  const integ = vscode.window.onDidChangeTerminalShellIntegration((e) => {
    if (e.terminal === terminal && e.shellIntegration && !sent) {
      sent = true;
      e.shellIntegration.executeCommand(opts.oneShot);
      integ.dispose();
    }
  });
  setTimeout(() => {
    if (!sent) {
      sent = true;
      terminal.sendText(opts.oneShot, true);
      integ.dispose();
    }
  }, 2000);
}

export function spawnReplTerminal(opts: {
  replCommand: string;
  terminalName: string;
  cwd?: string;
}): void {
  const existing = vscode.window.terminals.find((t) => t.name === opts.terminalName);
  if (existing) {
    existing.show(false);
    return;
  }

  const cwd = opts.cwd && fs.existsSync(opts.cwd) ? opts.cwd : undefined;
  const terminal = vscode.window.createTerminal({
    name: opts.terminalName,
    cwd,
    iconPath: new vscode.ThemeIcon('rocket'),
    location: vscode.TerminalLocation.Panel,
    env: TERMINAL_ENV,
  });
  terminal.show(false);

  let sent = false;
  const integ = vscode.window.onDidChangeTerminalShellIntegration((e) => {
    if (e.terminal === terminal && e.shellIntegration && !sent) {
      sent = true;
      e.shellIntegration.executeCommand(opts.replCommand);
      integ.dispose();
    }
  });
  setTimeout(() => {
    if (!sent) {
      sent = true;
      terminal.sendText(opts.replCommand, true);
      integ.dispose();
    }
  }, 2000);
}

export function openAgentTerminal(providerId?: string): void {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const cwd = root && fs.existsSync(root) ? root : undefined;
  const store = root ? getProviderConfigStore(root) : null;
  const config = store?.loadOrDefault();
  const id = providerId ?? config?.defaultProvider ?? 'claude';
  const adapter = getCommandProviderAdapter(id);
  const cli = store?.cliFor(id, config!) ?? adapter.cliBinary;
  spawnReplTerminal({
    replCommand: cli,
    terminalName: terminalNameForProvider(adapter.displayName),
    cwd,
  });
}

export function runStepWithProvider(opts: {
  slashCommand: string;
  runId: string;
  feedback?: string;
  providerId?: string;
  root: string;
  extensionPath: string;
  /** A focused owner such as a Discover step can keep one visible native session. */
  terminalName?: string;
}): void {
  const store = getProviderConfigStore(opts.root);
  const config = store.loadOrDefault();
  const providerId = opts.providerId ?? config.defaultProvider;
  const adapter = getCommandProviderAdapter(providerId);
  const cli = store.cliFor(providerId, config);

  ensureCommandFilesForProvider(opts.root, opts.extensionPath, providerId);

  const prep = prepareDeliveryRun(opts.root, opts.runId);
  if (prep.rebased) {
    void vscode.window.showInformationMessage(
      'AIDLC: pipeline contract updated for this step. Re-running with the current gates.',
    );
  }
  const effectiveFb = [prep.extraFeedback, (opts.feedback ?? '').trim()].filter(Boolean).join('\n\n');

  const taskPrompt = buildTaskPrompt(
    opts.slashCommand,
    opts.runId,
    effectiveFb,
    providerId,
    opts.root,
  );
  const configured = vscode.workspace.getConfiguration('aidlc').get<string>('displayLanguage', 'auto');
  const language = resolveAidlcLanguage(configured, vscode.env.language);
  // OpenCode receives its native slash command in the TUI. The command file
  // itself is the source of instructions; appending prose would turn it into a
  // malformed command argument.
  const prompt = providerId === 'opencode'
    ? taskPrompt
    : `${taskPrompt}\n\n${markdownOutputLanguageInstruction(language)}`;

  const canonicalModel = canonicalModelForSlash(opts.slashCommand);
  const mappedModel = mappedOrFallbackModel({
    providerId,
    cli,
    root: opts.root,
    mappedModel: store.modelFor(providerId, canonicalModel, config),
    defaultModel: store.modelFor(providerId, undefined, config),
  });

  const invocation = adapter.buildOneShotInvocation({
    slashOrPrompt: prompt,
    mappedModel,
    cwd: opts.root,
    cliBinary: cli,
  });
  const oneShot = invocation.shellOneLiner
    ?? [cli, ...invocation.argv.slice(1)].join(' ');

  spawnTerminalOneShot({
    oneShot,
    terminalName: opts.terminalName ?? terminalNameForProvider(adapter.displayName),
    cwd: opts.root,
    fresh: true,
  });
}

/**
 * Start a visible native provider conversation that owns its own persisted
 * state. Unlike `runStepWithProvider`, this deliberately never uses Codex's
 * non-interactive `exec` mode: the provider must be able to ask, receive an
 * answer, and continue in the same foreground session.
 */
export function runProviderManagedInteractiveSession(opts: {
  slashCommand: string;
  runId: string;
  providerId?: string;
  root: string;
  extensionPath: string;
  terminalName: string;
}): void {
  const store = getProviderConfigStore(opts.root);
  const config = store.loadOrDefault();
  const providerId = opts.providerId ?? config.defaultProvider;
  const adapter = getCommandProviderAdapter(providerId);
  const cli = store.cliFor(providerId, config);

  ensureCommandFilesForProvider(opts.root, opts.extensionPath, providerId);

  const prep = prepareDeliveryRun(opts.root, opts.runId);
  if (prep.rebased) {
    void vscode.window.showInformationMessage(
      'AIDLC: pipeline contract updated for this step. Re-running with the current gates.',
    );
  }
  const managedFeedback = prep.extraFeedback;
  const taskPrompt = buildTaskPrompt(
    opts.slashCommand,
    opts.runId,
    managedFeedback,
    providerId,
    opts.root,
  );
  const configured = vscode.workspace.getConfiguration('aidlc').get<string>('displayLanguage', 'auto');
  const language = resolveAidlcLanguage(configured, vscode.env.language);
  const prompt = providerId === 'opencode'
    ? taskPrompt
    : `${taskPrompt}\n\n${markdownOutputLanguageInstruction(language)}`;
  const mappedModel = mappedOrFallbackModel({
    providerId,
    cli,
    root: opts.root,
    mappedModel: store.modelFor(providerId, undefined, config),
    defaultModel: store.modelFor(providerId, undefined, config),
  });
  const invocation = adapter.buildInteractiveInvocation({
    prompt,
    mappedModel,
    cwd: opts.root,
    cliBinary: cli,
    allowWorkspaceWrite: true,
  });
  const oneShot = invocation.shellOneLiner ?? [cli, ...invocation.argv.slice(1)].join(' ');
  spawnTerminalOneShot({
    oneShot,
    terminalName: opts.terminalName,
    cwd: opts.root,
    fresh: true,
  });
}

export function runSlashCommandWithProvider(
  slash: string,
  root: string,
  extensionPath: string,
  providerId?: string,
): void {
  const store = getProviderConfigStore(root);
  const config = store.loadOrDefault();
  const id = providerId ?? config.defaultProvider;
  const adapter = getCommandProviderAdapter(id);

  ensureCommandFilesForProvider(root, extensionPath, id);

  const configured = vscode.workspace.getConfiguration('aidlc').get<string>('displayLanguage', 'auto');
  const language = resolveAidlcLanguage(configured, vscode.env.language);
  try { ensureMarkdownOutputLanguagePolicy(root, language); } catch { /* prompt still enforces */ }

  let prompt = slash;
  if (id !== 'claude' && id !== 'opencode') {
    const runId = slash.trim().split(/\s+/).slice(1).join(' ') || 'EPIC';
    prompt = buildProviderCommandPrompt(root, slash, runId, '', id);
  }
  if (id !== 'opencode') {
    prompt = `${prompt}\n\n${markdownOutputLanguageInstruction(language)}`;
  }

  const canonicalModel = canonicalModelForSlash(slash);
  const cli = store.cliFor(id, config);
  const mappedModel = mappedOrFallbackModel({
    providerId: id,
    cli,
    root,
    mappedModel: store.modelFor(id, canonicalModel, config),
    defaultModel: store.modelFor(id, undefined, config),
  });
  const invocation = adapter.buildOneShotInvocation({
    slashOrPrompt: prompt,
    mappedModel,
    cwd: root,
    cliBinary: cli,
  });
  const oneShot = invocation.shellOneLiner ?? invocation.argv.join(' ');

  spawnTerminalOneShot({
    oneShot,
    terminalName: terminalNameForProvider(adapter.displayName),
    cwd: root,
    fresh: false,
  });
}
