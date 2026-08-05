import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  artifactDir, formatError, fullCommitExists, inputsFor, pass, readJson, reject,
} from './lib.mjs';

export default async function worktreeState(ctx) {
  try {
    const runId = ctx.state.runId;
    const inputs = inputsFor(ctx.workspaceRoot, runId);
    const feature = inputs.feature_id;
    const packageId = inputs.package_id;
    const state = readJson(path.join(artifactDir(ctx.workspaceRoot, runId), 'WORKTREE-STATE.json'));
    const expectedBranch = `feature/${feature}-${packageId}`;
    const expectedRel = `.aidlc/worktrees/${feature}/${packageId}`;
    const expectedAbs = path.resolve(ctx.workspaceRoot, expectedRel);
    const actualAbs = path.resolve(ctx.workspaceRoot, state.worktree ?? '');
    const problems = [];

    if (state.schemaVersion !== 1) problems.push('schemaVersion must be 1');
    if (state.feature !== feature || state.package !== packageId) problems.push('worktree identity does not match worker inputs');
    if (state.branch !== expectedBranch) problems.push(`branch must be ${expectedBranch}`);
    if (actualAbs !== expectedAbs) problems.push(`worktree must resolve exactly to ${expectedRel}`);
    if (!fullCommitExists(ctx.workspaceRoot, state.baseCommit)) problems.push('baseCommit is not a repository commit');
    if (!fs.existsSync(expectedAbs)) problems.push(`worktree directory does not exist: ${expectedRel}`);

    if (fs.existsSync(expectedAbs)) {
      try {
        const branch = execFileSync('git', ['branch', '--show-current'], { cwd: expectedAbs, encoding: 'utf8', timeout: 10_000 }).trim();
        if (branch !== expectedBranch) problems.push(`actual worktree branch is ${branch || '(detached)'}, expected ${expectedBranch}`);
        execFileSync('git', ['merge-base', '--is-ancestor', state.baseCommit, 'HEAD'], { cwd: expectedAbs, stdio: 'ignore', timeout: 10_000 });
      } catch (error) {
        problems.push(`worktree Git validation failed: ${formatError(error)}`);
      }
    }
    if (problems.length) return reject(`Unsafe or invalid package worktree:\n- ${problems.join('\n- ')}`);
    return pass(`${runId} owns ${expectedRel} on ${expectedBranch}, based on ${state.baseCommit}.`);
  } catch (error) {
    return reject(`Worktree-state validator failed: ${formatError(error)}`);
  }
}

