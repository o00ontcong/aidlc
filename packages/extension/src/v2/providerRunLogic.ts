import * as fs from 'fs';
import * as path from 'path';

import {
  BUILTIN_WORKFLOWS,
  getCommandProviderAdapter,
  pipelineCommandId,
  workflowCommandPhases,
} from '@aidlc/core';

export function terminalNameForProvider(displayName: string): string {
  return `AIDLC · ${displayName}`;
}

export function buildShapeDiscussionPrompt(opts: {
  shapeId: string;
  title: string;
  language: 'en' | 'vi';
  proposal?: string;
}): string {
  const conversationLanguage = opts.language === 'vi' ? 'Vietnamese' : 'English';
  const prompt = [
    `You are discussing AIDLC Shape ${opts.shapeId}: ${opts.title}.`,
    'This is discovery only. Do not edit source files, run write commands, create an Epic, or start a delivery workflow.',
    `Read AGENTS.md, PROJECT.md, STATUS.md, DECISIONS.md, .aidlc/shapes/${opts.shapeId}/state.json, and relevant source code when useful.`,
    `Speak with the human in ${conversationLanguage}. Use plain, non-technical language unless the human asks for technical detail.`,
    'Guide the discussion one question at a time. Offer two or three concrete choices with simple tradeoffs, include a recommended choice, and let the human say they are unsure.',
    'Challenge assumptions while keeping the human in control of scope and the final decision.',
    'When the human is satisfied, return a short plain-language summary.',
    'Never ask the human to copy or paste JSON. The extension handles structured plan updates itself.',
    'Do not claim the plan is approved. Only the human can approve it in AIDLC.',
  ];
  if (opts.proposal) {
    prompt.push(
      'The extension has prepared the proposed plan below. Treat it as a draft: explain it, question weak assumptions, and help the human compare alternatives. Start with a short plain-language summary, then ask what part they want to discuss first.',
      `Current proposed plan:\n${opts.proposal}`,
      'Do not ask the human to restate this proposal. If the human wants changes, summarize the agreed changes in plain language so the extension can prepare a revised proposal later.',
    );
  }
  return prompt.join('\n\n');
}

export function buildShapeProposalPrompt(opts: {
  shapeId: string;
  title: string;
  language: 'en' | 'vi';
  currentShape: string;
}): string {
  const outputLanguage = opts.language === 'vi' ? 'Vietnamese' : 'English';
  return [
    `Complete the decision plan for AIDLC idea ${opts.shapeId}: ${opts.title}.`,
    'This is analysis only. Do not edit files, run write commands, create tasks, or start delivery.',
    'Use the project context and read relevant source files only when they materially improve the recommendation.',
    'Recommend a practical approach for the stated problem and outcome. Keep the scope proportional to the chosen effort.',
    'Populate options, selectedApproach, rationale, risks, noGos, acceptanceCriteria, architectureImpact, and openQuestions.',
    'Preserve the human-authored problem, desiredOutcome, appetite, and constraints. Do not invent business facts.',
    'If an important choice cannot be inferred safely, put a concise question in openQuestions instead of guessing.',
    `Write every human-readable string value in ${outputLanguage}, using plain language for a non-technical reader.`,
    'Return ONLY one JSON object. Do not use Markdown fences, commentary, or a shape-update wrapper.',
    'Allowed keys: title, problem, desiredOutcome, appetite, constraints, options, selectedApproach, rationale, risks, noGos, acceptanceCriteria, architectureImpact, openQuestions.',
    'Each option must contain id, title, summary, and tradeoffs.',
    '',
    'Current idea:',
    opts.currentShape,
  ].join('\n');
}

export function buildHeadlessShapeProposalInvocation(opts: {
  providerId: string;
  cli: string;
  model?: string;
  prompt: string;
}): { command: string; args: string[] } {
  const modelArgs = opts.model ? ['--model', opts.model] : [];
  switch (opts.providerId) {
    case 'claude':
      return {
        command: opts.cli,
        args: ['--print', '--permission-mode', 'plan', ...modelArgs, opts.prompt],
      };
    case 'cursor':
      return {
        command: opts.cli,
        args: ['--print', '--output-format', 'text', '--mode', 'ask', ...modelArgs, opts.prompt],
      };
    case 'codex':
      return {
        command: opts.cli,
        // `codex exec` is non-interactive and read-only here. Recent Codex CLIs
        // do not accept the old `--ask-for-approval` flag on this subcommand.
        args: ['exec', ...modelArgs, '--sandbox', 'read-only', opts.prompt],
      };
    default:
      throw new Error(`Provider ${opts.providerId} does not have a verified read-only headless Discovery mode.`);
  }
}

export function slashCommandName(slash: string): string {
  return slash.trim().split(/\s+/)[0]?.replace(/^\//, '') ?? '';
}

export function canonicalModelForSlash(slash: string): string | undefined {
  const commandName = slashCommandName(slash);
  if (!commandName) { return undefined; }
  for (const workflow of BUILTIN_WORKFLOWS) {
    for (const { pipelineId, phase } of workflowCommandPhases(workflow)) {
      if (pipelineCommandId(pipelineId, phase.id) === commandName) {
        return phase.model;
      }
    }
  }
  return undefined;
}

/**
 * Prefer a phase's mapped model while it is available. If the provider can
 * prove that model is absent, use its persisted default instead. An undefined
 * availability list means the CLI has no supported local model discovery, so
 * keep the explicit phase mapping.
 */
export function resolveRunnableModel(
  mappedModel: string | undefined,
  defaultModel: string | undefined,
  availableModels?: ReadonlySet<string>,
): { model: string | undefined; fellBack: boolean } {
  if (!mappedModel) { return { model: defaultModel, fellBack: false }; }
  if (!availableModels || availableModels.has(mappedModel)) {
    return { model: mappedModel, fellBack: false };
  }
  return { model: defaultModel ?? mappedModel, fellBack: Boolean(defaultModel) };
}

function stripMarkdownFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\n?/, '');
}

export const BUG_SCREENSHOT_DIR = 'bug-screenshots';
export const BUG_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'] as const;
export const MAX_BUG_IMAGES = 10;
export const MAX_BUG_IMAGE_BYTES = 8 * 1024 * 1024;

function assertSafeEpicArtifact(root: string, runId: string, ...parts: string[]): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) {
    throw new Error(`Unsafe bug-report path for run id: ${runId}`);
  }
  const resolvedRoot = path.resolve(root);
  const file = path.resolve(root, 'docs', 'epics', runId, 'artifacts', ...parts);
  const relative = path.relative(resolvedRoot, file);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe bug-report path for run id: ${runId}`);
  }
  return file;
}

export function sanitizeBugScreenshotName(originalName: string): string {
  const base = path.basename(originalName).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^\.+/, '');
  const fallback = base || 'screenshot';
  const ext = path.extname(fallback).toLowerCase().replace('.', '');
  if ((BUG_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) { return fallback; }
  const stem = fallback.replace(/\.[^.]*$/, '') || 'screenshot';
  return `${stem}.png`;
}

export function uniqueBugScreenshotName(existingNames: string[], originalName: string): string {
  const sanitized = sanitizeBugScreenshotName(originalName);
  const ext = path.extname(sanitized);
  const stem = sanitized.slice(0, Math.max(0, sanitized.length - ext.length)) || 'screenshot';
  const used = new Set(existingNames.map((name) => name.toLowerCase()));
  if (!used.has(sanitized.toLowerCase())) { return sanitized; }
  let n = 2;
  while (used.has(`${stem}-${n}${ext}`.toLowerCase())) { n += 1; }
  return `${stem}-${n}${ext}`;
}

export function bugScreenshotRelPath(runId: string, fileName: string): string {
  return ['docs', 'epics', runId, 'artifacts', BUG_SCREENSHOT_DIR, fileName].join('/');
}

export function formatBugReportScreenshotSection(relativePaths: string[]): string {
  if (relativePaths.length === 0) { return ''; }
  return [
    '## Screenshots',
    '',
    'Read each image file below — they show the reported problem:',
    '',
    ...relativePaths.map((rel, i) => `${i + 1}. \`${rel}\``),
  ].join('\n');
}

export function writeBugScreenshot(
  root: string,
  runId: string,
  originalName: string,
  bytes: Uint8Array,
): { fileName: string; relativePath: string; absPath: string } {
  if (bytes.byteLength > MAX_BUG_IMAGE_BYTES) {
    throw new Error(`Image is larger than ${MAX_BUG_IMAGE_BYTES} bytes`);
  }
  const dir = assertSafeEpicArtifact(root, runId, BUG_SCREENSHOT_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const existing = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const fileName = uniqueBugScreenshotName(existing, originalName);
  const absPath = assertSafeEpicArtifact(root, runId, BUG_SCREENSHOT_DIR, fileName);
  fs.writeFileSync(absPath, bytes);
  return { fileName, relativePath: bugScreenshotRelPath(runId, fileName), absPath };
}

export function buildCodexRunPrompt(root: string, slash: string, runId: string, feedback: string): string {
  return buildCommandFileRunPrompt(root, slash, runId, feedback, 'codex');
}

/**
 * Kept for callers that need to inspect an OpenCode command body. Runtime
 * invocation uses the native OpenCode slash command instead (see buildTaskPrompt).
 */
export function buildOpenCodeRunPrompt(root: string, slash: string, runId: string, feedback: string): string {
  return buildCommandFileRunPrompt(root, slash, runId, feedback, 'opencode');
}

/** Codex and Cursor receive the expanded command body rather than Claude slash syntax. */
export function buildProviderCommandPrompt(
  root: string,
  slash: string,
  runId: string,
  feedback: string,
  providerId: string,
): string {
  return buildCommandFileRunPrompt(root, slash, runId, feedback, providerId);
}

function buildCommandFileRunPrompt(
  root: string,
  slash: string,
  runId: string,
  feedback: string,
  providerId: string,
): string {
  const commandName = slashCommandName(slash);
  const adapter = getCommandProviderAdapter(providerId);
  const file = adapter.commandFilePath(root, commandName);
  let body = '';
  try {
    body = stripMarkdownFrontmatter(fs.readFileSync(file, 'utf8'));
  } catch {
    const slashOnly = slash.trim().split(/\s+/)[0];
    body = `Run AIDLC command ${slashOnly} for epic ${runId}.`;
  }
  body = body.replaceAll('$ARGUMENTS', runId);
  if (feedback) {
    body += `\n\n## Feedback\n\nUpdate artifact per feedback: ${feedback}`;
  }
  return body;
}

export function buildTaskPrompt(
  slash: string,
  runId: string,
  feedback: string,
  providerId: string,
  root: string,
): string {
  if (providerId !== 'claude' && providerId !== 'opencode') {
    return buildProviderCommandPrompt(root, slash, runId, feedback, providerId);
  }
  const slashOnly = slash.trim().split(/\s+/)[0];
  // OpenCode resolves `/command` from `.opencode/commands` in its interactive
  // TUI. Do not expand the markdown body into a giant shell argument.
  if (providerId === 'opencode') {
    return `${slashOnly} ${runId}`;
  }
  return feedback
    ? `${slashOnly} ${runId} — Update artifact per feedback: "${feedback.replace(/"/g, '\\"')}"`
    : `${slashOnly} ${runId}`;
}
