import path from 'node:path';
import {
  artifactDir, currentStepName, exists, fieldFromMarkdown, formatError,
  fullCommitExists, gitDiffNameOnlyStagedAndUnstaged, hasPlaceholder,
  markdownHasGo, pass, readJson, readText, reject, sha256File,
} from './lib.mjs';

const REQUIRED = [
  'PROJECT-CONTEXT.md',
  'ARCHITECTURE-MAP.md',
  'DOMAIN-MODEL.md',
  'SHARED-CONTRACTS.md',
  'ENGINEERING-RULES.md',
];

function isProjectSync(ctx) {
  const name = currentStepName(ctx).toLowerCase();
  return name === 'project-sync' || name.includes('project-sync') || name.includes('project sync');
}

function assertNoIntentEdits(workspaceRoot) {
  const files = gitDiffNameOnlyStagedAndUnstaged(workspaceRoot);
  const problems = [];
  for (const file of files) {
    const norm = file.replaceAll('\\', '/');
    if (norm.startsWith('docs/project/charter/') || norm === 'docs/project/charter') {
      problems.push(`project-sync must not modify Intent charter path: ${norm}`);
    }
    if (norm.startsWith('docs/project/conventions/') || norm === 'docs/project/conventions') {
      problems.push(`project-sync must not self-edit conventions: ${norm}`);
    }
  }
  return problems;
}

function assertMergedBeforeSync(workspaceRoot, runId) {
  const prFile = path.join(artifactDir(workspaceRoot, runId), 'PR-LINK.md');
  if (!exists(prFile)) {
    return ['project-sync requires PR-LINK.md (ship must complete before Reality sync)'];
  }
  const text = readText(prFile);
  const status = fieldFromMarkdown(text, 'Status').toLowerCase();
  const local = /\*\*Local Human Approval:\*\*\s*(yes|approved|true)\b/i.test(text);
  if (!['merged', 'approved'].includes(status) && !local) {
    return ['project-sync must run only after PR merge/approval (or local human approval escape hatch)'];
  }
  return [];
}

export default async function projectContext(ctx) {
  try {
    if (isProjectSync(ctx)) {
      const problems = [
        ...assertMergedBeforeSync(ctx.workspaceRoot, ctx.state.runId),
        ...assertNoIntentEdits(ctx.workspaceRoot),
      ];
      // Still verify manifest integrity when present
      const root = path.join(ctx.workspaceRoot, 'docs', 'project', 'context');
      const manifestFile = path.join(root, 'CONTEXT-MANIFEST.json');
      if (exists(manifestFile)) {
        const manifest = readJson(manifestFile);
        for (const name of REQUIRED) {
          const file = path.join(root, name);
          if (!exists(file)) continue;
          const actual = sha256File(file).toLowerCase();
          const declared = manifest.artifacts?.[name]?.toLowerCase?.();
          if (declared && actual !== declared) {
            problems.push(`${name} hash mismatch after sync (${declared} != ${actual})`);
          }
        }
      }
      if (problems.length) {
        return reject(`Project sync rejected:\n- ${[...new Set(problems)].join('\n- ')}`);
      }
      return pass('Project sync does not touch charter/conventions and ship gate is satisfied.');
    }

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
