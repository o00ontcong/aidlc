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

/**
 * The Idea prep agent's prompt: read first, ask only what changes the
 * outcome. Encodes the eight cost-cutting mechanisms from
 * docs/design/ideas-tab/ideas-tab-flow-graph.canvas.tsx in prompt form,
 * since the gate/filter/batch logic cannot be verified mechanically the way
 * `discovery-gate.md`'s ≥3-or-high-impact threshold is re-checked in
 * `IdeaService.completePrep` — this prompt is what gets the agent to that
 * threshold honestly instead of padding or truncating its own question list.
 */
export function buildIdeaPrepPrompt(opts: {
  ideaId: string;
  seedSentence: string;
  language: 'en' | 'vi';
  /** Questions previously flagged wrong (F02) — do not repeat this mistake. */
  excludeAnswers?: string[];
}): string {
  const outputLanguage = opts.language === 'vi' ? 'Vietnamese' : 'English';
  const lines = [
    `A person filed one sentence describing something they want changed: "${opts.seedSentence}"`,
    'This is intake, not implementation. Do not edit files, run write commands, create tasks, or start delivery.',
    '',
    'Step 1 — read before asking. Read AGENTS.md, docs/project/foundation/PROJECT-RULES.json, '
      + 'docs/project/foundation/ARCHITECTURE-MAP.md, docs/project/foundation/CONTEXT-MANIFEST.json, and DECISIONS.md '
      + 'if they exist, plus whatever source files are relevant to the sentence above. '
      + 'Draft the raw list of questions a careful engineer would ask, then answer as many as you honestly can '
      + 'from what you just read — cite the exact file (or file:line) each answer came from. '
      + 'A question you could have answered from a file you did not read is a mistake, not a safe default.',
    '',
    'Step 2 — filter by impact. Drop any remaining question where a different answer would NOT change scope, '
      + 'the implementation approach, or an acceptance criterion. Use a sensible default for those instead of asking.',
    '',
    'Step 3 — apply the gate. Only keep asking if at least 3 questions survive step 2, or one of them is genuinely '
      + 'high-impact (changes scope, architecture, or acceptance criteria on its own). Otherwise return zero questions — '
      + 'the sentence is clear enough already.',
    '',
    'Step 4 — batch, do not chain. Every surviving question goes in one batch of at most 5, ordered so independent '
      + 'questions come first. If a question only makes sense after another is answered, set its `dependsOn` to that '
      + "question's id instead of implying an order in the text.",
    '',
    'Step 5 — give every question a pre-selected default. Each question needs 2-4 concrete options; mark exactly one '
      + '`recommended: true` and give a one-line `reason` grounded in the sentence above, so a person who accepts every '
      + 'default still gets a coherent, defensible result.',
    opts.excludeAnswers?.length
      ? `\nThese self-answers were already flagged wrong by a human — do not repeat them, and ask about them instead:\n${opts.excludeAnswers.map((q) => `- ${q}`).join('\n')}`
      : '',
    '',
    `Write every human-readable string in ${outputLanguage}, in plain language for a non-technical reader.`,
    'Return ONLY one JSON object, no Markdown fences, no commentary, matching exactly this shape:',
    '{',
    '  "selfAnswered": [{ "question": string, "answer": string, "source": string }],',
    '  "questions": [{ "id": string, "text": string, "reason": string, "highImpact": boolean, "dependsOn": string[],',
    '    "options": [{ "id": string, "label": string, "recommended": boolean }] }]',
    '}',
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * A read-only, non-interactive invocation for a supported provider CLI.
 * Provider-agnostic — used for any prompt that only needs to read and
 * reason, never to write (Idea prep, Idea routing; formerly Shape's
 * proposal generation).
 */
export function buildHeadlessAnalysisInvocation(opts: {
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
      throw new Error(`Provider ${opts.providerId} does not have a verified read-only headless analysis mode.`);
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
