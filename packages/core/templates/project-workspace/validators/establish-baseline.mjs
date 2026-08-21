import path from 'node:path';
import {
  exists, formatError, markdownHasGo, pass, readJson, readText, reject,
  ensureProjectVisualizationMermaid, isMermaidDiagram, validateScreenCatalogNavigation,
  validateArchitectureGraph, validateFeatureCatalogCompleteness, validateContextReviewGraphCoverage,
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
  'docs/project/context/visualization/PROJECT-ARCHITECTURE.mmd',
  'docs/project/context/visualization/FEATURE-CATALOG.json',
  'docs/project/context/visualization/FEATURE-CATALOG.mmd',
  'docs/project/context/visualization/SCREEN-CATALOG.json',
  'docs/project/context/visualization/SCREEN-CATALOG.mmd',
  'docs/project/context/visualization/STRUCTURAL-GRAPH-MANIFEST.json',
  'docs/project/conformance/DRIFT-REPORT.md',
  'docs/project/context/CONTEXT-REVIEW.md',
];

export default async function establishBaseline(ctx) {
  try {
    ensureProjectVisualizationMermaid(ctx.workspaceRoot);
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
    if (exists(review)) {
      const reviewText = readText(review);
      if (!markdownHasGo(reviewText)) {
        problems.push('CONTEXT-REVIEW.md does not contain **Verdict:** GO');
      }
      if (!/^##\s+Summary\s*$/im.test(reviewText)) {
        problems.push('CONTEXT-REVIEW.md is missing ## Summary (human briefing of what this repo is)');
      }
      problems.push(...validateContextReviewGraphCoverage(reviewText));
    }

    const viz = path.join(ctx.workspaceRoot, 'docs', 'project', 'context', 'visualization');
    for (const name of ['PROJECT-ARCHITECTURE.mmd', 'FEATURE-CATALOG.mmd', 'SCREEN-CATALOG.mmd']) {
      const file = path.join(viz, name);
      if (!exists(file)) problems.push(`docs/project/context/visualization/${name} is missing`);
      else if (!isMermaidDiagram(readText(file))) {
        problems.push(`${name} must be Mermaid flowchart or sequenceDiagram source`);
      }
    }

    const architectureFile = path.join(viz, 'PROJECT-ARCHITECTURE.json');
    if (exists(architectureFile)) {
      try {
        problems.push(...validateArchitectureGraph(readJson(architectureFile), { workspaceRoot: ctx.workspaceRoot }));
      } catch {
        problems.push('PROJECT-ARCHITECTURE.json is not valid JSON');
      }
    }

    const catalogFile = path.join(viz, 'FEATURE-CATALOG.json');
    if (exists(catalogFile)) {
      try {
        problems.push(...validateFeatureCatalogCompleteness(readJson(catalogFile), { workspaceRoot: ctx.workspaceRoot }));
      } catch {
        problems.push('FEATURE-CATALOG.json is not valid JSON');
      }
    }

    const screensFile = path.join(viz, 'SCREEN-CATALOG.json');
    if (exists(screensFile)) {
      try {
        problems.push(...validateScreenCatalogNavigation(readJson(screensFile), { workspaceRoot: ctx.workspaceRoot }));
      } catch {
        problems.push('SCREEN-CATALOG.json is not valid JSON');
      }
    }

    if (problems.length) {
      return reject(`establish-baseline is incomplete:\n- ${problems.join('\n- ')}`);
    }
    return pass('Project baseline (charter, context, graphs, GO review) is present.');
  } catch (error) {
    return reject(`establish-baseline validator failed: ${formatError(error)}`);
  }
}
