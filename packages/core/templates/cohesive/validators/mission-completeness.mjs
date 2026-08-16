import path from 'node:path';
import {
  artifactDir, exists, formatError, markdownHasGo, pass, readJson, readText, reject,
} from './lib.mjs';

const REQUIRED_HEADINGS = [
  'Summary',
  'Problem / Goal',
  'In scope',
  'Out of scope',
  'Functional requirements',
  'Acceptance criteria',
  'Constraints',
  'Tasks',
  'UI spec',
  'Definition of done',
];

function headingRe(label) {
  return new RegExp(`^##\\s+${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*$`, 'im');
}

function section(text, heading) {
  const re = headingRe(heading);
  const match = re.exec(text);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = /^##\s+/im.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

export default async function missionCompleteness(ctx) {
  try {
    const file = path.join(artifactDir(ctx.workspaceRoot, ctx.state.runId), 'MISSION.md');
    if (!exists(file)) return reject('MISSION.md is missing.');
    const body = readText(file);
    const missing = [];
    for (const heading of REQUIRED_HEADINGS) {
      if (!headingRe(heading).test(body)) missing.push(heading);
    }
    const hasFlow = headingRe('Flow').test(body) || /```mermaid[\s\S]+```/i.test(body);
    if (!hasFlow) missing.push('Flow');
    const ui = section(body, 'UI spec') ?? '';
    if (ui && !/N\/A\s*[—-]\s*no UI change/i.test(ui) && !/figma|node-id|layout|token/i.test(ui)) {
      missing.push('UI spec (N/A or Figma/layout/token)');
    }
    if (/\*\*Status:\*\*\s*Draft/i.test(body) || /OQ blocking/i.test(body)) {
      missing.push('OQ blocking / Status Draft');
    }
    if (missing.length) {
      return reject(`MISSION.md is incomplete:\n- ${missing.join('\n- ')}`);
    }
    return pass('MISSION.md has the required pack headings.');
  } catch (error) {
    return reject(`Mission completeness validator failed: ${formatError(error)}`);
  }
}
