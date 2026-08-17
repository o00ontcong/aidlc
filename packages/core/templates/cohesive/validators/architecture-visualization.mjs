import path from 'node:path';
import { exists, formatError, isMermaidDiagram, pass, readJson, readText, reject, ensureProjectVisualizationMermaid } from './lib.mjs';

const ROOT = [
  'PROJECT-ARCHITECTURE.json',
  'PROJECT-ARCHITECTURE.mmd',
  'FEATURE-CATALOG.json',
  'FEATURE-CATALOG.mmd',
  'SCREEN-CATALOG.json',
  'SCREEN-CATALOG.mmd',
  'STRUCTURAL-GRAPH-MANIFEST.json',
];
const validId = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]*$/i.test(value);

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
    if (architecture.schemaVersion !== 1 || !Array.isArray(architecture.layers) || architecture.layers.length < 2) problems.push('PROJECT-ARCHITECTURE.json must be schemaVersion 1 with at least two layers');
    if (!Array.isArray(architecture.edges)) problems.push('PROJECT-ARCHITECTURE.json must declare edges');
    if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.features) || !catalog.features.length) problems.push('FEATURE-CATALOG.json must contain at least one detected feature');
    for (const feature of catalog.features ?? []) {
      if (!validId(feature.id) || typeof feature.name !== 'string') problems.push('Every feature needs a stable id and name');
      if (!Array.isArray(feature.evidence) || !feature.evidence.length) problems.push(`Feature ${feature.id ?? '(unknown)'} needs evidence; inference alone is not enough`);
      if (!['high', 'medium', 'low'].includes(feature.confidence)) problems.push(`Feature ${feature.id ?? '(unknown)'} needs high|medium|low confidence`);
    }
    const screenList = Array.isArray(screens?.screens) ? screens.screens : [];
    if (screens.schemaVersion !== 1 || !screenList.length) problems.push('SCREEN-CATALOG.json must contain at least one detected screen');
    for (const screen of screenList) {
      if (!validId(screen.id) || typeof screen.name !== 'string') problems.push('Every screen needs a stable id and name');
      if (!Array.isArray(screen.evidence) || !screen.evidence.length) problems.push(`Screen ${screen.id ?? '(unknown)'} needs evidence; inference alone is not enough`);
      if (!['high', 'medium', 'low'].includes(screen.confidence)) problems.push(`Screen ${screen.id ?? '(unknown)'} needs high|medium|low confidence`);
    }
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
