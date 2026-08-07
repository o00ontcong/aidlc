import path from 'node:path';
import {
  exists, formatError, pass, readJson, readText, reject,
} from './lib.mjs';

const TARGETS = [
  'CLAUDE.md',
  'AGENTS.md',
  path.join('.cursor', 'rules', 'aidlc-charter.mdc'),
];

const START_RE =
  /<!--\s*aidlc:charter start\s*·\s*revision\s+(\d+)\s*·\s*(sha256:[0-9a-f]{64})\s*-->/i;
const END_RE = /<!--\s*aidlc:charter end\s*-->/i;

function parseMarker(text) {
  const start = text.match(START_RE);
  if (!start || !END_RE.test(text)) return null;
  return { revision: Number(start[1]), hash: start[2].toLowerCase() };
}

export default async function rulesSync(ctx) {
  try {
    const charterFile = path.join(
      ctx.workspaceRoot, 'docs', 'project', 'charter', 'CHARTER.json',
    );
    if (!exists(charterFile)) {
      return reject('CHARTER.json is missing; cannot validate project-rules-sync.');
    }
    const charter = readJson(charterFile);
    const expectedRev = charter.revision;
    const expectedHash = String(charter.hash ?? '').toLowerCase();
    if (!Number.isInteger(expectedRev) || !expectedHash.startsWith('sha256:')) {
      return reject('CHARTER.json is missing a valid revision/hash.');
    }

    const problems = [];
    for (const rel of TARGETS) {
      const file = path.join(ctx.workspaceRoot, rel);
      if (!exists(file)) {
        problems.push(`${rel} is missing`);
        continue;
      }
      const marker = parseMarker(readText(file));
      if (!marker) {
        problems.push(`${rel} is missing aidlc:charter marker block`);
        continue;
      }
      if (marker.revision !== expectedRev) {
        problems.push(
          `${rel} charter revision is stale (${marker.revision} != ${expectedRev})`,
        );
      }
      if (marker.hash !== expectedHash) {
        problems.push(
          `${rel} charter hash is stale (${marker.hash} != ${expectedHash})`,
        );
      }
    }

    if (problems.length) {
      return reject(`Rules sync validation failed:\n- ${problems.join('\n- ')}`);
    }
    return pass(
      `Rule files project charter revision ${expectedRev} (${expectedHash.slice(0, 15)}…).`,
    );
  } catch (error) {
    return reject(`Rules sync validator failed: ${formatError(error)}`);
  }
}
