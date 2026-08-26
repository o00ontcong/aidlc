import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import {
  getCommandProviderAdapter,
  normalizeStep,
  resolveArtifactPath,
  RunStateStore,
  stepDagId,
} from '@aidlc/core';
import type { PipelineConfig, RunState } from '@aidlc/core';

import { syncBuiltinPipelineCommands } from './presetWizards';
import { readEpicsDirFromYaml, DEFAULT_EPICS_DIR } from './epicsDirSync';
import { availableModelsForProvider, getProviderConfigStore } from './providerConfig';
import {
  buildCodexRunPrompt,
  buildOpenCodeRunPrompt,
  buildProviderCommandPrompt,
  buildStepChatPrompt,
  buildHeadlessShapeProposalInvocation,
  buildShapeProposalPrompt,
  buildShapeDiscussionPrompt,
  buildTaskPrompt,
  canonicalModelForSlash,
  resolveRunnableModel,
  terminalNameForProvider,
} from './providerRunLogic';
import { listEpics, epicsRoot } from './epicsList';
import { readYaml, type YamlDocument } from './yamlIO';
import {
  ensureMarkdownOutputLanguagePolicy,
  markdownOutputLanguageInstruction,
  resolveAidlcLanguage,
} from './outputLanguage';

export {
  buildCodexRunPrompt,
  buildOpenCodeRunPrompt,
  buildProviderCommandPrompt,
  buildStepChatPrompt,
  buildHeadlessShapeProposalInvocation,
  buildShapeProposalPrompt,
  buildShapeDiscussionPrompt,
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

/**
 * Open the provider's native chat for a pre-Epic Shape. Unlike a task run,
 * this always requests the adapter's verified read-only discovery profile.
 * Unsupported providers are rejected instead of receiving an unsafe fallback.
 */
export function openShapeDiscussion(opts: {
  root: string;
  shapeId: string;
  title: string;
  providerId?: string;
  proposal?: string;
}): void {
  const terminalName = opts.proposal
    ? `AIDLC · Proposal · ${opts.shapeId}`
    : `AIDLC · Discovery · ${opts.shapeId}`;
  const existing = vscode.window.terminals.find((terminal) => terminal.name === terminalName);
  if (existing) {
    // A live provider terminal is the durable chat surface for this Shape.
    // Focus it rather than injecting another process command into its shell.
    existing.show(false);
    return;
  }
  const store = getProviderConfigStore(opts.root);
  const config = store.loadOrDefault();
  const id = opts.providerId ?? config.defaultProvider;
  const adapter = getCommandProviderAdapter(id);
  const cli = store.cliFor(id, config);
  const model = mappedOrFallbackModel({
    providerId: id,
    cli,
    root: opts.root,
    mappedModel: store.modelFor(id, undefined, config),
    defaultModel: store.modelFor(id, undefined, config),
  });
  const configured = vscode.workspace.getConfiguration('aidlc').get<string>('displayLanguage', 'auto');
  const prompt = buildShapeDiscussionPrompt({
    shapeId: opts.shapeId,
    title: opts.title,
    language: resolveAidlcLanguage(configured, vscode.env.language),
    proposal: opts.proposal,
  });
  const invocation = adapter.buildDiscoveryInvocation({ prompt, mappedModel: model, cwd: opts.root, cliBinary: cli });
  if (!invocation) {
    void vscode.window.showWarningMessage(
      resolveAidlcLanguage(configured, vscode.env.language) === 'vi'
        ? `Không thể thảo luận ý tưởng bằng ${adapter.displayName}: chế độ chỉ đọc của công cụ này chưa được xác thực. Hãy chọn Claude, Cursor hoặc Codex.`
        : `AIDLC Discovery is unavailable for ${adapter.displayName}: its read-only CLI profile has not been validated. Choose Claude, Cursor, or Codex.`,
    );
    return;
  }
  spawnTerminalOneShot({
    oneShot: invocation.shellOneLiner ?? invocation.argv.join(' '),
    terminalName,
    cwd: opts.root,
    fresh: true,
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

  const effectiveFb = (opts.feedback ?? '').trim();

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

/**
 * Copy a self-contained, provider-neutral prompt for one pipeline step. This
 * is intentionally separate from {@link runStepWithProvider}: it does not
 * create a terminal, execute a CLI, install command files, or mutate run
 * state. The user stays in control of where and when the prompt is sent.
 */
export async function copyStepForAgentChat(opts: {
  root: string;
  epicId?: string;
  runId?: string;
  stepIdx?: number;
  format?: 'prompt' | 'command';
}): Promise<void> {
  const doc = readYaml(opts.root);
  const requestedId = (opts.runId ?? opts.epicId ?? '').trim();
  if (!requestedId) {
    void vscode.window.showWarningMessage('AIDLC: không xác định được task để copy prompt.');
    return;
  }

  const epics = listEpics(opts.root, doc);
  const epic = epics.find((item) => item.id === (opts.epicId ?? requestedId))
    ?? epics.find((item) => item.runId === requestedId);
  let state: RunState | null;
  try {
    state = RunStateStore.load(opts.root, requestedId);
  } catch {
    state = null;
  }

  const pipeline = state?.pipelineSnapshot?.pipeline
    ?? (epic?.pipeline
      ? (doc?.pipelines as PipelineConfig[] | undefined)?.find((item) => item.id === epic.pipeline)
      : undefined);
  const stepIdx = opts.stepIdx ?? state?.currentStepIdx ?? epic?.currentStep ?? 0;
  const rawStep = pipeline?.steps[stepIdx];
  if (!pipeline || !rawStep) {
    void vscode.window.showWarningMessage(
      `AIDLC: không tìm được step ${stepIdx + 1} cho task "${requestedId}".`,
    );
    return;
  }

  const step = normalizeStep(rawStep);
  const runId = state?.runId ?? epic?.runId ?? requestedId;
  const context = state?.context ?? { epic: epic?.id ?? runId };
  const epicDir = epic?.epicDir ?? path.join(epicsRoot(opts.root, doc), epic?.id ?? runId);
  const epicsDir = readEpicsDirFromYaml(opts.root);
  const resolveArtifacts = (items: readonly string[]) => items.map((item) =>
    resolveArtifactPath(item, context, epicsDir));
  const slashCommand = epic?.stepDetails[stepIdx]?.slashCommand
    ?? slashForPipelineStep(doc, pipeline, stepIdx);
  const feedback = state?.steps[stepIdx]?.feedback?.trim()
    || state?.steps[stepIdx]?.rejectReason?.trim();
  const store = getProviderConfigStore(opts.root);
  const config = store.loadOrDefault();
  const providerId = config.defaultProvider;
  const configured = vscode.workspace.getConfiguration('aidlc').get<string>('displayLanguage', 'auto');
  const language = resolveAidlcLanguage(configured, vscode.env.language);
  let clipboardText: string;
  if (opts.format === 'command') {
    if (!slashCommand) {
      void vscode.window.showWarningMessage(`AIDLC: step "${stepDagId(rawStep)}" không có slash command để copy.`);
      return;
    }
    const slashOnly = slashCommand.trim().split(/\s+/)[0];
    clipboardText = feedback
      ? `${slashOnly} ${runId} — Update artifact per feedback: "${feedback.replace(/"/g, '\\"')}"`
      : `${slashOnly} ${runId}`;
  } else {
    clipboardText = buildStepChatPrompt({
      root: opts.root,
      runId,
      stepName: stepDagId(rawStep),
      agent: step.agent,
      epicDir,
      requires: resolveArtifacts(step.requires),
      produces: resolveArtifacts(step.produces),
      feedback,
      slashCommand,
      providerId,
      language,
      hasRunState: Boolean(state),
    });
  }

  await vscode.env.clipboard.writeText(clipboardText);
  const label = stepDagId(rawStep);
  const copied = opts.format === 'command' ? 'slash command' : 'prompt cho agent chat';
  void vscode.window.setStatusBarMessage(`Đã copy ${copied} · ${label}`, 3_000);
}

/** Mirror the display resolver without trusting a message from the webview. */
function slashForPipelineStep(
  doc: YamlDocument | null,
  pipeline: PipelineConfig,
  stepIdx: number,
): string | undefined {
  const rawStep = pipeline.steps[stepIdx];
  if (!rawStep) { return undefined; }
  const stepName = stepDagId(rawStep);
  const names = new Set(doc?.slash_commands
    .map((entry) => typeof entry.name === 'string' ? entry.name : '')
    .filter(Boolean) ?? []);
  const namespaced = `/${pipeline.id}-${stepName}`;
  if (names.has(namespaced)) { return namespaced; }
  const bare = `/${stepName}`;
  if (names.has(bare)) { return bare; }
  return undefined;
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
