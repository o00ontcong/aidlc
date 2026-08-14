import path from 'node:path';
import { artifactDir, exists, formatError, pass, readJson, readText, reject } from './lib.mjs';

export default async function featureFlow(ctx) {
  try {
    const dir = artifactDir(ctx.workspaceRoot, ctx.state.runId);
    const jsonFile = path.join(dir, 'FEATURE-FLOW.json'); const mermaidFile = path.join(dir, 'FEATURE-FLOW.mmd');
    if (!exists(jsonFile) || !exists(mermaidFile)) return reject('Feature flow requires FEATURE-FLOW.json and FEATURE-FLOW.mmd.');
    const flow = readJson(jsonFile); const problems = [];
    if (flow.schemaVersion !== 1 || typeof flow.featureId !== 'string') problems.push('Feature flow requires schemaVersion 1 and featureId');
    if (!Array.isArray(flow.nodes) || flow.nodes.length < 2) problems.push('Feature flow needs at least two human-scale nodes');
    if (!Array.isArray(flow.edges) || !flow.edges.length) problems.push('Feature flow needs at least one transition');
    for (const node of flow.nodes ?? []) if (typeof node.id !== 'string' || typeof node.label !== 'string' || typeof node.file !== 'string') problems.push('Every feature-flow node requires id, label, and workspace-relative file');
    if (!/^flowchart|^sequenceDiagram/m.test(readText(mermaidFile).trim())) problems.push('FEATURE-FLOW.mmd must be Mermaid flowchart or sequenceDiagram source');
    return problems.length ? reject(`Feature flow rejected:\n- ${[...new Set(problems)].join('\n- ')}`) : pass(`Feature flow for ${flow.featureId} is valid.`);
  } catch (error) { return reject(`Feature flow validator failed: ${formatError(error)}`); }
}
