import path from 'node:path';
import {
  approvedVarianceIds, artifactDir, formatError, markdownHasGo, pass, readJson,
  readText, reject,
} from './lib.mjs';

export default async function integrationCohesion(ctx) {
  try {
    const artifacts = artifactDir(ctx.workspaceRoot, ctx.state.runId);
    const report = readText(path.join(artifacts, 'COHESION-REPORT.md'));
    const integration = readText(path.join(artifacts, 'INTEGRATION-CONTEXT.md'));
    const manifest = readJson(path.join(artifacts, 'WORK-PACKAGES.json'));
    const problems = [];
    if (!markdownHasGo(report)) problems.push('COHESION-REPORT.md does not contain a GO verdict');
    for (const section of ['Duplicate', 'Contract', 'Traceability', 'Vertical']) {
      if (!new RegExp(section, 'i').test(report)) problems.push(`cohesion report does not address ${section}`);
    }
    for (const pkg of manifest.packages ?? []) if (!integration.includes(pkg.id)) problems.push(`integration context omits ${pkg.id}`);
    for (const section of ['## Planned Versus Actual', '## Cross-Package Interactions', '## Remaining Risks']) {
      if (!integration.includes(section)) problems.push(`integration context is missing ${section}`);
    }

    // INV-x VIOLATED without approved VR → NO-GO
    const approved = approvedVarianceIds(artifacts);
    const violated = [...report.matchAll(/\b(INV-\d+)\b[^\n]*\bVIOLATED\b/gi)]
      .map((m) => m[1].toUpperCase());
    const violatedAlt = [...report.matchAll(/\bVIOLATED\b[^\n]*\b(INV-\d+)\b/gi)]
      .map((m) => m[1].toUpperCase());
    for (const inv of new Set([...violated, ...violatedAlt])) {
      if (!approved.has(inv)) {
        problems.push(`${inv} is VIOLATED without an approved variance request → NO-GO`);
      }
    }

    if (problems.length) return reject(`Integrated feature is not proven cohesive:\n- ${problems.join('\n- ')}`);
    return pass(`Cohesion review covers all ${manifest.packages.length} work packages and issued GO.`);
  } catch (error) {
    return reject(`Integration-cohesion validator failed: ${formatError(error)}`);
  }
}
