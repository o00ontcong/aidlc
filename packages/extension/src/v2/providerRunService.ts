import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { getCommandProviderAdapter, assertImplementPackReady } from '@aidlc/core';

import { syncBuiltinPipelineCommands } from './presetWizards';
import { readEpicsDirFromYaml, DEFAULT_EPICS_DIR } from './epicsDirSync';
import { availableModelsForProvider, getProviderConfigStore } from './providerConfig';
import {
  buildCodexRunPrompt,
  buildOpenCodeRunPrompt,
  buildProviderCommandPrompt,
  buildTaskPrompt,
  canonicalModelForSlash,
  isBugResolutionCommand,
  isImplementStartCommand,
  loadContextReviewFixFeedback,
  persistBugReportInput,
  resolveRunnableModel,
  terminalNameForProvider,
} from './providerRunLogic';
import {
  ensureMarkdownOutputLanguagePolicy,
  markdownOutputLanguageInstruction,
  resolveAidlcLanguage,
} from './outputLanguage';

export {
  buildCodexRunPrompt,
  buildOpenCodeRunPrompt,
  buildProviderCommandPrompt,
  buildTaskPrompt,
  canonicalModelForSlash,
  loadContextReviewFixFeedback,
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
    },
    {
      commandName: 'start-implement-from-spike',
      sourceName: 'start-implement-from-spike.skill.md',
      description: 'Split a completed feature spike into ready-to-run feature-implement epics.',
    },
  ];
  // These commands' bodies hardcode `docs/epics/<epic>/...` prose (see
  // assets/*.skill.md) rather than a `{epic}`-style template, so — unlike the
  // built-in pipeline phase commands — the substitution has to happen here,
  // against this project's *active* epics directory, before the file is
  // written. Written once per project (destination check above), so a project
  // that switches directories after these already exist needs them removed
  // and regenerated to pick up the new root.
  const epicsDir = readEpicsDirFromYaml(root);
  for (const command of commands) {
    const source = path.join(extensionPath, 'assets', command.sourceName);
    const destination = adapter.commandFilePath(root, command.commandName);
    if (!fs.existsSync(source) || fs.existsSync(destination)) { continue; }
    const rawBody = fs.readFileSync(source, 'utf8').replace(/^---[\s\S]*?---\n?/, '');
    const body = epicsDir === DEFAULT_EPICS_DIR ? rawBody : rawBody.replaceAll(DEFAULT_EPICS_DIR, epicsDir);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, adapter.renderCommandFile({
      commandName: command.commandName,
      description: command.description,
      body,
      epicRoot: epicsDir,
    }, model), 'utf8');
  }
}

export function spawnTerminalOneShot(opts: {
  oneShot: string;
  terminalName: string;
  cwd?: string;
  fresh?: boolean;
}): void {
  const cwd = opts.cwd && fs.existsSync(opts.cwd) ? opts.cwd : undefined;

  if (!opts.fresh) {
    const existing = vscode.window.terminals.find((t) => t.name === opts.terminalName);
    if (existing) {
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
}): void {
  const store = getProviderConfigStore(opts.root);
  const config = store.loadOrDefault();
  const providerId = opts.providerId ?? config.defaultProvider;
  const adapter = getCommandProviderAdapter(providerId);
  const cli = store.cliFor(providerId, config);

  ensureCommandFilesForProvider(opts.root, opts.extensionPath, providerId);

  if (isImplementStartCommand(opts.slashCommand)) {
    try {
      assertImplementPackReady(path.join(opts.root, 'docs', 'epics', opts.runId, 'artifacts'));
    } catch (err) {
      void vscode.window.showWarningMessage(
        `AIDLC: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
  }

  const bugResolution = isBugResolutionCommand(opts.slashCommand);
  let effectiveFb = (opts.feedback ?? '').trim();
  if (!effectiveFb && !bugResolution) {
    effectiveFb = loadContextReviewFixFeedback(opts.root) ?? '';
  }
  if (bugResolution) {
    persistBugReportInput(opts.root, opts.runId, effectiveFb);
  }

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
    terminalName: terminalNameForProvider(adapter.displayName),
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
    const runId = slash.trim().split(/\s+/).slice(1).join(' ') || 'PROJECT-CONTEXT';
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
