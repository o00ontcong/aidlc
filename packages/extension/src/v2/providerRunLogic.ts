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

function stripMarkdownFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\n?/, '');
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
