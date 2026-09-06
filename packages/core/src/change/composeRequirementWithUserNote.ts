/**
 * Fold a user-typed note into the captured requirement so agents see both
 * the source ticket (Jira / GitHub / …) and the human's correction.
 *
 * Invariant for the whole AIDLC extension: the user note outranks description.
 * Description is the source ticket / Change requirement / state.json body.
 * When they conflict, follow the user note; still fold both into the requirement.
 */

export const USER_NOTE_HEADING = '## User note (authoritative)';
export const SOURCE_REQUIREMENT_HEADING = '## Source requirement';
export const USER_NOTE_FILENAME = 'USER-NOTE.md';

/** Canonical priority rule — copy into skills, slash commands, and run feedback. */
export const USER_NOTE_PRIORITY_RULE =
  'Priority: USER-NOTE.md / inputs.user_note outranks state.json description (and the Change requirement / Jira / GitHub / Drive / URL ticket). When they conflict, follow the user note. Fold both into the requirement; do not skip the note, and do not discard the source.';

export const USER_NOTE_PREAMBLE =
  'This note is from the person who started the work. It outranks the description (ticket body / Change requirement / state.json). Treat it as a correction and a supplement to the source. When they conflict, follow the user note — the description may be outdated or wrong. Fold the note into the requirement; do not ignore the source, and do not ignore this note.';

export function formatUserNoteBlock(userNote: string): string {
  return `${USER_NOTE_HEADING}\n\n${USER_NOTE_PREAMBLE}\n\n${userNote.trim()}`;
}

/**
 * Compose the canonical requirement text stored on the Change and epic.
 * Empty note → description unchanged. Empty description → note block only.
 * The note always sits above the description so agents read it first.
 */
export function composeRequirementWithUserNote(description: string, userNote: string): string {
  const raw = description.trim();
  const note = userNote.trim();
  if (!note) { return raw; }
  const existing = splitComposedRequirement(raw);
  const source = existing.sourceDescription || (!existing.userNote ? raw : '');
  const block = formatUserNoteBlock(note);
  if (!source) { return block; }
  return `${block}\n\n${SOURCE_REQUIREMENT_HEADING}\n\n${source}`;
}

/** Pull the human's note out of a composed Change/epic description or USER-NOTE.md. */
export function extractUserNoteFromComposedRequirement(text: string): string {
  const start = text.indexOf(USER_NOTE_HEADING);
  if (start < 0) { return ''; }
  let body = text.slice(start + USER_NOTE_HEADING.length);
  const sourceAt = body.indexOf(`\n${SOURCE_REQUIREMENT_HEADING}`);
  if (sourceAt >= 0) { body = body.slice(0, sourceAt); }
  return body.replace(USER_NOTE_PREAMBLE, '').trim();
}

/** Source ticket / description under the composed heading; otherwise the whole text if there is no user-note heading. */
export function extractSourceRequirementFromComposed(text: string): string {
  const sourceAt = text.indexOf(SOURCE_REQUIREMENT_HEADING);
  if (sourceAt >= 0) {
    return text.slice(sourceAt + SOURCE_REQUIREMENT_HEADING.length).trim();
  }
  if (text.includes(USER_NOTE_HEADING)) { return ''; }
  return text.trim();
}

export function splitComposedRequirement(text: string): {
  userNote: string;
  sourceDescription: string;
} {
  return {
    userNote: extractUserNoteFromComposedRequirement(text),
    sourceDescription: extractSourceRequirementFromComposed(text),
  };
}

const URL_RE = /https?:\/\/[^\s)\]>'"]+/gi;

/**
 * Words that describe Markdown/list structure rather than a product decision.
 * The coverage gate deliberately accepts a faithful paraphrase: its job is to
 * catch an omitted screen/API instruction, not require an agent to copy a
 * Vietnamese (or English) sentence character-for-character.
 */
const COVERAGE_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'for', 'from',
  'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'use',
  'using', 'when', 'with', 'lay', 'mau', 'man', 'hinh', 'gom', 'khi', 'chua',
  'entry', 'point', 'note', 'figma', 'dung', 'cai', 'tai', 'phan', 'thi',
  'sau', 'thanh', 'cong', 'se', 'la', 'co', 'va', 'trong', 'cho', 'khac',
  'nhu', 'nen', 'tu', 'nhung', 'nay', 'do', 'cua', 'cac', 'mot', 'app',
]);

function normalizedCoverageTerms(text: string): string[] {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(URL_RE, ' ');
  return [...new Set((normalized.match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((term) => term.length >= 3 && !COVERAGE_STOP_WORDS.has(term)))];
}

function isSemanticallyCovered(requirementTerms: Set<string>, line: string): boolean {
  const terms = normalizedCoverageTerms(line);
  if (terms.length === 0) { return true; }
  const matched = terms.filter((term) => requirementTerms.has(term)).length;
  // Short instructions need at least two anchors; longer ones may be
  // faithfully summarized with their significant nouns/actions preserved.
  const required = Math.min(terms.length, Math.max(2, Math.ceil(terms.length * 0.6)));
  return matched >= required;
}

function distinctiveUserNoteLines(userNote: string): string[] {
  return userNote.split(/\n/).map((line) => line.trim()).filter((line) => {
    if (line.length < 12) { return false; }
    if (line.startsWith('#')) { return false; }
    if (line.startsWith('This note is from')) { return false; }
    if (line.startsWith('Treat it as')) { return false; }
    if (line.startsWith('It outranks')) { return false; }
    if (line.startsWith('Fold the note')) { return false; }
    const withoutUrls = line.replace(/https?:\/\/[^\s)\]>'"]+/gi, '').trim();
    if (withoutUrls.length < 12) { return false; }
    return true;
  });
}

/**
 * Machine-check that REQUIREMENT.md actually used the human's note.
 * URLs must appear verbatim. For prose, test coverage using meaningful terms
 * rather than an exact sentence: a requirement can faithfully turn a note
 * into a screen/API table or flow diagram without duplicating its grammar.
 */
export function userNoteCoverageIssues(requirement: string, userNote: string): string[] {
  const note = extractUserNoteFromComposedRequirement(userNote) || userNote.trim();
  if (!note) { return []; }
  const req = requirement.toLowerCase();
  const requirementTerms = new Set(normalizedCoverageTerms(requirement));
  const issues: string[] = [];
  const urls = note.match(URL_RE) ?? [];
  for (const url of urls) {
    if (!requirement.includes(url) && !req.includes(url.toLowerCase())) {
      issues.push(`missing user-note URL: ${url}`);
    }
  }
  const lines = distinctiveUserNoteLines(note);
  if (lines.length === 0) { return issues; }
  const missing = lines.filter((line) => {
    const needle = (line.length > 80 ? line.slice(0, 48) : line).toLowerCase();
    return !req.includes(needle) && !isSemanticallyCovered(requirementTerms, line);
  });
  if (missing.length / lines.length > 0.3) {
    issues.push(
      `user note not folded into REQUIREMENT.md (${missing.length}/${lines.length} distinctive lines missing)`,
    );
  }
  return issues;
}
