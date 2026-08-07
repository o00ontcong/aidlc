import path from 'node:path';
import {
  artifactDir, formatError, markdownHasGo, pass, readText, reject,
} from './lib.mjs';

export default async function packageReview(ctx) {
  try {
    const artifacts = artifactDir(ctx.workspaceRoot, ctx.state.runId);
    const report = readText(path.join(artifacts, 'PACKAGE-REVIEW.md'));
    const problems = [];

    if (!/\*\*Reviewer:\*\*\s*cohesive-reviewer-agent\b/i.test(report)) {
      problems.push('PACKAGE-REVIEW.md must declare **Reviewer:** cohesive-reviewer-agent');
    }
    if (!markdownHasGo(report) && !/\*\*Verdict:\*\*\s*NO-GO\b/i.test(report)) {
      problems.push('PACKAGE-REVIEW.md must include **Verdict:** GO|NO-GO');
    }
    // Publish-result requires GO for done packages; allow NO-GO here so the
    // human gate can reject, but auto-review still passes structural checks.
    const requiredTopics = [
      ['scope|ownedPaths|writeScope', 'scope/ownedPaths'],
      ['test', 'test'],
      ['risk|follow', 'risks/follow-ups'],
    ];
    for (const [pattern, label] of requiredTopics) {
      if (!new RegExp(pattern, 'i').test(report)) {
        problems.push(`PACKAGE-REVIEW.md appears incomplete (missing ${label})`);
      }
    }

    if (problems.length) return reject(`Invalid package review:\n- ${problems.join('\n- ')}`);
    const verdict = /\*\*Verdict:\*\*\s*(GO|NO-GO)\b/i.exec(report)?.[1]?.toUpperCase() ?? 'UNKNOWN';
    return pass(`Package review recorded by cohesive-reviewer-agent with verdict ${verdict}.`);
  } catch (error) {
    return reject(`Package-review validator failed: ${formatError(error)}`);
  }
}
