import path from 'node:path';
import {
  artifactDir, formatError, pass, readJson, readText, reject,
} from './lib.mjs';

export default async function awaitPackages(ctx) {
  try {
    const artifacts = artifactDir(ctx.workspaceRoot, ctx.state.runId);
    const manifest = readJson(path.join(artifacts, 'WORK-PACKAGES.json'));
    const problems = [];
    let done = 0;
    for (const pkg of manifest.packages ?? []) {
      const file = path.join(artifactDir(ctx.workspaceRoot, pkg.runId), 'PACKAGE-RESULT.json');
      let result;
      try { result = readJson(file); } catch { problems.push(`${pkg.id} result is missing or invalid at ${file}`); continue; }
      if (!['done', 'deferred'].includes(result.status)) problems.push(`${pkg.id} is ${result.status}, not merge-ready`);
      if (result.status === 'deferred' && !(result.deferredTasks ?? []).length) problems.push(`${pkg.id} is deferred without deferredTasks`);
      if (result.projectContextRevision !== manifest.projectContextRevision) problems.push(`${pkg.id} project-context revision is stale`);
      if (result.featureContractRevision !== manifest.featureContractRevision) problems.push(`${pkg.id} feature-contract revision is stale`);
      if (result.featureContractHash?.toLowerCase?.() !== manifest.featureContractHash?.toLowerCase?.()) problems.push(`${pkg.id} feature-contract hash is stale`);
      if (result.status === 'done') done++;
    }

    const board = readText(path.join(artifacts, 'TASK-BOARD.md'));
    const results = readText(path.join(artifacts, 'PACKAGE-RESULTS.md'));
    for (const pkg of manifest.packages ?? []) {
      if (!board.includes(pkg.id)) problems.push(`TASK-BOARD.md omits ${pkg.id}`);
      if (!results.includes(pkg.id)) problems.push(`PACKAGE-RESULTS.md omits ${pkg.id}`);
    }
    if (problems.length) return reject(`Work packages are not ready for integration:\n- ${problems.join('\n- ')}`);
    return pass(`${done}/${manifest.packages.length} packages are complete and all package results match the frozen context/contract.`);
  } catch (error) {
    return reject(`Await-packages validator failed: ${formatError(error)}`);
  }
}

