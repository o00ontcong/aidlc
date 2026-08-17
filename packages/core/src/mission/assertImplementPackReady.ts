import * as fs from 'node:fs';
import * as path from 'node:path';

import { checkMissionCompleteness, extractMermaidFence, section } from './checkMissionCompleteness';

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

/**
 * Project FEATURE-FLOW.mmd from MISSION.md ## Flow when the mermaid file is
 * missing (paste / Jira / migrate). Does not overwrite an as-built graph.
 */
export function syncFlowMermaidFromMission(artifactsDir: string): boolean {
  const dest = path.join(artifactsDir, 'FEATURE-FLOW.mmd');
  if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8').trim()) {
    return false;
  }
  const mission = readMissionMarkdown(artifactsDir);
  const mermaid = extractMermaidFence(section(mission, 'Flow') ?? '')
    || extractMermaidFence(mission);
  if (!mermaid) return false;
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(dest, mermaid.endsWith('\n') ? mermaid : `${mermaid}\n`, 'utf8');
  return true;
}
