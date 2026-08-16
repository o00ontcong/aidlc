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

export function isBugResolutionCommand(slash: string): boolean {
  const name = slashCommandName(slash);
  return name === 'feature-implement-resolve-bugs'
    || name === 'cohesive-feature-resolve-bugs';
}

export function isImplementStartCommand(slash: string): boolean {
  const name = slashCommandName(slash);
  return name === 'feature-implement-implement'
    || name === 'cohesive-feature-implement';
}

export const BUG_SCREENSHOT_DIR = 'bug-screenshots';
export const BUG_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'] as const;
export const MAX_BUG_IMAGES = 10;
export const MAX_BUG_IMAGE_BYTES = 8 * 1024 * 1024;

const BUG_REPORT_HEADER = `# Bug Report

This file is an append-only log of user-reported bugs for \`resolve-bugs\`. Every round stays in scope until the step is approved.

`;

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

function nextBugReportRound(existing: string): number {
  const rounds = [...existing.matchAll(/^## Round (\d+)/gm)].map((m) => Number(m[1]));
  if (rounds.length > 0) { return Math.max(...rounds) + 1; }
  const body = existing.replace(/^# Bug Report\s*/i, '').trim();
  return body ? 2 : 1;
}

/** Persist bug input because native slash-command providers cannot carry prose arguments. */
export function persistBugReportInput(root: string, runId: string, feedback: string): string | undefined {
  const body = feedback.trim();
  if (!body) { return undefined; }
  const file = assertSafeEpicArtifact(root, runId, 'BUG-REPORT.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const at = new Date().toISOString();
  let existing = '';
  try { existing = fs.readFileSync(file, 'utf8'); } catch { /* first round */ }
  const round = nextBugReportRound(existing);
  const section = `## Round ${round} — ${at}\n\n${body}\n`;
  const next = existing.trim().length > 0
    ? `${existing.replace(/\s*$/, '')}\n\n${section}`
    : `${BUG_REPORT_HEADER}${section}`;
  fs.writeFileSync(file, next, 'utf8');
  return file;
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
    body += isBugResolutionCommand(slash)
      ? `\n\n## Bug Report\n\n${feedback}`
      : `\n\n## Feedback\n\nUpdate artifact per feedback: ${feedback}`;
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
    ? `${slashOnly} ${runId} — ${isBugResolutionCommand(slash) ? 'Bug report' : 'Update artifact per feedback'}: "${feedback.replace(/"/g, '\\"')}"`
    : `${slashOnly} ${runId}`;
}

export function loadContextReviewFixFeedback(root: string): string | undefined {
  const reviewPath = path.join(root, 'docs', 'project', 'context', 'CONTEXT-REVIEW.md');
  if (!fs.existsSync(reviewPath)) { return undefined; }
  let text = '';
  try { text = fs.readFileSync(reviewPath, 'utf8'); } catch { return undefined; }
  if (!/\*\*Verdict:\*\*\s*NO-GO/i.test(text)) { return undefined; }
  const correctionsMatch = text.match(
    /##\s*Required Corrections[\s\S]*?(?=\n##\s+|\n\*\*Verdict:\*\*|\s*$)/i,
  );
  const corrections = correctionsMatch?.[0]?.trim()
    ?? 'Apply every Required Correction listed in docs/project/context/CONTEXT-REVIEW.md.';
  return (
    'CONTEXT-REVIEW has **Verdict:** NO-GO. Apply ALL Required Corrections yourself to the ' +
    'owning files under docs/project/context/ (do not ask the user to edit Markdown by hand). ' +
    'Then rewrite CONTEXT-REVIEW.md ending with exactly `**Verdict:** GO`.\n\n' +
    corrections
  );
}
