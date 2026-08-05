import path from 'node:path';
import {
  artifactDir, formatError, fullCommitExists, inputsFor, matchesScope, packageById,
  pass, readJson, readText, reject,
} from './lib.mjs';

export default async function packageResult(ctx) {
  try {
    const runId = ctx.state.runId;
    const inputs = inputsFor(ctx.workspaceRoot, runId);
    const feature = inputs.feature_id;
    const packageId = inputs.package_id;
    const result = readJson(path.join(artifactDir(ctx.workspaceRoot, runId), 'PACKAGE-RESULT.json'));
    const parent = artifactDir(ctx.workspaceRoot, feature);
    const manifest = readJson(path.join(parent, 'WORK-PACKAGES.json'));
    const pkg = packageById(manifest, packageId);
    const problems = [];

    if (result.schemaVersion !== 1) problems.push('schemaVersion must be 1');
    if (result.feature !== feature || result.package !== packageId || result.runId !== runId) problems.push('result identity does not match worker inputs/run id');
    if (!['done', 'deferred', 'failed', 'change_requested'].includes(result.status)) problems.push(`invalid final status ${result.status}`);
    if (result.projectContextRevision !== manifest.projectContextRevision) problems.push('project context revision is stale');
    if (result.featureContractRevision !== manifest.featureContractRevision) problems.push('feature contract revision is stale');
    if (result.featureContractHash?.toLowerCase?.() !== manifest.featureContractHash?.toLowerCase?.()) problems.push('feature contract hash is stale');
    if (result.baseCommit !== manifest.baseCommit) problems.push('base commit differs from package manifest');
    if (!Array.isArray(result.commits)) problems.push('commits must be an array');
    for (const sha of result.commits ?? []) if (!fullCommitExists(ctx.workspaceRoot, sha)) problems.push(`commit does not exist: ${sha}`);

    const assigned = new Set(pkg?.tasks ?? []);
    const finalTasks = [...(result.completedTasks ?? []), ...(result.deferredTasks ?? [])];
    for (const task of finalTasks) if (!assigned.has(task)) problems.push(`result contains unassigned task ${task}`);
    if (result.status === 'done') {
      if (!(result.commits ?? []).length) problems.push('done result has no commits');
      if (!result.branch || !result.worktree) problems.push('done result must identify its branch and worktree');
      for (const task of assigned) if (!(result.completedTasks ?? []).includes(task)) problems.push(`done result did not complete assigned task ${task}`);
      if (!(result.tests ?? []).length) problems.push('done result has no test evidence');
      for (const test of result.tests ?? []) if (test.status !== 'pass') problems.push(`done result contains non-passing test: ${test.command ?? '(unknown)'}`);
    }
    if (result.status === 'change_requested' && !(result.changeRequests ?? []).length) problems.push('change_requested result has no changeRequests');
    if ((result.contractChanges ?? []).length) {
      const allowed = new Set((pkg?.contracts ?? []).filter((c) => c.mode === 'change').map((c) => c.name));
      for (const change of result.contractChanges) {
        const name = typeof change === 'string' ? change : change.name;
        if (!allowed.has(name)) problems.push(`unapproved shared contract change: ${name}`);
      }
    }
    for (const file of result.changedFiles ?? []) {
      if (!(pkg?.writeScope ?? []).some((scope) => matchesScope(file, scope))) {
        const documented = (result.deviations ?? []).some((d) => JSON.stringify(d).includes(file));
        if (!documented) problems.push(`changed file outside write scope without deviation: ${file}`);
      }
    }
    const testReport = readText(path.join(artifactDir(ctx.workspaceRoot, runId), 'PACKAGE-TEST-REPORT.md'));
    if (result.status === 'done' && !/\*\*Verdict:\*\*\s*GO\b/i.test(testReport)) problems.push('done result requires PACKAGE-TEST-REPORT verdict GO');

    if (problems.length) return reject(`Invalid package result:\n- ${problems.join('\n- ')}`);
    return pass(`${runId} published a valid ${result.status} result with ${(result.commits ?? []).length} verified commit(s).`);
  } catch (error) {
    return reject(`Package-result validator failed: ${formatError(error)}`);
  }
}
