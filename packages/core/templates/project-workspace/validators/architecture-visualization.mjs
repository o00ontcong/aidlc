import path from 'node:path';
import { exists, formatError, isMermaidDiagram, pass, readJson, readText, reject, ensureProjectVisualizationMermaid, validateScreenCatalogNavigation, validateArchitectureGraph, validateFeatureCatalogCompleteness } from './lib.mjs';

const ROOT = [
  'PROJECT-ARCHITECTURE.json',
  'PROJECT-ARCHITECTURE.mmd',
  'FEATURE-CATALOG.json',
  'FEATURE-CATALOG.mmd',
  'SCREEN-CATALOG.json',
  'SCREEN-CATALOG.mmd',
  'STRUCTURAL-GRAPH-MANIFEST.json',
];
export default async function architectureVisualization(ctx) {
  try {
    ensureProjectVisualizationMermaid(ctx.workspaceRoot);
    const dir = path.join(ctx.workspaceRoot, 'docs', 'project', 'context', 'visualization');
    const problems = [];
    for (const name of ROOT) if (!exists(path.join(dir, name))) problems.push(`${name} is missing`);
    if (problems.length) return reject(`Architecture visualization rejected:\n- ${problems.join('\n- ')}`);
    const architecture = readJson(path.join(dir, 'PROJECT-ARCHITECTURE.json'));
    const catalog = readJson(path.join(dir, 'FEATURE-CATALOG.json'));
    const screens = readJson(path.join(dir, 'SCREEN-CATALOG.json'));
    const graph = readJson(path.join(dir, 'STRUCTURAL-GRAPH-MANIFEST.json'));
    problems.push(...validateArchitectureGraph(architecture, { workspaceRoot: ctx.workspaceRoot }));
    problems.push(...validateFeatureCatalogCompleteness(catalog, { workspaceRoot: ctx.workspaceRoot }));
    const screenList = Array.isArray(screens?.screens) ? screens.screens : [];
    problems.push(...validateScreenCatalogNavigation(screens, { workspaceRoot: ctx.workspaceRoot }));
    if (graph.schemaVersion !== 1 || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) problems.push('STRUCTURAL-GRAPH-MANIFEST.json must contain nodes and edges');
    for (const name of ['PROJECT-ARCHITECTURE.mmd', 'FEATURE-CATALOG.mmd', 'SCREEN-CATALOG.mmd']) {
      if (!isMermaidDiagram(readText(path.join(dir, name)))) {
        problems.push(`${name} must be Mermaid flowchart or sequenceDiagram source`);
      }
    }
    if (problems.length) return reject(`Architecture visualization rejected:\n- ${[...new Set(problems)].join('\n- ')}`);
    return pass(`Architecture explorer model is valid (${catalog.features.length} features, ${screenList.length} screens, ${graph.nodes.length} structural nodes).`);
  } catch (error) { return reject(`Architecture visualization validator failed: ${formatError(error)}`); }
}
