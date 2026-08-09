import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  artifactDir, currentStepName, exists, fieldFromMarkdown, formatError,
  loadCharter, pass, readText, reject,
} from './lib.mjs';

/**
 * Independently confirm a claimed merge actually landed: the feature
 * branch's tip must be a real ancestor of the base branch per git itself —
 * a self-reported `**Status:** merged` line is written by the same
 * autonomous agent step this gate exists to check, so it is not evidence on
 * its own. Fetches the base branch from `origin` first, best-effort, so a
 * merge that only exists on the remote (the common case — a human merges
 * the PR on GitHub) becomes visible locally before checking; falls back to
 * whatever the local ref already knows when there is no network/remote.
 */
function verifyBranchMergedIntoBase(workspaceRoot, headBranch, baseBranch) {
  try {
    execFileSync('git', ['fetch', 'origin', baseBranch], {
      cwd: workspaceRoot, stdio: 'ignore', timeout: 20_000,
    });
  } catch { /* offline, no `origin` remote, or base not on the remote — fall back below */ }

  for (const target of [`origin/${baseBranch}`, baseBranch]) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', headBranch, target], {
        cwd: workspaceRoot, stdio: 'ignore', timeout: 10_000,
      });
      return true;
    } catch { /* not (yet) an ancestor of this candidate; try the next one */ }
  }
  return false;
}

function defaultShipPolicy(charter) {
  return {
    requirePullRequest: true,
    forbidAgentMergeToDefaultBranch: true,
    defaultBranch: 'main',
    allowAiAssistReview: true,
    allowLocalMergeWithHumanOnly: false,
    ...(charter?.shipPolicy ?? {}),
  };
}

function parsePrLink(text) {
  return {
    url: fieldFromMarkdown(text, 'URL') || fieldFromMarkdown(text, 'Pr'),
    base: fieldFromMarkdown(text, 'Base'),
    head: fieldFromMarkdown(text, 'Head'),
    status: fieldFromMarkdown(text, 'Status').toLowerCase(),
    mergedBy: fieldFromMarkdown(text, 'Merged By').toLowerCase()
      || fieldFromMarkdown(text, 'MergedBy').toLowerCase(),
    localHumanApproval: /\*\*Local Human Approval:\*\*\s*(yes|approved|true)\b/i.test(text),
  };
}

export default async function ship(ctx) {
  try {
    const runId = ctx.state.runId;
    const artifacts = artifactDir(ctx.workspaceRoot, runId);
    const prFile = path.join(artifacts, 'PR-LINK.md');
    const phase = currentStepName(ctx).toLowerCase();
    const charter = loadCharter(ctx.workspaceRoot);
    const policy = defaultShipPolicy(charter);
    const expectedHead = `feature/${runId}`;
    const problems = [];

    if (!exists(prFile)) {
      if (policy.requirePullRequest && !policy.allowLocalMergeWithHumanOnly) {
        return reject('PR-LINK.md is required when shipPolicy.requirePullRequest is true.');
      }
      if (phase.includes('await')) {
        return reject('PR-LINK.md is missing for await-merge.');
      }
      return reject('PR-LINK.md is missing. open-pr must record the feature pull request.');
    }

    const text = readText(prFile);
    const pr = parsePrLink(text);

    if (!pr.head) problems.push('PR-LINK.md is missing **Head:**');
    else if (pr.head !== expectedHead) {
      problems.push(`PR head must be ${expectedHead} (got ${pr.head})`);
    }

    if (!pr.base) problems.push('PR-LINK.md is missing **Base:**');
    else if (policy.defaultBranch && pr.base !== policy.defaultBranch) {
      problems.push(`PR base must be ${policy.defaultBranch} (got ${pr.base})`);
    }

    const urlMissing = !pr.url || pr.url === '(none)' || pr.url === 'n/a';
    if (policy.requirePullRequest && urlMissing && !policy.allowLocalMergeWithHumanOnly) {
      problems.push('PR-LINK.md is missing **URL:** (required when requirePullRequest is true)');
    }

    // Exactly one PR record per feature artifact (file itself is the single record).
    const urlMatches = [...text.matchAll(/\*\*URL:\*\*\s*(\S+)/gi)].map((m) => m[1]);
    const distinctUrls = [...new Set(urlMatches.filter((u) => u && u !== '(none)'))];
    if (distinctUrls.length > 1) {
      problems.push(`PR-LINK.md lists ${distinctUrls.length} PR URLs; exactly one PR per feature is allowed`);
    }

    if (phase.includes('open-pr') || phase === 'open-pr') {
      if (!['open', 'draft', 'ready'].includes(pr.status)) {
        problems.push(`open-pr has invalid or missing status ${pr.status || '(missing)'}; expected open|draft|ready`);
      }
      if (pr.status === 'merged') {
        problems.push('open-pr must not mark the PR as merged; await-merge is the human merge gate');
      }
      if (pr.mergedBy === 'agent') {
        problems.push('Agents must not merge the default branch (forbidAgentMergeToDefaultBranch)');
      }
    }

    if (phase.includes('await') || phase === 'await-merge') {
      const doneish = pr.status === 'merged';
      if (!doneish && !(policy.allowLocalMergeWithHumanOnly && pr.localHumanApproval)) {
        problems.push(
          'await-merge requires **Status:** merged (or Local Human Approval when allowLocalMergeWithHumanOnly)',
        );
      }
      if (policy.allowLocalMergeWithHumanOnly && urlMissing && !pr.localHumanApproval && !doneish) {
        problems.push('Local ship escape hatch requires **Local Human Approval:** yes');
      }
      if (policy.forbidAgentMergeToDefaultBranch !== false) {
        if (pr.mergedBy === 'agent' || /\bmerged by agent\b/i.test(text)) {
          problems.push('Agent merge to defaultBranch is forbidden; only a human (or configured merge queue) may merge');
        }
      }
      if (doneish && !verifyBranchMergedIntoBase(ctx.workspaceRoot, expectedHead, pr.base || policy.defaultBranch)) {
        problems.push(
          `PR-LINK.md claims **Status:** merged but ${expectedHead} is not reachable from `
          + `${pr.base || policy.defaultBranch} in git — fetch the base branch and confirm the merge actually landed`,
        );
      }
    }

    // project-sync gate helper: if somehow invoked, require an actual merge.
    if (phase.includes('project-sync')) {
      const merged = pr.status === 'merged'
        || (policy.allowLocalMergeWithHumanOnly && pr.localHumanApproval);
      if (!merged) {
        problems.push('project-sync requires the feature PR to be merged first');
      }
    }

    if (problems.length) {
      return reject(`Ship gate failed:\n- ${[...new Set(problems)].join('\n- ')}`);
    }

    if (phase.includes('await')) {
      return pass(`Ship await-merge OK for ${expectedHead} → ${pr.base || policy.defaultBranch}.`);
    }
    return pass(`Ship open-pr OK: head ${expectedHead}, base ${pr.base || policy.defaultBranch}.`);
  } catch (error) {
    return reject(`Ship validator failed: ${formatError(error)}`);
  }
}
