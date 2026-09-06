/**
 * UI-side split of a composed epic/Change requirement.
 * Headings must stay in sync with `@aidlc/core` composeRequirementWithUserNote.
 */

export const USER_NOTE_HEADING = '## User note (authoritative)';
export const SOURCE_REQUIREMENT_HEADING = '## Source requirement';

export function splitComposedRequirement(text: string): {
  userNote: string;
  sourceDescription: string;
} {
  const raw = text.trim();
  if (!raw) { return { userNote: '', sourceDescription: '' }; }
  const start = raw.indexOf(USER_NOTE_HEADING);
  if (start < 0) {
    return { userNote: '', sourceDescription: raw };
  }
  let body = raw.slice(start + USER_NOTE_HEADING.length);
  const sourceAt = body.indexOf(`\n${SOURCE_REQUIREMENT_HEADING}`);
  let sourceDescription = '';
  if (sourceAt >= 0) {
    sourceDescription = body.slice(sourceAt + 1 + SOURCE_REQUIREMENT_HEADING.length).trim();
    body = body.slice(0, sourceAt);
  }
  const preambleAt = body.indexOf('This note is from the person who started the work.');
  if (preambleAt >= 0) {
    const afterPreamble = body.slice(preambleAt).replace(/^[^\n]*\n?/, '');
    body = afterPreamble;
  }
  return { userNote: body.trim(), sourceDescription };
}
