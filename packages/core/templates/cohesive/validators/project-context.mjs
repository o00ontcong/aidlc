import path from 'node:path';
import {
  exists, formatError, fullCommitExists, hasPlaceholder, markdownHasGo,
  pass, readJson, readText, reject, sha256File,
} from './lib.mjs';

const REQUIRED = [
  'PROJECT-CONTEXT.md',
  'ARCHITECTURE-MAP.md',
  'DOMAIN-MODEL.md',
  'SHARED-CONTRACTS.md',
  'ENGINEERING-RULES.md',
];

export default async function projectContext(ctx) {
  try {
    const root = path.join(ctx.workspaceRoot, 'docs', 'project', 'context');
    const reviewFile = path.join(root, 'CONTEXT-REVIEW.md');
    const manifestFile = path.join(root, 'CONTEXT-MANIFEST.json');

    if (!exists(reviewFile) || !markdownHasGo(readText(reviewFile))) {
      return reject('Project context review is missing or does not contain a GO verdict.');
    }
    if (!exists(manifestFile)) return reject('CONTEXT-MANIFEST.json is missing.');

    const manifest = readJson(manifestFile);
    if (manifest.schemaVersion !== 1) return reject('Context manifest schemaVersion must be 1.');
    if (!Number.isInteger(manifest.revision) || manifest.revision < 1) {
      return reject('Context manifest revision must be a positive integer.');
    }
    if (!fullCommitExists(ctx.workspaceRoot, manifest.sourceCommit)) {
      return reject(`Context sourceCommit is not a repository commit: ${manifest.sourceCommit ?? '(missing)'}`);
    }

    const problems = [];
    for (const name of REQUIRED) {
      const file = path.join(root, name);
      if (!exists(file)) {
        problems.push(`${name} is missing`);
        continue;
      }
      const text = readText(file);
      if (hasPlaceholder(text)) problems.push(`${name} still contains placeholder/TODO content`);
      const actual = sha256File(file).toLowerCase();
      const declared = manifest.artifacts?.[name]?.toLowerCase?.();
      if (actual !== declared) problems.push(`${name} hash mismatch (${declared ?? 'missing'} != ${actual})`);
    }
    if (problems.length) return reject(`Project context is not publishable:\n- ${problems.join('\n- ')}`);
    return pass(`Project context revision ${manifest.revision} is internally consistent and evidence-reviewed.`);
  } catch (error) {
    return reject(`Project context validator failed: ${formatError(error)}`);
  }
}

