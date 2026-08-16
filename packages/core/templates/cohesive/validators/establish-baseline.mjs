import path from 'node:path';
import {
  exists, formatError, markdownHasGo, pass, readJson, readText, reject,
} from './lib.mjs';

const CHARTER_FILES = [
  'docs/project/charter/NORTH-STAR.md',
  'docs/project/charter/ARCHITECTURE-PRINCIPLES.md',
  'docs/project/charter/TECH-POLICY.md',
  'docs/project/charter/CHARTER.json',
  'docs/project/conventions/CONVENTIONS.md',
];

const CONTEXT_FILES = [
  'docs/project/context/PROJECT-SCAN.md',
  'docs/project/context/PROJECT-CONTEXT.md',
  'docs/project/context/ARCHITECTURE-MAP.md',
  'docs/project/context/DOMAIN-MODEL.md',
  'docs/project/context/SHARED-CONTRACTS.md',
  'docs/project/context/ENGINEERING-RULES.md',
  'docs/project/context/visualization/PROJECT-ARCHITECTURE.json',
  'docs/project/context/visualization/FEATURE-CATALOG.json',
  'docs/project/context/visualization/STRUCTURAL-GRAPH-MANIFEST.json',
  'docs/project/conformance/DRIFT-REPORT.md',
  'docs/project/context/CONTEXT-REVIEW.md',
];

export default async function establishBaseline(ctx) {
  try {
    const problems = [];
    const discovery = path.join(
      ctx.workspaceRoot, 'docs', 'epics', ctx.state.runId, 'artifacts', 'CHARTER-DISCOVERY.md',
    );
    if (!exists(discovery)) problems.push('CHARTER-DISCOVERY.md is missing');
    else if (!/## Discovery decisions/i.test(readText(discovery))) {
      problems.push('CHARTER-DISCOVERY.md is missing ## Discovery decisions');
    }

    for (const rel of [...CHARTER_FILES, ...CONTEXT_FILES]) {
      const file = path.join(ctx.workspaceRoot, rel);
      if (!exists(file)) problems.push(`${rel} is missing`);
    }

    const charterFile = path.join(ctx.workspaceRoot, 'docs', 'project', 'charter', 'CHARTER.json');
    if (exists(charterFile)) {
      try {
        const charter = readJson(charterFile);
        if (!charter || typeof charter !== 'object') problems.push('CHARTER.json is not an object');
      } catch {
        problems.push('CHARTER.json is not valid JSON');
      }
    }

    const review = path.join(ctx.workspaceRoot, 'docs', 'project', 'context', 'CONTEXT-REVIEW.md');
    if (exists(review) && !markdownHasGo(readText(review))) {
      problems.push('CONTEXT-REVIEW.md does not contain **Verdict:** GO');
    }

    if (problems.length) {
      return reject(`establish-baseline is incomplete:\n- ${problems.join('\n- ')}`);
    }
    return pass('Project baseline (charter, context, graphs, GO review) is present.');
  } catch (error) {
    return reject(`establish-baseline validator failed: ${formatError(error)}`);
  }
}
