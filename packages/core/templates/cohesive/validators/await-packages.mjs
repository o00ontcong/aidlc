import path from 'node:path';
import {
  artifactDir, formatError, fullCommitExists, packageById, pass, readJson,
  readText, reject,
} from './lib.mjs';

function workerPublishApproved(workspaceRoot, runId) {
  const state = readJson(path.join(workspaceRoot, '.aidlc', 'runs', `${runId}.json`));
  const publish = state.steps?.find?.((step) => step.agent === 'aidlc-cohesive-work-package-agent'
    && Array.isArray(step.artifactsProduced)
    && step.artifactsProduced.some((file) => String(file).endsWith('/PACKAGE-RESULT.json')));
  return state.status === 'completed' && publish?.status === 'approved';
}

export default async function awaitPackages(ctx) {
  try {
    const artifacts = artifactDir(ctx.workspaceRoot, ctx.state.runId);
    const manifest = readJson(path.join(artifacts, 'WORK-PACKAGES.json'));
    const problems = [];
    let done = 0;
    if (!Array.isArray(manifest.packages) || !manifest.packages.length) {
      return reject('WORK-PACKAGES.json must contain at least one package.');
    }
    for (const pkg of manifest.packages ?? []) {
      const file = path.join(artifactDir(ctx.workspaceRoot, pkg.runId), 'PACKAGE-RESULT.json');
      let result;
      try { result = readJson(file); } catch { problems.push(`${pkg.id} result is missing or invalid at ${file}`); continue; }
      if (result.schemaVersion !== 1) problems.push(`${pkg.id} result schemaVersion must be 1`);
      if (result.feature !== manifest.feature || result.package !== pkg.id || result.runId !== pkg.runId) {
        problems.push(`${pkg.id} result identity does not match its manifest entry`);
      }
      if (!['done', 'deferred'].includes(result.status)) problems.push(`${pkg.id} is ${result.status}, not merge-ready`);
      if (result.status === 'deferred' && !(result.deferredTasks ?? []).length) problems.push(`${pkg.id} is deferred without deferredTasks`);
      if (result.projectContextRevision !== manifest.projectContextRevision) problems.push(`${pkg.id} project-context revision is stale`);
      if (result.featureContractRevision !== manifest.featureContractRevision) problems.push(`${pkg.id} feature-contract revision is stale`);
      if (result.featureContractHash?.toLowerCase?.() !== manifest.featureContractHash?.toLowerCase?.()) problems.push(`${pkg.id} feature-contract hash is stale`);
      if (result.baseCommit !== manifest.baseCommit) problems.push(`${pkg.id} base commit differs from the manifest`);
      if (result.branch !== `feature/${manifest.feature}-${pkg.id}`) problems.push(`${pkg.id} branch identity is invalid`);
      if (result.worktree !== `.aidlc/worktrees/${manifest.feature}/${pkg.id}`) problems.push(`${pkg.id} worktree identity is invalid`);
      for (const sha of result.commits ?? []) {
        if (!fullCommitExists(ctx.workspaceRoot, sha)) problems.push(`${pkg.id} references missing commit ${sha}`);
      }
      if (result.status === 'done' && !(result.commits ?? []).length) problems.push(`${pkg.id} done result has no commits`);
      if (result.status === 'done' && !(result.tests ?? []).length) problems.push(`${pkg.id} done result has no tests`);
      for (const test of result.tests ?? []) {
        if (result.status === 'done' && test.status !== 'pass') problems.push(`${pkg.id} contains a non-passing test`);
      }
      if (!packageById(manifest, result.package)) problems.push(`${pkg.id} result references an unknown package`);
      try {
        if (!workerPublishApproved(ctx.workspaceRoot, pkg.runId)) {
          problems.push(`${pkg.id} worker publish-result is not approved/completed`);
        }
      } catch {
        problems.push(`${pkg.id} worker RunState is missing or invalid`);
      }
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
