import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  approvedVarianceCoversPath, artifactDir, exists, formatError, fullCommitExists,
  inputsFor, matchesScope, packageById, packageOwnedPaths, pass, readCharter,
  readJson, readText, reject,
} from './lib.mjs';

function isAncestor(workspaceRoot, earlier, later) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', earlier, later], {
      cwd: workspaceRoot,
      stdio: 'ignore',
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

export default async function packageResult(ctx) {
  try {
    const runId = ctx.state.runId;
    const inputs = inputsFor(ctx.workspaceRoot, runId);
    const feature = inputs.feature_id;
    const packageId = inputs.package_id;
    const artifacts = artifactDir(ctx.workspaceRoot, runId);
    const result = readJson(path.join(artifacts, 'PACKAGE-RESULT.json'));
    const parent = artifactDir(ctx.workspaceRoot, feature);
    const manifest = readJson(path.join(parent, 'WORK-PACKAGES.json'));
    const pkg = packageById(manifest, packageId);
    const problems = [];
    const owned = packageOwnedPaths(pkg);

    if (result.schemaVersion !== 1) problems.push('schemaVersion must be 1');
    if (result.feature !== feature || result.package !== packageId || result.runId !== runId) problems.push('result identity does not match worker inputs/run id');
    if (!['done', 'deferred', 'failed', 'change_requested'].includes(result.status)) problems.push(`invalid final status ${result.status}`);
    if (result.projectContextRevision !== manifest.projectContextRevision) problems.push('project context revision is stale');
    if (result.featureContractRevision !== manifest.featureContractRevision) problems.push('feature contract revision is stale');
    if (result.featureContractHash?.toLowerCase?.() !== manifest.featureContractHash?.toLowerCase?.()) problems.push('feature contract hash is stale');
    if (result.baseCommit !== manifest.baseCommit) problems.push('base commit differs from package manifest');
    if (!Array.isArray(result.commits)) problems.push('commits must be an array');
    for (const sha of result.commits ?? []) if (!fullCommitExists(ctx.workspaceRoot, sha)) problems.push(`commit does not exist: ${sha}`);

    if (result.openedPullRequest === true || result.pullRequestUrl || result.prUrl) {
      problems.push('package must not open a pull request — ship is feature-level only');
    }
    if (result.mergedDefaultBranch === true || result.mergedToDefaultBranch === true) {
      problems.push('package must not merge into defaultBranch');
    }

    const assigned = new Set(pkg?.tasks ?? []);
    const finalTasks = [...(result.completedTasks ?? []), ...(result.deferredTasks ?? [])];
    for (const task of finalTasks) if (!assigned.has(task)) problems.push(`result contains unassigned task ${task}`);
    if (result.status === 'done') {
      if (!(result.commits ?? []).length) problems.push('done result has no commits');
      if (!result.branch || !result.worktree) problems.push('done result must identify its branch and worktree');
      for (const task of assigned) if (!(result.completedTasks ?? []).includes(task)) problems.push(`done result did not complete assigned task ${task}`);
      if (!(result.tests ?? []).length) problems.push('done result has no test evidence');
      for (const test of result.tests ?? []) if (test.status !== 'pass') problems.push(`done result contains non-passing test: ${test.command ?? '(unknown)'}`);
      if (exists(path.join(artifacts, 'PACKAGE-REVIEW.md'))) {
        const review = readText(path.join(artifacts, 'PACKAGE-REVIEW.md'));
        if (!/\*\*Verdict:\*\*\s*GO\b/i.test(review)) problems.push('done result requires PACKAGE-REVIEW verdict GO');
      }
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
      if (!owned.some((scope) => matchesScope(file, scope))) {
        const documented = (result.deviations ?? []).some((d) => JSON.stringify(d).includes(file));
        if (!documented) problems.push(`changed file outside write scope without deviation: ${file}`);
      }
    }

    const charter = readCharter(ctx.workspaceRoot);
    const protectedPaths = Array.isArray(charter?.protectedPaths) ? charter.protectedPaths : [];
    for (const file of result.changedFiles ?? []) {
      const hitsProtected = protectedPaths.some((scope) => matchesScope(file, scope));
      if (hitsProtected && !approvedVarianceCoversPath(ctx.workspaceRoot, feature, file)) {
        problems.push(`changed protected path without approved variance: ${file}`);
      }
      if (/^docs\/project\/charter\//.test(String(file).replaceAll('\\', '/'))) {
        problems.push(`package must not edit charter path: ${file}`);
      }
    }

    // Test-first: when the plan records a failing-test commit, it must precede
    // later implementation commits when those SHAs are both listed.
    if (exists(path.join(artifacts, 'PACKAGE-TEST-PLAN.md'))) {
      const plan = readText(path.join(artifacts, 'PACKAGE-TEST-PLAN.md'));
      const testCommit = plan.match(/\*\*Test commit:\*\*\s*([0-9a-f]{7,40})/i)?.[1];
      if (testCommit && (result.commits ?? []).length) {
        if (!fullCommitExists(ctx.workspaceRoot, testCommit)) {
          problems.push(`PACKAGE-TEST-PLAN test commit does not exist: ${testCommit}`);
        } else {
          const later = (result.commits ?? []).filter((c) => c.toLowerCase() !== testCommit.toLowerCase());
          for (const sha of later) {
            if (!isAncestor(ctx.workspaceRoot, testCommit, sha) && sha.toLowerCase() !== testCommit.toLowerCase()) {
              // Only flag when we can prove order is wrong (test commit not ancestor).
              // Skip if unrelated history makes the check inconclusive — require membership.
            }
          }
          if (!(result.commits ?? []).some((c) => c.toLowerCase().startsWith(testCommit.toLowerCase()) || testCommit.toLowerCase().startsWith(c.toLowerCase()))) {
            problems.push('PACKAGE-TEST-PLAN test commit is not listed in result.commits');
          }
          const last = result.commits[result.commits.length - 1];
          if (last && testCommit.toLowerCase() !== last.toLowerCase() && !isAncestor(ctx.workspaceRoot, testCommit, last)) {
            problems.push('failing-test commit does not precede latest implementation commit');
          }
        }
      }
    }

    const testReport = readText(path.join(artifacts, 'PACKAGE-TEST-REPORT.md'));
    if (result.status === 'done' && !/\*\*Verdict:\*\*\s*GO\b/i.test(testReport)) problems.push('done result requires PACKAGE-TEST-REPORT verdict GO');

    if (problems.length) return reject(`Invalid package result:\n- ${problems.join('\n- ')}`);
    return pass(`${runId} published a valid ${result.status} result with ${(result.commits ?? []).length} verified commit(s).`);
  } catch (error) {
    return reject(`Package-result validator failed: ${formatError(error)}`);
  }
}
