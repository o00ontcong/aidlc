import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { getCommandProviderAdapter } from '@aidlc/core';

import { syncBuiltinPipelineCommands } from './presetWizards';
import { getProviderConfigStore } from './providerConfig';
import {
  buildCodexRunPrompt,
  buildOpenCodeRunPrompt,
  buildProviderCommandPrompt,
  buildTaskPrompt,
  canonicalModelForSlash,
  loadContextReviewFixFeedback,
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
  slashCommandName,
  terminalNameForProvider,
} from './providerRunLogic';

const TERMINAL_ENV: Record<string, string> = {
  DISABLE_AUTO_UPDATE: 'true',
  DISABLE_UPDATE_PROMPT: 'true',
};

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
  const source = path.join(extensionPath, 'assets', 'annotate-artifact.skill.md');
  if (!fs.existsSync(source)) { return; }
  const adapter = getCommandProviderAdapter(providerId);
  const commandName = 'annotate-artifact';
  const destination = adapter.commandFilePath(root, commandName);
  if (fs.existsSync(destination)) { return; }

  const body = fs.readFileSync(source, 'utf8').replace(/^---[\s\S]*?---\n?/, '');
  const store = getProviderConfigStore(root);
  const config = store.loadOrDefault();
  const model = store.modelFor(providerId, undefined, config);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, adapter.renderCommandFile({
    commandName,
    description: 'Review an epic Markdown artifact interactively in annotron.',
    body,
    epicRoot: 'docs/epics',
  }, model), 'utf8');
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

  let effectiveFb = (opts.feedback ?? '').trim();
  if (!effectiveFb) {
    effectiveFb = loadContextReviewFixFeedback(opts.root) ?? '';
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
  const mappedModel = store.modelFor(providerId, canonicalModel, config);

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
  const mappedModel = store.modelFor(id, canonicalModel, config);
  const cli = store.cliFor(id, config);
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
