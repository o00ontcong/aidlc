import * as fs from 'node:fs';
import * as path from 'node:path';

import { checkMissionCompleteness } from './checkMissionCompleteness';

export function readMissionMarkdown(artifactsDir: string): string {
  const file = path.join(artifactsDir, 'MISSION.md');
  try {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  } catch {
    return '';
  }
}

/**
 * Start implement / Run implement may not launch until the portable pack is complete.
 */
export function assertImplementPackReady(artifactsDir: string): void {
  const text = readMissionMarkdown(artifactsDir);
  if (!text.trim()) {
    throw new Error('MISSION.md is missing. Complete the pack before Start implement.');
  }
  const check = checkMissionCompleteness(text);
  if (!check.ok) {
    throw new Error(`MISSION.md is incomplete: ${check.missing.join(', ')}`);
  }
}
