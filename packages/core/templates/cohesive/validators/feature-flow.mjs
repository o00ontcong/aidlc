import path from 'node:path';
import { artifactDir, exists, formatError, isMermaidDiagram, pass, readJson, readText, reject } from './lib.mjs';

const SURFACE_KINDS = new Set(['web', 'mobile', 'desktop', 'api', 'worker', 'sdk', 'external']);
const SURFACE_EDGES = new Set(['http', 'sdk', 'event', 'webhook', 'internal']);

function collectGraphProblems(flow, { requireFile, nodeKinds, edgeKinds, label }) {
  const problems = [];
  if (!Array.isArray(flow.nodes) || flow.nodes.length < 2) problems.push(`${label} needs at least two human-scale nodes`);
  if (!Array.isArray(flow.edges) || !flow.edges.length) problems.push(`${label} needs at least one transition`);
  const ids = new Set();
  for (const node of flow.nodes ?? []) {
    if (typeof node.id !== 'string' || typeof node.label !== 'string') {
      problems.push(`Every ${label} node requires id and label`);
      continue;
    }
    ids.add(node.id);
    if (requireFile && typeof node.file !== 'string') {
      problems.push(`Every ${label} node requires a workspace-relative file`);
    }
    if (nodeKinds && !nodeKinds.has(node.kind)) {
      problems.push(`${label} node ${node.id} needs kind ${[...nodeKinds].join('|')}`);
    }
    if ((node.kind === 'external') && typeof node.file === 'string') {
      problems.push(`${label} node ${node.id} is external and must not invent a workspace file`);
    }
  }
  for (const edge of flow.edges ?? []) {
    if (typeof edge.source !== 'string' || typeof edge.target !== 'string') {
      problems.push(`Every ${label} edge requires source and target`);
      continue;
    }
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      problems.push(`${label} edge ${edge.source} → ${edge.target} references an unknown node`);
    }
    if (edgeKinds && !edgeKinds.has(edge.kind)) {
      problems.push(`${label} edge ${edge.source} → ${edge.target} needs kind ${[...edgeKinds].join('|')}`);
    }
  }
  return problems;
}

export default async function featureFlow(ctx) {
  try {
    const dir = artifactDir(ctx.workspaceRoot, ctx.state.runId);
    const jsonFile = path.join(dir, 'FEATURE-FLOW.json');
    const mermaidFile = path.join(dir, 'FEATURE-FLOW.mmd');
    const surfacesFile = path.join(dir, 'FEATURE-SURFACES.json');
    const surfacesMermaid = path.join(dir, 'FEATURE-SURFACES.mmd');
    if (!exists(jsonFile) || !exists(mermaidFile)) return reject('Feature flow requires FEATURE-FLOW.json and FEATURE-FLOW.mmd.');
    if (!exists(surfacesFile) || !exists(surfacesMermaid)) {
      return reject('Feature flow requires FEATURE-SURFACES.json and FEATURE-SURFACES.mmd.');
    }
    const flow = readJson(jsonFile);
    const surfaces = readJson(surfacesFile);
    const problems = [];
    if (flow.schemaVersion !== 1 || typeof flow.featureId !== 'string') problems.push('Feature flow requires schemaVersion 1 and featureId');
    problems.push(...collectGraphProblems(flow, { requireFile: true, label: 'code flow' }));
    if (!isMermaidDiagram(readText(mermaidFile))) problems.push('FEATURE-FLOW.mmd must be Mermaid flowchart or sequenceDiagram source');

    if (surfaces.schemaVersion !== 1) problems.push('FEATURE-SURFACES.json requires schemaVersion 1');
    problems.push(...collectGraphProblems(surfaces, {
      requireFile: false,
      nodeKinds: SURFACE_KINDS,
      edgeKinds: SURFACE_EDGES,
      label: 'system surfaces',
    }));
    if (!isMermaidDiagram(readText(surfacesMermaid))) {
      problems.push('FEATURE-SURFACES.mmd must be Mermaid flowchart or sequenceDiagram source');
    }
    return problems.length
      ? reject(`Feature flow rejected:\n- ${[...new Set(problems)].join('\n- ')}`)
      : pass(`Feature flow for ${flow.featureId} is valid.`);
  } catch (error) { return reject(`Feature flow validator failed: ${formatError(error)}`); }
}
