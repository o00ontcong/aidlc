import * as fs from 'fs';
import * as path from 'path';

import {
  extractUserNoteFromComposedRequirement,
  formatUserNoteBlock,
  USER_NOTE_FILENAME,
} from './composeRequirementWithUserNote';

export function writeEpicUserNoteFile(epicDir: string, userNote: string): void {
  const trimmed = userNote.trim();
  if (!trimmed) { return; }
  fs.writeFileSync(
    path.join(epicDir, USER_NOTE_FILENAME),
    `${formatUserNoteBlock(trimmed)}\n`,
    'utf8',
  );
}

/** Prefer inputs.json, then USER-NOTE.md, then the composed state.json description. */
export function resolveEpicUserNote(epicDir: string): string {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(epicDir, 'inputs.json'), 'utf8')) as { user_note?: unknown };
    if (typeof raw.user_note === 'string' && raw.user_note.trim()) {
      return raw.user_note.trim();
    }
  } catch { /* optional */ }
  try {
    const file = fs.readFileSync(path.join(epicDir, USER_NOTE_FILENAME), 'utf8');
    const extracted = extractUserNoteFromComposedRequirement(file) || file.trim();
    if (extracted) { return extracted; }
  } catch { /* optional */ }
  try {
    const state = JSON.parse(fs.readFileSync(path.join(epicDir, 'state.json'), 'utf8')) as { description?: unknown };
    if (typeof state.description === 'string') {
      const extracted = extractUserNoteFromComposedRequirement(state.description);
      if (extracted) { return extracted; }
    }
  } catch { /* optional */ }
  return '';
}
