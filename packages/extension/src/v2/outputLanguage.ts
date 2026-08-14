/**
 * Output-language policy for AI-authored Markdown.
 *
 * The display-language setting is owned by the extension, while Claude reads
 * project instructions from `.claude/CLAUDE.md`. This module bridges the two
 * without changing user-owned instructions in that file.
 */

import * as fs from 'fs';
import * as path from 'path';

export type AidlcLanguage = 'en' | 'vi';

const MARKER_START = '<!-- aidlc:output-language:start -->';
const MARKER_END = '<!-- aidlc:output-language:end -->';

/** Resolve the VS Code setting, with `auto` following VS Code's UI language. */
export function resolveAidlcLanguage(configured: unknown, vscodeLanguage: string): AidlcLanguage {
  if (configured === 'vi' || configured === 'en') { return configured; }
  return vscodeLanguage.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

/** A direct instruction for a one-shot Claude prompt. */
export function markdownOutputLanguageInstruction(language: AidlcLanguage): string {
  const target = language === 'vi' ? 'Vietnamese' : 'English';
  return [
    'AIDLC output-language requirement:',
    `Write all human-readable prose that you create or revise in Markdown artifacts, reports, summaries, and documentation in ${target}.`,
    'Keep source code, identifiers, commands, paths, API names, JSON/YAML keys, and validator-required literal headings or markers unchanged.',
    'Only use another language for a specific artifact when the user explicitly requests it.',
  ].join(' ');
}

/**
 * Persist the policy where Claude Code loads project instructions. The managed
 * block is replaced in place, so user content and other AIDLC blocks survive.
 */
export function ensureMarkdownOutputLanguagePolicy(workspaceRoot: string, language: AidlcLanguage): string {
  const dir = path.join(workspaceRoot, '.claude');
  const file = path.join(dir, 'CLAUDE.md');
  fs.mkdirSync(dir, { recursive: true });

  let body = '';
  try { body = fs.readFileSync(file, 'utf8'); } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') { throw err; }
  }

  const block = `${MARKER_START}
## Output language (managed by AIDLC extension — do not edit by hand)

${markdownOutputLanguageInstruction(language)}
${MARKER_END}`;
  const next = upsertManagedBlock(body, block);
  if (next !== body) { fs.writeFileSync(file, next, 'utf8'); }
  return file;
}

function upsertManagedBlock(body: string, block: string): string {
  const start = body.indexOf(MARKER_START);
  const end = body.indexOf(MARKER_END);
  if (start !== -1 && end !== -1 && end > start) {
    const before = body.slice(0, start);
    const after = body.slice(end + MARKER_END.length).replace(/^\r?\n/, '');
    return `${before}${block}\n${after}`;
  }
  const prefix = body.length === 0 ? '' : (body.endsWith('\n') ? body : `${body}\n`);
  const separator = body.length === 0 ? '' : '\n';
  return `${prefix}${separator}${block}\n`;
}
